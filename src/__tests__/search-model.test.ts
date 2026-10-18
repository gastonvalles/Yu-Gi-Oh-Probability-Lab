import { describe, expect, it, vi } from 'vitest'

import { DEFAULT_CARD_SEARCH_FILTERS } from '../app/card-search'
import {
  buildActiveFilterChips,
  buildCardSearchProps,
  buildSanitizedFilterUpdates,
  sortVisibleSearchResults,
} from '../components/search/search-model'
import { getExactTypeFilterGroups, getRaceFilterGroups, QUICK_TYPE_META } from '../components/search/search-options'
import type { ApiCardSearchResult } from '../ygoprodeck'

function card(ygoprodeckId: number, name: string, cardType: string): ApiCardSearchResult {
  return { ygoprodeckId, name, cardType } as ApiCardSearchResult
}

describe('sortVisibleSearchResults', () => {
  const results = [card(1, 'Zeta', 'Trap Card'), card(2, 'Beta', 'Effect Monster'), card(3, 'Alfa', 'Spell Card')]

  it('mantiene el orden de llegada en el orden base', () => {
    expect(sortVisibleSearchResults(results, 'default')).toBe(results)
  })

  it('agrupa monstruo > magia > trampa y ordena por nombre', () => {
    expect(sortVisibleSearchResults(results, 'name-asc').map((entry) => entry.name)).toEqual(['Beta', 'Alfa', 'Zeta'])
  })
})

describe('buildSanitizedFilterUpdates', () => {
  it('limpia raza, atributo y nivel que no aplican al pasar a Magias', () => {
    const filters = { ...DEFAULT_CARD_SEARCH_FILTERS, quickType: 'spell' as const, race: 'Dragon', attribute: 'DARK', level: '4' }

    expect(
      buildSanitizedFilterUpdates({
        filters,
        exactTypeGroups: getExactTypeFilterGroups('spell'),
        raceGroups: getRaceFilterGroups('spell'),
        formatAllowsLegalityFilter: true,
        showAttribute: QUICK_TYPE_META.spell.showAttribute,
        showLevel: QUICK_TYPE_META.spell.showLevel,
      }),
    ).toEqual({ race: '', attribute: '', level: '' })
  })

  it('no propone cambios si todo es válido', () => {
    expect(
      buildSanitizedFilterUpdates({
        filters: DEFAULT_CARD_SEARCH_FILTERS,
        exactTypeGroups: getExactTypeFilterGroups('all'),
        raceGroups: getRaceFilterGroups('all'),
        formatAllowsLegalityFilter: false,
        showAttribute: true,
        showLevel: true,
      }),
    ).toBeNull()
  })
})

describe('chips de filtros activos', () => {
  const filters = { ...DEFAULT_CARD_SEARCH_FILTERS, archetype: ' Blue-Eyes ', legalOnly: true }

  it('cada chip sabe cómo quitarse', () => {
    const chips = buildActiveFilterChips({ filters, formatAllowsLegalityFilter: true, formatLabel: 'TCG', raceLabel: 'Raza' })

    expect(chips.map((chip) => [chip.key, chip.value, chip.updates])).toEqual([
      ['archetype', 'Blue-Eyes', { archetype: '' }],
      ['legal-only', 'Sin prohibidas en TCG', { legalOnly: false }],
    ])
  })
})

describe('buildCardSearchProps', () => {
  it('agrupa lo que sabe el controlador del deck en el estado y las acciones que reciben los paneles (el builder y el buscador global)', () => {
    const onQueryChange = vi.fn()
    const onSearchFiltersChange = vi.fn()
    const onClearSearchFilters = vi.fn()
    const onLoadMoreResults = vi.fn()
    const visibleSearchResults = [card(1, 'Ash Blossom & Joyous Spring', 'Effect Monster')]
    const maxedOutSearchResultIds = new Set([1])
    const { search, actions } = buildCardSearchProps({
      deckFormat: 'tcg',
      query: 'ash',
      status: 'success',
      visibleSearchResults,
      loadedSearchResultCount: 3,
      errorMessage: '',
      hasMore: true,
      isLoadingMore: false,
      searchFilters: DEFAULT_CARD_SEARCH_FILTERS,
      activeFilterCount: 0,
      hasSearchCriteria: true,
      maxedOutSearchResultIds,
      onQueryChange,
      onSearchFiltersChange,
      onClearSearchFilters,
      onLoadMoreResults,
    })

    expect(search).toMatchObject({ deckFormat: 'tcg', query: 'ash', status: 'success', rawResultCount: 3, hasMore: true, hasSearchCriteria: true, filters: DEFAULT_CARD_SEARCH_FILTERS })
    expect(search.results).toBe(visibleSearchResults)
    expect(search.maxedOutResultIds).toBe(maxedOutSearchResultIds)
    expect(actions).toEqual({ onQueryChange, onFilterChange: onSearchFiltersChange, onClearFilters: onClearSearchFilters, onLoadMore: onLoadMoreResults })
  })
})
