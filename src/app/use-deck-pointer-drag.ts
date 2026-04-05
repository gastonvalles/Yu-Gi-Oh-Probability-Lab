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

const DESKTOP_DECK_BUILDER_MEDIA_QUERY = '(min-width: 1101px)'

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
  dragging: boolean
}

interface UseDeckPointerDragOptions {
  canDrop: (payload: DragPayload, zone: DeckZone) => boolean
  onClearHoverPreview: () => void
  onDrop: (drop: { payload: DragPayload; zone: DeckZone; index: number }) => void
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
  activeDragSearchCardId: number | null
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

function isDesktopDeckBuilderViewport(): boolean {
  if (typeof window === 'undefined') {
    return false
  }

  return window.matchMedia(DESKTOP_DECK_BUILDER_MEDIA_QUERY).matches
}

export function useDeckPointerDrag({
  canDrop,
  onClearHoverPreview,
  onDrop,
}: UseDeckPointerDragOptions): DeckPointerDragController {
  const [dragPayload, setDragPayload] = useState<DragPayload | null>(null)
  const [activeDragInstanceId, setActiveDragInstanceId] = useState<string | null>(null)
  const [activeDropZone, setActiveDropZone] = useState<DeckZone | null>(null)
  const [activeDragSearchCardId, setActiveDragSearchCardId] = useState<number | null>(null)
  const [dragOverlay, setDragOverlay] = useState<DeckDragOverlayState | null>(null)

  const dragOverlayRef = useRef<HTMLDivElement>(null)
  const dragOverlayRafRef = useRef<number>(0)
  const dragOverlayPositionRef = useRef<{ x: number; y: number } | null>(null)
  const pointerDragSessionRef = useRef<PointerDragSession | null>(null)
  const pointerDragCleanupRef = useRef<(() => void) | null>(null)
  const suppressPointerClickRef = useRef(false)

  const buildAllowedDropTarget = useCallback(
    (
      target: { zone: DeckZone; index: number } | null,
      payload: DragPayload,
    ): { zone: DeckZone; index: number } | null => {
      if (!target) {
        return null
      }

      return canDrop(payload, target.zone) ? target : null
    },
    [canDrop],
  )

  const resolveDropTarget = useCallback((clientX: number, clientY: number, payload: DragPayload): { zone: DeckZone; index: number } | null => {
    const hoveredElement = document.elementFromPoint(clientX, clientY)

    if (!(hoveredElement instanceof HTMLElement)) {
      return null
    }

    const cardElement = hoveredElement.closest<HTMLElement>('[data-deck-card-index]')

    if (cardElement) {
      const zone = cardElement.dataset.deckZone as DeckZone | undefined
      const index = Number.parseInt(cardElement.dataset.deckCardIndex ?? '', 10)

      if (!zone || Number.isNaN(index)) {
        return null
      }

      const rect = cardElement.getBoundingClientRect()

      return buildAllowedDropTarget({
        zone,
        index: clientX > rect.left + rect.width / 2 ? index + 1 : index,
      }, payload)
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
          return buildAllowedDropTarget({
            zone,
            index: Number.isNaN(count) ? 0 : count,
          }, payload)
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

    return buildAllowedDropTarget({
      zone,
      index: Number.isNaN(count) ? 0 : count,
    }, payload)
  }, [buildAllowedDropTarget])

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
    window.cancelAnimationFrame(dragOverlayRafRef.current)
    dragOverlayRafRef.current = 0
    dragOverlayPositionRef.current = null
    pointerDragSessionRef.current = null
    pointerDragCleanupRef.current?.()
    pointerDragCleanupRef.current = null
    onClearHoverPreview()
    setDragPayload(null)
    setActiveDragInstanceId(null)
    setActiveDropZone(null)
    setActiveDragSearchCardId(null)
    setDragOverlay(null)
  }, [onClearHoverPreview])

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

      onClearHoverPreview()
      suppressPointerClickRef.current = false
      const sourceElement = event.currentTarget

      const rect = sourceElement.getBoundingClientRect()
      const pointerX = event.clientX || rect.left + rect.width / 2
      const pointerY = event.clientY || rect.top + rect.height / 2
      const previewFrame = resolveDragPreviewFrame(sourceElement, pointerX, pointerY)

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
          }

          suppressPointerClickRef.current = true

          startDragOverlay(previewFrame, session.name, session.card, session.startX, session.startY)
        }

        const nextDropZone =
          resolveDropTarget(moveEvent.clientX, moveEvent.clientY, session.payload)?.zone ?? null
        setActiveDropZone((currentZone) => (currentZone === nextDropZone ? currentZone : nextDropZone))
        queueDragOverlayMove(moveEvent.clientX, moveEvent.clientY)
        moveEvent.preventDefault()
      }

      const handlePointerEnd = (endEvent: PointerEvent) => {
        const session = pointerDragSessionRef.current
        const target =
          session?.dragging ? resolveDropTarget(endEvent.clientX, endEvent.clientY, session.payload) : null
        const pendingDrop =
          session?.dragging && target
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

      window.addEventListener('pointermove', handlePointerMove, { passive: false })
      window.addEventListener('pointerup', handlePointerEnd)
      window.addEventListener('pointercancel', handlePointerEnd)

      pointerDragCleanupRef.current = () => {
        window.removeEventListener('pointermove', handlePointerMove)
        window.removeEventListener('pointerup', handlePointerEnd)
        window.removeEventListener('pointercancel', handlePointerEnd)
      }
    },
    [clearDragSession, onClearHoverPreview, onDrop, queueDragOverlayMove, resolveDropTarget, startDragOverlay],
  )

  useLayoutEffect(() => {
    const overlayElement = dragOverlayRef.current
    const overlay = dragOverlay
    const position = dragOverlayPositionRef.current

    if (!overlayElement || !overlay || !position) {
      return
    }

    overlayElement.style.transform = `translate3d(${position.x - overlay.offsetX}px, ${position.y - overlay.offsetY}px, 0)`
  }, [dragOverlay])

  useEffect(
    () => () => {
      clearDragSession()
    },
    [clearDragSession],
  )

  return {
    activeDragInstanceId,
    activeDropZone,
    activeDragSearchCardId,
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
