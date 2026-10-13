import { useEffect, useMemo, useRef, useState, type PointerEvent as ReactPointerEvent } from 'react'

import { formatSearchError } from '../../app/card-search'
import { buildClassicCardPrimaryLine, buildClassicCardStatLine } from '../../app/deck-builder-classic'
import { useInfiniteScroll } from '../../app/use-infinite-scroll'
import { t } from '../../i18n'
import { CardArt } from '../CardArt'
import { cx } from '../ui/cx'
import { CloseButton, CloseIcon } from '../ui/IconButton'
import { Icon } from '../ui/Icon'
import { Skeleton } from '../ui/Skeleton'
import { SearchEmptyState, SearchResultsToolbar, SearchStart } from './SearchFeedback'
import { SearchFiltersForm } from './SearchFiltersForm'
import { useRecentSearches } from './recent-searches'
import { sortVisibleSearchResults } from './search-model'
import { QUICK_TYPE_OPTIONS, type SearchSortOrder } from './search-options'
import type { CardSearchActions, CardSearchViewState } from './search-types'
import { useSearchFilterContext } from './use-search-filter-context'
import { Callout } from '../ui/Callout'
import { CopiesBadge } from '../ui/CopiesBadge'
import { choiceChip, field, filterChip } from '../ui/surfaces'

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

const TYPE_BUTTON = `${choiceChip} px-3.5 py-1.5 text-body leading-none`

const RESULTS_GRID = 'grid min-h-0 grid-cols-2 content-start gap-2 p-2'

/** Tarjeta de resultado: la elegida y la que ya está al máximo cambian de aspecto. */
function resultCard({ selected, maxed, dragging }: { selected: boolean; maxed: boolean; dragging: boolean }): string {
  return cx(
    'group/card relative grid min-w-0 [contain-intrinsic-size:auto_6.9rem] [content-visibility:auto] cursor-pointer grid-cols-[4.2rem_minmax(0,1fr)] items-start gap-2.5 rounded-control p-2 transition-colors duration-150',
    selected ? 'bg-primary/20' : 'hover:bg-tint/7',
    maxed && 'cursor-not-allowed opacity-45 grayscale',
    dragging && !maxed && 'opacity-35',
  )
}

const ADD_REVEAL =
  'opacity-0 group-hover/card:opacity-100 group-focus-within/card:opacity-100 focus-visible:opacity-100 [@media(hover:none)]:opacity-100'

