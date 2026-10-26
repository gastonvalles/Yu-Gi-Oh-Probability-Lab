import { describe, expect, it } from 'vitest'

import type { AutoSnapshot } from '../app/auto/auto-session'
import { MANUAL_BACK_MAX, manualHandover } from '../app/auto/manual-handover'
import { createMatState, describeMatSteps, replayMat, type MatAction } from '../app/practice-mat'
import { IDLE } from './support/auto-core-fake'

// «Seguir en manual»: qué jugadas se pueden deshacer, cómo se rotulan y qué mesa pasa a la manual.
const NAMES: Record<string, string> = { 'card-1-1': 'Ash Blossom', 'card-2-1': 'S:P Little Knight', 'card-3-1': 'Droll' }
const nameOf = (id: string) => NAMES[id]
const initial = createMatState(['card-1-1', 'card-2-1', 'card-3-1', 'card-4-1'], ['card-9-1'], 0)
// El núcleo reparte la mano como la primera jugada (se pliega en el paso 0); después, cuatro jugadas mías.
const OPENING: MatAction = { type: 'draw', count: 2, ids: ['card-1-1', 'card-2-1'] }
const PLAYS: MatAction[][] = [
  [
    { type: 'activate', id: 'card-1-1' },
    { type: 'move', id: 'card-1-1', to: 'gy' },
  ],
  [{ type: 'move', id: 'card-2-1', to: 'banished' }],
  [{ type: 'phase', phase: 'battle' }],
  [{ type: 'draw', count: 1, ids: ['card-3-1'] }],
]
const ACTIONS = [OPENING, ...PLAYS.flat()]
const pending = { askId: 9, seat: 0 as const, ask: IDLE }

function snap(patch: Partial<AutoSnapshot> = {}) {
  return { initial: { mine: initial, theirs: initial }, mineActions: ACTIONS, playStarts: [1, 3, 4, 5, 6], ask: pending, chainSteps: [], names: { 3: 'Droll' }, ...patch }
}

describe('manualHandover', () => {
  it('ofrece mis jugadas de la última hacia atrás, cada una con el primer paso como lo dice la lista de Pasos', () => {
    const handover = manualHandover(snap(), nameOf)
    const labels = describeMatSteps(replayMat(initial, [OPENING]), PLAYS.flat(), (id) => NAMES[id] ?? id)

    // En las jugadas de la manual (sin la mano de apertura): 4, 3, 2 y 0.
    expect(handover.plays.map((play) => play.at)).toEqual([4, 3, 2, 0])
    expect(handover.plays.map((play) => play.label)).toEqual([labels[4], labels[3], labels[2], labels[0]])
    expect(handover.plays[2]!.label).toContain('S:P Little Knight')
  })

  it('volver N deja la mesa de antes de esa jugada, con todo el historial hasta ahí y la mano de apertura en el paso 0', () => {
    const handover = manualHandover(snap(), nameOf)
    const now = handover.session(0)
    const back3 = handover.session(3)

    expect(now.initial.hand).toEqual(['card-1-1', 'card-2-1'])
    expect(now.actions).toEqual(PLAYS.flat())
    expect(back3.actions).toEqual(PLAYS[0])
    expect(replayMat(back3.initial, back3.actions).hand).toEqual(['card-2-1'])
    expect(replayMat(back3.initial, back3.actions).gy).toEqual(['card-1-1'])
    expect(handover.session(4).actions).toEqual([])
    // Los nombres del `.cdb`, por el id de la primera copia (como la mesa del automático).
    expect(now.names['card-3-1']).toBe('Droll')
  })

  it('sin pregunta pendiente (pensando, error o fin) la última jugada cuenta si ya movió algo; una que no movió nada, no', () => {
    // El núcleo se cayó a mitad de la cuarta: su robo ya está.
    expect(manualHandover(snap({ ask: null, playStarts: [1, 3, 4, 5] }), nameOf).plays.map((play) => play.at)).toEqual([4, 3, 2, 0])
    // El fin: la última pregunta ya se contestó y no movió nada.
    expect(manualHandover(snap({ ask: null }), nameOf).plays.map((play) => play.at)).toEqual([4, 3, 2, 0])
    // Sin jugadas: sólo «Nada».
    expect(manualHandover(snap({ mineActions: [OPENING], playStarts: [1] }), nameOf).plays).toEqual([])
  })

  it(`ofrece hasta ${MANUAL_BACK_MAX} jugadas`, () => {
    const many: MatAction[] = Array.from({ length: 8 }, (_, index) => ({ type: 'phase', phase: index % 2 ? 'main1' : 'battle' }))
    const handover = manualHandover(snap({ mineActions: [OPENING, ...many], playStarts: [1, 2, 3, 4, 5, 6, 7, 8, 9] }), nameOf)

    expect(handover.plays).toHaveLength(MANUAL_BACK_MAX)
    expect(handover.session(MANUAL_BACK_MAX).actions).toHaveLength(8 - MANUAL_BACK_MAX)
  })

  it('el rival de handtraps pasa con su mano, y las que ya activó hasta ahí, usadas', () => {
    const hand = { hand: ['rival.card-14558127-1', 'rival.card-97268402-1'], used: [] }
    // Activó Ash Blossom en la segunda jugada (había 3 jugadas en la mesa).
    const chainSteps = [{ kind: 'chain' as const, at: 3, index: 0, link: { card: null, code: 14558127, mine: false } }]
    const handover = manualHandover(snap({ chainSteps }), nameOf, { hand, names: { 'rival.card-14558127-1': 'Ash Blossom' } })

    expect(handover.session(0).initial.rival).toEqual({ hand: hand.hand, used: ['rival.card-14558127-1'] })
    expect(handover.session(3).initial.rival).toEqual({ hand: hand.hand, used: [] })
    expect(handover.session(0).names['rival.card-14558127-1']).toBe('Ash Blossom')
    // Sin rival de handtraps, nada del rival.
    expect(manualHandover(snap(), nameOf).session(0).initial.rival).toBeUndefined()
  })
})
