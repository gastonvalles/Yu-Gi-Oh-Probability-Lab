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

/** Posición inicial: abajo a la derecha, sobre la zona reservada. */
export function defaultFabPosition(bounds: FabBounds): FabPosition {
  return clampFabPosition({ x: Number.POSITIVE_INFINITY, y: Number.POSITIVE_INFINITY }, bounds)
}

/** Distancia mínima (px) para que un toque cuente como arrastre y no como clic. */
export const FAB_DRAG_THRESHOLD = 6

export function isFabDrag(start: FabPosition, current: FabPosition): boolean {
  return Math.hypot(current.x - start.x, current.y - start.y) > FAB_DRAG_THRESHOLD
}
