import { useEffect, useLayoutEffect, useRef, useState, type PointerEvent as ReactPointerEvent, type RefObject } from 'react'
import { flushSync } from 'react-dom'

import { useShellInsets } from './shell-layout'
import type { MakerCard, Place } from './tierlist-maker'
import { MOUSE_DRAG_THRESHOLD_PX, TOUCH_DRAG_DELAY_MS, TOUCH_SCROLL_SLOP_PX, findScrollParent } from './use-deck-pointer-drag'
import { scrollNearEdge } from './use-tier-row-drag'

/** La clave de la bandeja de «Sin clasificar» en el tablero (cada fila usa el id de su fila). */
export const POOL_KEY = 'pool'

/** Un rectángulo medido desde la esquina de arriba a la izquierda del tablero. */
export interface Box {
  left: number
  top: number
  right: number
  bottom: number
}

/** Una fila del tablero (o la bandeja) donde se puede soltar una carta: toda su caja (el recuadro de color, las cartas y la columna del final) y la de cada carta, en orden. */
export interface DropZone {
  key: string
  box: Box
  cards: ReadonlyArray<{ id: number; box: Box }>
}

/** Dónde caería la carta: la fila (`key`), el lugar entre sus cartas (0 es antes de la primera) y la línea que lo marca (en una fila vacía no hay: ahí lo dice el aro de la fila). */
export interface CardDrop {
  key: string
  index: number
  line: { x: number; top: number; height: number } | null
}

/**
 * Dónde cae una carta soltada en (`x`, `y`), con las cajas medidas al levantarla. La fila es la que está bajo el puntero (fuera de todas, ninguna). Las cartas de una fila van en renglones: primero
 * se elige el renglón (el último que arranca más arriba que el puntero) y, en él, el lugar: antes de la primera carta cuyo centro queda a la derecha del puntero o, si no hay, después de la última
 * del renglón (así, a la derecha de la última de la fila, va al final). La línea va en el medio del hueco entre dos cartas, o pegada a la carta de la punta. Pura.
 */
export function cardDropAt(zones: readonly DropZone[], x: number, y: number): CardDrop | null {
  const zone = zones.find(({ box }) => x >= box.left && x <= box.right && y >= box.top && y <= box.bottom)

  if (!zone) return null

  // Un renglón nuevo arranca donde una carta queda más abajo que la primera del renglón anterior.
  const lines: Array<{ start: number; cards: Array<{ id: number; box: Box }> }> = []

  zone.cards.forEach((card, index) => {
    const line = lines.at(-1)

    if (line && card.box.top <= (line.cards[0]?.box.top ?? 0) + 1) line.cards.push(card)
    else lines.push({ start: index, cards: [card] })
  })

  const line = lines.findLast((candidate) => (candidate.cards[0]?.box.top ?? 0) <= y) ?? lines[0]

  if (!line) return { key: zone.key, index: 0, line: null }

  const found = line.cards.findIndex(({ box }) => x < (box.left + box.right) / 2)
  const offset = found === -1 ? line.cards.length : found
  const next = line.cards[offset]
  const previous = line.cards[offset - 1]
  const anchor = next ?? previous

  if (!anchor) return { key: zone.key, index: line.start, line: null }

  const at = next && previous ? (previous.box.right + next.box.left) / 2 : next ? next.box.left : anchor.box.right

  return { key: zone.key, index: line.start + offset, line: { x: at, top: anchor.box.top, height: anchor.box.bottom - anchor.box.top } }
}

/** Las filas del tablero donde se puede soltar (`data-tier-drop`) con sus cartas (`data-tier-card-id`), medidas desde el tablero: así sirven aunque la página se desplace mientras se arrastra. */
function measureZones(board: HTMLElement): DropZone[] {
  const origin = board.getBoundingClientRect()
  const boxOf = (element: Element): Box => {
    const rect = element.getBoundingClientRect()

    return { left: rect.left - origin.left, top: rect.top - origin.top, right: rect.right - origin.left, bottom: rect.bottom - origin.top }
  }

  return [...board.querySelectorAll<HTMLElement>('[data-tier-drop]')].map((zone) => ({
    key: zone.dataset.tierDrop ?? '',
    box: boxOf(zone),
    cards: [...zone.querySelectorAll<HTMLElement>('[data-tier-card-id]')].map((card) => ({ id: Number(card.dataset.tierCardId), box: boxOf(card) })),
  }))
}

