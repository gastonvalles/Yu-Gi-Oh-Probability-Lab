import { isCardAllowedInDeckZone } from '../../app/deck-builder'
import type { DeckZone } from '../../app/model'
import type { ApiCardSearchResult } from '../../ygoprodeck'

export interface ZoneActionEntry {
  zone: DeckZone
  label: string
  variant: 'primary' | 'secondary' | 'tertiary'
}

/** Botones "Agregar al Main/Extra/Side" que corresponden a esta carta. */
export function buildZoneActionEntries(card: ApiCardSearchResult): ZoneActionEntry[] {
  const entries: ZoneActionEntry[] = []

  if (isCardAllowedInDeckZone(card, 'main')) {
    entries.push({ zone: 'main', label: 'Agregar al Main Deck', variant: 'primary' })
  }

  if (isCardAllowedInDeckZone(card, 'extra')) {
    entries.push({ zone: 'extra', label: 'Agregar al Extra Deck', variant: 'primary' })
  }

  entries.push({
    zone: 'side',
    label: 'Agregar al Side Deck',
    variant: entries.length > 0 ? 'tertiary' : 'secondary',
  })

  return entries
}
