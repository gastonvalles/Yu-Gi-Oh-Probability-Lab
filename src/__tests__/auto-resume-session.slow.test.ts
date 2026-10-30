import { describe, expect, it } from 'vitest'
import { copyIds } from '../app/auto/adapter'
import { openAsk } from '../app/auto/ask-ui'
import { createDataLoader } from '../app/auto/auto-data'
import { createAutoSession, undoPoint, type AutoSession, type AutoSnapshot } from '../app/auto/auto-session'
import { localTransport, type AutoHost } from '../app/auto/core-host'
import type { DeckList } from '../app/auto/deck-map'
import { randomLegalPolicy } from '../app/auto/policies'
import { parseAnswer, type CoreAsk } from '../app/auto/protocol'
import { whyNotResume } from '../app/auto/resume'
import { createMatState, matReducer, type MatAction } from '../app/practice-mat'
import { playAsk, seeded } from './support/ask-ui-player'
import { compare, readMat, readReal } from './support/core-compare'
import { cardRows, hasCoreData, loadCards, metaDecks, nodeSource, scriptStore, slowDecklists, wasmBinary } from './support/core-data'

/**
 * Pasar de manual a automático por la sesión (`resume`), con decks del meta y el núcleo real (lento: `npm run test:auto`): una mesa manual armada con el reductor (monstruos
 * en ataque y defensa, uno del Extra con materiales Xyz si lo hay, una Mágica o Trampa colocada, una escala de Péndulo y una Mágica de Campo si las hay, cementerio, destierro
 * boca abajo, vidas distintas, Main Phase 1 del turno 3) tiene que verse igual en la mesa proyectada y en el núcleo (`compare` de `core-compare.ts`, campo por campo), el núcleo
 * tiene que ofrecer jugadas y seguir `RESUME_STEPS` pasos con un jugador al azar sin trabarse, y deshacer tiene que volver a la mesa rearmada. RESUME_DECKS decks (8).
 */
const RESUME_DECKS = Number(process.env.RESUME_DECKS ?? 8)
const RESUME_STEPS = Number(process.env.RESUME_STEPS ?? 12)

