import {
  useEffect,
  useMemo,
  useState,
  type PointerEvent as ReactPointerEvent,
  type ReactNode,
} from 'react'

import {
  buildCompactSearchDescription,
  formatSearchError,
  type CardSearchFilters,
  type SearchQuickTypeFilter,
} from '../app/card-search'
import { buildFormatLimitLabel, getDeckFormatLabel } from '../app/deck-format'
import { SEARCH_MIN_QUERY_LENGTH, SEARCH_STICKY_TOP_PX } from '../app/model'
import { formatInteger } from '../app/utils'
import type { DeckFormat } from '../types'
import type { ApiCardSearchResult } from '../ygoprodeck'
import { CardArt } from './CardArt'
import { Button } from './ui/Button'

interface FilterOption {
  value: string
  label: string
}

interface FilterOptionGroup {
  label: string
  options: FilterOption[]
}

interface QuickTypeMeta {
  exactTypeLabel: string
  raceLabel: string
  levelLabel: string
  showAttribute: boolean
  showLevel: boolean
}

interface ActiveFilterChip {
  key: string
  label: string
  value: string
  updates: Partial<CardSearchFilters>
}

interface SearchPanelProps {
  layoutMode: 'desktop' | 'mobile'
  deckFormat: DeckFormat
  query: string
  status: 'idle' | 'loading' | 'success' | 'error'
  results: ApiCardSearchResult[]
  errorMessage: string
  page: number
  hasMore: boolean
  rawResultCount: number
  activeDragSearchCardId: number | null
  dragEnabled?: boolean
  filters: CardSearchFilters
  activeFilterCount: number
  hasSearchCriteria: boolean
  onQueryChange: (value: string) => void
  onFilterChange: (updates: Partial<CardSearchFilters>) => void
  onClearFilters: () => void
  onPrevPage: () => void
  onNextPage: () => void
  onResultClick: (apiCardId: number) => void
  onSearchCardPointerDown: (event: ReactPointerEvent<HTMLElement>, apiCardId: number) => void
  onHoverStart: (name: string, card: ApiCardSearchResult, anchor: HTMLElement) => void
  onHoverEnd: () => void
}

const QUICK_TYPE_OPTIONS: Array<{ value: SearchQuickTypeFilter; label: string }> = [
  { value: 'all', label: 'Todas' },
  { value: 'monster', label: 'Monstruos' },
  { value: 'spell', label: 'Magias' },
  { value: 'trap', label: 'Trampas' },
  { value: 'extra', label: 'Extra' },
]

const QUICK_TYPE_LABELS: Record<SearchQuickTypeFilter, string> = {
  all: 'Todas',
  monster: 'Monstruos',
  spell: 'Magias',
  trap: 'Trampas',
  extra: 'Extra',
}

const QUICK_TYPE_META: Record<SearchQuickTypeFilter, QuickTypeMeta> = {
  all: {
    exactTypeLabel: 'Tipo exacto',
    raceLabel: 'Raza / subtipo',
    levelLabel: 'Nivel / rango',
    showAttribute: true,
    showLevel: true,
  },
  monster: {
    exactTypeLabel: 'Tipo de monstruo',
    raceLabel: 'Raza',
    levelLabel: 'Nivel / rango',
    showAttribute: true,
    showLevel: true,
  },
  spell: {
    exactTypeLabel: 'Tipo de carta',
    raceLabel: 'Subtipo',
    levelLabel: 'Nivel / rango',
    showAttribute: false,
    showLevel: false,
  },
  trap: {
    exactTypeLabel: 'Tipo de carta',
    raceLabel: 'Subtipo',
    levelLabel: 'Nivel / rango',
    showAttribute: false,
    showLevel: false,
  },
  extra: {
    exactTypeLabel: 'Tipo de Extra',
    raceLabel: 'Raza',
    levelLabel: 'Nivel / rango',
    showAttribute: true,
    showLevel: true,
  },
}

const ATTRIBUTE_OPTIONS: FilterOption[] = [
  { value: '', label: 'Cualquiera' },
  { value: 'DARK', label: 'DARK' },
  { value: 'LIGHT', label: 'LIGHT' },
  { value: 'FIRE', label: 'FIRE' },
  { value: 'WATER', label: 'WATER' },
  { value: 'EARTH', label: 'EARTH' },
  { value: 'WIND', label: 'WIND' },
  { value: 'DIVINE', label: 'DIVINE' },
]

