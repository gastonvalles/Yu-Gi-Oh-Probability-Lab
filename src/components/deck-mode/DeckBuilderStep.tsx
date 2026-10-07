import { useCallback, useMemo, useState, type PointerEvent as ReactPointerEvent } from 'react'

import { getDeckFormatLabel } from '../../app/deck-format'
import { getDesktopCompactDeckColumnCount } from '../../app/deck-zone-layout'
import type { DeckBuilderState, DeckZone as DeckZoneType } from '../../app/model'
import type { DeckDropIndicatorState } from '../../app/use-deck-pointer-drag'
import { DESKTOP_DECK_BUILDER_MEDIA_QUERY, useMediaQuery } from '../../app/use-media-query'
import { useBodyScrollLock } from '../../app/use-overlay'
import { formatInteger } from '../../app/utils'
import type { DeckFormat } from '../../types'
import type { ApiCardSearchResult } from '../../ygoprodeck'
import type { CardSearchFilters } from '../../app/card-search'
import { DeckZone } from '../DeckZone'
import { ConfirmDialog } from '../probability/ConfirmDialog'
import { DesktopSearchPanel } from '../search/DesktopSearchPanel'
import { MobileCardSearch } from '../search/MobileCardSearch'
import type { CardSearchActions, CardSearchViewState } from '../search/search-types'
import type { DeckCopyActions } from '../card-detail/DeckCopyControls'
import { StepHero } from '../StepHero'
import { Button } from '../ui/Button'
import { cx } from '../ui/cx'
import { DeckBuilderClassicPreview } from './DeckBuilderClassicPreview'
import { DeckImportDrawer } from './DeckImportDrawer'
import { field, surface } from '../ui/surfaces'


interface DeckBuilderStepProps {
  deckBuilder: DeckBuilderState
  deckFormat: DeckFormat
  formatIssues: string[]
  genesysPointTotal: number | null
  genesysPointCap: number | null
  query: string
  status: 'idle' | 'loading' | 'success' | 'error'
  visibleSearchResults: ApiCardSearchResult[]
  maxedOutSearchResultIds: Set<number>
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
  selectedDetailSource: 'search' | 'deck' | null
  selectedDeckCopyActions: DeckCopyActions | null
  onClearDeckZone: (zone: DeckZoneType) => void
  onClearAllDeckZones: () => void
  onRemoveDeckCard: (instanceId: string) => void
  onDeckCardPointerDown: (event: ReactPointerEvent<HTMLElement>, instanceId: string) => void
  onDeckCardClick: (instanceId: string) => void
  onSearchCardPointerDown: (event: ReactPointerEvent<HTMLElement>, apiCardId: number) => void
  onSearchResultClick: (apiCardId: number) => void
  onAddSearchResultToDefaultZone: (apiCardId: number) => boolean
  onAddSearchResultToZone: (apiCardId: number, zone: DeckZoneType) => boolean
  onQueryChange: (value: string) => void
  onDeckNameChange: (value: string) => void
  onDeckFormatChange: (format: DeckFormat) => void
  onImportDeck: (nextDeckBuilder: DeckBuilderState) => void
  onSearchFiltersChange: (updates: Partial<CardSearchFilters>) => void
  onClearSearchFilters: () => void
  onLoadMoreResults: () => void
}

