import { useEffect, useRef, useState, type KeyboardEvent, type MouseEvent, type PointerEvent, type RefObject } from 'react'

import { prefersReducedMotion } from './motion'
import { useShellInsets } from './shell-layout'
import { findScrollParent, getAutoScrollStep } from './use-deck-pointer-drag'
import type { Point } from './use-tier-flights'

/** Cuánto hay que mover el puntero para que el agarre levante la fila: un clic o un toque sin moverse no la mueven. */
const LIFT_THRESHOLD_PX = 4
/** Lo que tardan las demás filas en correrse para dejarle el hueco a la que se arrastra (con la curva de lo que viaja). */
export const ROW_SHIFT_MS = 200
const SHIFT_TRANSITION = `transform ${ROW_SHIFT_MS}ms var(--ease-in-out)`

/** Una fila del tablero: dónde arranca (desde arriba del tablero) y cuánto mide. */
export interface RowBox {
  top: number
  height: number
}

/** El lugar nuevo de la fila `from` si su borde de arriba queda en `top`: va después de cada una de las demás cuyo centro quedó más arriba que el suyo. Puro. */
export function rowDropIndex(rows: readonly RowBox[], from: number, top: number): number {
  const own = rows[from]

  if (!own) return from

  const center = top + own.height / 2

  return rows.filter((row, index) => index !== from && row.top + row.height / 2 < center).length
}

/** Cuánto se corre cada fila para dejarle el hueco a la que va de `from` a `to`: las del medio, lo que mide ella más el aire entre filas (hacia arriba si baja, hacia abajo si sube). Puro. */
export function rowShifts(rows: readonly RowBox[], from: number, to: number, gap: number): number[] {
  const step = (rows[from]?.height ?? 0) + gap

  return rows.map((_, index) => (from < index && index <= to ? -step : to <= index && index < from ? step : 0))
}

interface Session {
  id: string
  /** Las filas en el orden en que estaban al agarrar (el de `rows` y `elements`). */
  order: string[]
  from: number
  pointerId: number
  startY: number
  lastY: number
  /** A qué altura de la fila se la agarró: mientras se arrastra, el puntero queda siempre ahí. */
  grab: number
  rows: RowBox[]
  gap: number
  elements: HTMLElement[]
  lifted: boolean
  top: number
  to: number
  frame: number
  scroller: HTMLElement
  /** Lo que tapa el armazón abajo (la barra del celular): ahí cerca ya se desplaza la página. */
  bottomInset: number
}

interface TierRowDragOptions {
  /** Las filas, en orden (el `data-tier-row` de cada una). */
  ids: readonly string[]
  /** La lleva a su lugar nuevo: al soltarla, o con ↑ y ↓ en el agarre. */
  onMove: (id: string, index: number) => void
  /** Dónde quedó cada fila al soltar, para que viaje a su lugar desde ahí (lo lee `useTierFlights`). */
  lift: RefObject<Map<string, Point> | null>
}

/**
 * Arrastrar una fila entera por su agarre, con el mouse, con el dedo o con el teclado. Va con Pointer Events y no con el arrastre del navegador (HTML5), que no anda con el dedo y es el de las
 * cartas: así soltar una fila nunca mueve una carta ni al revés. Al tocar el agarre (que es `touch-none`: el resto de la fila sigue desplazando la página) la fila se levanta y sigue al
 * puntero; las demás se corren para dejarle el hueco donde va a caer (ése es el lugar de destino), y cerca del borde de arriba o de abajo la página se desplaza sola. Al soltarla se reordena
 * la lista y la fila viaja del puntero a su lugar (`useTierFlights`, con `lift`); si se cancela, o cae donde estaba, vuelve a su lugar. Con ↑ y ↓ en el agarre se mueve de a un lugar.
 * Con movimiento reducido no hay transiciones. Es de presentación: el orden nuevo lo decide quien recibe `onMove`.
 */