const MONSTER_EXACT_TYPE_OPTIONS: FilterOption[] = [
  { value: 'Normal Monster', label: 'Normal Monster' },
  { value: 'Normal Tuner Monster', label: 'Normal Tuner Monster' },
  { value: 'Effect Monster', label: 'Effect Monster' },
  { value: 'Tuner Monster', label: 'Tuner Monster' },
  { value: 'Flip Monster', label: 'Flip Monster' },
  { value: 'Flip Effect Monster', label: 'Flip Effect Monster' },
  { value: 'Spirit Monster', label: 'Spirit Monster' },
  { value: 'Union Effect Monster', label: 'Union Effect Monster' },
  { value: 'Gemini Monster', label: 'Gemini Monster' },
  { value: 'Pendulum Effect Monster', label: 'Pendulum Effect Monster' },
  { value: 'Pendulum Normal Monster', label: 'Pendulum Normal Monster' },
  { value: 'Pendulum Effect Ritual Monster', label: 'Pendulum Effect Ritual Monster' },
  { value: 'Pendulum Tuner Effect Monster', label: 'Pendulum Tuner Effect Monster' },
  { value: 'Ritual Monster', label: 'Ritual Monster' },
  { value: 'Ritual Effect Monster', label: 'Ritual Effect Monster' },
  { value: 'Toon Monster', label: 'Toon Monster' },
  { value: 'Fusion Monster', label: 'Fusion Monster' },
  { value: 'Synchro Monster', label: 'Synchro Monster' },
  { value: 'Synchro Tuner Monster', label: 'Synchro Tuner Monster' },
  { value: 'Synchro Pendulum Effect Monster', label: 'Synchro Pendulum Effect Monster' },
  { value: 'XYZ Monster', label: 'XYZ Monster' },
  { value: 'XYZ Pendulum Effect Monster', label: 'XYZ Pendulum Effect Monster' },
  { value: 'Link Monster', label: 'Link Monster' },
  { value: 'Pendulum Flip Effect Monster', label: 'Pendulum Flip Effect Monster' },
  { value: 'Pendulum Effect Fusion Monster', label: 'Pendulum Effect Fusion Monster' },
]

const SPELL_TRAP_EXACT_TYPE_OPTIONS: FilterOption[] = [
  { value: 'Spell Card', label: 'Spell Card' },
  { value: 'Trap Card', label: 'Trap Card' },
]

const OTHER_EXACT_TYPE_OPTIONS: FilterOption[] = [
  { value: 'Skill Card', label: 'Skill Card' },
  { value: 'Token', label: 'Token' },
]

const MONSTER_RACE_OPTIONS: FilterOption[] = [
  { value: 'Aqua', label: 'Aqua' },
  { value: 'Beast', label: 'Beast' },
  { value: 'Beast-Warrior', label: 'Beast-Warrior' },
  { value: 'Creator God', label: 'Creator God' },
  { value: 'Cyberse', label: 'Cyberse' },
  { value: 'Dinosaur', label: 'Dinosaur' },
  { value: 'Divine-Beast', label: 'Divine-Beast' },
  { value: 'Dragon', label: 'Dragon' },
  { value: 'Fairy', label: 'Fairy' },
  { value: 'Fiend', label: 'Fiend' },
  { value: 'Fish', label: 'Fish' },
  { value: 'Illusion', label: 'Illusion' },
  { value: 'Insect', label: 'Insect' },
  { value: 'Machine', label: 'Machine' },
  { value: 'Plant', label: 'Plant' },
  { value: 'Psychic', label: 'Psychic' },
  { value: 'Pyro', label: 'Pyro' },
  { value: 'Reptile', label: 'Reptile' },
  { value: 'Rock', label: 'Rock' },
  { value: 'Sea Serpent', label: 'Sea Serpent' },
  { value: 'Spellcaster', label: 'Spellcaster' },
  { value: 'Thunder', label: 'Thunder' },
  { value: 'Warrior', label: 'Warrior' },
  { value: 'Winged Beast', label: 'Winged Beast' },
  { value: 'Wyrm', label: 'Wyrm' },
  { value: 'Zombie', label: 'Zombie' },
]

const SPELL_RACE_OPTIONS: FilterOption[] = [
  { value: 'Normal', label: 'Normal' },
  { value: 'Continuous', label: 'Continuous' },
  { value: 'Equip', label: 'Equip' },
  { value: 'Field', label: 'Field' },
  { value: 'Quick-Play', label: 'Quick-Play' },
  { value: 'Ritual', label: 'Ritual' },
]

const TRAP_RACE_OPTIONS: FilterOption[] = [
  { value: 'Normal', label: 'Normal' },
  { value: 'Continuous', label: 'Continuous' },
  { value: 'Counter', label: 'Counter' },
]

const EXTRA_EXACT_TYPE_VALUES = new Set([
  'Fusion Monster',
  'Synchro Monster',
  'Synchro Tuner Monster',
  'Synchro Pendulum Effect Monster',
  'XYZ Monster',
  'XYZ Pendulum Effect Monster',
  'Link Monster',
  'Pendulum Effect Fusion Monster',
])

