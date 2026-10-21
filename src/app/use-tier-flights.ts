import { useEffect, useLayoutEffect, useRef, type RefObject } from 'react'

import { EASE_IN_OUT, prefersReducedMotion } from './motion'
import type { MakerList } from './tierlist-maker'

/** Cuánto viaja una carta de una fila a otra en el creador de tier lists (con la curva de lo que viaja). Las filas que se corren viajan igual. */
export const TIER_FLIGHT_MS = 280
/** Más cartas que esto cambiando de lugar a la vez (un «Volver todo a Sin clasificar») no vuelan: cambian de una. */
export const TIER_FLIGHT_LIMIT = 24

export interface Point {
  x: number
  y: number
}

const ZERO: Point = { x: 0, y: 0 }

/** Un vuelo en marcha: arranca corrido (`dx`, `dy`) de su lugar y llega a él con la curva. `restore` deshace lo que se tocó para que la imagen se vea de una. */
interface Flight {
  animation: Animation
  dx: number
  dy: number
  restore: () => void
}

/**
 * Dónde queda una carta (o una fila) dentro del tablero, sin los corrimientos de los vuelos ni de las filas (`offsetLeft` y `offsetTop` no los miden). Cada `offsetParent` mide desde
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

/** Cuánto le falta a un vuelo para llegar: la curva ya avanzó, así que lo que cambia otra vez sigue desde donde se ve y no desde donde quedó su lugar anterior. */
function remaining({ animation, dx, dy }: Flight): Point {
  const progress = animation.effect?.getComputedTiming().progress
  const left = typeof progress === 'number' ? 1 - progress : 0

  return { x: dx * left, y: dy * left }
}

/** Las cartas del tablero por su id (`data-tier-card-id`), con el elemento que las dibuja. */
function cardsOf(board: HTMLElement): Array<[number, HTMLElement]> {
  return [...board.querySelectorAll<HTMLElement>('[data-tier-card-id]')].map((element) => [Number(element.dataset.tierCardId), element])
}

/** Las filas del tablero y lo que se corre con ellas (los botones de abajo, la bandeja), por su clave (`data-tier-row`). */
function rowsOf(board: HTMLElement): Array<[string, HTMLElement]> {
  return [...board.querySelectorAll<HTMLElement>('[data-tier-row]')].map((element) => [element.dataset.tierRow ?? '', element])
}

const rowOf = (element: HTMLElement): string | null => element.closest<HTMLElement>('[data-tier-row]')?.dataset.tierRow ?? null
const isMove = ({ x, y }: Point) => Math.abs(x) >= 1 || Math.abs(y) >= 1

function fly(element: HTMLElement, { x, y }: Point): Animation {
  return element.animate([{ transform: `translate(${x}px, ${y}px)` }, { transform: 'translate(0px, 0px)' }], { duration: TIER_FLIGHT_MS, easing: EASE_IN_OUT })
}

/**
 * Lo que cambia de lugar viaja desde donde estaba hasta su lugar nuevo (FLIP): una carta que cambia de fila (o de lugar dentro de su fila, o a la bandeja) y las que se corren porque otra
 * entró o salió, y **las filas** (`data-tier-row`) que se corren porque otra se movió, entró, salió o cambió de alto. Una carta viaja con su fila: sólo vuela lo que le falta además de lo que
 * la lleva su fila (si no, al mover una fila sus cartas harían el camino dos veces). Todo con `TIER_FLIGHT_MS` y `EASE_IN_OUT`, así el camino de una carta que cambia de fila mientras su
 * fila se corre sigue derecho. `lift` es dónde quedó cada fila al soltar un arrastre (lo escribe `useTierRowDrag`): la fila soltada vuela desde ahí y no desde su lugar de antes. Si cambian
 * de lugar más de `TIER_FLIGHT_LIMIT` cartas a la vez, o con movimiento reducido, todo cambia de una. Otra lista no vuela. Es sólo de presentación: no lee ni cambia la lista.
 */
