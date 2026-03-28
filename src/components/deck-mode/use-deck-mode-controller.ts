import { useCallback, useEffect, useMemo, type PointerEvent as ReactPointerEvent } from 'react'

import {
  buildDerivedDeckAttributes,
  buildDerivedDeckAttackValues,
  buildDerivedDeckDefenseValues,
  buildDerivedDeckLevels,
  buildDerivedDeckMonsterTypes,
} from '../../app/card-attributes'
import { deriveMainDeckCardsFromZone } from '../../app/calculator-state'
import { findDeckCard, getAddSearchResultIssue, getDefaultDeckZoneForCard } from '../../app/deck-builder'
import {
  addSearchResultToDeckZone,
  addSearchResultToDefaultDeckZone,
  clearDeckZone,
  moveDeckCardInBuilder,
  removeDeckCardFromBuilder,
  setDeckCardOrigin,
  setDeckName,
  setIsEditingDeck,
  toggleDeckCardRole,
} from '../../app/deck-builder-slice'
import { buildDeckFormatIssues, getDeckFormatLabel } from '../../app/deck-format'
import { buildDerivedDeckGroups } from '../../app/deck-groups'
import { GENESYS_POINT_CAP, calculateGenesysDeckPointTotal } from '../../app/genesys-format'
import { exportDeckAssets } from '../../app/deck-image-export'
import { type AppState, type DeckZone } from '../../app/model'
import { setDeckFormat, setMode } from '../../app/settings-slice'
import type { RootState } from '../../app/store'
import { useAppDispatch, useAppSelector } from '../../app/store-hooks'
import { useApiCardSearch } from '../../app/use-api-card-search'
import { useDeckPointerDrag } from '../../app/use-deck-pointer-drag'
import { useHoverPreview } from '../../app/use-hover-preview'
import { usePatternEditorActions } from '../../app/use-pattern-editor-actions'
import { usePatternMaintenance } from '../../app/use-pattern-maintenance'
import { isClassificationStepComplete } from '../../app/role-step'
import { useToastMessage } from '../../app/use-toast-message'
import { HOVER_PREVIEW_DELAY_MS } from '../../app/model'
import type { ApiCardReference, CardOrigin, CardRole } from '../../types'

const DEFAULT_PATTERNS_VERSION = 5

