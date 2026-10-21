import { useEffect, useLayoutEffect, useRef, type RefObject } from 'react'

import { EASE_IN_OUT, prefersReducedMotion } from './motion'
import type { MakerList } from './tierlist-maker'

/** Cuánto viaja una carta de una fila a otra en el creador de tier lists (con la curva de lo que viaja). */
export const TIER_FLIGHT_MS = 280
/** Más cartas que esto cambiando de lugar a la vez (un «Volver todo a Sin clasificar») no vuelan: cambian de una. */
export const TIER_FLIGHT_LIMIT = 24

interface Point {
  x: number
  y: number
}

/** Un vuelo en marcha: la carta arranca corrida (`dx`, `dy`) de su lugar y llega a él con la curva. `restore` deshace lo que se tocó para que la imagen se vea de una. */
interface Flight {
  animation: Animation
  dx: number
  dy: number
  restore: () => void
}

/**
 * Dónde queda una carta dentro del tablero, sin los corrimientos de los vuelos ni de las filas (`offsetLeft` y `offsetTop` no los miden). Cada `offsetParent` mide desde
 * su propio borde, y no siempre es el tablero: una fila o la bandeja que todavía entra (`stagger`, con `transform`) es el suyo. Por eso se suma hasta llegar al tablero.
 */
function placeOf(element: HTMLElement, board: HTMLElement): Point {
  let x = 0
  let y = 0
  let node: HTMLElement | null = element

  while (node && node !== board) {
    x += node.offsetLeft
    y += node.offsetTop
    node = node.offsetParent as HTMLElement | null
  }

  return { x, y }
}

/** Cuánto le falta a un vuelo para llegar: la curva ya avanzó, así que una carta que cambia otra vez sigue desde donde se ve y no desde donde quedó su lugar anterior. */
function remaining({ animation, dx, dy }: Flight): Point {
  const progress = animation.effect?.getComputedTiming().progress
  const left = typeof progress === 'number' ? 1 - progress : 0

  return { x: dx * left, y: dy * left }
}

/** Las cartas del tablero por su id (`data-tier-card-id`), con el elemento que las dibuja. */
function cardsOf(board: HTMLElement): Array<[number, HTMLElement]> {
  return [...board.querySelectorAll<HTMLElement>('[data-tier-card-id]')].map((element) => [Number(element.dataset.tierCardId), element])
}

/**
 * Una carta que cambia de fila (o de lugar dentro de su fila, o a la bandeja) viaja desde donde estaba hasta su lugar nuevo, y las que se corren porque otra entró o salió
 * también (FLIP). `places` guarda dónde quedó cada una la última vez que el tablero estuvo quieto: después de cada cambio se mide de nuevo y lo que cambió de lugar arranca
 * corrido y llega a 0 en `TIER_FLIGHT_MS`, con `EASE_IN_OUT`. Si cambian más de `TIER_FLIGHT_LIMIT` a la vez, o con movimiento reducido, cambian de una. Otra lista no vuela.
 * Es sólo de presentación: no lee ni cambia la lista, y no guarda nada.
 */
export function useTierFlights(boardRef: RefObject<HTMLElement | null>, list: MakerList): void {
  const places = useRef(new Map<number, Point>())
  const flights = useRef(new Map<number, Flight>())
  const listId = useRef<string | null>(null)

  useLayoutEffect(() => {
    const board = boardRef.current

    if (!board) return

    // Lo que le falta a cada vuelo en marcha se toma antes de cancelarlo: una carta que se mueve otra vez arranca de donde se ve.
    const rest = new Map<number, Point>()

    for (const [id, flight] of flights.current) {
      rest.set(id, remaining(flight))
      flight.animation.cancel()
      flight.restore()
    }

    flights.current.clear()

    const sameList = listId.current === list.id
    const next = new Map<number, Point>()
    const moved: Array<{ id: number; element: HTMLElement; dx: number; dy: number }> = []

    listId.current = list.id

    for (const [id, element] of cardsOf(board)) {
      const at = placeOf(element, board)
      const was = places.current.get(id)

      next.set(id, at)

      if (!sameList || !was) continue

      const dx = was.x + (rest.get(id)?.x ?? 0) - at.x
      const dy = was.y + (rest.get(id)?.y ?? 0) - at.y

      if (Math.abs(dx) >= 1 || Math.abs(dy) >= 1) moved.push({ id, element, dx, dy })
    }

    places.current = next

    if (moved.length > TIER_FLIGHT_LIMIT || prefersReducedMotion()) return

    for (const { id, element, dx, dy } of moved) {
      if (typeof element.animate !== 'function') continue

      // React monta de nuevo a la carta que cambia de fila: su imagen arranca transparente y se funde al cargar, y eso se vería en pleno vuelo. Como con `loading="lazy"`
      // no se pide mientras está fuera de la pantalla (la bandeja suele estar abajo), se pide ya y se muestra de una.
      const images = [...element.querySelectorAll<HTMLImageElement>('img')]
      const restore = () => {
        for (const image of images) image.style.transition = ''
      }

      for (const image of images) {
        image.style.transition = 'none'
        image.loading = 'eager'
      }

      const animation = element.animate([{ transform: `translate(${dx}px, ${dy}px)` }, { transform: 'translate(0px, 0px)' }], { duration: TIER_FLIGHT_MS, easing: EASE_IN_OUT })

      animation.onfinish = restore
      flights.current.set(id, { animation, dx, dy, restore })
    }
    // Se mide con cada cambio de la lista; las funciones del tablero no hacen falta (los refs son estables).
  }, [boardRef, list])

  useEffect(() => {
    const board = boardRef.current

    if (!board || typeof ResizeObserver === 'undefined') return

    // Si el tablero cambia de ancho (el menú lateral, el zoom, la ventana), las cartas se acomodan de otra forma sin una jugada: se mide de nuevo sin vuelo, así la próxima jugada parte de donde están.
    const observer = new ResizeObserver(() => {
      places.current = new Map(cardsOf(board).map(([id, element]) => [id, placeOf(element, board)]))
    })

    observer.observe(board)

    return () => observer.disconnect()
  }, [boardRef])
}