/** Signo "+" (o "×" si no se puede soltar ahí) que aparece al arrastrar una carta sobre el builder. */
function plusGlyph(invalid: boolean): string {
  return cx(
    'relative block size-[2.2rem] before:absolute before:left-1/2 before:top-1/2 before:h-[0.18rem] before:w-8 before:-translate-x-1/2 before:-translate-y-1/2 after:absolute after:left-1/2 after:top-1/2 after:h-8 after:w-[0.18rem] after:-translate-x-1/2 after:-translate-y-1/2',
    invalid
      ? 'before:rotate-45 before:bg-destructive after:-rotate-45 after:bg-destructive'
      : 'before:bg-primary after:bg-primary',
  )
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
  maxedOutSearchResultIds,
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
  selectedDetailSource,
  selectedDeckCopyActions,
  onClearDeckZone,
  onClearAllDeckZones,
  onRemoveDeckCard,
  onDeckCardPointerDown,
  onDeckCardClick,
  onSearchCardPointerDown,
  onSearchResultClick,
  onAddSearchResultToDefaultZone,
  onAddSearchResultToZone,
  onQueryChange,
  onDeckNameChange,
  onDeckFormatChange,
  onImportDeck,
  onSearchFiltersChange,
  onClearSearchFilters,
  onLoadMoreResults,
}: DeckBuilderStepProps) {
  const [mobileSearchOpen, setMobileSearchOpen] = useState(false)
  const [importDrawerOpen, setImportDrawerOpen] = useState(false)
  const [pendingClearZone, setPendingClearZone] = useState<DeckZoneType | 'all' | null>(null)
  const isDesktopDeckBuilder = useMediaQuery(DESKTOP_DECK_BUILDER_MEDIA_QUERY)
  const formatLabel = getDeckFormatLabel(deckFormat)

  useBodyScrollLock(mobileSearchOpen || importDrawerOpen)

  const visibleFormatIssues = formatIssues.slice(0, 2)
  const hasHiddenIssues = formatIssues.length > visibleFormatIssues.length
  const showGenesysPoints = deckFormat === 'genesys' && genesysPointTotal !== null && genesysPointCap !== null
  const showFormatIssues = deckFormat !== 'genesys' && formatIssues.length > 0
  const desktopCompactColumnCount = getDesktopCompactDeckColumnCount(
    'main',
    deckBuilder.main.length,
  )
  const totalDeckCardCount = deckBuilder.main.length + deckBuilder.extra.length + deckBuilder.side.length
  const deckCopyCounts = useMemo(() => countDeckCopiesByCardId(deckBuilder), [deckBuilder])
  const pendingClearZoneCardCount =
    pendingClearZone === 'all' ? totalDeckCardCount : pendingClearZone ? deckBuilder[pendingClearZone].length : 0
  const pendingClearZoneLabel =
    pendingClearZone === 'all' ? 'todo el deck' : pendingClearZone ? getDeckZoneLabel(pendingClearZone) : ''
  const handleSearchCardPointerDown = (
    event: ReactPointerEvent<HTMLElement>,
    apiCardId: number,
  ) => onSearchCardPointerDown(event, apiCardId)

  const handleRequestClearDeckZone = useCallback((zone: DeckZoneType) => {
    if (deckBuilder[zone].length === 0) {
      return
    }

    setPendingClearZone(zone)
  }, [deckBuilder])

  const handleRequestClearAllDeckZones = () => {
    if (totalDeckCardCount === 0) {
      return
    }

    setPendingClearZone('all')
  }

  const handleConfirmClearDeckZone = () => {
    if (pendingClearZone === 'all') {
      onClearAllDeckZones()
      setPendingClearZone(null)
      return
    }

    if (!pendingClearZone || deckBuilder[pendingClearZone].length === 0) {
      setPendingClearZone(null)
      return
    }

    onClearDeckZone(pendingClearZone)
    setPendingClearZone(null)
  }

  const search: CardSearchViewState = {
    deckFormat,
    query,
    status,
    results: visibleSearchResults,
    rawResultCount: loadedSearchResultCount,
    errorMessage,
    hasMore,
    isLoadingMore,
    filters: searchFilters,
    activeFilterCount,
    hasSearchCriteria,
    maxedOutResultIds: maxedOutSearchResultIds,
  }
  const searchActions: CardSearchActions = {
    onQueryChange,
    onFilterChange: onSearchFiltersChange,
    onClearFilters: onClearSearchFilters,
    onLoadMore: onLoadMoreResults,
  }

  // Cada zona recibe el id arrastrado sólo si la carta es suya: las demás conservan sus props y no se re-renderizan.
  const dragIdFor = (zone: DeckZoneType) =>
    activeDragInstanceId !== null && deckBuilder[zone].some((card) => card.instanceId === activeDragInstanceId)
      ? activeDragInstanceId
      : null

  const previewCard = selectedDetailCard
  const selectedCardId = selectedDetailCard?.ygoprodeckId ?? null

  if (isDesktopDeckBuilder) {
    return (
      <section id="step1" className="h-full max-h-full min-h-0 overflow-hidden">
        <div className="grid h-full max-h-full min-h-0 grid-cols-[minmax(250px,24%)_minmax(0,1fr)_minmax(360px,30%)] items-stretch overflow-hidden bg-linear-to-b from-background to-secondary">
          <DeckBuilderClassicPreview
            card={previewCard}
            source={selectedDetailSource}
            deckCopy={selectedDeckCopyActions}
            onAddToZone={(zone) => {
              if (previewCard) {
                onAddSearchResultToZone(previewCard.ygoprodeckId, zone)
              }
            }}
          />

          <article
            className={cx(
              'relative h-full max-h-full min-h-0 min-w-0 overflow-hidden bg-linear-to-b from-secondary/98 to-background/99',
              builderRootDropState === 'valid' &&
                'shadow-[inset_0_0_0_1px_rgb(var(--primary-rgb)/0.14),0_0_0_1px_rgb(var(--primary-rgb)/0.08)]',
              builderRootDropState === 'invalid' &&
                'shadow-[inset_0_0_0_1px_rgb(var(--destructive-rgb)/0.16),0_0_0_1px_rgb(var(--destructive-rgb)/0.08)]',
            )}
            data-deck-builder-root="true"
            data-deck-builder-root-drop-state={builderRootDropState}
          >
            {builderRootDropState !== 'idle' ? (
              <div
                className={cx(
                  'pointer-events-none absolute inset-0 z-10 backdrop-saturate-[0.82]',
                  builderRootDropState === 'valid' ? 'bg-primary/26' : 'bg-destructive/22',
                )}
                data-drop-state={builderRootDropState}
              />
            ) : null}

            <div className="relative z-1 grid h-full min-h-0 content-start gap-[0.62rem] overflow-y-auto overflow-x-hidden px-[2.45rem] pb-[0.95rem] pt-[0.55rem] [scrollbar-gutter:stable] [scrollbar-width:thin] max-[1500px]:px-[1.7rem]">
              <div className="flex flex-wrap items-center justify-between gap-[0.8rem]">
                <div className="flex min-w-0 flex-[1_1_20rem] items-center gap-[0.8rem]">
                  <input
                    type="text"
                    value={deckBuilder.deckName}
                    onChange={(event) => onDeckNameChange(event.target.value)}
                    placeholder="Nombre del deck"
                    className={`${field} min-w-0 flex-[1_1_auto] px-[0.8rem] py-[0.52rem] text-body font-semibold`}
                  />

                  <label className="inline-flex min-w-0 flex-none items-center gap-[0.45rem] whitespace-nowrap text-body font-bold text-foreground">
                    <select
                      value={deckFormat}
                      onChange={(event) => onDeckFormatChange(event.target.value as DeckFormat)}
                      className={`${field} w-[9.25rem] py-[0.52rem] pl-3 pr-8 text-left text-body font-bold`}
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

                <div className="flex items-center gap-2">
                  <Button
                    variant="secondary"
                    size="sm"
                    onClick={handleRequestClearAllDeckZones}
                    disabled={totalDeckCardCount === 0}
                  >
                    Vaciar todo
                  </Button>

                  <Button
                    variant="secondary"
                    size="sm"
                    className="whitespace-nowrap"
                    onClick={() => setImportDrawerOpen(true)}
                  >
                    Import deck
                  </Button>
                </div>
              </div>

              {DECK_ZONE_ITEMS.map(({ zone, title }) => {
                const zoneNode = (
                  <DeckZone
                    zone={zone}
                    title={title}
                    cards={deckBuilder[zone]}
                    activeDragInstanceId={dragIdFor(zone)}
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
                  />
                )

                if (zone !== 'main') {
                  return zoneNode
                }

                return (
                  <div key={zone} className="relative">
                    {zoneNode}
                    {builderRootDropState !== 'idle' ? (
                      <div
                        className="pointer-events-none sticky top-[calc(50%-2.625rem)] z-12 flex h-0 w-full justify-center overflow-visible"
                        aria-hidden="true"
                      >
                        <span
                          className={cx(
                            'relative -top-48 grid size-[5.25rem] place-items-center rounded-full border-2 shadow-[0_0_0_1px_rgb(var(--primary-rgb)/0.16),0_12px_28px_rgb(0_0_0/0.28)]',
                            builderRootDropState === 'invalid'
                              ? 'border-destructive/38 bg-[rgb(28_10_13/0.94)]'
                              : 'border-primary/34 bg-foreground/96',
                          )}
                        >
                          <span className={plusGlyph(builderRootDropState === 'invalid')} />
                        </span>
                      </div>
                    ) : null}
                  </div>
                )
              })}
            </div>
          </article>

          <aside className="min-h-0 overflow-hidden border-l border-border/94 bg-linear-to-b from-card-background/96 to-background/98 p-0 min-[1101px]:flex min-[1101px]:h-full min-[1101px]:max-h-full min-[1101px]:flex-col">
            <DesktopSearchPanel
              search={search}
              actions={searchActions}
              deckCopyCounts={deckCopyCounts}
              activeDragSearchCardId={activeDragSearchCardId}
              selectedCardId={selectedCardId}
              onResultClick={onSearchResultClick}
              onAddCard={onAddSearchResultToDefaultZone}
              onResultPointerDown={handleSearchCardPointerDown}
            />
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
          confirmColor="danger"
          onCancel={() => setPendingClearZone(null)}
          onConfirm={handleConfirmClearDeckZone}
        />
      </section>
    )
  }

  return (
    <section
      id="step1"
      className={`${surface.stepShell} grid w-full gap-3 px-4 pt-3 min-[1101px]:p-2.5`}
    >
      <StepHero
        title="Armá tu deck"
        icon="cards"
        subtitle="Buscá cartas y armá Main, Extra y Side."
        help="Agregá cartas desde el buscador. Tocá una carta del deck para ver el detalle y sumar o quitar copias; para moverla entre Main, Extra y Side, mantenela presionada y arrastrala."
        sideVariant="form"
        side={
          <>
            <input
              aria-label="Nombre del deck"
              type="text"
              value={deckBuilder.deckName}
              onChange={(event) => onDeckNameChange(event.target.value)}
              placeholder="Nombre del deck"
              className={`${field} w-full px-2 py-[0.55rem] text-body font-semibold`}
            />
            <select
              aria-label="Formato del deck"
              value={deckFormat}
              onChange={(event) => onDeckFormatChange(event.target.value as DeckFormat)}
              className={`${field} text-left w-full px-2 py-[0.55rem] text-body font-semibold`}
            >
              <option value="unlimited">Sin límite</option>
              <option value="tcg">TCG</option>
              <option value="ocg">OCG</option>
              <option value="goat">GOAT</option>
              <option value="edison">Edison</option>
              <option value="genesys">Genesys</option>
            </select>
            <Button variant="secondary" size="sm" fullWidth onClick={() => setImportDrawerOpen(true)}>
              Importar
            </Button>
            <Button
              variant="secondary"
              size="sm"
              fullWidth
              onClick={handleRequestClearAllDeckZones}
              disabled={totalDeckCardCount === 0}
            >
              Vaciar todo
            </Button>
          </>
        }
      />

      {showGenesysPoints ? (
        <div className="grid gap-2 min-[1101px]:hidden">
          <div className={[genesysPointTotal > genesysPointCap ? `${surface.cardWarning}` : `${surface.card}`, 'grid gap-1.5 px-2 py-2'].join(' ')}>
            <span className="text-soft text-micro uppercase tracking-widest">Puntos Genesys</span>
            <strong className="text-body leading-none text-foreground">
              {formatInteger(genesysPointTotal)} / {formatInteger(genesysPointCap)} pts
            </strong>
            <p className="m-0 text-caption text-muted">
              Cap estándar de 100 puntos y hasta 3 copias por carta.
            </p>
          </div>
        </div>
      ) : null}

      {showFormatIssues ? (
        <div className="grid gap-2 min-[1101px]:hidden">
          <div className={`${surface.cardWarning} grid gap-1.5 px-2 py-2`}>
            <div className="flex items-center justify-between gap-2">
              <span className="text-soft text-micro uppercase tracking-widest">
                Regla pendiente
              </span>
              <span className="inline-flex size-[0.65rem] rounded-full bg-warning shadow-[0_0_0_1px_rgb(var(--warning-rgb)/0.24),0_0_18px_rgb(var(--warning-rgb)/0.22)]" />
            </div>
            <strong className="text-body leading-none text-foreground">
              {formatIssues.length} ajuste{formatIssues.length === 1 ? '' : 's'} para {formatLabel}
            </strong>
            <div className="grid gap-1">
              {visibleFormatIssues.map((issue) => (
                <p key={issue} className="m-0 text-caption text-muted">
                  {issue}
                </p>
              ))}
              {hasHiddenIssues ? (
                <p className="text-soft m-0 text-caption">+ {formatIssues.length - visibleFormatIssues.length} más</p>
              ) : null}
            </div>
          </div>
        </div>
      ) : null}

      <div className="grid items-start gap-3">
        <article className={`${surface.panelSoft} self-start w-full min-h-0 p-2.5`}>
          <div className="grid gap-2.5">
            <div className="sticky top-2 z-20 min-[1101px]:hidden">
              <Button variant="primary" size="lg" fullWidth onClick={() => setMobileSearchOpen(true)}>
                + Buscar y agregar cartas
              </Button>
            </div>

            {DECK_ZONE_ITEMS.map(({ zone, title }) => (
              <DeckZone
                key={zone}
                zone={zone}
                title={title}
                cards={deckBuilder[zone]}
                activeDragInstanceId={dragIdFor(zone)}
                dropState={
                  activeDropZone === zone
                    ? 'valid'
                    : invalidDropZone === zone
                      ? 'invalid'
                      : 'idle'
                }
                onClearZone={handleRequestClearDeckZone}
                onDeckCardPointerDown={onDeckCardPointerDown}
                onDeckCardClick={onDeckCardClick}
                onRemoveCard={onRemoveDeckCard}
              />
            ))}
          </div>
        </article>
      </div>

      {mobileSearchOpen ? (
        <MobileCardSearch
          search={search}
          actions={searchActions}
          deckCopyCounts={deckCopyCounts}
          zoneCounts={{
            main: deckBuilder.main.length,
            extra: deckBuilder.extra.length,
            side: deckBuilder.side.length,
          }}
          onAddCard={onAddSearchResultToDefaultZone}
          onOpenDetail={onSearchResultClick}
          onClose={() => setMobileSearchOpen(false)}
        />
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
        confirmColor="danger"
        onCancel={() => setPendingClearZone(null)}
        onConfirm={handleConfirmClearDeckZone}
      />
    </section>
  )
}

function getDeckZoneLabel(zone: DeckZoneType): string {
  return zone === 'main' ? 'Main Deck' : zone === 'extra' ? 'Extra Deck' : 'Side Deck'
}

function countDeckCopiesByCardId(deckBuilder: DeckBuilderState): Map<number, number> {
  const counts = new Map<number, number>()

  for (const card of [...deckBuilder.main, ...deckBuilder.extra, ...deckBuilder.side]) {
    counts.set(card.apiCard.ygoprodeckId, (counts.get(card.apiCard.ygoprodeckId) ?? 0) + 1)
  }

  return counts
}
