import type { MatCard } from '../probability/PracticeMat'

/** Con qué se juega: las copias del Main y del Extra (`card-123-2`) y cómo se llama cada una. */
export interface DuelDeck {
  name: string
  mainIds: string[]
  extraIds: string[]
  /** El Side Deck, para el siding de un Match (sin esto, no hay con qué cambiar cartas). */
  sideIds?: string[]
  cardsById: ReadonlyMap<string, MatCard>
}
