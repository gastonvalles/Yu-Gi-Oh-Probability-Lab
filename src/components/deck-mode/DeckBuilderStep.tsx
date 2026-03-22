import { useRef, useState, type PointerEvent as ReactPointerEvent } from 'react'

import { getDeckFormatLabel } from '../../app/deck-format'
import { useBuilderHeight } from '../../app/use-builder-height'
import type { CalculatorMode, DeckBuilderState, DeckZone as DeckZoneType } from '../../app/model'
import { formatInteger } from '../../app/utils'
import type { DeckFormat, ApiCardReference } from '../../types'
import type { ApiCardSearchResult } from '../../ygoprodeck'
import type { CardSearchFilters } from '../../app/card-search'
import { DeckZone } from '../DeckZone'
import { SearchPanel } from '../SearchPanel'
import { StepHero } from '../StepHero'
import { Button } from '../ui/Button'

interface DeckBuilderStepProps {
  deckBuilder: DeckBuilderState
  deckFormat: DeckFormat
  formatIssues: string[]
  genesysPointTotal: number | null
  genesysPointCap: number | null
  mode: CalculatorMode
  query: string
  status: 'idle' | 'loading' | 'success' | 'error'
  visibleSearchResults: ApiCardSearchResult[]
  errorMessage: string
  page: number
  hasMore: boolean
  rawSearchResultCount: number
  searchFilters: CardSearchFilters
  activeFilterCount: number
  hasSearchCriteria: boolean
  activeDragInstanceId: string | null
  activeDragSearchCardId: number | null
  consumeSuppressedSearchClick: () => boolean
  onAddSearchResult: (apiCardId: number) => void
  onClearDeckZone: (zone: DeckZoneType) => void
  onRemoveDeckCard: (instanceId: string) => void
  onDeckCardPointerDown: (event: ReactPointerEvent<HTMLElement>, instanceId: string) => void
  onSearchCardPointerDown: (event: ReactPointerEvent<HTMLElement>, apiCardId: number) => void
  onQueryChange: (value: string) => void
  onDeckNameChange: (value: string) => void
  onDeckFormatChange: (format: DeckFormat) => void
  onSearchFiltersChange: (updates: Partial<CardSearchFilters>) => void
  onClearSearchFilters: () => void
  onPrevPage: () => void
  onNextPage: () => void
  onHoverStart: (name: string, card: ApiCardReference, anchor: HTMLElement) => void
  onHoverEnd: () => void
}

const DECK_ZONE_ITEMS: Array<{
  title: string
  zone: 'main' | 'extra' | 'side'
}> = [
  { zone: 'main', title: 'Main Deck' },
  { zone: 'extra', title: 'Extra Deck' },
  { zone: 'side', title: 'Side Deck' },
]