export function useTierRowDrag(boardRef: RefObject<HTMLElement | null>, { ids, onMove, lift }: TierRowDragOptions) {
  const session = useRef<Session | null>(null)
  const [draggingId, setDraggingId] = useState<string | null>(null)
  const { bottom } = useShellInsets()

  useEffect(
    () => () => {
      if (session.current) cancelAnimationFrame(session.current.frame)
    },
    [],
  )

  /** Pone la fila levantada donde está el puntero (sin salirse de la lista) y corre a las demás si cambió el lugar donde caería. */
  const place = (current: Session) => {
    const board = boardRef.current
    const first = current.rows[0]
    const last = current.rows.at(-1)
    const own = current.rows[current.from]

    if (!board || !first || !last || !own) return

    const top = Math.min(Math.max(current.lastY - board.getBoundingClientRect().top - current.grab, first.top), last.top + last.height - own.height)
    const to = rowDropIndex(current.rows, current.from, top)
    const lifted = current.elements[current.from]

    current.top = top
    if (lifted) lifted.style.transform = `translateY(${top - own.top}px)`

    if (to === current.to) return

    const shifts = rowShifts(current.rows, current.from, to, current.gap)

    current.to = to
    current.elements.forEach((element, index) => {
      if (index !== current.from) element.style.transform = shifts[index] ? `translateY(${shifts[index]}px)` : ''
    })
  }

  /** Cada cuadro, mientras la fila está levantada: cerca del borde la página se desplaza, y la fila sigue al puntero aunque la página se mueva sin que se mueva él (la rueda, el auto-desplazamiento). */
  const tick = () => {
    const current = session.current

    if (!current?.lifted) return

    const page = current.scroller === document.scrollingElement || current.scroller === document.documentElement
    const edges = page ? { top: 0, bottom: window.innerHeight - current.bottomInset } : current.scroller.getBoundingClientRect()
    const step = getAutoScrollStep(current.lastY, edges.top, edges.bottom)

    if (step !== 0) current.scroller.scrollBy(0, step)

    place(current)
    current.frame = requestAnimationFrame(tick)
  }

  const finish = (drop: boolean) => {
    const current = session.current

    if (!current) return

    session.current = null
    cancelAnimationFrame(current.frame)

    if (!current.lifted) return

    const moved = drop && current.to !== current.from
    const glide = !moved && !prefersReducedMotion()

    if (moved) {
      const shifts = rowShifts(current.rows, current.from, current.to, current.gap)

      lift.current = new Map(current.order.map((id, index) => [id, { x: 0, y: index === current.from ? current.top - (current.rows[index]?.top ?? 0) : (shifts[index] ?? 0) }]))
    }

    current.elements.forEach((element) => {
      // Soltada en otro lugar: el vuelo desde donde quedó lo hace `useTierFlights`. Si no, todo vuelve a su lugar con la transición (sin ella, de una).
      element.style.transition = glide ? SHIFT_TRANSITION : ''
      element.style.transform = ''
    })
    setDraggingId(null)

    if (moved) onMove(current.id, current.to)
  }

  const gripProps = (id: string, index: number) => ({
    onPointerDown: (event: PointerEvent<HTMLElement>) => {
      const board = boardRef.current

      if (!board || session.current || (event.pointerType === 'mouse' && event.button !== 0)) return

      const byId = new Map([...board.querySelectorAll<HTMLElement>('[data-tier-row]')].map((element) => [element.dataset.tierRow, element]))
      const elements = ids.map((key) => byId.get(key)).filter((element): element is HTMLElement => Boolean(element))
      const rows = elements.map((element) => ({ top: element.offsetTop, height: element.offsetHeight }))
      const own = rows[index]
      const [first, second] = rows

      if (elements.length !== ids.length || !own || !first) return

      event.currentTarget.setPointerCapture(event.pointerId)
      session.current = {
        id,
        order: [...ids],
        from: index,
        pointerId: event.pointerId,
        startY: event.clientY,
        lastY: event.clientY,
        grab: event.clientY - board.getBoundingClientRect().top - own.top,
        rows,
        gap: second ? second.top - first.top - first.height : 0,
        elements,
        lifted: false,
        top: own.top,
        to: index,
        frame: 0,
        scroller: findScrollParent(board),
        bottomInset: bottom,
      }
    },
    onPointerMove: (event: PointerEvent<HTMLElement>) => {
      const current = session.current

      if (current?.pointerId !== event.pointerId) return

      current.lastY = event.clientY

      if (!current.lifted) {
        if (Math.abs(event.clientY - current.startY) < LIFT_THRESHOLD_PX) return

        // Las demás filas se corren con una transición; la que se arrastra sigue al puntero sin demora.
        const shift = prefersReducedMotion() ? '' : SHIFT_TRANSITION

        current.lifted = true
        current.elements.forEach((element, at) => {
          element.style.transition = at === current.from ? '' : shift
        })
        setDraggingId(current.id)
        current.frame = requestAnimationFrame(tick)
      }

      place(current)
    },
    onPointerUp: (event: PointerEvent<HTMLElement>) => {
      if (session.current?.pointerId === event.pointerId) finish(true)
    },
    onPointerCancel: (event: PointerEvent<HTMLElement>) => {
      if (session.current?.pointerId === event.pointerId) finish(false)
    },
    onLostPointerCapture: (event: PointerEvent<HTMLElement>) => {
      if (session.current?.pointerId === event.pointerId) finish(false)
    },
    // El toque largo de Android abre el menú del navegador (y corta el arrastre): en el agarre no hace falta.
    onContextMenu: (event: MouseEvent<HTMLElement>) => event.preventDefault(),
    onKeyDown: (event: KeyboardEvent<HTMLElement>) => {
      const step = event.key === 'ArrowUp' ? -1 : event.key === 'ArrowDown' ? 1 : 0

      if (step === 0) return

      // Las flechas no desplazan la página: mueven la fila (en las puntas, nada).
      event.preventDefault()

      const to = index + step

      if (!session.current && to >= 0 && to < ids.length) onMove(id, to)
    },
  })

  return { draggingId, gripProps }
}
