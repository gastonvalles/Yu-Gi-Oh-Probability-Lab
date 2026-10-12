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
import { UI_ANIMATION_MS } from '../../app/motion'
import { useElementWidth } from '../../app/use-element-width'
import type { ApiCardReference, PatternKind } from '../../types'
import { CardArt } from '../CardArt'
import { cx } from '../ui/cx'
import { Icon } from '../ui/Icon'
import { CARD_BACK } from './practice-styles'

/** Espacio sobre las cartas: el abanico sube un poco en el centro. */
const TOP_ROOM = 8
/** Espacio bajo las cartas: el abanico baja en los extremos y las cartas inclinadas sobresalen. */
const FAN_ROOM = 22
const DRAG_THRESHOLD = 6
/** Ancho por defecto mientras el contenedor no se midió (p. ej. en tests). */
const FALLBACK_WIDTH = 340

/** Carta de la mano: el estado (arrastre, brillo, atenuada, destello) llega por data-attributes. */
const HAND_CARD = [
  'absolute left-0 top-0 cursor-grab touch-none select-none overflow-hidden rounded-tag outline-none will-change-transform',
  '[-webkit-touch-callout:none] [-webkit-user-select:none]',
  'shadow-[0_8px_18px_rgba(0,0,0,0.45),0_0_0_1px_rgb(var(--foreground-rgb)/0.1)]',
  '[transition:transform_var(--motion-duration)_cubic-bezier(0.2,0.8,0.2,1),filter_var(--motion-duration)_ease,box-shadow_var(--motion-duration)_ease]',
  // El arte no debe capturar el toque ni arrancar el arrastre nativo de imágenes.
  '[&>:not([data-back])]:pointer-events-none [&>:not([data-back])]:[-webkit-user-drag:none]',
  'focus-visible:shadow-[0_8px_18px_rgba(0,0,0,0.45),0_0_0_2px_rgb(var(--primary-hover-rgb))]',
  'data-[state=dragging]:cursor-grabbing data-[state=dragging]:shadow-[0_24px_38px_rgba(0,0,0,0.55),0_0_0_2px_rgb(var(--primary-hover-rgb))]',
  'data-[state=dragging]:[transition:filter_var(--motion-duration)_ease,box-shadow_var(--motion-duration)_ease]',
  'data-[muted=true]:grayscale data-[muted=true]:brightness-70',
  'data-[dim=true]:brightness-[0.42] data-[dim=true]:saturate-[0.6]',
  // Salidas en verde, problemas en rojo.
  'data-[glow=true]:animate-card-glow data-[glow=true]:[--glow-rgb:var(--accent-rgb)] data-[glow-kind=problem]:[--glow-rgb:var(--danger-rgb)]',
  'data-[glow=true]:shadow-[0_8px_18px_rgba(0,0,0,0.45),0_0_0_2px_rgb(var(--glow-rgb)),0_0_22px_rgb(var(--glow-rgb)/0.6)]',
  // Activación: aro amarillo (la carta grande aparece aparte, en el centro de la pantalla).
  'data-[flash=true]:shadow-[0_8px_18px_rgba(0,0,0,0.45),0_0_0_2px_#facc15,0_0_22px_#facc15b3]',
  'motion-reduce:animate-none motion-reduce:transition-none',
].join(' ')

export interface HandCardData {
  id: string
  name: string
  apiCard: ApiCardReference | null
}

