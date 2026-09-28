import { useEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'

import { buildCompactSearchDescription, formatSearchError } from '../../app/card-search'
import { buildFormatLimitLabel } from '../../app/deck-format'
import { SEARCH_MIN_QUERY_LENGTH, type DeckZone } from '../../app/model'
import { useInfiniteScroll } from '../../app/use-infinite-scroll'
import { formatInteger } from '../../app/utils'
import type { ApiCardSearchResult } from '../../ygoprodeck'
import { CardArt } from '../CardArt'
import { Button } from '../ui/Button'
import { CloseIcon, IconButton } from '../ui/IconButton'
import { CheckIcon, ChevronLeftIcon, FilterIcon, PlusIcon } from '../ui/icons'
import { Skeleton } from '../ui/Skeleton'
import { SearchFiltersForm } from './SearchFiltersForm'
import { sortVisibleSearchResults } from './search-model'
import { QUICK_TYPE_OPTIONS, type SearchSortOrder } from './search-options'
import type { CardSearchActions, CardSearchViewState } from './search-types'
import { useSearchFilterContext } from './use-search-filter-context'

interface MobileCardSearchProps {
  search: CardSearchViewState
  actions: CardSearchActions
  deckCopyCounts: ReadonlyMap<number, number>
  zoneCounts: Record<DeckZone, number>
  onAddCard: (apiCardId: number) => boolean
  onOpenDetail: (apiCardId: number) => void
  onClose: () => void
}

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
  const { filters, query, status } = search
  const [filtersOpen, setFiltersOpen] = useState(false)
  const [sortOrder, setSortOrder] = useState<SearchSortOrder>('default')
  const [lastAdded, setLastAdded] = useState<{ id: number; name: string } | null>(null)
  const inputRef = useRef<HTMLInputElement | null>(null)
  const resultsRef = useRef<HTMLDivElement | null>(null)
  const filterContext = useSearchFilterContext(filters, search.deckFormat, actions.onFilterChange)
  const sortedResults = useMemo(() => sortVisibleSearchResults(search.results, sortOrder), [search.results, sortOrder])
  const showResults = search.hasSearchCriteria && !filtersOpen

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
    }
  }

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
      role="dialog"
      aria-modal="true"
      aria-label="Buscar cartas"
      className="mobile-card-search fixed inset-0 z-140 flex h-dvh w-full flex-col overflow-hidden bg-(--background) min-[1101px]:hidden"
    >
      <header className="grid gap-2 border-b border-(--border-subtle) px-3 pb-2 pt-[max(0.6rem,env(safe-area-inset-top))]">
        <form
          role="search"
          className="flex items-center gap-2"
          onSubmit={(event) => {
            event.preventDefault()
            inputRef.current?.blur()
          }}
        >
          <IconButton size="lg" aria-label="Volver al deck" onClick={onClose}>
            <ChevronLeftIcon />
          </IconButton>

          <label className="relative block min-w-0 flex-1">
            <span className="sr-only">Nombre o texto de la carta</span>
            <input
              ref={inputRef}
              type="search"
              enterKeyHint="search"
              value={query}
              onChange={(event) => actions.onQueryChange(event.target.value)}
              placeholder="Nombre de la carta"
              autoComplete="off"
              autoCorrect="off"
              autoCapitalize="none"
              spellCheck={false}
              autoFocus
              className="app-field mobile-card-search-input h-11 w-full pl-3 pr-11 text-base"
            />
            {status === 'loading' ? (
              <span className="pointer-events-none absolute right-11 top-1/2 -mt-2 h-4 w-4 animate-spin rounded-full border-2 border-[rgb(var(--foreground-rgb)/0.18)] border-t-primary" />
            ) : null}
            {query.length > 0 ? (
              <button
                type="button"
                aria-label="Borrar texto"
                className="absolute right-0 top-0 grid h-11 w-11 place-items-center text-(--text-muted)"
                onClick={() => {
                  actions.onQueryChange('')
                  inputRef.current?.focus()
                }}
              >
                <CloseIcon className="h-4 w-4" />
              </button>
            ) : null}
          </label>

          <button
            type="button"
            className="mobile-card-search-filter-button"
            aria-expanded={filtersOpen}
            aria-controls="mobile-search-filters"
            data-active={filtersOpen || search.activeFilterCount > 0 ? 'true' : 'false'}
            onClick={() => setFiltersOpen((current) => !current)}
          >
            <FilterIcon />
            <span className="sr-only">Filtros</span>
            {search.activeFilterCount > 0 ? (
              <span className="mobile-card-search-filter-badge">{formatInteger(search.activeFilterCount)}</span>
            ) : null}
          </button>
        </form>

        <div className="mobile-card-search-chip-row" role="group" aria-label="Tipo de carta">
          {QUICK_TYPE_OPTIONS.map((option) => (
            <button
              key={option.value}
              type="button"
              className="mobile-card-search-chip"
              aria-pressed={filters.quickType === option.value}
              onClick={() => actions.onFilterChange({ quickType: option.value })}
            >
              {option.label}
            </button>
          ))}
        </div>

        {!filtersOpen && filterContext.activeFilterChips.length > 0 ? (
          <div className="mobile-card-search-chip-row">
            {filterContext.activeFilterChips.map((chip) => (
              <button
                key={chip.key}
                type="button"
                className="search-active-chip min-h-9"
                onClick={() => actions.onFilterChange(chip.updates)}
                aria-label={`Quitar filtro ${chip.label}: ${chip.value}`}
              >
                <span className="truncate text-(--text-main)">
                  {chip.label}: {chip.value}
                </span>
                <CloseIcon className="h-3 w-3 shrink-0 text-(--text-soft)" />
              </button>
            ))}
          </div>
        ) : null}
      </header>

      {filtersOpen ? (
        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-3 py-3">
          <SearchFiltersForm
            id="mobile-search-filters"
            layout="mobile"
            filters={filters}
            context={filterContext}
            activeFilterCount={search.activeFilterCount}
            sortOrder={sortOrder}
            onSortOrderChange={setSortOrder}
            onFilterChange={actions.onFilterChange}
            onClearFilters={actions.onClearFilters}
          />
        </div>
      ) : (
        <div
          ref={resultsRef}
          className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-3 py-2"
          onTouchStart={dismissKeyboard}
        >
          {!search.hasSearchCriteria ? (
            <SearchHint />
          ) : status === 'error' ? (
            <p className="surface-card-danger m-0 px-3 py-2.5 text-[0.88rem] leading-[1.25] text-destructive">
              {formatSearchError(search.errorMessage)}
            </p>
          ) : status === 'loading' ? (
            <ul className="m-0 grid list-none gap-2 p-0" aria-busy="true">
              {Array.from({ length: SKELETON_COUNT }, (_, index) => (
                <MobileResultSkeleton key={index} />
              ))}
            </ul>
          ) : sortedResults.length === 0 ? (
            <p className="surface-card m-0 px-3 py-3 text-[0.88rem] leading-[1.25] text-(--text-muted)">
              {search.rawResultCount > 0
                ? 'Todavía no hay coincidencias en lo cargado. Seguimos buscando…'
                : 'No encontramos cartas con esos criterios. Probá con menos letras o quitá filtros.'}
            </p>
          ) : (
            <>
              <p className="m-0 px-0.5 pb-2 text-[0.78rem] text-(--text-muted)">
                {formatInteger(sortedResults.length)} resultado{sortedResults.length === 1 ? '' : 's'} · tocá una
                carta para ver el detalle
              </p>
              <ul className="m-0 grid list-none gap-2 p-0">
                {sortedResults.map((card) => (
                  <MobileResultRow
                    key={card.ygoprodeckId}
                    card={card}
                    copiesInDeck={deckCopyCounts.get(card.ygoprodeckId) ?? 0}
                    isMaxed={search.maxedOutResultIds.has(card.ygoprodeckId)}
                    justAdded={lastAdded?.id === card.ygoprodeckId}
                    formatLimitLabel={buildFormatLimitLabel(card, search.deckFormat)}
                    onOpenDetail={() => onOpenDetail(card.ygoprodeckId)}
                    onAdd={() => handleAdd(card)}
                  />
                ))}
                {search.isLoadingMore ? <MobileResultSkeleton /> : null}
              </ul>
              {search.hasMore && !search.isLoadingMore ? (
                <Button variant="secondary" size="md" fullWidth className="mt-2" onClick={actions.onLoadMore}>
                  Cargar más resultados
                </Button>
              ) : null}
            </>
          )}
        </div>
      )}

      <footer className="flex items-center gap-3 border-t border-(--border-subtle) px-3 pb-[max(0.6rem,env(safe-area-inset-bottom))] pt-2">
        <p className="m-0 min-w-0 flex-1 text-[0.8rem] leading-tight text-(--text-muted)" aria-live="polite">
          {lastAdded ? (
            <span className="text-(--text-main)">Agregaste {lastAdded.name}</span>
          ) : (
            <>
              Main <strong className="text-(--text-main)">{formatInteger(zoneCounts.main)}</strong> · Extra{' '}
              <strong className="text-(--text-main)">{formatInteger(zoneCounts.extra)}</strong> · Side{' '}
              <strong className="text-(--text-main)">{formatInteger(zoneCounts.side)}</strong>
            </>
          )}
        </p>
        {filtersOpen ? (
          <Button variant="primary" size="md" onClick={() => setFiltersOpen(false)}>
            Ver resultados
          </Button>
        ) : (
          <Button variant="primary" size="md" onClick={onClose}>
            Listo
          </Button>
        )}
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
  formatLimitLabel: string | null
  onOpenDetail: () => void
  onAdd: () => void
}