describe.skipIf(!hasCoreData)('pasar de manual a automático por la sesión, con decks del meta', () => {
  const rows = hasCoreData ? cardRows() : []
  const { cards } = hasCoreData ? loadCards() : { cards: new Map() }
  const store = scriptStore()
  const source = nodeSource(rows, store)
  const loader = createDataLoader(source, null)
  const lists = hasCoreData ? (slowDecklists()) : {}
  const ok = new Set(hasCoreData ? metaDecks(cards, store).map((deck) => deck.id) : [])
  const ids = Object.keys(lists).filter((id) => ok.has(id))
  const wasm = hasCoreData ? wasmBinary() : new ArrayBuffer(0)
  const typeOf = (code: number) => cards.get(code)?.type ?? 0
  const codeOfId = (id: string) => Number(id.split('-')[1] ?? 0)
  const isMonster = (id: string) => (typeOf(codeOfId(id)) & 0x1) !== 0
  const tally = { decks: 0, xyz: 0, pendulum: 0, field: 0, steps: 0 }

  /** Una mesa manual con de todo un poco, desde el deck tal cual (sin barajar: así la prueba es la misma siempre). */
  function manualTable(list: DeckList) {
    const main = list.main.flatMap(([code, copies]) => Array.from({ length: copies }, () => code))
    const extra = (list.extra ?? []).flatMap(([code, copies]) => Array.from({ length: copies }, () => code))
    const all = copyIds([...main, ...extra])
    let state = createMatState(all.slice(0, main.length), all.slice(main.length), 5)
    const play = (action: MatAction) => void (state = matReducer(state, action))
    const features = { xyz: false, pendulum: false, field: false }

    play({ type: 'draw', count: 2 })
    const monsters = state.hand.filter(isMonster)
    const spells = state.hand.filter((id) => !isMonster(id))

    if (monsters[0]) play({ type: 'place', id: monsters[0], zone: 'mz', index: 2, pos: 'atk' })
    if (monsters[1]) play({ type: 'place', id: monsters[1], zone: 'mz', index: 0, pos: 'def' })
    if (spells[0]) play({ type: 'place', id: spells[0], zone: 'st', index: 1, pos: 'set' })
    if (state.hand[0]) play({ type: 'move', id: state.hand[0], to: 'gy' })
    play({ type: 'move', id: state.deck[0]!, to: 'banished', faceDown: true })
    play({ type: 'move', id: state.deck[0]!, to: 'gy' })
    // Un Xyz del Extra con dos materiales del deck (puestos a mano: la mesa manual no pregunta).
    const xyz = state.extra.find((id) => (typeOf(codeOfId(id)) & 0x800000) !== 0)

    if (xyz) {
      play({ type: 'place', id: xyz, zone: 'mz', index: 4, pos: 'atk' })
      play({ type: 'attach', id: state.deck[0]!, to: xyz })
      play({ type: 'attach', id: state.deck[0]!, to: xyz })
      features.xyz = true
    }
    const pendulum = state.deck.find((id) => (typeOf(codeOfId(id)) & 0x1000000) !== 0)

    if (pendulum) {
      play({ type: 'place', id: pendulum, zone: 'st', index: 0, pos: 'atk' })
      features.pendulum = true
    }
    const field = state.deck.find((id) => (typeOf(codeOfId(id)) & 0x80000) !== 0)

    if (field) {
      play({ type: 'place', id: field, zone: 'field', index: 0, pos: 'atk' })
      features.field = true
    }
    play({ type: 'phase', phase: 'main1' })

    return { state: { ...state, turn: 3 }, features }
  }

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
  const picked = Array.from({ length: Math.min(RESUME_DECKS, ids.length) }, (_, i) => ids[Math.floor((i * ids.length) / Math.min(RESUME_DECKS, ids.length))]!)

  it.each(picked)('%s: la mesa manual sigue en el núcleo tal cual y se juega', async (deckId) => {
    const list = lists[deckId]!
    const { state, features } = manualTable(list)
    let live: AutoHost | null = null
    const session = createAutoSession({
      loader,
      deck: list,
      seed: 7,
      transport: localTransport({ wasmBinary: wasm }, (host) => void (live = host)),
      resume: { mine: state, codeOf: (_side, id) => codeOfId(id), lp: [6400, 7200] },
    })

    expect(whyNotResume(state, null)).toBeNull()
    const first = await settled(session)

    expect(first.status, first.fault?.message).toBe('ready')
    expect(first.ask?.ask.type).toBe('select_idlecmd')
    // La mesa proyectada es la manual (misma fase, mismo turno, mismas cartas en cada lugar) y las vidas son las dadas.
    expect(first.mine).toEqual(state)
    expect(first.overlay.lp).toEqual([6400, 7200])
    expect(first.mineActions).toEqual([])
    expect(first.unmapped).toEqual([])
    // Y el núcleo tiene lo mismo, campo por campo (también el rival: todo en su deck).
    const core = live!.live!

    expect(compare(readReal(core.lib, core.handle, 0), readMat(first.mine, codeOfId), true)).toEqual([])
    expect(compare(readReal(core.lib, core.handle, 1), readMat(first.theirs, () => 0), false)).toEqual([])
    const ask = first.ask!.ask as Extract<CoreAsk, { type: 'select_idlecmd' }>

    expect(ask.to_bp).toBe(true)
    // Las cartas colocadas y los monstruos del campo juegan: alguna jugada en la mano o en el campo.
    expect(ask.summons.length + ask.activates.length + ask.pos_changes.length + ask.special_summons.length).toBeGreaterThan(0)
    // Se sigue jugando con un jugador al azar sobre lo que la pantalla ofrece.
    const random = seeded(11)
    const bot = randomLegalPolicy(11)

    for (let step = 0; step < RESUME_STEPS; step += 1) {
      const snap = session.getSnapshot()

      if (snap.status !== 'ready') break
      const opened = openAsk({ askId: snap.ask!.askId, ask: snap.ask!.ask, ...(snap.ask!.title === undefined ? {} : { title: snap.ask!.title }) }, { queries: session.adapter!, prefs: { chainMode: 'ask', placeMode: 'ask' }, typeOf })
      const played = playAsk(opened, random)

      session.answer(played.answer && parseAnswer(played.answer) ? played.answer : bot(snap.ask!.ask))
      const next = await settled(session)

      expect(next.status, next.fault?.message).not.toBe('error')
      if (next.status === 'ended') break
      tally.steps += 1
    }
    expect(session.getSnapshot().faults.filter((fault) => fault.kind === 'retry' || fault.kind === 'unhandled')).toEqual([])
    // Deshacer vuelve a la mesa rearmada.
    if (session.getSnapshot().answers.some(undoPoint) && session.getSnapshot().status !== 'ended') {
      session.undo()
      const back = await settled(session)

      expect(back.status, back.fault?.message).not.toBe('error')
      expect(back.initial.mine).toEqual(state)
    }
    tally.decks += 1
    if (features.xyz) tally.xyz += 1
    if (features.pendulum) tally.pendulum += 1
    if (features.field) tally.field += 1
    session.destroy()
  }, 10 * 60 * 1000)

  it('cubrió Xyz con materiales, escalas y campo', () => {
    console.log(JSON.stringify(tally))
    expect(tally.decks).toBe(picked.length)
    if (RESUME_DECKS >= 8) {
      expect(tally.xyz).toBeGreaterThan(0)
      expect(tally.pendulum + tally.field).toBeGreaterThan(0)
    }
  })
})