interface PracticeHandProps {
  cards: HandCardData[]
  /** Lugares de la mano inicial: fija el tamaño de las cartas, que no cambia al robar. */
  sizeSlots: number
  maxCardWidth: number
  fanDegrees: number
  highlighted: ReadonlySet<string>
  /** Tipo de la regla que ilumina las cartas: las salidas brillan en verde y los problemas en rojo. */
  highlightKind: PatternKind | null
  /** Mano no jugable: las cartas se ven grises. */
  muted: boolean
  /** Carta que acaba de activarse (destella) y una clave que cambia en cada activación. */
  flash: { id: string; key: number } | null
  /** Cartas marcadas como objetivo: llevan una mira. */
  targeted: ReadonlySet<string>
  /** Rect del mazo: de ahí salen las cartas al repartirse. */
  getDeckRect: () => DOMRect | null
  /** Si una carta que aparece en la mano se reparte desde el mazo o ya la trae otra animación (vuelve de una zona). */
  dealsFromDeck?: (id: string) => boolean
  /**
   * El campo (su rect y el ancho de una zona): al arrastrar una carta hacia él se va achicando hasta el
   * tamaño de la zona, con un poco de perspectiva, como si se hundiera en la mesa.
   */
  getField: () => { rect: DOMRect; zoneWidth: number } | null
  onReorder: (ids: string[]) => void
  /** Toque sin arrastre: abre el menú de la carta. */
  onTap: (card: HandCardData, rect: DOMRect) => void
  /** Mientras se arrastra fuera de la mano: la zona (`data-drop`) bajo el puntero, o null. */
  onDragOver: (target: string | null) => void
  /** Se soltó sobre una zona de la mesa. */
  onDrop: (card: HandCardData, target: string) => void
  className?: string
}

interface DragState {
  id: string
  x: number
  y: number
  /** Tamaño relativo (1.1 en la mano, el de la zona sobre el campo) e inclinación en grados. */
  scale: number
  tilt: number
}

/** Escala de la carta levantada mientras está sobre la mano. */
const LIFT_SCALE = 1.1
/** Inclinación máxima (perspectiva) al llegar al campo. */
const MAX_TILT = 16

const clamp01 = (value: number) => Math.min(1, Math.max(0, value))

function prefersReducedMotion(): boolean {
  return typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches === true
}

/** La zona (`data-drop`) bajo el puntero, sin contar la carta que se está arrastrando. */
function dropTargetAt(x: number, y: number, dragged: HTMLElement): { element: HTMLElement; drop: string } | null {
  const under = document.elementsFromPoint(x, y).find((element) => element !== dragged && !dragged.contains(element))
  const element = under?.closest<HTMLElement>('[data-drop]') ?? null
  const drop = element?.dataset.drop

  return element && drop ? { element, drop } : null
}

/**
 * Mano en abanico: un toque abre el menú de la carta, se reordena arrastrando dentro de la mano, se
 * arrastra fuera de la mano hasta una zona de la mesa, y se reparte desde el mazo.
 */
