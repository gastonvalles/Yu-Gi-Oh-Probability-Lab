import {
  useEffect,
  useMemo,
  useRef,
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
import {
  buildClassicCardPrimaryLine,
  buildClassicCardStatLine,
} from '../app/deck-builder-classic'
import { buildFormatLimitLabel, getDeckFormatLabel } from '../app/deck-format'
import { SEARCH_MIN_QUERY_LENGTH } from '../app/model'
import { formatInteger } from '../app/utils'
import type { DeckFormat } from '../types'
import type { ApiCardSearchResult } from '../ygoprodeck'
import { CardArt } from './CardArt'
import { Button } from './ui/Button'
import { CloseButton } from './ui/IconButton'
import { Skeleton } from './ui/Skeleton'

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

type SearchSortOrder = 'default' | 'name-asc' | 'name-desc'

interface SearchPanelProps {
  layoutMode: 'desktop' | 'mobile'
  variant?: 'modern' | 'classic-builder'
  deckFormat: DeckFormat
  query: string
  status: 'idle' | 'loading' | 'success' | 'error'
  results: ApiCardSearchResult[]
  isLoadingMore: boolean
  errorMessage: string
  hasMore: boolean
  rawResultCount: number
  activeDragSearchCardId: number | null
  selectedCardId?: number | null
  dragEnabled?: boolean
  filters: CardSearchFilters
  activeFilterCount: number
  hasSearchCriteria: boolean
  onQueryChange: (value: string) => void
  onFilterChange: (updates: Partial<CardSearchFilters>) => void
  onClearFilters: () => void
  onLoadMore: () => void
  onResultClick: (apiCardId: number) => void
  onResultLongPress?: (apiCardId: number) => void
  onSearchCardPointerDown: (event: ReactPointerEvent<HTMLElement>, apiCardId: number) => void
  onHoverStart: (name: string, card: ApiCardSearchResult, anchor: HTMLElement) => void
  onHoverEnd: () => void
}

const QUICK_TYPE_OPTIONS: Array<{ value: SearchQuickTypeFilter; label: string }> = [
  { value: 'all', label: 'Todas' },
  { value: 'monster', label: 'Monstruos' },
  { value: 'spell', label: 'Magias' },
  { value: 'trap', label: 'Trampas' },
]

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
}

const SEARCH_SORT_OPTIONS: Array<{ value: SearchSortOrder; label: string }> = [
  { value: 'default', label: 'Orden base' },
  { value: 'name-asc', label: 'Nombre A-Z' },
  { value: 'name-desc', label: 'Nombre Z-A' },
]

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