export function useTierFlights(boardRef: RefObject<HTMLElement | null>, list: MakerList, lift?: RefObject<Map<string, Point> | null>): void {
  const cardPlaces = useRef(new Map<number, Point & { row: string | null }>())
  const rowPlaces = useRef(new Map<string, Point>())
  const cardFlights = useRef(new Map<number, Flight>())
  const rowFlights = useRef(new Map<string, Flight>())
  const listId = useRef<string | null>(null)

  useLayoutEffect(() => {
    const board = boardRef.current

    if (!board) return

    // Dónde se ve cada cosa respecto de su lugar: lo que le falta a su vuelo (se toma antes de cancelarlo) o, la fila que se soltó, dónde la dejó el arrastre.
    const restCards = new Map<number, Point>()
    const restRows = new Map<string, Point>(lift?.current ?? [])

    if (lift) lift.current = null

    for (const [id, flight] of cardFlights.current) {
      restCards.set(id, remaining(flight))
      flight.animation.cancel()
      flight.restore()
    }

    for (const [key, flight] of rowFlights.current) {
      if (!restRows.has(key)) restRows.set(key, remaining(flight))
      flight.animation.cancel()
    }

    cardFlights.current.clear()
    rowFlights.current.clear()

    const sameList = listId.current === list.id
    const nextRows = new Map<string, Point>()
    const movedRows: Array<{ key: string; element: HTMLElement; by: Point }> = []

    listId.current = list.id

    for (const [key, element] of rowsOf(board)) {
      const at = placeOf(element, board)
      const was = rowPlaces.current.get(key)
      const rest = restRows.get(key) ?? ZERO

      nextRows.set(key, at)

      if (!sameList || !was) continue

      const by = { x: was.x + rest.x - at.x, y: was.y + rest.y - at.y }

      if (isMove(by)) movedRows.push({ key, element, by })
    }

    const carried = new Map(movedRows.map(({ key, by }) => [key, by]))
    const nextCards = new Map<number, Point & { row: string | null }>()
    const movedCards: Array<{ id: number; element: HTMLElement; by: Point }> = []

    for (const [id, element] of cardsOf(board)) {
      const at = placeOf(element, board)
      const row = rowOf(element)
      const was = cardPlaces.current.get(id)

      nextCards.set(id, { ...at, row })

      if (!sameList || !was) continue

      // Desde donde se ve (su lugar, lo que le faltaba a su vuelo y lo que le faltaba a su fila) hasta su lugar nuevo, menos lo que la lleva su fila nueva.
      const own = restCards.get(id) ?? ZERO
      const ridden = (was.row === null ? undefined : restRows.get(was.row)) ?? ZERO
      const ride = (row === null ? undefined : carried.get(row)) ?? ZERO
      const by = { x: was.x + own.x + ridden.x - at.x - ride.x, y: was.y + own.y + ridden.y - at.y - ride.y }

      if (isMove(by)) movedCards.push({ id, element, by })
    }

    rowPlaces.current = nextRows
    cardPlaces.current = nextCards

    if (movedCards.length > TIER_FLIGHT_LIMIT || prefersReducedMotion()) return

    for (const { key, element, by } of movedRows) {
      if (typeof element.animate !== 'function') continue

      rowFlights.current.set(key, { animation: fly(element, by), dx: by.x, dy: by.y, restore: () => {} })
    }

    for (const { id, element, by } of movedCards) {
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

      const animation = fly(element, by)

      animation.onfinish = restore
      cardFlights.current.set(id, { animation, dx: by.x, dy: by.y, restore })
    }
    // Se mide con cada cambio de la lista; las funciones del tablero no hacen falta (los refs son estables).
  }, [boardRef, list, lift])

  useEffect(() => {
    const board = boardRef.current

    if (!board || typeof ResizeObserver === 'undefined') return

    // Si el tablero cambia de ancho (el menú lateral, el zoom, la ventana), todo se acomoda de otra forma sin una jugada: se mide de nuevo sin vuelo, así la próxima jugada parte de donde están.
    const observer = new ResizeObserver(() => {
      rowPlaces.current = new Map(rowsOf(board).map(([key, element]) => [key, placeOf(element, board)]))
      cardPlaces.current = new Map(cardsOf(board).map(([id, element]) => [id, { ...placeOf(element, board), row: rowOf(element) }]))
    })

    observer.observe(board)

    return () => observer.disconnect()
  }, [boardRef])
}