/** La carta que se arrastra, para dibujar su fantasma (del tamaño de la carta). */
export interface TierCardGhost {
  card: MakerCard
  width: number
  height: number
}

interface Session {
  card: MakerCard
  pointerId: number
  source: HTMLElement
  /** Con el dedo, ya se la mantuvo apretada lo suficiente; con el mouse o el lápiz, desde el principio. */
  armed: boolean
  /** Levantada: hay fantasma y se busca dónde cae. */
  dragging: boolean
  /** Se movió desde que se la levantó: mantenerla apretada sin moverla y soltarla no la cambia de lugar. */
  moved: boolean
  /** Escape: ya no cae en ningún lado, y el clic de cuando se suelte el botón no la elige. */
  canceled: boolean
  startX: number
  startY: number
  x: number
  y: number
  /** Desde dónde se la agarró (el fantasma queda con el puntero ahí). */
  grabX: number
  grabY: number
  width: number
  height: number
  zones: DropZone[]
  /** Dónde está ella: soltarla ahí (sobre ella o en el hueco de al lado) no la mueve. */
  from: { key: string; index: number } | null
  scroller: HTMLElement
  /** Lo que tapa el armazón abajo (la barra del celular): ahí cerca ya se desplaza la página. */
  bottomInset: number
  frame: number
  timer: number
  stop: () => void
}

/** Dónde caería la carta con el puntero en (`x`, `y`) de la ventana: la fila de abajo (`over`, la que se resalta) y el lugar (`drop`), que es `null` si es su propio lugar. */
function aim(current: Session, origin: DOMRect, x: number, y: number): { over: string | null; drop: CardDrop | null } {
  const drop = cardDropAt(current.zones, x - origin.left, y - origin.top)
  const own = current.from
  const still = drop !== null && own !== null && drop.key === own.key && (drop.index === own.index || drop.index === own.index + 1)

  return { over: drop?.key ?? null, drop: still ? null : drop }
}

/** Un cuadro del arrastre: el fantasma bajo el puntero y la línea donde entraría la carta (o nada). Sólo escribe estilos, con las cajas ya medidas; devuelve la fila que se resalta. */
function paint(current: Session, board: HTMLElement, ghost: HTMLElement | null, line: HTMLElement | null): string | null {
  const origin = board.getBoundingClientRect()
  const { over, drop } = aim(current, origin, current.x, current.y)
  const mark = drop?.line

  if (ghost) ghost.style.transform = `translate3d(${current.x - current.grabX}px, ${current.y - current.grabY}px, 0)`

  if (line) {
    line.hidden = !mark

    if (mark) {
      line.style.transform = `translate3d(${origin.left + mark.x}px, ${origin.top + mark.top}px, 0)`
      line.style.height = `${mark.height}px`
    }
  }

  return over
}

/**
 * Arrastrar y soltar una carta del creador de tier lists, como en el builder (`useDeckPointerDrag`, con sus mismos umbrales): con el mouse o el lápiz la carta se levanta al moverla 6 px; con el
 * dedo, al mantenerla apretada 350 ms sin moverla (si el dedo se desliza antes, se desplaza la página). Levantada, un fantasma sigue al puntero (`ghost`, `ghostRef`), la fila de abajo se resalta
 * (`over`) y una línea ámbar marca dónde entra (`lineRef`); cerca del borde, la página se desplaza sola. Al soltarla en otro lugar, `onMove` la lleva ahí, antes de la carta que ocupa ese lugar (al
 * final si no hay); en su propio lugar, fuera del tablero o con Escape, no pasa nada. Las cajas se miden una vez al levantarla (y otra si cambia la ventana) y cada cuadro sólo escribe estilos:
 * React vuelve a dibujar el tablero al levantarla, al soltarla y cuando cambia la fila de abajo. El clic que deja un arrastre no elige la carta (`consumeClick`). Es de presentación: el lugar
 * nuevo lo decide quien recibe `onMove`.
 */
