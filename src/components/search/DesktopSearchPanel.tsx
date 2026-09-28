import { useEffect, useMemo, useRef, useState, type PointerEvent as ReactPointerEvent } from 'react'

import { formatSearchError } from '../../app/card-search'
import { buildClassicCardPrimaryLine, buildClassicCardStatLine } from '../../app/deck-builder-classic'
import { useInfiniteScroll } from '../../app/use-infinite-scroll'
import { CardArt } from '../CardArt'
import { CloseButton } from '../ui/IconButton'
import { Skeleton } from '../ui/Skeleton'
import { SearchFiltersForm } from './SearchFiltersForm'
import { sortVisibleSearchResults } from './search-model'
import type { SearchSortOrder } from './search-options'
import type { CardSearchActions, CardSearchViewState } from './search-types'
import { useSearchFilterContext } from './use-search-filter-context'

interface DesktopSearchPanelProps {
  search: CardSearchViewState
  actions: CardSearchActions
  activeDragSearchCardId: number | null
  selectedCardId: number | null
  onResultClick: (apiCardId: number) => void
  onResultPointerDown: (event: ReactPointerEvent<HTMLElement>, apiCardId: number) => void
}

const SKELETON_COUNT = 12

export function DesktopSearchPanel({
  search,
  actions,
  activeDragSearchCardId,
  selectedCardId,
  onResultClick,
  onResultPointerDown,
}: DesktopSearchPanelProps) {
  const { filters, query, status } = search
  const [filtersOpen, setFiltersOpen] = useState(search.activeFilterCount > 0)
  const [sortOrder, setSortOrder] = useState<SearchSortOrder>('default')
  const resultsRef = useRef<HTMLDivElement | null>(null)
  const filterContext = useSearchFilterContext(filters, search.deckFormat, actions.onFilterChange)
  const sortedResults = useMemo(() => sortVisibleSearchResults(search.results, sortOrder), [search.results, sortOrder])

  useEffect(() => {
    resultsRef.current?.scrollTo({ top: 0, behavior: 'auto' })
  }, [search.deckFormat, filters, query, sortOrder])

  useInfiniteScroll({
    containerRef: resultsRef,
    canLoadMore: search.hasSearchCriteria && status === 'success' && !search.isLoadingMore && search.hasMore,
    onLoadMore: actions.onLoadMore,
    layoutKey: `${sortedResults.length}:${filtersOpen}`,
  })

  return (
    <article className="classic-builder-search-panel flex h-full min-h-0 flex-col overflow-hidden min-[1101px]:h-full">
      <div className="classic-builder-search-header">
        <label className="relative block min-w-0 flex-1">
          <input
            type="search"
            value={query}
            onChange={(event) => actions.onQueryChange(event.target.value)}
            placeholder="Buscar cartas"
            autoComplete="off"
            spellCheck={false}
            className="classic-builder-search-input"
          />
          {query.trim().length > 0 ? (
            <CloseButton
              size="sm"
              aria-label="Limpiar búsqueda"
              className="absolute right-2 top-1/2 -translate-y-1/2"
              onClick={() => actions.onQueryChange('')}
            />
          ) : null}
          {status === 'loading' ? (
            <span className="pointer-events-none absolute right-10 top-1/2 -mt-[0.475rem] h-[0.95rem] w-[0.95rem] animate-spin rounded-full border-2 border-[rgb(var(--foreground-rgb)/0.18)] border-t-primary" />
          ) : null}
        </label>

        <button
          type="button"
          className="classic-builder-search-toggle"
          aria-expanded={filtersOpen}
          aria-controls="advanced-search-filters"
          onClick={() => setFiltersOpen((current) => !current)}
        >
          {filtersOpen ? '↑ Ocultar filtros ↑' : '↓ Mostrar filtros ↓'}
        </button>
      </div>

      <div className="grid min-h-0 flex-1 grid-rows-[auto_minmax(0,1fr)] overflow-hidden">
        {filtersOpen ? (
          <div className="classic-builder-search-filters-shell">
            <SearchFiltersForm
              id="advanced-search-filters"
              layout="desktop"
              className="classic-builder-search-filters"
              filters={filters}
              context={filterContext}
              activeFilterCount={search.activeFilterCount}
              sortOrder={sortOrder}
              onSortOrderChange={setSortOrder}
              onFilterChange={actions.onFilterChange}
              onClearFilters={actions.onClearFilters}
            />
          </div>
        ) : null}

        <div className="classic-builder-search-results-shell">
          {search.hasSearchCriteria ? (
            status === 'error' ? (
              <p className="surface-card-danger m-0 px-2 py-1.5 text-[0.78rem] leading-[1.16] text-destructive">
                {formatSearchError(search.errorMessage)}
              </p>
            ) : status === 'loading' ? (
              <div className="classic-builder-search-results-grid">
                {Array.from({ length: SKELETON_COUNT }, (_, index) => (
                  <DesktopResultSkeleton key={index} />
                ))}
              </div>
            ) : sortedResults.length === 0 ? (
              <div className="surface-card grid gap-1 px-2 py-2 text-[0.76rem] leading-[1.18] text-(--text-muted)">
                <p className="m-0">
                  {search.rawResultCount > 0
                    ? 'Todavía no apareció una coincidencia dentro de lo ya cargado.'
                    : 'No se encontraron cartas con esos criterios.'}
                </p>
                <p className="m-0 text-[0.68rem] leading-[1.14]">
                  {search.hasMore
                    ? 'Se cargarán más tandas automáticamente al seguir explorando.'
                    : 'Ya no quedan más tandas disponibles.'}
                </p>
              </div>
            ) : (
              <div ref={resultsRef} className="classic-builder-search-results-grid">
                {sortedResults.map((card) => {
                  const isMaxed = search.maxedOutResultIds.has(card.ygoprodeckId)

                  return (
                    <article
                      key={card.ygoprodeckId}
                      data-selected={selectedCardId === card.ygoprodeckId ? 'true' : 'false'}
                      data-maxed={isMaxed ? 'true' : 'false'}
                      aria-disabled={isMaxed}
                      title={isMaxed ? 'Ya alcanzaste el máximo de copias de esta carta.' : undefined}
                      className={[
                        'classic-builder-search-result-card',
                        activeDragSearchCardId === card.ygoprodeckId ? 'opacity-35' : '',
                      ].join(' ')}
                      onClick={() => {
                        if (!isMaxed) {
                          onResultClick(card.ygoprodeckId)
                        }
                      }}
                      onPointerDown={(event) => {
                        if (!isMaxed) {
                          onResultPointerDown(event, card.ygoprodeckId)
                        }
                      }}
                    >
                      <div className="classic-builder-search-result-art-shell" data-drag-preview-source="true">
                        <CardArt
                          remoteUrl={card.imageUrlSmall ?? card.imageUrl}
                          name={card.name}
                          className="classic-builder-search-result-art"
                          limitCard={card}
                          limitBadgeSize="sm"
                        />
                      </div>

                      <div className="classic-builder-search-result-copy">
                        <strong className="text-[0.8rem] leading-[1.08] wrap-break-word text-(--text-main)">
                          {card.name}
                        </strong>
                        <p className="m-0 text-[0.72rem] leading-[1.08] wrap-break-word text-(--text-main)">
                          {buildClassicCardPrimaryLine(card)}
                        </p>
                        <p className="m-0 text-[0.72rem] leading-[1.08] wrap-break-word text-(--text-main)">
                          {buildClassicCardStatLine(card)}
                        </p>
                      </div>
                    </article>
                  )
                })}

                {search.isLoadingMore ? <DesktopResultSkeleton /> : null}
              </div>
            )
          ) : null}
        </div>
      </div>
    </article>
  )
}

function DesktopResultSkeleton() {
  return (
    <div className="classic-builder-search-result-card" aria-hidden="true">
      <Skeleton radius="none" className="classic-builder-search-result-skeleton-art" />
      <div className="grid gap-2">
        <Skeleton className="h-3.5 w-[85%]" />
        <Skeleton className="h-2.5 w-[62%]" />
      </div>
    </div>
  )
}
