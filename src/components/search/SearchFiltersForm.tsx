import { useState, type ReactNode } from 'react'

import type { CardSearchFilters } from '../../app/card-search'
import { t } from '../../i18n'
import { Badge } from '../ui/Badge'
import { Button } from '../ui/Button'
import { Icon } from '../ui/Icon'
import { Switch } from '../ui/Switch'
import { cx } from '../ui/cx'
import { ATTRIBUTE_OPTIONS, type FilterOption, type FilterOptionGroup } from './search-options'
import type { SearchFilterContext } from './use-search-filter-context'
import { choiceChip, field } from '../ui/surfaces'
import { overline } from '../ui/typography'

const FILTER_FIELD = `${field} min-h-9 w-full min-w-0 px-2.5 py-1.5 text-body group-data-[layout=mobile]/filters:min-h-11 group-data-[layout=mobile]/filters:text-lead`
const LEGEND = `mb-2 p-0 ${overline}`
const DENSE_CHIPS =
  'grid grid-cols-[repeat(auto-fill,minmax(2.25rem,1fr))] gap-1.5 group-data-[layout=mobile]/filters:grid-cols-[repeat(auto-fill,minmax(2.6rem,1fr))]'
const CHIP_BASE = `${choiceChip} min-h-8 text-micro group-data-[layout=mobile]/filters:min-h-11 group-data-[layout=mobile]/filters:text-body`
const CHIP = `${CHIP_BASE} px-3`
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

/**
 * Los filtros de la búsqueda, de lo que más se usa a lo que menos: arriba, ocultar las prohibidas del formato, el atributo y el nivel (los que valen para el tipo
 * elegido) y el arquetipo; los demás (tipo exacto, raza y texto del efecto) se pliegan en «Más filtros», que arranca abierto si alguno está puesto. «Limpiar
 * filtros» sólo está cuando hay algo que limpiar (sin caja: descarta).
 */
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
  const moreCount = [filters.exactType, filters.race, filters.description].filter((value) => value.trim() !== '').length
  const [moreOpen, setMoreOpen] = useState(moreCount > 0)
  const moreId = `${id}-more`

  return (
    <div
      id={id}
      className="group/filters grid gap-4 p-3.5"
      data-layout={layout}
    >
      {/* El renglón no cambia de alto cuando aparece el botón de limpiar: nada se corre. */}
      <div className="flex min-h-9 items-center justify-between gap-2.5 border-b border-border-subtle pb-3 text-micro font-semibold text-muted pointer-coarse:min-h-11">
        <span>
          {activeFilterCount > 0 ? t('search.filters.active', { count: activeFilterCount }) : t('search.filters.none')}
        </span>
        {activeFilterCount > 0 ? (
          <Button variant="tertiary" size="sm" onClick={onClearFilters}>
            {t('search.filters.clear')}
          </Button>
        ) : null}
      </div>

      {context.formatAllowsLegalityFilter ? (
        <div className="flex items-center justify-between gap-3 py-1">
          <span className="grid min-w-0 gap-0.5">
            <strong className="text-body font-semibold text-foreground">{t('search.filters.hideBanned')}</strong>
            <small className="text-micro text-soft">{t('search.filters.basedOn', { format: context.formatLabel })}</small>
          </span>
          <Switch
            checked={filters.legalOnly}
            label={t('search.filters.hideBannedIn', { format: context.formatLabel })}
            onChange={(legalOnly) => onFilterChange({ legalOnly })}
          />
        </div>
      ) : null}

      {quickTypeMeta.showAttribute ? (
        <ChipGroup
          title={t('search.filters.attribute')}
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

      <Field label={t('search.filters.archetype')}>
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

      <div className="grid gap-3 border-t border-border-subtle pt-1">
        <button
          type="button"
          aria-expanded={moreOpen}
          aria-controls={moreId}
          className="flex min-h-11 w-full items-center justify-between gap-2 rounded-control px-1 text-left text-body font-semibold text-foreground focus-visible:outline-none focus-visible:shadow-focus"
          onClick={() => setMoreOpen((current) => !current)}
        >
          <span className="inline-flex items-center gap-2">
            {t('search.filters.more')}
            {moreCount > 0 ? <Badge tone="brand" size="sm">{moreCount}</Badge> : null}
          </span>
          <Icon name="chevron-down" size={18} className={cx('text-muted transition-transform duration-150 motion-reduce:transition-none', moreOpen && 'rotate-180')} />
        </button>

        {moreOpen ? (
          <div id={moreId} className="grid gap-3">
            <div className="grid grid-cols-2 gap-x-2.5 gap-y-2 max-[379px]:grid-cols-1">
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
            </div>

            <Field label={t('search.filters.effectText')}>
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
          </div>
        ) : null}
      </div>
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
      <div className={dense ? DENSE_CHIPS : 'flex flex-wrap gap-1.5'}>
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

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className="grid min-w-0 gap-1">
      <span className="text-micro font-semibold text-muted">{label}</span>
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
      <option value="">{t('search.filters.any')}</option>
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