export function useTierCardDrag(boardRef: RefObject<HTMLElement | null>, onMove: (cardId: number, to: Place, before?: number) => void) {
  const session = useRef<Session | null>(null)
  const suppressClick = useRef(false)
  const ghostRef = useRef<HTMLDivElement>(null)
  const lineRef = useRef<HTMLDivElement>(null)
  const [ghost, setGhost] = useState<TierCardGhost | null>(null)
  const [over, setOver] = useState<string | null>(null)
  const { bottom } = useShellInsets()

  // El fantasma recién montado se pone bajo el puntero antes de dibujarse: si no, se vería un cuadro en la esquina de la ventana.
  useLayoutEffect(() => {
    const current = session.current
    const board = boardRef.current

    if (ghost && current && board) setOver(paint(current, board, ghostRef.current, lineRef.current))
  }, [ghost, boardRef])

  useEffect(() => () => session.current?.stop(), [])

  /** Cada cuadro, mientras está levantada: cerca del borde la página se desplaza, y lo que se ve sigue al puntero aunque se mueva la página y no él (la rueda, el auto-desplazamiento). */
  const tick = () => {
    const current = session.current
    const board = boardRef.current

    if (!current?.dragging || current.canceled || !board) return

    scrollNearEdge(current.scroller, current.y, current.bottomInset)
    setOver(paint(current, board, ghostRef.current, lineRef.current))
    current.frame = requestAnimationFrame(tick)
  }

  const begin = (current: Session) => {
    const board = boardRef.current

    if (!board) return

    const zones = measureZones(board)
    const own = zones.map((zone) => ({ key: zone.key, index: zone.cards.findIndex((card) => card.id === current.card.id) })).find(({ index }) => index !== -1)

    current.dragging = true
    current.zones = zones
    current.from = own ?? null
    current.scroller = findScrollParent(board)
    suppressClick.current = true
    setGhost({ card: current.card, width: current.width, height: current.height })
    current.frame = requestAnimationFrame(tick)
  }

  /** En el `pointerdown` de la carta. El botón derecho no arrastra (saca la carta: lo hace su `contextmenu`). */
  const start = (event: ReactPointerEvent<HTMLElement>, card: MakerCard) => {
    if (session.current || event.button !== 0) return

    const source = event.currentTarget
    const rect = source.getBoundingClientRect()
    const touch = event.pointerType === 'touch'
    const current: Session = {
      card,
      pointerId: event.pointerId,
      source,
      armed: !touch,
      dragging: false,
      moved: false,
      canceled: false,
      startX: event.clientX,
      startY: event.clientY,
      x: event.clientX,
      y: event.clientY,
      grabX: event.clientX - rect.left,
      grabY: event.clientY - rect.top,
      width: rect.width,
      height: rect.height,
      zones: [],
      from: null,
      scroller: document.documentElement,
      bottomInset: bottom,
      frame: 0,
      timer: 0,
      stop: () => {},
    }

    const end = (drop: boolean, x = current.x, y = current.y) => {
      if (session.current !== current) return

      session.current = null
      current.stop()

      if (!current.dragging) return

      // El clic que manda el navegador al soltar no elige la carta (lo consume `consumeClick`); si no llega, se olvida apenas termina este evento.
      window.setTimeout(() => {
        suppressClick.current = false
      }, 0)

      const board = boardRef.current
      const target = drop && current.moved && !current.canceled && board ? aim(current, board.getBoundingClientRect(), x, y).drop : null
      const before = target ? current.zones.find((zone) => zone.key === target.key)?.cards[target.index]?.id : undefined

      // De una: la carta aparece en su lugar nuevo en el mismo cuadro en que se va el fantasma.
      flushSync(() => {
        if (target) onMove(current.card.id, target.key === POOL_KEY ? { kind: 'pool' } : { kind: 'tier', id: target.key }, before)

        setGhost(null)
        setOver(null)
      })
    }

    const move = (moveEvent: PointerEvent) => {
      if (moveEvent.pointerId !== current.pointerId || current.canceled) return

      const distance = Math.hypot(moveEvent.clientX - current.startX, moveEvent.clientY - current.startY)

      if (!current.armed) {
        // El dedo se movió antes de tiempo: es un desplazamiento de la página, no un arrastre.
        if (distance > TOUCH_SCROLL_SLOP_PX) end(false)

        return
      }

      current.x = moveEvent.clientX
      current.y = moveEvent.clientY

      if (!current.dragging) {
        if (distance < MOUSE_DRAG_THRESHOLD_PX) return

        begin(current)
      }

      if (distance >= MOUSE_DRAG_THRESHOLD_PX) current.moved = true
      if (moveEvent.cancelable) moveEvent.preventDefault()
    }
    const up = (upEvent: PointerEvent) => {
      if (upEvent.pointerId === current.pointerId) end(true, upEvent.clientX, upEvent.clientY)
    }
    const cancel = (cancelEvent: PointerEvent) => {
      if (cancelEvent.pointerId === current.pointerId) end(false)
    }
    const stopped = () => end(false)
    // `lostpointercapture` sube desde adentro: sólo cuenta cuando la pierde la carta misma.
    const lost = (lostEvent: Event) => {
      if (lostEvent.target === source) end(false)
    }
    const escape = (keyEvent: KeyboardEvent) => {
      if (keyEvent.key !== 'Escape' || !current.dragging || current.canceled) return

      keyEvent.preventDefault()
      current.canceled = true
      cancelAnimationFrame(current.frame)
      setGhost(null)
      setOver(null)
    }
    // Levantada con el dedo, la página no se desplaza (el arrastre se queda con el dedo). Como en el builder, se escucha desde que se aprieta: el navegador lo vuelve a mirar en el primer
    // `touchmove` y lo deja cancelar, y mientras no se arrastra nada no hace esperar al desplazamiento de la página.
    const holdPage = (touchEvent: TouchEvent) => {
      if (current.armed && touchEvent.cancelable) touchEvent.preventDefault()
    }
    const remeasure = () => {
      const board = boardRef.current

      if (board && current.dragging) current.zones = measureZones(board)
    }

    current.stop = () => {
      window.removeEventListener('pointermove', move)
      window.removeEventListener('pointerup', up)
      window.removeEventListener('pointercancel', cancel)
      window.removeEventListener('keydown', escape)
      window.removeEventListener('blur', stopped)
      window.removeEventListener('resize', remeasure)
      window.removeEventListener('touchmove', holdPage)
      source.removeEventListener('lostpointercapture', lost)
      window.clearTimeout(current.timer)
      cancelAnimationFrame(current.frame)
      delete source.dataset.dragArmed

      try {
        if (source.hasPointerCapture(current.pointerId)) source.releasePointerCapture(current.pointerId)
      } catch {
        // No había captura que soltar.
      }
    }

    try {
      source.setPointerCapture(event.pointerId)
    } catch {
      // Un puntero que ya no está (o un navegador que no captura): el arrastre sigue por la ventana.
    }

    if (touch) {
      current.timer = window.setTimeout(() => {
        if (session.current !== current) return

        // Como en el builder: la carta late una vez (`data-drag-armed`) y el teléfono vibra apenas, para avisar que ya se la puede llevar.
        current.armed = true
        source.dataset.dragArmed = 'true'
        navigator.vibrate?.(12)
        begin(current)
      }, TOUCH_DRAG_DELAY_MS)
    }

    window.addEventListener('pointermove', move, { passive: false })
    window.addEventListener('pointerup', up)
    window.addEventListener('pointercancel', cancel)
    window.addEventListener('keydown', escape)
    window.addEventListener('blur', stopped)
    window.addEventListener('resize', remeasure, { passive: true })
    window.addEventListener('touchmove', holdPage, { passive: false })
    source.addEventListener('lostpointercapture', lost)
    session.current = current
  }

  /** En el `click` de la carta: `true` si lo dejó un arrastre (entonces no la elige). */
  const consumeClick = () => {
    const suppressed = suppressClick.current

    suppressClick.current = false

    return suppressed
  }

  return { ghost, over, ghostRef, lineRef, start, consumeClick }
}
