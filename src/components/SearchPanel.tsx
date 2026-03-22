import type { PointerEvent as ReactPointerEvent } from 'react'

import { buildCompactSearchDescription, formatSearchError } from '../app/card-search'
import { buildFormatLimitLabel } from '../app/deck-format'
import { SEARCH_MIN_QUERY_LENGTH, SEARCH_STICKY_TOP_PX } from '../app/model'
import { formatInteger } from '../app/utils'
import type { DeckFormat } from '../types'
import type { ApiCardSearchResult } from '../ygoprodeck'
import { CardArt } from './CardArt'
import { Button } from './ui/Button'

const TYPE_FILTER_OPTIONS = [
  { value: 'all', label: 'Todos' },
  { value: 'monster', label: 'Monstruos' },
  { value: 'spell', label: 'Magias' },
  { value: 'trap', label: 'Trampas' },
  { value: 'extra', label: 'Extra Deck' },
] as const

interface SearchPanelProps {
  builderHeight: number | null
  deckFormat: DeckFormat
  query: string
  status: 'idle' | 'loading' | 'success' | 'error'
  results: ApiCardSearchResult[]
  errorMessage: string
  page: number
  hasMore: boolean
  activeDragSearchCardId: number | null
  dragEnabled?: boolean
  typeFilter: string
  archetypeFilter: string
  onQueryChange: (value: string) => void
  onTypeFilterChange: (value: string) => void
  onArchetypeFilterChange: (value: string) => void
  onPrevPage: () => void
  onNextPage: () => void
  onResultClick: (apiCardId: number) => void
  onSearchCardPointerDown: (event: ReactPointerEvent<HTMLElement>, apiCardId: number) => void
  onHoverStart: (name: string, card: ApiCardSearchResult, anchor: HTMLElement) => void
  onHoverEnd: () => void
}

