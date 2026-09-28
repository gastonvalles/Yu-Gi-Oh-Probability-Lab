import { useEffect, useMemo } from 'react'

import type { CardSearchFilters } from '../../app/card-search'
import { getDeckFormatLabel } from '../../app/deck-format'
import type { DeckFormat } from '../../types'
import {
  buildActiveFilterChips,
  buildFilterSectionSummaries,
  buildSanitizedFilterUpdates,
  type ActiveFilterChip,
  type FilterSectionSummaries,
} from './search-model'
import {
  getExactTypeFilterGroups,
  getRaceFilterGroups,
  QUICK_TYPE_META,
  type FilterOptionGroup,
  type QuickTypeMeta,
} from './search-options'

export interface SearchFilterContext {
  quickTypeMeta: QuickTypeMeta
  exactTypeGroups: FilterOptionGroup[]
  raceGroups: FilterOptionGroup[]
  formatLabel: string
  formatAllowsLegalityFilter: boolean
  activeFilterChips: ActiveFilterChip[]
  sectionSummaries: FilterSectionSummaries
}

/**
 * Deriva las opciones visibles de los filtros para el tipo rápido y el formato
 * actuales, y limpia los valores que dejaron de ser válidos (p. ej. una raza de
 * monstruo al pasar a "Magias").
 */
export function useSearchFilterContext(
  filters: CardSearchFilters,
  deckFormat: DeckFormat,
  onFilterChange: (updates: Partial<CardSearchFilters>) => void,
): SearchFilterContext {
  const quickTypeMeta = QUICK_TYPE_META[filters.quickType]
  const formatLabel = getDeckFormatLabel(deckFormat)
  const formatAllowsLegalityFilter = deckFormat !== 'unlimited' && deckFormat !== 'genesys'
  const exactTypeGroups = useMemo(() => getExactTypeFilterGroups(filters.quickType), [filters.quickType])
  const raceGroups = useMemo(() => getRaceFilterGroups(filters.quickType), [filters.quickType])

  const sanitizedFilterUpdates = useMemo(
    () =>
      buildSanitizedFilterUpdates({
        filters,
        exactTypeGroups,
        raceGroups,
        formatAllowsLegalityFilter,
        showAttribute: quickTypeMeta.showAttribute,
        showLevel: quickTypeMeta.showLevel,
      }),
    [exactTypeGroups, filters, formatAllowsLegalityFilter, quickTypeMeta, raceGroups],
  )

  useEffect(() => {
    if (sanitizedFilterUpdates) {
      onFilterChange(sanitizedFilterUpdates)
    }
  }, [onFilterChange, sanitizedFilterUpdates])

  const activeFilterChips = useMemo(
    () =>
      buildActiveFilterChips({
        filters,
        formatAllowsLegalityFilter,
        formatLabel,
        raceLabel: quickTypeMeta.raceLabel,
      }),
    [filters, formatAllowsLegalityFilter, formatLabel, quickTypeMeta.raceLabel],
  )

  const sectionSummaries = useMemo(
    () => buildFilterSectionSummaries({ filters, quickTypeMeta, formatAllowsLegalityFilter, formatLabel }),
    [filters, formatAllowsLegalityFilter, formatLabel, quickTypeMeta],
  )

  return {
    quickTypeMeta,
    exactTypeGroups,
    raceGroups,
    formatLabel,
    formatAllowsLegalityFilter,
    activeFilterChips,
    sectionSummaries,
  }
}
