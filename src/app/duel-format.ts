import type { DeckFormat } from '../types'
import { buildDeckFormatIssues } from './deck-format'
import type { DeckCardInstance } from './model'
import type { ApiCardReference } from '../types'

/** Lo mínimo que hace falta saber de cada copia de la mesa (`card-123-2`) para revisarla: cómo se llama y sus datos. Una sin datos (`apiCard` null) no se puede revisar. */
interface DuelDeckCard {
  name: string
  apiCard: ApiCardReference | null
}

/**
 * Lo que le sobra a un deck para jugar con un formato, en palabras (las mismas del builder: prohibidas, copias de más, cartas fuera de Edison, puntos de Genesys…).
 * Va el Main y el Extra juntos; vacío si cumple o si el formato no limita nada. Las copias sin datos de carta no cuentan (no hay con qué revisarlas).
 */
export function deckFormatIssues(copyIds: readonly string[], cardsById: ReadonlyMap<string, DuelDeckCard>, format: DeckFormat): string[] {
  const main: DeckCardInstance[] = []

  copyIds.forEach((id, index) => {
    const card = cardsById.get(id)

    if (card?.apiCard) {
      main.push({ instanceId: `${id}#${index}`, name: card.name, apiCard: card.apiCard, origin: null, roles: [], needsReview: false })
    }
  })

  return buildDeckFormatIssues({ deckName: '', main, extra: [], side: [], isEditingDeck: false }, format)
}
