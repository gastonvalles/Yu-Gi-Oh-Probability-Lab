import type { ReactNode } from 'react'

import type { CardSearchFilters } from '../../app/card-search'
import { Switch } from '../ui/Switch'
import { ATTRIBUTE_OPTIONS, type FilterOption, type FilterOptionGroup } from './search-options'
import type { SearchFilterContext } from './use-search-filter-context'
import { field } from '../ui/surfaces'

const FILTER_FIELD = `${field} min-h-9 w-full min-w-0 px-[0.65rem] py-[0.4rem] text-[0.8rem] group-data-[layout=mobile]/filters:min-h-11 group-data-[layout=mobile]/filters:text-[1rem]`
const LEGEND = 'mb-2 p-0 text-[0.66rem] font-bold uppercase tracking-[0.12em] text-soft'
const DENSE_CHIPS =
  'grid grid-cols-[repeat(auto-fill,minmax(2.25rem,1fr))] gap-[0.35rem] group-data-[layout=mobile]/filters:grid-cols-[repeat(auto-fill,minmax(2.6rem,1fr))]'
const CHIP_BASE =
  'min-h-8 rounded-full border border-border bg-secondary/90 text-[0.74rem] font-bold text-muted transition-[border-color,background,color] duration-[140ms] hover:border-primary/50 hover:text-foreground aria-pressed:border-primary/80 aria-pressed:bg-primary/22 aria-pressed:text-foreground group-data-[layout=mobile]/filters:min-h-10 group-data-[layout=mobile]/filters:text-[0.84rem]'
const CHIP = `${CHIP_BASE} px-[0.7rem]`
const CHIP_DENSE = `${CHIP_BASE} px-0`

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
    <div
      id={id}
      className="group/filters grid gap-[0.9rem] rounded-panel border border-border bg-linear-to-b from-secondary/92 to-background/96 p-[0.85rem]"
      data-layout={layout}
    >
      <div className="flex items-center justify-between gap-[0.6rem] border-b border-border pb-[0.65rem] text-[0.76rem] font-semibold text-muted">
        <span>
          {activeFilterCount > 0
            ? `${activeFilterCount} filtro${activeFilterCount === 1 ? '' : 's'} activo${activeFilterCount === 1 ? '' : 's'}`
            : 'Sin filtros activos'}
        </span>
        <button
          type="button"
          className="min-h-9 rounded-full border border-border bg-transparent px-[0.9rem] text-[0.78rem] font-semibold text-foreground transition-[border-color,background] duration-[140ms] group-data-[layout=mobile]/filters:min-h-10 enabled:hover:border-primary/60 enabled:hover:bg-primary/14 disabled:cursor-default disabled:text-soft disabled:opacity-60"
          disabled={activeFilterCount === 0} onClick={onClearFilters}>
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
            className={FILTER_FIELD}
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
            className={FILTER_FIELD}
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
        <div className="flex items-center justify-between gap-3 rounded-control border border-border px-[0.7rem] py-2">
          <span className="grid min-w-0 gap-[0.1rem]">
            <strong className="text-[0.8rem] text-foreground">Ocultar prohibidas</strong>
            <small className="text-[0.7rem] text-soft">Según la lista de {context.formatLabel}</small>
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
    <fieldset className="m-0 grid min-w-0 gap-2 border-0 p-0">
      <legend className={LEGEND}>{title}</legend>
      <div className={dense ? DENSE_CHIPS : 'flex flex-wrap gap-[0.35rem]'}>
        {options.map((option) => (
          <button
            key={option.value}
            type="button"
            className={dense ? CHIP_DENSE : CHIP}
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
    <fieldset className="m-0 grid min-w-0 gap-2 border-0 p-0">
      <legend className={LEGEND}>{title}</legend>
      <div className="grid grid-cols-2 gap-x-[0.6rem] gap-y-[0.55rem] max-[379px]:grid-cols-1">{children}</div>
    </fieldset>
  )
}

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className="grid min-w-0 gap-[0.28rem]">
      <span className="text-[0.72rem] font-semibold text-muted">{label}</span>
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
    <select value={value} onChange={(event) => onChange(event.target.value)} className={FILTER_FIELD}>
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
