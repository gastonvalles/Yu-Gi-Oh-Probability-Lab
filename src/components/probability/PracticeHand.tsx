import {
  useLayoutEffect,
  useRef,
  useState,
  type CSSProperties,
  type KeyboardEvent as ReactKeyboardEvent,
  type PointerEvent as ReactPointerEvent,
} from 'react'
import { flushSync } from 'react-dom'

import {
  computeHandLayout,
  fanAngle,
  moveItem,
  slotIndexAtCenter,
  slotLeft,
  type HandLayout,
} from '../../app/practice-hand-layout'
import type { SpotlightKind } from '../../app/mat-effects'
import { useElementWidth } from '../../app/use-element-width'
import { t } from '../../i18n'
import type { ApiCardReference, GlowKind } from '../../types'
import { CardArt } from '../CardArt'
import { cx } from '../ui/cx'
import { FX_CARD, FxFrame, SPOTLIGHT_TONE, TargetMark, fxVars } from './MatFx'
import { CARD_BACK, GLOW_TONE } from './practice-styles'

/** Espacio sobre las cartas: el abanico sube un poco en el centro. */
const TOP_ROOM = 8
/** Espacio bajo las cartas: el abanico baja en los extremos y las cartas inclinadas sobresalen. */
const FAN_ROOM = 22
const DRAG_THRESHOLD = 6
/** Cuánto tarda una carta en llegar a la mano desde el mazo al repartir (sale, se da vuelta arriba, aterriza con un rebote). */
const DEAL_MS = 460
/** Ancho por defecto mientras el contenedor no se midió (p. ej. en tests). */
const FALLBACK_WIDTH = 340