export function SearchPanel({
  layoutMode,
  variant = 'modern',
  deckFormat,
  query,
  status,
  results,
  isLoadingMore,
  errorMessage,
  hasMore,
  rawResultCount,
  activeDragSearchCardId,
  selectedCardId = null,
  dragEnabled = true,
  filters,
  activeFilterCount,
  hasSearchCriteria,
  onQueryChange,
  onFilterChange,
  onClearFilters,
  onLoadMore,
  onResultClick,
  onResultLongPress,
  onSearchCardPointerDown,
  onHoverStart,
  onHoverEnd,
}: SearchPanelProps) {
  const [advancedFiltersOpen, setAdvancedFiltersOpen] = useState(activeFilterCount > 0)
  const [sortOrder, setSortOrder] = useState<SearchSortOrder>('default')
  const resultsContainerRef = useRef<HTMLDivElement | null>(null)
  const longPressTimeoutRef = useRef<number | null>(null)
  const longPressSessionRef = useRef<{
    cardId: number
    startX: number
    startY: number
    triggered: boolean
  } | null>(null)
  const suppressClickCardIdRef = useRef<number | null>(null)
  const formatLabel = getDeckFormatLabel(deckFormat)
  const formatAllowsLegalityFilter = deckFormat !== 'unlimited' && deckFormat !== 'genesys'
  const isDesktopLayout = layoutMode === 'desktop'
  const isClassicBuilder = variant === 'classic-builder'
  const advancedFilterGridClass = isDesktopLayout
    ? 'grid gap-1.5'
    : 'grid gap-1.5 min-[720px]:grid-cols-2 min-[720px]:items-start'
  const characteristicsGridClass = isDesktopLayout
    ? 'grid gap-1.5'
    : 'grid gap-1.5 min-[380px]:grid-cols-2'
  const quickTypeMeta = QUICK_TYPE_META[filters.quickType]
  const exactTypeGroups = useMemo(() => getExactTypeFilterGroups(filters.quickType), [filters.quickType])
  const raceGroups = useMemo(() => getRaceFilterGroups(filters.quickType), [filters.quickType])
  const shouldShowResults = hasSearchCriteria
  const isInitialLoading = status === 'loading'
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
  const sortedResults = useMemo(() => sortVisibleSearchResults(results, sortOrder), [results, sortOrder])
  useEffect(() => {
    if (sanitizedFilterUpdates) {
      onFilterChange(sanitizedFilterUpdates)
    }
  }, [onFilterChange, sanitizedFilterUpdates])

  useEffect(() => {
    resultsContainerRef.current?.scrollTo({ top: 0, behavior: 'auto' })
  }, [deckFormat, filters, query, sortOrder])

  useEffect(() => {
    const container = resultsContainerRef.current

    if (
      !container ||
      !shouldShowResults ||
      status !== 'success' ||
      isLoadingMore ||
      !hasMore
    ) {
      return
    }

    const LOAD_MORE_THRESHOLD_PX = 180
    const handleScroll = () => {
      const distanceToBottom = container.scrollHeight - container.scrollTop - container.clientHeight

      if (distanceToBottom <= LOAD_MORE_THRESHOLD_PX) {
        onLoadMore()
      }
    }

    container.addEventListener('scroll', handleScroll, { passive: true })

    return () => {
      container.removeEventListener('scroll', handleScroll)
    }
  }, [hasMore, isLoadingMore, onLoadMore, shouldShowResults, status])

  useEffect(() => {
    if (
      !shouldShowResults ||
      status !== 'success' ||
      isLoadingMore ||
      !hasMore ||
      sortedResults.length > 0 ||
      rawResultCount === 0
    ) {
      return
    }

    onLoadMore()
  }, [hasMore, isLoadingMore, onLoadMore, rawResultCount, shouldShowResults, sortedResults.length, status])

  useEffect(() => {
    const container = resultsContainerRef.current

    if (
      !container ||
      !shouldShowResults ||
      status !== 'success' ||
      isLoadingMore ||
      !hasMore
    ) {
      return
    }

    if (container.scrollHeight <= container.clientHeight + 48) {
      onLoadMore()
    }
  }, [advancedFiltersOpen, hasMore, isLoadingMore, onLoadMore, shouldShowResults, sortedResults.length, status])

  useEffect(
    () => () => {
      if (longPressTimeoutRef.current !== null) {
        window.clearTimeout(longPressTimeoutRef.current)
      }
    },
    [],
  )

  const clearLongPressSession = () => {
    if (longPressTimeoutRef.current !== null) {
      window.clearTimeout(longPressTimeoutRef.current)
      longPressTimeoutRef.current = null
    }

    longPressSessionRef.current = null
  }

  const startLongPress = (event: ReactPointerEvent<HTMLElement>, apiCardId: number) => {
    if (dragEnabled || layoutMode !== 'mobile' || !onResultLongPress || event.button !== 0) {
      return
    }

    clearLongPressSession()
    longPressSessionRef.current = {
      cardId: apiCardId,
      startX: event.clientX,
      startY: event.clientY,
      triggered: false,
    }
    longPressTimeoutRef.current = window.setTimeout(() => {
      const session = longPressSessionRef.current

      if (!session || session.cardId !== apiCardId) {
        return
      }

      session.triggered = true
      suppressClickCardIdRef.current = apiCardId
      onResultLongPress(apiCardId)
    }, 300)
  }

  const handleLongPressMove = (event: ReactPointerEvent<HTMLElement>, apiCardId: number) => {
    const session = longPressSessionRef.current

    if (!session || session.cardId !== apiCardId || session.triggered) {
      return
    }

    if (Math.hypot(event.clientX - session.startX, event.clientY - session.startY) > 8) {
      clearLongPressSession()
    }
  }

  const handleLongPressEnd = (apiCardId: number) => {
    const session = longPressSessionRef.current

    if (!session || session.cardId !== apiCardId) {
      return
    }

    clearLongPressSession()
  }

  return (
    <article
      className={[
        isClassicBuilder
          ? 'classic-builder-search-panel flex h-full min-h-0 flex-col overflow-hidden'
          : 'surface-panel-soft flex h-full min-h-0 flex-col overflow-hidden',
        isDesktopLayout ? 'min-[1101px]:h-full' : '',
      ].join(' ')}
    >
      <div className={isClassicBuilder ? 'classic-builder-search-header' : 'grid gap-1.5 border-b border-(--border-subtle) px-2.5 py-2.5'}>
        <div className="flex items-center gap-2">
          <label className="relative block min-w-0 flex-1">
            <input
              type="text"
              value={query}
              onChange={(event) => onQueryChange(event.target.value)}
              placeholder={isClassicBuilder ? 'Buscar cartas' : 'Buscar por nombre parcial o texto en efecto'}
              autoComplete="off"
              spellCheck={false}
              className={isClassicBuilder ? 'classic-builder-search-input' : 'app-field w-full px-2.5 py-2 pr-20 text-[0.84rem]'}
            />
            {query.trim().length > 0 ? (
              <CloseButton
                size="sm"
                type="button"
                aria-label="Limpiar bÃºsqueda"
                className="absolute right-2 top-1/2 -translate-y-1/2"
                onClick={() => onQueryChange('')}
              />
            ) : null}
            {status === 'loading' ? (
              <span className="pointer-events-none absolute right-10 top-1/2 -mt-[0.475rem] h-[0.95rem] w-[0.95rem] animate-spin rounded-full border-2 border-[rgb(var(--foreground-rgb)/0.18)] border-t-[var(--primary)]" />
            ) : null}
          </label>

          {isClassicBuilder ? null : (
            <Button
              variant={advancedFiltersOpen ? 'primary' : 'secondary'}
              size="sm"
              className="min-w-9 px-0 text-[0.98rem]"
              aria-label={advancedFiltersOpen ? 'Ocultar filtros avanzados' : 'Mostrar filtros avanzados'}
              aria-pressed={advancedFiltersOpen}
              aria-controls="advanced-search-filters"
              title="Filtros avanzados"
              onClick={() => setAdvancedFiltersOpen((current) => !current)}
            >
              âš™
            </Button>
          )}
        </div>

        {!isClassicBuilder ? (
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
        ) : null}

        {!isClassicBuilder && activeFilterChips.length > 0 ? (
          <div className="flex flex-wrap gap-1.5">
            {activeFilterChips.map((chip) => (
              <button
                key={chip.key}
                type="button"
                className="search-active-chip"
                onClick={() => onFilterChange(chip.updates)}
                title={`Quitar ${chip.label.toLowerCase()}`}
              >
                <span className="truncate text-[var(--text-main)]">
                  {chip.label}: {chip.value}
                </span>
                <span className="shrink-0 text-[var(--text-soft)]">x</span>
              </button>
            ))}
          </div>
        ) : null}

        {isClassicBuilder ? (
          <button
            type="button"
            className="classic-builder-search-toggle"
            aria-pressed={advancedFiltersOpen}
            aria-controls="advanced-search-filters"
            onClick={() => setAdvancedFiltersOpen((current) => !current)}
          >
            {advancedFiltersOpen ? '↑ Hide Filters ↑' : '↓ Show Filters ↓'}
          </button>
        ) : null}
      </div>

      <div className="grid min-h-0 flex-1 grid-rows-[auto_minmax(0,1fr)] overflow-hidden">
        {advancedFiltersOpen ? (
          <div className={isClassicBuilder ? 'classic-builder-search-filters-shell' : 'border-b border-(--border-subtle) px-2.5 py-2'}>
            <div id="advanced-search-filters" className={isClassicBuilder ? 'classic-builder-search-filters' : 'surface-card grid gap-1.5 p-2'}>
              <div className="grid gap-1.5 min-[380px]:grid-cols-[minmax(0,1fr)_auto] min-[380px]:items-end">
                <label className="grid min-w-0 gap-1">
                  <span className="app-soft text-[0.58rem] uppercase tracking-[0.12em]">Orden</span>
                  <select
                    value={sortOrder}
                    onChange={(event) => setSortOrder(event.target.value as SearchSortOrder)}
                    className="app-field w-full px-2 py-[0.45rem] text-[0.76rem]"
                  >
                    {SEARCH_SORT_OPTIONS.map((option) => (
                      <option key={option.value} value={option.value}>
                        {option.label}
                      </option>
                    ))}
                  </select>
                </label>

                {activeFilterCount > 0 ? (
                  <Button variant="tertiary" size="sm" onClick={onClearFilters}>
                    Limpiar
                  </Button>
                ) : null}
              </div>

              <div className={advancedFilterGridClass}>
                <SearchFilterSection
                  title="Texto y arquetipo"
                  summary={buildSectionSummary([
                    filters.archetype.trim().length > 0 ? filters.archetype.trim() : '',
                    filters.description.trim().length > 0 ? `Texto: ${filters.description.trim()}` : '',
                  ])}
                  defaultOpen={
                    filters.archetype.trim().length > 0 || filters.description.trim().length > 0
                  }
                >
                  <div className="grid gap-1.5">
                    <label className="grid min-w-0 gap-1">
                      <span className="app-soft text-[0.58rem] uppercase tracking-[0.12em]">Arquetipo</span>
                      <input
                        type="text"
                        value={filters.archetype}
                        onChange={(event) => onFilterChange({ archetype: event.target.value })}
                        placeholder="Blue-Eyes"
                        autoComplete="off"
                        spellCheck={false}
                        className="app-field w-full px-2 py-[0.45rem] text-[0.76rem]"
                      />
                    </label>

                    <label className="grid min-w-0 gap-1">
                      <span className="app-soft text-[0.58rem] uppercase tracking-[0.12em]">Texto EN</span>
                      <input
                        type="text"
                        value={filters.description}
                        onChange={(event) => onFilterChange({ description: event.target.value })}
                        placeholder="add 1"
                        autoComplete="off"
                        spellCheck={false}
                        className="app-field w-full px-2 py-[0.45rem] text-[0.76rem]"
                      />
                    </label>
                  </div>
                </SearchFilterSection>

                <SearchFilterSection
                  title="CaracterÃ­sticas"
                  summary={buildSectionSummary([
                    filters.exactType.trim().length > 0 ? filters.exactType.trim() : '',
                    filters.race.trim().length > 0 ? filters.race.trim() : '',
                    quickTypeMeta.showAttribute && filters.attribute.trim().length > 0
                      ? filters.attribute.trim()
                      : '',
                    quickTypeMeta.showLevel && filters.level.trim().length > 0
                      ? `${quickTypeMeta.levelLabel}: ${filters.level.trim()}`
                      : '',
                    formatAllowsLegalityFilter && filters.legalOnly ? `Sin prohibidas en ${formatLabel}` : '',
                  ])}
                  defaultOpen={
                    filters.exactType.trim().length > 0 ||
                    filters.race.trim().length > 0 ||
                    filters.attribute.trim().length > 0 ||
                    filters.level.trim().length > 0 ||
                    filters.legalOnly
                  }
                >
                  <div className={characteristicsGridClass}>
                    <label className="grid min-w-0 gap-1">
                      <span className="app-soft text-[0.58rem] uppercase tracking-[0.12em]">
                        {quickTypeMeta.exactTypeLabel}
                      </span>
                      <select
                        value={filters.exactType}
                        onChange={(event) => onFilterChange({ exactType: event.target.value })}
                        className="app-field min-w-0 w-full px-2 py-[0.45rem] text-[0.76rem]"
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

                    <label className="grid min-w-0 gap-1">
                      <span className="app-soft text-[0.58rem] uppercase tracking-[0.12em]">
                        {quickTypeMeta.raceLabel}
                      </span>
                      <select
                        value={filters.race}
                        onChange={(event) => onFilterChange({ race: event.target.value })}
                        className="app-field min-w-0 w-full px-2 py-[0.45rem] text-[0.76rem]"
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

                    {quickTypeMeta.showAttribute ? (
                      <label className="grid min-w-0 gap-1">
                        <span className="app-soft text-[0.58rem] uppercase tracking-[0.12em]">Atributo</span>
                        <select
                          value={filters.attribute}
                          onChange={(event) => onFilterChange({ attribute: event.target.value })}
                          className="app-field min-w-0 w-full px-2 py-[0.45rem] text-[0.76rem]"
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
                      <label className="grid min-w-0 gap-1">
                        <span className="app-soft text-[0.58rem] uppercase tracking-[0.12em]">
                          {quickTypeMeta.levelLabel}
                        </span>
                        <input
                          type="number"
                          min={1}
                          max={13}
                          value={filters.level}
                          onChange={(event) => onFilterChange({ level: event.target.value })}
                          placeholder="4"
                          className="app-field w-full px-2 py-[0.45rem] text-[0.76rem]"
                        />
                      </label>
                    ) : null}
                  </div>

                  {formatAllowsLegalityFilter ? (
                    <label className="surface-panel-soft flex items-center gap-2 border border-(--border-subtle) px-2 py-1.5 text-[0.74rem]">
                      <input
                        type="checkbox"
                        checked={filters.legalOnly}
                        onChange={(event) => onFilterChange({ legalOnly: event.target.checked })}
                        className="h-3.5 w-3.5 shrink-0 accent-[var(--primary)]"
                      />
                      <span className="min-w-0 truncate text-[var(--text-main)]">
                        Ocultar prohibidas en {formatLabel}
                      </span>
                    </label>
                  ) : null}
                </SearchFilterSection>
              </div>
            </div>
          </div>
        ) : null}

        <div className={isClassicBuilder ? 'classic-builder-search-results-shell' : 'grid min-h-0 content-start gap-1.5 overflow-hidden px-2.5 py-2.5'}>
          {shouldShowResults ? (
            <div
              className="grid min-h-0 content-start gap-1.5 overflow-hidden"
              style={{
                gridTemplateRows: status === 'error' ? undefined : 'auto minmax(0, 1fr)',
              }}
            >
              {status === 'error' ? (
                <p className="surface-card-danger m-0 px-2 py-1.5 text-[0.78rem] leading-[1.16] text-[var(--destructive)]">
                  {formatSearchError(errorMessage)}
                </p>
              ) : (
                <>
                  {isInitialLoading ? (
                    <div className={isClassicBuilder ? 'classic-builder-search-results-grid' : 'grid min-h-0 content-start gap-2 overflow-y-auto overflow-x-hidden pr-1'}>
                      {Array.from({ length: isClassicBuilder ? 12 : 8 }, (_, index) => (
                        <article
                          key={index}
                          className={
                            isClassicBuilder
                              ? 'classic-builder-search-result-card'
                              : 'app-list-item grid grid-cols-[42px_minmax(0,1fr)] items-center gap-2 p-1.5'
                          }
                          aria-hidden="true"
                        >
                          <Skeleton radius="none" className={isClassicBuilder ? 'classic-builder-search-result-skeleton-art' : 'aspect-[0.72] w-[42px]'} />
                          <div className="grid gap-2">
                            <Skeleton className="h-3.5 w-[85%]" />
                            <Skeleton className="h-2.5 w-[62%]" />
                          </div>
                        </article>
                      ))}
                    </div>
                  ) : sortedResults.length === 0 ? (
                    <div className="surface-card grid gap-1 px-2 py-2 text-[0.76rem] leading-[1.18] text-[var(--text-muted)]">
                      <p className="m-0">
                        {rawResultCount > 0
                          ? 'TodavÃ­a no apareciÃ³ una coincidencia dentro de lo ya cargado.'
                          : 'No se encontraron cartas con esos criterios.'}
                      </p>
                      <p className="m-0 text-[0.68rem] leading-[1.14]">
                        {hasMore
                          ? 'Se cargarÃ¡n mÃ¡s tandas automÃ¡ticamente al seguir explorando.'
                          : 'Ya no quedan mÃ¡s tandas disponibles.'}
                      </p>
                    </div>
                  ) : (
                    <div
                      ref={resultsContainerRef}
                      className={isClassicBuilder ? 'classic-builder-search-results-grid' : 'grid min-h-0 content-start gap-2 overflow-y-auto overflow-x-hidden pr-1'}
                    >
                      {sortedResults.map((card) => {
                        const detailChips = buildSearchResultDetailChips(card)
                        const formatLimitLabel = buildFormatLimitLabel(card, deckFormat)

                        return (
                          <article
                            key={card.ygoprodeckId}
                            data-selected={selectedCardId !== null && selectedCardId === card.ygoprodeckId ? 'true' : 'false'}
                            className={[
                              isClassicBuilder
                                ? 'classic-builder-search-result-card'
                                : 'app-list-item grid w-full min-w-0 select-none grid-cols-[42px_minmax(0,1fr)] items-center gap-2 p-1.5 transition-all duration-150 ease-out will-change-transform',
                              dragEnabled ? 'cursor-grab' : '',
                              activeDragSearchCardId === card.ygoprodeckId ? 'opacity-35' : '',
                            ].join(' ')}
                            onClick={() => {
                              if (suppressClickCardIdRef.current === card.ygoprodeckId) {
                                suppressClickCardIdRef.current = null
                                return
                              }

                              onResultClick(card.ygoprodeckId)
                            }}
                            onPointerDown={(event) => {
                              if (dragEnabled) {
                                onSearchCardPointerDown(event, card.ygoprodeckId)
                                return
                              }

                              startLongPress(event, card.ygoprodeckId)
                            }}
                            onPointerMove={(event) => handleLongPressMove(event, card.ygoprodeckId)}
                            onPointerUp={() => handleLongPressEnd(card.ygoprodeckId)}
                            onPointerCancel={() => handleLongPressEnd(card.ygoprodeckId)}
                            onPointerLeave={() => handleLongPressEnd(card.ygoprodeckId)}
                            onContextMenu={(event) => {
                              if (layoutMode === 'mobile') {
                                event.preventDefault()
                              }
                            }}
                            onMouseEnter={(event) => onHoverStart(card.name, card, event.currentTarget)}
                            onMouseLeave={onHoverEnd}
                          >
                            <div
                              className={isClassicBuilder ? 'classic-builder-search-result-art-shell' : 'w-[42px]'}
                              data-drag-preview-source="true"
                            >
                              <CardArt
                                remoteUrl={card.imageUrlSmall}
                                name={card.name}
                                className={isClassicBuilder ? 'classic-builder-search-result-art' : 'block h-auto w-full bg-[var(--input)]'}
                                limitCard={isClassicBuilder ? null : card}
                                limitBadgeSize="sm"
                              />
                            </div>

                            <div className={isClassicBuilder ? 'classic-builder-search-result-copy' : 'flex min-w-0 flex-col gap-[0.28rem]'}>
                              <strong className="text-[0.8rem] leading-[1.08] break-words text-[var(--text-main)]">
                                {card.name}
                              </strong>
                              {isClassicBuilder ? (
                                <>
                                  <p className="m-0 text-[0.72rem] leading-[1.08] break-words text-[var(--text-main)]">
                                    {buildClassicCardPrimaryLine(card)}
                                  </p>
                                  <p className="m-0 text-[0.72rem] leading-[1.08] break-words text-[var(--text-main)]">
                                    {buildClassicCardStatLine(card)}
                                  </p>
                                </>
                              ) : (
                                <>
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
                                </>
                              )}
                            </div>
                          </article>
                        )
                      })}

                      {isLoadingMore ? (
                        <div
                          className={
                            isClassicBuilder
                              ? 'classic-builder-search-result-card'
                              : 'surface-card grid grid-cols-[42px_minmax(0,1fr)] items-center gap-2 p-1.5'
                          }
                          aria-hidden="true"
                        >
                          <Skeleton radius="none" className={isClassicBuilder ? 'classic-builder-search-result-skeleton-art' : 'aspect-[0.72] w-[42px]'} />
                          <div className="grid gap-2">
                            <Skeleton className="h-3.5 w-[85%]" />
                            <Skeleton className="h-2.5 w-[62%]" />
                          </div>
                        </div>
                      ) : null}
                    </div>
                  )}
                </>
              )}
            </div>
          ) : (
            isClassicBuilder ? null : (
              <div className="surface-card px-2 py-2 text-[0.76rem] leading-[1.16] text-[var(--text-muted)]">
                <p className="m-0">
                  {`EscribÃ­ al menos ${formatInteger(SEARCH_MIN_QUERY_LENGTH)} letras o abrÃ­ âš™ para refinar la bÃºsqueda.`}
                </p>
              </div>
            )
          )}
        </div>
      </div>
    </article>
  )
}

