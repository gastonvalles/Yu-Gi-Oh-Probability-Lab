import { useEffect, useMemo, useRef, useState, type PointerEvent as ReactPointerEvent } from 'react'

import { formatSearchError } from '../../app/card-search'
import { buildClassicCardPrimaryLine, buildClassicCardStatLine } from '../../app/deck-builder-classic'
import { useInfiniteScroll } from '../../app/use-infinite-scroll'
import { CardArt } from '../CardArt'
import { cx } from '../ui/cx'
import { CloseButton, CloseIcon } from '../ui/IconButton'
import { CheckIcon, FilterIcon, PlusIcon, SearchIcon } from '../ui/icons'
import { Skeleton } from '../ui/Skeleton'
import { SearchEmptyState, SearchResultsToolbar, SearchStart } from './SearchFeedback'
import { SearchFiltersForm } from './SearchFiltersForm'
import { useRecentSearches } from './recent-searches'
import { sortVisibleSearchResults } from './search-model'
import { QUICK_TYPE_OPTIONS, type SearchSortOrder } from './search-options'
import type { CardSearchActions, CardSearchViewState } from './search-types'
import { useSearchFilterContext } from './use-search-filter-context'
import { filterChip, surface } from '../ui/surfaces'

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

const SURFACE_GRADIENT = 'bg-linear-to-b from-secondary/94 to-background/98'

const TYPE_BUTTON = 'border px-[0.85rem] py-[0.44rem] text-small font-bold leading-none text-foreground'

function typeButton(active: boolean): string {
  return cx(
    TYPE_BUTTON,
    SURFACE_GRADIENT,
    active
      ? 'border-primary/48 from-primary/15 to-secondary/96 shadow-[0_0_0_1px_rgb(var(--primary-rgb)/0.08)]'
      : 'border-border',
  )
}

const RESULTS_GRID =
  'grid min-h-0 grid-cols-2 content-start gap-0 border border-border/94 bg-linear-to-b from-secondary/94 to-background/98'

/** Tarjeta de resultado: la elegida y la que ya está al máximo cambian de aspecto. */
function resultCard({ selected, maxed, dragging }: { selected: boolean; maxed: boolean; dragging: boolean }): string {
  return cx(
    'group/card relative grid min-w-0 [contain-intrinsic-size:auto_6.9rem] [content-visibility:auto] cursor-pointer grid-cols-[4.2rem_minmax(0,1fr)] items-start gap-[0.6rem] border-b border-r border-border/94 p-[0.42rem] outline-2 -outline-offset-2 outline-dashed outline-foreground/0 transition-[background,outline-color,border-color] duration-[140ms] nth-[2n]:border-r-0',
    selected
      ? 'bg-linear-to-b from-primary/15 to-secondary/96 shadow-[inset_0_0_0_1px_rgb(var(--primary-rgb)/0.4)]'
      : SURFACE_GRADIENT,
    maxed
      ? 'cursor-not-allowed opacity-45 grayscale'
      : selected
        ? 'hover:outline-primary/85'
        : 'hover:outline-foreground/75',
    dragging && !maxed && 'opacity-35',
  )
}

const ADD_REVEAL =
  'opacity-0 group-hover/card:opacity-100 group-focus-within/card:opacity-100 focus-visible:opacity-100 [@media(hover:none)]:opacity-100'

