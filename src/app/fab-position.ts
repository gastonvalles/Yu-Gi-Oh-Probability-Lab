export interface FabPosition {
  x: number
  y: number
}

export interface FabBounds {
  width: number
  height: number
  /** Tamaño del botón (es cuadrado). */
  size: number
  /** Espacio reservado abajo (p. ej. el pie de la pantalla). */
  bottomInset: number
  /** Espacio reservado a la izquierda (p. ej. el menú lateral). */
  leftInset: number
  margin: number
}

/** Mantiene el botón dentro de la pantalla y fuera de las zonas reservadas (abajo y a la izquierda). */
export function clampFabPosition(position: FabPosition, bounds: FabBounds): FabPosition {
  const minX = bounds.margin + bounds.leftInset
  const maxX = Math.max(minX, bounds.width - bounds.size - bounds.margin)
  const maxY = Math.max(bounds.margin, bounds.height - bounds.size - bounds.margin - bounds.bottomInset)

  return {
    x: Math.min(Math.max(position.x, minX), maxX),
    y: Math.min(Math.max(position.y, bounds.margin), maxY),
  }
}

/** Al soltarlo, se pega al borde lateral más cercano para no tapar el contenido. */
export function snapFabToEdge(position: FabPosition, bounds: FabBounds): FabPosition {
  const center = position.x + bounds.size / 2
  const x = center < bounds.width / 2 ? bounds.margin + bounds.leftInset : bounds.width - bounds.size - bounds.margin
  return clampFabPosition({ x, y: position.y }, bounds)
}

/**
 * Si `other` queda encimado con `self` (son cuadrados: posición y lado), devuelve adónde correr a
 * `other` para que entre los dos quede `gap`; si no se tocan, null. Justo encimados, lo manda arriba.
 */
export function pushFabApart(self: FabPosition, selfSize: number, other: FabPosition, otherSize: number, gap: number): FabPosition | null {
  const minDistance = (selfSize + otherSize) / 2 + gap
  const dx = other.x + otherSize / 2 - (self.x + selfSize / 2)
  const dy = other.y + otherSize / 2 - (self.y + selfSize / 2)
  const distance = Math.hypot(dx, dy)

  if (distance >= minDistance) {
    return null
  }

  const shove = minDistance - distance
  const [ux, uy] = distance === 0 ? [0, -1] : [dx / distance, dy / distance]

  return { x: other.x + ux * shove, y: other.y + uy * shove }
}

interface FabBody {
  position: FabPosition
  size: number
}

const overlaps = (a: FabBody, b: FabBody, gap: number) => pushFabApart(a.position, a.size, b.position, b.size, gap) !== null

/**
 * Corre `body` fuera de `obstacle`: primero un empujón en línea recta y, si el borde de la pantalla no lo deja
 * (clavado contra el costado, por ejemplo), hacia arriba o hacia abajo, lo que quede más cerca. Si ya no se tocan,
 * devuelve la misma posición (mismo objeto).
 */
export function moveClearOf(body: FabBody, obstacle: FabBody, bounds: FabBounds, gap: number): FabPosition {
  const pushed = pushFabApart(obstacle.position, obstacle.size, body.position, body.size, gap)

  if (!pushed) {
    return body.position
  }

  const straight = clampFabPosition(pushed, bounds)

  if (!overlaps({ position: straight, size: body.size }, obstacle, gap)) {
    return straight
  }

  const distance = (obstacle.size + body.size) / 2 + gap
  const centerY = obstacle.position.y + obstacle.size / 2
  const candidates = [centerY - distance - body.size / 2, centerY + distance - body.size / 2]
    .map((y) => clampFabPosition({ x: straight.x, y }, bounds))
    .sort((a, b) => Math.abs(a.y - body.position.y) - Math.abs(b.y - body.position.y))

  return candidates.find((candidate) => !overlaps({ position: candidate, size: body.size }, obstacle, gap)) ?? straight
}

/**
 * Con `dragged` quieto en su lugar, corre al resto hasta que no se toquen con él ni entre sí (varias pasadas: un
 * empujado puede chocar con otro). Devuelve las posiciones nuevas en el mismo orden; las que no cambian son el mismo objeto.
 */
export function resolveFabGroup(dragged: FabBody, others: Array<FabBody & { bounds: FabBounds }>, gap: number): FabPosition[] {
  const positions = others.map((other) => other.position)

  for (let pass = 0; pass < 6; pass += 1) {
    let moved = false

    others.forEach((other, index) => {
      const next = moveClearOf({ position: positions[index]!, size: other.size }, dragged, other.bounds, gap)

      if (next !== positions[index]) {
        positions[index] = next
        moved = true
      }
    })

    others.forEach((first, i) => {
      others.forEach((second, j) => {
        if (j <= i) {
          return
        }

        const next = moveClearOf({ position: positions[j]!, size: second.size }, { position: positions[i]!, size: first.size }, second.bounds, gap)

        if (next !== positions[j]) {
          positions[j] = next
          moved = true
        }
      })
    })

    if (!moved) {
      break
    }
  }

  return positions
}

/** Posición inicial: abajo, sobre la zona reservada, a la derecha (botón) o a la izquierda (mascota). */
export function defaultFabPosition(bounds: FabBounds, corner: 'right' | 'left' = 'right'): FabPosition {
  return clampFabPosition({ x: corner === 'right' ? Number.POSITIVE_INFINITY : 0, y: Number.POSITIVE_INFINITY }, bounds)
}

/** Distancia mínima (px) para que un toque cuente como arrastre y no como clic. */
const FAB_DRAG_THRESHOLD = 6

export function isFabDrag(start: FabPosition, current: FabPosition): boolean {
  return Math.hypot(current.x - start.x, current.y - start.y) > FAB_DRAG_THRESHOLD
}
