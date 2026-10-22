import { DECK_BEFORE_EVENT, DECK_BEFORE_KEY, readDeckBefore, type DeckBefore } from './deck-before'
import { useStoredValue } from './use-stored-value'

/** «Tu deck de antes», al día (también si lo guardó otra pestaña). `null`: todavía no hay (o el deck de antes estaba vacío). */
export function useDeckBefore(): DeckBefore | null {
  return useStoredValue(readDeckBefore, DECK_BEFORE_EVENT, DECK_BEFORE_KEY)
}
