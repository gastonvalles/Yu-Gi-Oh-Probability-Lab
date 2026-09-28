import type { ReactNode } from 'react'

import type { CardSearchFilters } from '../../app/card-search'
import { Button } from '../ui/Button'
import { SearchFilterSection } from './SearchFilterSection'
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
  className?: string
}

// En mobile los campos usan 16px: con menos, iOS hace zoom al enfocarlos.
const FIELD_CLASS: Record<FiltersLayout, string> = {
  desktop: 'app-field min-w-0 w-full px-2 py-[0.45rem] text-[0.76rem]',
  mobile: 'app-field min-w-0 w-full min-h-11 px-3 py-2 text-base',
}

const CHARACTERISTICS_GRID_CLASS: Record<FiltersLayout, string> = {
  desktop: 'grid gap-1.5',
  mobile: 'grid gap-2 min-[380px]:grid-cols-2',
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
  className = 'surface-card grid gap-1.5 p-2',
}: SearchFiltersFormProps) {
  const fieldClass = FIELD_CLASS[layout]
  const { quickTypeMeta, sectionSummaries } = context

  return (
    <div id={id} className={className}>
      <div className="grid gap-1.5 min-[380px]:grid-cols-[minmax(0,1fr)_auto] min-[380px]:items-end">
        <FieldLabel label="Orden">
          <select
            value={sortOrder}
            onChange={(event) => onSortOrderChange(event.target.value as SearchSortOrder)}
            className={fieldClass}
          >
            {SEARCH_SORT_OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </FieldLabel>

        {activeFilterCount > 0 ? (
          <Button variant="tertiary" size={layout === 'mobile' ? 'md' : 'sm'} onClick={onClearFilters}>
            Limpiar filtros
          </Button>
        ) : null}
      </div>

      <SearchFilterSection
        title="Texto y arquetipo"
        summary={sectionSummaries.text}
        defaultOpen={layout === 'mobile' || sectionSummaries.textOpen}
      >
        <FieldLabel label="Arquetipo">
          <input
            type="text"
            value={filters.archetype}
            onChange={(event) => onFilterChange({ archetype: event.target.value })}
            placeholder="Blue-Eyes"
            autoComplete="off"
            spellCheck={false}
            className={fieldClass}
          />
        </FieldLabel>

        <FieldLabel label="Texto del efecto (inglés)">
          <input
            type="text"
            value={filters.description}
            onChange={(event) => onFilterChange({ description: event.target.value })}
            placeholder="add 1"
            autoComplete="off"
            spellCheck={false}
            className={fieldClass}
          />
        </FieldLabel>
      </SearchFilterSection>

      <SearchFilterSection
        title="Características"
        summary={sectionSummaries.characteristics}
        defaultOpen={layout === 'mobile' || sectionSummaries.characteristicsOpen}
      >
        <div className={CHARACTERISTICS_GRID_CLASS[layout]}>
          <FieldLabel label={quickTypeMeta.exactTypeLabel}>
            <GroupedSelect
              value={filters.exactType}
              groups={context.exactTypeGroups}
              className={fieldClass}
              onChange={(exactType) => onFilterChange({ exactType })}
            />
          </FieldLabel>

          <FieldLabel label={quickTypeMeta.raceLabel}>
            <GroupedSelect
              value={filters.race}
              groups={context.raceGroups}
              className={fieldClass}
              onChange={(race) => onFilterChange({ race })}
            />
          </FieldLabel>

          {quickTypeMeta.showAttribute ? (
            <FieldLabel label="Atributo">
              <select
                value={filters.attribute}
                onChange={(event) => onFilterChange({ attribute: event.target.value })}
                className={fieldClass}
              >
                {ATTRIBUTE_OPTIONS.map((option) => (
                  <option key={option.value || 'any'} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </FieldLabel>
          ) : null}

          {quickTypeMeta.showLevel ? (
            <FieldLabel label={quickTypeMeta.levelLabel}>
              <input
                type="number"
                inputMode="numeric"
                min={1}
                max={13}
                value={filters.level}
                onChange={(event) => onFilterChange({ level: event.target.value })}
                placeholder="4"
                className={fieldClass}
              />
            </FieldLabel>
          ) : null}
        </div>

        {context.formatAllowsLegalityFilter ? (
          <label className="surface-panel-soft flex min-h-10 items-center gap-2 border border-(--border-subtle) px-2 py-1.5 text-[0.78rem]">
            <input
              type="checkbox"
              checked={filters.legalOnly}
              onChange={(event) => onFilterChange({ legalOnly: event.target.checked })}
              className="h-4 w-4 shrink-0 accent-primary"
            />
            <span className="min-w-0 text-(--text-main)">Ocultar prohibidas en {context.formatLabel}</span>
          </label>
        ) : null}
      </SearchFilterSection>
    </div>
  )
}

function FieldLabel({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className="grid min-w-0 gap-1">
      <span className="app-soft text-[0.62rem] uppercase tracking-[0.12em]">{label}</span>
      {children}
    </label>
  )
}

function GroupedSelect({
  value,
  groups,
  className,
  onChange,
}: {
  value: string
  groups: FilterOptionGroup[]
  className: string
  onChange: (value: string) => void
}) {
  return (
    <select value={value} onChange={(event) => onChange(event.target.value)} className={className}>
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
