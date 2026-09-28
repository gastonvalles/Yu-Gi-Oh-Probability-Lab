import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
} from 'react'
import { flushSync } from 'react-dom'

import type { ApiCardReference } from '../types'
import type { DeckZone, DragPayload } from './model'
import { DESKTOP_DECK_BUILDER_MEDIA_QUERY } from './use-media-query'

export type DeckDropIndicatorState = 'idle' | 'valid' | 'invalid'

// Con el mouse el arrastre arranca al mover unos píxeles. Con el dedo hay que
// mantener presionado sin moverse: así deslizar sobre las cartas scrollea la
// página en vez de moverlas.
const MOUSE_DRAG_THRESHOLD_PX = 6
const TOUCH_DRAG_DELAY_MS = 350
const TOUCH_SCROLL_SLOP_PX = 10
// Al arrastrar cerca del borde de la zona scrolleable se desplaza sola, para
// poder llevar una carta a una zona que está fuera de pantalla.
const AUTO_SCROLL_EDGE_PX = 72
const AUTO_SCROLL_MAX_STEP_PX = 14

function findScrollParent(element: HTMLElement): HTMLElement {
  let current = element.parentElement

  while (current) {
    const { overflowY } = window.getComputedStyle(current)

    if ((overflowY === 'auto' || overflowY === 'scroll') && current.scrollHeight > current.clientHeight) {
      return current
    }

    current = current.parentElement
  }

  return (document.scrollingElement as HTMLElement | null) ?? document.documentElement
}

/** Cuánto scrollear este frame según qué tan cerca del borde está el puntero (0 = nada). */
export function getAutoScrollStep(pointerY: number, top: number, bottom: number): number {
  if (pointerY < top + AUTO_SCROLL_EDGE_PX) {
    return -Math.ceil(AUTO_SCROLL_MAX_STEP_PX * Math.min(1, (top + AUTO_SCROLL_EDGE_PX - pointerY) / AUTO_SCROLL_EDGE_PX))
  }

  if (pointerY > bottom - AUTO_SCROLL_EDGE_PX) {
    return Math.ceil(AUTO_SCROLL_MAX_STEP_PX * Math.min(1, (pointerY - (bottom - AUTO_SCROLL_EDGE_PX)) / AUTO_SCROLL_EDGE_PX))
  }

  return 0
}

export interface DeckDragOverlayState {
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
  pointerId: number
  sourceElement: HTMLElement
  isTouch: boolean
  /** Touch: el long-press ya habilitó el arrastre. Mouse: siempre true. */
  armed: boolean
  dragging: boolean
  /** Se movió después de empezar a arrastrar (un long-press sin mover no suelta nada). */
  moved: boolean
  scrollParent: HTMLElement | null
}

interface UseDeckPointerDragOptions {
  canDrop: (payload: DragPayload, zone: DeckZone) => boolean
  onDrop: (drop: { payload: DragPayload; zone: DeckZone; index: number }) => void
  resolveSearchDrop: (
    payload: Extract<DragPayload, { type: 'search-result' }>,
  ) => { zone: DeckZone; index: number } | null
}

interface DragPreviewFrame {
  width: number
  height: number
  offsetX: number
  offsetY: number
}

interface DeckPointerDragController {
  activeDragInstanceId: string | null
  activeDropZone: DeckZone | null
  invalidDropZone: DeckZone | null
  activeDragSearchCardId: number | null
  builderRootDropState: DeckDropIndicatorState
  consumeSuppressedPointerClick: () => boolean
  dragOverlay: DeckDragOverlayState | null
  dragOverlayRef: React.RefObject<HTMLDivElement | null>
  hasPendingPointerDrag: () => boolean
  startPointerDrag: (
    event: ReactPointerEvent<HTMLElement>,
    payload: DragPayload,
    name: string,
    card: ApiCardReference,
  ) => void
}

interface ResolvedDropTarget {
  zone: DeckZone
  index: number
  targetKind: 'zone' | 'builder-root'
  isAllowed: boolean
}

function resolveDragPreviewFrame(
  sourceElement: HTMLElement,
  clientX: number,
  clientY: number,
): DragPreviewFrame {
  const previewElement =
    sourceElement.querySelector<HTMLElement>('[data-drag-preview-source]') ?? sourceElement
  const rect = previewElement.getBoundingClientRect()
  const centerX = rect.width / 2
  const centerY = rect.height / 2
  const pointerInsideX = clientX >= rect.left && clientX <= rect.right
  const pointerInsideY = clientY >= rect.top && clientY <= rect.bottom

  return {
    width: rect.width,
    height: rect.height,
    offsetX: pointerInsideX ? clientX - rect.left : centerX,
    offsetY: pointerInsideY ? clientY - rect.top : centerY,
  }
}

