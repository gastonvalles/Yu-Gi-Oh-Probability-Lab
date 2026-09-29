import type { ReactNode } from 'react'

import type { CardSearchFilters } from '../../app/card-search'
import { Switch } from '../ui/Switch'
import { ATTRIBUTE_OPTIONS, type FilterOption, type FilterOptionGroup } from './search-options'
import type { SearchFilterContext } from './use-search-filter-context'

type FiltersLayout = 'desktop' | 'mobile'

const ATTRIBUTE_CHOICES = ATTRIBUTE_OPTIONS.filter((option) => option.value !== '')
const LEVEL_CHOICES: FilterOption[] = Array.from({ length: 13 }, (_, index) => ({
  value: String(index + 1),
  label: String(index + 1),
}))

interface SearchFiltersFormProps {
  id: string
  layout: FiltersLayout
  filters: CardSearchFilters
  context: SearchFilterContext
  activeFilterCount: number
  onFilterChange: (updates: Partial<CardSearchFilters>) => void
  onClearFilters: () => void
}

export function SearchFiltersForm({
  id,
  layout,
  filters,
  context,
  activeFilterCount,
  onFilterChange,
  onClearFilters,
}: SearchFiltersFormProps) {
  const { quickTypeMeta } = context

  return (
    <div id={id} className="search-filters-panel" data-layout={layout}>
      <div className="search-filters-head">
        <span>
          {activeFilterCount > 0
            ? `${activeFilterCount} filtro${activeFilterCount === 1 ? '' : 's'} activo${activeFilterCount === 1 ? '' : 's'}`
            : 'Sin filtros activos'}
        </span>
        <button type="button" className="search-filters-clear" disabled={activeFilterCount === 0} onClick={onClearFilters}>
          Limpiar filtros
        </button>
      </div>

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

      </FilterGroup>

      {quickTypeMeta.showAttribute ? (
        <ChipGroup
          title="Atributo"
          options={ATTRIBUTE_CHOICES}
          value={filters.attribute}
          onChange={(attribute) => onFilterChange({ attribute })}
        />
      ) : null}

      {quickTypeMeta.showLevel ? (
        <ChipGroup
          title={quickTypeMeta.levelLabel}
          options={LEVEL_CHOICES}
          value={filters.level}
          onChange={(level) => onFilterChange({ level })}
          dense
        />
      ) : null}

      {context.formatAllowsLegalityFilter ? (
        <div className="search-filters-switch">
          <span>
            <strong>Ocultar prohibidas</strong>
            <small>Según la lista de {context.formatLabel}</small>
          </span>
          <Switch
            checked={filters.legalOnly}
            label={`Ocultar prohibidas en ${context.formatLabel}`}
            onChange={(legalOnly) => onFilterChange({ legalOnly })}
          />
        </div>
      ) : null}
    </div>
  )
}

/** Opciones cortas como chips: un toque elige, otro toque sobre la elegida la quita. */
function ChipGroup({
  title,
  options,
  value,
  onChange,
  dense = false,
}: {
  title: string
  options: FilterOption[]
  value: string
  onChange: (value: string) => void
  dense?: boolean
}) {
  return (
    <fieldset className="search-filters-group">
      <legend>{title}</legend>
      <div className="search-filters-chips" data-dense={dense ? 'true' : 'false'}>
        {options.map((option) => (
          <button
            key={option.value}
            type="button"
            className="search-filters-chip"
            aria-pressed={value === option.value}
            onClick={() => onChange(value === option.value ? '' : option.value)}
          >
            {option.label}
          </button>
        ))}
      </div>
    </fieldset>
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
