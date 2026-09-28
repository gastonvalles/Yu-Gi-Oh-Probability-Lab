import type { ReactNode } from 'react'

import type { CardSearchFilters } from '../../app/card-search'
import { ATTRIBUTE_OPTIONS, SEARCH_SORT_OPTIONS, type FilterOptionGroup, type SearchSortOrder } from './search-options'
import type { SearchFilterContext } from './use-search-filter-context'

type FiltersLayout = 'desktop' | 'mobile'

interface SearchFiltersFormProps {
  id: string
  layout: FiltersLayout
  filters: CardSearchFilters
  context: SearchFilterContext
  activeFilterCount: number
  sortOrder: SearchSortOrder
  onSortOrderChange: (sortOrder: SearchSortOrder) => void
  onFilterChange: (updates: Partial<CardSearchFilters>) => void
  onClearFilters: () => void
}

export function SearchFiltersForm({
  id,
  layout,
  filters,
  context,
  activeFilterCount,
  sortOrder,
  onSortOrderChange,
  onFilterChange,
  onClearFilters,
}: SearchFiltersFormProps) {
  const { quickTypeMeta } = context

  return (
    <div id={id} className="search-filters-panel" data-layout={layout}>
      <FilterGroup title="Búsqueda">
        <Field label="Arquetipo">
          <input
            type="text"
            value={filters.archetype}
            onChange={(event) => onFilterChange({ archetype: event.target.value })}
            placeholder="Blue-Eyes"
            autoComplete="off"
            spellCheck={false}
            className="app-field search-filters-field"
          />
        </Field>

        <Field label="Texto del efecto (inglés)">
          <input
            type="text"
            value={filters.description}
            onChange={(event) => onFilterChange({ description: event.target.value })}
            placeholder="add 1"
            autoComplete="off"
            spellCheck={false}
            className="app-field search-filters-field"
          />
        </Field>
      </FilterGroup>

      <FilterGroup title="Características">
        <Field label={quickTypeMeta.exactTypeLabel}>
          <GroupedSelect
            value={filters.exactType}
            groups={context.exactTypeGroups}
            onChange={(exactType) => onFilterChange({ exactType })}
          />
        </Field>

        <Field label={quickTypeMeta.raceLabel}>
          <GroupedSelect value={filters.race} groups={context.raceGroups} onChange={(race) => onFilterChange({ race })} />
        </Field>

        {quickTypeMeta.showAttribute ? (
          <Field label="Atributo">
            <select
              value={filters.attribute}
              onChange={(event) => onFilterChange({ attribute: event.target.value })}
              className="app-field search-filters-field"
            >
              {ATTRIBUTE_OPTIONS.map((option) => (
                <option key={option.value || 'any'} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </Field>
        ) : null}

        {quickTypeMeta.showLevel ? (
          <Field label={quickTypeMeta.levelLabel}>
            <input
              type="number"
              inputMode="numeric"
              min={1}
              max={13}
              value={filters.level}
              onChange={(event) => onFilterChange({ level: event.target.value })}
              placeholder="Cualquiera"
              className="app-field search-filters-field"
            />
          </Field>
        ) : null}

        {context.formatAllowsLegalityFilter ? (
          <label className="search-filters-check">
            <input
              type="checkbox"
              checked={filters.legalOnly}
              onChange={(event) => onFilterChange({ legalOnly: event.target.checked })}
            />
            <span>Ocultar prohibidas en {context.formatLabel}</span>
          </label>
        ) : null}
      </FilterGroup>

      <div className="search-filters-footer">
        <Field label="Orden">
          <select
            value={sortOrder}
            onChange={(event) => onSortOrderChange(event.target.value as SearchSortOrder)}
            className="app-field search-filters-field"
          >
            {SEARCH_SORT_OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </Field>

        <button
          type="button"
          className="search-filters-clear"
          disabled={activeFilterCount === 0}
          onClick={onClearFilters}
        >
          Limpiar filtros
        </button>
      </div>
    </div>
  )
}

function FilterGroup({ title, children }: { title: string; children: ReactNode }) {
  return (
    <fieldset className="search-filters-group">
      <legend>{title}</legend>
      <div className="search-filters-grid">{children}</div>
    </fieldset>
  )
}

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className="search-filters-label">
      <span>{label}</span>
      {children}
    </label>
  )
}

function GroupedSelect({
  value,
  groups,
  onChange,
}: {
  value: string
  groups: FilterOptionGroup[]
  onChange: (value: string) => void
}) {
  return (
    <select value={value} onChange={(event) => onChange(event.target.value)} className="app-field search-filters-field">
      <option value="">Cualquiera</option>
      {groups.map((group) => (
        <optgroup key={group.label} label={group.label}>
          {group.options.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </optgroup>
      ))}
    </select>
  )
}
