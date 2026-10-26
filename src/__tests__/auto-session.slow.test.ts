import { readFileSync } from 'node:fs'
import path from 'node:path'
import { cardMatchesOpcode, OcgLocation as L } from 'ocgcore-wasm'
import { mirrorApply, openMirror } from '../app/mat-public'
import { matReducer } from '../app/practice-mat'
import { askView, openAsk } from '../app/auto/ask-ui'
import { createDataLoader } from '../app/auto/auto-data'
import { createAutoSession, type AutoSession, type AutoSnapshot } from '../app/auto/auto-session'
import { localTransport, type AutoHost } from '../app/auto/core-host'
import type { DeckList } from '../app/auto/deck-map'
import { passivePolicy, randomLegalPolicy, type CardPicker, type Policy } from '../app/auto/policies'
import { splitDesc } from '../app/auto/protocol'
import { codeOfId, compare, readMat, readReal, TRANSIT, xyzInTransit } from './support/core-compare'
import { cardRows, hasCoreData, loadCards, metaDecks, nodeSource, scriptStore, wasmBinary } from './support/core-data'

/**
 * La sesión de «Jugar solo automático» con el núcleo real, en el mismo proceso (lento: `npm run test:auto`; se salta sin datos). En
 * AS_DECKS decks del meta (10) un «jugador» al azar legal juega al menos 3 turnos completos contra el rival pasivo, con los datos que
 * baja el cargador (el mismo camino que el navegador) y: (a) en cada pregunta mía, mi mesa y el overlay son los del núcleo; (b) el rival
 * no juega nada (sólo pasa de fase y no encadena salvo lo obligatorio); (c) deshacer devuelve exactamente la mesa de antes de mi
 * jugada; (d) reiniciar con la misma semilla repite el duelo; (e) el cierre de scripts alcanza (sólo se piden en caliente fichas).
 */
const DECKS = Number(process.env.AS_DECKS ?? 10)
const TURNS = 4
const CAP = 400

const pending = (session: AutoSession, test: (snapshot: AutoSnapshot) => boolean) =>
  new Promise<AutoSnapshot>((resolve) => {
    const check = () => {
      const snapshot = session.getSnapshot()

      if (test(snapshot)) {
        off()
        resolve(snapshot)
      }
    }
    const off = session.subscribe(check)

    check()
  })
const settled = (session: AutoSession) => pending(session, (s) => (s.status === 'ready' && s.ask !== null && !s.replaying) || s.status === 'ended' || s.status === 'error')
const view = (s: AutoSnapshot) => ({ initial: s.initial, mineActions: s.mineActions, theirsActs: s.theirsActs, mine: s.mine, theirs: s.theirs, overlay: s.overlay, ask: s.ask?.ask, answers: s.answers })

