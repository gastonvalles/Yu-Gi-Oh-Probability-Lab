import { writeFileSync } from 'node:fs'
import path from 'node:path'
import { cardMatchesOpcode, OcgDuelMode, OcgLocation as L, OcgQueryFlags as Q } from 'ocgcore-wasm'
import { createAdapter, type Adapter } from '../app/auto/adapter'
import { createAutoHost } from '../app/auto/core-host'
import { teamOrder } from '../app/auto/deck-map'
import { randomLegalPolicy, type CardPicker } from '../app/auto/policies'
import type { AutoCommand, AutoEvent, Seat } from '../app/auto/protocol'
import { whoseTurn } from '../app/duel-turn'
import { codeOfId, codesIn, compare, readMat, readReal } from './support/core-compare'
import { CORE_DATA_DIR, hasCoreData, loadCards, metaDecks, runDuel, scriptStore, wasmBinary } from './support/core-data'

/**
 * La mesa proyectada contra el núcleo real (lento: `npm run test:auto`). Dos bots al azar legal juegan; cada asiento tiene su adaptador,
 * alimentado con lo que le deja ver el árbitro, y después de cada tanda se compara: (a) su mesa con el estado real de sus cartas
 * (`duelQueryLocation`: códigos, orden, posiciones, contadores, materiales); (b) el espejo del rival: cuántas por lugar, lo público con su
 * código real, lo oculto sin un código equivocado; (c) el overlay (vidas, ATK/DEF, cadena, turno y fase); (d) ningún `reveal` lleva un
 * código que el asiento no recibió. La primera diferencia de cada mesa en un duelo se anota (con los mensajes de esa tanda) y esa mesa deja
 * de compararse en ese duelo, así no se cuenta una cascada. Parámetros: AD_DECKS (20), AD_DUELS por deck (3), AD_SEED (1), AD_CAP (1000).
 */
const DECKS = Number(process.env.AD_DECKS ?? 20)
const DUELS = Number(process.env.AD_DUELS ?? 3)
const SEED = Number(process.env.AD_SEED ?? 1)
const CAP = Number(process.env.AD_CAP ?? 1000)
const MR5 = String(OcgDuelMode.MODE_MR5)
const PLAYERS = [
  { lp: 8000, hand: 5, draw: 1 },
  { lp: 8000, hand: 5, draw: 1 },
]
/** Lo que la mesa no puede decir: queda en la lista blanca, contado (`unmapped` con estos textos). */
const UNSUPPORTED = /unsupported|other side|Extra Monster Zone|Field Zone|leaves the duel|from nowhere/

