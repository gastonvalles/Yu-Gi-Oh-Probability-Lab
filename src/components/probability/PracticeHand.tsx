import {
  memo,
  useCallback,
  useLayoutEffect,
  useMemo,
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
import { DEAL_EDGE_AT, DEAL_LAND_AT, dealFrames } from '../../app/deal-flight'
import { EASE_IN_OUT, EASE_OUT, cancelWhenDone } from '../../app/motion'
import { useElementWidth } from '../../app/use-element-width'
import { t } from '../../i18n'
import type { ApiCardReference, GlowKind } from '../../types'
import { CardArt } from '../CardArt'
import { cx } from '../ui/cx'
import type { ChainBadgeData } from '../../app/card-glow'
import { ChainBadge, FX_CARD, FxFrame, HAND_CARD_HOVER, SPOTLIGHT_TONE, TargetMark, VOIDED_ART, chainLinkLabel, fxVars } from './MatFx'
import { CARD_BACK, glowFrame } from './practice-styles'

/** Espacio sobre las cartas: el abanico sube un poco en el centro. */
const TOP_ROOM = 8
/** Espacio bajo las cartas: el abanico baja en los extremos y las cartas inclinadas sobresalen. */
const FAN_ROOM = 22
const DRAG_THRESHOLD = 6
/** Cuánto tarda una carta en llegar a la mano desde el mazo al repartir (sale, se da vuelta en el camino y se asienta). */
const DEAL_MS = 380
/**
 * Las capas de la sombra del reparto y cuándo se ve cada una (`opacity`): la de la carta en el aire, que crece al salir y se apaga al aterrizar, y la suya (`own`), que vuelve al
 * apoyarse. Fundirlas una en otra se ve como una sombra que se anima entera.
 */
const dealShadows = (own: string) => [
  { shadow: '0 18px 26px rgb(0 0 0 / 0.5)', frames: [{ opacity: 0, easing: EASE_OUT }, { opacity: 1, offset: 0.3, easing: EASE_IN_OUT }, { opacity: 0, offset: DEAL_LAND_AT }, { opacity: 0 }] },
  { shadow: own, frames: [{ opacity: 0 }, { opacity: 0, offset: DEAL_LAND_AT - 0.2, easing: EASE_OUT }, { opacity: 1 }] },
]
/** Ancho por defecto mientras el contenedor no se midió (p. ej. en tests). */
const FALLBACK_WIDTH = 340

/** Carta de la mano: el estado (arrastre, brillo, atenuada, destello, objetivo) llega por data-attributes. */
const HAND_CARD = [
  // El ancho manda (`style`) y el alto sale de la proporción de la carta: nunca los dos fijos.
  'pointer-events-auto absolute left-0 top-0 aspect-[421/614] cursor-grab touch-none select-none overflow-hidden outline-none will-change-transform',
  '[-webkit-touch-callout:none] [-webkit-user-select:none]',
  '[--card-shadow:0_8px_18px_rgba(0,0,0,0.45),0_0_0_1px_rgb(var(--foreground-rgb)/0.1)]',
  // La sombra sale de `--card-shadow`: así el borde blanco de pasar el mouse y los aros de color se suman sin pisarse.
  '[box-shadow:var(--card-shadow)]',
  // Sólo lo que se mueve. Sin `box-shadow`: el aro de un brillo, el del menú y la sombra al levantarla cambian de una (una transición de sombra corre en el hilo principal, y con
  // cada pregunta del núcleo cambian varias cartas a la vez). Sin `filter`: lo gris y lo atenuado también cambian de una, porque la carta que se enciende destella con su propio
  // `filter` (`animate-card-glow`) y dos animaciones de la misma propiedad en un elemento sacan a la de la GPU (Chromium: «incompatible»).
  '[transition:transform_var(--motion-duration)_var(--ease-out),translate_var(--motion-duration)_var(--ease-snap),scale_var(--motion-duration)_var(--ease-snap)]',
  // Pasar el mouse: se eleva y su borde se enciende en blanco, tenue.
  HAND_CARD_HOVER,
  // El arte no debe capturar el toque ni arrancar el arrastre nativo de imágenes.
  '[&>:not([data-back])]:pointer-events-none [&>:not([data-back])]:[-webkit-user-drag:none]',
  'focus-visible:outline-solid focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-info',
  'data-[state=dragging]:cursor-grabbing data-[state=dragging]:shadow-[0_24px_38px_rgba(0,0,0,0.55),0_0_0_2px_rgb(var(--primary-hover-rgb))]',
  'data-[state=dragging]:transition-none',
  'data-[muted=true]:grayscale data-[muted=true]:brightness-70',
  'data-[dim=true]:brightness-[0.42] data-[dim=true]:saturate-[0.6]',
  // Salidas en verde y problemas en rojo; en un duelo, lo que podés hacer y lo que se activa (`DUEL_GLOW`, en `FX_CARD`).
  'motion-safe:data-[glow=true]:animate-card-glow data-[glow=true]:[--glow-rgb:var(--accent-rgb)] data-[glow-kind=problem]:[--glow-rgb:var(--danger-rgb)]',
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
  /** Por qué brilla cada carta: una salida (verde) o un problema (rojo) del Lab o, en un duelo, lo que podés hacer (celeste) y lo que se activa (ámbar): `app/card-glow.ts`. */
  glowOf: (id: string) => GlowKind | null
  /** En un duelo, las cartas que están en la cadena a la vista: llevan la insignia de su eslabón («CL1») y su nombre lo dice. */
  links?: ReadonlyMap<string, ChainBadgeData>
  /** Las que no brillan se oscurecen (una salida o un problema del Lab; en un duelo, no: la mano sigue a la vista). */
  dimUnlit: boolean
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
  /** Mientras se arrastra fuera de la mano: la zona (`data-drop`) bajo el puntero, o null, y la carta que se arrastra. */
  onDragOver: (target: string | null, id: string) => void
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

/** El lugar de una carta entre sus hermanas del DOM: cambia cuando React la mueve (la mano se reordenó). */
const siblingIndex = (element: HTMLElement) => (element.parentElement ? Array.prototype.indexOf.call(element.parentElement.children, element) : -1)

/**
 * Mano en abanico: un toque abre el menú de la carta, se reordena arrastrando dentro de la mano, se
 * arrastra fuera de la mano hasta una zona de la mesa, y se reparte desde el mazo.
 */
export function PracticeHand({ cards, sizeSlots, maxCardWidth, fanDegrees, glowOf, links, dimUnlit, muted, flash, targeted, selectedId, getDeckRect, dealsFromDeck, getField, onReorder, onTap, onDragOver, onDrop, className }: PracticeHandProps) {
  const containerRef = useRef<HTMLDivElement | null>(null)
  const width = useElementWidth(containerRef) || FALLBACK_WIDTH
  // El tamaño de la carta sale de la mano inicial (no cambia al jugar o robar), pero la separación, el abanico y el centrado salen de las cartas que hay: al salir una, las que quedan se vuelven a centrar.
  const count = Math.max(1, cards.length)
  // Memorizado: es una prop de cada carta (`HandCard` va con `memo`), así que un objeto nuevo en cada render las redibujaría a todas.
  const layout = useMemo(() => computeHandLayout(width, count, maxCardWidth, sizeSlots), [width, count, maxCardWidth, sizeSlots])
  // La carta arrastrada: sólo cuál es. Dónde está se escribe en su `transform` por el ref, un cuadro por vez, sin pasar por React.
  const [draggedId, setDraggedId] = useState<string | null>(null)
  // `at`: su lugar en el DOM cuando tomó el puntero (ver `handlePointerEnd`).
  const dragRef = useRef<{ id: string; pointerId: number; startX: number; startY: number; grabDx: number; moved: boolean; outside: string | null; element: HTMLElement; at: number } | null>(null)
  const cardsRef = useRef(cards)
  cardsRef.current = cards
  const layoutRef = useRef(layout)
  layoutRef.current = layout

  const ids = cards.map((card) => card.id)

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
      at: siblingIndex(event.currentTarget),
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
      onDragOver(outside, state.id)
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

    // Arrastrada por encima de otra, la mano se reordena y React mueve esta carta en el DOM (cambia de lugar entre sus hermanas): el navegador le saca el puntero,
    // pero el arrastre sigue (si no, en diagonal hacia el campo la carta volvía a la mano a mitad de camino). Si se lo saca otra cosa (el celular, sin avisar), termina.
    if (event.type === 'lostpointercapture' && state.element.isConnected && siblingIndex(state.element) !== state.at) {
      try {
        state.element.setPointerCapture(event.pointerId)
        state.at = siblingIndex(state.element)
        return
      } catch {
        // sin puntero
      }
    }

    dragRef.current = null
    window.cancelAnimationFrame(moveFrameRef.current)
    moveFrameRef.current = 0
    pendingMoveRef.current = null
    setDraggedId(null)

    const card = cardsRef.current.find((entry) => entry.id === id)

    if (state.outside !== null) {
      onDragOver(null, state.id)
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

  // Las cartas (con `memo`) reciben funciones fijas que leen siempre los últimos manejadores: tocar una no redibuja las demás.
  const latest = useRef({ handlePointerDown, handlePointerMove, handlePointerEnd, handleKeyDown, getDeckRect })
  useLayoutEffect(() => {
    latest.current = { handlePointerDown, handlePointerMove, handlePointerEnd, handleKeyDown, getDeckRect }
  })
  const onCardPointerDown = useCallback((event: ReactPointerEvent<HTMLDivElement>, id: string) => latest.current.handlePointerDown(event, id), [])
  const onCardPointerMove = useCallback((event: ReactPointerEvent<HTMLDivElement>) => latest.current.handlePointerMove(event), [])
  const onCardPointerEnd = useCallback((event: ReactPointerEvent<HTMLDivElement>, id: string) => latest.current.handlePointerEnd(event, id), [])
  const onCardKeyDown = useCallback((event: ReactKeyboardEvent<HTMLDivElement>, id: string) => latest.current.handleKeyDown(event, id), [])
  const deckRect = useCallback(() => latest.current.getDeckRect(), [])
  /** El lugar de la carta `index` en el abanico, en reposo: un poco más abajo y más inclinada cuanto más lejos del centro. */
  const restTransform = (index: number) => `translate3d(${slotLeft(layout, index)}px, ${TOP_ROOM + Math.abs(index - (count - 1) / 2) ** 2 * 1.6}px, 0) rotate(${fanAngle(index, count, fanDegrees)}deg)`

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
        // El lugar que le toca en el abanico; la carta arrastrada lo ignora (ver `HandCard`) y vuelve a él al soltarse.
        const transform = restTransform(index)
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
            glow={glowOf(card.id)}
            muted={muted}
            dim={dimUnlit && glowOf(card.id) === null}
            flash={flashing ? flash : null}
            targeted={targeted.has(card.id)}
            link={links?.get(card.id) ?? null}
            selected={selected}
            getDeckRect={deckRect}
            flyIn={dealsFromDeck ? dealsFromDeck(card.id) : true}
            containerRef={containerRef}
            onPointerDown={onCardPointerDown}
            onPointerMove={onCardPointerMove}
            onPointerEnd={onCardPointerEnd}
            onKeyDown={onCardKeyDown}
          />
        )
      })}
      {/* La insignia de la cadena, sobre el borde de arriba de su carta y con su mismo lugar en el abanico (la carta recorta lo que se sale). Van después de todas las cartas: no cambian su lugar entre hermanas. */}
      {links
        ? cards.map((card, index) => {
            const link = links.get(card.id)

            return link && draggedId !== card.id ? (
              <span key={`cl:${card.id}`} aria-hidden="true" className="pointer-events-none absolute left-0 top-0 z-60" style={{ width: layout.cardWidth, transform: restTransform(index) }}>
                <ChainBadge link={link} className="left-0 top-0" />
              </span>
            ) : null
          })
        : null}
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
  glow: GlowKind | null
  muted: boolean
  dim: boolean
  flash: { key: number; kind: SpotlightKind } | null
  targeted: boolean
  /** Sus eslabones en la cadena a la vista: van en su nombre (la insignia la dibuja la mano). */
  link: ChainBadgeData | null
  selected: boolean
  getDeckRect: () => DOMRect | null
  /** false: la carta llega de otro lado de la mesa (la trae el vuelo entre zonas), sin el reparto desde el mazo. */
  flyIn: boolean
  containerRef: React.RefObject<HTMLDivElement | null>
  /** Fijas (las arma `PracticeHand` una vez): reciben el id de la carta, así el `memo` de la carta no se rompe en cada render de la mano. */
  onPointerDown: (event: ReactPointerEvent<HTMLDivElement>, id: string) => void
  onPointerMove: (event: ReactPointerEvent<HTMLDivElement>) => void
  onPointerEnd: (event: ReactPointerEvent<HTMLDivElement>, id: string) => void
  onKeyDown: (event: ReactKeyboardEvent<HTMLDivElement>, id: string) => void
}