function MobileResultRow({
  card,
  copiesInDeck,
  isMaxed,
  justAdded,
  formatLimitLabel,
  onOpenDetail,
  onAdd,
}: MobileResultRowProps) {
  return (
    <li className="mobile-card-search-row" data-maxed={isMaxed ? 'true' : 'false'}>
      <button type="button" className="mobile-card-search-row-main" onClick={onOpenDetail}>
        <span className="relative w-13 shrink-0">
          <CardArt
            remoteUrl={card.imageUrlSmall ?? card.imageUrl}
            name={card.name}
            className="block aspect-[0.72] w-13 bg-input object-cover"
            limitCard={card}
            limitBadgeSize="sm"
          />
          {copiesInDeck > 0 ? (
            <span className="mobile-card-search-copies" aria-label={`${copiesInDeck} en el deck`}>
              ×{formatInteger(copiesInDeck)}
            </span>
          ) : null}
        </span>
        <span className="grid min-w-0 gap-0.5 text-left">
          <strong className="text-[0.9rem] leading-tight wrap-anywhere text-(--text-main)">{card.name}</strong>
          <span className="text-[0.76rem] leading-tight wrap-anywhere text-(--text-muted)">
            {buildCompactSearchDescription(card)}
          </span>
          {formatLimitLabel ? <span className="text-[0.72rem] text-(--text-soft)">{formatLimitLabel}</span> : null}
        </span>
      </button>

      <button
        type="button"
        className="mobile-card-search-add"
        data-state={justAdded ? 'added' : 'idle'}
        disabled={isMaxed}
        aria-label={isMaxed ? `${card.name}: máximo de copias alcanzado` : `Agregar ${card.name} al deck`}
        onClick={onAdd}
      >
        {isMaxed ? <span className="text-[0.66rem] font-semibold">MÁX</span> : justAdded ? <CheckIcon /> : <PlusIcon />}
      </button>
    </li>
  )
}

function SearchHint() {
  return (
    <div className="grid gap-2 px-1 py-6 text-center text-(--text-muted)">
      <p className="m-0 text-[0.95rem] text-(--text-main)">¿Qué carta buscás?</p>
      <p className="m-0 text-[0.84rem] leading-snug">
        Escribí al menos {formatInteger(SEARCH_MIN_QUERY_LENGTH)} letras del nombre, o usá los filtros para buscar
        por arquetipo, tipo o atributo.
      </p>
      <p className="m-0 text-[0.78rem] leading-snug">
        Con <strong className="text-(--text-main)">+</strong> agregás una copia al deck. Tocando la carta ves el
        detalle y podés elegir Main, Extra o Side.
      </p>
    </div>
  )
}

function MobileResultSkeleton() {
  return (
    <li className="mobile-card-search-row" aria-hidden="true">
      <span className="mobile-card-search-row-main">
        <Skeleton radius="none" className="aspect-[0.72] w-13" />
        <span className="grid flex-1 gap-2">
          <Skeleton className="h-3.5 w-[80%]" />
          <Skeleton className="h-2.5 w-[55%]" />
        </span>
      </span>
    </li>
  )
}