export function SearchPanel({
  builderHeight,
  deckFormat,
  query,
  status,
  results,
  errorMessage,
  page,
  hasMore,
  activeDragSearchCardId,
  dragEnabled = true,
  typeFilter,
  archetypeFilter,
  onQueryChange,
  onTypeFilterChange,
  onArchetypeFilterChange,
  onPrevPage,
  onNextPage,
  onResultClick,
  onSearchCardPointerDown,
  onHoverStart,
  onHoverEnd,
}: SearchPanelProps) {
  const shouldShowResults = query.trim().length >= SEARCH_MIN_QUERY_LENGTH
  const metaLabel = `Página ${formatInteger(page + 1)} · ${formatInteger(results.length)} resultados`

  return (
    <article
      className="surface-panel-soft self-start h-full min-h-0 max-h-full overflow-hidden p-2"
      style={
        builderHeight
          ? { height: builderHeight, maxHeight: builderHeight }
          : undefined
      }
    >
      <div
        className="grid h-full min-h-0 content-start gap-2 min-[1101px]:sticky"
        style={{
          top: SEARCH_STICKY_TOP_PX,
          gridTemplateRows: shouldShowResults ? 'auto auto minmax(0, 1fr)' : undefined,
        }}
      >
        <label className="relative block">
          <input
            type="text"
            value={query}
            onChange={(event) => onQueryChange(event.target.value)}
            placeholder="Buscar carta"
            autoComplete="off"
            spellCheck={false}
            className="app-field w-full px-2.5 py-2 pr-9 text-[0.84rem]"
          />
          {status === 'loading' ? (
            <span className="pointer-events-none absolute right-3 top-1/2 -mt-[0.475rem] h-[0.95rem] w-[0.95rem] animate-spin rounded-full border-2 border-[rgb(var(--foreground-rgb)/0.18)] border-t-[var(--primary)]" />
          ) : null}
        </label>

        <div className="surface-card p-2">
          <div className="mb-2 flex items-center gap-2 whitespace-nowrap">
            <strong className="text-[0.76rem] text-[var(--text-main)]">Filtros</strong>
        </div>

          <div className="grid gap-2 min-[460px]:grid-cols-2">
            <label className="grid gap-1">
              <span className="text-[0.66rem] uppercase tracking-[0.08em] text-[var(--text-muted)]">Tipo</span>
              <select
                value={typeFilter}
                onChange={(event) => onTypeFilterChange(event.target.value)}
                className="app-field w-full px-2 py-[0.45rem] text-[0.78rem]"
              >
                {TYPE_FILTER_OPTIONS.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </label>

            <label className="grid gap-1">
              <span className="text-[0.66rem] uppercase tracking-[0.08em] text-[var(--text-muted)]">Arquetipo</span>
              <input
                type="text"
                value={archetypeFilter}
                onChange={(event) => onArchetypeFilterChange(event.target.value)}
                placeholder="Ej: Yummy"
                autoComplete="off"
                spellCheck={false}
                className="app-field w-full px-2 py-[0.45rem] text-[0.78rem]"
              />
            </label>
          </div>
        </div>

        {shouldShowResults ? (
          <div
            className="grid min-h-0 content-start gap-2 overflow-hidden"
            style={{
              gridTemplateRows: status === 'error' ? undefined : 'auto minmax(0, 1fr)',
            }}
          >
            {status === 'error' ? (
              <p className="surface-card-danger m-0 px-2.5 py-2 text-[0.82rem] leading-[1.16] text-[var(--destructive)]">
                {formatSearchError(errorMessage)}
              </p>
            ) : (
              <>
                <div className="flex items-start justify-between gap-2 text-[var(--text-muted)]">
                  <small className="text-[0.72rem]">{metaLabel}</small>
                  <div className="flex gap-2">
                    {page > 0 ? (
                      <Button variant="secondary" size="sm" onClick={onPrevPage}>
                        Anterior
                      </Button>
                    ) : null}
                    {hasMore ? (
                      <Button variant="secondary" size="sm" onClick={onNextPage}>
                        Siguiente
                      </Button>
                    ) : null}
                  </div>
                </div>

                {status === 'loading' ? (
                  <div
                    className="grid min-h-0 content-start gap-2 overflow-y-auto overflow-x-hidden pr-1"
                  >
                    {Array.from({ length: 8 }, (_, index) => (
                      <article
                        key={index}
                        className="app-list-item grid grid-cols-[42px_minmax(0,1fr)] items-center gap-2 p-1.5"
                        aria-hidden="true"
                      >
                        <div className="aspect-[0.72] w-[42px] animate-pulse bg-[var(--input)]" />
                        <div className="grid gap-2">
                          <span className="block h-3.5 w-[85%] animate-pulse bg-[var(--input)]" />
                          <span className="block h-2.5 w-[62%] animate-pulse bg-[var(--input)]" />
                        </div>
                      </article>
                    ))}
                  </div>
                ) : results.length === 0 ? (
                  <p
                    className="surface-card m-0 min-h-0 overflow-y-auto px-2.5 py-2 text-[0.82rem] text-[var(--text-muted)]"
                  >
                    No se encontraron cartas para esa búsqueda.
                  </p>
                ) : (
                  <div
                    className="grid min-h-0 content-start gap-2 overflow-y-auto overflow-x-hidden pr-1"
                  >
                    {results.map((card) => (
                      <article
                        key={card.ygoprodeckId}
                        className={[
                          'app-list-item grid w-full min-w-0 select-none grid-cols-[42px_minmax(0,1fr)] items-center gap-2 p-1.5 transition-all duration-150 ease-out will-change-transform',
                          dragEnabled ? 'cursor-grab touch-none' : '',
                          activeDragSearchCardId === card.ygoprodeckId
                            ? 'opacity-35'
                            : '',
                        ].join(' ')}
                        onClick={() => onResultClick(card.ygoprodeckId)}
                        onPointerDown={(event) => {
                          if (!dragEnabled) {
                            return
                          }

                          onSearchCardPointerDown(event, card.ygoprodeckId)
                        }}
                        onMouseEnter={(event) => onHoverStart(card.name, card, event.currentTarget)}
                        onMouseLeave={onHoverEnd}
                      >
                        <div className="w-[42px]">
                          <CardArt
                            remoteUrl={card.imageUrlSmall}
                            name={card.name}
                            className="block aspect-[0.72] w-[42px] bg-[var(--input)] object-cover"
                          />
                        </div>

                        <div className="flex min-w-0 flex-col gap-[0.15rem]">
                          <strong className="text-[0.8rem] leading-[1.08] break-words text-[var(--text-main)]">
                            {card.name}
                          </strong>
                          <p className="m-0 text-[0.72rem] leading-[1.12] break-words text-[var(--text-main)]">
                            {buildCompactSearchDescription(card)}
                          </p>
                          {buildFormatLimitLabel(card, deckFormat) ? (
                            <small className="text-[0.68rem] text-[var(--text-muted)]">
                              {buildFormatLimitLabel(card, deckFormat)}
                            </small>
                          ) : null}
                        </div>
                      </article>
                    ))}
                  </div>
                )}
              </>
            )}
          </div>
        ) : null}
      </div>
    </article>
  )
}
