import { useMemo } from 'react'

import { formatHasLimits } from '../../app/card-filters'
import type { CardSearchFilters } from '../../app/card-search'
import { getDeckFormatLabel } from '../../app/deck-format'
import type { DeckFormat } from '../../types'
import { buildActiveFilterChips, type ActiveFilterChip } from './search-model'

export interface SearchFilterContext {
  formatLabel: string
  /** El formato tiene lista de prohibidas: sólo entonces hay «Limitación» y «Ocultar prohibidas» (el libre y Genesys no las tienen). */
  formatAllowsLegalityFilter: boolean
  activeFilterChips: ActiveFilterChip[]
}

/** Lo que el panel y el cajón de filtros necesitan saber del formato del deck y de los filtros puestos. */
export function useSearchFilterContext(filters: CardSearchFilters, deckFormat: DeckFormat): SearchFilterContext {
  const formatLabel = getDeckFormatLabel(deckFormat)
  const activeFilterChips = useMemo(() => buildActiveFilterChips({ filters, deckFormat, formatLabel }), [filters, deckFormat, formatLabel])

  return {
    formatLabel,
    formatAllowsLegalityFilter: formatHasLimits(deckFormat),
    activeFilterChips,
  }
}
