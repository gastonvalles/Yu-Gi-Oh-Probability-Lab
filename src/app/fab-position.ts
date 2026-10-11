export interface FabPosition {
  x: number
  y: number
}

export interface FabBounds {
  width: number
  height: number
  /** Tamaño del botón (es cuadrado). */
  size: number
  /** Espacio reservado abajo (p. ej. la barra de navegación mobile). */
  bottomInset: number
  margin: number
}

/** Mantiene el botón dentro de la pantalla y fuera de la zona reservada de abajo. */
export function clampFabPosition(position: FabPosition, bounds: FabBounds): FabPosition {
  const maxX = Math.max(bounds.margin, bounds.width - bounds.size - bounds.margin)
  const maxY = Math.max(bounds.margin, bounds.height - bounds.size - bounds.margin - bounds.bottomInset)

  return {
    x: Math.min(Math.max(position.x, bounds.margin), maxX),
    y: Math.min(Math.max(position.y, bounds.margin), maxY),
  }
}

/** Al soltarlo, se pega al borde lateral más cercano para no tapar el contenido. */
export function snapFabToEdge(position: FabPosition, bounds: FabBounds): FabPosition {
  const center = position.x + bounds.size / 2
  const x = center < bounds.width / 2 ? bounds.margin : bounds.width - bounds.size - bounds.margin
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

/** Posición inicial: abajo, sobre la zona reservada, a la derecha (botón) o a la izquierda (mascota). */
export function defaultFabPosition(bounds: FabBounds, corner: 'right' | 'left' = 'right'): FabPosition {
  return clampFabPosition({ x: corner === 'right' ? Number.POSITIVE_INFINITY : 0, y: Number.POSITIVE_INFINITY }, bounds)
}

/** Distancia mínima (px) para que un toque cuente como arrastre y no como clic. */
const FAB_DRAG_THRESHOLD = 6

export function isFabDrag(start: FabPosition, current: FabPosition): boolean {
  return Math.hypot(current.x - start.x, current.y - start.y) > FAB_DRAG_THRESHOLD
}
