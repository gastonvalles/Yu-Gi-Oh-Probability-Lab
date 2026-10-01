import {
  useLayoutEffect,
  useRef,
  useState,
  type CSSProperties,
  type KeyboardEvent as ReactKeyboardEvent,
  type PointerEvent as ReactPointerEvent,
} from 'react'

import {
  computeHandLayout,
  fanAngle,
  moveItem,
  slotIndexAtCenter,
  slotLeft,
  type HandLayout,
} from '../../app/practice-hand-layout'
import { useElementWidth } from '../../app/use-element-width'
import { CardArt } from '../CardArt'
import type { PracticeHandCard } from './practice'

/** Espacio sobre las cartas para que puedan levantarse sin recortarse. */
const LIFT_ROOM = 30
/** Espacio bajo las cartas: el abanico baja en los extremos y las cartas inclinadas sobresalen. */
const FAN_ROOM = 22
const DRAG_THRESHOLD = 6
const DEAL_MS = 460

interface PracticeHandProps {
  cards: PracticeHandCard[]
  /** Lugares de la mano completa (5, o 6 si se va 2º): reparte las cartas a lo ancho. */
  slots: number
  /** Lugares de la mano inicial: fija el tamaño de las cartas, que no cambia al robar. */
  sizeSlots: number
  maxCardWidth: number
  fanDegrees: number
  highlighted: ReadonlySet<string>
  /** Rect del mazo: de ahí salen las cartas al repartirse. */
  getDeckRect: () => DOMRect | null
  onReorder: (ids: string[]) => void
}

interface DragState {
  id: string
  x: number
  y: number
}

function prefersReducedMotion(): boolean {
  return typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches === true
}

/** Mano en abanico: se reordena arrastrando, se levanta con un toque y se reparte desde el mazo. */
export function PracticeHand({ cards, slots, sizeSlots, maxCardWidth, fanDegrees, highlighted, getDeckRect, onReorder }: PracticeHandProps) {
  const containerRef = useRef<HTMLDivElement | null>(null)
  const width = useElementWidth(containerRef)
  const layout = computeHandLayout(width, slots, maxCardWidth, sizeSlots)
  const [drag, setDrag] = useState<DragState | null>(null)
  const [liftedId, setLiftedId] = useState<string | null>(null)
  const dragRef = useRef<{ id: string; pointerId: number; startX: number; startY: number; grabDx: number; moved: boolean } | null>(null)
  const cardsRef = useRef(cards)
  cardsRef.current = cards
  const layoutRef = useRef(layout)
  layoutRef.current = layout

  const ids = cards.map((card) => card.drawId)
  const hasHighlight = highlighted.size > 0

  const handlePointerDown = (event: ReactPointerEvent<HTMLElement>, id: string) => {
    if (event.button !== 0 || !containerRef.current) {
      return
    }

    const index = ids.indexOf(id)
    const rect = containerRef.current.getBoundingClientRect()
    dragRef.current = {
      id,
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      grabDx: event.clientX - rect.left - slotLeft(layout, index),
      moved: false,
    }
    event.currentTarget.setPointerCapture(event.pointerId)
  }

  const handlePointerMove = (event: ReactPointerEvent<HTMLElement>) => {
    const state = dragRef.current

    if (!state || state.pointerId !== event.pointerId || !containerRef.current) {
      return
    }

    if (!state.moved && Math.hypot(event.clientX - state.startX, event.clientY - state.startY) < DRAG_THRESHOLD) {
      return
    }

    state.moved = true
    setLiftedId(null)
    const rect = containerRef.current.getBoundingClientRect()
    const current = layoutRef.current
    const x = event.clientX - rect.left - state.grabDx
    const y = Math.min(Math.max(event.clientY - state.startY, -110), 50)
    setDrag({ id: state.id, x, y })

    const currentIds = cardsRef.current.map((card) => card.drawId)
    const from = currentIds.indexOf(state.id)
    const to = slotIndexAtCenter(current, x + current.cardWidth / 2, currentIds.length)

    if (from !== -1 && to !== from) {
      onReorder(moveItem(currentIds, from, to))
    }
  }

  const handlePointerEnd = (event: ReactPointerEvent<HTMLElement>, id: string) => {
    const state = dragRef.current

    if (!state || state.pointerId !== event.pointerId) {
      return
    }

    dragRef.current = null
    setDrag(null)

    if (!state.moved && event.type === 'pointerup') {
      setLiftedId((current) => (current === id ? null : id))
    }
  }

  const handleKeyDown = (event: ReactKeyboardEvent<HTMLElement>, id: string) => {
    const from = ids.indexOf(id)

    if (event.key === 'ArrowLeft' && from > 0) {
      event.preventDefault()
      onReorder(moveItem(ids, from, from - 1))
    } else if (event.key === 'ArrowRight' && from < ids.length - 1) {
      event.preventDefault()
      onReorder(moveItem(ids, from, from + 1))
    } else if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault()
      setLiftedId((current) => (current === id ? null : id))
    }
  }

  return (
    <div
      ref={containerRef}
      className="practice-hand"
      role="list"
      aria-label="Mano"
      style={{ height: layout.cardHeight + LIFT_ROOM + FAN_ROOM }}
    >
      {width > 0
        ? cards.map((card, index) => {
            const isDragged = drag?.id === card.drawId
            const isLifted = liftedId === card.drawId
            const angle = fanAngle(index, slots, fanDegrees)
            const arch = Math.abs(index - (slots - 1) / 2) ** 2 * 1.6
            const x = isDragged ? drag.x : slotLeft(layout, index)
            const y = LIFT_ROOM + (isDragged ? drag.y - 16 : isLifted ? -LIFT_ROOM + 4 : arch)
            const transform = isDragged
              ? `translate3d(${x}px, ${y}px, 0) rotate(0deg) scale(1.1)`
              : `translate3d(${x}px, ${y}px, 0) rotate(${isLifted ? 0 : angle}deg) scale(${isLifted ? 1.12 : 1})`

            return (
              <HandCard
                key={card.drawId}
                card={card}
                layout={layout}
                transform={transform}
                zIndex={isDragged ? 100 : isLifted ? 60 : index + 1}
                state={isDragged ? 'dragging' : isLifted ? 'lifted' : 'rest'}
                glow={highlighted.has(card.drawId)}
                dim={hasHighlight && !highlighted.has(card.drawId)}
                getDeckRect={getDeckRect}
                containerRef={containerRef}
                onPointerDown={(event) => handlePointerDown(event, card.drawId)}
                onPointerMove={handlePointerMove}
                onPointerEnd={(event) => handlePointerEnd(event, card.drawId)}
                onKeyDown={(event) => handleKeyDown(event, card.drawId)}
              />
            )
          })
        : null}
    </div>
  )
}