export function SearchPanel({
  layoutMode,
  deckFormat,
  query,
  status,
  results,
  errorMessage,
  page,
  hasMore,
  rawResultCount,
  activeDragSearchCardId,
  dragEnabled = true,
  filters,
  activeFilterCount,
  hasSearchCriteria,
  onQueryChange,
  onFilterChange,
  onClearFilters,
  onPrevPage,
  onNextPage,
  onResultClick,
  onSearchCardPointerDown,
  onHoverStart,
  onHoverEnd,
}: SearchPanelProps) {
  const [drawerOpen, setDrawerOpen] = useState(false)
  const formatLabel = getDeckFormatLabel(deckFormat)
  const formatAllowsLegalityFilter = deckFormat !== 'unlimited' && deckFormat !== 'genesys'
  const isDesktopLayout = layoutMode === 'desktop'
  const quickTypeMeta = QUICK_TYPE_META[filters.quickType]
  const exactTypeGroups = useMemo(() => getExactTypeFilterGroups(filters.quickType), [filters.quickType])
  const raceGroups = useMemo(() => getRaceFilterGroups(filters.quickType), [filters.quickType])
  const shouldShowResults = hasSearchCriteria
  const filteredCountLabel =
    rawResultCount === results.length
      ? `${formatInteger(results.length)} resultados`
      : `${formatInteger(results.length)} de ${formatInteger(rawResultCount)} resultados`
  const metaLabel = `Pagina ${formatInteger(page + 1)} · ${filteredCountLabel}`
  const sanitizedFilterUpdates = useMemo(
    () =>
      buildSanitizedFilterUpdates({
        filters,
        exactTypeGroups,
        raceGroups,
        formatAllowsLegalityFilter,
        showAttribute: quickTypeMeta.showAttribute,
        showLevel: quickTypeMeta.showLevel,
      }),
    [
      exactTypeGroups,
      filters,
      formatAllowsLegalityFilter,
      quickTypeMeta.showAttribute,
      quickTypeMeta.showLevel,
      raceGroups,
    ],
  )
  const activeFilterChips = useMemo(
    () =>
      buildActiveFilterChips({
        filters,
        formatAllowsLegalityFilter,
        formatLabel,
        raceLabel: quickTypeMeta.raceLabel,
      }),
    [filters, formatAllowsLegalityFilter, formatLabel, quickTypeMeta.raceLabel],
  )
  const localFiltersAffectedPage = rawResultCount !== results.length

  useEffect(() => {
    if (sanitizedFilterUpdates) {
      onFilterChange(sanitizedFilterUpdates)
    }
  }, [onFilterChange, sanitizedFilterUpdates])

  useEffect(() => {
    if (!drawerOpen) {
      return
    }

    const previousOverflow = document.body.style.overflow
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setDrawerOpen(false)
      }
    }

    document.body.style.overflow = 'hidden'
    window.addEventListener('keydown', handleKeyDown)

    return () => {
      document.body.style.overflow = previousOverflow
      window.removeEventListener('keydown', handleKeyDown)
    }
  }, [drawerOpen])

  return (
    <>
      <article
        className={[
          'surface-panel-soft self-start min-h-0 overflow-hidden p-2',
          isDesktopLayout ? 'sticky' : 'h-full',
        ].join(' ')}
        style={
          isDesktopLayout
            ? {
                top: SEARCH_STICKY_TOP_PX,
                height: `calc(100dvh - ${SEARCH_STICKY_TOP_PX}px)`,
              }
            : undefined
        }
      >
        <div
          className="grid h-full min-h-0 content-start gap-2"
          style={{
            gridTemplateRows: shouldShowResults ? 'auto auto minmax(0, 1fr)' : undefined,
          }}
        >
          <div className="grid gap-1">
            <span className="app-soft text-[0.66rem] uppercase tracking-[0.12em]">Buscar cartas</span>
            <label className="relative block">
              <input
                type="text"
                value={query}
                onChange={(event) => onQueryChange(event.target.value)}
                placeholder="Buscar por nombre parcial o texto en efecto"
                autoComplete="off"
                spellCheck={false}
                className="app-field w-full px-2.5 py-2.5 pr-10 text-[0.86rem]"
              />
              {status === 'loading' ? (
                <span className="pointer-events-none absolute right-3 top-1/2 -mt-[0.475rem] h-[0.95rem] w-[0.95rem] animate-spin rounded-full border-2 border-[rgb(var(--foreground-rgb)/0.18)] border-t-[var(--primary)]" />
              ) : null}
            </label>
          </div>

          <div className="surface-card grid gap-2 p-2.5">
            <div className="flex flex-wrap items-start justify-between gap-2">
              <div className="grid gap-0.5">
                <strong className="text-[0.8rem] text-[var(--text-main)]">Filtros</strong>
                <span className="text-[0.7rem] leading-[1.15] text-[var(--text-muted)]">
                  {activeFilterCount > 0
                    ? `${formatInteger(activeFilterCount)} activo${activeFilterCount === 1 ? '' : 's'}`
                    : `Escribi ${formatInteger(SEARCH_MIN_QUERY_LENGTH)} letras o usa opciones avanzadas.`}
                </span>
              </div>

              <div className="flex flex-wrap gap-1.5">
                <Button
                  variant={activeFilterCount > 0 ? 'primary' : 'secondary'}
                  size="sm"
                  onClick={() => setDrawerOpen(true)}
                >
                  {activeFilterCount > 0
                    ? `Opciones avanzadas (${formatInteger(activeFilterCount)})`
                    : 'Opciones avanzadas'}
                </Button>
                {activeFilterCount > 0 ? (
                  <Button variant="tertiary" size="sm" onClick={onClearFilters}>
                    Limpiar
                  </Button>
                ) : null}
              </div>
            </div>

            {activeFilterChips.length > 0 ? (
              <div className="flex flex-wrap gap-1.5">
                {activeFilterChips.map((chip) => (
                  <button
                    key={chip.key}
                    type="button"
                    className="search-active-chip"
                    onClick={() => onFilterChange(chip.updates)}
                    title={`Quitar ${chip.label.toLowerCase()}`}
                  >
                    <span className="search-active-chip-label">{chip.label}</span>
                    <span className="truncate text-[var(--text-main)]">{chip.value}</span>
                    <span className="shrink-0 text-[var(--text-soft)]">x</span>
                  </button>
                ))}
              </div>
            ) : (
              <p className="m-0 text-[0.72rem] leading-[1.16] text-[var(--text-muted)]">
                Abri el drawer para filtrar por vista, arquetipo, tipo, subtipo, atributo, nivel o legalidad.
              </p>
            )}
          </div>

          {shouldShowResults ? (
            <div
              className="grid min-h-0 content-start gap-2 overflow-hidden"
              style={{
                gridTemplateRows: status === 'error' ? undefined : 'auto minmax(0, 1fr)',
              }}
            >
              {status === 'error' ? (
                <p className="surface-card-danger m-0 px-2.5 py-2 text-[0.82rem] leading-[1.16] text-[var(--destructive)]">
                  {formatSearchError(errorMessage)}
                </p>
              ) : (
                <>
                  <div className="surface-card grid gap-1.5 px-2.5 py-2">
                    <div className="flex items-start justify-between gap-2">
                      <div className="grid gap-0.5">
                        <span className="app-soft text-[0.62rem] uppercase tracking-[0.12em]">Resultados</span>
                        <strong className="text-[0.78rem] text-[var(--text-main)]">{metaLabel}</strong>
                      </div>
                      <div className="flex gap-2">
                        {page > 0 ? (
                          <Button variant="secondary" size="sm" onClick={onPrevPage}>
                            Anterior
                          </Button>
                        ) : null}
                        {hasMore ? (
                          <Button variant="secondary" size="sm" onClick={onNextPage}>
                            Siguiente
                          </Button>
                        ) : null}
                      </div>
                    </div>

                    <p className="m-0 text-[0.68rem] leading-[1.14] text-[var(--text-muted)]">
                      {localFiltersAffectedPage
                        ? 'Texto EN y/o legalidad redujeron esta pagina respecto del resultado remoto.'
                        : 'Click agrega la carta. Si arrastras, la podes soltar directo en Main, Extra o Side.'}
                    </p>
                  </div>

                  {status === 'loading' ? (
                    <div className="grid min-h-0 content-start gap-2 overflow-y-auto overflow-x-hidden pr-1">
                      {Array.from({ length: 8 }, (_, index) => (
                        <article
                          key={index}
                          className="app-list-item grid grid-cols-[42px_minmax(0,1fr)] items-center gap-2 p-1.5"
                          aria-hidden="true"
                        >
                          <div className="aspect-[0.72] w-[42px] animate-pulse bg-[var(--input)]" />
                          <div className="grid gap-2">
                            <span className="block h-3.5 w-[85%] animate-pulse bg-[var(--input)]" />
                            <span className="block h-2.5 w-[62%] animate-pulse bg-[var(--input)]" />
                          </div>
                        </article>
                      ))}
                    </div>
                  ) : results.length === 0 ? (
                    <p className="surface-card m-0 min-h-0 overflow-y-auto px-2.5 py-2 text-[0.82rem] leading-[1.18] text-[var(--text-muted)]">
                      No se encontraron cartas con esos criterios.
                    </p>
                  ) : (
                    <div className="grid min-h-0 content-start gap-2 overflow-y-auto overflow-x-hidden pr-1">
                      {results.map((card) => {
                        const detailChips = buildSearchResultDetailChips(card)
                        const formatLimitLabel = buildFormatLimitLabel(card, deckFormat)

                        return (
                          <article
                            key={card.ygoprodeckId}
                            className={[
                              'app-list-item grid w-full min-w-0 select-none grid-cols-[42px_minmax(0,1fr)] items-center gap-2 p-1.5 transition-all duration-150 ease-out will-change-transform',
                              dragEnabled ? 'cursor-grab touch-none' : '',
                              activeDragSearchCardId === card.ygoprodeckId ? 'opacity-35' : '',
                            ].join(' ')}
                            onClick={() => onResultClick(card.ygoprodeckId)}
                            onPointerDown={(event) => {
                              if (!dragEnabled) {
                                return
                              }

                              onSearchCardPointerDown(event, card.ygoprodeckId)
                            }}
                            onMouseEnter={(event) => onHoverStart(card.name, card, event.currentTarget)}
                            onMouseLeave={onHoverEnd}
                          >
                            <div className="w-[42px]" data-drag-preview-source="true">
                              <CardArt
                                remoteUrl={card.imageUrlSmall}
                                name={card.name}
                                className="block aspect-[0.72] w-[42px] bg-[var(--input)] object-cover"
                                limitCard={card}
                                limitBadgeSize="sm"
                              />
                            </div>

                            <div className="flex min-w-0 flex-col gap-[0.28rem]">
                              <strong className="text-[0.8rem] leading-[1.08] break-words text-[var(--text-main)]">
                                {card.name}
                              </strong>
                              <p className="m-0 text-[0.72rem] leading-[1.12] break-words text-[var(--text-main)]">
                                {buildCompactSearchDescription(card)}
                              </p>
                              {detailChips.length > 0 ? (
                                <div className="flex flex-wrap gap-1">
                                  {detailChips.map((chip) => (
                                    <span key={`${card.ygoprodeckId}-${chip}`} className="search-result-chip">
                                      {chip}
                                    </span>
                                  ))}
                                </div>
                              ) : null}
                              {formatLimitLabel ? (
                                <small className="text-[0.68rem] text-[var(--text-muted)]">
                                  {formatLimitLabel}
                                </small>
                              ) : null}
                            </div>
                          </article>
                        )
                      })}
                    </div>
                  )}
                </>
              )}
            </div>
          ) : null}
        </div>
      </article>

      {drawerOpen ? (
        <div
          className="fixed inset-0 z-160 overflow-x-hidden bg-[rgb(var(--background-rgb)/0.76)] backdrop-blur-[2px]"
          onClick={() => setDrawerOpen(false)}
        >
          <div className="absolute inset-0 flex w-full max-w-screen min-[1101px]:inset-y-0 min-[1101px]:right-0 min-[1101px]:w-full min-[1101px]:max-w-[25rem]">
            <aside
              className="surface-panel flex h-full w-full min-h-0 flex-col gap-3 overflow-hidden border-l border-[rgb(var(--primary-rgb)/0.22)] p-3 min-[1101px]:w-80"
              onClick={(event) => event.stopPropagation()}
            >
              <div className="flex items-start justify-between gap-3 border-b border-(--border-subtle) pb-2">
                <div className="grid gap-0.5">
                  <strong className="text-[1rem] text-[var(--text-main)]">Opciones avanzadas</strong>
                  <span className="text-[0.72rem] leading-[1.14] text-[var(--text-muted)]">
                    Ajusta filtros sin recargar el layout principal.
                  </span>
                </div>
                <button
                  type="button"
                  className="app-icon-button text-[1.1rem]"
                  onClick={() => setDrawerOpen(false)}
                  aria-label="Cerrar opciones avanzadas"
                >
                  ×
                </button>
              </div>

              <div className="surface-card grid gap-2 px-2.5 py-2">
                <div className="flex items-start justify-between gap-2">
                  <div className="grid gap-0.5">
                    <span className="app-soft text-[0.62rem] uppercase tracking-[0.12em]">Resumen</span>
                    <strong className="text-[0.78rem] text-[var(--text-main)]">
                      {activeFilterCount > 0
                        ? `${formatInteger(activeFilterCount)} filtro${activeFilterCount === 1 ? '' : 's'} activo${activeFilterCount === 1 ? '' : 's'}`
                        : 'Sin filtros activos'}
                    </strong>
                  </div>
                  {activeFilterCount > 0 ? (
                    <Button variant="tertiary" size="sm" onClick={onClearFilters}>
                      Resetear
                    </Button>
                  ) : null}
                </div>

                {activeFilterChips.length > 0 ? (
                  <div className="flex flex-wrap gap-1.5">
                    {activeFilterChips.map((chip) => (
                      <button
                        key={chip.key}
                        type="button"
                        className="search-active-chip"
                        onClick={() => onFilterChange(chip.updates)}
                        title={`Quitar ${chip.label.toLowerCase()}`}
                      >
                        <span className="search-active-chip-label">{chip.label}</span>
                        <span className="truncate text-[var(--text-main)]">{chip.value}</span>
                        <span className="shrink-0 text-[var(--text-soft)]">x</span>
                      </button>
                    ))}
                  </div>
                ) : (
                  <p className="m-0 text-[0.7rem] leading-[1.16] text-[var(--text-muted)]">
                    Usa las secciones desplegables para combinar criterios.
                  </p>
                )}
              </div>

              <div className="grid min-h-0 flex-1 content-start gap-2 overflow-y-auto pr-1">
                <FilterDrawerSection
                  title="Vista rapida"
                  summary={QUICK_TYPE_LABELS[filters.quickType]}
                  defaultOpen={filters.quickType !== 'all' || activeFilterCount === 0}
                >
                  <div className="flex flex-wrap gap-1.5">
                    {QUICK_TYPE_OPTIONS.map((option) => (
                      <Button
                        key={option.value}
                        variant={filters.quickType === option.value ? 'primary' : 'secondary'}
                        size="sm"
                        onClick={() => onFilterChange({ quickType: option.value })}
                      >
                        {option.label}
                      </Button>
                    ))}
                  </div>
                </FilterDrawerSection>

                <FilterDrawerSection
                  title="Arquetipo y texto"
                  summary={buildSectionSummary([
                    filters.archetype.trim().length > 0 ? `Arquetipo: ${filters.archetype.trim()}` : '',
                    filters.description.trim().length > 0 ? `Texto EN: ${filters.description.trim()}` : '',
                  ])}
                  defaultOpen={
                    filters.archetype.trim().length > 0 || filters.description.trim().length > 0
                  }
                >
                  <label className="grid gap-1">
                    <span className="app-soft text-[0.64rem] uppercase tracking-[0.12em]">Arquetipo</span>
                    <input
                      type="text"
                      value={filters.archetype}
                      onChange={(event) => onFilterChange({ archetype: event.target.value })}
                      placeholder="Ej: Blue-Eyes"
                      autoComplete="off"
                      spellCheck={false}
                      className="app-field w-full px-2 py-[0.5rem] text-[0.8rem]"
                    />
                  </label>

                  <label className="grid gap-1">
                    <span className="app-soft text-[0.64rem] uppercase tracking-[0.12em]">Texto en efecto (EN) - filtra resultados</span>
                    <input
                      type="text"
                      value={filters.description}
                      onChange={(event) => onFilterChange({ description: event.target.value })}
                      placeholder="Ej: add 1"
                      autoComplete="off"
                      spellCheck={false}
                      className="app-field w-full px-2 py-[0.5rem] text-[0.8rem]"
                    />
                  </label>
                </FilterDrawerSection>

                <FilterDrawerSection
                  title="Tipo y subtipo"
                  summary={buildSectionSummary([
                    filters.exactType.trim().length > 0 ? filters.exactType.trim() : '',
                    filters.race.trim().length > 0 ? filters.race.trim() : '',
                  ])}
                  defaultOpen={filters.exactType.trim().length > 0 || filters.race.trim().length > 0}
                >
                  <label className="grid gap-1">
                    <span className="app-soft text-[0.64rem] uppercase tracking-[0.12em]">
                      {quickTypeMeta.exactTypeLabel}
                    </span>
                    <select
                      value={filters.exactType}
                      onChange={(event) => onFilterChange({ exactType: event.target.value })}
                      className="app-field w-full px-2 py-[0.5rem] text-[0.8rem]"
                    >
                      <option value="">Cualquiera</option>
                      {exactTypeGroups.map((group) => (
                        <optgroup key={group.label} label={group.label}>
                          {group.options.map((option) => (
                            <option key={option.value} value={option.value}>
                              {option.label}
                            </option>
                          ))}
                        </optgroup>
                      ))}
                    </select>
                  </label>

                  <label className="grid gap-1">
                    <span className="app-soft text-[0.64rem] uppercase tracking-[0.12em]">
                      {quickTypeMeta.raceLabel}
                    </span>
                    <select
                      value={filters.race}
                      onChange={(event) => onFilterChange({ race: event.target.value })}
                      className="app-field w-full px-2 py-[0.5rem] text-[0.8rem]"
                    >
                      <option value="">Cualquiera</option>
                      {raceGroups.map((group) => (
                        <optgroup key={group.label} label={group.label}>
                          {group.options.map((option) => (
                            <option key={option.value} value={option.value}>
                              {option.label}
                            </option>
                          ))}
                        </optgroup>
                      ))}
                    </select>
                  </label>
                </FilterDrawerSection>

                {quickTypeMeta.showAttribute || quickTypeMeta.showLevel ? (
                  <FilterDrawerSection
                    title="Atributo y nivel"
                    summary={buildSectionSummary([
                      quickTypeMeta.showAttribute && filters.attribute.trim().length > 0
                        ? `Atributo: ${filters.attribute.trim()}`
                        : '',
                      quickTypeMeta.showLevel && filters.level.trim().length > 0
                        ? `${quickTypeMeta.levelLabel}: ${filters.level.trim()}`
                        : '',
                    ])}
                    defaultOpen={
                      filters.attribute.trim().length > 0 || filters.level.trim().length > 0
                    }
                  >
                    {quickTypeMeta.showAttribute ? (
                      <label className="grid gap-1">
                        <span className="app-soft text-[0.64rem] uppercase tracking-[0.12em]">Atributo</span>
                        <select
                          value={filters.attribute}
                          onChange={(event) => onFilterChange({ attribute: event.target.value })}
                          className="app-field w-full px-2 py-[0.5rem] text-[0.8rem]"
                        >
                          {ATTRIBUTE_OPTIONS.map((option) => (
                            <option key={option.value || 'any'} value={option.value}>
                              {option.label}
                            </option>
                          ))}
                        </select>
                      </label>
                    ) : null}

                    {quickTypeMeta.showLevel ? (
                      <label className="grid gap-1">
                        <span className="app-soft text-[0.64rem] uppercase tracking-[0.12em]">
                          {quickTypeMeta.levelLabel}
                        </span>
                        <input
                          type="number"
                          min={1}
                          max={13}
                          value={filters.level}
                          onChange={(event) => onFilterChange({ level: event.target.value })}
                          placeholder="Ej: 4"
                          className="app-field w-full px-2 py-[0.5rem] text-[0.8rem]"
                        />
                      </label>
                    ) : null}
                  </FilterDrawerSection>
                ) : null}

                {formatAllowsLegalityFilter ? (
                  <FilterDrawerSection
                    title="Legalidad"
                    summary={
                      filters.legalOnly ? `Sin prohibidas en ${formatLabel}` : `Mostrar todas en ${formatLabel}`
                    }
                    defaultOpen={filters.legalOnly}
                  >
                    <label className="surface-panel-soft flex items-start gap-2 border border-(--border-subtle) px-2.5 py-2 text-[0.76rem]">
                      <input
                        type="checkbox"
                        checked={filters.legalOnly}
                        onChange={(event) => onFilterChange({ legalOnly: event.target.checked })}
                        className="mt-[0.1rem] h-3.5 w-3.5 shrink-0 accent-[var(--primary)]"
                      />
                      <span className="grid gap-0.5">
                        <span className="text-[var(--text-main)]">
                          Ocultar cartas prohibidas en {formatLabel}
                        </span>
                        <span className="text-[0.68rem] leading-[1.14] text-[var(--text-muted)]">
                          Este filtro refina la pagina de resultados ya cargada.
                        </span>
                      </span>
                    </label>
                  </FilterDrawerSection>
                ) : null}
              </div>
            </aside>
          </div>
        </div>
      ) : null}
    </>
  )
}