/** Una carta de la mano. Con `memo`: un toque (abrir su menú, el destello de otra) sólo redibuja las cartas cuyas props cambian. */
const HandCard = memo(function HandCard({
  card,
  layout,
  transform,
  zIndex,
  state,
  glow,
  muted,
  dim,
  flash,
  targeted,
  link,
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
    // Su lugar en el abanico (`restTransform`: `translate3d(x, y, 0) rotate(…)`); sin él, llega sin volar.
    const target = /translate3d\((-?[\d.]+(?:e[-+]?\d+)?)px, (-?[\d.]+(?:e[-+]?\d+)?)px/.exec(finalTransform)
    const fan = /rotate\((-?[\d.]+(?:e[-+]?\d+)?)deg\)/.exec(finalTransform)

    if (!target || !fan) {
      back.style.setProperty('display', 'none')
      return
    }

    const toX = Number(target[1])
    const toY = Number(target[2])
    const angle = Number(fan[1])
    // Del mazo a su lugar en el abanico por una curva baja, dándose vuelta en el camino, y un asentamiento corto. El camino y el giro 3D van en una sola animación (`dealFrames`).
    // Mientras tanto las demás cartas se corren para hacerle lugar (su transición de `transform`). Terminado se cancela (`cancelWhenDone`): si no, le sacaba a la GPU cada vez que el
    // abanico se abre o se cierra (`transform` de la carta).
    const flight = cancelWhenDone(element.animate(
      dealFrames({ x: fromX, y: fromY, rotate: -10, scale: startScale, opacity: 0.9 }, { x: toX, y: toY, rotate: angle, scale: 1, opacity: 1 }, 24),
      { duration: DEAL_MS, fill: 'backwards' },
    ))
    // La sombra crece al subir y baja al aterrizar: tres capas fijas (la de arriba, la del rebote y la que la carta tiene, con su aro si brilla) que se funden con `opacity`, que lo
    // compone la GPU (animar `box-shadow` corría en el hilo principal en cada cuadro). Mientras vuela la carta no recorta (`overflow`) y apaga su sombra; al llegar queda la suya.
    const own = getComputedStyle(element).boxShadow
    const shadows = dealShadows(own).map(({ shadow, frames }) => {
      const layer = document.createElement('span')
      layer.setAttribute('aria-hidden', 'true')
      layer.dataset.dealShadow = ''
      layer.style.cssText = `position:absolute;inset:0;pointer-events:none;opacity:0;box-shadow:${shadow}`
      element.append(layer)

      return { layer, animation: layer.animate(frames, { duration: DEAL_MS, fill: 'backwards' }) }
    })
    element.style.overflow = 'visible'
    element.style.boxShadow = 'none'
    // El dorso se cambia por la cara justo al quedar de canto, con el mismo reloj que el giro; al llegar se esconde (y su animación no queda colgada en la carta).
    const flip = back.animate([{ opacity: 1 }, { opacity: 1, offset: DEAL_EDGE_AT }, { opacity: 0, offset: DEAL_EDGE_AT }, { opacity: 0 }], { duration: DEAL_MS, fill: 'backwards' })
    const settle = () => {
      for (const { layer, animation } of shadows) {
        animation.cancel()
        layer.remove()
      }
      flip.cancel()
      back.style.setProperty('display', 'none')
      element.style.removeProperty('overflow')
      element.style.removeProperty('box-shadow')
    }
    flight.addEventListener?.('finish', settle)

    return () => {
      flight.cancel()
      settle()
    }
    // Sólo al montarse: reordenar o redimensionar no debe volver a repartir.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const frame = glowFrame(glow)
  const label = targeted ? t('practice.card.targeted', { name: card.name }) : card.name
  const style: CSSProperties = {
    width: layout.cardWidth,
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
      aria-label={link ? chainLinkLabel(label, link) : label}
      title={card.name}
      data-card-id={card.id}
      className={HAND_CARD}
      data-state={state}
      data-glow={glow ? 'true' : 'false'}
      data-glow-kind={glow ?? undefined}
      data-dim={dim ? 'true' : 'false'}
      data-muted={muted ? 'true' : 'false'}
      data-flash={flash ? 'true' : 'false'}
      data-flash-kind={flash?.kind}
      data-targeted={targeted ? 'true' : 'false'}
      data-selected={selected ? 'true' : 'false'}
      style={style}
      onPointerDown={(event) => onPointerDown(event, card.id)}
      onPointerMove={onPointerMove}
      onPointerUp={(event) => onPointerEnd(event, card.id)}
      onPointerCancel={(event) => onPointerEnd(event, card.id)}
      // Un puntero que se pierde sin avisar (el navegador del celular) corta el arrastre: no queda una zona encendida. Si se perdió porque la mano se reordenó, se retoma (`handlePointerEnd`).
      onLostPointerCapture={(event) => onPointerEnd(event, card.id)}
      onKeyDown={(event) => onKeyDown(event, card.id)}
      onContextMenu={(event) => event.preventDefault()}
    >
      <CardArt
        tilt
        remoteUrl={card.apiCard?.imageUrlSmall ?? card.apiCard?.imageUrl ?? null}
        name={card.name}
        className={cx('block h-full w-full bg-input object-cover', link?.voided && VOIDED_ART)}
        limitCard={card.apiCard}
        limitBadgeSize="sm"
      />
      <div ref={backRef} data-back className={CARD_BACK} aria-hidden="true" />
      {selected ? <FxFrame tone="cyan" /> : null}
      {frame ? <FxFrame tone={frame.tone} orbit={frame.orbit} /> : null}
      {flash && flash.kind !== 'target' ? <FxFrame key={flash.key} tone={SPOTLIGHT_TONE[flash.kind]} shine /> : null}
      {targeted ? <TargetMark /> : null}
    </div>
  )
})
