import type { CardSearchFilters, NumberRange } from '../../app/card-search'
import { EMPTY_RANGE, formatHasLimits, isRangeActive } from '../../app/card-filters'
import { t } from '../../i18n'
import type { DeckFormat } from '../../types'
import type { ApiCardSearchResult } from '../../ygoprodeck'
import {
  ABILITY_OPTIONS,
  ATTRIBUTE_OPTIONS,
  EFFECT_OPTIONS,
  FRAME_OPTIONS,
  LIMIT_OPTIONS,
  MONSTER_RACE_OPTIONS,
  POOL_OPTIONS,
  SPELL_TRAP_OPTIONS,
  labelOf,
  type FilterOption,
  type SearchSortOrder,
} from './search-options'
import type { CardSearchActions, CardSearchViewState } from './search-types'

export interface ActiveFilterChip {
  key: string
  label: string
  value: string
  updates: Partial<CardSearchFilters>
}

export function sortVisibleSearchResults(
  results: ApiCardSearchResult[],
  sortOrder: SearchSortOrder,
): ApiCardSearchResult[] {
  if (sortOrder === 'default') {
    // Keep fetch order as-is: grouping by type here would re-shuffle already-visible
    // cards every time a new page loads a card of a "higher" type, breaking scroll/click.
    return results
  }

  return [...results].sort((left, right) => {
    const typeDifference = getSearchTypePriority(left) - getSearchTypePriority(right)

    if (typeDifference !== 0) {
      return typeDifference
    }

    const nameDifference =
      sortOrder === 'name-desc'
        ? right.name.localeCompare(left.name)
        : left.name.localeCompare(right.name)

    if (nameDifference !== 0) {
      return nameDifference
    }

    return left.ygoprodeckId - right.ygoprodeckId
  })
}

function getSearchTypePriority(card: ApiCardSearchResult): number {
  const cardType = typeof card.cardType === 'string' ? card.cardType.toLowerCase() : ''

  if (cardType.includes('monster')) {
    return 0
  }

  if (cardType.includes('spell')) {
    return 1
  }

  if (cardType.includes('trap')) {
    return 2
  }

  return 3
}

/** Una cota dicha corta: «2500–3000», «≥ 2500», «≤ 1800». */
function describeRange(range: NumberRange): string {
  const min = range.min.trim()
  const max = range.max.trim()

  return min !== '' && max !== '' ? `${min}–${max}` : min !== '' ? `≥ ${min}` : `≤ ${max}`
}

/**
 * Los filtros puestos, uno por grupo (un chip por «Marco», uno por «Atributo»…): el chip dice qué se eligió y al tocarlo se vacía el grupo entero. Sólo cuentan los
 * de lo que el formato tiene (sin lista de prohibidas no hay «Limitación»; los puntos son de Genesys).
 */
export function buildActiveFilterChips({
  filters,
  deckFormat,
  formatLabel,
}: {
  filters: CardSearchFilters
  deckFormat: DeckFormat
  formatLabel: string
}): ActiveFilterChip[] {
  const chips: ActiveFilterChip[] = []
  const add = (key: string, label: string, value: string, updates: Partial<CardSearchFilters>) => chips.push({ key, label, value, updates })
  const group = (key: keyof CardSearchFilters, label: string, options: FilterOption[]) => {
    const values = filters[key] as string[]

    if (values.length > 0) {
      add(key, label, values.map((value) => labelOf(options, value)).join(', '), { [key]: [] })
    }
  }
  const range = (key: 'level' | 'atk' | 'def' | 'scale' | 'year' | 'genesysPoints', label: string) => {
    if (isRangeActive(filters[key])) {
      add(key, label, describeRange(filters[key]), { [key]: EMPTY_RANGE })
    }
  }

  if (filters.archetype.trim().length > 0) {
    add('archetype', t('search.filters.archetype'), filters.archetype.trim(), { archetype: '' })
  }

  group('frames', t('search.filters.frame'), FRAME_OPTIONS)
  group('attributes', t('search.filters.attribute'), ATTRIBUTE_OPTIONS)
  group('spellTrapKinds', t('search.filters.spellTrap'), SPELL_TRAP_OPTIONS)
  group('races', t('search.filters.monsterType'), MONSTER_RACE_OPTIONS)
  group('abilities', t('search.filters.abilities'), ABILITY_OPTIONS)

  if (formatHasLimits(deckFormat)) {
    group('limits', t('search.filters.limit'), LIMIT_OPTIONS)

    if (filters.legalOnly) {
      add('legal-only', t('search.chip.legality'), t('search.chip.noBanned', { format: formatLabel }), { legalOnly: false })
    }
  }

  group('pools', t('search.filters.pool'), POOL_OPTIONS)
  group('effects', t('search.filters.effect'), EFFECT_OPTIONS)

  if (filters.description.trim().length > 0) {
    add('description', t('search.chip.effectText'), filters.description.trim(), { description: '' })
  }

  range('level', t('search.filters.level'))
  range('atk', 'ATK')
  range('def', 'DEF')
  range('scale', t('search.filters.scale'))
  range('year', t('search.filters.year'))

  if (deckFormat === 'genesys') {
    range('genesysPoints', t('search.filters.genesys'))
  }

  return chips
}

/** Lo que el controlador del deck sabe de la búsqueda: los paneles de escritorio y del celular lo reciben agrupado en el estado y las acciones. */
export interface CardSearchSource {
  deckFormat: DeckFormat
  query: string
  status: CardSearchViewState['status']
  visibleSearchResults: ApiCardSearchResult[]
  loadedSearchResultCount: number
  totalSearchResultCount?: number | null
  errorMessage: string
  hasMore: boolean
  isLoadingMore: boolean
  searchFilters: CardSearchFilters
  activeFilterCount: number
  hasSearchCriteria: boolean
  maxedOutSearchResultIds: Set<number>
  onQueryChange: (value: string) => void
  onSearchFiltersChange: (updates: Partial<CardSearchFilters>) => void
  onClearSearchFilters: () => void
  onLoadMoreResults: () => void
}

export function buildCardSearchProps(source: CardSearchSource): { search: CardSearchViewState; actions: CardSearchActions } {
  return {
    search: {
      deckFormat: source.deckFormat,
      query: source.query,
      status: source.status,
      results: source.visibleSearchResults,
      rawResultCount: source.loadedSearchResultCount,
      totalCount: source.totalSearchResultCount ?? null,
      errorMessage: source.errorMessage,
      hasMore: source.hasMore,
      isLoadingMore: source.isLoadingMore,
      filters: source.searchFilters,
      activeFilterCount: source.activeFilterCount,
      hasSearchCriteria: source.hasSearchCriteria,
      maxedOutResultIds: source.maxedOutSearchResultIds,
    },
    actions: {
      onQueryChange: source.onQueryChange,
      onFilterChange: source.onSearchFiltersChange,
      onClearFilters: source.onClearSearchFilters,
      onLoadMore: source.onLoadMoreResults,
    },
  }
}