function FilterDrawerSection({
  title,
  summary,
  defaultOpen,
  children,
}: {
  title: string
  summary: string
  defaultOpen: boolean
  children: ReactNode
}) {
  const [open, setOpen] = useState(defaultOpen)

  return (
    <details
      className="details-toggle section-disclosure surface-panel-soft p-2"
      open={open}
      onToggle={(event) => setOpen(event.currentTarget.open)}
    >
      <summary className="section-disclosure-summary">
        <span className="section-disclosure-title">
          <span className="grid gap-0.5">
            <strong className="text-[0.8rem] text-[var(--text-main)]">{title}</strong>
            <span className="text-[0.68rem] leading-[1.14] text-[var(--text-muted)]">
              {summary}
            </span>
          </span>
        </span>
        <span className="details-arrow section-disclosure-arrow text-[0.74rem] text-[var(--text-soft)]">
          ▶
        </span>
      </summary>
      <div className="mt-2 grid gap-2">{children}</div>
    </details>
  )
}

function getExactTypeFilterGroups(quickType: SearchQuickTypeFilter): FilterOptionGroup[] {
  if (quickType === 'monster') {
    return [{ label: 'Monstruos', options: MONSTER_EXACT_TYPE_OPTIONS }]
  }

  if (quickType === 'spell') {
    return [
      {
        label: 'Magias',
        options: SPELL_TRAP_EXACT_TYPE_OPTIONS.filter((option) => option.value === 'Spell Card'),
      },
    ]
  }

  if (quickType === 'trap') {
    return [
      {
        label: 'Trampas',
        options: SPELL_TRAP_EXACT_TYPE_OPTIONS.filter((option) => option.value === 'Trap Card'),
      },
    ]
  }

  if (quickType === 'extra') {
    return [
      {
        label: 'Extra Deck',
        options: MONSTER_EXACT_TYPE_OPTIONS.filter((option) =>
          EXTRA_EXACT_TYPE_VALUES.has(option.value),
        ),
      },
    ]
  }

  return [
    { label: 'Monstruos', options: MONSTER_EXACT_TYPE_OPTIONS },
    { label: 'Spell / Trap', options: SPELL_TRAP_EXACT_TYPE_OPTIONS },
    { label: 'Otros', options: OTHER_EXACT_TYPE_OPTIONS },
  ]
}

