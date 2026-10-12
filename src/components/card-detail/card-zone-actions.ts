import { isCardAllowedInDeckZone } from '../../app/deck-builder'
import type { DeckZone } from '../../app/model'
import { t } from '../../i18n'
import type { ApiCardSearchResult } from '../../ygoprodeck'

interface ZoneActionEntry {
  zone: DeckZone
  label: string
  variant: 'primary' | 'secondary' | 'tertiary'
}

/** Botones "Agregar al Main/Extra/Side" que corresponden a esta carta. */
export function buildZoneActionEntries(card: ApiCardSearchResult): ZoneActionEntry[] {
  const entries: ZoneActionEntry[] = []

  if (isCardAllowedInDeckZone(card, 'main')) {
    entries.push({ zone: 'main', label: t('search.zone.addMain'), variant: 'primary' })
  }

  if (isCardAllowedInDeckZone(card, 'extra')) {
    entries.push({ zone: 'extra', label: t('search.zone.addExtra'), variant: 'primary' })
  }

  entries.push({ zone: 'side', label: t('search.zone.addSide'), variant: 'secondary' })

  return entries
}