let desktopDeckBuilderMediaQuery: MediaQueryList | null = null

function isDesktopDeckBuilderViewport(): boolean {
  if (typeof window === 'undefined') {
    return false
  }

  // Cached: this is checked on every dragged frame, and matchMedia() allocates a new
  // MediaQueryList each call if not reused.
  desktopDeckBuilderMediaQuery ??= window.matchMedia(DESKTOP_DECK_BUILDER_MEDIA_QUERY)

  return desktopDeckBuilderMediaQuery.matches
}

export function useDeckPointerDrag({
  canDrop,
  onDrop,
  resolveSearchDrop,
}: UseDeckPointerDragOptions): DeckPointerDragController {
  const [dragPayload, setDragPayload] = useState<DragPayload | null>(null)
  const [activeDragInstanceId, setActiveDragInstanceId] = useState<string | null>(null)
  const [activeDropZone, setActiveDropZone] = useState<DeckZone | null>(null)
  const [invalidDropZone, setInvalidDropZone] = useState<DeckZone | null>(null)
  const [activeDragSearchCardId, setActiveDragSearchCardId] = useState<number | null>(null)
  const [dragOverlay, setDragOverlay] = useState<DeckDragOverlayState | null>(null)
  const [builderRootDropState, setBuilderRootDropState] = useState<DeckDropIndicatorState>('idle')

  const dragOverlayRef = useRef<HTMLDivElement>(null)
  const dragOverlayRafRef = useRef<number>(0)
  const dragOverlayPositionRef = useRef<{ x: number; y: number } | null>(null)
  const pointerDragSessionRef = useRef<PointerDragSession | null>(null)
  const pointerDragCleanupRef = useRef<(() => void) | null>(null)
  const suppressPointerClickRef = useRef(false)

  const buildResolvedDropTarget = useCallback(
    (
      target: { zone: DeckZone; index: number } | null,
      payload: DragPayload,
      targetKind: ResolvedDropTarget['targetKind'] = 'zone',
    ): ResolvedDropTarget | null => {
      if (!target) {
        return null
      }

      return {
        ...target,
        targetKind,
        isAllowed: canDrop(payload, target.zone),
      }
    },
    [canDrop],
  )

  const resolveDropTarget = useCallback(
    (clientX: number, clientY: number, payload: DragPayload): ResolvedDropTarget | null => {
      const hoveredElement = document.elementFromPoint(clientX, clientY)

      if (!(hoveredElement instanceof HTMLElement)) {
        return null
      }

      if (payload.type === 'search-result') {
        const hoveredDeckCard = hoveredElement.closest<HTMLElement>('[data-deck-card-index]')

        if (hoveredDeckCard) {
          const zone = hoveredDeckCard.dataset.deckZone as DeckZone | undefined
          const index = Number.parseInt(hoveredDeckCard.dataset.deckCardIndex ?? '', 10)

          if (zone === 'side' && !Number.isNaN(index)) {
            const rect = hoveredDeckCard.getBoundingClientRect()
            const explicitSideTarget = buildResolvedDropTarget(
              {
                zone,
                index: clientX > rect.left + rect.width / 2 ? index + 1 : index,
              },
              payload,
            )

            if (explicitSideTarget) {
              return explicitSideTarget
            }
          }
        }

        if (isDesktopDeckBuilderViewport()) {
          const sideDropContainer = Array.from(
            document.querySelectorAll<HTMLElement>('[data-deck-zone-drop-target="side"]'),
          ).find((zoneContainer) => {
            const rect = zoneContainer.getBoundingClientRect()

            return (
              clientX >= rect.left &&
              clientX <= rect.right &&
              clientY >= rect.top &&
              clientY <= rect.bottom
            )
          })

          if (sideDropContainer) {
            const count = Number.parseInt(sideDropContainer.dataset.deckZoneCount ?? '', 10)
            const explicitSideTarget = buildResolvedDropTarget(
              {
                zone: 'side',
                index: Number.isNaN(count) ? 0 : count,
              },
              payload,
            )

            if (explicitSideTarget) {
              return explicitSideTarget
            }
          }
        }

        const sideZone = hoveredElement.closest<HTMLElement>('[data-deck-zone="side"]')

        if (sideZone) {
          const count = Number.parseInt(sideZone.dataset.deckCount ?? '', 10)
          const explicitSideTarget = buildResolvedDropTarget(
            {
              zone: 'side',
              index: Number.isNaN(count) ? 0 : count,
            },
            payload,
          )

          if (explicitSideTarget) {
            return explicitSideTarget
          }
        }

        const builderRoot = hoveredElement.closest<HTMLElement>('[data-deck-builder-root]')

        if (!builderRoot) {
          return null
        }

        const rootDropTarget = resolveSearchDrop(payload)

        return buildResolvedDropTarget(rootDropTarget, payload, 'builder-root')
      }

      const cardElement = hoveredElement.closest<HTMLElement>('[data-deck-card-index]')

      if (cardElement) {
        const zone = cardElement.dataset.deckZone as DeckZone | undefined
        const index = Number.parseInt(cardElement.dataset.deckCardIndex ?? '', 10)

        if (!zone || Number.isNaN(index)) {
          return null
        }

        const rect = cardElement.getBoundingClientRect()
        const explicitTarget = buildResolvedDropTarget(
          {
            zone,
            index: clientX > rect.left + rect.width / 2 ? index + 1 : index,
          },
          payload,
        )

        if (explicitTarget) {
          return explicitTarget
        }
      }

      if (isDesktopDeckBuilderViewport()) {
        const zoneContainers = Array.from(
          document.querySelectorAll<HTMLElement>('[data-deck-zone-drop-target]'),
        )

        const matchedZoneContainer = zoneContainers.find((zoneContainer) => {
          const rect = zoneContainer.getBoundingClientRect()

          return (
            clientX >= rect.left &&
            clientX <= rect.right &&
            clientY >= rect.top &&
            clientY <= rect.bottom
          )
        })

        if (matchedZoneContainer) {
          const zone = matchedZoneContainer.dataset.deckZoneDropTarget as DeckZone | undefined
          const count = Number.parseInt(matchedZoneContainer.dataset.deckZoneCount ?? '', 10)

          if (zone) {
            const matchedTarget = buildResolvedDropTarget(
              {
                zone,
                index: Number.isNaN(count) ? 0 : count,
              },
              payload,
            )

            if (matchedTarget) {
              return matchedTarget
            }
          }
        }
      }

      const zoneElement = hoveredElement.closest<HTMLElement>('[data-deck-zone]')

      if (!zoneElement) {
        return null
      }

      const zone = zoneElement.dataset.deckZone as DeckZone | undefined
      const count = Number.parseInt(zoneElement.dataset.deckCount ?? '', 10)

      if (!zone) {
        return null
      }

      return buildResolvedDropTarget(
        {
          zone,
          index: Number.isNaN(count) ? 0 : count,
        },
        payload,
      )
    },
    [buildResolvedDropTarget, resolveSearchDrop],
  )

  const applyDragOverlayTransform = useCallback((x: number, y: number) => {
    const overlayElement = dragOverlayRef.current
    const session = pointerDragSessionRef.current

    if (!overlayElement || !session) {
      return
    }

    overlayElement.style.transform = `translate3d(${x - session.offsetX}px, ${y - session.offsetY}px, 0)`
  }, [])

  const flushDragFrame = useCallback(() => {
    dragOverlayRafRef.current = 0

    const position = dragOverlayPositionRef.current
    const session = pointerDragSessionRef.current

    if (!position || !session) {
      return
    }

    // Overlay position and drop-target hit-testing are batched into a single rAF so that
    // expensive getBoundingClientRect() reads in resolveDropTarget only run once per painted
    // frame, not once per raw pointermove — pointermove can fire far faster than the display
    // refreshes (high-poll-rate mice/trackpads), and doing this work unthrottled causes layout
    // thrashing that shows up as visible stutter while dragging.
    applyDragOverlayTransform(position.x, position.y)

    if (session.isTouch) {
      session.scrollParent ??= findScrollParent(session.sourceElement)
      const isDocumentScroller = session.scrollParent === document.scrollingElement
      const rect = isDocumentScroller
        ? { top: 0, bottom: window.innerHeight }
        : session.scrollParent.getBoundingClientRect()
      const step = getAutoScrollStep(position.y, rect.top, rect.bottom)

      if (step !== 0) {
        session.scrollParent.scrollBy(0, step)
        // Sigue scrolleando aunque el dedo quede quieto en el borde.
        dragOverlayRafRef.current = window.requestAnimationFrame(flushDragFrame)
      }
    }

    const nextDropTarget = resolveDropTarget(position.x, position.y, session.payload)
    const nextDropZone =
      nextDropTarget?.targetKind === 'zone' && nextDropTarget.isAllowed ? nextDropTarget.zone : null
    const nextInvalidDropZone =
      nextDropTarget?.targetKind === 'zone' && !nextDropTarget.isAllowed ? nextDropTarget.zone : null
    const nextBuilderRootDropState =
      nextDropTarget?.targetKind === 'builder-root'
        ? (nextDropTarget.isAllowed ? 'valid' : 'invalid')
        : 'idle'

    setActiveDropZone((currentZone) => (currentZone === nextDropZone ? currentZone : nextDropZone))
    setInvalidDropZone((currentZone) =>
      currentZone === nextInvalidDropZone ? currentZone : nextInvalidDropZone,
    )
    setBuilderRootDropState((currentState) =>
      currentState === nextBuilderRootDropState ? currentState : nextBuilderRootDropState,
    )
  }, [applyDragOverlayTransform, resolveDropTarget])

  const queueDragFrame = useCallback(
    (x: number, y: number) => {
      dragOverlayPositionRef.current = { x, y }

      if (dragOverlayRafRef.current) {
        return
      }

      dragOverlayRafRef.current = window.requestAnimationFrame(flushDragFrame)
    },
    [flushDragFrame],
  )

  const clearDragSession = useCallback(() => {
    window.cancelAnimationFrame(dragOverlayRafRef.current)
    dragOverlayRafRef.current = 0
    dragOverlayPositionRef.current = null
    pointerDragSessionRef.current = null
    pointerDragCleanupRef.current?.()
    pointerDragCleanupRef.current = null
    setDragPayload(null)
    setActiveDragInstanceId(null)
    setActiveDropZone(null)
    setInvalidDropZone(null)
    setActiveDragSearchCardId(null)
    setDragOverlay(null)
    setBuilderRootDropState('idle')
  }, [])

  const startDragOverlay = useCallback(
    (previewFrame: DragPreviewFrame, name: string, card: ApiCardReference, clientX: number, clientY: number) => {
      setDragOverlay({
        name,
        card,
        width: previewFrame.width,
        height: previewFrame.height,
        offsetX: previewFrame.offsetX,
        offsetY: previewFrame.offsetY,
      })

      dragOverlayPositionRef.current = {
        x: clientX,
        y: clientY,
      }
    },
    [],
  )

  const startPointerDrag = useCallback(
    (event: ReactPointerEvent<HTMLElement>, payload: DragPayload, name: string, card: ApiCardReference) => {
      if (event.button !== 0) {
        return
      }

      suppressPointerClickRef.current = false
      const sourceElement = event.currentTarget

      const rect = sourceElement.getBoundingClientRect()
      const pointerX = event.clientX || rect.left + rect.width / 2
      const pointerY = event.clientY || rect.top + rect.height / 2
      const previewFrame = resolveDragPreviewFrame(sourceElement, pointerX, pointerY)

      const isTouch = event.pointerType === 'touch'

      pointerDragSessionRef.current = {
        payload,
        name,
        card,
        width: previewFrame.width,
        height: previewFrame.height,
        offsetX: previewFrame.offsetX,
        offsetY: previewFrame.offsetY,
        startX: pointerX,
        startY: pointerY,
        pointerId: event.pointerId,
        sourceElement,
        isTouch,
        armed: !isTouch,
        dragging: false,
        moved: false,
        scrollParent: null,
      }

      try {
        sourceElement.setPointerCapture(event.pointerId)
      } catch {
        // Ignore browsers that reject pointer capture for transient edge cases.
      }

      const beginDrag = (session: PointerDragSession) => {
        session.dragging = true
        setDragPayload(session.payload)

        if (session.payload.type === 'deck-card') {
          setActiveDragInstanceId(session.payload.instanceId)
        } else {
          setActiveDragSearchCardId(session.payload.apiCardId)
        }

        suppressPointerClickRef.current = true

        startDragOverlay(previewFrame, session.name, session.card, session.startX, session.startY)
      }

      const touchArmTimer = isTouch
        ? window.setTimeout(() => {
            const session = pointerDragSessionRef.current

            if (!session || session.armed) {
              return
            }

            session.armed = true
            session.sourceElement.dataset.dragArmed = 'true'
            navigator.vibrate?.(12)
            beginDrag(session)
          }, TOUCH_DRAG_DELAY_MS)
        : 0

      const handlePointerMove = (moveEvent: PointerEvent) => {
        const session = pointerDragSessionRef.current

        if (!session) {
          return
        }

        const distance = Math.hypot(moveEvent.clientX - session.startX, moveEvent.clientY - session.startY)

        if (!session.armed) {
          // El dedo se movió antes del long-press: es un scroll, no un arrastre.
          if (distance > TOUCH_SCROLL_SLOP_PX) {
            flushSync(() => {
              clearDragSession()
            })
          }

          return
        }

        if (!session.dragging) {
          if (distance < MOUSE_DRAG_THRESHOLD_PX) {
            return
          }

          beginDrag(session)
        }

        if (distance >= MOUSE_DRAG_THRESHOLD_PX) {
          session.moved = true
        }

        queueDragFrame(moveEvent.clientX, moveEvent.clientY)

        if (moveEvent.cancelable) {
          moveEvent.preventDefault()
        }
      }

      const handlePointerEnd = (endEvent: PointerEvent) => {
        const session = pointerDragSessionRef.current
        const target =
          session?.dragging ? resolveDropTarget(endEvent.clientX, endEvent.clientY, session.payload) : null
        const pendingDrop =
          session?.dragging && session.moved && target?.isAllowed
            ? {
                payload: session.payload,
                zone: target.zone,
                index: target.index,
              }
            : null

        if (session?.dragging) {
          window.setTimeout(() => {
            suppressPointerClickRef.current = false
          }, 0)
        }

        flushSync(() => {
          if (pendingDrop) {
            onDrop(pendingDrop)
          }

          clearDragSession()
        })
      }

      const handlePointerCancel = () => {
        if (pointerDragSessionRef.current?.dragging) {
          window.setTimeout(() => {
            suppressPointerClickRef.current = false
          }, 0)
        }

        flushSync(() => {
          clearDragSession()
        })
      }

      const handleWindowBlur = () => {
        handlePointerCancel()
      }

      // Mientras se arrastra con el dedo, la página no debe scrollear.
      const blockTouchScroll = (touchEvent: TouchEvent) => {
        if (pointerDragSessionRef.current?.armed && touchEvent.cancelable) {
          touchEvent.preventDefault()
        }
      }

      // Android abre el menú nativo de la imagen al mantener apretado (~500 ms) y eso
      // cancela el arrastre: se bloquea mientras dure la sesión táctil.
      const blockContextMenu = (menuEvent: Event) => {
        if (pointerDragSessionRef.current?.isTouch) {
          menuEvent.preventDefault()
        }
      }

      window.addEventListener('pointermove', handlePointerMove, { passive: false })
      window.addEventListener('contextmenu', blockContextMenu)
      window.addEventListener('pointerup', handlePointerEnd)
      window.addEventListener('pointercancel', handlePointerEnd)
      window.addEventListener('blur', handleWindowBlur)
      window.addEventListener('touchmove', blockTouchScroll, { passive: false })
      sourceElement.addEventListener('lostpointercapture', handlePointerCancel)

      pointerDragCleanupRef.current = () => {
        window.removeEventListener('pointermove', handlePointerMove)
        window.removeEventListener('contextmenu', blockContextMenu)
        window.removeEventListener('pointerup', handlePointerEnd)
        window.removeEventListener('pointercancel', handlePointerEnd)
        window.removeEventListener('blur', handleWindowBlur)
        window.removeEventListener('touchmove', blockTouchScroll)
        sourceElement.removeEventListener('lostpointercapture', handlePointerCancel)
        window.clearTimeout(touchArmTimer)
        delete sourceElement.dataset.dragArmed

        try {
          if (sourceElement.hasPointerCapture(event.pointerId)) {
            sourceElement.releasePointerCapture(event.pointerId)
          }
        } catch {
          // Ignore release failures during teardown.
        }
      }
    },
    [clearDragSession, onDrop, queueDragFrame, resolveDropTarget, startDragOverlay],
  )

  useLayoutEffect(() => {
    const position = dragOverlayPositionRef.current

    if (!dragOverlay || !position) {
      return
    }

    applyDragOverlayTransform(position.x, position.y)
  }, [dragOverlay, applyDragOverlayTransform])

  useEffect(
    () => () => {
      clearDragSession()
    },
    [clearDragSession],
  )

  return {
    activeDragInstanceId,
    activeDropZone,
    invalidDropZone,
    activeDragSearchCardId,
    builderRootDropState,
    consumeSuppressedPointerClick: () => {
      if (!suppressPointerClickRef.current) {
        return false
      }

      suppressPointerClickRef.current = false
      return true
    },
    dragOverlay,
    dragOverlayRef,
    hasPendingPointerDrag: () => dragPayload !== null || pointerDragSessionRef.current !== null,
    startPointerDrag,
  }
}
