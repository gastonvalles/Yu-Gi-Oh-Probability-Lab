import { SEARCH_MIN_QUERY_LENGTH } from '../../app/model'
import { formatInteger } from '../../app/utils'
import { SEARCH_SORT_OPTIONS, type SearchSortOrder } from './search-options'

type FeedbackLayout = 'desktop' | 'mobile'

/** Barra sobre los resultados: cuántos hay y en qué orden se muestran. */
export function SearchResultsToolbar({
  count,
  hasMore,
  sortOrder,
  onSortOrderChange,
  hint,
}: {
  count: number
  hasMore: boolean
  sortOrder: SearchSortOrder
  onSortOrderChange: (sortOrder: SearchSortOrder) => void
  hint?: string
}) {
  return (
    <div className="search-results-toolbar">
      <p className="search-results-count" aria-live="polite">
        <strong>
          {formatInteger(count)}
          {hasMore ? '+' : ''}
        </strong>{' '}
        resultado{count === 1 && !hasMore ? '' : 's'}
        {hint ? <span className="search-results-hint"> · {hint}</span> : null}
      </p>
      <label className="search-results-sort">
        <span className="sr-only">Ordenar resultados</span>
        <select value={sortOrder} onChange={(event) => onSortOrderChange(event.target.value as SearchSortOrder)}>
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
      <div className="search-empty" data-layout={layout}>
        <p className="search-empty-title">Todavía no hay coincidencias en lo cargado</p>
        <p className="search-empty-text">Seguimos trayendo más cartas…</p>
      </div>
    )
  }

  return (
    <div className="search-empty" data-layout={layout}>
      <p className="search-empty-title">No encontramos cartas</p>
      <p className="search-empty-text">
        {activeFilterCount > 0
          ? 'Puede que algún filtro sea demasiado estricto.'
          : 'Revisá cómo está escrito o probá con una parte del nombre (en inglés).'}
      </p>
      <div className="search-empty-actions">
        {activeFilterCount > 0 ? (
          <button type="button" className="search-empty-action" data-primary="true" onClick={onClearFilters}>
            Quitar filtros ({formatInteger(activeFilterCount)})
          </button>
        ) : null}
        {hasQuery ? (
          <button type="button" className="search-empty-action" onClick={onClearQuery}>
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
    <div className="search-start" data-layout={layout}>
      <div className="grid gap-1.5 text-center">
        <p className="search-empty-title">¿Qué carta buscás?</p>
        <p className="search-empty-text">
          Escribí al menos {formatInteger(SEARCH_MIN_QUERY_LENGTH)} letras del nombre (en inglés), o elegí un tipo y
          usá <strong>Filtros</strong> para buscar por arquetipo, atributo o nivel.
        </p>
        {layout === 'mobile' ? (
          <p className="search-empty-text">
            Con <strong>+</strong> agregás una copia. Tocando la carta ves el detalle y elegís Main, Extra o Side.
          </p>
        ) : (
          <p className="search-empty-text">Arrastrá una carta al deck, hacé doble click o usá el botón +.</p>
        )}
      </div>

      {recent.length > 0 ? (
        <section className="search-recent" aria-label="Búsquedas recientes">
          <div className="search-recent-head">
            <span>Recientes</span>
            <button type="button" className="search-recent-clear" onClick={onClearRecent}>
              Borrar
            </button>
          </div>
          <div className="search-recent-list">
            {recent.map((query) => (
              <button key={query} type="button" className="search-recent-chip" onClick={() => onPickRecent(query)}>
                {query}
              </button>
            ))}
          </div>
        </section>
      ) : null}
    </div>
  )
}