export function PracticeHand({ cards, sizeSlots, maxCardWidth, fanDegrees, highlighted, highlightKind, muted, flash, targeted, getDeckRect, dealsFromDeck, getField, onReorder, onTap, onDragOver, onDrop, className }: PracticeHandProps) {
  const containerRef = useRef<HTMLDivElement | null>(null)
  const width = useElementWidth(containerRef) || FALLBACK_WIDTH
  const slots = Math.max(cards.length, sizeSlots)
  const layout = computeHandLayout(width, slots, maxCardWidth, sizeSlots)
  const [drag, setDrag] = useState<DragState | null>(null)
  const dragRef = useRef<{ id: string; pointerId: number; startX: number; startY: number; grabDx: number; moved: boolean; outside: string | null; element: HTMLElement } | null>(null)
  const cardsRef = useRef(cards)
  cardsRef.current = cards
  const layoutRef = useRef(layout)
  layoutRef.current = layout

  const ids = cards.map((card) => card.id)
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
      outside: null,
      element: event.currentTarget,
    }
    event.currentTarget.setPointerCapture(event.pointerId)
  }

  // El movimiento se aplica una vez por cuadro (pointermove puede dispararse mucho más seguido
  // que la pantalla) y se lee el rect del contenedor sólo ahí.
  const pendingMoveRef = useRef<{ clientX: number; clientY: number } | null>(null)
  const moveFrameRef = useRef(0)

  const applyPendingMove = () => {
    moveFrameRef.current = 0
    const state = dragRef.current
    const move = pendingMoveRef.current
    pendingMoveRef.current = null

    if (!state || !move || !containerRef.current) {
      return
    }

    const container = containerRef.current
    const rect = container.getBoundingClientRect()
    const current = layoutRef.current
    const x = move.clientX - rect.left - state.grabDx
    const y = move.clientY - state.startY

    // Fuera de la mano la carta busca una zona de la mesa; adentro (o a los costados, a su altura), se reordena.
    const target = dropTargetAt(move.clientX, move.clientY, state.element)
    const overHand = target !== null && (target.drop === 'hand' || container.contains(target.element))
    const besideHand = target === null && move.clientY >= rect.top && move.clientY <= rect.bottom
    const insideHand = overHand || besideHand
    const outside = target && !insideHand ? target.drop : null

    // Camino hacia el campo: de la mano (levantada) al borde de abajo del campo la carta se achica hasta el
    // tamaño de la zona y se inclina, como si se hundiera en la mesa.
    const field = getField()
    let scale = LIFT_SCALE
    let tilt = 0

    if (field && !insideHand) {
      const progress = clamp01((rect.top - move.clientY) / Math.max(1, rect.top - field.rect.bottom))
      const zoneScale = Math.min(LIFT_SCALE, field.zoneWidth / Math.max(1, current.cardWidth))
      scale = LIFT_SCALE + (zoneScale - LIFT_SCALE) * progress
      tilt = MAX_TILT * progress
    }

    setDrag({ id: state.id, x, y, scale, tilt })

    if (outside !== state.outside) {
      state.outside = outside
      onDragOver(outside)
    }

    if (insideHand) {
      const currentIds = cardsRef.current.map((card) => card.id)
      const from = currentIds.indexOf(state.id)
      const to = slotIndexAtCenter(current, x + current.cardWidth / 2, currentIds.length)

      if (from !== -1 && to !== from) {
        onReorder(moveItem(currentIds, from, to))
      }
    }
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
    pendingMoveRef.current = { clientX: event.clientX, clientY: event.clientY }

    if (!moveFrameRef.current) {
      moveFrameRef.current = window.requestAnimationFrame(applyPendingMove)
    }
  }

  const handlePointerEnd = (event: ReactPointerEvent<HTMLElement>, id: string) => {
    const state = dragRef.current

    if (!state || state.pointerId !== event.pointerId) {
      return
    }

    dragRef.current = null
    window.cancelAnimationFrame(moveFrameRef.current)
    moveFrameRef.current = 0
    pendingMoveRef.current = null
    setDrag(null)

    const card = cardsRef.current.find((entry) => entry.id === id)

    if (state.outside !== null) {
      onDragOver(null)
    }

    if (!card) {
      return
    }

    if (state.moved) {
      // Se mira la zona bajo el puntero al soltar (puede no haber llegado el último frame).
      const target = event.type === 'pointerup' ? dropTargetAt(event.clientX, event.clientY, state.element) : null
      const container = containerRef.current

      if (target && target.drop !== 'hand' && !(container && container.contains(target.element))) {
        onDrop(card, target.drop)
      }

      return
    }

    if (event.type === 'pointerup') {
      onTap(card, event.currentTarget.getBoundingClientRect())
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
      const card = cardsRef.current.find((entry) => entry.id === id)

      if (card) {
        onTap(card, event.currentTarget.getBoundingClientRect())
      }
    }
  }

  return (
    <div
      ref={containerRef}
      className={cx('relative w-full', className)}
      role="list"
      aria-label="Mano"
      data-drop="hand"
      style={{ height: layout.cardHeight + TOP_ROOM + FAN_ROOM }}
    >
      {cards.map((card, index) => {
        const isDragged = drag?.id === card.id
        const angle = fanAngle(index, slots, fanDegrees)
        const arch = Math.abs(index - (slots - 1) / 2) ** 2 * 1.6
        const x = isDragged ? drag.x : slotLeft(layout, index)
        const y = TOP_ROOM + (isDragged ? drag.y - 16 : arch)
        const transform = isDragged
          ? `translate3d(${x}px, ${y}px, 0) perspective(900px) rotateX(${drag.tilt}deg) scale(${drag.scale})`
          : `translate3d(${x}px, ${y}px, 0) rotate(${angle}deg)`
        const flashing = flash?.id === card.id

        return (
          <HandCard
            key={card.id}
            card={card}
            layout={layout}
            transform={transform}
            zIndex={isDragged ? 100 : flashing ? 50 : index + 1}
            state={isDragged ? 'dragging' : 'rest'}
            glow={highlighted.has(card.id)}
            glowKind={highlightKind}
            muted={muted}
            dim={hasHighlight && !highlighted.has(card.id)}
            flashKey={flashing ? flash.key : null}
            targeted={targeted.has(card.id)}
            getDeckRect={getDeckRect}
            flyIn={dealsFromDeck ? dealsFromDeck(card.id) : true}
            containerRef={containerRef}
            onPointerDown={(event) => handlePointerDown(event, card.id)}
            onPointerMove={handlePointerMove}
            onPointerEnd={(event) => handlePointerEnd(event, card.id)}
            onKeyDown={(event) => handleKeyDown(event, card.id)}
          />
        )
      })}
      {cards.length === 0 ? <span className="absolute inset-0 grid place-items-center text-micro text-soft">Sin cartas en la mano</span> : null}
    </div>
  )
}

