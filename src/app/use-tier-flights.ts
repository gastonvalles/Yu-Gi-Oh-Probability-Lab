import { useEffect, useLayoutEffect, useRef, type RefObject } from 'react'

import { EASE_IN_OUT, prefersReducedMotion } from './motion'
import type { MakerList } from './tierlist-maker'

/** Cuánto viaja una fila del creador de tier lists hasta su lugar nuevo al reordenar las filas (con la curva de lo que viaja). */
export const TIER_FLIGHT_MS = 280

export interface Point {
  x: number
  y: number
}

const ZERO: Point = { x: 0, y: 0 }

/** Un vuelo en marcha: arranca corrido (`dx`, `dy`) de su lugar y llega a él con la curva. */
interface Flight {
  animation: Animation
  dx: number
  dy: number
}

/** Cuánto le falta a un vuelo para llegar: la curva ya avanzó, así que la fila que cambia otra vez sigue desde donde se ve y no desde donde quedó su lugar anterior. */
function remaining({ animation, dx, dy }: Flight): Point {
  const progress = animation.effect?.getComputedTiming().progress
  const left = typeof progress === 'number' ? 1 - progress : 0

  return { x: dx * left, y: dy * left }
}

/**
 * Las filas del tablero y lo que se corre con ellas (los botones de abajo, la bandeja), por su clave (`data-tier-row`), con dónde están. Cada caja es hija del tablero (`relative`), así que
 * `offsetLeft` y `offsetTop` la miden desde él, sin los corrimientos de los vuelos ni de un arrastre (van por `transform`).
 */
function rowsOf(board: HTMLElement): Array<[string, HTMLElement, Point]> {
  return [...board.querySelectorAll<HTMLElement>('[data-tier-row]')].map((element) => [element.dataset.tierRow ?? '', element, { x: element.offsetLeft, y: element.offsetTop }])
}

/** ¿Son las mismas filas en otro orden? Agregar o quitar una fila no es reordenar. */
const isReorder = (before: readonly string[], after: readonly string[]) => before.length === after.length && before.join() !== after.join() && before.every((id) => after.includes(id))

function fly(element: HTMLElement, { x, y }: Point): Animation {
  return element.animate([{ transform: `translate(${x}px, ${y}px)` }, { transform: 'translate(0px, 0px)' }], { duration: TIER_FLIGHT_MS, easing: EASE_IN_OUT })
}

/**
 * Al **reordenar las filas** (soltando una que se arrastró por su agarre, o con ↑ y ↓) cada caja que cambió de lugar (`data-tier-row`) viaja desde donde estaba hasta el lugar nuevo (FLIP),
 * con `TIER_FLIGHT_MS` y `EASE_IN_OUT`, y sus cartas van con ella. Nada más vuela (Gastón, 2026-10-22: no le gustaba el vuelo de las cartas): una carta que cambia de lugar —arrastrándola, con
 * la barra de abajo, el clic derecho o «Volver todo a Sin clasificar»— aparece de una en el nuevo, y las filas que se corren porque una carta entró o salió, o porque se agregó o se quitó una
 * fila, también cambian de una. `lift` es dónde quedó cada fila al soltar un arrastre (lo escribe `useTierRowDrag`): la fila soltada vuela desde ahí y no desde su lugar de antes. Con
 * movimiento reducido, o al cambiar de lista, nada vuela. Es sólo de presentación: no lee ni cambia la lista.
 */
export function useTierFlights(boardRef: RefObject<HTMLElement | null>, list: MakerList, lift?: RefObject<Map<string, Point> | null>): void {
  const places = useRef(new Map<string, Point>())
  const flights = useRef(new Map<string, Flight>())
  const shown = useRef<{ id: string; tiers: string[] } | null>(null)

  useLayoutEffect(() => {
    const board = boardRef.current

    if (!board) return

    const lifted = lift?.current
    const tiers = list.tiers.map((tier) => tier.id)
    const before = shown.current
    const was = places.current
    const rows = rowsOf(board)

    if (lift) lift.current = null

    shown.current = { id: list.id, tiers }
    places.current = new Map(rows.map(([key, , at]) => [key, at]))

    if (before?.id !== list.id || !isReorder(before.tiers, tiers) || prefersReducedMotion()) return

    // Dónde se ve cada fila respecto de su lugar: la que se soltó, donde la dejó el arrastre; la que todavía vuela, lo que le faltaba (se toma antes de cancelarlo).
    const rest = new Map<string, Point>(lifted ?? [])

    for (const [key, flight] of flights.current) {
      if (!rest.has(key)) rest.set(key, remaining(flight))
      flight.animation.cancel()
    }

    flights.current.clear()

    for (const [key, element, at] of rows) {
      const from = was.get(key)
      const left = rest.get(key) ?? ZERO

      if (!from || typeof element.animate !== 'function') continue

      const by = { x: from.x + left.x - at.x, y: from.y + left.y - at.y }

      if (Math.abs(by.x) >= 1 || Math.abs(by.y) >= 1) flights.current.set(key, { animation: fly(element, by), dx: by.x, dy: by.y })
    }
    // Se mide con cada cambio de la lista; las funciones del tablero no hacen falta (los refs son estables).
  }, [boardRef, list, lift])

  useEffect(() => {
    const board = boardRef.current

    if (!board || typeof ResizeObserver === 'undefined') return

    // Si el tablero cambia de ancho (el menú lateral, el zoom, la ventana), las filas se acomodan de otra forma sin una jugada: se miden de nuevo sin vuelo, así el próximo reordenamiento parte de donde están.
    const observer = new ResizeObserver(() => {
      places.current = new Map(rowsOf(board).map(([key, , at]) => [key, at]))
    })

    observer.observe(board)

    return () => observer.disconnect()
  }, [boardRef])
}
