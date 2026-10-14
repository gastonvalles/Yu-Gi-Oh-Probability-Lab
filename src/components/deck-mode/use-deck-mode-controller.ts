import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type PointerEvent as ReactPointerEvent } from 'react'

import { deriveMainDeckCardsFromZone } from '../../app/calculator-state'
import {
  DECK_ZONE_LIMITS,
  findDeckCard,
  getDefaultDeckZoneForCardInBuilder,
  getAddSearchResultIssue,
  isCardAllowedInDeckZone,
  isCardAtCopyLimit,
} from '../../app/deck-builder'
import {
  addSearchResultToDeckZone,
  clearAllDeckZones,
  confirmDeckCardClassification,
  moveDeckCardInBuilder,
  sortAllDeckZones,
  removeDeckCardFromBuilder,
  replaceDeckBuilder,
  setDeckCardOrigin,
  setDeckName,
  setIsEditingDeck,
  toggleDeckCardRole,
} from '../../app/deck-builder-slice'
import { buildDeckFormatIssues, getDeckFormatLabel } from '../../app/deck-format'
import { formatDataLoaded, loadFormatData } from '../../app/format-data'
import { GENESYS_POINT_CAP, calculateGenesysDeckPointTotal } from '../../app/genesys-format'
import { describeExportSelection, exportDeckAssets, type DeckExportSelection } from '../../app/deck-image-export'
import { type AppState, type DeckCardInstance, type DeckZone } from '../../app/model'
import { setGenericRuleEnabled, setSystemRuleName } from '../../app/patterns-slice'
import { setDeckFormat } from '../../app/settings-slice'
import type { RootState } from '../../app/store'
import { useAppDispatch, useAppSelector } from '../../app/store-hooks'
import { useApiCardSearch } from '../../app/use-api-card-search'
import { useDeckPointerDrag } from '../../app/use-deck-pointer-drag'
import { usePatternEditorActions } from '../../app/use-pattern-editor-actions'
import { usePatternMaintenance } from '../../app/use-pattern-maintenance'
import { isClassificationStepComplete } from '../../app/role-step'
import { STORAGE_FULL_EVENT } from '../../app/persistence'
import { useToastMessage } from '../../app/use-toast-message'
import { t } from '../../i18n'
import type { CardOrigin, CardRole } from '../../types'
import type { ApiCardSearchResult } from '../../ygoprodeck'
import type { DeckCopyActions } from '../card-detail/DeckCopyControls'

// v11: las reglas del sistema dejan de copiarse a las reglas propias.
const DEFAULT_PATTERNS_VERSION = 11

const DECK_ZONE_LABELS: Record<DeckZone, string> = {
  main: 'Main Deck',
  extra: 'Extra Deck',
  side: 'Side Deck',
}

