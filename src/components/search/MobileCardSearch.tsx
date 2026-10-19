import { memo, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'

import { useFocusTrap } from '../../app/use-focus-trap'
import { useBodyScrollLock, useEscapeKey } from '../../app/use-overlay'

import { buildCompactSearchDescription, formatSearchError } from '../../app/card-search'
import { buildFormatLimitLabel, getCardCopyLimit } from '../../app/deck-format'
import type { DeckZone } from '../../app/model'
import { useInfiniteScroll } from '../../app/use-infinite-scroll'
import { formatInteger } from '../../app/utils'
import { t } from '../../i18n'
import type { DeckFormat } from '../../types'
import type { ApiCardSearchResult } from '../../ygoprodeck'
import { CardArt } from '../CardArt'
import { Button } from '../ui/Button'
import { CloseIcon, IconButton } from '../ui/IconButton'
import { Icon } from '../ui/Icon'
import { cx } from '../ui/cx'
import { Skeleton } from '../ui/Skeleton'
import { SearchEmptyState, SearchResultsToolbar, SearchStart } from './SearchFeedback'
import { SearchFiltersDrawer } from './SearchFiltersDrawer'
import { SearchFiltersToggle } from './SearchFiltersToggle'
import { useRecentSearches } from './recent-searches'
import { sortVisibleSearchResults } from './search-model'
import type { SearchSortOrder } from './search-options'
import type { CardSearchActions, CardSearchViewState } from './search-types'
import { useSearchFilterContext } from './use-search-filter-context'
import { Callout } from '../ui/Callout'
import { field, filterChip } from '../ui/surfaces'

interface MobileCardSearchProps {
  search: CardSearchViewState
  actions: CardSearchActions
  deckCopyCounts: ReadonlyMap<number, number>
  zoneCounts: Record<DeckZone, number>
  onAddCard: (apiCardId: number) => boolean
  onOpenDetail: (apiCardId: number) => void
  onClose: () => void
}

const CHIP_ROW = '-mx-3 flex gap-2 overflow-x-auto px-3 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden'
const ROW = '[contain-intrinsic-size:auto_4.9rem] [content-visibility:auto] flex items-center gap-2 rounded-control p-2'
const ROW_MAIN = 'flex min-w-0 flex-1 items-center gap-3 border-0 bg-transparent p-0 text-inherit [-webkit-tap-highlight-color:transparent]'
const ADDED_FEEDBACK_MS = 900
const SKELETON_COUNT = 8

export function MobileCardSearch({
  search,
  actions,
  deckCopyCounts,
  zoneCounts,
  onAddCard,
  onOpenDetail,
  onClose,
}: MobileCardSearchProps) {
  const rootRef = useRef<HTMLDivElement | null>(null)
  useBodyScrollLock(true)
  useEscapeKey(onClose)
  useFocusTrap(rootRef)
  const { filters, query, status } = search
  const [filtersOpen, setFiltersOpen] = useState(false)
  const [sortOrder, setSortOrder] = useState<SearchSortOrder>('default')
  const [lastAdded, setLastAdded] = useState<{ id: number; name: string } | null>(null)
  const inputRef = useRef<HTMLInputElement | null>(null)
  const resultsRef = useRef<HTMLDivElement | null>(null)
  const filterContext = useSearchFilterContext(filters, search.deckFormat)
  const sortedResults = useMemo(() => sortVisibleSearchResults(search.results, sortOrder), [search.results, sortOrder])
  const showResults = search.hasSearchCriteria
  const recentSearches = useRecentSearches()

  useEffect(() => {
    resultsRef.current?.scrollTo({ top: 0, behavior: 'auto' })
  }, [search.deckFormat, filters, query, sortOrder])

  useEffect(() => {
    if (!lastAdded) {
      return
    }

    const timer = window.setTimeout(() => setLastAdded(null), ADDED_FEEDBACK_MS)
    return () => window.clearTimeout(timer)
  }, [lastAdded])

  useInfiniteScroll({
    containerRef: resultsRef,
    canLoadMore: showResults && status === 'success' && !search.isLoadingMore && search.hasMore,
    onLoadMore: actions.onLoadMore,
    layoutKey: sortedResults.length,
  })

  const handleAdd = (card: ApiCardSearchResult) => {
    if (onAddCard(card.ygoprodeckId)) {
      setLastAdded({ id: card.ygoprodeckId, name: card.name })
      recentSearches.remember(query)
    }
  }

  // Los callbacks del padre cambian en cada render: las filas (con `memo`) reciben estas funciones fijas, que leen siempre los últimos.
  const latest = useRef({ onOpenDetail, handleAdd })
  useLayoutEffect(() => {
    latest.current = { onOpenDetail, handleAdd }
  })
  const openDetail = useCallback((apiCardId: number) => latest.current.onOpenDetail(apiCardId), [])
  const addCard = useCallback((card: ApiCardSearchResult) => latest.current.handleAdd(card), [])

  // Al empezar a scrollear la lista se oculta el teclado para liberar pantalla.
  const dismissKeyboard = () => {
    if (document.activeElement === inputRef.current) {
      inputRef.current?.blur()
    }
  }

  // Portal: el paso del builder está dentro de un contenedor animado con
  // transform, que atraparía el z-index debajo de la navegación inferior.
  return createPortal(
    <div
      ref={rootRef}
      tabIndex={-1}
      role="dialog"
      aria-modal="true"
      aria-label={t('search.mobile.dialog')}
      className="fixed inset-0 z-140 flex h-dvh w-full flex-col overflow-hidden bg-background outline-none min-[1101px]:hidden"
    >
      <header className="grid gap-2 border-b border-border-subtle px-3 pb-2 pt-[max(0.6rem,env(safe-area-inset-top))]">
        <form
          role="search"
          className="flex items-center gap-2"
          onSubmit={(event) => {
            event.preventDefault()
            inputRef.current?.blur()
          }}
        >
          <IconButton size="lg" aria-label={t('search.mobile.back')} onClick={onClose}>
            <Icon name="chevron-left" />
          </IconButton>

          <label className="relative block min-w-0 flex-1">
            <span className="sr-only">{t('search.mobile.inputLabel')}</span>
            <Icon name="search" size={16} className="pointer-events-none absolute left-3 top-1/2 z-1 -translate-y-1/2 text-soft" />
            <input
              ref={inputRef}
              type="search"
              enterKeyHint="search"
              value={query}
              onChange={(event) => actions.onQueryChange(event.target.value)}
              placeholder={t('search.mobile.placeholder')}
              autoComplete="off"
              autoCorrect="off"
              autoCapitalize="none"
              spellCheck={false}
              autoFocus
              data-initial-focus
              className={`${field} h-11 w-full pl-9 pr-11 text-base [-webkit-appearance:none] [appearance:none] [&::-webkit-search-cancel-button]:hidden`}
            />
            {status === 'loading' ? (
              <span className="pointer-events-none absolute right-11 top-1/2 -mt-2 size-4 animate-spin rounded-full border-2 border-foreground/20 border-t-primary" />
            ) : null}
            {query.length > 0 ? (
              <button
                type="button"
                aria-label={t('search.clearText')}
                className="absolute right-0 top-0 grid h-11 w-11 place-items-center text-white transition-colors duration-150 hover:text-accent focus-visible:text-accent focus-visible:outline-none"
                onClick={() => {
                  actions.onQueryChange('')
                  inputRef.current?.focus()
                }}
              >
                <CloseIcon className="h-4 w-4" />
              </button>
            ) : null}
          </label>

          <SearchFiltersToggle open={filtersOpen} activeCount={search.activeFilterCount} className="size-11" onToggle={() => setFiltersOpen((current) => !current)} />
        </form>

        {/* Sólo cuando hay filtros puestos: cuáles son, cada uno con su forma de quitarlo. Sin filtros, el encabezado es el campo y el botón. */}
        {filterContext.activeFilterChips.length > 0 ? (
          <div className={CHIP_ROW}>
            {filterContext.activeFilterChips.map((chip) => (
              <button
                key={chip.key}
                type="button"
                className={`${filterChip} group/chip min-h-9`}
                onClick={() => actions.onFilterChange(chip.updates)}
                aria-label={t('search.chip.removeAria', { label: chip.label, value: chip.value })}
              >
                <span className="truncate text-foreground">
                  {chip.label}: {chip.value}
                </span>
                <CloseIcon className="h-3 w-3 shrink-0 text-white transition-colors duration-150 group-hover/chip:text-accent" />
              </button>
            ))}
          </div>
        ) : null}
      </header>

      <div
          ref={resultsRef}
          className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-3 py-2"
          onTouchStart={dismissKeyboard}
        >
          {!search.hasSearchCriteria ? (
            <SearchStart
              layout="mobile"
              recent={recentSearches.recent}
              onPickRecent={actions.onQueryChange}
              onClearRecent={recentSearches.clear}
            />
          ) : status === 'error' ? (
            <Callout tone="danger">{formatSearchError(search.errorMessage)}</Callout>
          ) : status === 'loading' ? (
            <ul className="m-0 grid list-none gap-2 p-0" aria-busy="true">
              {Array.from({ length: SKELETON_COUNT }, (_, index) => (
                <MobileResultSkeleton key={index} />
              ))}
            </ul>
          ) : sortedResults.length === 0 ? (
            <SearchEmptyState
              layout="mobile"
              isStillLoading={search.rawResultCount > 0 && search.hasMore}
              activeFilterCount={search.activeFilterCount}
              hasQuery={query.trim().length > 0}
              onClearFilters={actions.onClearFilters}
              onClearQuery={() => {
                actions.onQueryChange('')
                inputRef.current?.focus()
              }}
            />
          ) : (
            <>
              <SearchResultsToolbar
                layout="mobile"
                count={search.totalCount ?? sortedResults.length}
                hasMore={search.totalCount == null && search.hasMore}
                sortOrder={sortOrder}
                onSortOrderChange={setSortOrder}
                hint={t('search.mobile.detailHint')}
              />
              <ul className="m-0 grid list-none gap-2 p-0">
                {sortedResults.map((card) => (
                  <MobileResultRow
                    key={card.ygoprodeckId}
                    card={card}
                    copiesInDeck={deckCopyCounts.get(card.ygoprodeckId) ?? 0}
                    isMaxed={search.maxedOutResultIds.has(card.ygoprodeckId)}
                    justAdded={lastAdded?.id === card.ygoprodeckId}
                    deckFormat={search.deckFormat}
                    onOpenDetail={openDetail}
                    onAdd={addCard}
                  />
                ))}
                {search.isLoadingMore ? <MobileResultSkeleton /> : null}
              </ul>
              {search.hasMore && !search.isLoadingMore ? (
                <Button variant="secondary" size="md" fullWidth className="mt-2" onClick={actions.onLoadMore}>
                  {t('search.mobile.loadMore')}
                </Button>
              ) : null}
            </>
          )}
        </div>

      <SearchFiltersDrawer
        isOpen={filtersOpen}
        onClose={() => setFiltersOpen(false)}
        filters={filters}
        deckFormat={search.deckFormat}
        activeFilterCount={search.activeFilterCount}
        resultCount={search.hasSearchCriteria && status === 'success' ? (search.totalCount ?? sortedResults.length) : null}
        hasMore={search.totalCount == null && search.hasMore}
        onFilterChange={actions.onFilterChange}
        onClearFilters={actions.onClearFilters}
      />

      <footer className="flex items-center gap-3 border-t border-border-subtle px-3 pb-[max(0.6rem,env(safe-area-inset-bottom))] pt-2">
        <p className="m-0 min-w-0 flex-1 text-body leading-tight text-muted" aria-live="polite">
          {lastAdded ? (
            <span className="text-foreground">{t('search.mobile.added', { name: lastAdded.name })}</span>
          ) : (
            <>
              Main <strong className="text-foreground">{formatInteger(zoneCounts.main)}</strong> · Extra{' '}
              <strong className="text-foreground">{formatInteger(zoneCounts.extra)}</strong> · Side{' '}
              <strong className="text-foreground">{formatInteger(zoneCounts.side)}</strong>
            </>
          )}
        </p>
        <Button variant="primary" size="md" onClick={onClose}>
          {t('search.mobile.done')}
        </Button>
      </footer>
    </div>,
    document.body,
  )
}

interface MobileResultRowProps {
  card: ApiCardSearchResult
  copiesInDeck: number
  isMaxed: boolean
  justAdded: boolean
  deckFormat: DeckFormat
  onOpenDetail: (apiCardId: number) => void
  onAdd: (card: ApiCardSearchResult) => void
}

/** Un resultado de la lista. Con `memo`, tocar "+" (y el aviso de agregada que se apaga) sólo vuelve a dibujar la fila que cambia. */
const MobileResultRow = memo(function MobileResultRow({
  card,
  copiesInDeck,
  isMaxed,
  justAdded,
  deckFormat,
  onOpenDetail,
  onAdd,
}: MobileResultRowProps) {
  const formatLimitLabel = buildFormatLimitLabel(card, deckFormat)
  const copyLimit = getCardCopyLimit(card, deckFormat)
  // «N de M» ya dice el límite de copias: la etiqueta del formato sólo queda donde dice otra cosa (los puntos de Genesys o «prohibida»).
  const showFormatLabel = formatLimitLabel !== null && (deckFormat === 'genesys' || copyLimit === 0)

  return (
    <li className={ROW}>
      <button type="button" className={cx(ROW_MAIN, isMaxed && 'opacity-55')} onClick={() => onOpenDetail(card.ygoprodeckId)}>
        <span className="relative w-13 shrink-0">
          <CardArt
            tilt
            remoteUrl={card.imageUrlSmall ?? card.imageUrl}
            name={card.name}
            className="block aspect-[0.72] w-13 bg-input object-cover"
            limitCard={card}
            limitBadgeSize="sm"
          />
        </span>
        <span className="grid min-w-0 gap-0.5 text-left">
          <strong className="text-body font-semibold leading-tight wrap-anywhere text-foreground">{card.name}</strong>
          <span className="text-micro leading-tight wrap-anywhere text-muted">
            {buildCompactSearchDescription(card)}
          </span>
          {showFormatLabel ? <span className="text-micro text-soft">{formatLimitLabel}</span> : null}
        </span>
      </button>

      <span className={cx('shrink-0 text-micro tabular-nums', isMaxed ? 'text-muted' : 'text-soft')}>{t('search.result.copies', { copies: copiesInDeck, limit: copyLimit })}</span>

      <button
        type="button"
        className={cx(
          'grid size-11 shrink-0 place-items-center rounded-full border text-foreground transition-[transform,background-color] duration-150 [-webkit-tap-highlight-color:transparent] focus-visible:outline-none focus-visible:shadow-focus enabled:active:scale-[0.92] disabled:border-border-subtle disabled:bg-transparent disabled:text-soft',
          justAdded ? 'border-success/70 bg-success/25 text-success-soft' : 'border-primary/55 bg-primary/20',
        )}
        disabled={isMaxed}
        aria-label={isMaxed ? t('search.mobile.maxedAria', { name: card.name }) : t('search.result.addAria', { name: card.name })}
        onClick={() => onAdd(card)}
      >
        {justAdded ? <Icon name="check" strokeWidth={2} /> : <Icon name="plus" strokeWidth={2} />}
      </button>
    </li>
  )
})

function MobileResultSkeleton() {
  return (
    <li className={ROW} aria-hidden="true">
      <span className={ROW_MAIN}>
        <Skeleton radius="none" className="aspect-[0.72] w-13" />
        <span className="grid flex-1 gap-2">
          <Skeleton className="h-3.5 w-[80%]" />
          <Skeleton className="h-2.5 w-[55%]" />
        </span>
      </span>
    </li>
  )
}
