import { useId, type ReactNode } from 'react'

import { formatHasLimits } from '../../app/card-filters'
import type { CardSearchFilters, NumberRange } from '../../app/card-search'
import { formatInteger } from '../../app/utils'
import { t } from '../../i18n'
import type { DeckFormat } from '../../types'
import { Button } from '../ui/Button'
import { Switch } from '../ui/Switch'
import { SideDrawer } from '../ui/SideDrawer'
import { cx } from '../ui/cx'
import { choiceChip, field } from '../ui/surfaces'
import { overline } from '../ui/typography'
import { getDeckFormatLabel } from '../../app/deck-format'
import {
  ABILITY_OPTIONS,
  ATTRIBUTE_OPTIONS,
  EFFECT_OPTIONS,
  FRAME_OPTIONS,
  LIMIT_OPTIONS,
  MONSTER_RACE_OPTIONS,
  SPELL_TRAP_OPTIONS,
  type FilterOption,
} from './search-options'

const CHIP = cx(choiceChip, 'min-h-8 px-3 text-micro pointer-coarse:min-h-11 pointer-coarse:text-body')
const INPUT = cx(field, 'min-h-9 w-full min-w-0 px-2.5 py-1.5 text-body pointer-coarse:min-h-11')

interface SearchFiltersDrawerProps {
  isOpen: boolean
  onClose: () => void
  filters: CardSearchFilters
  deckFormat: DeckFormat
  activeFilterCount: number
  /** Cuántas cartas dan los filtros de ahora (para el botón de abajo); nada mientras se busca o si no hay criterio. */
  resultCount: number | null
  /** Hay más cartas por traer: el número es «N o más». */
  hasMore: boolean
  onFilterChange: (updates: Partial<CardSearchFilters>) => void
  onClearFilters: () => void
}

/** «Ver 14 resultados», «Ver 100+ resultados»; sin un número que dar (buscando, o sin nada que mostrar), «Ver resultados». */
export function viewResultsLabel(resultCount: number | null, hasMore: boolean): string {
  if (resultCount === null || resultCount === 0) {
    return t('search.mobile.viewResults')
  }

  return hasMore ? t('search.mobile.viewResultsMore', { n: formatInteger(resultCount) }) : t('search.mobile.viewResultsCount', { count: resultCount, n: formatInteger(resultCount) })
}

const toggle = (values: string[], value: string) => (values.includes(value) ? values.filter((item) => item !== value) : [...values, value])

/**
 * Los filtros de la búsqueda, en un cajón que se abre desde el botón de al lado del campo (el panel de búsqueda queda con sólo el campo y ese botón). Las secciones van
 * en este orden: marco, atributo, mágicas y trampas, tipo, habilidades, limitación, efecto y estadísticas; arriba, el arquetipo. Cada grupo de chips es de elección
 * múltiple (dentro del grupo vale cualquiera; entre grupos, todos). Abajo, limpiar y volver a los resultados diciendo cuántos son.
 */