export function useDeckModeController() {
  const dispatch = useAppDispatch()
  const settings = useAppSelector((state: RootState) => state.settings)
  const deckBuilder = useAppSelector((state: RootState) => state.deckBuilder)
  // Los manejadores de las cartas del deck leen el deck desde una ref: así no cambian en cada edición
  // (ni al escribir el nombre) y las zonas memoizadas no se re-dibujan por nada.
  const deckBuilderRef = useRef(deckBuilder)
  useLayoutEffect(() => {
    deckBuilderRef.current = deckBuilder
  })
  const patternsState = useAppSelector((state: RootState) => state.patterns)
  const [selectedDetailCard, setSelectedDetailCard] = useState<ApiCardSearchResult | null>(null)
  const [selectedDetailSource, setSelectedDetailSource] = useState<'search' | 'deck' | null>(null)
  const [selectedDeckInstanceId, setSelectedDeckInstanceId] = useState<string | null>(null)

  const appState = useMemo<AppState>(
    () => ({
      handSize: settings.handSize,
      deckFormat: settings.deckFormat,
      patternsSeeded: patternsState.patternsSeeded,
      patternsSeedVersion: patternsState.patternsSeedVersion,
      patterns: patternsState.patterns,
      disabledGenericRuleIds: patternsState.disabledGenericRuleIds,
      systemRuleNames: patternsState.systemRuleNames,
      deckBuilder,
    }),
    [
      deckBuilder,
      patternsState.disabledGenericRuleIds,
      patternsState.systemRuleNames,
      patternsState.patterns,
      patternsState.patternsSeedVersion,
      patternsState.patternsSeeded,
      settings.deckFormat,
      settings.handSize,
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
  const maxedOutSearchResultIds = useMemo(
    () =>
      new Set(
        visibleSearchResults
          .filter((card) => isCardAtCopyLimit(deckBuilder, card, settings.deckFormat))
          .map((card) => card.ygoprodeckId),
      ),
    [deckBuilder, settings.deckFormat, visibleSearchResults],
  )
  const { showToast } = useToastMessage()

  // Si el navegador no deja guardar (almacenamiento lleno), que no sea en silencio: el usuario puede exportar.
  useEffect(() => {
    const warn = () => showToast(t('deck.toast.storageFull'), 'error')
    window.addEventListener(STORAGE_FULL_EVENT, warn)
    return () => window.removeEventListener(STORAGE_FULL_EVENT, warn)
  }, [showToast])
  const {
    activeDragInstanceId,
    activeDropZone,
    invalidDropZone,
    activeDragSearchCardId,
    consumeSuppressedPointerClick,
    builderRootDropState,
    dragOverlay,
    dragOverlayRef,
    startPointerDrag,
  } = useDeckPointerDrag({
    canDrop: (payload, zone) => {
      if (payload.type === 'search-result') {
        const card = apiSearch.results.find((entry) => entry.ygoprodeckId === payload.apiCardId)

        if (!card) {
          return false
        }

        return getAddSearchResultIssue(deckBuilder, card, zone, settings.deckFormat) === null
      }

      const draggedCard = findDeckCard(deckBuilder, payload.instanceId)

      if (!draggedCard) {
        return false
      }

      const currentZone = findDeckCardZone(deckBuilder, payload.instanceId)

      if (currentZone === zone) {
        return true
      }

      if (!isCardAllowedInDeckZone(draggedCard.apiCard, zone)) {
        return false
      }

      return deckBuilder[zone].length < DECK_ZONE_LIMITS[zone]
    },
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

      const draggedCard = findDeckCard(deckBuilder, pendingDrop.payload.instanceId)

      if (!draggedCard || !isCardAllowedInDeckZone(draggedCard.apiCard, pendingDrop.zone)) {
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
    resolveSearchDrop: (payload) => {
      const card = apiSearch.results.find((entry) => entry.ygoprodeckId === payload.apiCardId)

      if (!card) {
        return null
      }

      const zone = getDefaultDeckZoneForCardInBuilder(deckBuilder, card)

      return { zone, index: deckBuilder[zone].length }
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
  const patternEditorDefaults = useMemo(() => ({ derivedMainCards }), [derivedMainCards])
  const patternActions = usePatternEditorActions(patternEditorDefaults)

  const handleSetGenericRuleEnabled = useCallback(
    (ruleId: string, enabled: boolean) => dispatch(setGenericRuleEnabled({ ruleId, enabled })),
    [dispatch],
  )

  const handleRenameSystemRule = useCallback(
    (ruleId: string, name: string) => dispatch(setSystemRuleName({ ruleId, name })),
    [dispatch],
  )

  usePatternMaintenance({
    defaultPatternsVersion: DEFAULT_PATTERNS_VERSION,
    hasCompletedRoleStep,
    state: appState,
  })

  const resolveSearchResult = useCallback(
    (apiCardId: number) => {
      const liveCard = apiSearch.results.find((entry) => entry.ygoprodeckId === apiCardId)

      if (liveCard) {
        return liveCard
      }

      return selectedDetailCard?.ygoprodeckId === apiCardId ? selectedDetailCard : null
    },
    [apiSearch.results, selectedDetailCard],
  )

  const openCardDetail = useCallback(
    (apiCardId: number) => {
      const card =
        visibleSearchResults.find((entry) => entry.ygoprodeckId === apiCardId) ??
        resolveSearchResult(apiCardId)

      if (!card) {
        return
      }

      setSelectedDetailCard(card)
      setSelectedDetailSource('search')
    },
    [resolveSearchResult, visibleSearchResults],
  )

  const closeCardDetail = useCallback(() => {
    setSelectedDetailCard(null)
    setSelectedDetailSource(null)
    setSelectedDeckInstanceId(null)
  }, [])

  const handleDeckCardClick = useCallback(
    (instanceId: string) => {
      if (consumeSuppressedPointerClick()) {
        return
      }

      const deckCard = findDeckCard(deckBuilderRef.current, instanceId)

      if (!deckCard) {
        return
      }

      setSelectedDetailCard(buildDetailCardFromDeckCard(deckCard))
      setSelectedDetailSource('deck')
      setSelectedDeckInstanceId(instanceId)
    },
    [consumeSuppressedPointerClick],
  )

  const handleAddSearchResultToZone = useCallback(
    (apiCardId: number, zone: DeckZone, options: { silent?: boolean } = {}) => {
      const card = resolveSearchResult(apiCardId)

      if (!card) {
        return false
      }

      const addIssue = getAddSearchResultIssue(deckBuilder, card, zone, settings.deckFormat)

      if (addIssue) {
        showToast(addIssue, 'error')
        return false
      }

      const resultsForDispatch = apiSearch.results.some((entry) => entry.ygoprodeckId === apiCardId)
        ? apiSearch.results
        : [...apiSearch.results, card]

      dispatch(
        addSearchResultToDeckZone({
          apiCardId,
          deckFormat: settings.deckFormat,
          index: deckBuilder[zone].length,
          results: resultsForDispatch,
          zone,
        }),
      )

      if (!options.silent) {
        showToast(t('deck.toast.cardAdded'), 'success')
      }

      return true
    },
    [apiSearch.results, deckBuilder, dispatch, resolveSearchResult, settings.deckFormat, showToast],
  )

  const handleAddSearchResultToDefaultZone = useCallback(
    (apiCardId: number) => {
      const card = resolveSearchResult(apiCardId)

      if (!card) {
        return false
      }

      return handleAddSearchResultToZone(apiCardId, getDefaultDeckZoneForCardInBuilder(deckBuilder, card), {
        silent: true,
      })
    },
    [deckBuilder, handleAddSearchResultToZone, resolveSearchResult],
  )

  const handleSearchResultClick = useCallback(
    (apiCardId: number) => {
      if (consumeSuppressedPointerClick()) {
        return
      }

      openCardDetail(apiCardId)
    },
    [consumeSuppressedPointerClick, openCardDetail],
  )

  const handleRemoveDeckCard = useCallback(
    (instanceId: string) => {
      dispatch(removeDeckCardFromBuilder(instanceId))
    },
    [dispatch],
  )

  const selectedDeckCopy = useMemo(() => {
    const zone = selectedDeckInstanceId ? findDeckCardZone(deckBuilder, selectedDeckInstanceId) : null
    const deckCard = selectedDeckInstanceId ? findDeckCard(deckBuilder, selectedDeckInstanceId) : null

    if (!zone || !deckCard) {
      return null
    }

    const cardId = deckCard.apiCard.ygoprodeckId

    return {
      zone,
      cardId,
      copies: deckBuilder[zone].filter((card) => card.apiCard.ygoprodeckId === cardId).length,
      canAddCopy: getAddSearchResultIssue(deckBuilder, buildDetailCardFromDeckCard(deckCard), zone, settings.deckFormat) === null,
    }
  }, [deckBuilder, selectedDeckInstanceId, settings.deckFormat])

  const handleRemoveSelectedDeckCopy = useCallback(() => {
    if (!selectedDeckInstanceId || !selectedDeckCopy) {
      return
    }

    dispatch(removeDeckCardFromBuilder(selectedDeckInstanceId))

    // Si quedan copias en la zona, el detalle sigue abierto sobre otra de ellas.
    const nextCopy = deckBuilder[selectedDeckCopy.zone].find(
      (card) => card.apiCard.ygoprodeckId === selectedDeckCopy.cardId && card.instanceId !== selectedDeckInstanceId,
    )

    if (nextCopy) {
      setSelectedDeckInstanceId(nextCopy.instanceId)
      return
    }

    closeCardDetail()
    showToast(t('deck.toast.cardRemoved'), 'warning')
  }, [closeCardDetail, deckBuilder, dispatch, selectedDeckCopy, selectedDeckInstanceId, showToast])

  const handleAddSelectedDeckCopy = useCallback(() => {
    if (selectedDeckCopy) {
      handleAddSearchResultToZone(selectedDeckCopy.cardId, selectedDeckCopy.zone, { silent: true })
    }
  }, [handleAddSearchResultToZone, selectedDeckCopy])

  const selectedDeckCopyActions = useMemo<DeckCopyActions | null>(
    () =>
      selectedDeckCopy
        ? {
            zoneLabel: DECK_ZONE_LABELS[selectedDeckCopy.zone],
            copies: selectedDeckCopy.copies,
            canAddCopy: selectedDeckCopy.canAddCopy,
            onRemoveCopy: handleRemoveSelectedDeckCopy,
            onAddCopy: handleAddSelectedDeckCopy,
          }
        : null,
    [handleAddSelectedDeckCopy, handleRemoveSelectedDeckCopy, selectedDeckCopy],
  )

  const handleSortAllDeckZones = useCallback(() => {
    dispatch(sortAllDeckZones())
    showToast(t('deck.toast.allSorted'), 'success')
  }, [dispatch, showToast])

  const handleClearAllDeckZones = useCallback(() => {
    if (deckBuilder.main.length === 0 && deckBuilder.extra.length === 0 && deckBuilder.side.length === 0) {
      return
    }

    dispatch(clearAllDeckZones())
    showToast(
      settings.deckFormat === 'genesys' ? t('deck.toast.allClearedFor', { format: formatLabel }) : t('deck.toast.allCleared'),
      'warning',
    )
  }, [deckBuilder, dispatch, formatLabel, settings.deckFormat, showToast])

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

  const handleConfirmClassification = useCallback(
    (ygoprodeckId: number) => {
      dispatch(confirmDeckCardClassification(ygoprodeckId))
    },
    [dispatch],
  )

  const handleDeckFormatChange = useCallback(
    async (deckFormat: RootState['settings']['deckFormat']) => {
      // Edison y Genesys validan el deck con sus tablas: si todavía no bajaron (se piden en un momento ocioso), el cambio las espera. Si no se pueden bajar, cambia igual.
      if ((deckFormat === 'edison' || deckFormat === 'genesys') && !formatDataLoaded()) {
        await loadFormatData().catch(() => {})
      }

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

  const handleImportDeck = useCallback(
    (nextDeckBuilder: AppState['deckBuilder']) => {
      dispatch(replaceDeckBuilder(nextDeckBuilder))
      showToast(t('deck.toast.imported'), 'success')
    },
    [dispatch, showToast],
  )

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

  const handleExportDeckImage = useCallback(
    async (selection: DeckExportSelection) => {
      const totalCards = deckBuilder.main.length + deckBuilder.extra.length + deckBuilder.side.length

      if (totalCards === 0) {
        showToast(t('deck.toast.nothingToExport'), 'error')
        return
      }

      try {
        const { decklistOverflow } = await exportDeckAssets(deckBuilder, settings.deckFormat, selection)

        if (decklistOverflow.length > 0) {
          showToast(t('deck.toast.pdfOverflow', { sections: decklistOverflow.join(', ') }), 'warning')
        } else {
          showToast(t('deck.toast.exported', { files: describeExportSelection(selection) }), 'success')
        }
      } catch (error) {
        showToast(error instanceof Error ? error.message : t('deck.toast.exportFailed'), 'error')
      }
    },
    [deckBuilder, settings.deckFormat, showToast],
  )

  const handleDeckCardPointerDown = useCallback(
    (event: ReactPointerEvent<HTMLElement>, instanceId: string) => {
      const draggedCard = findDeckCard(deckBuilderRef.current, instanceId)

      if (draggedCard) {
        startPointerDrag(event, { type: 'deck-card', instanceId }, draggedCard.name, draggedCard.apiCard)
      }
    },
    [startPointerDrag],
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
      maxedOutSearchResultIds,
      isLoadingMore,
      errorMessage: apiSearch.errorMessage,
      hasMore: apiSearch.hasMore,
      loadedSearchResultCount: apiSearch.results.length,
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
      isCardDetailOpen: selectedDetailCard !== null,
      onSortAllDeckZones: handleSortAllDeckZones,
      onClearAllDeckZones: handleClearAllDeckZones,
      onRemoveDeckCard: handleRemoveDeckCard,
      onDeckCardPointerDown: handleDeckCardPointerDown,
      onDeckCardClick: handleDeckCardClick,
      onSearchCardPointerDown: handleSearchCardPointerDown,
      onSearchResultClick: handleSearchResultClick,
      onAddSearchResultToDefaultZone: handleAddSearchResultToDefaultZone,
      onAddSearchResultToZone: handleAddSearchResultToZone,
      onQueryChange: setSearchQuery,
      onDeckNameChange: handleDeckNameChange,
      onDeckFormatChange: handleDeckFormatChange,
      onImportDeck: handleImportDeck,
      onSearchFiltersChange: updateSearchFilters,
      onClearSearchFilters: clearSearchFilters,
      onLoadMoreResults: loadMoreResults,
      onCloseCardDetail: closeCardDetail,
      genesysPointTotal,
      genesysPointCap: settings.deckFormat === 'genesys' ? GENESYS_POINT_CAP : null,
    },
    exportDeck: {
      deckBuilder,
      deckFormat: settings.deckFormat,
      deckName: deckBuilder.deckName,
      mainDeckCount: deckBuilder.main.length,
      onExport: handleExportDeckImage,
    },
    feedback: {
      dragOverlay,
      dragOverlayRef,
    },
    probability: {
      handSize: settings.handSize,
      patterns: patternsState.patterns,
      disabledGenericRuleIds: patternsState.disabledGenericRuleIds,
      systemRuleNames: patternsState.systemRuleNames,
      onSetGenericRuleEnabled: handleSetGenericRuleEnabled,
      onRenameSystemRule: handleRenameSystemRule,
      derivedMainCards,
      patternActions,
      patternEditorDefaults,
      isEditingDeck: deckBuilder.isEditingDeck,
      onSetOrigin: handleSetOrigin,
      onToggleRole: handleToggleRole,
      onConfirmClassification: handleConfirmClassification,
    },
    roles: {
      cards: derivedMainCards,
      onSetOrigin: handleSetOrigin,
      onToggleRole: handleToggleRole,
      onConfirm: handleConfirmClassification,
    },
  }
}

function buildDetailCardFromDeckCard(card: DeckCardInstance): ApiCardSearchResult {
  return {
    name: card.name,
    ...card.apiCard,
  }
}

function findDeckCardZone(deckBuilder: AppState['deckBuilder'], instanceId: string): DeckZone | null {
  const zones: DeckZone[] = ['main', 'extra', 'side']

  for (const zone of zones) {
    if (deckBuilder[zone].some((card) => card.instanceId === instanceId)) {
      return zone
    }
  }

  return null
}