describe.skipIf(!hasCoreData)(`la sesión con el núcleo real, ${DECKS} decks (npm run test:auto)`, () => {
  const rows = hasCoreData ? cardRows() : []
  const { cards } = hasCoreData ? loadCards() : { cards: new Map() }
  const store = scriptStore()
  const source = nodeSource(rows, store)
  const loader = createDataLoader(source, null)
  const lists = JSON.parse(readFileSync(path.join(process.cwd(), 'src/data/meta-decklists.json'), 'utf8')) as Record<string, DeckList>
  const ok = new Set(metaDecks(cards, store).map((deck) => deck.id))
  const ids = Object.keys(lists).filter((id) => ok.has(id))
  const pool = Array.from({ length: Math.min(DECKS, ids.length) }, (_, i) => ids[Math.floor((i * ids.length) / Math.min(DECKS, ids.length))]!)
  const cardList = [...cards.values()]
  const pickCard: CardPicker = (ask, random) => {
    const opcodes = ask.opcodes.map(BigInt)
    const from = Math.floor(random() * cardList.length)

    for (let k = 0; k < cardList.length; k += 1) {
      const card = cardList[(from + k) % cardList.length]!

      if (cardMatchesOpcode(card, opcodes as never)) return card.code
    }

    return 0
  }
  const wasm = hasCoreData ? wasmBinary() : new ArrayBuffer(0)
  const tally = { decks: 0, checks: 0, turns: [] as number[], restarts: 0, undos: 0 }
  const tokens = new Set(rows.filter((row) => (row.type & 0x4000) !== 0).map((row) => `c${row.id}.lua`))

  /** Juega con `bot` hasta el turno `TURNS` (o el fin, o el tope); en cada pregunta mía, `check`. */
  async function play(session: AutoSession, bot: Policy, check?: (snapshot: AutoSnapshot) => void) {
    let snapshot = await settled(session)

    for (let n = 0; n < CAP && snapshot.status === 'ready' && snapshot.overlay.turn < TURNS; n += 1) {
      check?.(snapshot)
      session.answer(bot(snapshot.ask!.ask))
      snapshot = await settled(session)
    }

    return snapshot
  }

  it.each(pool)('deck %s: mesa y overlay como el núcleo, rival quieto, deshacer exacto y la misma semilla repite', async (id) => {
    const hosts: AutoHost[] = []
    const seed = Number(id) >>> 0
    const session = createAutoSession({ loader, deck: lists[id]!, seed, transport: localTransport({ wasmBinary: wasm }, (host) => hosts.push(host)) })
    const diffs: string[] = []
    const check = (snapshot: AutoSnapshot) => {
      tally.checks += 1
      const live = hosts.at(-1)!.live!
      const code = (key: string) => codeOfId(key, {}) || (key.startsWith('token-') ? -1 : 0)
      const real = readReal(live.lib, live.handle, 0)
      // Un Xyz que junta sus materiales en el Extra (el núcleo pregunta dónde va y en qué posición): la mesa los deja en el campo hasta que sale.
      const transit = xyzInTransit(live.lib, live.handle)
      const own = compare(real, readMat(snapshot.mine, code), true).filter((diff) => !/^(mzone|szone):code .* -1≠/.test(diff) && !(transit && TRANSIT.test(diff)))
      const field = live.lib.duelQueryField(live.handle)

      for (const seat of [0, 1] as const) {
        const lp = Math.max(0, (field.players[seat] as unknown as { lp: number }).lp | 0)

        if (snapshot.overlay.lp[seat] !== lp) own.push(`overlay:lp${seat} ${snapshot.overlay.lp[seat]}≠${lp}`)
      }
      // Las casillas del núcleo en el orden de la mesa: monstruos 0–4 y Extra 5–6; Mágicas y Trampas 0–4 y Campo 5.
      const slots = { [L.MZONE]: [...snapshot.mine.mz, ...snapshot.mine.emz], [L.SZONE]: [...snapshot.mine.st, snapshot.mine.field] }

      for (const location of [L.MZONE, L.SZONE]) {
        real.zones[location]!.forEach((card, sequence) => {
          const stat = card ? snapshot.overlay.stats.mine[slots[location]![sequence]?.id ?? ''] : undefined

          if (card && (!stat || stat.attack !== card.attack || stat.defense !== card.defense)) own.push(`overlay:stats ${location}/${sequence}`)
        })
      }
      if (own.length > 0 && diffs.length < 5) diffs.push(`answer ${snapshot.answers.length}: ${own.slice(0, 3).join(' | ')}`)
    }

    // (a) Un duelo de al menos 3 turnos completos, comparando en cada pregunta mía.
    const first = await settled(session)
    const end = await play(session, randomLegalPolicy(seed, pickCard), check)

    expect(first.status).toBe('ready')
    expect(end.status === 'ended' || end.overlay.turn >= TURNS).toBe(true)
    expect(diffs).toEqual([])
    // Lo que la pantalla reproduce: desde la mesa del arranque, las jugadas dan la mesa de ahora (la mía y el espejo del rival).
    expect(end.mineActions.reduce(matReducer, end.initial.mine)).toEqual(end.mine)
    expect(end.theirsActs.reduce(mirrorApply, openMirror(end.initial.theirs)).state).toEqual(end.theirs)
    tally.decks += 1
    tally.turns.push(end.overlay.turn)
    expect(end.faults.filter((fault) => fault.kind !== 'script' || fault.message.startsWith('card data'))).toEqual([])

    // (b) El rival sólo pasa de fase y no encadena por su cuenta.
    const rival = end.answers.filter((item) => item.seat === 1).map((item) => item.answer)

    expect(rival.filter((answer) => (answer.type === 'select_idlecmd' && answer.action < 6) || (answer.type === 'select_battlecmd' && answer.action < 2))).toEqual([])
    // (e) En caliente sólo se pidieron scripts de fichas (ninguna carta del duelo quedó fuera del cierre).
    expect(hosts.flatMap((host) => host.hotScripts).filter((name) => !tokens.has(name) && name !== 'c0.lua')).toEqual([])

    // (d) La misma semilla: el mismo duelo con las mismas respuestas.
    if (end.status === 'ready') {
      session.restart()
      const again = await play(session, randomLegalPolicy(seed, pickCard))

      expect(view(again)).toEqual(view(end))
      tally.restarts += 1

      // (c) Deshacer: en mi próxima jugada (idle o batalla), la mesa de antes, exacta.
      let snapshot = again

      for (let n = 0; n < CAP && snapshot.status === 'ready'; n += 1) {
        const before = snapshot
        const bot = randomLegalPolicy(seed + n, pickCard)

        session.answer(bot(snapshot.ask!.ask))
        snapshot = await settled(session)
        if ((before.ask!.ask.type === 'select_idlecmd' || before.ask!.ask.type === 'select_battlecmd') && snapshot.status === 'ready') {
          // La jugada empieza donde estaba la mesa al preguntar: recortar ahí («Seguir en manual») da la mesa de deshacer.
          expect(snapshot.playStarts).toContain(before.mineActions.length)
          expect(session.undo()).toBe(true)
          const back = await settled(session)

          expect(view(back)).toEqual(view(before))
          expect(back.mineActions).toEqual(snapshot.mineActions.slice(0, before.mineActions.length))
          tally.undos += 1
          break
        }
      }
    }
    session.destroy()
  }, 600_000)

  it('comprobó lo que dice: cada deck, cada pregunta, deshacer y reiniciar', () => {
    console.log(JSON.stringify(tally))
    expect(tally.decks).toBe(pool.length)
    expect(tally.checks).toBeGreaterThan(pool.length * TURNS)
    expect(tally.turns.every((turn) => turn >= TURNS)).toBe(true)
    expect(tally.restarts).toBe(pool.length)
    expect(tally.undos).toBe(pool.length)
  })

  it('una opción dice qué hace (el texto que nombra su `desc`): Radiant Typhoon Manifestation ofrece «Search 1 "Mystical Space Typhoon"», no «Efecto 1»', async () => {
    const MANIFESTATION = 94103142
    const MST = 5318639
    const { filler } = await source.manifest()
    // Sin monstruos «Radiant Typhoon» en el deck, de sus dos efectos el núcleo ofrece sólo el segundo (`Duel.SelectEffect`): una sola opción, la que la pantalla decía «Efecto 1».
    const deck: DeckList = { main: [[MANIFESTATION, 1], [MST, 1], ...filler.slice(0, 38).map((code) => [code, 1] as const)] }
    const session = createAutoSession({ loader, deck, seed: 1, hand: [MANIFESTATION], transport: localTransport({ wasmBinary: wasm }) })
    let snapshot = await settled(session)

    for (let n = 0; n < 20 && snapshot.status === 'ready' && snapshot.ask!.ask.type !== 'select_option'; n += 1) {
      const { ask } = snapshot.ask!
      const index = ask.type === 'select_idlecmd' ? ask.activates.findIndex((card) => card.code === MANIFESTATION) : -1

      session.answer(index >= 0 ? { type: 'select_idlecmd', action: 5, index } : passivePolicy()(ask))
      snapshot = await settled(session)
    }
    const pending = snapshot.ask!
    const effectLabel = (_: number, description: string) => {
      const { code, n } = splitDesc(description)

      return snapshot.texts[code]?.[n] || null
    }

    expect(pending.ask).toEqual({ type: 'select_option', player: 0, options: [String((BigInt(MANIFESTATION) << 20n) | 3n)] })
    expect(askView(openAsk(pending, { queries: session.adapter!, prefs: { chainMode: 'ask', placeMode: 'auto' }, effectLabel })).options?.options.map((option) => option.label)).toEqual(['Search 1 "Mystical Space Typhoon"'])
    session.destroy()
  })

  it('una carta sin reglas (o sin datos) no deja arrancar: error con la lista', async () => {
    const effectWithoutScript = rows.find((row) => (row.type & 0x21) === 0x21 && row.alias === 0 && (row.ot & 3) !== 0 && !store.has(`c${row.id}.lua`))!
    const deck = { main: [...lists[pool[0]!]!.main, [effectWithoutScript.id, 1], [1, 1]] } as DeckList
    const session = createAutoSession({ loader, deck, transport: localTransport({ wasmBinary: wasm }) })
    const failed = await pending(session, (s) => s.status === 'error')

    expect(failed.fault).toMatchObject({ kind: 'rules' })
    expect([...failed.fault!.cards].sort()).toEqual([1, effectWithoutScript.id].sort())
  })
})