function getRaceFilterGroups(quickType: SearchQuickTypeFilter): FilterOptionGroup[] {
  if (quickType === 'spell') {
    return [{ label: 'Magias', options: SPELL_RACE_OPTIONS }]
  }

  if (quickType === 'trap') {
    return [{ label: 'Trampas', options: TRAP_RACE_OPTIONS }]
  }

  if (quickType === 'monster' || quickType === 'extra') {
    return [{ label: 'Monstruos', options: MONSTER_RACE_OPTIONS }]
  }

  return [
    { label: 'Monstruos', options: MONSTER_RACE_OPTIONS },
    { label: 'Magias', options: SPELL_RACE_OPTIONS },
    { label: 'Trampas', options: TRAP_RACE_OPTIONS },
  ]
}

function buildSanitizedFilterUpdates({
  filters,
  exactTypeGroups,
  raceGroups,
  formatAllowsLegalityFilter,
  showAttribute,
  showLevel,
}: {
  filters: CardSearchFilters
  exactTypeGroups: FilterOptionGroup[]
  raceGroups: FilterOptionGroup[]
  formatAllowsLegalityFilter: boolean
  showAttribute: boolean
  showLevel: boolean
}): Partial<CardSearchFilters> | null {
  const updates: Partial<CardSearchFilters> = {}
  const validExactTypes = collectFilterValues(exactTypeGroups)
  const validRaces = collectFilterValues(raceGroups)

  if (filters.exactType.trim().length > 0 && !validExactTypes.has(filters.exactType)) {
    updates.exactType = ''
  }

  if (filters.race.trim().length > 0 && !validRaces.has(filters.race)) {
    updates.race = ''
  }

  if (!showAttribute && filters.attribute.trim().length > 0) {
    updates.attribute = ''
  }

  if (!showLevel && filters.level.trim().length > 0) {
    updates.level = ''
  }

  if (!formatAllowsLegalityFilter && filters.legalOnly) {
    updates.legalOnly = false
  }

  return Object.keys(updates).length > 0 ? updates : null
}

