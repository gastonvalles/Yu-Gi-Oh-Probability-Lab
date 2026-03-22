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
  onClearHoverPreview: () => void
  onDrop: (drop: { payload: DragPayload; zone: DeckZone; index: number }) => void
}

interface DeckPointerDragController {
  activeDragInstanceId: string | null
  activeDragSearchCardId: number | null
  consumeSuppressedSearchClick: () => boolean
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

export function useDeckPointerDrag({
  onClearHoverPreview,
  onDrop,
}: UseDeckPointerDragOptions): DeckPointerDragController {
  const [dragPayload, setDragPayload] = useState<DragPayload | null>(null)
  const [activeDragInstanceId, setActiveDragInstanceId] = useState<string | null>(null)
  const [activeDragSearchCardId, setActiveDragSearchCardId] = useState<number | null>(null)
  const [dragOverlay, setDragOverlay] = useState<DeckDragOverlayState | null>(null)

  const dragOverlayRef = useRef<HTMLDivElement>(null)
  const dragOverlayRafRef = useRef<number>(0)
  const dragOverlayPositionRef = useRef<{ x: number; y: number } | null>(null)
  const pointerDragSessionRef = useRef<PointerDragSession | null>(null)
  const pointerDragCleanupRef = useRef<(() => void) | null>(null)
  const suppressSearchClickRef = useRef(false)

  const resolveDropTarget = useCallback((clientX: number, clientY: number): { zone: DeckZone; index: number } | null => {
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

      return {
        zone,
        index: clientX > rect.left + rect.width / 2 ? index + 1 : index,
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
    window.cancelAnimationFrame(dragOverlayRafRef.current)
    dragOverlayRafRef.current = 0
    dragOverlayPositionRef.current = null
    pointerDragSessionRef.current = null
    pointerDragCleanupRef.current?.()
    pointerDragCleanupRef.current = null
    onClearHoverPreview()
    setDragPayload(null)
    setActiveDragInstanceId(null)
    setActiveDragSearchCardId(null)
    setDragOverlay(null)
  }, [onClearHoverPreview])

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

      onClearHoverPreview()
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
        const pendingDrop =
          session?.dragging && target
            ? {
                payload: session.payload,
                zone: target.zone,
                index: target.index,
              }
            : null

        if (session?.payload.type === 'search-result' && session.dragging) {
          window.setTimeout(() => {
            suppressSearchClickRef.current = false
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
    activeDragSearchCardId,
    consumeSuppressedSearchClick: () => {
      if (!suppressSearchClickRef.current) {
        return false
      }

      suppressSearchClickRef.current = false
      return true
    },
    dragOverlay,
    dragOverlayRef,
    hasPendingPointerDrag: () => dragPayload !== null || pointerDragSessionRef.current !== null,
    startPointerDrag,
  }
}
