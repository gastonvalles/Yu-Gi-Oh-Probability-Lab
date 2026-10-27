import { describe, expect, it } from 'vitest'
import { copyIds } from '../app/auto/adapter'
import { createAutoSession, MR5 } from '../app/auto/auto-session'
import { resumeScript } from '../app/auto/core-host'
import { LOCATION as L, parseAutoCommand, POSITION as P, type AutoCommand } from '../app/auto/protocol'
import { placedCards, RESUME_FLAGS, setupOf, whyNotResume } from '../app/auto/resume'
import { createMatState, matReducer, replayMat, type MatState } from '../app/practice-mat'
import { fakeHost, loader } from './support/auto-core-fake'

// Pasar de manual a automático sin el núcleo: la mesa como cartas del núcleo (`resume.ts`), el script que las pone (`resumeScript`), el `create` con `setup` (protocolo) y la sesión
// que arranca desde la mesa (adaptador sembrado: la proyección es la mesa dada, sin jugadas). Con el núcleo real: `auto-resume*.slow.test.ts`.
const codeOf = (id: string) => Number(id.split('-')[1] ?? 0)

/** Una mesa a mitad de duelo: dos en el campo (uno con dos materiales), una colocada, una en el cementerio, una desterrada boca abajo, Main Phase 1 del turno 3. */
function table(): MatState {
  let state = createMatState(copyIds([1, 1, 2, 3, 4, 5, 6, 7, 8]), copyIds([90, 91]), 4)

  state = matReducer(state, { type: 'place', id: 'card-1-1', zone: 'mz', index: 2, pos: 'atk' })
  state = matReducer(state, { type: 'place', id: 'card-90-1', zone: 'mz', index: 4, pos: 'def' })
  state = matReducer(state, { type: 'attach', id: 'card-1-2', to: 'card-90-1' })
  state = matReducer(state, { type: 'attach', id: 'card-2-1', to: 'card-90-1' })
  state = matReducer(state, { type: 'place', id: 'card-3-1', zone: 'st', index: 1, pos: 'set' })
  state = matReducer(state, { type: 'move', id: 'card-4-1', to: 'gy' })
  state = matReducer(state, { type: 'move', id: 'card-5-1', to: 'banished', faceDown: true })
  state = matReducer(state, { type: 'phase', phase: 'main1' })

  return { ...state, turn: 3 }
}