function SearchFilterSection({
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
      className="details-toggle surface-panel-soft self-start grid min-w-0 gap-1 border border-(--border-subtle) p-1.5"
      open={open}
      onToggle={(event) => setOpen(event.currentTarget.open)}
    >
      <summary className="flex cursor-pointer items-center justify-between gap-2 border border-(--border-subtle) bg-[linear-gradient(180deg,rgb(var(--secondary-rgb)/0.96),rgb(var(--background-rgb)/0.98))] px-2 py-1.5 transition-colors duration-150 hover:border-[rgb(var(--primary-rgb)/0.34)]">
        <span className="min-w-0 grid gap-[0.1rem]">
          <strong className="text-[0.74rem] text-[var(--text-main)]">{title}</strong>
          <span className="truncate text-[0.64rem] leading-[1.14] text-[var(--text-muted)]">
            {summary}
          </span>
        </span>
        <span className="details-arrow grid h-5 w-5 shrink-0 place-items-center border border-[rgb(var(--primary-rgb)/0.3)] bg-[linear-gradient(180deg,rgb(var(--primary-rgb)/0.16),rgb(var(--secondary-rgb)/0.96))] text-[0.68rem] text-[var(--text-soft)]">
          â–¶
        </span>
      </summary>
      <div className="grid min-w-0 gap-1.5 pt-0.5">{children}</div>
    </details>
  )
}

function sortVisibleSearchResults(
  results: ApiCardSearchResult[],
  sortOrder: SearchSortOrder,
): ApiCardSearchResult[] {
  if (sortOrder === 'default') {
    return results
  }

  const sortedResults = [...results].sort((left, right) => left.name.localeCompare(right.name))

  return sortOrder === 'name-desc' ? sortedResults.reverse() : sortedResults
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

  if (quickType === 'monster') {
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
  const summary = parts.filter((part) => part.length > 0).join(' Â· ')
  return summary.length > 0 ? summary : emptyLabel
}

function collectFilterValues(groups: FilterOptionGroup[]): Set<string> {
  return new Set(groups.flatMap((group) => group.options.map((option) => option.value)))
}