export function SearchFiltersDrawer({ isOpen, onClose, filters, deckFormat, activeFilterCount, resultCount, hasMore, onFilterChange, onClearFilters }: SearchFiltersDrawerProps) {
  const limitsAvailable = formatHasLimits(deckFormat)
  const formatLabel = getDeckFormatLabel(deckFormat)

  return (
    <SideDrawer isOpen={isOpen} onClose={onClose} title={t('search.filters.title')} size="sheet">
      <div className="flex h-full min-h-0 flex-col">
        <div className="grid min-h-0 flex-1 content-start gap-5 overflow-y-auto overscroll-contain px-4 py-4 [scrollbar-width:thin]">
          <label className="grid gap-1">
            <span className={overline}>{t('search.filters.archetype')}</span>
            <input
              type="text"
              value={filters.archetype}
              onChange={(event) => onFilterChange({ archetype: event.target.value })}
              placeholder="Blue-Eyes"
              autoComplete="off"
              spellCheck={false}
              className={INPUT}
            />
          </label>

          <ChipSection title={t('search.filters.frame')} options={FRAME_OPTIONS} selected={filters.frames} onChange={(frames) => onFilterChange({ frames })} />
          <ChipSection title={t('search.filters.attribute')} options={ATTRIBUTE_OPTIONS} selected={filters.attributes} onChange={(attributes) => onFilterChange({ attributes })} />
          <ChipSection title={t('search.filters.spellTrap')} options={SPELL_TRAP_OPTIONS} selected={filters.spellTrapKinds} onChange={(spellTrapKinds) => onFilterChange({ spellTrapKinds })} />
          <ChipSection title={t('search.filters.monsterType')} options={MONSTER_RACE_OPTIONS} selected={filters.races} onChange={(races) => onFilterChange({ races })} />
          <ChipSection title={t('search.filters.abilities')} options={ABILITY_OPTIONS} selected={filters.abilities} onChange={(abilities) => onFilterChange({ abilities })} />

          {limitsAvailable ? (
            <Section title={t('search.filters.limit')}>
              <div className="flex items-center justify-between gap-3">
                <span className="grid min-w-0 gap-0.5">
                  <strong className="text-body font-semibold text-foreground">{t('search.filters.hideBanned')}</strong>
                  <small className="text-micro text-soft">{t('search.filters.basedOn', { format: formatLabel })}</small>
                </span>
                <Switch checked={filters.legalOnly} label={t('search.filters.hideBannedIn', { format: formatLabel })} onChange={(legalOnly) => onFilterChange({ legalOnly })} />
              </div>
              <Chips options={LIMIT_OPTIONS} selected={filters.limits} onChange={(limits) => onFilterChange({ limits })} />
            </Section>
          ) : null}

          <Section title={t('search.filters.effect')} hint={t('search.filters.effectHint')}>
            <Chips options={EFFECT_OPTIONS} selected={filters.effects} onChange={(effects) => onFilterChange({ effects })} />
            <label className="grid gap-1">
              <span className="text-micro font-semibold text-muted">{t('search.filters.effectText')}</span>
              <input
                type="text"
                value={filters.description}
                onChange={(event) => onFilterChange({ description: event.target.value })}
                placeholder="add 1"
                autoComplete="off"
                spellCheck={false}
                className={INPUT}
              />
            </label>
          </Section>

          <Section title={t('search.filters.stats')}>
            <RangeField label={t('search.filters.level')} range={filters.level} onChange={(level) => onFilterChange({ level })} />
            <RangeField label="ATK" range={filters.atk} onChange={(atk) => onFilterChange({ atk })} />
            <RangeField label="DEF" range={filters.def} onChange={(def) => onFilterChange({ def })} />
            {deckFormat === 'genesys' ? <RangeField label={t('search.filters.genesys')} range={filters.genesysPoints} onChange={(genesysPoints) => onFilterChange({ genesysPoints })} /> : null}
          </Section>
        </div>

        {/* Limpiar a la izquierda (descarta: sin caja) y, ocupando el resto, la acción principal: volver a los resultados diciendo cuántos son (el número y la acción, juntos). */}
        <footer className="flex min-h-18 items-center gap-3 border-t border-border-subtle px-4 pb-[max(0.75rem,env(safe-area-inset-bottom))] pt-3">
          {activeFilterCount > 0 ? (
            <Button variant="tertiary" size="md" className="shrink-0" onClick={onClearFilters}>
              {t('search.filters.clear')}
            </Button>
          ) : null}
          <Button variant="primary" size="md" className="min-w-0 flex-1" onClick={onClose}>
            {viewResultsLabel(resultCount, hasMore)}
          </Button>
        </footer>
      </div>
    </SideDrawer>
  )
}

/** Una sección del cajón: su título (como el de las del cajón de los menús) y, abajo, lo que lleva; las separa una línea fina, no una caja. */
function Section({ title, hint, children }: { title: string; hint?: string; children: ReactNode }) {
  const id = useId()

  return (
    <section aria-labelledby={id} className="grid gap-2 border-t border-border-subtle pt-4">
      <h3 id={id} className={cx(overline, 'm-0')}>
        {title}
      </h3>
      {hint ? <p className="m-0 text-micro text-soft">{hint}</p> : null}
      {children}
    </section>
  )
}

function ChipSection({ title, options, selected, onChange }: { title: string; options: FilterOption[]; selected: string[]; onChange: (values: string[]) => void }) {
  return (
    <Section title={title}>
      <Chips options={options} selected={selected} onChange={onChange} />
    </Section>
  )
}

/** Chips de elección múltiple: un toque suma, otro toque sobre el elegido lo quita. */
function Chips({ options, selected, onChange }: { options: FilterOption[]; selected: string[]; onChange: (values: string[]) => void }) {
  return (
    <div className="flex flex-wrap gap-1.5">
      {options.map((option) => (
        <button key={option.value} type="button" className={CHIP} aria-pressed={selected.includes(option.value)} onClick={() => onChange(toggle(selected, option.value))}>
          {option.label}
        </button>
      ))}
    </div>
  )
}

/** Mínimo y máximo de una estadística: sólo dígitos; vacío no pone cota. */
function RangeField({ label, range, onChange }: { label: string; range: NumberRange; onChange: (range: NumberRange) => void }) {
  const digits = (value: string) => value.replace(/\D/g, '')

  return (
    <div className="grid grid-cols-[9rem_minmax(0,1fr)_minmax(0,1fr)] items-center gap-2">
      <span className="text-body font-semibold text-foreground">{label}</span>
      <input
        type="text"
        inputMode="numeric"
        autoComplete="off"
        aria-label={t('search.filters.rangeMin', { label })}
        placeholder={t('search.filters.min')}
        value={range.min}
        onChange={(event) => onChange({ ...range, min: digits(event.target.value) })}
        className={INPUT}
      />
      <input
        type="text"
        inputMode="numeric"
        autoComplete="off"
        aria-label={t('search.filters.rangeMax', { label })}
        placeholder={t('search.filters.max')}
        value={range.max}
        onChange={(event) => onChange({ ...range, max: digits(event.target.value) })}
        className={INPUT}
      />
    </div>
  )
}
