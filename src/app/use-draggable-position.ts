import { useEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from 'react'

import { clampFabPosition, defaultFabPosition, isFabDrag, resolveFabGroup, snapFabToEdge, type FabBounds, type FabPosition } from './fab-position'
import { useShellInsets } from './shell-layout'

const MARGIN = 12
/** Hueco mínimo entre dos elementos del mismo grupo cuando se empujan. */
const GROUP_GAP = 8

interface DraggablePositionOptions {
  /** Clave para recordar dónde lo dejó el usuario. */
  storageKey: string
  /** Lado del elemento (se trata como cuadrado para los límites). */
  size: number
  /** Dónde arranca si nunca se movió. */
  corner?: 'right' | 'left'
  /** Cuánto subirlo (px) respecto del rincón por defecto: para apilar un botón sobre otro. */
  lift?: number
  /** Cuánto correrlo (px) hacia adentro desde el rincón por defecto: para poner varios en fila (las mascotas). */
  slide?: number
  /** Los elementos del mismo grupo chocan entre sí: el que se mueve empuja al otro. */
  group?: string
  /**
   * Se puede llevar a cualquier lugar de la pantalla: no esquiva el menú ni el pie, no deja margen contra el borde y se queda donde se lo suelta
   * (no se pega al costado). Dónde arranca, si nunca se movió, sigue siendo el rincón libre. Lo usan las mascotas.
   */
  anywhere?: boolean
}

type PointerHandler = (event: ReactPointerEvent<HTMLElement>) => void

export interface DraggablePosition {
  position: FabPosition
  dragging: boolean
  handlers: {
    onPointerDown: PointerHandler
    onPointerMove: PointerHandler
    onPointerUp: PointerHandler
    onPointerCancel: PointerHandler
  }
  /** El navegador dispara "click" después de soltar: devuelve true (una vez) si ese click viene de un arrastre y hay que ignorarlo. */
  consumeDragClick: () => boolean
}

/** Cada miembro de un grupo: dónde está, sus límites, cómo correrlo mientras otro arrastra y cómo fijarlo al soltar. */
interface GroupMember {
  size: number
  getPosition: () => FabPosition
  getBounds: () => FabBounds
  push: (position: FabPosition) => void
  settle: () => void
}

const groups = new Map<string, Map<string, GroupMember>>()

/** Corre a los demás miembros del grupo para que no se toquen con `self` (puesto en `position`) ni entre sí. */
function pushOthers(group: string | undefined, selfKey: string, selfSize: number, position: FabPosition): void {
  const members = group ? groups.get(group) : undefined

  if (!members) {
    return
  }

  const others = [...members].filter(([key]) => key !== selfKey).map(([, member]) => member)
  const before = others.map((member) => member.getPosition())
  const after = resolveFabGroup(
    { position, size: selfSize },
    others.map((member, index) => ({ position: before[index]!, size: member.size, bounds: member.getBounds() })),
    GROUP_GAP,
  )

  others.forEach((member, index) => {
    if (after[index] !== before[index]) {
      member.push(after[index]!)
    }
  })
}

/** Al soltar, los empujados se quedan donde quedaron (y lo recuerdan). */
function settleOthers(group: string | undefined, selfKey: string): void {
  const members = group ? groups.get(group) : undefined

  if (!members) {
    return
  }

  for (const [key, other] of members) {
    if (key !== selfKey) {
      other.settle()
    }
  }
}

function readPosition(key: string): FabPosition | null {
  try {
    const parsed = JSON.parse(localStorage.getItem(key) ?? 'null') as Partial<FabPosition> | null
    // NaN o Infinity guardados a mano dejarían el elemento en translate3d(NaNpx…): sólo valen números finitos.
    return Number.isFinite(parsed?.x) && Number.isFinite(parsed?.y) ? { x: parsed!.x as number, y: parsed!.y as number } : null
  } catch {
    return null
  }
}

function writePosition(key: string, position: FabPosition) {
  try {
    localStorage.setItem(key, JSON.stringify(position))
  } catch {
    // Si no se puede guardar, vuelve a su lugar por defecto la próxima vez.
  }
}

/**
 * Un elemento flotante que se arrastra a cualquier lado: al soltarlo se pega al borde lateral más
 * cercano y recuerda la posición entre visitas. Un toque sin arrastrar sigue siendo un click.
 * Lo comparten los botones flotantes y las mascotas; los que están en un grupo, además, se empujan entre sí.
 */
export function useDraggablePosition({ storageKey, size, corner = 'right', lift = 0, slide = 0, group, anywhere = false }: DraggablePositionOptions): DraggablePosition {
  const [viewport, setViewport] = useState(() => ({ width: window.innerWidth, height: window.innerHeight }))
  // El menú lateral y el pie (en escritorio) quedan libres: no se arranca ni se lleva nada encima de ellos.
  const shell = useShellInsets()
  const bounds: FabBounds = {
    ...viewport,
    size,
    margin: MARGIN,
    bottomInset: shell.bottom,
    leftInset: shell.left,
  }
  // Por dónde se puede llevar: lo común esquiva el menú y el pie; lo que va a cualquier lugar, no.
  const roam: FabBounds = anywhere ? { ...bounds, margin: 0, bottomInset: 0, leftInset: 0 } : bounds
  const [stored, setStored] = useState<FabPosition | null>(() => readPosition(storageKey))
  const [dragPosition, setDragPosition] = useState<FabPosition | null>(null)
  // Dónde lo dejó el empujón de otro miembro del grupo mientras ese otro arrastra.
  const [pushedPosition, setPushedPosition] = useState<FabPosition | null>(null)
  const dragRef = useRef<{ pointerStart: FabPosition; origin: FabPosition; moved: boolean } | null>(null)
  const suppressClickRef = useRef(false)
  const pushedRef = useRef<FabPosition | null>(null)

  useEffect(() => {
    const handleResize = () => {
      setViewport({ width: window.innerWidth, height: window.innerHeight })
      // Un empujón transitorio (p. ej. al abrir apaisado) no sobrevive a un cambio de tamaño: vuelve a su lugar.
      pushedRef.current = null
      setPushedPosition(null)
    }
    window.addEventListener('resize', handleResize)
    return () => window.removeEventListener('resize', handleResize)
  }, [])

  const fallback = defaultFabPosition(bounds, corner)
  const restingPosition = clampFabPosition(stored ?? { x: fallback.x + (corner === 'left' ? slide : -slide), y: fallback.y - lift }, roam)
  const position = dragPosition ?? pushedPosition ?? restingPosition
  const positionRef = useRef(position)
  const boundsRef = useRef(bounds)

  positionRef.current = position
  boundsRef.current = roam

  useEffect(() => {
    if (!group) {
      return
    }

    const members = groups.get(group) ?? new Map<string, GroupMember>()

    groups.set(group, members)
    members.set(storageKey, {
      size,
      getPosition: () => positionRef.current,
      getBounds: () => boundsRef.current,
      push: (next) => {
        pushedRef.current = next
        setPushedPosition(next)
      },
      settle: () => {
        const next = pushedRef.current

        if (next) {
          pushedRef.current = null
          setStored(next)
          writePosition(storageKey, next)
          setPushedPosition(null)
        }
      },
    })
    // Si aparece encimado con otro (p. ej. los dos en el mismo rincón), lo corre, pero sólo mientras dure: eso no se guarda,
    // porque depende del tamaño de pantalla de ese momento. Lo que se guarda es lo que deja un arrastre.
    pushOthers(group, storageKey, size, positionRef.current)

    return () => {
      members.delete(storageKey)
    }
  }, [group, size, storageKey])

  const onPointerDown: PointerHandler = (event) => {
    if (event.button !== 0) {
      return
    }
    // Si un arrastre táctil no generó click, la marca no debe comerse este toque.
    suppressClickRef.current = false
    event.currentTarget.setPointerCapture(event.pointerId)
    dragRef.current = { pointerStart: { x: event.clientX, y: event.clientY }, origin: positionRef.current, moved: false }
  }

  const onPointerMove: PointerHandler = (event) => {
    const drag = dragRef.current
    if (!drag) {
      return
    }

    const pointer = { x: event.clientX, y: event.clientY }
    if (!drag.moved && !isFabDrag(drag.pointerStart, pointer)) {
      return
    }

    drag.moved = true
    const next = clampFabPosition(
      { x: drag.origin.x + pointer.x - drag.pointerStart.x, y: drag.origin.y + pointer.y - drag.pointerStart.y },
      roam,
    )
    setDragPosition(next)
    pushOthers(group, storageKey, size, next)
  }

  const onPointerUp: PointerHandler = () => {
    const drag = dragRef.current
    dragRef.current = null

    if (!drag?.moved || !dragPosition) {
      setDragPosition(null)
      return
    }

    suppressClickRef.current = true
    const snapped = anywhere ? clampFabPosition(dragPosition, roam) : snapFabToEdge(dragPosition, bounds)
    pushedRef.current = null
    setPushedPosition(null)
    setStored(snapped)
    writePosition(storageKey, snapped)
    setDragPosition(null)
    pushOthers(group, storageKey, size, snapped)
    settleOthers(group, storageKey)
  }

  return {
    position,
    dragging: dragPosition !== null,
    handlers: { onPointerDown, onPointerMove, onPointerUp, onPointerCancel: onPointerUp },
    consumeDragClick: () => {
      const suppressed = suppressClickRef.current
      suppressClickRef.current = false
      return suppressed
    },
  }
}
