import { foldOpeningHand } from '../app/auto/opening-hand'
import { createMatState, replayMat, type MatAction } from '../app/practice-mat'

// La mano de apertura de la mesa automática como la de la práctica: el núcleo la reparte como la primera jugada y la mesa la pliega en la mesa del arranque.

const DECK = ['card-1-1', 'card-2-1', 'card-3-1', 'card-4-1', 'card-5-1', 'card-6-1', 'card-7-1']
/** La mesa del arranque del núcleo: todo en el deck, la mano vacía (`createMatState(deck, extra, 0)`, como `adapter.ts`). */
const CORE_START = createMatState(DECK, ['card-9-1'], 0)
const HAND: MatAction = { type: 'draw', count: 5, ids: ['card-3-1', 'card-1-1', 'card-5-1', 'card-2-1', 'card-7-1'] }
const STANDBY: MatAction = { type: 'phase', phase: 'standby' }
const DRAW_ONE: MatAction = { type: 'draw', count: 1, ids: ['card-4-1'] }

describe('foldOpeningHand: la mano de apertura va en la mesa del arranque', () => {
  it('el robo de 5 del arranque es la mano inicial, con esas cartas en ese orden; las jugadas empiezan después y la mesa de ahora es la misma', () => {
    const actions = [HAND, STANDBY]
    const { initial, skip } = foldOpeningHand(CORE_START, actions)

    expect(skip).toBe(1)
    expect(initial.hand).toEqual(['card-3-1', 'card-1-1', 'card-5-1', 'card-2-1', 'card-7-1'])
    expect(initial.deck).toEqual(['card-4-1', 'card-6-1'])
    expect(initial.phase).toBe('draw')
    expect(initial.turn).toBe(1)
    expect(replayMat(initial, actions.slice(skip))).toEqual(replayMat(CORE_START, actions))
  })

  it('sólo esa primera jugada: un robo después (el de ir segundo, el del turno) sigue siendo un paso', () => {
    const { initial, skip } = foldOpeningHand(CORE_START, [HAND, DRAW_ONE])

    expect(skip).toBe(1)
    expect(initial.hand).not.toContain('card-4-1')
  })

  it('una mesa que ya arranca con mano (la sesión de mentira de las pruebas de pantalla) o que no empieza robando queda como está', () => {
    const dealt = createMatState(DECK, [], 5)

    expect(foldOpeningHand(dealt, [DRAW_ONE])).toEqual({ initial: dealt, skip: 0 })
    expect(foldOpeningHand(CORE_START, [STANDBY, HAND])).toEqual({ initial: CORE_START, skip: 0 })
    expect(foldOpeningHand(CORE_START, [])).toEqual({ initial: CORE_START, skip: 0 })
  })
})
