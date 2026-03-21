import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
} from 'react'

import yugiohLogo from './assets/yugioh-logo.webp'
import { DeckRolesPanel } from './components/DeckRolesPanel'
import { DeckZone } from './components/DeckZone'
import { ExportDeckPanel } from './components/ExportDeckPanel'
import { HoverPreview } from './components/HoverPreview'
import { ModeTabs } from './components/ModeTabs'
import { ProbabilityPanel } from './components/ProbabilityPanel'
import { SearchPanel } from './components/SearchPanel'
import { WorkspacePanel } from './components/WorkspacePanel'
import { buildDerivedDeckGroups } from './app/deck-groups'
import { exportDeckAsImage } from './app/deck-image-export'
import { normalizeHandPatternCategory } from './app/patterns'
import { getPatternDedupKey } from './app/patterns'
import {
  addRequirement,
  addRequirementCardToPool,
  addSearchResultToDefaultZone,
  addSearchResultToZone,
  buildDefaultPatternsFromGroups,
  buildDeckFormatIssues,
  createPattern,
  deriveMainDeckCardsFromZone,
  findDeckCard,
  moveDeckCard,
  removeDeckCard,
  removePattern,
  removeRequirement,
  removeRequirementCardFromPool,
  sortSearchResults,
  toggleRoleForCard,
  updatePatternCategory,
  updatePatternAllowSharedCards,
  updatePatternMatchMode,
  updatePatternMinimumMatches,
  updatePatternName,
  updateRequirementCount,
  updateRequirementDistinct,
  updateRequirementGroup,
  updateRequirementKind,
  updateRequirementSource,
} from './app/deck-utils'
import type {
  AppState,
  CalculatorMode,
  DeckZone as DeckZoneType,
  DragPayload,
  HoverPreviewState,
} from './app/model'
import type { HandPatternCategory } from './types'
import {
  createInitialSearchState,
  HOVER_PREVIEW_DELAY_MS,
  SEARCH_DEBOUNCE_MS,
  SEARCH_MIN_QUERY_LENGTH,
  SEARCH_PAGE_SIZE,
} from './app/model'
import {
  fromPortableConfig,
  getCachedApiSearch,
  loadApiSearchCache,
  loadState,
  saveState,
  storeCachedApiSearch,
  toPortableConfig,
} from './app/persistence'
import {
  buildSnapshotComparison,
  createSnapshot,
  loadSnapshots,
  saveSnapshots,
  type SnapshotComparison,
  type WorkspaceSnapshot,
} from './app/workspace'
import { createId, formatInteger, toNonNegativeInteger } from './app/utils'
import type { ApiCardReference } from './types'
import { searchCardsByName, type ApiCardSearchResult } from './ygoprodeck'
import { CardArt } from './components/CardArt'

interface DragOverlayState {
  name: string
  card: ApiCardReference
  width: number
  height: number
  offsetX: number
  offsetY: number
}

interface PointerDragSession {
  payload: DragPayload
  name: string
  card: ApiCardReference
  width: number
  height: number
  offsetX: number
  offsetY: number
  startX: number
  startY: number
  dragging: boolean
}