/** Carta de la mano: el estado (arrastre, brillo, atenuada, destello, objetivo) llega por data-attributes. */
const HAND_CARD = [
  'pointer-events-auto absolute left-0 top-0 cursor-grab touch-none select-none overflow-hidden outline-none will-change-transform',
  '[-webkit-touch-callout:none] [-webkit-user-select:none]',
  '[--card-shadow:0_8px_18px_rgba(0,0,0,0.45),0_0_0_1px_rgb(var(--foreground-rgb)/0.1)]',
  'shadow-[0_8px_18px_rgba(0,0,0,0.45),0_0_0_1px_rgb(var(--foreground-rgb)/0.1)]',
  '[transition:transform_var(--motion-duration)_cubic-bezier(0.2,0.8,0.2,1),filter_var(--motion-duration)_ease,box-shadow_var(--motion-duration)_ease]',
  // El arte no debe capturar el toque ni arrancar el arrastre nativo de imágenes.
  '[&>:not([data-back])]:pointer-events-none [&>:not([data-back])]:[-webkit-user-drag:none]',
  'focus-visible:outline-solid focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary-hover',
  'data-[state=dragging]:cursor-grabbing data-[state=dragging]:shadow-[0_24px_38px_rgba(0,0,0,0.55),0_0_0_2px_rgb(var(--primary-hover-rgb))]',
  'data-[state=dragging]:[transition:filter_var(--motion-duration)_ease,box-shadow_var(--motion-duration)_ease]',
  'data-[muted=true]:grayscale data-[muted=true]:brightness-70',
  'data-[dim=true]:brightness-[0.42] data-[dim=true]:saturate-[0.6]',
  // Salidas en verde, problemas en rojo, y en un duelo las cartas que pueden responder en ámbar.
  'motion-safe:data-[glow=true]:animate-card-glow data-[glow=true]:[--glow-rgb:var(--accent-rgb)] data-[glow-kind=problem]:[--glow-rgb:var(--danger-rgb)] data-[glow-kind=respond]:[--glow-rgb:var(--warning-rgb)]!',
  'data-[glow=true]:shadow-[0_8px_18px_rgba(0,0,0,0.45),0_0_0_3px_rgb(var(--glow-rgb)),0_0_30px_5px_rgb(var(--glow-rgb)/0.7)]',
  // Activar, mostrar, declarar y marcar como objetivo: el aro de afuera (el marco de adentro y la mira son hijos de la carta).
  FX_CARD,
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
  highlightKind: GlowKind | null
  /** Mano no jugable: las cartas se ven grises. */
  muted: boolean
  /** Carta que acaba de destacarse (destella), una clave que cambia en cada destaque y para qué fue. */
  flash: { id: string; key: number; kind: SpotlightKind } | null
  /** Cartas marcadas como objetivo: llevan una mira. */
  targeted: ReadonlySet<string>
  /** La carta de la que se está viendo el menú: lleva un marco celeste y sube sobre las vecinas. */
  selectedId: string | null
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
export function PracticeHand({ cards, sizeSlots, maxCardWidth, fanDegrees, highlighted, highlightKind, muted, flash, targeted, selectedId, getDeckRect, dealsFromDeck, getField, onReorder, onTap, onDragOver, onDrop, className }: PracticeHandProps) {
  const containerRef = useRef<HTMLDivElement | null>(null)
  const width = useElementWidth(containerRef) || FALLBACK_WIDTH
  // El tamaño de la carta sale de la mano inicial (no cambia al jugar o robar), pero la separación, el abanico y el centrado salen de las cartas que hay: al salir una, las que quedan se vuelven a centrar.
  const count = Math.max(1, cards.length)
  const layout = computeHandLayout(width, count, maxCardWidth, sizeSlots)
  // La carta arrastrada: sólo cuál es. Dónde está se escribe en su `transform` por el ref, un cuadro por vez, sin pasar por React.
  const [draggedId, setDraggedId] = useState<string | null>(null)
  const dragRef = useRef<{ id: string; pointerId: number; startX: number; startY: number; grabDx: number; moved: boolean; outside: string | null; element: HTMLElement } | null>(null)
  const cardsRef = useRef(cards)
  cardsRef.current = cards
  const layoutRef = useRef(layout)
  layoutRef.current = layout

  const ids = cards.map((card) => card.id)
  // Las que brillan por una salida o un problema oscurecen al resto de la mano; las que pueden responder, no (la mano sigue a la vista).
  const hasHighlight = highlighted.size > 0 && highlightKind !== 'respond'

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

    state.element.style.transform = `translate3d(${x}px, ${TOP_ROOM + y - 16}px, 0) perspective(900px) rotateX(${tilt}deg) scale(${scale})`

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

    // La carta pasa a "dragging" (sin transición de `transform`) ya, no después del primer cuadro: si no, el primer movimiento se vería con la transición.
    if (!state.moved) {
      flushSync(() => setDraggedId(state.id))
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
    setDraggedId(null)

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
      aria-label={t('practice.hand.label')}
      data-drop="hand"
      style={{ height: layout.cardHeight + TOP_ROOM + FAN_ROOM }}
    >
      {cards.map((card, index) => {
        const isDragged = draggedId === card.id
        const angle = fanAngle(index, count, fanDegrees)
        const arch = Math.abs(index - (count - 1) / 2) ** 2 * 1.6
        // El lugar que le toca en el abanico; la carta arrastrada lo ignora (ver `HandCard`) y vuelve a él al soltarse.
        const transform = `translate3d(${slotLeft(layout, index)}px, ${TOP_ROOM + arch}px, 0) rotate(${angle}deg)`
        const flashing = flash?.id === card.id
        const selected = selectedId === card.id

        return (
          <HandCard
            key={card.id}
            card={card}
            layout={layout}
            transform={transform}
            zIndex={isDragged ? 100 : flashing || selected ? 50 : index + 1}
            state={isDragged ? 'dragging' : 'rest'}
            glow={highlighted.has(card.id)}
            glowKind={highlightKind}
            muted={muted}
            dim={hasHighlight && !highlighted.has(card.id)}
            flash={flashing ? flash : null}
            targeted={targeted.has(card.id)}
            selected={selected}
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
      {cards.length === 0 ? <span className="absolute inset-0 grid place-items-center text-micro text-soft">{t('practice.hand.empty')}</span> : null}
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
  glowKind: GlowKind | null
  muted: boolean
  dim: boolean
  flash: { key: number; kind: SpotlightKind } | null
  targeted: boolean
  selected: boolean
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
  flash,
  targeted,
  selected,
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
    // La carta se da vuelta en el aire, en 3D: sale mostrando el dorso, a mitad de camino queda de canto (ahí se cambia el dorso por la cara)
    // y termina de abrirse del otro lado. Todos los pasos llevan las mismas funciones, en el mismo orden, para que se interpolen una por una.
    const spin = (position: string, degrees: number) => `perspective(700px) ${position} rotateY(${degrees}deg)`
    // Arriba, a mitad de camino: más alta y un poco más grande (se acerca a la cámara al darse vuelta).
    const midPosition = `translate3d(${(fromX + toX) / 2}px, ${Math.min(fromY, toY) - 34}px, 0) rotate(-4deg) scale(1.12)`
    // Aterriza con un rebote: pasa un poco de su lugar (más abajo-arriba y con un grado más de giro) y se asienta. Sin el giro del abanico (no parsea), llega directo.
    const fan = /rotate\((-?[\d.]+)deg\)/.exec(finalTransform)
    const bounce = fan ? `translate3d(${toX}px, ${toY - 7}px, 0) rotate(${Number(fan[1]) + 1.5}deg) scale(1.03)` : `${finalTransform} scale(1)`

    const flight = element.animate(
      [
        { transform: spin(`translate3d(${fromX}px, ${fromY}px, 0) rotate(-16deg) scale(${startScale})`, 0), opacity: 0.9, boxShadow: '0 0 0 rgb(0 0 0 / 0)', easing: 'cubic-bezier(0.3, 0.1, 0.4, 1)' },
        { transform: spin(midPosition, 90), opacity: 1, offset: 0.42, boxShadow: '0 22px 30px rgb(0 0 0 / 0.5)' },
        { transform: spin(midPosition, -90), opacity: 1, offset: 0.42, boxShadow: '0 22px 30px rgb(0 0 0 / 0.5)', easing: 'cubic-bezier(0.3, 0, 0.2, 1)' },
        { transform: spin(bounce, 0), opacity: 1, offset: 0.82, boxShadow: '0 12px 20px rgb(0 0 0 / 0.4)', easing: 'ease-out' },
        { transform: spin(`${finalTransform} scale(1)`, 0), opacity: 1 },
      ],
      { duration: DEAL_MS, fill: 'backwards' },
    )
    const flip = back.animate(
      [{ opacity: 1 }, { opacity: 1, offset: 0.41 }, { opacity: 0, offset: 0.42 }, { opacity: 0 }],
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
    // Arrastrada, la posición la escribe `PracticeHand` por el ref en cada cuadro: React no la toca (y al soltar vuelve a poner la de reposo).
    transform: state === 'dragging' ? undefined : transform,
    zIndex,
    // El color de su aro: el del destaque, o el rojo de la mira.
    ...fxVars(flash ? SPOTLIGHT_TONE[flash.kind] : 'red'),
  }

  return (
    <div
      ref={elementRef}
      role="listitem"
      tabIndex={0}
      aria-label={targeted ? t('practice.card.targeted', { name: card.name }) : card.name}
      title={card.name}
      data-card-id={card.id}
      className={HAND_CARD}
      data-state={state}
      data-glow={glow ? 'true' : 'false'}
      data-glow-kind={glow ? (glowKind ?? 'opening') : undefined}
      data-dim={dim ? 'true' : 'false'}
      data-muted={muted ? 'true' : 'false'}
      data-flash={flash ? 'true' : 'false'}
      data-flash-kind={flash?.kind}
      data-targeted={targeted ? 'true' : 'false'}
      data-selected={selected ? 'true' : 'false'}
      style={style}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerEnd}
      onPointerCancel={onPointerEnd}
      // Un puntero que se pierde sin avisar (el navegador del celular, la mano que se arma de nuevo a mitad de camino) corta el arrastre: no queda una zona encendida.
      onLostPointerCapture={onPointerEnd}
      onKeyDown={onKeyDown}
      onContextMenu={(event) => event.preventDefault()}
    >
      <CardArt
        tilt
        remoteUrl={card.apiCard?.imageUrlSmall ?? card.apiCard?.imageUrl ?? null}
        name={card.name}
        className="block h-full w-full bg-input object-cover"
        limitCard={card.apiCard}
        limitBadgeSize="sm"
      />
      <div ref={backRef} data-back className={CARD_BACK} aria-hidden="true" />
      {selected ? <FxFrame tone="cyan" /> : null}
      {glow ? <FxFrame tone={GLOW_TONE[glowKind ?? 'opening']} orbit={false} /> : null}
      {flash && flash.kind !== 'target' ? <FxFrame key={flash.key} tone={SPOTLIGHT_TONE[flash.kind]} shine /> : null}
      {targeted ? <TargetMark /> : null}
    </div>
  )
}
