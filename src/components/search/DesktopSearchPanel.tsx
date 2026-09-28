import { useEffect, useMemo, useRef, useState, type PointerEvent as ReactPointerEvent } from 'react'

import { formatSearchError } from '../../app/card-search'
import { buildClassicCardPrimaryLine, buildClassicCardStatLine } from '../../app/deck-builder-classic'
import { SEARCH_MIN_QUERY_LENGTH } from '../../app/model'
import { useInfiniteScroll } from '../../app/use-infinite-scroll'
import { CardArt } from '../CardArt'
import { CloseButton, CloseIcon } from '../ui/IconButton'
import { CheckIcon, FilterIcon, PlusIcon } from '../ui/icons'
import { Skeleton } from '../ui/Skeleton'
import { SearchFiltersForm } from './SearchFiltersForm'
import { sortVisibleSearchResults } from './search-model'
import { QUICK_TYPE_OPTIONS, type SearchSortOrder } from './search-options'
import type { CardSearchActions, CardSearchViewState } from './search-types'
import { useSearchFilterContext } from './use-search-filter-context'

interface DesktopSearchPanelProps {
  search: CardSearchViewState
  actions: CardSearchActions
  deckCopyCounts: ReadonlyMap<number, number>
  activeDragSearchCardId: number | null
  selectedCardId: number | null
  onResultClick: (apiCardId: number) => void
  onAddCard: (apiCardId: number) => boolean
  onResultPointerDown: (event: ReactPointerEvent<HTMLElement>, apiCardId: number) => void
}

const SKELETON_COUNT = 12
const ADDED_FEEDBACK_MS = 900

export function DesktopSearchPanel({
  search,
  actions,
  deckCopyCounts,
  activeDragSearchCardId,
  selectedCardId,
  onResultClick,
  onAddCard,
  onResultPointerDown,
}: DesktopSearchPanelProps) {
  const { filters, query, status } = search
  const [filtersOpen, setFiltersOpen] = useState(search.activeFilterCount > 0)
  const [sortOrder, setSortOrder] = useState<SearchSortOrder>('default')
  const resultsRef = useRef<HTMLDivElement | null>(null)
  const inputRef = useRef<HTMLInputElement | null>(null)
  const [lastAddedId, setLastAddedId] = useState<number | null>(null)
  const filterContext = useSearchFilterContext(filters, search.deckFormat, actions.onFilterChange)
  const sortedResults = useMemo(() => sortVisibleSearchResults(search.results, sortOrder), [search.results, sortOrder])

  useEffect(() => {
    resultsRef.current?.scrollTo({ top: 0, behavior: 'auto' })
  }, [search.deckFormat, filters, query, sortOrder])

  useEffect(() => {
    if (lastAddedId === null) {
      return
    }

    const timer = window.setTimeout(() => setLastAddedId(null), ADDED_FEEDBACK_MS)
    return () => window.clearTimeout(timer)
  }, [lastAddedId])

  const handleAdd = (apiCardId: number) => {
    if (onAddCard(apiCardId)) {
      setLastAddedId(apiCardId)
    }
  }

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
            ref={inputRef}
            type="search"
            value={query}
            onChange={(event) => actions.onQueryChange(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === 'Escape' && query.length > 0) {
                event.stopPropagation()
                actions.onQueryChange('')
              }
            }}
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

        <div className="classic-builder-search-type-row" role="group" aria-label="Tipo de carta">
          {QUICK_TYPE_OPTIONS.map((option) => (
            <button
              key={option.value}
              type="button"
              className="classic-builder-search-type-button"
              aria-pressed={filters.quickType === option.value}
              onClick={() => actions.onFilterChange({ quickType: option.value })}
            >
              {option.label}
            </button>
          ))}

          <button
            type="button"
            className="classic-builder-search-type-button classic-builder-search-filters-toggle"
            aria-expanded={filtersOpen}
            aria-controls="advanced-search-filters"
            data-active={filtersOpen || search.activeFilterCount > 0 ? 'true' : 'false'}
            onClick={() => setFiltersOpen((current) => !current)}
          >
            <FilterIcon width={14} height={14} />
            Filtros
            {search.activeFilterCount > 0 ? (
              <span className="classic-builder-search-filters-badge">{search.activeFilterCount}</span>
            ) : null}
          </button>
        </div>

        {!filtersOpen && filterContext.activeFilterChips.length > 0 ? (
          <div className="flex flex-wrap gap-1.5">
            {filterContext.activeFilterChips.map((chip) => (
              <button
                key={chip.key}
                type="button"
                className="search-active-chip"
                onClick={() => actions.onFilterChange(chip.updates)}
                title={`Quitar filtro ${chip.label.toLowerCase()}`}
              >
                <span className="truncate text-(--text-main)">
                  {chip.label}: {chip.value}
                </span>
                <CloseIcon className="h-3 w-3 shrink-0 text-(--text-soft)" />
              </button>
            ))}
          </div>
        ) : null}
      </div>

      <div className="grid min-h-0 flex-1 grid-rows-[auto_minmax(0,1fr)] overflow-hidden">
        {filtersOpen ? (
          <div className="classic-builder-search-filters-shell">
            <SearchFiltersForm
              id="advanced-search-filters"
              layout="desktop"
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
                const copiesInDeck = deckCopyCounts.get(card.ygoprodeckId) ?? 0

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
                      onClick={() => onResultClick(card.ygoprodeckId)}
                      onDoubleClick={() => {
                        if (!isMaxed) {
                          handleAdd(card.ygoprodeckId)
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
                        {copiesInDeck > 0 ? (
                          <span className="classic-builder-search-copies" title={`${copiesInDeck} en el deck`}>
                            ×{copiesInDeck}
                          </span>
                        ) : null}
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

                      <button
                        type="button"
                        className="classic-builder-search-add"
                        data-state={lastAddedId === card.ygoprodeckId ? 'added' : 'idle'}
                        disabled={isMaxed}
                        aria-label={isMaxed ? `${card.name}: máximo de copias` : `Agregar ${card.name} al deck`}
                        title={isMaxed ? 'Máximo de copias' : 'Agregar al deck'}
                        onPointerDown={(event) => event.stopPropagation()}
                        onClick={(event) => {
                          event.stopPropagation()
                          handleAdd(card.ygoprodeckId)
                        }}
                      >
                        {isMaxed ? 'MÁX' : lastAddedId === card.ygoprodeckId ? <CheckIcon width={16} height={16} /> : <PlusIcon width={16} height={16} />}
                      </button>
                    </article>
                  )
                })}

                {search.isLoadingMore ? <DesktopResultSkeleton /> : null}
              </div>
            )
          ) : (
            <div className="grid gap-2 px-3 py-6 text-center text-[0.8rem] leading-snug text-(--text-muted)">
              <p className="m-0 text-[0.9rem] text-(--text-main)">¿Qué carta buscás?</p>
              <p className="m-0">
                Escribí al menos {SEARCH_MIN_QUERY_LENGTH} letras del nombre, o elegí un tipo y abrí “Filtros” para
                buscar por arquetipo, atributo o nivel.
              </p>
            </div>
          )}
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