export default function App() {
  const DEFAULT_PATTERNS_VERSION = 2
  const [state, setState] = useState<AppState>(() => loadState())
  const [apiSearch, setApiSearch] = useState(() => createInitialSearchState<ApiCardSearchResult>())
  const [searchTypeFilter, setSearchTypeFilter] = useState('all')
  const [searchArchetypeFilter, setSearchArchetypeFilter] = useState('')
  const [snapshots, setSnapshots] = useState<WorkspaceSnapshot[]>(() => loadSnapshots())
  const [snapshotComparison, setSnapshotComparison] = useState<SnapshotComparison | null>(null)
  const [dragPayload, setDragPayload] = useState<DragPayload | null>(null)
  const [activeDragInstanceId, setActiveDragInstanceId] = useState<string | null>(null)
  const [activeDragSearchCardId, setActiveDragSearchCardId] = useState<number | null>(null)
  const [hoverPreview, setHoverPreview] = useState<HoverPreviewState | null>(null)
  const [dragOverlay, setDragOverlay] = useState<DragOverlayState | null>(null)
  const [builderHeight, setBuilderHeight] = useState<number | null>(null)
  const [mobileSearchOpen, setMobileSearchOpen] = useState(false)

  const builderRef = useRef<HTMLElement>(null)
  const dragOverlayRef = useRef<HTMLDivElement>(null)
  const dragOverlayRafRef = useRef<number>(0)
  const dragOverlayPositionRef = useRef<{ x: number; y: number } | null>(null)
  const pointerDragSessionRef = useRef<PointerDragSession | null>(null)
  const pointerDragCleanupRef = useRef<(() => void) | null>(null)
  const suppressSearchClickRef = useRef(false)
  const searchCacheRef = useRef(loadApiSearchCache())
  const searchDebounceTimerRef = useRef<number>(0)
  const searchRequestIdRef = useRef(0)
  const hoverTimerRef = useRef<number>(0)

  const derivedMainCards = useMemo(
    () => deriveMainDeckCardsFromZone(state.deckBuilder.main),
    [state.deckBuilder.main],
  )
  const classifiedCardCount = useMemo(
    () => derivedMainCards.filter((card) => card.roles.length > 0).length,
    [derivedMainCards],
  )
  const hasCompletedRoleStep = derivedMainCards.length > 0 && classifiedCardCount === derivedMainCards.length
  const formatIssues = useMemo(
    () => buildDeckFormatIssues(state.deckBuilder, state.deckFormat),
    [state.deckBuilder, state.deckFormat],
  )
  const derivedGroups = useMemo(() => buildDerivedDeckGroups(derivedMainCards), [derivedMainCards])
  const defaultGroupKey = useMemo(() => derivedGroups.find((group) => group.copies > 0)?.key ?? null, [derivedGroups])
  const visibleSearchResults = useMemo(
    () =>
      apiSearch.results.filter((card) => {
        const cardType = card.cardType.toLowerCase()
        const frameType = card.frameType.toLowerCase()

        if (
          (searchTypeFilter === 'monster' && !cardType.includes('monster')) ||
          (searchTypeFilter === 'spell' && !cardType.includes('spell')) ||
          (searchTypeFilter === 'trap' && !cardType.includes('trap')) ||
          (searchTypeFilter === 'extra' &&
            !frameType.includes('fusion') &&
            !frameType.includes('synchro') &&
            !frameType.includes('xyz') &&
            !frameType.includes('link'))
        ) {
          return false
        }

        if (
          searchArchetypeFilter.trim().length > 0 &&
          !(card.archetype ?? '').toLowerCase().includes(searchArchetypeFilter.trim().toLowerCase())
        ) {
          return false
        }

        return true
      }),
    [apiSearch.results, searchArchetypeFilter, searchTypeFilter],
  )

  useEffect(() => {
    saveState(state)
  }, [state])

  useEffect(() => {
    setSnapshotComparison(null)
  }, [state])

  useEffect(() => {
    saveSnapshots(snapshots)
  }, [snapshots])

  useEffect(() => {
    if (!hasCompletedRoleStep || state.patternsSeedVersion >= DEFAULT_PATTERNS_VERSION) {
      return
    }

    setState((current) => {
      if (current.patternsSeedVersion >= DEFAULT_PATTERNS_VERSION) {
        return current
      }

      const currentDerivedMainCards = deriveMainDeckCardsFromZone(current.deckBuilder.main)
      const currentDerivedGroups = buildDerivedDeckGroups(currentDerivedMainCards)
      const defaultPatterns = buildDefaultPatternsFromGroups(currentDerivedGroups)
      const uniquePatterns = current.patterns.filter((pattern, index, patterns) => {
        const patternKey = getPatternDedupKey(pattern)

        return patterns.findIndex((entry) => getPatternDedupKey(entry) === patternKey) === index
      })
      const existingPatternKeys = new Set(
        uniquePatterns.map((pattern) => getPatternDedupKey(pattern)),
      )
      const missingDefaults = defaultPatterns.filter(
        (pattern) =>
          !existingPatternKeys.has(getPatternDedupKey(pattern)),
      )

      return {
        ...current,
        patternsSeeded: true,
        patternsSeedVersion: DEFAULT_PATTERNS_VERSION,
        patterns: [...uniquePatterns, ...missingDefaults],
      }
    })
  }, [DEFAULT_PATTERNS_VERSION, hasCompletedRoleStep, state.patternsSeedVersion])

  useEffect(() => {
    const seenKeys = new Set<string>()
    const hasDuplicates = state.patterns.some((pattern) => {
      const patternKey = getPatternDedupKey(pattern)

      if (seenKeys.has(patternKey)) {
        return true
      }

      seenKeys.add(patternKey)
      return false
    })

    if (!hasDuplicates) {
      return
    }

    setState((current) => {
      const nextSeenKeys = new Set<string>()

      return {
        ...current,
        patterns: current.patterns.filter((pattern) => {
          const patternKey = getPatternDedupKey(pattern)

          if (nextSeenKeys.has(patternKey)) {
            return false
          }

          nextSeenKeys.add(patternKey)
          return true
        }),
      }
    })
  }, [state.patterns])

  useEffect(() => {
    const needsPatternMigration = state.patterns.some(
      (pattern) => pattern.category !== 'good' && pattern.category !== 'bad',
    )

    const needsMatchModeMigration = state.patterns.some(
      (pattern) =>
        (pattern.requirements.length <= 1 && pattern.matchMode !== 'all') ||
        (pattern.matchMode === 'at-least' && pattern.requirements.length > 1 && pattern.minimumMatches < 2),
    )

    const needsSharedCardsMigration = state.patterns.some(
      (pattern) => typeof pattern.allowSharedCards !== 'boolean',
    )

    if (!needsPatternMigration && !needsMatchModeMigration && !needsSharedCardsMigration) {
      return
    }

    setState((current) => ({
      ...current,
      patterns: current.patterns.map((pattern) => ({
        ...pattern,
        category: normalizeHandPatternCategory(pattern.category),
        matchMode:
          pattern.requirements.length <= 1
            ? 'all'
            : pattern.matchMode,
        allowSharedCards: pattern.allowSharedCards === true,
        minimumMatches:
          pattern.requirements.length <= 1
            ? 1
            : pattern.matchMode === 'all'
              ? pattern.requirements.length
              : pattern.matchMode === 'any'
                ? 1
                : Math.max(2, Math.min(pattern.minimumMatches, pattern.requirements.length)),
      })),
    }))
  }, [state.patterns])

  useLayoutEffect(() => {
    const element = builderRef.current

    if (!element || state.mode !== 'deck') {
      setBuilderHeight(null)
      return
    }

    const updateHeight = () => {
      setBuilderHeight(Math.ceil(element.getBoundingClientRect().height))
    }

    updateHeight()

    const observer = new ResizeObserver(updateHeight)
    observer.observe(element)

    return () => {
      observer.disconnect()
    }
  }, [state.mode, state.deckBuilder.main.length, state.deckBuilder.extra.length, state.deckBuilder.side.length])

  const runApiSearch = useCallback(async (query: string, page = 0) => {
    const trimmedQuery = query.trim()

    if (trimmedQuery.length < SEARCH_MIN_QUERY_LENGTH) {
      setApiSearch((current) => ({
        ...current,
        status: 'idle',
        results: [],
        page: 0,
        hasMore: false,
        errorMessage: '',
      }))
      return
    }

    const cachedResults = getCachedApiSearch(searchCacheRef.current, trimmedQuery, page)

    if (cachedResults) {
      setApiSearch((current) => ({
        ...current,
        status: 'success',
        errorMessage: '',
        results: sortSearchResults(cachedResults.results),
        page,
        hasMore: cachedResults.hasMore,
      }))
      return
    }

    const requestId = searchRequestIdRef.current + 1
    searchRequestIdRef.current = requestId

    setApiSearch((current) => ({
      ...current,
      status: 'loading',
      errorMessage: '',
      page,
    }))

    try {
      const searchPage = await searchCardsByName(trimmedQuery, SEARCH_PAGE_SIZE, page * SEARCH_PAGE_SIZE)

      if (searchRequestIdRef.current !== requestId) {
        return
      }

      const sortedResults = sortSearchResults(searchPage.results)
      searchCacheRef.current = storeCachedApiSearch(searchCacheRef.current, trimmedQuery, page, {
        savedAt: Date.now(),
        results: sortedResults,
        hasMore: searchPage.hasMore,
      })

      setApiSearch((current) => ({
        ...current,
        status: 'success',
        results: sortedResults,
        errorMessage: '',
        page,
        hasMore: searchPage.hasMore,
      }))
    } catch (error) {
      if (searchRequestIdRef.current !== requestId) {
        return
      }

      setApiSearch((current) => ({
        ...current,
        status: 'error',
        results: [],
        page,
        hasMore: false,
        errorMessage: error instanceof Error ? error.message : 'No se pudo consultar YGOPRODeck.',
      }))
    }
  }, [])

  useEffect(() => {
    window.clearTimeout(searchDebounceTimerRef.current)

    const trimmedQuery = apiSearch.query.trim()

    if (trimmedQuery.length < SEARCH_MIN_QUERY_LENGTH) {
      setApiSearch((current) =>
        current.status === 'idle' && current.results.length === 0 && current.page === 0
          ? current
          : {
              ...current,
              status: 'idle',
              results: [],
              hasMore: false,
              errorMessage: '',
              page: 0,
            },
      )
      return
    }

    setApiSearch((current) =>
      current.status === 'loading' && current.page === 0
        ? current
        : {
            ...current,
            status: 'loading',
            errorMessage: '',
            page: 0,
          },
    )

    searchDebounceTimerRef.current = window.setTimeout(() => {
      void runApiSearch(trimmedQuery, 0)
    }, SEARCH_DEBOUNCE_MS)

    return () => {
      window.clearTimeout(searchDebounceTimerRef.current)
    }
  }, [apiSearch.query, runApiSearch])

  useEffect(() => {
    return () => {
      window.clearTimeout(searchDebounceTimerRef.current)
      window.clearTimeout(hoverTimerRef.current)
      window.cancelAnimationFrame(dragOverlayRafRef.current)
      pointerDragCleanupRef.current?.()
    }
  }, [])

  useLayoutEffect(() => {
    const overlayElement = dragOverlayRef.current
    const overlay = dragOverlay
    const position = dragOverlayPositionRef.current

    if (!overlayElement || !overlay || !position) {
      return
    }

    overlayElement.style.transform = `translate3d(${position.x - overlay.offsetX}px, ${position.y - overlay.offsetY}px, 0)`
  }, [dragOverlay])

  const scheduleHoverPreview = useCallback((name: string, card: ApiCardReference, anchor: HTMLElement) => {
    if (dragPayload) {
      return
    }

    window.clearTimeout(hoverTimerRef.current)

    hoverTimerRef.current = window.setTimeout(() => {
      setHoverPreview({
        name,
        card,
        anchor,
      })
    }, HOVER_PREVIEW_DELAY_MS)
  }, [dragPayload])

  const clearHoverPreview = useCallback(() => {
    window.clearTimeout(hoverTimerRef.current)
    setHoverPreview(null)
  }, [])

  const resolveDropTarget = useCallback((clientX: number, clientY: number): { zone: DeckZoneType; index: number } | null => {
    const hoveredElement = document.elementFromPoint(clientX, clientY)

    if (!(hoveredElement instanceof HTMLElement)) {
      return null
    }

    const cardElement = hoveredElement.closest<HTMLElement>('[data-deck-card-index]')

    if (cardElement) {
      const zone = cardElement.dataset.deckZone as DeckZoneType | undefined
      const index = Number.parseInt(cardElement.dataset.deckCardIndex ?? '', 10)

      if (!zone || Number.isNaN(index)) {
        return null
      }

      const rect = cardElement.getBoundingClientRect()

      return {
        zone,
        index: clientX > rect.left + rect.width / 2 ? index + 1 : index,
      }
    }

    const zoneElement = hoveredElement.closest<HTMLElement>('[data-deck-zone]')

    if (!zoneElement) {
      return null
    }

    const zone = zoneElement.dataset.deckZone as DeckZoneType | undefined
    const count = Number.parseInt(zoneElement.dataset.deckCount ?? '', 10)

    if (!zone) {
      return null
    }

    return {
      zone,
      index: Number.isNaN(count) ? 0 : count,
    }
  }, [])

  const applyDragOverlayTransform = useCallback((x: number, y: number) => {
    const overlayElement = dragOverlayRef.current
    const session = pointerDragSessionRef.current

    if (!overlayElement || !session) {
      return
    }

    overlayElement.style.transform = `translate3d(${x - session.offsetX}px, ${y - session.offsetY}px, 0)`
  }, [])

  const queueDragOverlayMove = useCallback(
    (x: number, y: number) => {
      dragOverlayPositionRef.current = { x, y }

      if (dragOverlayRafRef.current) {
        return
      }

      dragOverlayRafRef.current = window.requestAnimationFrame(() => {
        dragOverlayRafRef.current = 0

        const position = dragOverlayPositionRef.current

        if (!position) {
          return
        }

        applyDragOverlayTransform(position.x, position.y)
      })
    },
    [applyDragOverlayTransform],
  )

  const clearDragSession = useCallback(() => {
    window.clearTimeout(hoverTimerRef.current)
    window.cancelAnimationFrame(dragOverlayRafRef.current)
    dragOverlayRafRef.current = 0
    dragOverlayPositionRef.current = null
    pointerDragSessionRef.current = null
    pointerDragCleanupRef.current?.()
    pointerDragCleanupRef.current = null
    setHoverPreview(null)
    setDragPayload(null)
    setActiveDragInstanceId(null)
    setActiveDragSearchCardId(null)
    setDragOverlay(null)
  }, [])

  const startDragOverlay = useCallback(
    (element: HTMLElement, name: string, card: ApiCardReference, clientX: number, clientY: number) => {
      const rect = element.getBoundingClientRect()
      const pointerX = clientX || rect.left + rect.width / 2
      const pointerY = clientY || rect.top + rect.height / 2

      setDragOverlay({
        name,
        card,
        width: rect.width,
        height: rect.height,
        offsetX: pointerX - rect.left,
        offsetY: pointerY - rect.top,
      })

      dragOverlayPositionRef.current = {
        x: pointerX,
        y: pointerY,
      }
    },
    [],
  )

  const startPointerDrag = useCallback(
    (event: ReactPointerEvent<HTMLElement>, payload: DragPayload, name: string, card: ApiCardReference) => {
      if (event.button !== 0) {
        return
      }

      clearHoverPreview()
      suppressSearchClickRef.current = false
      const sourceElement = event.currentTarget

      const rect = sourceElement.getBoundingClientRect()
      const pointerX = event.clientX || rect.left + rect.width / 2
      const pointerY = event.clientY || rect.top + rect.height / 2

      pointerDragSessionRef.current = {
        payload,
        name,
        card,
        width: rect.width,
        height: rect.height,
        offsetX: pointerX - rect.left,
        offsetY: pointerY - rect.top,
        startX: pointerX,
        startY: pointerY,
        dragging: false,
      }

      const handlePointerMove = (moveEvent: PointerEvent) => {
        const session = pointerDragSessionRef.current

        if (!session) {
          return
        }

        const deltaX = moveEvent.clientX - session.startX
        const deltaY = moveEvent.clientY - session.startY

        if (!session.dragging && Math.hypot(deltaX, deltaY) < 6) {
          return
        }

        if (!session.dragging) {
          session.dragging = true
          setDragPayload(session.payload)

          if (session.payload.type === 'deck-card') {
            setActiveDragInstanceId(session.payload.instanceId)
          } else {
            setActiveDragSearchCardId(session.payload.apiCardId)
            suppressSearchClickRef.current = true
          }

          startDragOverlay(sourceElement, session.name, session.card, session.startX, session.startY)
        }

        queueDragOverlayMove(moveEvent.clientX, moveEvent.clientY)
        moveEvent.preventDefault()
      }

      const handlePointerEnd = (endEvent: PointerEvent) => {
        const session = pointerDragSessionRef.current
        const target = session?.dragging ? resolveDropTarget(endEvent.clientX, endEvent.clientY) : null

        if (session?.dragging && target) {
          setState((current) => {
            if (session.payload.type === 'search-result') {
              return {
                ...current,
                deckBuilder: addSearchResultToZone(
                  current.deckBuilder,
                  apiSearch.results,
                  session.payload.apiCardId,
                  target.zone,
                  target.index,
                  current.deckFormat,
                ),
              }
            }

            return {
              ...current,
              deckBuilder: moveDeckCard(current.deckBuilder, session.payload.instanceId, target.zone, target.index),
            }
          })
        }

        if (session?.payload.type === 'search-result' && session.dragging) {
          window.setTimeout(() => {
            suppressSearchClickRef.current = false
          }, 0)
        }

        clearDragSession()
      }

      window.addEventListener('pointermove', handlePointerMove, { passive: false })
      window.addEventListener('pointerup', handlePointerEnd)
      window.addEventListener('pointercancel', handlePointerEnd)

      pointerDragCleanupRef.current = () => {
        window.removeEventListener('pointermove', handlePointerMove)
        window.removeEventListener('pointerup', handlePointerEnd)
        window.removeEventListener('pointercancel', handlePointerEnd)
      }
    },
    [apiSearch.results, clearDragSession, clearHoverPreview, queueDragOverlayMove, resolveDropTarget, startDragOverlay],
  )

  const handleSearchPage = useCallback(
    (direction: 'prev' | 'next') => {
      if (direction === 'prev' && apiSearch.page > 0) {
        void runApiSearch(apiSearch.query, apiSearch.page - 1)
      }

      if (direction === 'next' && apiSearch.hasMore) {
        void runApiSearch(apiSearch.query, apiSearch.page + 1)
      }
    },
    [apiSearch.hasMore, apiSearch.page, apiSearch.query, runApiSearch],
  )

  const replaceState = useCallback((nextState: AppState) => {
    setState(nextState)
    setSnapshotComparison(null)
  }, [])

  const handleExportDeckImage = useCallback(async () => {
    const totalCards =
      state.deckBuilder.main.length + state.deckBuilder.extra.length + state.deckBuilder.side.length

    if (totalCards === 0) {
      throw new Error('No hay cartas cargadas para exportar.')
    }

    await exportDeckAsImage(state.deckBuilder)
    return 'Imagen del deck descargada.'
  }, [state.deckBuilder])

  const handleSaveSnapshot = useCallback(
    (name: string) => {
      setSnapshots((current) => [createSnapshot(name || `Build ${current.length + 1}`, toPortableConfig(state)), ...current].slice(0, 12))
      return 'Snapshot guardado.'
    },
    [state],
  )

  const handleLoadSnapshot = useCallback(
    (snapshotId: string) => {
      const snapshot = snapshots.find((entry) => entry.id === snapshotId)

      if (!snapshot) {
        return 'No se encontró el snapshot.'
      }

      replaceState(fromPortableConfig(snapshot.config))
      return `Snapshot "${snapshot.name}" cargado.`
    },
    [replaceState, snapshots],
  )

  const handleCompareSnapshot = useCallback(
    (snapshotId: string) => {
      const snapshot = snapshots.find((entry) => entry.id === snapshotId)

      if (!snapshot) {
        setSnapshotComparison(null)
        return
      }

      const snapshotState = fromPortableConfig(snapshot.config)
      setSnapshotComparison(buildSnapshotComparison(state, snapshotState, snapshot.name, snapshot.savedAt))
    },
    [snapshots, state],
  )

  const handleDeleteSnapshot = useCallback((snapshotId: string) => {
    setSnapshots((current) => current.filter((snapshot) => snapshot.id !== snapshotId))
    setSnapshotComparison(null)
    return 'Snapshot eliminado.'
  }, [])

  const renderDeckMode = () => (
    <section className="grid gap-3">
      <WorkspacePanel
        deckFormat={state.deckFormat}
        formatIssues={formatIssues}
        snapshots={snapshots}
        comparison={snapshotComparison}
        mainDeckCount={state.deckBuilder.main.length}
        classifiedCards={classifiedCardCount}
        totalClassifiableCards={derivedMainCards.length}
        patternCount={state.patterns.length}
        onDeckFormatChange={(deckFormat) => {
          setState((current) => ({
            ...current,
            deckFormat,
          }))
          setSnapshotComparison(null)
        }}
        onSaveSnapshot={handleSaveSnapshot}
        onLoadSnapshot={handleLoadSnapshot}
        onCompareSnapshot={handleCompareSnapshot}
        onDeleteSnapshot={handleDeleteSnapshot}
      />

      <nav className="surface-panel mx-auto w-full max-w-[1240px] p-2 max-[760px]:sticky max-[760px]:top-0 max-[760px]:z-40 min-[761px]:hidden">
        <div className="grid grid-cols-4 gap-1">
          <a className="app-button px-2 py-1 text-center text-[0.76rem]" href="#step1">
            Paso 1
          </a>
          <a className="app-button px-2 py-1 text-center text-[0.76rem]" href="#step2">
            Paso 2
          </a>
          <a className="app-button px-2 py-1 text-center text-[0.76rem]" href="#step3">
            Paso 3
          </a>
          <a className="app-button px-2 py-1 text-center text-[0.76rem]" href="#step4">
            Cierre
          </a>
        </div>
      </nav>

      <section id="step1" className="surface-panel mx-auto grid w-full max-w-[1240px] gap-3 p-2.5">
        <div className="surface-card grid gap-1 px-2 py-1.5">
          <p className="app-kicker m-0 text-[0.68rem] uppercase tracking-widest">Paso 1</p>
          <div className="flex items-start justify-between gap-3 max-[760px]:flex-col max-[760px]:items-stretch">
            <div className="min-w-0">
              <h2 className="m-0 text-[1rem] leading-none">Armá tu deck en el builder</h2>
              <p className="app-muted m-[0.28rem_0_0] max-w-[74ch] text-[0.78rem] leading-[1.18]">
                Buscá cartas a la derecha. Click agrega al Main Deck, arrastrar mueve entre Main, Extra y Side, y click derecho quita.
              </p>
            </div>

            <span className="app-chip-accent self-start px-2 py-1 text-[0.76rem] whitespace-nowrap">
              Main Deck: {formatInteger(state.deckBuilder.main.length)}
            </span>
          </div>
        </div>

        <div className="grid items-start gap-3 min-[1101px]:grid-cols-[minmax(0,1fr)_320px]">
          <article ref={builderRef} className="surface-panel-soft self-start w-full min-h-0 p-2.5">
            <div className="grid gap-2.5">
            <div className="min-[1101px]:hidden">
              <button
                type="button"
                className="app-button app-button-primary w-full px-2 py-1 text-[0.86rem]"
                onClick={() => setMobileSearchOpen(true)}
              >
                Buscar cartas
              </button>
            </div>
            <DeckZone
              zone="main"
              title="Main Deck"
              cards={state.deckBuilder.main}
              activeDragInstanceId={activeDragInstanceId}
              onDeckCardPointerDown={(event, instanceId) => {
                const draggedCard = findDeckCard(state.deckBuilder, instanceId)

                if (draggedCard) {
                  startPointerDrag(event, { type: 'deck-card', instanceId }, draggedCard.name, draggedCard.apiCard)
                }
              }}
              onRemoveCard={(instanceId) => {
                setState((current) => ({
                  ...current,
                  deckBuilder: removeDeckCard(current.deckBuilder, instanceId),
                }))
              }}
              onHoverStart={scheduleHoverPreview}
              onHoverEnd={clearHoverPreview}
            />

            <DeckZone
              zone="extra"
              title="Extra Deck"
              cards={state.deckBuilder.extra}
              activeDragInstanceId={activeDragInstanceId}
              onDeckCardPointerDown={(event, instanceId) => {
                const draggedCard = findDeckCard(state.deckBuilder, instanceId)

                if (draggedCard) {
                  startPointerDrag(event, { type: 'deck-card', instanceId }, draggedCard.name, draggedCard.apiCard)
                }
              }}
              onRemoveCard={(instanceId) => {
                setState((current) => ({
                  ...current,
                  deckBuilder: removeDeckCard(current.deckBuilder, instanceId),
                }))
              }}
              onHoverStart={scheduleHoverPreview}
              onHoverEnd={clearHoverPreview}
            />

            <DeckZone
              zone="side"
              title="Side Deck"
              cards={state.deckBuilder.side}
              activeDragInstanceId={activeDragInstanceId}
              onDeckCardPointerDown={(event, instanceId) => {
                const draggedCard = findDeckCard(state.deckBuilder, instanceId)

                if (draggedCard) {
                  startPointerDrag(event, { type: 'deck-card', instanceId }, draggedCard.name, draggedCard.apiCard)
                }
              }}
              onRemoveCard={(instanceId) => {
                setState((current) => ({
                  ...current,
                  deckBuilder: removeDeckCard(current.deckBuilder, instanceId),
                }))
              }}
              onHoverStart={scheduleHoverPreview}
              onHoverEnd={clearHoverPreview}
            />
          </div>
          </article>

          <div className="max-[1100px]:hidden">
            <SearchPanel
            builderHeight={builderHeight}
            deckFormat={state.deckFormat}
            query={apiSearch.query}
            status={apiSearch.status}
            results={visibleSearchResults}
            errorMessage={apiSearch.errorMessage}
            page={apiSearch.page}
            hasMore={apiSearch.hasMore}
            activeDragSearchCardId={activeDragSearchCardId}
            typeFilter={searchTypeFilter}
            archetypeFilter={searchArchetypeFilter}
            onQueryChange={(value) => {
              setApiSearch((current) => ({
                ...current,
                query: value,
                page: 0,
              }))
            }}
            onTypeFilterChange={setSearchTypeFilter}
            onArchetypeFilterChange={setSearchArchetypeFilter}
            onPrevPage={() => handleSearchPage('prev')}
            onNextPage={() => handleSearchPage('next')}
            onResultClick={(apiCardId) => {
              if (suppressSearchClickRef.current) {
                suppressSearchClickRef.current = false
                return
              }

              setState((current) => ({
                ...current,
                deckBuilder: addSearchResultToDefaultZone(
                  current.deckBuilder,
                  apiSearch.results,
                  apiCardId,
                  current.deckFormat,
                ),
              }))
            }}
            onSearchCardPointerDown={(event, apiCardId) => {
              const draggedCard = apiSearch.results.find((card) => card.ygoprodeckId === apiCardId)

              if (draggedCard) {
                startPointerDrag(event, { type: 'search-result', apiCardId }, draggedCard.name, draggedCard)
              }
            }}
            onHoverStart={scheduleHoverPreview}
            onHoverEnd={clearHoverPreview}
            />
          </div>
        </div>
      </section>

      <div id="step2" className="mx-auto w-full max-w-[1240px]">
        <DeckRolesPanel
          cards={derivedMainCards}
          onToggleRole={(ygoprodeckId, role) => {
            setState((current) => ({
              ...current,
              deckBuilder: toggleRoleForCard(current.deckBuilder, ygoprodeckId, role),
            }))
          }}
        />
      </div>

      <div id="step3">
        <ProbabilityPanel
            mode={state.mode}
            onModeChange={(mode) => {
              setState((current) => ({
                ...current,
                mode,
              }))
            }}
            patterns={state.patterns}
            derivedMainCards={derivedMainCards}
            derivedGroups={derivedGroups}
            onAddPattern={(category: HandPatternCategory) => {
              const nextPattern = createPattern('', undefined, category)

              setState((current) => ({
                ...current,
                patterns: [
                  ...current.patterns,
                  nextPattern,
                ],
              }))

              return nextPattern.id
            }}
            onRemovePattern={(patternId) => {
              setState((current) => ({
                ...current,
                patterns: removePattern(current.patterns, patternId),
              }))
            }}
            onPatternCategoryChange={(patternId, value) => {
              setState((current) => ({
                ...current,
                patterns: updatePatternCategory(current.patterns, patternId, value),
              }))
            }}
            onPatternNameChange={(patternId, value) => {
              setState((current) => ({
                ...current,
                patterns: updatePatternName(current.patterns, patternId, value),
              }))
            }}
            onPatternMatchModeChange={(patternId, value) => {
              setState((current) => ({
                ...current,
                patterns: updatePatternMatchMode(current.patterns, patternId, value),
              }))
            }}
            onPatternMinimumMatchesChange={(patternId, value) => {
              setState((current) => ({
                ...current,
                patterns: updatePatternMinimumMatches(
                  current.patterns,
                  patternId,
                  Math.max(1, toNonNegativeInteger(value, 1)),
                ),
              }))
            }}
            onPatternAllowSharedCardsChange={(patternId, value) => {
              setState((current) => ({
                ...current,
                patterns: updatePatternAllowSharedCards(current.patterns, patternId, value),
              }))
            }}
            onAddRequirement={(patternId) => {
              setState((current) => ({
                ...current,
                patterns: addRequirement(current.patterns, patternId, derivedMainCards),
              }))
            }}
            onRemoveRequirement={(patternId, requirementId) => {
              setState((current) => ({
                ...current,
                patterns: removeRequirement(current.patterns, patternId, requirementId),
              }))
            }}
            onAddRequirementCard={(patternId, requirementId, cardId) => {
              setState((current) => ({
                ...current,
                patterns: addRequirementCardToPool(current.patterns, patternId, requirementId, cardId),
              }))
            }}
            onRemoveRequirementCard={(patternId, requirementId, cardId) => {
              setState((current) => ({
                ...current,
                patterns: removeRequirementCardFromPool(current.patterns, patternId, requirementId, cardId),
              }))
            }}
            onRequirementKindChange={(patternId, requirementId, value) => {
              setState((current) => ({
                ...current,
                patterns: updateRequirementKind(current.patterns, patternId, requirementId, value),
              }))
            }}
            onRequirementDistinctChange={(patternId, requirementId, value) => {
              setState((current) => ({
                ...current,
                patterns: updateRequirementDistinct(current.patterns, patternId, requirementId, value),
              }))
            }}
            onRequirementCountChange={(patternId, requirementId, value) => {
              setState((current) => ({
                ...current,
                patterns: updateRequirementCount(
                  current.patterns,
                  patternId,
                  requirementId,
                  Math.max(1, toNonNegativeInteger(value, 1)),
                ),
              }))
            }}
            onRequirementSourceChange={(patternId, requirementId, value) => {
              setState((current) => ({
                ...current,
                patterns: updateRequirementSource(current.patterns, patternId, requirementId, value, defaultGroupKey),
              }))
            }}
            onRequirementGroupChange={(patternId, requirementId, value) => {
              setState((current) => ({
                ...current,
                patterns: updateRequirementGroup(current.patterns, patternId, requirementId, value),
              }))
            }}
        />
      </div>

      <div id="step4" className="mx-auto w-full max-w-[1240px]">
        <ExportDeckPanel
          mainDeckCount={state.deckBuilder.main.length}
          onExport={handleExportDeckImage}
        />
      </div>
    </section>
  )

  return (
    <>
      <main className="mx-auto min-h-screen w-[min(1760px,calc(100vw-1rem))] bg-transparent py-2">
        <header className="mb-2 flex items-end justify-between gap-4 border-b border-[var(--border-strong)] pb-2">
          <img
            src={yugiohLogo}
            alt="Yu-Gi-Oh! Trading Card Game"
            className="block h-[58px] w-auto object-contain"
          />
        </header>

        {state.mode === 'manual' ? (
          <PlaceholderPanel
            mode={state.mode}
            onModeChange={(mode) => {
              setState((current) => ({
                ...current,
                mode,
              }))
            }}
            title="Calculadora Manual"
            description="Este modo va a usar parámetros totalmente manipulables y grupos manuales, sin depender del deck builder."
          />
        ) : null}

        {state.mode === 'gambling' ? (
          <PlaceholderPanel
            mode={state.mode}
            onModeChange={(mode) => {
              setState((current) => ({
                ...current,
                mode,
              }))
            }}
            title="Calculadora Gambling"
            description="Este modo va aparte porque necesita reglas y resoluciones especiales que no salen directo del armado visual del deck."
          />
        ) : null}

        {state.mode === 'deck' ? renderDeckMode() : null}
      </main>

      {mobileSearchOpen ? (
        <div className="fixed inset-0 z-[140] grid place-items-center bg-black/80 px-3 py-6 min-[1101px]:hidden">
          <div className="surface-panel w-full max-w-[620px] p-2.5">
            <div className="flex items-center justify-between gap-2 border-b border-[var(--border-subtle)] pb-2">
              <strong className="text-[0.95rem]">Buscar cartas</strong>
              <button
                type="button"
                className="border-0 bg-transparent p-0 text-[1.05rem] text-[var(--text-soft)] hover:text-[#d04a57]"
                onClick={() => setMobileSearchOpen(false)}
              >
                ×
              </button>
            </div>
            <div className="mt-2">
              <SearchPanel
                builderHeight={null}
                deckFormat={state.deckFormat}
                query={apiSearch.query}
                status={apiSearch.status}
                results={visibleSearchResults}
                errorMessage={apiSearch.errorMessage}
                page={apiSearch.page}
                hasMore={apiSearch.hasMore}
                activeDragSearchCardId={activeDragSearchCardId}
                typeFilter={searchTypeFilter}
                archetypeFilter={searchArchetypeFilter}
                onQueryChange={(value) => {
                  setApiSearch((current) => ({
                    ...current,
                    query: value,
                    page: 0,
                  }))
                }}
                onTypeFilterChange={setSearchTypeFilter}
                onArchetypeFilterChange={setSearchArchetypeFilter}
                onPrevPage={() => handleSearchPage('prev')}
                onNextPage={() => handleSearchPage('next')}
                onResultClick={(apiCardId) => {
                  if (suppressSearchClickRef.current) {
                    suppressSearchClickRef.current = false
                    return
                  }

                  setState((current) => ({
                    ...current,
                    deckBuilder: addSearchResultToDefaultZone(
                      current.deckBuilder,
                      apiSearch.results,
                      apiCardId,
                      current.deckFormat,
                    ),
                  }))
                }}
                onSearchCardPointerDown={(event, apiCardId) => {
                  const draggedCard = apiSearch.results.find((card) => card.ygoprodeckId === apiCardId)

                  if (draggedCard) {
                    startPointerDrag(event, { type: 'search-result', apiCardId }, draggedCard.name, draggedCard)
                  }
                }}
                onHoverStart={scheduleHoverPreview}
                onHoverEnd={clearHoverPreview}
              />
            </div>
          </div>
        </div>
      ) : null}

      <HoverPreview preview={hoverPreview} />

      {dragOverlay ? (
        <div
          ref={dragOverlayRef}
          className="pointer-events-none fixed left-0 top-0 z-[120] opacity-70"
          style={{
            width: dragOverlay.width,
            height: dragOverlay.height,
            willChange: 'transform',
          }}
          aria-hidden="true"
        >
          <CardArt
            remoteUrl={dragOverlay.card.imageUrlSmall ?? dragOverlay.card.imageUrl}
            name={dragOverlay.name}
            className="block h-full w-full bg-[#1a1a1a] object-cover shadow-[0_12px_28px_rgba(0,0,0,0.42)]"
          />
        </div>
      ) : null}
    </>
  )
}

interface PlaceholderPanelProps {
  mode: CalculatorMode
  onModeChange: (mode: CalculatorMode) => void
  title: string
  description: string
}

function PlaceholderPanel({ mode, onModeChange, title, description }: PlaceholderPanelProps) {
  return (
    <section className="grid gap-3">
      <article className="border border-[#2f2f2f] bg-black p-4">
        <div className="mb-3 flex items-start justify-between gap-3 max-[820px]:flex-col max-[820px]:items-stretch">
          <div>
            <p className="m-0 mb-1 text-[0.72rem] uppercase tracking-[0.1em] text-[#b5b5b5]">En preparación</p>
            <h2 className="m-0 text-[1.15rem] leading-[1.1]">{title}</h2>
          </div>
          <ModeTabs mode={mode} onChange={onModeChange} />
        </div>

        <div>
          <p className="border border-[#2f2f2f] bg-[#101010] p-3 text-[#b5b5b5]">{description}</p>
        </div>
      </article>
    </section>
  )
}