interface HandCardProps {
  card: HandCardData
  layout: HandLayout
  transform: string
  zIndex: number
  state: 'rest' | 'dragging'
  glow: boolean
  glowKind: PatternKind | null
  muted: boolean
  dim: boolean
  flashKey: number | null
  targeted: boolean
  getDeckRect: () => DOMRect | null
  /** false: la carta llega de otro lado de la mesa (la trae el vuelo entre zonas), sin el reparto desde el mazo. */
  flyIn: boolean
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
  glowKind,
  muted,
  dim,
  flashKey,
  targeted,
  getDeckRect,
  flyIn,
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

    if (!flyIn || !element || !back || !container || typeof element.animate !== 'function' || prefersReducedMotion()) {
      back?.style.setProperty('display', 'none')
      return
    }

    const area = container.getBoundingClientRect()
    const finalTransform = finalTransformRef.current
    const fromX = deck ? deck.left + deck.width / 2 - area.left - layout.cardWidth / 2 : layout.startX
    const fromY = deck ? deck.top + deck.height / 2 - area.top - layout.cardHeight / 2 : TOP_ROOM + 40
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
      { duration: UI_ANIMATION_MS, easing: 'cubic-bezier(0.22, 0.9, 0.3, 1)', fill: 'backwards' },
    )
    const flip = back.animate(
      [{ opacity: 1 }, { opacity: 1, offset: 0.49 }, { opacity: 0, offset: 0.5 }, { opacity: 0 }],
      { duration: UI_ANIMATION_MS, fill: 'both' },
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
      aria-label={targeted ? `${card.name} (seleccionada)` : card.name}
      title={card.name}
      data-card-id={card.id}
      className={HAND_CARD}
      data-state={state}
      data-glow={glow ? 'true' : 'false'}
      data-glow-kind={glow ? (glowKind ?? 'opening') : undefined}
      data-dim={dim ? 'true' : 'false'}
      data-muted={muted ? 'true' : 'false'}
      data-flash={flashKey !== null ? 'true' : 'false'}
      style={style}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerEnd}
      onPointerCancel={onPointerEnd}
      onKeyDown={onKeyDown}
      onContextMenu={(event) => event.preventDefault()}
    >
      <CardArt
        remoteUrl={card.apiCard?.imageUrlSmall ?? card.apiCard?.imageUrl ?? null}
        name={card.name}
        className="block h-full w-full bg-input object-cover"
        limitCard={card.apiCard}
        limitBadgeSize="sm"
      />
      <div ref={backRef} data-back className={CARD_BACK} aria-hidden="true" />
      {targeted ? <TargetMark /> : null}
    </div>
  )
}

/** La mira de "objetivo": se comparte con las cartas del campo. */
export function TargetMark() {
  return (
    <span className="pointer-events-none absolute right-0.5 top-0.5 z-2 grid size-5 place-items-center rounded-full bg-danger text-white shadow-[0_0_10px_rgb(var(--danger-rgb)/0.8)] animate-pop motion-reduce:animate-none" aria-label="Seleccionada" role="img">
      <Icon name="target" size={13} strokeWidth={2.2} />
    </span>
  )
}
