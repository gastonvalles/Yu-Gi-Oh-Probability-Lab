import type { DeckBuilderState, DeckCardInstance } from './model'
import type { CardOrigin, CardRole } from '../types'

/** Map of ygoprodeckId → edited classification for Build B cards */
export type CardEditMap = Map<number, { origin: CardOrigin; roles: CardRole[] }>

/**
 * Pure function. Applies edits to a DeckBuilderState without mutating the original.
 * For each card whose ygoprodeckId is in the edit map, applies origin and roles
 * from the map and sets needsReview to false.
 * Cards without edits keep their original state.
 */
export function applyEditsToConfig(
  deck: DeckBuilderState,
  edits: CardEditMap,
): DeckBuilderState {
  if (edits.size === 0) {
    return {
      deckName: deck.deckName,
      main: deck.main.map(cloneCard),
      extra: deck.extra.map(cloneCard),
      side: deck.side.map(cloneCard),
      isEditingDeck: deck.isEditingDeck,
    }
  }

  return {
    deckName: deck.deckName,
    main: deck.main.map((card) => applyCardEdit(card, edits)),
    extra: deck.extra.map((card) => applyCardEdit(card, edits)),
    side: deck.side.map((card) => applyCardEdit(card, edits)),
    isEditingDeck: deck.isEditingDeck,
  }
}

/**
 * Returns true if NO card in main has origin === null, roles.length === 0,
 * or needsReview === true. Returns false otherwise.
 */
export function isBuildBReady(deck: DeckBuilderState): boolean {
  return deck.main.every(
    (card) => card.origin !== null && card.roles.length > 0 && !card.needsReview,
  )
}

function applyCardEdit(card: DeckCardInstance, edits: CardEditMap): DeckCardInstance {
  const edit = edits.get(card.apiCard.ygoprodeckId)

  if (edit) {
    return {
      instanceId: card.instanceId,
      name: card.name,
      apiCard: card.apiCard,
      origin: edit.origin,
      roles: [...edit.roles],
      needsReview: false,
    }
  }

  return cloneCard(card)
}

function cloneCard(card: DeckCardInstance): DeckCardInstance {
  return {
    instanceId: card.instanceId,
    name: card.name,
    apiCard: card.apiCard,
    origin: card.origin,
    roles: [...card.roles],
    needsReview: card.needsReview,
  }
}
