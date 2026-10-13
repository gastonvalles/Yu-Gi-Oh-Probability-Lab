import { useMemo, useState, type PointerEvent as ReactPointerEvent } from 'react'

import { getDeckFormatLabel } from '../../app/deck-format'
import { getDesktopCompactDeckColumnCount } from '../../app/deck-zone-layout'
import type { DeckBuilderState, DeckZone as DeckZoneType } from '../../app/model'
import type { DeckDropIndicatorState } from '../../app/use-deck-pointer-drag'
import { DESKTOP_DECK_BUILDER_MEDIA_QUERY, useMediaQuery } from '../../app/use-media-query'
import { useBodyScrollLock } from '../../app/use-overlay'
import { formatInteger } from '../../app/utils'
import { t } from '../../i18n'
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
import { Callout } from '../ui/Callout'
import { Icon } from '../ui/Icon'
import { IconButton } from '../ui/IconButton'
import { Card } from '../ui/Card'
import { cx } from '../ui/cx'
import { ProgressRing } from '../ui/ProgressRing'
import { overline } from '../ui/typography'
import { DeckBuilderClassicPreview } from './DeckBuilderClassicPreview'
import { DeckImportDrawer } from './DeckImportDrawer'
import { FieldBox, fieldInline } from '../ui/FieldBox'


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
  onSortAllDeckZones: () => void
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
  onSortAllDeckZones,
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
  const [pendingClearAll, setPendingClearAll] = useState(false)
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
  const handleSearchCardPointerDown = (
    event: ReactPointerEvent<HTMLElement>,
    apiCardId: number,
  ) => onSearchCardPointerDown(event, apiCardId)

  const handleRequestClearAllDeckZones = () => {
    if (totalDeckCardCount === 0) {
      return
    }

    setPendingClearAll(true)
  }

  const handleConfirmClearAllDeckZones = () => {
    onClearAllDeckZones()
    setPendingClearAll(false)
  }

  // Vaciar es sólo de todo el deck (las zonas no se vacían ni se ordenan de a una): la confirmación es la misma en escritorio y en celular.
  const clearAllDialog = (
    <ConfirmDialog
      isOpen={pendingClearAll}
      title={t('deck.builder.clearAllTitle')}
      description={t('deck.builder.clearConfirm', { count: formatInteger(totalDeckCardCount) })}
      cancelLabel={t('common.cancel')}
      confirmLabel={t('deck.builder.clearConfirmYes')}
      confirmVariant="primary"
      confirmColor="danger"
      onCancel={() => setPendingClearAll(false)}
      onConfirm={handleConfirmClearAllDeckZones}
    />
  )

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
        <div className="grid h-full max-h-full min-h-0 grid-cols-[minmax(260px,24%)_minmax(0,1fr)_minmax(360px,30%)] items-stretch overflow-hidden">
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
              'relative h-full max-h-full min-h-0 min-w-0 overflow-hidden',
              builderRootDropState === 'valid' && 'shadow-[inset_0_0_0_2px_rgb(var(--primary-rgb)/0.35)]',
              builderRootDropState === 'invalid' && 'shadow-[inset_0_0_0_2px_rgb(var(--destructive-rgb)/0.35)]',
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

            <div className="relative z-1 grid h-full min-h-0 content-start gap-4 overflow-y-auto overflow-x-hidden px-8 pb-6 pt-4 [scrollbar-gutter:stable] [scrollbar-width:thin] max-[1500px]:px-5">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="flex min-w-0 flex-[1_1_16rem] items-stretch gap-3">
                  {/* Sin etiqueta: el nombre que se escribe y el formato que se elige ya dicen qué es cada campo. */}
                  <FieldBox className="min-w-0 max-w-[16rem] flex-[1_1_auto]">
                    <input
                      type="text"
                      aria-label={t('deck.builder.deckName')}
                      value={deckBuilder.deckName}
                      onChange={(event) => onDeckNameChange(event.target.value)}
                      placeholder={t('deck.builder.deckName')}
                      className={fieldInline}
                    />
                  </FieldBox>

                  <FieldBox className="w-[9.5rem] flex-none">
                    <select
                      aria-label={t('deck.builder.formatAria')}
                      value={deckFormat}
                      onChange={(event) => onDeckFormatChange(event.target.value as DeckFormat)}
                      className={cx(fieldInline, 'cursor-pointer')}
                    >
                      <option value="unlimited">{t('deck.format.unlimited')}</option>
                      <option value="tcg">TCG</option>
                      <option value="ocg">OCG</option>
                      <option value="goat">GOAT</option>
                      <option value="edison">Edison</option>
                      <option value="genesys">Genesys</option>
                    </select>
                  </FieldBox>
                </div>

                <div className="flex items-center gap-2">
                  <Button variant="secondary" size="md" icon="upload" className="whitespace-nowrap" onClick={() => setImportDrawerOpen(true)}>
                    {t('deck.builder.importDeck')}
                  </Button>

                  <IconButton
                    size="lg"
                    className="size-10"
                    aria-label={t('deck.builder.sortAll')}
                    title={t('deck.builder.sortAll')}
                    onClick={onSortAllDeckZones}
                    disabled={totalDeckCardCount < 2}
                  >
                    <Icon name="sort" />
                  </IconButton>

                  <IconButton
                    size="lg"
                    className="size-10"
                    aria-label={t('deck.builder.clearAll')}
                    title={t('deck.builder.clearAll')}
                    onClick={handleRequestClearAllDeckZones}
                    disabled={totalDeckCardCount === 0}
                  >
                    <Icon name="trash" />
                  </IconButton>
                </div>
              </div>

              {DECK_ZONE_ITEMS.map(({ zone, title }) => {
                const zoneNode = (
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
                    desktopCompact
                    desktopCompactColumnCount={desktopCompactColumnCount}
                    variant="classic-builder"
                    selectedCardId={selectedCardId}
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

          <aside className="min-h-0 overflow-hidden border-l border-border-subtle bg-card-background/50 p-0 min-[1101px]:flex min-[1101px]:h-full min-[1101px]:max-h-full min-[1101px]:flex-col">
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

        {clearAllDialog}
      </section>
    )
  }

  return (
    <section id="step1" className="grid w-full gap-4 px-gutter pb-6 pt-4">
      <StepHero
        title={t('deck.builder.title')}
        icon="cards"
        help={t('deck.builder.help')}
        sideVariant="form"
        side={
          <>
            <FieldBox>
              <input
                aria-label={t('deck.builder.deckName')}
                type="text"
                value={deckBuilder.deckName}
                onChange={(event) => onDeckNameChange(event.target.value)}
                placeholder={t('deck.builder.deckName')}
                className={fieldInline}
              />
            </FieldBox>
            <FieldBox>
              <select
                aria-label={t('deck.builder.formatAria')}
                value={deckFormat}
                onChange={(event) => onDeckFormatChange(event.target.value as DeckFormat)}
                className={cx(fieldInline, 'cursor-pointer')}
              >
                <option value="unlimited">{t('deck.format.unlimited')}</option>
                <option value="tcg">TCG</option>
                <option value="ocg">OCG</option>
                <option value="goat">GOAT</option>
                <option value="edison">Edison</option>
                <option value="genesys">Genesys</option>
              </select>
            </FieldBox>
          </>
        }
      />

      {showGenesysPoints ? (
        <Card padding="sm" tone={genesysPointTotal > genesysPointCap ? 'warning' : undefined} className="flex items-center gap-4 min-[1101px]:hidden">
          <ProgressRing
            value={genesysPointTotal / genesysPointCap}
            tone={genesysPointTotal > genesysPointCap ? 'warning' : 'brand'}
            size={60}
            strokeWidth={6}
            label={t('deck.builder.genesys.label', { total: formatInteger(genesysPointTotal), cap: formatInteger(genesysPointCap) })}
          >
            {formatInteger(genesysPointTotal)}
          </ProgressRing>
          <div className="grid gap-0.5">
            <span className={overline}>{t('deck.builder.genesys.title')}</span>
            <strong className="text-body font-semibold text-foreground tabular-nums">
              {t('deck.builder.genesys.total', { total: formatInteger(genesysPointTotal), cap: formatInteger(genesysPointCap) })}
            </strong>
            <p className="m-0 text-micro text-muted">{t('deck.builder.genesys.cap')}</p>
          </div>
        </Card>
      ) : null}

      {showFormatIssues ? (
        <Callout tone="warning" title={t('deck.builder.issues.title', { count: formatIssues.length, format: formatLabel })} className="min-[1101px]:hidden">
          <ul className="m-0 grid list-none gap-1 p-0">
            {visibleFormatIssues.map((issue) => (
              <li key={issue}>{issue}</li>
            ))}
            {hasHiddenIssues ? <li className="text-soft">{t('deck.builder.issues.more', { count: formatIssues.length - visibleFormatIssues.length })}</li> : null}
          </ul>
        </Callout>
      ) : null}

      <div className="grid items-start gap-3">
        <article className="w-full min-h-0 self-start">
          <div className="grid gap-4">
            {/* La barra del deck: tres íconos (con su nombre en el tooltip y en lectores de pantalla) y, a la misma altura, el buscador. Queda fija
                debajo de la barra de arriba del celular: así se vuelve a buscar sin subir a lo largo de todo el deck. */}
            <div className="sticky top-14 z-30 -mx-gutter flex items-center gap-1 border-b border-border-subtle bg-background/85 px-gutter py-2 backdrop-blur min-[1101px]:hidden">
              <IconButton tone="ghost" size="md" aria-label={t('deck.builder.import')} title={t('deck.builder.import')} onClick={() => setImportDrawerOpen(true)}>
                <Icon name="upload" size={20} />
              </IconButton>
              <IconButton tone="ghost" size="md" aria-label={t('deck.builder.sortAll')} title={t('deck.builder.sortAll')} disabled={totalDeckCardCount < 2} className="disabled:opacity-35" onClick={onSortAllDeckZones}>
                <Icon name="sort" size={20} />
              </IconButton>
              <IconButton tone="ghost" size="md" aria-label={t('deck.builder.clearAll')} title={t('deck.builder.clearAll')} disabled={totalDeckCardCount === 0} className="disabled:opacity-35" onClick={handleRequestClearAllDeckZones}>
                <Icon name="trash" size={20} />
              </IconButton>
              <Button variant="primary" size="sm" icon="search" className="ml-2 min-w-0 flex-1 pointer-coarse:min-h-10" onClick={() => setMobileSearchOpen(true)}>
                {t('deck.builder.search')}
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

      {clearAllDialog}
    </section>
  )
}

// Copias por id, pero contadas por nombre: dos artes de la misma carta (ids distintos) son la misma carta,
// igual que para el límite de copias.
function countDeckCopiesByCardId(deckBuilder: DeckBuilderState): Map<number, number> {
  const cards = [...deckBuilder.main, ...deckBuilder.extra, ...deckBuilder.side]
  const countsByName = new Map<string, number>()

  for (const card of cards) {
    const name = card.name.trim().toLocaleLowerCase()
    countsByName.set(name, (countsByName.get(name) ?? 0) + 1)
  }

  return new Map(cards.map((card) => [card.apiCard.ygoprodeckId, countsByName.get(card.name.trim().toLocaleLowerCase()) ?? 0]))
}