describe.skipIf(!hasCoreData)(`el adaptador contra el núcleo, ${DECKS} decks × ${DUELS} duelos (npm run test:auto)`, () => {
  const tally = { duels: 0, tandas: 0, checks: 0, diffs: {} as Record<string, number>, whitelist: {} as Record<string, number>, unmapped: {} as Record<string, number>, hiddenRevealed: 0, ends: {} as Record<string, number> }
  const pick = (record: Record<string, number>, test: (key: string) => boolean) => Object.fromEntries(Object.entries(record).filter(([key]) => test(key)))

  beforeAll(async () => {
    const { cards, names } = loadCards()
    const store = scriptStore()
    const all = metaDecks(cards, store)
    const pool = Array.from({ length: Math.min(DECKS, all.length) }, (_, i) => all[Math.floor((i * all.length) / Math.min(DECKS, all.length))]!)
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
    const wasm = wasmBinary()
    const typeOf = (code: number) => cards.get(code)?.type ?? 0
    const samples: { duel: number; seat: number; side: string; kind: string; detail: string; tanda: string[]; deck: string }[] = []
    const started = performance.now()
    const stale = new Set<string>()

    for (let d = 0; d < pool.length * DUELS; d += 1) {
      const a = pool[d % pool.length]!
      const other = (d * 7 + 3) % pool.length
      const b = pool[other === d % pool.length ? (other + 1) % pool.length : other]!
      const seed = (SEED * 100_003 + d) >>> 0
      const events: AutoEvent[] = []
      const host = createAutoHost({ core: { wasmBinary: wasm }, cardReader: (code) => cards.get(code) ?? null, scriptReader: store.read, emit: (event) => events.push(event) })
      const create: Extract<AutoCommand, { t: 'create' }> = { t: 'create', seed, flags: MR5, players: PLAYERS, decks: [{ main: a.main, extra: a.extra, hand: [] }, { main: b.main, extra: b.extra, hand: [] }] }
      const adapters: Adapter[] = ([0, 1] as const).map((seat) =>
        createAdapter({ seat, mine: { deck: teamOrder(create, seat), extra: create.decks[seat]!.extra }, theirs: { deck: create.decks[1 - seat]!.main.length, extra: create.decks[1 - seat]!.extra.length }, lp: [8000, 8000], typeOf }),
      )
      // Por asiento y mesa: dejó de compararse (tuvo una diferencia, o algo sin jugada la volvió imposible de comparar).
      const stopped = new Set<string>()
      // (d) Los códigos que cada asiento recibió en todo el duelo: un `reveal` puede viajar en la jugada siguiente, nunca decir uno que no llegó.
      const received = [new Set<number>(), new Set<number>()]
      let mark = 0

      const feed = () => {
        const fresh = events.slice(mark)
        const types: [string[], string[]] = [[], []]

        mark = events.length
        for (const event of fresh) {
          for (const seat of [0, 1] as const) {
            const out = adapters[seat]!.apply(event)

            if (event.t === 'events' && event.seat === seat) {
              types[seat].push(...event.events.map((item) => item.type))
              const allowed = codesIn(event.events, received[seat])

              for (const wire of out.theirs) {
                for (const real of Object.values(wire.reveal)) {
                  if (!allowed.has(codeOfId(real, {}))) tally.hiddenRevealed += 1
                }
              }
            }
            for (const text of out.unmapped) {
              const key = text.replace(/\d+/g, '#')

              if (UNSUPPORTED.test(text)) {
                tally.whitelist[key] = (tally.whitelist[key] ?? 0) + 1
                // Sólo lo que la mesa no puede seguir (una jugada que no existe) deja de compararse; lo demás sigue comparándose y, si rompe algo, se ve.
                if (!/code changed|identity lost/.test(text)) stopped.add(`${seat}:mine`).add(`${seat}:theirs`)
                if (samples.length < 60 && /code changed/.test(text)) samples.push({ duel: d, seat, side: 'whitelist', kind: key, detail: text, tanda: event.t === 'events' ? event.events.map((item) => item.type) : [event.t], deck: `${a.id}-${b.id}` })
              } else {
                tally.unmapped[key] = (tally.unmapped[key] ?? 0) + 1
                if (samples.length < 60) samples.push({ duel: d, seat, side: 'unmapped', kind: key, detail: text, tanda: event.t === 'events' ? event.events.map((item) => item.type) : [event.t], deck: `${a.id}-${b.id}` })
              }
            }
          }
        }
        if (!host.live) return
        tally.tandas += 1
        const { lib, handle } = host.live
        const extraHeld = ([0, 1] as const).some((controller) => lib.duelQueryLocation(handle, { flags: Q.OVERLAY_CARD as Q, controller, location: L.EXTRA }).some((card) => (card?.overlayCards?.length ?? 0) > 0))

        if (extraHeld) tally.whitelist['xyz: materials under an Extra Deck card (transit)'] = (tally.whitelist['xyz: materials under an Extra Deck card (transit)'] ?? 0) + 1
        const field = lib.duelQueryField(handle)

        for (const seat of [0, 1] as const) {
          const adapter = adapters[seat]!
          const rival = (1 - seat) as Seat
          const known = adapter.theirs.known
          // Mi mesa, por sus ids (las ajenas y las fichas, por lo que sabe el adaptador); el espejo, por lo que el adaptador da por seguro.
          const sides = [
            ['mine', seat, readMat(adapter.mine, (id) => (/^card-/.test(id) ? codeOfId(id, {}) : adapter.codeOf({ side: 'mine', id }))), true],
            ['theirs', rival, readMat(adapter.theirs.state, (id) => adapter.codeOf({ side: 'theirs', id })), false],
          ] as const

          // Lo que el espejo muestra con su `known` y el adaptador ya corrigió (una identidad perdida al barajar): lista blanca, contada.
          for (const id of Object.keys(known)) {
            const now = adapter.codeOf({ side: 'theirs', id })

            if (now !== 0 && now !== codeOfId(id, known)) stale.add(`${d}:${seat}:${id}`)
          }

          for (const [side, controller, mat, own] of sides) {
            if (stopped.has(`${seat}:${side}`)) continue
            const real = readReal(lib, handle, controller)
            let diffs = compare(real, mat, own)

            if (extraHeld) diffs = diffs.filter((diff) => !/^(mzone|szone)|^grave/.test(diff))
            // (c) el overlay: las vidas, el ATK/DEF de lo que se ve y quién juega.
            // Las vidas del núcleo son u32: debajo de 0 dan la vuelta (y la pantalla muestra 0).
            const lp = Math.max(0, (field.players[controller] as unknown as { lp: number }).lp | 0)

            if (adapter.overlay.lp[controller] !== lp) diffs.push(`overlay:lp ${adapter.overlay.lp[controller]}≠${lp}`)
            for (const location of [L.MZONE, L.SZONE]) {
              real.zones[location]!.forEach((card, sequence) => {
                const id = card && (own || card.pos !== 'set') ? adapter.idAt({ controller, location, sequence }) : null
                const stat = id ? adapter.overlay.stats[side][id] : undefined

                if (card && id && (!stat || stat.attack !== card.attack || stat.defense !== card.defense)) diffs.push(`overlay:stats ${location}/${sequence}`)
              })
            }
            if (adapter.overlay.turnPlayer !== null && whoseTurn(seat, adapter.mine, adapter.theirs.state, 0) !== (adapter.overlay.turnPlayer === seat ? 'mine' : 'theirs')) diffs.push('overlay:turn')
            tally.checks += 1
            if (diffs.length === 0) continue
            stopped.add(`${seat}:${side}`)
            for (const diff of new Set(diffs.map((item) => `${side}:${item.split(' ')[0]}`))) tally.diffs[diff] = (tally.diffs[diff] ?? 0) + 1
            if (samples.length < 40) samples.push({ duel: d, seat, side, kind: diffs[0]!.split(' ')[0]!, detail: diffs.slice(0, 4).join(' | '), tanda: [...new Set(types[seat])], deck: `${a.id}-${b.id}` })
          }
        }
        // La cadena: en una pregunta, la del overlay tiene los mismos eslabones que la del núcleo.
        const asked = fresh.findLast((event) => event.t === 'ask')

        if (asked && 'seat' in asked && adapters[asked.seat]!.overlay.chain.length !== field.chain.length) {
          tally.diffs['overlay:chain'] = (tally.diffs['overlay:chain'] ?? 0) + 1
          if (samples.length < 60) samples.push({ duel: d, seat: asked.seat, side: 'chain', kind: 'chain', detail: `${adapters[asked.seat]!.overlay.chain.map((link) => link.code + ':' + link.state)} vs ${field.chain.map((link) => link.code)}`, tanda: types[asked.seat], deck: `${a.id}-${b.id}` })
        }
      }

      await host.handle(create)
      feed()
      const result = await runDuel(host, events, [randomLegalPolicy(seed * 2 + 1, pickCard), randomLegalPolicy(seed * 2 + 2, pickCard)], CAP, () => feed(), 60_000)

      tally.duels += 1
      tally.ends[result.end] = (tally.ends[result.end] ?? 0) + 1
    }

    tally.whitelist['theirs: Mirror.known stale (cards, identity lost in a shuffled pile)'] = stale.size
    const report = { parameters: { decks: pool.length, duelsPerDeck: DUELS, seed: SEED, cap: CAP, seconds: Math.round((performance.now() - started) / 1000) }, tally, samples: samples.map((sample) => ({ ...sample })), names: Object.fromEntries([...new Set(samples.flatMap((s) => s.detail.match(/\d{5,}/g) ?? []))].map((code) => [code, names.get(Number(code)) ?? '?'])) }

    writeFileSync(path.join(CORE_DATA_DIR, `adapter-${pool.length}x${DUELS}-s${SEED}.json`), JSON.stringify(report, null, 1))
    console.log(JSON.stringify(report.tally))
  }, 2 * 60 * 60 * 1000)

  it('(a) mi mesa es la del núcleo: códigos, orden, posiciones, contadores y materiales', () => {
    expect(tally.checks).toBeGreaterThan(0)
    expect(pick(tally.diffs, (key) => key.startsWith('mine:') && !key.includes('overlay'))).toEqual({})
  })

  it('(c) el overlay es el del núcleo: vidas, ATK/DEF, turno y cadena', () => {
    expect(pick(tally.diffs, (key) => key.includes('overlay'))).toEqual({})
  })

  it('(d) ningún `reveal` dice un código que el asiento no recibió', () => {
    expect(tally.hiddenRevealed).toBe(0)
  })

  it('todo mensaje del núcleo se proyecta o está en la lista blanca', () => {
    expect(pick(tally.unmapped, (key) => !key.startsWith('identity:'))).toEqual({})
  })

  // Pendiente: en el espejo del rival, una carta vista en una pila oculta (mano, deck) a veces termina atada a otra (`identity:`) y el
  // espejo pone otra carta en su campo o cementerio. Cuando se arregle, esta prueba se pone roja: sacarle el `fails`.
  it.fails('(b) el espejo del rival: sin diferencias ni identidades que no cierran', () => {
    expect({ theirs: pick(tally.diffs, (key) => key.startsWith('theirs:') && !key.includes('overlay')), identity: pick(tally.unmapped, (key) => key.startsWith('identity:')) }).toEqual({ theirs: {}, identity: {} })
  })
})
