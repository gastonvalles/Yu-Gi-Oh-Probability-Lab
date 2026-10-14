import { isToken, matReducer, type MatAction, type MatState } from './practice-mat'

/** Las cartas de una jugada, para la miniatura: las que se roban, se mueven, se activan o se invocan (una ficha no tiene arte). */
function cardsOf(before: MatState, after: MatState, action: MatAction): string[] {
  switch (action.type) {
    // Robar, y empezar otro turno (que roba la carta del tope), muestran las cartas que entraron a la mano.
    case 'draw':
    case 'phase':
      return after.hand.slice(before.hand.length)
    case 'mill':
      return after.gy.slice(before.gy.length)
    case 'token':
    case 'shuffle':
      return []
    default:
      return 'id' in action && !isToken(action.id) ? [action.id] : []
  }
}

/** Las cartas de cada jugada, en el orden en que se hicieron (el mismo que `describeMatSteps`). */
export function matStepCards(initial: MatState, actions: readonly MatAction[]): string[][] {
  const cards: string[][] = []
  let state = initial

  for (const action of actions) {
    const next = matReducer(state, action)

    cards.push(cardsOf(state, next, action))
    state = next
  }

  return cards
}
