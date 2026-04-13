import { useEffect, useState, type PointerEvent as ReactPointerEvent } from 'react'

import { getDeckFormatLabel } from '../../app/deck-format'
import { getDesktopCompactDeckColumnCount } from '../../app/deck-zone-layout'
import type { DeckBuilderState, DeckZone as DeckZoneType } from '../../app/model'
import type { DeckDropIndicatorState } from '../../app/use-deck-pointer-drag'
import { formatInteger } from '../../app/utils'
import type { DeckFormat, ApiCardReference } from '../../types'
import type { ApiCardSearchResult } from '../../ygoprodeck'
import type { CardSearchFilters } from '../../app/card-search'
import { DeckZone } from '../DeckZone'
import { ConfirmDialog } from '../probability/ConfirmDialog'
import { SearchPanel } from '../SearchPanel'
import { StepHero } from '../StepHero'
import { Button } from '../ui/Button'
import { CloseButton } from '../ui/IconButton'
import { DeckBuilderClassicPreview } from './DeckBuilderClassicPreview'
import { DeckImportDrawer } from './DeckImportDrawer'

const DESKTOP_DECK_BUILDER_MEDIA_QUERY = '(min-width: 1101px)'

interface DeckBuilderStepProps {
  deckBuilder: DeckBuilderState
  deckFormat: DeckFormat
  formatIssues: string[]
  genesysPointTotal: number | null
  genesysPointCap: number | null
  query: string
  status: 'idle' | 'loading' | 'success' | 'error'
  visibleSearchResults: ApiCardSearchResult[]
  isLoadingMore: boolean
  errorMessage: string
  hasMore: boolean
  loadedSearchResultCount: number
  searchFilters: CardSearchFilters
  activeFilterCount: number
  hasSearchCriteria: boolean
  activeDragInstanceId: string | null
  builderRootDropState: DeckDropIndicatorState
  activeDropZone: DeckZoneType | null
  invalidDropZone: DeckZoneType | null
  activeDragSearchCardId: number | null
  selectedDetailCard: ApiCardSearchResult | null
  onClearDeckZone: (zone: DeckZoneType) => void
  onRemoveDeckCard: (instanceId: string) => void
  onDeckCardPointerDown: (event: ReactPointerEvent<HTMLElement>, instanceId: string) => void
  onDeckCardClick: (instanceId: string) => void
  onSearchCardPointerDown: (event: ReactPointerEvent<HTMLElement>, apiCardId: number) => void
  onSearchResultClick: (apiCardId: number) => void
  onAddSearchResultToDefaultZone: (apiCardId: number) => boolean
  onQueryChange: (value: string) => void
  onDeckNameChange: (value: string) => void
  onDeckFormatChange: (format: DeckFormat) => void
  onImportDeck: (nextDeckBuilder: DeckBuilderState) => void
  onSearchFiltersChange: (updates: Partial<CardSearchFilters>) => void
  onClearSearchFilters: () => void
  onLoadMoreResults: () => void
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
  query,
  status,
  visibleSearchResults,
  isLoadingMore,
  errorMessage,
  hasMore,
  loadedSearchResultCount,
  searchFilters,
  activeFilterCount,
  hasSearchCriteria,
  activeDragInstanceId,
  builderRootDropState,
  activeDropZone,
  invalidDropZone,
  activeDragSearchCardId,
  selectedDetailCard,
  onClearDeckZone,
  onRemoveDeckCard,
  onDeckCardPointerDown,
  onDeckCardClick,
  onSearchCardPointerDown,
  onSearchResultClick,
  onAddSearchResultToDefaultZone,
  onQueryChange,
  onDeckNameChange,
  onDeckFormatChange,
  onImportDeck,
  onSearchFiltersChange,
  onClearSearchFilters,
  onLoadMoreResults,
  onHoverStart,
  onHoverEnd,
}: DeckBuilderStepProps) {
  const [mobileSearchOpen, setMobileSearchOpen] = useState(false)
  const [importDrawerOpen, setImportDrawerOpen] = useState(false)
  const [pendingClearZone, setPendingClearZone] = useState<DeckZoneType | null>(null)
  const [isDesktopDeckBuilder, setIsDesktopDeckBuilder] = useState(() => {
    if (typeof window === 'undefined') {
      return false
    }

    return window.matchMedia(DESKTOP_DECK_BUILDER_MEDIA_QUERY).matches
  })
  const formatLabel = getDeckFormatLabel(deckFormat)

  useEffect(() => {
    const previousOverflow = document.body.style.overflow

    if (mobileSearchOpen || importDrawerOpen) {
      document.body.style.overflow = 'hidden'
    }

    return () => {
      document.body.style.overflow = previousOverflow
    }
  }, [importDrawerOpen, mobileSearchOpen])

  useEffect(() => {
    if (typeof window === 'undefined') {
      return
    }

    const mediaQuery = window.matchMedia(DESKTOP_DECK_BUILDER_MEDIA_QUERY)
    const handleChange = (event: MediaQueryListEvent) => {
      setIsDesktopDeckBuilder(event.matches)
    }

    setIsDesktopDeckBuilder(mediaQuery.matches)
    mediaQuery.addEventListener('change', handleChange)

    return () => {
      mediaQuery.removeEventListener('change', handleChange)
    }
  }, [])
  const visibleFormatIssues = formatIssues.slice(0, 2)
  const hasHiddenIssues = formatIssues.length > visibleFormatIssues.length
  const showGenesysPoints = deckFormat === 'genesys' && genesysPointTotal !== null && genesysPointCap !== null
  const showFormatIssues = deckFormat !== 'genesys' && formatIssues.length > 0
  const desktopCompactColumnCount = getDesktopCompactDeckColumnCount(
    'main',
    deckBuilder.main.length,
  )
  const pendingClearZoneCardCount = pendingClearZone ? deckBuilder[pendingClearZone].length : 0
  const pendingClearZoneLabel = pendingClearZone ? getDeckZoneLabel(pendingClearZone) : ''
  const handleSearchCardPointerDown = (
    event: ReactPointerEvent<HTMLElement>,
    apiCardId: number,
  ) => onSearchCardPointerDown(event, apiCardId)

  const handleRequestClearDeckZone = (zone: DeckZoneType) => {
    if (deckBuilder[zone].length === 0) {
      return
    }

    setPendingClearZone(zone)
  }

  const handleConfirmClearDeckZone = () => {
    if (!pendingClearZone || deckBuilder[pendingClearZone].length === 0) {
      setPendingClearZone(null)
      return
    }

    onClearDeckZone(pendingClearZone)
    setPendingClearZone(null)
  }

  const renderSearchPanel = (options: {
    layoutMode: 'desktop' | 'mobile'
    dragEnabled: boolean
    variant?: 'modern' | 'classic-builder'
    selectedCardId?: number | null
  }) => (
    <SearchPanel
      layoutMode={options.layoutMode}
      variant={options.variant}
      deckFormat={deckFormat}
      query={query}
      status={status}
      results={visibleSearchResults}
      isLoadingMore={isLoadingMore}
      errorMessage={errorMessage}
      hasMore={hasMore}
      rawResultCount={loadedSearchResultCount}
      activeDragSearchCardId={activeDragSearchCardId}
      selectedCardId={options.selectedCardId}
      dragEnabled={options.dragEnabled}
      filters={searchFilters}
      activeFilterCount={activeFilterCount}
      hasSearchCriteria={hasSearchCriteria}
      onQueryChange={onQueryChange}
      onFilterChange={onSearchFiltersChange}
      onClearFilters={onClearSearchFilters}
      onLoadMore={onLoadMoreResults}
      onResultClick={options.layoutMode === 'mobile' ? onAddSearchResultToDefaultZone : onSearchResultClick}
      onResultLongPress={options.layoutMode === 'mobile' ? onSearchResultClick : undefined}
      onSearchCardPointerDown={handleSearchCardPointerDown}
      onHoverStart={onHoverStart}
      onHoverEnd={onHoverEnd}
    />
  )

  const previewCard = selectedDetailCard
  const selectedCardId = selectedDetailCard?.ygoprodeckId ?? null

  if (isDesktopDeckBuilder) {
    return (
      <section
        id="step1"
        className="classic-builder-page"
      >
        <div className="classic-builder-layout">
          <DeckBuilderClassicPreview card={previewCard} />

          <article
            className="classic-builder-workspace deck-builder-root-drop-surface"
            data-deck-builder-root="true"
            data-deck-builder-root-drop-state={builderRootDropState}
          >
            {builderRootDropState !== 'idle' ? (
              <div
                className="deck-builder-root-drop-overlay pointer-events-none absolute inset-0 z-10"
                data-drop-state={builderRootDropState}
              />
            ) : null}

            <div className="classic-builder-workspace-inner">
              <div className="classic-builder-toolbar">
                <div className="classic-builder-toolbar-fields">
                  <input
                    type="text"
                    value={deckBuilder.deckName}
                    onChange={(event) => onDeckNameChange(event.target.value)}
                    placeholder="Nombre del deck"
                    className="app-field deck-builder-meta-field classic-builder-toolbar-field"
                  />

                  <label className="classic-builder-toolbar-select-wrap">
                    <select
                      value={deckFormat}
                      onChange={(event) => onDeckFormatChange(event.target.value as DeckFormat)}
                      className="app-field deck-builder-meta-field deck-builder-meta-select classic-builder-toolbar-select"
                    >
                      <option value="unlimited">Sin límite</option>
                      <option value="tcg">TCG</option>
                      <option value="ocg">OCG</option>
                      <option value="goat">GOAT</option>
                      <option value="edison">Edison</option>
                      <option value="genesys">Genesys</option>
                    </select>
                  </label>
                </div>

                <Button
                  variant="secondary"
                  size="sm"
                  className="classic-builder-import-button"
                  onClick={() => setImportDrawerOpen(true)}
                >
                  Import deck
                </Button>
              </div>

              {DECK_ZONE_ITEMS.map(({ zone, title }) => {
                const zoneNode = (
                  <DeckZone
                    zone={zone}
                    title={title}
                    cards={deckBuilder[zone]}
                    activeDragInstanceId={activeDragInstanceId}
                    dropState={
                      activeDropZone === zone
                        ? 'valid'
                        : invalidDropZone === zone
                          ? 'invalid'
                          : 'idle'
                    }
                    desktopCompact
                    desktopCompactColumnCount={desktopCompactColumnCount}
                    variant="classic-builder"
                    selectedCardId={selectedCardId}
                    onClearZone={handleRequestClearDeckZone}
                    onDeckCardPointerDown={onDeckCardPointerDown}
                    onDeckCardClick={onDeckCardClick}
                    onRemoveCard={onRemoveDeckCard}
                    onHoverStart={onHoverStart}
                    onHoverEnd={onHoverEnd}
                  />
                )

                if (zone !== 'main') {
                  return zoneNode
                }

                return (
                  <div key={zone} className="classic-builder-main-zone-wrap">
                    {zoneNode}
                    {builderRootDropState !== 'idle' ? (
                      <div className="classic-builder-main-drop-anchor pointer-events-none" aria-hidden="true">
                        <span className="deck-builder-root-drop-plus" data-drop-state={builderRootDropState}>
                          <span className="deck-builder-root-drop-plus-glyph" />
                        </span>
                      </div>
                    ) : null}
                  </div>
                )
              })}
            </div>
          </article>

          <aside className="classic-builder-search-column">
            {renderSearchPanel({
              layoutMode: 'desktop',
              dragEnabled: true,
              variant: 'classic-builder',
              selectedCardId,
            })}
          </aside>
        </div>

        <DeckImportDrawer
          isOpen={importDrawerOpen}
          deckBuilder={deckBuilder}
          deckFormat={deckFormat}
          onApplyImport={onImportDeck}
          onClose={() => setImportDrawerOpen(false)}
        />

        <ConfirmDialog
          isOpen={pendingClearZone !== null}
          title={pendingClearZoneLabel ? `Vaciar ${pendingClearZoneLabel}` : 'Vaciar zona'}
          description={
            pendingClearZoneLabel
              ? `Se van a quitar ${formatInteger(pendingClearZoneCardCount)} carta${pendingClearZoneCardCount === 1 ? '' : 's'} de ${pendingClearZoneLabel}. Esta acción no se puede deshacer.`
              : ''
          }
          cancelLabel="Cancelar"
          confirmLabel="Sí, vaciar"
          confirmVariant="primary"
          confirmColor="destructive"
          onCancel={() => setPendingClearZone(null)}
          onConfirm={handleConfirmClearDeckZone}
        />
      </section>
    )
  }

  return (
    <section
      id="step1"
      className="surface-panel deck-builder-step-shell grid w-full gap-2.5 p-0 min-[1101px]:h-full min-[1101px]:min-h-0 min-[1101px]:grid-rows-[auto_minmax(0,1fr)] min-[1101px]:gap-3 min-[1101px]:overflow-hidden min-[1101px]:p-2.5"
    >
      <StepHero
        step="Deck Builder"
        title="Armá tu deck en el builder"
        description="Buscá cartas en el buscador, abrí el detalle con click o tap y agregalas a Main, Extra o Side. El drag & drop sigue reordenando entre zonas y el click derecho quita la copia."
        variant="compact"
        side={(
          <Button variant="primary" size="sm" onClick={() => setImportDrawerOpen(true)}>
            Importar deck
          </Button>
        )}
        sideVariant="inline"
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

      <div className="grid items-start gap-3 min-[1101px]:min-h-0">
        <article
          className="surface-panel-strong deck-builder-root-drop-surface relative self-start w-full min-h-0 overflow-hidden min-[1101px]:h-full"
          data-deck-builder-root="true"
          data-deck-builder-root-drop-state={builderRootDropState}
        >
          {builderRootDropState !== 'idle' ? (
            <div
              className="deck-builder-root-drop-overlay pointer-events-none absolute inset-0 z-10 flex items-center justify-center"
              data-drop-state={builderRootDropState}
            >
              <span className="deck-builder-root-drop-plus" data-drop-state={builderRootDropState} aria-hidden="true">
                <span className="deck-builder-root-drop-plus-glyph" />
              </span>
            </div>
          ) : null}

          <div className="relative z-0 grid content-start gap-2.5 p-3 min-[1101px]:h-full min-[1101px]:min-h-0 min-[1101px]:overflow-y-auto min-[1101px]:p-2.5 min-[1101px]:gap-2">
            <div className="grid gap-2 min-[760px]:grid-cols-[minmax(0,1fr)_152px]">
              <input
                type="text"
                value={deckBuilder.deckName}
                onChange={(event) => onDeckNameChange(event.target.value)}
                placeholder="Nombre del deck"
                className="app-field deck-builder-meta-field w-full px-2.5 py-[0.52rem] text-[0.9rem] font-semibold"
              />

              <select
                value={deckFormat}
                onChange={(event) => onDeckFormatChange(event.target.value as DeckFormat)}
                className="app-field deck-builder-meta-field deck-builder-meta-select w-full px-2.5 py-[0.52rem] text-[0.88rem] font-semibold"
              >
                <option value="unlimited">Sin límite</option>
                <option value="tcg">TCG</option>
                <option value="ocg">OCG</option>
                <option value="goat">GOAT</option>
                <option value="edison">Edison</option>
                <option value="genesys">Genesys</option>
              </select>
            </div>

            <div className="min-[1101px]:hidden">
              <Button variant="primary" size="md" fullWidth onClick={() => setMobileSearchOpen(true)}>
                Buscar
              </Button>
            </div>

            {DECK_ZONE_ITEMS.map(({ zone, title }) => (
              <DeckZone
                key={zone}
                zone={zone}
                title={title}
                cards={deckBuilder[zone]}
                activeDragInstanceId={activeDragInstanceId}
                dropState={
                  activeDropZone === zone
                    ? 'valid'
                    : invalidDropZone === zone
                      ? 'invalid'
                      : 'idle'
                }
                desktopCompact={isDesktopDeckBuilder}
                desktopCompactColumnCount={desktopCompactColumnCount}
                onClearZone={handleRequestClearDeckZone}
                onDeckCardPointerDown={onDeckCardPointerDown}
                onDeckCardClick={onDeckCardClick}
                onRemoveCard={onRemoveDeckCard}
                onHoverStart={onHoverStart}
                onHoverEnd={onHoverEnd}
              />
            ))}
          </div>
        </article>
      </div>

      {mobileSearchOpen ? (
        <div className="fixed inset-0 z-140 h-[100dvh] w-full overflow-x-hidden bg-[rgb(var(--background-rgb)/0.82)] min-[1101px]:hidden">
          <div className="h-full max-w-screen w-full p-0">
            <div className="surface-panel flex h-full max-w-screen w-full flex-col overflow-hidden p-2.5">
              <div className="flex items-center justify-between gap-2 border-b border-(--border-subtle) pb-2">
                <strong className="text-[0.95rem]">Buscar cartas</strong>
                <CloseButton size="sm" aria-label="Cerrar búsqueda" onClick={() => setMobileSearchOpen(false)} />
              </div>
              <div className="mt-2 min-h-0 flex-1 overflow-hidden">
                {renderSearchPanel({
                  layoutMode: 'mobile',
                  dragEnabled: false,
                })}
              </div>
            </div>
          </div>
        </div>
      ) : null}

      <DeckImportDrawer
        isOpen={importDrawerOpen}
        deckBuilder={deckBuilder}
        deckFormat={deckFormat}
        onApplyImport={onImportDeck}
        onClose={() => setImportDrawerOpen(false)}
      />

      <ConfirmDialog
        isOpen={pendingClearZone !== null}
        title={pendingClearZoneLabel ? `Vaciar ${pendingClearZoneLabel}` : 'Vaciar zona'}
        description={
          pendingClearZoneLabel
            ? `Se van a quitar ${formatInteger(pendingClearZoneCardCount)} carta${pendingClearZoneCardCount === 1 ? '' : 's'} de ${pendingClearZoneLabel}. Esta acción no se puede deshacer.`
            : ''
        }
        cancelLabel="Cancelar"
        confirmLabel="Sí, vaciar"
        confirmVariant="primary"
        confirmColor="destructive"
        onCancel={() => setPendingClearZone(null)}
        onConfirm={handleConfirmClearDeckZone}
      />
    </section>
  )
}

function getDeckZoneLabel(zone: DeckZoneType): string {
  return zone === 'main' ? 'Main Deck' : zone === 'extra' ? 'Extra Deck' : 'Side Deck'
}
