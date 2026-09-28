import type { CardSearchFilters } from '../../app/card-search'
import type { DeckFormat } from '../../types'
import type { ApiCardSearchResult } from '../../ygoprodeck'

/** Estado de la búsqueda que muestran los paneles de desktop y mobile. */
export interface CardSearchViewState {
  deckFormat: DeckFormat
  query: string
  status: 'idle' | 'loading' | 'success' | 'error'
  results: ApiCardSearchResult[]
  rawResultCount: number
  errorMessage: string
  hasMore: boolean
  isLoadingMore: boolean
  filters: CardSearchFilters
  activeFilterCount: number
  hasSearchCriteria: boolean
  maxedOutResultIds: Set<number>
}

export interface CardSearchActions {
  onQueryChange: (value: string) => void
  onFilterChange: (updates: Partial<CardSearchFilters>) => void
  onClearFilters: () => void
  onLoadMore: () => void
}
