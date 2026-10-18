import { describe, expect, it, vi } from 'vitest'

import { DEFAULT_CARD_SEARCH_FILTERS } from '../app/card-search'
import { EMPTY_RANGE } from '../app/card-filters'
import {
  buildActiveFilterChips,
  buildCardSearchProps,
  sortVisibleSearchResults,
} from '../components/search/search-model'
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

describe('chips de filtros activos', () => {
  const chipsOf = (updates: Partial<typeof DEFAULT_CARD_SEARCH_FILTERS>, deckFormat: 'tcg' | 'unlimited' | 'genesys' = 'tcg') =>
    buildActiveFilterChips({ filters: { ...DEFAULT_CARD_SEARCH_FILTERS, ...updates }, deckFormat, formatLabel: 'TCG' })

  it('sin filtros no hay chips', () => {
    expect(chipsOf({})).toEqual([])
  })

  it('cada chip sabe cómo quitarse, y hay uno por grupo (no uno por valor)', () => {
    const chips = chipsOf({ archetype: ' Blue-Eyes ', legalOnly: true, frames: ['fusion', 'xyz'], attributes: ['DARK', 'LIGHT'], effects: ['banish'] })

    expect(chips.map((chip) => [chip.key, chip.label, chip.value, chip.updates])).toEqual([
      ['archetype', 'Arquetipo', 'Blue-Eyes', { archetype: '' }],
      ['frames', 'Marco', 'Fusión, Xyz', { frames: [] }],
      ['attributes', 'Atributo', 'DARK, LIGHT', { attributes: [] }],
      ['legal-only', 'Legalidad', 'Sin prohibidas en TCG', { legalOnly: false }],
      ['effects', 'Efecto', 'Desterrar', { effects: [] }],
    ])
  })

  it('las cotas se dicen cortas: «2500–3000», «≥ 2500», «≤ 4»', () => {
    const chips = chipsOf({ atk: { min: '2500', max: '3000' }, def: { min: '2500', max: '' }, level: { min: '', max: '4' } })

    expect(chips.map((chip) => [chip.label, chip.value])).toEqual([
      ['Nivel / Rango / Link', '≤ 4'],
      ['ATK', '2500–3000'],
      ['DEF', '≥ 2500'],
    ])
    expect(chips[1]?.updates).toEqual({ atk: EMPTY_RANGE })
  })

  it('el pool de cartas, la escala de Péndulo y el año también tienen chip (y se quitan solos)', () => {
    const chips = chipsOf({ pools: ['tcg-only', 'master-duel'], scale: { min: '', max: '3' }, year: { min: '2019', max: '2021' } })

    expect(chips.map((chip) => [chip.key, chip.label, chip.value, chip.updates])).toEqual([
      ['pools', 'Pool de cartas', 'Solo TCG, Master Duel', { pools: [] }],
      ['scale', 'Escala de Péndulo', '≤ 3', { scale: EMPTY_RANGE }],
      ['year', 'Año de salida', '2019–2021', { year: EMPTY_RANGE }],
    ])
  })

  it('sólo cuentan los filtros del formato: sin lista de prohibidas no hay limitación ni «sin prohibidas»; los puntos son de Genesys', () => {
    expect(chipsOf({ limits: ['forbidden'], legalOnly: true }, 'unlimited')).toEqual([])
    expect(chipsOf({ limits: ['forbidden'] }, 'tcg').map((chip) => [chip.label, chip.value])).toEqual([['Limitación', 'Prohibida']])
    expect(chipsOf({ genesysPoints: { min: '3', max: '' } }, 'tcg')).toEqual([])
    expect(chipsOf({ genesysPoints: { min: '3', max: '' } }, 'genesys').map((chip) => [chip.label, chip.value])).toEqual([['Puntos Genesys', '≥ 3']])
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
