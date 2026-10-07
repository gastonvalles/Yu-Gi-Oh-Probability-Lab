import { SEARCH_MIN_QUERY_LENGTH } from '../../app/model'
import { formatInteger } from '../../app/utils'
import { cx } from '../ui/cx'
import { SEARCH_SORT_OPTIONS, type SearchSortOrder } from './search-options'

type FeedbackLayout = 'desktop' | 'mobile'

const EMPTY_TITLE = 'm-0 text-body font-bold text-foreground'
const EMPTY_TEXT: Record<FeedbackLayout, string> = {
  desktop: 'm-0 max-w-[30rem] text-small text-muted [&_strong]:text-foreground',
  mobile: 'm-0 max-w-[30rem] text-body text-muted [&_strong]:text-foreground',
}
const EMPTY_ACTION: Record<FeedbackLayout, string> = {
  desktop: 'min-h-9 text-small',
  mobile: 'min-h-10 text-body',
}
const RECENT_CHIP: Record<FeedbackLayout, string> = {
  desktop: 'min-h-8 text-small',
  mobile: 'min-h-10 text-body',
}
const EMPTY_ACTION_BASE = 'rounded-full border bg-transparent px-[0.95rem] font-semibold text-foreground hover:border-primary/80'
const EMPTY_BOX = 'grid content-start justify-items-center px-[0.9rem] py-[1.6rem] text-center'

/** Barra sobre los resultados: cuántos hay y en qué orden se muestran. */
export function SearchResultsToolbar({
  count,
  hasMore,
  sortOrder,
  onSortOrderChange,
  hint,
  layout = 'desktop',
}: {
  layout?: FeedbackLayout
  count: number
  hasMore: boolean
  sortOrder: SearchSortOrder
  onSortOrderChange: (sortOrder: SearchSortOrder) => void
  hint?: string
}) {
  return (
    <div
      className={cx(
        'sticky top-0 z-2 flex items-center justify-between gap-[0.6rem] bg-background',
        layout === 'mobile' ? '-mx-3 -mt-2 mb-2 px-3 py-[0.45rem]' : 'px-[0.7rem] py-[0.4rem]',
      )}
    >
      <p className="m-0 min-w-0 truncate text-caption text-muted [&_strong]:text-foreground" aria-live="polite">
        <strong>
          {formatInteger(count)}
          {hasMore ? '+' : ''}
        </strong>{' '}
        resultado{count === 1 && !hasMore ? '' : 's'}
        {hint ? <span className="text-soft"> · {hint}</span> : null}
      </p>
      <label>
        <span className="sr-only">Ordenar resultados</span>
        <select
          className={cx(
            'cursor-pointer rounded-full border border-border bg-secondary/90 px-[0.6rem] font-semibold text-foreground',
            layout === 'mobile' ? 'min-h-9 text-small' : 'min-h-[1.9rem] text-caption',
          )}
          value={sortOrder} onChange={(event) => onSortOrderChange(event.target.value as SearchSortOrder)}>
          {SEARCH_SORT_OPTIONS.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
      </label>
    </div>
  )
}

/** Sin resultados: explica por qué y ofrece la salida más probable. */
export function SearchEmptyState({
  layout,
  isStillLoading,
  activeFilterCount,
  hasQuery,
  onClearFilters,
  onClearQuery,
}: {
  layout: FeedbackLayout
  isStillLoading: boolean
  activeFilterCount: number
  hasQuery: boolean
  onClearFilters: () => void
  onClearQuery: () => void
}) {
  if (isStillLoading) {
    return (
      <div className={cx(EMPTY_BOX, 'gap-2')}>
        <p className={EMPTY_TITLE}>Todavía no hay coincidencias en lo cargado</p>
        <p className={EMPTY_TEXT[layout]}>Seguimos trayendo más cartas…</p>
      </div>
    )
  }

  return (
    <div className={cx(EMPTY_BOX, 'gap-2')}>
      <p className={EMPTY_TITLE}>No encontramos cartas</p>
      <p className={EMPTY_TEXT[layout]}>
        {activeFilterCount > 0
          ? 'Puede que algún filtro sea demasiado estricto.'
          : 'Revisá cómo está escrito o probá con una parte del nombre (en inglés).'}
      </p>
      <div className="mt-[0.3rem] flex flex-wrap items-center justify-center gap-[0.45rem]">
        {activeFilterCount > 0 ? (
          <button
            type="button"
            className={cx(EMPTY_ACTION_BASE, EMPTY_ACTION[layout], 'border-primary/70 bg-primary/20')}
            onClick={onClearFilters}
          >
            Quitar filtros ({formatInteger(activeFilterCount)})
          </button>
        ) : null}
        {hasQuery ? (
          <button type="button" className={cx(EMPTY_ACTION_BASE, EMPTY_ACTION[layout], 'border-border')} onClick={onClearQuery}>
            Borrar texto
          </button>
        ) : null}
      </div>
    </div>
  )
}

/** Estado inicial: cómo buscar y, si hay, las búsquedas recientes para repetir con un toque. */
export function SearchStart({
  layout,
  recent,
  onPickRecent,
  onClearRecent,
}: {
  layout: FeedbackLayout
  recent: readonly string[]
  onPickRecent: (query: string) => void
  onClearRecent: () => void
}) {
  return (
    <div className={cx(EMPTY_BOX, 'gap-[1.1rem]')}>
      <div className="grid gap-1.5 text-center">
        <p className={EMPTY_TITLE}>¿Qué carta buscás?</p>
        <p className={EMPTY_TEXT[layout]}>
          Escribí al menos {formatInteger(SEARCH_MIN_QUERY_LENGTH)} letras del nombre (en inglés), o elegí un tipo y
          usá <strong>Filtros</strong> para buscar por arquetipo, atributo o nivel.
        </p>
        {layout === 'mobile' ? (
          <p className={EMPTY_TEXT[layout]}>
            Con <strong>+</strong> agregás una copia. Tocando la carta ves el detalle y elegís Main, Extra o Side.
          </p>
        ) : (
          <p className={EMPTY_TEXT[layout]}>Arrastrá una carta al deck, hacé doble click o usá el botón +.</p>
        )}
      </div>

      {recent.length > 0 ? (
        <section className="grid w-full max-w-[30rem] gap-[0.45rem]" aria-label="Búsquedas recientes">
          <div className="flex items-center justify-between text-micro font-bold uppercase tracking-[0.12em] text-soft">
            <span>Recientes</span>
            <button type="button" className="border-0 bg-transparent text-caption normal-case tracking-normal text-muted underline underline-offset-[0.15rem]" onClick={onClearRecent}>
              Borrar
            </button>
          </div>
          <div className="flex flex-wrap justify-center gap-[0.4rem]">
            {recent.map((query) => (
              <button
                key={query}
                type="button"
                className={cx('max-w-full truncate rounded-full border border-border bg-secondary/90 px-[0.8rem] text-foreground hover:border-primary/60', RECENT_CHIP[layout])}
                onClick={() => onPickRecent(query)}>
                {query}
              </button>
            ))}
          </div>
        </section>
      ) : null}
    </div>
  )
}