interface HandCardProps {
  card: PracticeHandCard
  layout: HandLayout
  transform: string
  zIndex: number
  state: 'rest' | 'lifted' | 'dragging'
  glow: boolean
  dim: boolean
  getDeckRect: () => DOMRect | null
  containerRef: React.RefObject<HTMLDivElement | null>
  onPointerDown: (event: ReactPointerEvent<HTMLDivElement>) => void
  onPointerMove: (event: ReactPointerEvent<HTMLDivElement>) => void
  onPointerEnd: (event: ReactPointerEvent<HTMLDivElement>) => void
  onKeyDown: (event: ReactKeyboardEvent<HTMLDivElement>) => void
}

function HandCard({
  card,
  layout,
  transform,
  zIndex,
  state,
  glow,
  dim,
  getDeckRect,
  containerRef,
  onPointerDown,
  onPointerMove,
  onPointerEnd,
  onKeyDown,
}: HandCardProps) {
  const elementRef = useRef<HTMLDivElement | null>(null)
  const backRef = useRef<HTMLDivElement | null>(null)
  const finalTransformRef = useRef(transform)
  finalTransformRef.current = transform

  // Al montarse (cuando se reparte) la carta vuela desde el mazo y se da vuelta en el camino.
  useLayoutEffect(() => {
    const element = elementRef.current
    const back = backRef.current
    const container = containerRef.current
    const deck = getDeckRect()

    if (!element || !back || !container || typeof element.animate !== 'function' || prefersReducedMotion()) {
      back?.style.setProperty('display', 'none')
      return
    }

    const area = container.getBoundingClientRect()
    const finalTransform = finalTransformRef.current
    const fromX = deck ? deck.left + deck.width / 2 - area.left - layout.cardWidth / 2 : layout.startX
    const fromY = deck ? deck.top + deck.height / 2 - area.top - layout.cardHeight / 2 : LIFT_ROOM + 40
    const startScale = deck ? Math.max(0.3, deck.width / layout.cardWidth) : 0.6
    const target = /translate3d\((-?[\d.]+)px, (-?[\d.]+)px/.exec(finalTransform)
    const toX = target ? Number(target[1]) : fromX
    const toY = target ? Number(target[2]) : fromY
    // A mitad de camino la carta se "angosta": ahí se cambia el dorso por la cara.
    const mid = `translate3d(${(fromX + toX) / 2}px, ${Math.min(fromY, toY) - 18}px, 0) rotate(-6deg) scale(0.06, 1.05)`

    const flight = element.animate(
      [
        { transform: `translate3d(${fromX}px, ${fromY}px, 0) rotate(-14deg) scale(${startScale})`, opacity: 0.9 },
        { transform: mid, opacity: 1, offset: 0.5 },
        { transform: finalTransform, opacity: 1 },
      ],
      { duration: DEAL_MS, easing: 'cubic-bezier(0.22, 0.9, 0.3, 1)', fill: 'backwards' },
    )
    const flip = back.animate(
      [{ opacity: 1 }, { opacity: 1, offset: 0.49 }, { opacity: 0, offset: 0.5 }, { opacity: 0 }],
      { duration: DEAL_MS, fill: 'both' },
    )

    return () => {
      flight.cancel()
      flip.cancel()
    }
    // Sólo al montarse: reordenar o redimensionar no debe volver a repartir.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const style: CSSProperties = {
    width: layout.cardWidth,
    height: layout.cardHeight,
    transform,
    zIndex,
  }

  return (
    <div
      ref={elementRef}
      role="listitem"
      tabIndex={0}
      aria-label={card.name}
      className="practice-card"
      data-state={state}
      data-glow={glow ? 'true' : 'false'}
      data-dim={dim ? 'true' : 'false'}
      style={style}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerEnd}
      onPointerCancel={onPointerEnd}
      onKeyDown={onKeyDown}
    >
      <CardArt
        remoteUrl={card.apiCard?.imageUrlSmall ?? card.apiCard?.imageUrl ?? null}
        name={card.name}
        className="block h-full w-full bg-input object-cover"
        limitCard={card.apiCard}
        limitBadgeSize="sm"
      />
      <div ref={backRef} className="practice-card-back" aria-hidden="true" />
    </div>
  )
}