function addButton(state: 'idle' | 'added' | 'maxed'): string {
  return cx(
    'absolute bottom-2 right-2 grid h-8 min-w-8 place-items-center rounded-full border px-2 font-bold leading-none transition-[opacity,transform,background-color] duration-150 focus-visible:outline-none focus-visible:shadow-focus enabled:active:scale-[0.92]',
    state === 'added' && 'border-success/80 bg-success text-lead text-accent-foreground opacity-100',
    state === 'idle' && ['border-primary/60 bg-primary text-lead text-white hover:bg-primary-hover', ADD_REVEAL],
    state === 'maxed' && ['border-border-subtle bg-card-background text-micro text-soft', ADD_REVEAL],
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
      <div className="grid gap-3 border-b border-border-subtle p-3">
        <label className="relative block min-w-0 flex-1">
          <span className="sr-only">{t('search.desktop.searchByName')}</span>
          <Icon name="search" size={16} className="pointer-events-none absolute left-3 top-1/2 z-1 -translate-y-1/2 text-soft" />
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
            placeholder={t('search.desktop.searchByName')}
            autoComplete="off"
            spellCheck={false}
            className={`${field} h-10 w-full pl-9 pr-11 text-body [&::-webkit-search-cancel-button]:hidden`}
          />
          {query.trim().length > 0 ? (
            <CloseButton
              size="sm"
              aria-label={t('search.desktop.clearSearch')}
              className="absolute right-2 top-1/2 -translate-y-1/2"
              onClick={() => actions.onQueryChange('')}
            />
          ) : null}
          {status === 'loading' ? (
            <span className="pointer-events-none absolute right-11 top-1/2 -mt-2 size-4 animate-spin rounded-full border-2 border-foreground/20 border-t-primary" />
          ) : null}
        </label>

        <div className="flex flex-wrap gap-2" role="group" aria-label={t('search.label.cardType')}>
          {QUICK_TYPE_OPTIONS.map((option) => (
            <button
              key={option.value}
              type="button"
              className={TYPE_BUTTON}
              aria-pressed={filters.quickType === option.value}
              onClick={() => actions.onFilterChange({ quickType: option.value })}
            >
              {option.label}
            </button>
          ))}

          <button
            type="button"
            className={cx(TYPE_BUTTON, 'ml-auto gap-1.5')}
            aria-pressed={filtersOpen || search.activeFilterCount > 0}
            aria-expanded={filtersOpen}
            aria-controls="advanced-search-filters"
            title={t('search.filters.title')}
            onClick={() => setFiltersOpen((current) => !current)}
          >
            <Icon name="sliders" size={14} />
            <span className="sr-only">{t('search.filters.title')}</span>
            {search.activeFilterCount > 0 ? (
              <span className="grid h-4.5 min-w-4.5 place-items-center rounded-full bg-primary px-1 text-micro font-bold text-white">{search.activeFilterCount}</span>
            ) : null}
          </button>
        </div>

        {!filtersOpen && filterContext.activeFilterChips.length > 0 ? (
          <div className="flex flex-wrap gap-1.5">
            {filterContext.activeFilterChips.map((chip) => (
              <button
                key={chip.key}
                type="button"
                className={`${filterChip} group/chip`}
                onClick={() => actions.onFilterChange(chip.updates)}
                title={t('search.chip.removeTitle', { label: chip.label.toLowerCase() })}
              >
                <span className="truncate text-foreground">
                  {chip.label}: {chip.value}
                </span>
                <CloseIcon className="h-3 w-3 shrink-0 text-white transition-colors duration-150 group-hover/chip:text-success" />
              </button>
            ))}
          </div>
        ) : null}
      </div>

      <div className="grid min-h-0 flex-1 grid-rows-[auto_minmax(0,1fr)] overflow-hidden">
        {filtersOpen ? (
          <div className="max-h-[min(22rem,45vh)] overflow-y-auto border-b border-border-subtle p-3 [scrollbar-width:thin]">
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
              <Callout tone="danger" className="m-3">
                {formatSearchError(search.errorMessage)}
              </Callout>
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
                      title={isMaxed ? t('search.result.maxedTitle') : undefined}
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
                        {copiesInDeck > 0 ? <CopiesBadge copies={copiesInDeck} placement="overlay" label={t('search.result.inDeck', { copies: copiesInDeck })} /> : null}
                      </div>

                      <div className="grid min-w-0 content-start gap-0.5">
                        <strong className="text-body font-semibold leading-tight wrap-anywhere text-foreground">
                          {card.name}
                        </strong>
                        <p className="m-0 text-micro wrap-anywhere text-muted">
                          {buildClassicCardPrimaryLine(card)}
                        </p>
                        <p className="m-0 text-micro wrap-anywhere text-muted">
                          {buildClassicCardStatLine(card)}
                        </p>
                      </div>

                      <button
                        type="button"
                        className={addButton(isMaxed ? 'maxed' : lastAddedId === card.ygoprodeckId ? 'added' : 'idle')}
                        disabled={isMaxed}
                        aria-label={isMaxed ? t('search.result.maxedAria', { name: card.name }) : t('search.result.addAria', { name: card.name })}
                        title={isMaxed ? t('search.result.maxedShort') : t('search.result.addTitle')}
                        onPointerDown={(event) => event.stopPropagation()}
                        onClick={(event) => {
                          event.stopPropagation()
                          handleAdd(card.ygoprodeckId)
                        }}
                      >
                        {isMaxed ? t('search.result.maxBadge') : lastAddedId === card.ygoprodeckId ? <Icon name="check" size={16} strokeWidth={2} /> : <Icon name="plus" size={16} strokeWidth={2} />}
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
