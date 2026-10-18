import { useId, type ReactNode } from 'react'

import { formatHasLimits } from '../../app/card-filters'
import type { CardSearchFilters, NumberRange } from '../../app/card-search'
import { getDeckFormatLabel } from '../../app/deck-format'
import { formatInteger } from '../../app/utils'
import { t } from '../../i18n'
import type { DeckFormat } from '../../types'
import { Button } from '../ui/Button'
import { MultiSelect } from '../ui/MultiSelect'
import { SideDrawer } from '../ui/SideDrawer'
import { Switch } from '../ui/Switch'
import { cx } from '../ui/cx'
import { field } from '../ui/surfaces'
import { overline } from '../ui/typography'
import {
  ABILITY_OPTIONS,
  ATTRIBUTE_OPTIONS,
  EFFECT_OPTIONS,
  FRAME_OPTIONS,
  LIMIT_OPTIONS,
  MONSTER_RACE_OPTIONS,
  POOL_OPTIONS,
  SPELL_TRAP_OPTIONS,
} from './search-options'

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

/**
 * Los filtros de la búsqueda, en un cajón que se abre desde el botón de al lado del campo (el panel de búsqueda queda con sólo el campo y ese botón). Arriba, el arquetipo;
 * después, un selector desplegable por filtro, en este orden: marco, atributo, mágicas y trampas, tipo, habilidades, limitación, pool de cartas y efecto; y las
 * estadísticas (nivel, ATK, DEF, escala de Péndulo, puntos de Genesys y año de salida), con mínimo y máximo. Cada desplegable es de elección múltiple (dentro de un filtro vale cualquiera; entre filtros, todos). Abajo, limpiar y volver a los resultados diciendo cuántos son.
 */
export function SearchFiltersDrawer({ isOpen, onClose, filters, deckFormat, activeFilterCount, resultCount, hasMore, onFilterChange, onClearFilters }: SearchFiltersDrawerProps) {
  const limitsAvailable = formatHasLimits(deckFormat)
  const formatLabel = getDeckFormatLabel(deckFormat)

  return (
    <SideDrawer isOpen={isOpen} onClose={onClose} title={t('search.filters.title')} size="sheet">
      <div className="flex h-full min-h-0 flex-col">
        <div className="grid min-h-0 flex-1 content-start gap-4 overflow-y-auto overscroll-contain px-4 py-4 [scrollbar-width:thin]">
          <label className="grid gap-1.5">
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

          <MultiSelect label={t('search.filters.frame')} options={FRAME_OPTIONS} selected={filters.frames} onChange={(frames) => onFilterChange({ frames })} />
          <MultiSelect label={t('search.filters.attribute')} options={ATTRIBUTE_OPTIONS} selected={filters.attributes} onChange={(attributes) => onFilterChange({ attributes })} />
          <MultiSelect label={t('search.filters.spellTrap')} options={SPELL_TRAP_OPTIONS} selected={filters.spellTrapKinds} onChange={(spellTrapKinds) => onFilterChange({ spellTrapKinds })} />
          <MultiSelect label={t('search.filters.monsterType')} options={MONSTER_RACE_OPTIONS} selected={filters.races} onChange={(races) => onFilterChange({ races })} />
          <MultiSelect label={t('search.filters.abilities')} options={ABILITY_OPTIONS} selected={filters.abilities} onChange={(abilities) => onFilterChange({ abilities })} />

          {limitsAvailable ? (
            <div className="grid gap-3">
              <MultiSelect label={t('search.filters.limit')} options={LIMIT_OPTIONS} selected={filters.limits} onChange={(limits) => onFilterChange({ limits })} />
              <div className="flex items-center justify-between gap-3">
                <span className="grid min-w-0 gap-0.5">
                  <strong className="text-body font-semibold text-foreground">{t('search.filters.hideBanned')}</strong>
                  <small className="text-micro text-soft">{t('search.filters.basedOn', { format: formatLabel })}</small>
                </span>
                <Switch checked={filters.legalOnly} label={t('search.filters.hideBannedIn', { format: formatLabel })} onChange={(legalOnly) => onFilterChange({ legalOnly })} />
              </div>
            </div>
          ) : null}

          <MultiSelect label={t('search.filters.pool')} options={POOL_OPTIONS} selected={filters.pools} onChange={(pools) => onFilterChange({ pools })} />

          <div className="grid gap-2">
            <MultiSelect label={t('search.filters.effect')} options={EFFECT_OPTIONS} selected={filters.effects} onChange={(effects) => onFilterChange({ effects })} />
            <p className="m-0 text-micro text-soft">{t('search.filters.effectHint')}</p>
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
          </div>

          <Section title={t('search.filters.stats')}>
            <RangeField label={t('search.filters.level')} range={filters.level} onChange={(level) => onFilterChange({ level })} />
            <RangeField label="ATK" range={filters.atk} onChange={(atk) => onFilterChange({ atk })} />
            <RangeField label="DEF" range={filters.def} onChange={(def) => onFilterChange({ def })} />
            <RangeField label={t('search.filters.scale')} range={filters.scale} onChange={(scale) => onFilterChange({ scale })} />
            {deckFormat === 'genesys' ? <RangeField label={t('search.filters.genesys')} range={filters.genesysPoints} onChange={(genesysPoints) => onFilterChange({ genesysPoints })} /> : null}
            <RangeField label={t('search.filters.year')} range={filters.year} onChange={(year) => onFilterChange({ year })} />
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

/** Una sección con su título (las estadísticas, que no son un desplegable) y, arriba, una línea fina que la separa; no una caja. */
function Section({ title, children }: { title: string; children: ReactNode }) {
  const id = useId()

  return (
    <section aria-labelledby={id} className="grid gap-2 border-t border-border-subtle pt-4">
      <h3 id={id} className={cx(overline, 'm-0')}>
        {title}
      </h3>
      {children}
    </section>
  )
}

/** Mínimo y máximo de una estadística: sólo dígitos; vacío no pone cota. */
function RangeField({ label, range, onChange }: { label: string; range: NumberRange; onChange: (range: NumberRange) => void }) {
  const digits = (value: string) => value.replace(/\D/g, '')

  return (
    <div className="grid grid-cols-[10rem_minmax(0,1fr)_minmax(0,1fr)] items-center gap-2">
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