export function DeckBuilderStep({
  deckBuilder,
  deckFormat,
  formatIssues,
  genesysPointTotal,
  genesysPointCap,
  mode,
  query,
  status,
  visibleSearchResults,
  errorMessage,
  page,
  hasMore,
  rawSearchResultCount,
  searchFilters,
  activeFilterCount,
  hasSearchCriteria,
  activeDragInstanceId,
  activeDragSearchCardId,
  consumeSuppressedSearchClick,
  onAddSearchResult,
  onClearDeckZone,
  onRemoveDeckCard,
  onDeckCardPointerDown,
  onSearchCardPointerDown,
  onQueryChange,
  onDeckNameChange,
  onDeckFormatChange,
  onSearchFiltersChange,
  onClearSearchFilters,
  onPrevPage,
  onNextPage,
  onHoverStart,
  onHoverEnd,
}: DeckBuilderStepProps) {
  const [mobileSearchOpen, setMobileSearchOpen] = useState(false)
  const builderRef = useRef<HTMLElement>(null)
  const formatLabel = getDeckFormatLabel(deckFormat)
  const builderHeight = useBuilderHeight({
    builderRef,
    extraDeckCount: deckBuilder.extra.length,
    mainDeckCount: deckBuilder.main.length,
    mode,
    sideDeckCount: deckBuilder.side.length,
  })
  const visibleFormatIssues = formatIssues.slice(0, 2)
  const hasHiddenIssues = formatIssues.length > visibleFormatIssues.length
  const showGenesysPoints = deckFormat === 'genesys' && genesysPointTotal !== null && genesysPointCap !== null
  const showFormatIssues = deckFormat !== 'genesys' && formatIssues.length > 0

  const handleResultClick = (apiCardId: number) => {
    if (consumeSuppressedSearchClick()) {
      return
    }

    onAddSearchResult(apiCardId)
  }

  const handleSearchCardPointerDown = (
    event: ReactPointerEvent<HTMLElement>,
    apiCardId: number,
  ) => onSearchCardPointerDown(event, apiCardId)

  const renderSearchPanel = (options: { builderHeight: number | null; dragEnabled: boolean }) => (
    <SearchPanel
      builderHeight={options.builderHeight}
      deckFormat={deckFormat}
      query={query}
      status={status}
      results={visibleSearchResults}
      errorMessage={errorMessage}
      page={page}
      hasMore={hasMore}
      rawResultCount={rawSearchResultCount}
      activeDragSearchCardId={activeDragSearchCardId}
      dragEnabled={options.dragEnabled}
      filters={searchFilters}
      activeFilterCount={activeFilterCount}
      hasSearchCriteria={hasSearchCriteria}
      onQueryChange={onQueryChange}
      onFilterChange={onSearchFiltersChange}
      onClearFilters={onClearSearchFilters}
      onPrevPage={onPrevPage}
      onNextPage={onNextPage}
      onResultClick={handleResultClick}
      onSearchCardPointerDown={handleSearchCardPointerDown}
      onHoverStart={onHoverStart}
      onHoverEnd={onHoverEnd}
    />
  )

  return (
    <section id="step1" className="surface-panel mx-auto grid w-full max-w-310 gap-3 p-2.5">
      <StepHero
        step="Paso 1"
        pill="Deck Builder"
        title="Armá tu deck en el builder"
        description="Buscá cartas en el buscador, agregalas con click y reordená la lista arrastrando entre Main, Extra y Side. Click derecho quita la copia."
        side={
          <>
            <span className="app-soft text-[0.68rem] uppercase tracking-widest">Nombre del deck</span>
            <input
              type="text"
              value={deckBuilder.deckName}
              onChange={(event) => onDeckNameChange(event.target.value)}
              placeholder="Nombre del deck"
              className="app-field w-full px-2 py-[0.55rem] text-[0.88rem] font-semibold"
            />
            <span className="app-soft text-[0.68rem] uppercase tracking-widest">Formato del deck</span>
            <select
              value={deckFormat}
              onChange={(event) => onDeckFormatChange(event.target.value as DeckFormat)}
              className="app-field w-full px-2 py-[0.55rem] text-[0.88rem] font-semibold"
            >
              <option value="unlimited">Sin límite</option>
              <option value="tcg">TCG</option>
              <option value="ocg">OCG</option>
              <option value="goat">GOAT</option>
              <option value="genesys">Genesys</option>
            </select>
          </>
        }
      />

      {showGenesysPoints ? (
        <div className="grid gap-2 min-[1101px]:hidden">
          <div className={[genesysPointTotal > genesysPointCap ? 'surface-card-warning' : 'surface-card', 'grid gap-1.5 px-2 py-2'].join(' ')}>
            <span className="app-soft text-[0.68rem] uppercase tracking-widest">Puntos Genesys</span>
            <strong className="text-[0.92rem] leading-none text-(--text-main)">
              {formatInteger(genesysPointTotal)} / {formatInteger(genesysPointCap)} pts
            </strong>
            <p className="m-0 text-[0.72rem] leading-[1.18] text-(--text-muted)">
              Cap estándar de 100 puntos y hasta 3 copias por carta.
            </p>
          </div>
        </div>
      ) : null}

      {showFormatIssues ? (
        <div className="grid gap-2 min-[1101px]:hidden">
          <div className="surface-card-warning grid gap-1.5 px-2 py-2">
            <div className="flex items-center justify-between gap-2">
              <span className="app-soft text-[0.68rem] uppercase tracking-widest">
                Chequeo pendiente
              </span>
              <span className="builder-status-dot builder-status-dot-warning" />
            </div>
            <strong className="text-[0.92rem] leading-none text-(--text-main)">
              {formatIssues.length} ajuste{formatIssues.length === 1 ? '' : 's'} para {formatLabel}
            </strong>
            <div className="grid gap-1">
              {visibleFormatIssues.map((issue) => (
                <p key={issue} className="m-0 text-[0.74rem] leading-[1.18] text-(--text-muted)">
                  {issue}
                </p>
              ))}
              {hasHiddenIssues ? (
                <p className="app-soft m-0 text-[0.72rem]">+ {formatIssues.length - visibleFormatIssues.length} más</p>
              ) : null}
            </div>
          </div>
        </div>
      ) : null}

      <div className="grid items-start gap-3 min-[1101px]:grid-cols-[minmax(0,1fr)_320px]">
        <article ref={builderRef} className="surface-panel-soft self-start w-full min-h-0 p-2.5">
          <div className="grid gap-2.5">
            <div className="min-[1101px]:hidden">
              <Button variant="primary" size="md" fullWidth onClick={() => setMobileSearchOpen(true)}>
                Buscar cartas
              </Button>
            </div>

            {DECK_ZONE_ITEMS.map(({ zone, title }) => (
              <DeckZone
                key={zone}
                zone={zone}
                title={title}
                cards={deckBuilder[zone]}
                activeDragInstanceId={activeDragInstanceId}
                onClearZone={onClearDeckZone}
                onDeckCardPointerDown={onDeckCardPointerDown}
                onRemoveCard={onRemoveDeckCard}
                onHoverStart={onHoverStart}
                onHoverEnd={onHoverEnd}
              />
            ))}
          </div>
        </article>

        <div className="max-[1100px]:hidden">
          <div className="grid gap-2.5">
            {showGenesysPoints ? (
              <div className={[genesysPointTotal > genesysPointCap ? 'surface-card-warning' : 'surface-card', 'grid gap-1.5 px-2 py-2'].join(' ')}>
                <span className="app-soft text-[0.68rem] uppercase tracking-widest">Puntos Genesys</span>
                <strong className="text-[0.92rem] leading-none text-(--text-main)">
                  {formatInteger(genesysPointTotal)} / {formatInteger(genesysPointCap)} pts
                </strong>
                <p className="m-0 text-[0.72rem] leading-[1.18] text-(--text-muted)">
                  Cap estándar de 100 puntos y hasta 3 copias por carta.
                </p>
              </div>
            ) : null}

            {showFormatIssues ? (
              <div className="surface-card-warning grid gap-1.5 px-2 py-2">
                <div className="flex items-center justify-between gap-2">
                  <span className="app-soft text-[0.68rem] uppercase tracking-widest">
                    Chequeo pendiente
                  </span>
                  <span className="builder-status-dot builder-status-dot-warning" />
                </div>
                <strong className="text-[0.92rem] leading-none text-(--text-main)">
                  {formatIssues.length} ajuste{formatIssues.length === 1 ? '' : 's'} para {formatLabel}
                </strong>
                <div className="grid gap-1">
                  {visibleFormatIssues.map((issue) => (
                    <p key={issue} className="m-0 text-[0.74rem] leading-[1.18] text-(--text-muted)">
                      {issue}
                    </p>
                  ))}
                  {hasHiddenIssues ? (
                    <p className="app-soft m-0 text-[0.72rem]">+ {formatIssues.length - visibleFormatIssues.length} más</p>
                  ) : null}
                </div>
              </div>
            ) : null}

            {renderSearchPanel({
              builderHeight,
              dragEnabled: true,
            })}
          </div>
        </div>
      </div>

      {mobileSearchOpen ? (
        <div className="fixed inset-0 z-140 overflow-y-auto bg-[rgb(var(--background-rgb)/0.82)] px-3 py-3 min-[1101px]:hidden">
          <div className="mx-auto flex h-[calc(100dvh-1.5rem)] w-full max-w-155 items-stretch">
            <div className="surface-panel flex h-full min-h-0 max-h-full w-full flex-col overflow-hidden p-2.5">
              <div className="flex items-center justify-between gap-2 border-b border-(--border-subtle) pb-2">
                <strong className="text-[0.95rem]">Buscar cartas</strong>
                <button
                  type="button"
                  className="app-icon-button text-[1.05rem]"
                  onClick={() => setMobileSearchOpen(false)}
                >
                  ×
                </button>
              </div>
              <div className="mt-2 min-h-0 flex-1 overflow-hidden">
                {renderSearchPanel({
                  builderHeight: null,
                  dragEnabled: false,
                })}
              </div>
            </div>
          </div>
        </div>
      ) : null}
    </section>
  )
}