export function useDeckModeController() {
  const dispatch = useAppDispatch()
  const settings = useAppSelector((state: RootState) => state.settings)
  const deckBuilder = useAppSelector((state: RootState) => state.deckBuilder)
  const patternsState = useAppSelector((state: RootState) => state.patterns)

  const appState = useMemo<AppState>(
    () => ({
      mode: settings.mode,
      handSize: settings.handSize,
      deckFormat: settings.deckFormat,
      patternsSeeded: patternsState.patternsSeeded,
      patternsSeedVersion: patternsState.patternsSeedVersion,
      patterns: patternsState.patterns,
      deckBuilder,
    }),
    [
      deckBuilder,
      patternsState.patterns,
      patternsState.patternsSeedVersion,
      patternsState.patternsSeeded,
      settings.deckFormat,
      settings.handSize,
      settings.mode,
    ],
  )

  const {
    apiSearch,
    searchFilters,
    visibleSearchResults,
    activeFilterCount,
    hasSearchCriteria,
    isLoadingMore,
    clearFilters: clearSearchFilters,
    setQuery: setSearchQuery,
    updateSearchFilters,
    loadMoreResults,
  } = useApiCardSearch(settings.deckFormat)
  const { showToast } = useToastMessage()
  const {
    clearHoverPreview,
    hoverPreview,
    scheduleHoverPreview: scheduleHoverPreviewWithDelay,
  } = useHoverPreview({
    delayMs: HOVER_PREVIEW_DELAY_MS,
  })
  const {
    activeDragInstanceId,
    activeDragSearchCardId,
    consumeSuppressedSearchClick,
    dragOverlay,
    dragOverlayRef,
    hasPendingPointerDrag,
    startPointerDrag,
  } = useDeckPointerDrag({
    onClearHoverPreview: clearHoverPreview,
    onDrop: (pendingDrop) => {
      if (pendingDrop.payload.type === 'search-result') {
        dispatch(
          addSearchResultToDeckZone({
            apiCardId: pendingDrop.payload.apiCardId,
            deckFormat: settings.deckFormat,
            index: pendingDrop.index,
            results: apiSearch.results,
            zone: pendingDrop.zone,
          }),
        )
        return
      }

      dispatch(
        moveDeckCardInBuilder({
          instanceId: pendingDrop.payload.instanceId,
          zone: pendingDrop.zone,
          index: pendingDrop.index,
        }),
      )
    },
  })
  const formatLabel = getDeckFormatLabel(settings.deckFormat)

  const derivedMainCards = useMemo(
    () => deriveMainDeckCardsFromZone(deckBuilder.main),
    [deckBuilder.main],
  )
  const hasCompletedRoleStep = useMemo(
    () => isClassificationStepComplete(derivedMainCards),
    [derivedMainCards],
  )
  const formatIssues = useMemo(
    () => buildDeckFormatIssues(deckBuilder, settings.deckFormat),
    [deckBuilder, settings.deckFormat],
  )
  const genesysPointTotal = useMemo(
    () => (settings.deckFormat === 'genesys' ? calculateGenesysDeckPointTotal(deckBuilder) : null),
    [deckBuilder, settings.deckFormat],
  )
  const derivedGroups = useMemo(
    () => buildDerivedDeckGroups(derivedMainCards),
    [derivedMainCards],
  )
  const defaultGroupKey = useMemo(
    () =>
      derivedGroups.find((group) => group.kind === 'role' && group.copies > 0)?.key ??
      derivedGroups.find((group) => group.kind === 'origin' && group.copies > 0)?.key ??
      null,
    [derivedGroups],
  )
  const defaultAttribute = useMemo(
    () => buildDerivedDeckAttributes(derivedMainCards).find((attribute) => attribute.copies > 0)?.key ?? null,
    [derivedMainCards],
  )
  const defaultLevel = useMemo(
    () => buildDerivedDeckLevels(derivedMainCards)[0]?.key ?? null,
    [derivedMainCards],
  )
  const defaultMonsterType = useMemo(
    () => buildDerivedDeckMonsterTypes(derivedMainCards)[0]?.key ?? null,
    [derivedMainCards],
  )
  const defaultAtk = useMemo(
    () => buildDerivedDeckAttackValues(derivedMainCards)[0]?.key ?? null,
    [derivedMainCards],
  )
  const defaultDef = useMemo(
    () => buildDerivedDeckDefenseValues(derivedMainCards)[0]?.key ?? null,
    [derivedMainCards],
  )
  const patternActions = usePatternEditorActions({
    defaultAtk,
    defaultAttribute,
    defaultDef,
    defaultGroupKey,
    defaultLevel,
    defaultMonsterType,
    derivedMainCards,
  })

  usePatternMaintenance({
    defaultPatternsVersion: DEFAULT_PATTERNS_VERSION,
    hasCompletedRoleStep,
    state: appState,
  })

  const scheduleHoverPreview = useCallback(
    (name: string, card: ApiCardReference, anchor: HTMLElement) => {
      if (hasPendingPointerDrag()) {
        return
      }

      scheduleHoverPreviewWithDelay(name, card, anchor)
    },
    [hasPendingPointerDrag, scheduleHoverPreviewWithDelay],
  )

  const handleAddSearchResult = useCallback(
    (apiCardId: number) => {
      const card = apiSearch.results.find((entry) => entry.ygoprodeckId === apiCardId)

      if (!card) {
        return
      }

      const zone = getDefaultDeckZoneForCard(card)
      const addIssue = getAddSearchResultIssue(deckBuilder, card, zone, settings.deckFormat)

      if (addIssue) {
        showToast(addIssue, 'error')
        return
      }

      dispatch(
        addSearchResultToDefaultDeckZone({
          apiCardId,
          deckFormat: settings.deckFormat,
          results: apiSearch.results,
        }),
      )

      showToast('Carta añadida', 'success')
    },
    [apiSearch.results, deckBuilder, dispatch, settings.deckFormat, showToast],
  )

  const handleSearchResultClick = useCallback(
    (apiCardId: number) => {
      if (consumeSuppressedSearchClick()) {
        return
      }

      handleAddSearchResult(apiCardId)
    },
    [consumeSuppressedSearchClick, handleAddSearchResult],
  )

  const handleRemoveDeckCard = useCallback(
    (instanceId: string) => {
      dispatch(removeDeckCardFromBuilder(instanceId))
    },
    [dispatch],
  )

  const handleClearDeckZone = useCallback(
    (zone: DeckZone) => {
      const zoneCards = deckBuilder[zone]

      if (zoneCards.length === 0) {
        return
      }

      dispatch(clearDeckZone(zone))

      const zoneLabel =
        zone === 'main' ? 'Main Deck' : zone === 'extra' ? 'Extra Deck' : 'Side Deck'
      showToast(`Vaciaste ${zoneLabel}${settings.deckFormat === 'genesys' ? ` para ${formatLabel}` : ''}.`)
    },
    [deckBuilder, dispatch, formatLabel, settings.deckFormat, showToast],
  )

  const handleToggleRole = useCallback(
    (ygoprodeckId: number, role: CardRole) => {
      dispatch(toggleDeckCardRole({ ygoprodeckId, role }))
    },
    [dispatch],
  )

  const handleSetOrigin = useCallback(
    (ygoprodeckId: number, origin: CardOrigin) => {
      dispatch(setDeckCardOrigin({ ygoprodeckId, origin }))
    },
    [dispatch],
  )

  const handleDeckFormatChange = useCallback(
    (deckFormat: RootState['settings']['deckFormat']) => {
      dispatch(setDeckFormat(deckFormat))
    },
    [dispatch],
  )

  const handleDeckNameChange = useCallback(
    (deckName: string) => {
      dispatch(setDeckName(deckName))
    },
    [dispatch],
  )

  const handleModeChange = useCallback(
    (mode: RootState['settings']['mode']) => {
      dispatch(setMode(mode))
    },
    [dispatch],
  )

  const handleFinishEditing = useCallback(() => {
    dispatch(setIsEditingDeck(false))
  }, [dispatch])

  useEffect(() => {
    if (!deckBuilder.isEditingDeck) {
      return
    }
    const timer = window.setTimeout(() => {
      dispatch(setIsEditingDeck(false))
    }, 500)
    return () => {
      window.clearTimeout(timer)
    }
  }, [deckBuilder.main, deckBuilder.extra, deckBuilder.side, deckBuilder.isEditingDeck, dispatch])

  const handleExportDeckImage = useCallback(async () => {
    const totalCards = deckBuilder.main.length + deckBuilder.extra.length + deckBuilder.side.length

    if (totalCards === 0) {
      showToast('No hay cartas cargadas para exportar.', 'error')
      return
    }

    try {
      await exportDeckAssets(deckBuilder, settings.deckFormat)
      showToast('Imagen y TXT del deck descargados.', 'success')
    } catch (error) {
      showToast(error instanceof Error ? error.message : 'No se pudo exportar el deck.', 'error')
    }
  }, [deckBuilder, settings.deckFormat, showToast])

  const handleDeckCardPointerDown = useCallback(
    (event: ReactPointerEvent<HTMLElement>, instanceId: string) => {
      const draggedCard = findDeckCard(deckBuilder, instanceId)

      if (draggedCard) {
        startPointerDrag(event, { type: 'deck-card', instanceId }, draggedCard.name, draggedCard.apiCard)
      }
    },
    [deckBuilder, startPointerDrag],
  )

  const handleSearchCardPointerDown = useCallback(
    (event: ReactPointerEvent<HTMLElement>, apiCardId: number) => {
      const draggedCard = apiSearch.results.find((card) => card.ygoprodeckId === apiCardId)
      const visibleDraggedCard = visibleSearchResults.find((card) => card.ygoprodeckId === apiCardId)
      const card = visibleDraggedCard ?? draggedCard

      if (card) {
        startPointerDrag(event, { type: 'search-result', apiCardId }, card.name, card)
      }
    },
    [apiSearch.results, startPointerDrag, visibleSearchResults],
  )

  return {
    deckBuilderStep: {
      deckBuilder,
      deckFormat: settings.deckFormat,
      formatIssues,
      query: apiSearch.query,
      status: apiSearch.status,
      visibleSearchResults,
      isLoadingMore,
      errorMessage: apiSearch.errorMessage,
      hasMore: apiSearch.hasMore,
      loadedSearchResultCount: apiSearch.results.length,
      searchFilters,
      activeFilterCount,
      hasSearchCriteria,
      activeDragInstanceId,
      activeDragSearchCardId,
      onClearDeckZone: handleClearDeckZone,
      onRemoveDeckCard: handleRemoveDeckCard,
      onDeckCardPointerDown: handleDeckCardPointerDown,
      onSearchCardPointerDown: handleSearchCardPointerDown,
      onSearchResultClick: handleSearchResultClick,
      onQueryChange: setSearchQuery,
      onDeckNameChange: handleDeckNameChange,
      onDeckFormatChange: handleDeckFormatChange,
      onSearchFiltersChange: updateSearchFilters,
      onClearSearchFilters: clearSearchFilters,
      onLoadMoreResults: loadMoreResults,
      onHoverStart: scheduleHoverPreview,
      onHoverEnd: clearHoverPreview,
      genesysPointTotal,
      genesysPointCap: settings.deckFormat === 'genesys' ? GENESYS_POINT_CAP : null,
    },
    exportDeck: {
      deckName: deckBuilder.deckName,
      deckFormatLabel: formatLabel,
      mainDeckCount: deckBuilder.main.length,
      extraDeckCount: deckBuilder.extra.length,
      sideDeckCount: deckBuilder.side.length,
      totalCardCount: deckBuilder.main.length + deckBuilder.extra.length + deckBuilder.side.length,
      onExport: handleExportDeckImage,
    },
    feedback: {
      dragOverlay,
      dragOverlayRef,
      hoverPreview,
    },
    probability: {
      handSize: settings.handSize,
      mode: settings.mode,
      onModeChange: handleModeChange,
      patterns: patternsState.patterns,
      derivedMainCards,
      derivedGroups,
      patternActions,
      isEditingDeck: deckBuilder.isEditingDeck,
    },
    roles: {
      cards: derivedMainCards,
      onSetOrigin: handleSetOrigin,
      onToggleRole: handleToggleRole,
    },
  }
}