function addButton(state: 'idle' | 'added' | 'maxed'): string {
  return cx(
    'absolute bottom-[0.4rem] right-[0.4rem] grid h-[1.9rem] min-w-[1.9rem] place-items-center rounded-full border px-[0.4rem] font-bold leading-none transition-[opacity,transform] duration-120 enabled:active:scale-[0.92]',
    state === 'added' && 'border-accent/80 bg-accent text-lead text-[#06140e] opacity-100',
    state === 'idle' && ['border-primary/60 bg-primary/85 text-lead text-white', ADD_REVEAL],
    state === 'maxed' && ['border-border bg-secondary/95 text-micro text-soft', ADD_REVEAL],
  )
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
  const recentSearches = useRecentSearches()

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
      recentSearches.remember(query)
    }
  }

  useInfiniteScroll({
    containerRef: resultsRef,
    canLoadMore: search.hasSearchCriteria && status === 'success' && !search.isLoadingMore && search.hasMore,
    onLoadMore: actions.onLoadMore,
    layoutKey: `${sortedResults.length}:${filtersOpen}`,
  })

  return (
    <article className="flex h-full min-h-0 flex-col overflow-hidden min-[1101px]:h-full">
      <div className="grid gap-[0.65rem] border-b border-border/94 p-[0.7rem]">
        <label className="relative block min-w-0 flex-1">
          <span className="sr-only">Buscar cartas por nombre</span>
          <SearchIcon className="pointer-events-none absolute left-[0.7rem] top-1/2 z-1 -translate-y-1/2 text-soft" />
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
            placeholder="Buscar cartas por nombre"
            autoComplete="off"
            spellCheck={false}
            className="w-full rounded-none border border-border bg-linear-to-b from-input/98 to-background py-[0.66rem] pl-[2.1rem] pr-[2.8rem] text-foreground outline-none transition-[border-color,box-shadow,background] duration-160 hover:from-input-hover/98 focus:border-primary/72 focus:shadow-[0_0_0_1px_rgb(var(--primary-rgb)/0.16)] [&::-webkit-search-cancel-button]:hidden"
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

        <div className="flex flex-wrap gap-[0.45rem]" role="group" aria-label="Tipo de carta">
          {QUICK_TYPE_OPTIONS.map((option) => (
            <button
              key={option.value}
              type="button"
              className={typeButton(filters.quickType === option.value)}
              aria-pressed={filters.quickType === option.value}
              onClick={() => actions.onFilterChange({ quickType: option.value })}
            >
              {option.label}
            </button>
          ))}

          <button
            type="button"
            className={cx(typeButton(filtersOpen || search.activeFilterCount > 0), 'ml-auto inline-flex items-center gap-[0.35rem]')}
            aria-expanded={filtersOpen}
            aria-controls="advanced-search-filters"
            onClick={() => setFiltersOpen((current) => !current)}
          >
            <FilterIcon width={14} height={14} />
            Filtros
            {search.activeFilterCount > 0 ? (
              <span className="grid h-[1.1rem] min-w-[1.1rem] place-items-center rounded-full bg-primary px-1 text-micro font-extrabold text-white">{search.activeFilterCount}</span>
            ) : null}
          </button>
        </div>

        {!filtersOpen && filterContext.activeFilterChips.length > 0 ? (
          <div className="flex flex-wrap gap-1.5">
            {filterContext.activeFilterChips.map((chip) => (
              <button
                key={chip.key}
                type="button"
                className={filterChip}
                onClick={() => actions.onFilterChange(chip.updates)}
                title={`Quitar filtro ${chip.label.toLowerCase()}`}
              >
                <span className="truncate text-foreground">
                  {chip.label}: {chip.value}
                </span>
                <CloseIcon className="h-3 w-3 shrink-0 text-soft" />
              </button>
            ))}
          </div>
        ) : null}
      </div>

      <div className="grid min-h-0 flex-1 grid-rows-[auto_minmax(0,1fr)] overflow-hidden">
        {filtersOpen ? (
          <div className="max-h-[min(22rem,45vh)] overflow-y-auto border-b border-border/94 p-[0.7rem] [scrollbar-width:thin]">
            <SearchFiltersForm
              id="advanced-search-filters"
              layout="desktop"
              filters={filters}
              context={filterContext}
              activeFilterCount={search.activeFilterCount}
              onFilterChange={actions.onFilterChange}
              onClearFilters={actions.onClearFilters}
            />
          </div>
        ) : null}

        <div className="grid min-h-0 grid-rows-[minmax(0,1fr)] overflow-hidden">
          {search.hasSearchCriteria ? (
            status === 'error' ? (
              <p className={`${surface.cardDanger} m-0 px-2 py-1.5 text-small text-destructive`}>
                {formatSearchError(search.errorMessage)}
              </p>
            ) : status === 'loading' ? (
              <div className={cx(RESULTS_GRID, 'h-full overflow-y-auto [scrollbar-gutter:stable] [scrollbar-width:thin]')}>
                {Array.from({ length: SKELETON_COUNT }, (_, index) => (
                  <DesktopResultSkeleton key={index} />
                ))}
              </div>
            ) : sortedResults.length === 0 ? (
              <SearchEmptyState
                layout="desktop"
                isStillLoading={search.rawResultCount > 0 && search.hasMore}
                activeFilterCount={search.activeFilterCount}
                hasQuery={query.trim().length > 0}
                onClearFilters={actions.onClearFilters}
                onClearQuery={() => actions.onQueryChange('')}
              />
            ) : (
              <div ref={resultsRef} className="h-full min-h-0 overflow-y-auto [scrollbar-width:thin]">
              <SearchResultsToolbar
                count={sortedResults.length}
                hasMore={search.hasMore}
                sortOrder={sortOrder}
                onSortOrderChange={setSortOrder}
              />
              <div className={cx(RESULTS_GRID, 'h-auto overflow-visible')}>
                {sortedResults.map((card) => {
                  const isMaxed = search.maxedOutResultIds.has(card.ygoprodeckId)
                const copiesInDeck = deckCopyCounts.get(card.ygoprodeckId) ?? 0

                  return (
                    <article
                      key={card.ygoprodeckId}
                      aria-disabled={isMaxed}
                      title={isMaxed ? 'Ya alcanzaste el máximo de copias de esta carta.' : undefined}
                      className={resultCard({
                        selected: selectedCardId === card.ygoprodeckId,
                        maxed: isMaxed,
                        dragging: activeDragSearchCardId === card.ygoprodeckId,
                      })}
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
                      <div className="relative w-[4.2rem]" data-drag-preview-source="true">
                        <CardArt
                          remoteUrl={card.imageUrlSmall ?? card.imageUrl}
                          name={card.name}
                          className="aspect-[0.72] w-[4.2rem]"
                          limitCard={card}
                          limitBadgeSize="sm"
                        />
                        {copiesInDeck > 0 ? (
                          <span
                            className="absolute -bottom-[0.3rem] -right-[0.3rem] rounded-full bg-accent px-[0.32rem] py-[0.05rem] text-micro font-extrabold text-[#06140e]"
                            title={`${copiesInDeck} en el deck`}>
                            ×{copiesInDeck}
                          </span>
                        ) : null}
                      </div>

                      <div className="grid min-w-0 content-start gap-[0.2rem] pt-[0.08rem]">
                        <strong className="text-small wrap-anywhere text-foreground">
                          {card.name}
                        </strong>
                        <p className="m-0 text-caption wrap-anywhere text-foreground">
                          {buildClassicCardPrimaryLine(card)}
                        </p>
                        <p className="m-0 text-caption wrap-anywhere text-foreground">
                          {buildClassicCardStatLine(card)}
                        </p>
                      </div>

                      <button
                        type="button"
                        className={addButton(isMaxed ? 'maxed' : lastAddedId === card.ygoprodeckId ? 'added' : 'idle')}
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
              </div>
            )
          ) : (
            <SearchStart
              layout="desktop"
              recent={recentSearches.recent}
              onPickRecent={(recentQuery) => {
                actions.onQueryChange(recentQuery)
                inputRef.current?.focus()
              }}
              onClearRecent={recentSearches.clear}
            />
          )}
        </div>
      </div>
    </article>
  )
}

function DesktopResultSkeleton() {
  return (
    <div className={resultCard({ selected: false, maxed: false, dragging: false })} aria-hidden="true">
      <Skeleton radius="none" className="aspect-[0.72] w-[4.2rem]" />
      <div className="grid gap-2">
        <Skeleton className="h-3.5 w-[85%]" />
        <Skeleton className="h-2.5 w-[62%]" />
      </div>
    </div>
  )
}