describe('resume: la mesa como cartas del núcleo', () => {
  it('sólo se pasa en un punto limpio: tu Main Phase 1 o 2, sin fichas ni cartas bajo el control del otro', () => {
    const state = table()

    expect(whyNotResume(state, null)).toBeNull()
    expect(whyNotResume({ ...state, phase: 'main2' }, null)).toBeNull()
    expect(whyNotResume({ ...state, phase: 'battle' }, null)).toBe('phase')
    expect(whyNotResume({ ...state, phase: 'draw' }, null)).toBe('phase')
    expect(whyNotResume(matReducer(state, { type: 'token', zone: 'mz', index: 1, pos: 'atk' }), null)).toBe('tokens')
    expect(whyNotResume({ ...state, hand: [...state.hand, 'f.c3'] }, null)).toBe('control')
    expect(whyNotResume(state, { ...createMatState(['c1'], [], 0), hand: ['f.card-1-1'] })).toBe('control')
  })

  it('cada carta con su lugar, su secuencia del núcleo (el deck, de abajo hacia arriba) y su posición; los materiales con su Xyz', () => {
    const state = table()
    const cards = placedCards(state, 0, codeOf)
    const at = (location: number) => cards.filter((card) => card.location === location).map((card) => [card.sequence, card.code, card.position])

    expect(at(L.DECK)).toEqual([...state.deck].reverse().map((id, i) => [i, codeOf(id), P.FACEDOWN_DEFENSE]))
    expect(at(L.HAND)).toEqual(state.hand.map((id, i) => [i, codeOf(id), P.FACEDOWN]))
    expect(at(L.GRAVE)).toEqual([[0, 4, P.FACEUP]])
    expect(at(L.REMOVED)).toEqual([[0, 5, P.FACEDOWN]])
    expect(at(L.EXTRA)).toEqual([[0, 91, P.FACEDOWN_DEFENSE]])
    expect(at(L.MZONE)).toEqual([
      [2, 1, P.FACEUP_ATTACK],
      [4, 90, P.FACEUP_DEFENSE],
    ])
    expect(cards.find((card) => card.code === 90)?.materials).toEqual([1, 2])
    expect(at(L.SZONE)).toEqual([[1, 3, P.FACEDOWN]])
    expect(cards.every((card) => card.controller === 0)).toBe(true)
    // El rival (asiento 1) con lo suyo oculto va con código 0.
    const setup = setupOf([{ state, codeOf }, { state: createMatState(['c1', 'c2'], ['c3'], 1), codeOf: () => 0 }], [6400, 7200])

    expect(setup.lp).toEqual([6400, 7200])
    expect(setup.cards.filter((card) => card.controller === 1).map((card) => [card.location, card.code])).toEqual([
      [L.DECK, 0],
      [L.HAND, 0],
      [L.EXTRA, 0],
    ])
    // Extra boca arriba y Campo.
    const more = placedCards({ ...matReducer(state, { type: 'place', id: 'card-6-1', zone: 'field', index: 0, pos: 'atk' }), extraUp: ['card-91-1'] }, 1, codeOf)

    expect(more.find((card) => card.code === 91)?.position).toBe(P.FACEUP)
    expect(more.find((card) => card.code === 6)).toMatchObject({ location: L.SZONE, sequence: 5, controller: 1 })
  })

  it('el script del núcleo pone las pilas en orden, los monstruos como invocados bien, los materiales sobre su casilla, las escalas y el Campo donde van', () => {
    const state = { ...table(), st: [{ id: 'card-7-1', pos: 'atk' as const, counters: 0, materials: [] }, ...table().st.slice(1)], field: { id: 'card-6-1', pos: 'atk' as const, counters: 0, materials: [] } }
    const setup = setupOf([{ state, codeOf }, { state: createMatState(['c1'], [], 0), codeOf: () => 0 }], [6400, 7200])
    const lines = resumeScript(setup, (code) => (code === 7 ? 0x1000001 : code === 6 ? 0x80002 : 0x1)).split('\n')

    expect(lines.slice(0, 2)).toEqual(['Debug.SetPlayerInfo(0, 6400, 0, 1)', 'Debug.SetPlayerInfo(1, 7200, 0, 1)'])
    // El deck de abajo hacia arriba, cada carta arriba (secuencia 0): la última es la del tope de la mesa.
    const deck = lines.filter((line) => line.includes('LOCATION_DECK') && line.includes(', 0, 0, '))

    expect(deck.at(-1)).toBe(`Debug.AddCard(${codeOf(state.deck[0]!)}, 0, 0, LOCATION_DECK, 0, ${P.FACEDOWN_DEFENSE})`)
    expect(lines).toContain(`Debug.AddCard(1, 0, 0, LOCATION_MZONE, 2, ${P.FACEUP_ATTACK}, true)`)
    const xyz = lines.indexOf(`Debug.AddCard(90, 0, 0, LOCATION_MZONE, 4, ${P.FACEUP_DEFENSE}, true)`)

    expect(xyz).toBeGreaterThan(0)
    expect(lines.slice(xyz + 1, xyz + 3)).toEqual([`Debug.AddCard(1, 0, 0, LOCATION_MZONE, 4, ${P.FACEUP})`, `Debug.AddCard(2, 0, 0, LOCATION_MZONE, 4, ${P.FACEUP})`])
    expect(lines).toContain(`Debug.AddCard(3, 0, 0, LOCATION_SZONE, 1, ${P.FACEDOWN})`)
    expect(lines).toContain(`Debug.AddCard(7, 0, 0, LOCATION_PZONE, 0, ${P.FACEUP})`)
    expect(lines).toContain(`Debug.AddCard(6, 0, 0, LOCATION_FZONE, 0, ${P.FACEUP})`)
    expect(lines).toContain(`Debug.AddCard(0, 1, 1, LOCATION_DECK, 0, ${P.FACEDOWN_DEFENSE})`)
  })

  it('el create con setup pasa por el protocolo; uno mal formado, no', () => {
    const state = table()
    const setup = setupOf([{ state, codeOf }, { state: createMatState(['c1'], [], 0), codeOf: () => 0 }], [6400, 7200])
    const create: AutoCommand = { t: 'create', seed: 1, flags: RESUME_FLAGS, players: [{ lp: 6400, hand: 0, draw: 1 }, { lp: 7200, hand: 0, draw: 1 }], decks: [{ main: [1], extra: [], hand: [] }, { main: [2], extra: [], hand: [] }], setup }

    expect(parseAutoCommand(create)).toEqual(create)
    expect(parseAutoCommand(JSON.stringify(create))).toEqual(create)
    expect(parseAutoCommand({ ...create, setup: { cards: [{ code: 1 }], lp: [1, 2] } })).toBeNull()
    expect(parseAutoCommand({ ...create, setup: { cards: [], lp: ['x'] } })).toBeNull()
    expect(RESUME_FLAGS).toBe((BigInt(MR5) | 16n | 2n).toString())
  })

  it('la sesión arranca desde la mesa: el create lleva el setup y las vidas, nadie roba, y la proyección es la mesa dada sin jugadas', async () => {
    const state = table()
    const host = fakeHost()
    const session = createAutoSession({ loader: loader(), deck: { main: [[1, 2], [2, 1], [3, 1], [4, 1], [5, 1], [6, 1], [7, 1], [8, 1]], extra: [[90, 1], [91, 1]] }, transport: host.factory, seed: 7, resume: { mine: state, codeOf: (_side, id) => codeOf(id), lp: [6400, 7200] } })

    for (let i = 0; i < 20 && session.getSnapshot().initial.mine.deck.length === 0; i += 1) await new Promise((resolve) => setTimeout(resolve, 5))
    const create = host.commands[0] as Extract<AutoCommand, { t: 'create' }>

    expect(create).toMatchObject({ t: 'create', flags: RESUME_FLAGS, players: [{ lp: 6400, hand: 0, draw: 1 }, { lp: 7200, hand: 0, draw: 1 }] })
    expect(create.setup?.lp).toEqual([6400, 7200])
    expect(create.setup?.cards.filter((card) => card.controller === 0)).toEqual(placedCards(state, 0, codeOf))
    // El rival (jugar solo): todo en su deck.
    expect(create.setup?.cards.filter((card) => card.controller === 1).every((card) => card.location === L.DECK)).toBe(true)
    const snap = session.getSnapshot()

    expect(snap.initial.mine).toEqual(state)
    // El anfitrión de mentira roba una al empezar: la mesa sigue desde la dada.
    expect(snap.mine).toEqual(replayMat(state, snap.mineActions))
    expect(snap.theirs.deck).toHaveLength(create.setup!.cards.filter((card) => card.controller === 1).length)
    session.destroy()
  })
})
