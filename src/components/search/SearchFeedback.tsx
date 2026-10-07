import { SEARCH_MIN_QUERY_LENGTH } from '../../app/model'
import { formatInteger } from '../../app/utils'
import { cx } from '../ui/cx'
import { Icon } from '../ui/Icon'
import { choiceChip } from '../ui/surfaces'
import { SEARCH_SORT_OPTIONS, type SearchSortOrder } from './search-options'

type FeedbackLayout = 'desktop' | 'mobile'

const EMPTY_TITLE = 'm-0 text-body font-semibold text-foreground'
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
const EMPTY_ACTION_BASE = `${choiceChip} px-4 text-foreground`
const EMPTY_BOX = 'grid content-start justify-items-center px-4 py-8 text-center'

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
        'sticky top-0 z-2 flex items-center justify-between gap-2.5 bg-card-background',
        layout === 'mobile' ? '-mx-3 -mt-2 mb-2 px-3 py-2' : 'px-3 py-2',
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
            'cursor-pointer rounded-full border border-border-subtle bg-white/5 px-3 font-semibold text-foreground [color-scheme:dark] focus-visible:outline-none focus-visible:shadow-focus',
            layout === 'mobile' ? 'min-h-9 text-small' : 'min-h-8 text-caption',
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
        <EmptyIcon name="refresh" />
        <p className={EMPTY_TITLE}>Todavía no hay coincidencias en lo cargado</p>
        <p className={EMPTY_TEXT[layout]}>Seguimos trayendo más cartas…</p>
      </div>
    )
  }

  return (
    <div className={cx(EMPTY_BOX, 'gap-2')}>
      <EmptyIcon name="search" />
      <p className={EMPTY_TITLE}>No encontramos cartas</p>
      <p className={EMPTY_TEXT[layout]}>
        {activeFilterCount > 0
          ? 'Puede que algún filtro sea demasiado estricto.'
          : 'Revisá cómo está escrito o probá con una parte del nombre (en inglés).'}
      </p>
      <div className="mt-1 flex flex-wrap items-center justify-center gap-2">
        {activeFilterCount > 0 ? (
          <button
            type="button"
            className={cx(EMPTY_ACTION_BASE, EMPTY_ACTION[layout], 'border-primary/55 bg-primary/20')}
            onClick={onClearFilters}
          >
            Quitar filtros ({formatInteger(activeFilterCount)})
          </button>
        ) : null}
        {hasQuery ? (
          <button type="button" className={cx(EMPTY_ACTION_BASE, EMPTY_ACTION[layout])} onClick={onClearQuery}>
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
    <div className={cx(EMPTY_BOX, 'gap-5')}>
      <div className="grid justify-items-center gap-2 text-center">
        <EmptyIcon name="search" />
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
        <section className="grid w-full max-w-[30rem] gap-2" aria-label="Búsquedas recientes">
          <div className="flex items-center justify-between text-micro font-semibold uppercase tracking-[0.08em] text-soft">
            <span>Recientes</span>
            <button type="button" className="rounded-tag border-0 bg-transparent px-1 text-caption normal-case tracking-normal text-muted hover:text-foreground focus-visible:outline-none focus-visible:shadow-focus" onClick={onClearRecent}>
              Borrar
            </button>
          </div>
          <div className="flex flex-wrap justify-center gap-[0.4rem]">
            {recent.map((query) => (
              <button
                key={query}
                type="button"
                className={cx(choiceChip, 'max-w-full truncate px-3.5 text-foreground', RECENT_CHIP[layout])}
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

function EmptyIcon({ name }: { name: 'search' | 'refresh' }) {
  return (
    <span className="grid size-10 place-items-center rounded-full border border-border-subtle bg-white/5 text-soft">
      <Icon name={name} size={20} />
    </span>
  )
}