function buildActiveFilterChips({
  filters,
  formatAllowsLegalityFilter,
  formatLabel,
  raceLabel,
}: {
  filters: CardSearchFilters
  formatAllowsLegalityFilter: boolean
  formatLabel: string
  raceLabel: string
}): ActiveFilterChip[] {
  const chips: ActiveFilterChip[] = []

  if (filters.quickType !== 'all') {
    chips.push({
      key: 'quick-type',
      label: 'Vista',
      value: QUICK_TYPE_LABELS[filters.quickType],
      updates: { quickType: 'all' },
    })
  }

  if (filters.archetype.trim().length > 0) {
    chips.push({
      key: 'archetype',
      label: 'Arquetipo',
      value: filters.archetype.trim(),
      updates: { archetype: '' },
    })
  }

  if (filters.description.trim().length > 0) {
    chips.push({
      key: 'description',
      label: 'Texto EN',
      value: filters.description.trim(),
      updates: { description: '' },
    })
  }

  if (filters.exactType.trim().length > 0) {
    chips.push({
      key: 'exact-type',
      label: 'Tipo',
      value: filters.exactType.trim(),
      updates: { exactType: '' },
    })
  }

  if (filters.attribute.trim().length > 0) {
    chips.push({
      key: 'attribute',
      label: 'Atributo',
      value: filters.attribute.trim(),
      updates: { attribute: '' },
    })
  }

  if (filters.race.trim().length > 0) {
    chips.push({
      key: 'race',
      label: raceLabel,
      value: filters.race.trim(),
      updates: { race: '' },
    })
  }

  if (filters.level.trim().length > 0) {
    chips.push({
      key: 'level',
      label: 'Nivel',
      value: filters.level.trim(),
      updates: { level: '' },
    })
  }

  if (formatAllowsLegalityFilter && filters.legalOnly) {
    chips.push({
      key: 'legal-only',
      label: 'Legalidad',
      value: `Sin prohibidas en ${formatLabel}`,
      updates: { legalOnly: false },
    })
  }

  return chips
}

function buildSearchResultDetailChips(card: ApiCardSearchResult): string[] {
  const chips: string[] = []

  if (card.attribute) {
    chips.push(card.attribute)
  }

  if (card.race) {
    chips.push(card.race)
  }

  if (card.linkValue !== null) {
    chips.push(`LINK ${card.linkValue}`)
  } else if (card.level !== null) {
    chips.push(`LV ${card.level}`)
  }

  if (card.atk !== null) {
    chips.push(`ATK ${card.atk}`)
  }

  if (card.def !== null && card.def !== '?' && card.def !== '-1') {
    chips.push(`DEF ${card.def}`)
  }

  return chips.slice(0, 4)
}

function buildSectionSummary(parts: string[], emptyLabel = 'Sin filtros'): string {
  const summary = parts.filter((part) => part.length > 0).join(' · ')
  return summary.length > 0 ? summary : emptyLabel
}

function collectFilterValues(groups: FilterOptionGroup[]): Set<string> {
  return new Set(groups.flatMap((group) => group.options.map((option) => option.value)))
}
