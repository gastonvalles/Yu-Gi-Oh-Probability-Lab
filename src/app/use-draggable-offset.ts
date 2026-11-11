import { useEffect, useLayoutEffect, useRef, type KeyboardEvent, type MouseEvent, type PointerEvent as ReactPointerEvent, type RefObject } from 'react'

import { t } from '../i18n'
import { isFabDrag, type FabPosition } from './fab-position'

/**
 * Los carteles de la mesa (la pregunta del medio, `MatPrompt`, y su asa; la pila de la cadena, `ChainNotice`; sus diálogos, `Modal anchor="mat"`; el visor de una pila, `PileViewer`) se llevan
 * a cualquier lugar de la pantalla desde 1101 px, como las mascotas (Gastón, 2026-11-02: «los carteles se deben poder mover en desktop como las mascotas»). Salen en su lugar fijo de siempre y se corren con un
 * `translate` sobre ese lugar (`offset`): no mueven nada de la mesa ni cambian el tamaño de su ranura.
 * - Se agarran por la cabeza (no por sus botones) con el mouse o el lápiz; con el dedo sigue lo de siempre (`useSwipeFold`: `touchOr`). Mientras se llevan se escribe el `translate`
 *   directo, sin redibujar React; se guarda al soltar. Un toque sin arrastrar sigue siendo un clic.
 * - Siempre enteros a la vista (`visibleArea`: nunca debajo del menú de al lado; si no entran, la cabeza): se vuelven a acotar al cambiar el tamaño de la ventana o del cartel, sin
 *   olvidar dónde los dejó la persona.
 * - Una posición por lugar (`storageKey`, no por pregunta), recordada entre visitas y releída cada vez que el cartel aparece (otro del mismo lugar pudo moverse mientras no estaba). Doble clic en la cabeza, a su lugar. Con el foco adentro, Alt + flechas.
 * - Movido lleva `data-moved` y avisa `cardmove` (sube): la mesa deja de acortar la pila de la cadena contra la pregunta, que ya no comparten franja.
 */

/** `prompt`: la pregunta, su asa y las hojas que se minimizan (`lowerable`); `chain`: la pila de la cadena; `dialog`: los demás diálogos de la mesa y el visor de una pila. */
export const matCardPositionKey = (place: 'prompt' | 'chain' | 'dialog') => `ygo-lab:mat-card-position:${place}`

export const MOVE_SHORTCUTS = 'Alt+ArrowUp Alt+ArrowDown Alt+ArrowLeft Alt+ArrowRight'
const KEY_STEP = 16
const ARROWS: Record<string, FabPosition> = { ArrowUp: { x: 0, y: -1 }, ArrowDown: { x: 0, y: 1 }, ArrowLeft: { x: -1, y: 0 }, ArrowRight: { x: 1, y: 0 } }
const ZERO: FabPosition = { x: 0, y: 0 }

interface Box {
  left: number
  top: number
  width: number
  height: number
}

export interface Area {
  left: number
  top: number
  right: number
  bottom: number
}

/** Acota el corrimiento para que el cartel (`box`: dónde está sin correr) quede entero en `area`; si no entra, con la cabeza (arriba a la izquierda) en su borde. */
export function clampOffset(offset: FabPosition, box: Box, area: Area): FabPosition {
  const axis = (value: number, from: number, size: number, min: number, max: number) => Math.max(min - from, Math.min(value, max - from - size))

  return { x: axis(offset.x, box.left, box.width, area.left, area.right), y: axis(offset.y, box.top, box.height, area.top, area.bottom) }
}

/**
 * Dónde se ve el cartel: el primer contenedor que lo recorta (en la app, el del armazón: la ventana menos el menú de al lado; en el catálogo, el marco de la muestra). Sin ninguno (un portal en
 * `<body>`, como el `Modal`), el recuadro del armazón (el que contiene a `#contenido`: tampoco va debajo del menú) o, sin armazón, la ventana. Llevarlo más allá lo cortaría.
 */
function visibleArea(element: HTMLElement): Area {
  for (let parent = element.parentElement; parent && parent !== document.body; parent = parent.parentElement) {
    const style = getComputedStyle(parent)

    if (style.overflowX !== 'visible' || style.overflowY !== 'visible') return parent.getBoundingClientRect()
  }
  return document.getElementById('contenido')?.parentElement?.getBoundingClientRect() ?? { left: 0, top: 0, right: window.innerWidth, bottom: window.innerHeight }
}

export function readOffset(key: string): FabPosition {
  try {
    const parsed = JSON.parse(localStorage.getItem(key) ?? 'null') as Partial<FabPosition> | null
    // Sólo números finitos: un NaN guardado a mano lo dejaría en `translate: NaNpx`.
    return Number.isFinite(parsed?.x) && Number.isFinite(parsed?.y) ? { x: parsed!.x as number, y: parsed!.y as number } : ZERO
  } catch {
    return ZERO
  }
}

function writeOffset(key: string, offset: FabPosition) {
  try {
    if (offset.x === 0 && offset.y === 0) localStorage.removeItem(key)
    else localStorage.setItem(key, JSON.stringify(offset))
  } catch {
    // Si no se puede guardar, la próxima vez sale en su lugar.
  }
}

export interface Size {
  width: number
  height: number
}

/** Dónde se guarda el tamaño de un cartel que se estira: al lado de su posición. */
export const sizeKey = (key: string) => `${key}:size`

/** El tamaño guardado (sólo números finitos y positivos; lo demás, ninguno: sale con el de siempre). */
export function readSize(key: string): Size | null {
  try {
    const parsed = JSON.parse(localStorage.getItem(sizeKey(key)) ?? 'null') as Partial<Size> | null
    const ok = (value: unknown): value is number => typeof value === 'number' && Number.isFinite(value) && value > 0

    return ok(parsed?.width) && ok(parsed?.height) ? { width: parsed.width, height: parsed.height } : null
  } catch {
    return null
  }
}

function writeSize(key: string, size: Size | null) {
  try {
    if (size) localStorage.setItem(sizeKey(key), JSON.stringify(size))
    else localStorage.removeItem(sizeKey(key))
  } catch {
    // Si no se puede guardar, la próxima vez sale con el tamaño de siempre.
  }
}

/** Entre el mínimo y lo que deja `area` (si el área es más chica que el mínimo, el mínimo). */
export function clampSize(size: Size, min: Size, area: Area): Size {
  const axis = (value: number, low: number, high: number) => Math.round(Math.max(low, Math.min(value, high)))

  return { width: axis(size.width, min.width, area.right - area.left), height: axis(size.height, min.height, area.bottom - area.top) }
}

const px = (value: number) => (value ? `${Math.round(value)}px` : '0')

type PointerHandler = (event: ReactPointerEvent<HTMLElement>) => void
type Handlers = Partial<Record<'onPointerDown' | 'onPointerMove' | 'onPointerUp' | 'onPointerCancel', PointerHandler>>
export type MoveHead = Handlers & { onDoubleClick?: (event: MouseEvent<HTMLElement>) => void }
type MoveRoot = { 'aria-keyshortcuts'?: string; 'aria-description'?: string; onKeyDown?: (event: KeyboardEvent<HTMLElement>) => void }

interface Drag {
  id: number
  start: FabPosition
  origin: FabPosition
  box: Box
  area: Area
  moved: boolean
}

interface Stretch {
  id: number
  start: FabPosition
  from: Size
  /** La esquina de arriba a la izquierda, que queda quieta mientras se estira. */
  at: FabPosition
  area: Area
  /** El tamaño que lleva (sin mover todavía, ninguno: un clic no estira). */
  size?: Size
}

/**
 * `ref`: el cartel entero (lo que se corre). Sin `enabled` (el celular, la hoja de abajo) no hace nada. `vars`: el que ya se centra con un `translate` de Tailwind (el `Modal` de la mesa) no se
 * pisa: se escriben `--drag-x` y `--drag-y`, que sus clases le suman (`translate-x-[calc(var(--drag-x,0px)-50%)]`).
 * `minSize`: además se estira (las ventanas del duelo automático, `AutoPanel`): `stretch` da los agarres del borde y la esquina, `resizeBy` el teclado; el tamaño se guarda al lado de la posición
 * (`sizeKey`), acotado al mínimo y a la pantalla, se escribe en `width`/`height` del cartel (sin redibujar React) y la esquina de arriba a la izquierda no se mueve al estirarlo. Doble clic, a su lugar y
 * a su tamaño de siempre.
 */
export function useDraggableOffset(storageKey: string, ref: RefObject<HTMLElement | null>, enabled: boolean, vars = false, minSize?: Size) {
  const stored = useRef<FabPosition | null>(null)
  const sized = useRef<Size | null>(null)
  const stretching = useRef<Stretch | null>(null)
  // Lo que tiene puesto el cartel ahora (y en cuál: al minimizarse, el asa es otro elemento).
  const applied = useRef<{ element: HTMLElement | null; offset: FabPosition }>({ element: null, offset: ZERO })
  const drag = useRef<Drag | null>(null)
  const observed = useRef<HTMLElement | null>(null)
  const observer = useRef<ResizeObserver | null>(null)
  const seen = useRef<HTMLElement | null>(null)

  if (stored.current === null) {
    stored.current = readOffset(storageKey)
    sized.current = minSize ? readSize(storageKey) : null
  }

  const current = () => (applied.current.element === ref.current ? applied.current.offset : ZERO)
  /** Dónde está el cartel sin correr. Su tamaño de verdad (`offset*`): al aparecer se agranda desde el 96 % (`animate-dialog-enter`, desde el centro) y el rectángulo lo daría más chico. */
  const natural = (element: HTMLElement): Box => {
    const rect = element.getBoundingClientRect()
    const width = element.offsetWidth || rect.width
    const height = element.offsetHeight || rect.height
    const { x, y } = current()

    return { left: rect.left + (rect.width - width) / 2 - x, top: rect.top + (rect.height - height) / 2 - y, width, height }
  }
  const write = (offset: FabPosition, extraY = 0) => {
    const element = ref.current

    if (!element) return
    applied.current = { element, offset }
    if (vars) {
      // En su lugar, sin variable (vale la de las clases, `0px`: un `0` sin unidad rompería el `calc`).
      for (const [name, value] of [['--drag-x', offset.x], ['--drag-y', offset.y + extraY]] as const) {
        if (value) element.style.setProperty(name, `${Math.round(value)}px`)
        else element.style.removeProperty(name)
      }
    } else element.style.translate = offset.x || offset.y + extraY ? `${px(offset.x)} ${px(offset.y + extraY)}` : ''
    if (stored.current!.x || stored.current!.y) element.dataset.moved = ''
    else delete element.dataset.moved
  }
  const settle = (offset: FabPosition) => {
    stored.current = offset
    writeOffset(storageKey, offset)
    write(offset)
    ref.current?.dispatchEvent(new Event('cardmove', { bubbles: true }))
  }
  /** El tamaño puesto (o el de siempre, `null`): con alto propio, sin el tope de alto de sus clases. */
  const paint = (element: HTMLElement, size: Size | null) => {
    element.style.width = size ? `${size.width}px` : ''
    element.style.height = size ? `${size.height}px` : ''
    element.style.maxHeight = size ? 'none' : ''
  }
  /** Estira a `size` dejando quieta la esquina de arriba a la izquierda (`at`): el corrimiento compensa lo que el lugar de siempre se corre con el tamaño (centrado, apoyado abajo). */
  const stretchTo = (element: HTMLElement, size: Size, at: FabPosition, area: Area) => {
    paint(element, size)
    const box = natural(element)

    write(clampOffset({ x: at.x - box.left, y: at.y - box.top }, box, area))
  }
  /** Dónde arranca un estirón: el tamaño de ahora, la esquina quieta y hasta dónde puede crecer (de esa esquina al borde del área). */
  const stretchFrom = (element: HTMLElement) => {
    const box = natural(element)
    const { x, y } = current()
    // Un `DOMRect` no se copia con `...` (sus medidas son del prototipo).
    const { right, bottom } = visibleArea(element)
    const at = { x: box.left + x, y: box.top + y }

    return { from: { width: box.width, height: box.height }, at, area: { left: at.x, top: at.y, right, bottom } }
  }
  const keepSize = (size: Size) => {
    sized.current = size
    writeSize(storageKey, size)
    settle(current())
  }
  const reclamp = () => {
    const element = ref.current

    if (!element || drag.current || stretching.current) return
    // Pasó al celular con el cartel abierto (el mismo elemento): sin lo corrido, sin su tamaño y sin `data-moved`.
    if (!enabled) {
      if (applied.current.element !== element) return
      applied.current = { element: null, offset: ZERO }
      element.style.translate = ''
      element.style.removeProperty('--drag-x')
      element.style.removeProperty('--drag-y')
      if (minSize) paint(element, null)
      delete element.dataset.moved
      return
    }
    const { x, y } = stored.current!

    if (minSize) paint(element, sized.current ? clampSize(sized.current, minSize, visibleArea(element)) : null)
    // En su lugar no hay nada que acotar (ni que medir: sin una lectura de más por cada vez que se dibuja).
    write(x || y ? clampOffset(stored.current!, natural(element), visibleArea(element)) : ZERO)
  }
  /** Lo corre (el teclado de la cabeza): acotado a la pantalla y guardado. */
  const moveBy = (dx: number, dy: number) => {
    const element = ref.current

    if (!enabled || !element) return
    const { x, y } = current()

    settle(clampOffset({ x: x + dx, y: y + dy }, natural(element), visibleArea(element)))
  }
  /** Lo estira (Alt + flechas): entre el mínimo y la pantalla, guardado. */
  const resizeBy = (dw: number, dh: number) => {
    const element = ref.current

    if (!enabled || !minSize || !element) return
    const { from, at, area } = stretchFrom(element)
    const size = clampSize({ width: from.width + dw, height: from.height + dh }, minSize, area)

    stretchTo(element, size, at, area)
    keepSize(size)
  }
  /** A su lugar y a su tamaño de siempre (doble clic en la cabeza). */
  const reset = () => {
    if (!enabled) return
    if (minSize) {
      sized.current = null
      writeSize(storageKey, null)
      if (ref.current) paint(ref.current, null)
    }
    settle(ZERO)
  }

  // Cada vez que se dibuja (otra pregunta, minimizado/abierto): el cartel en su lugar recordado, acotado; y su tamaño, vigilado.
  useLayoutEffect(() => {
    // Al aparecer, lo último guardado de su lugar (y de su tamaño).
    if (ref.current && !seen.current) {
      stored.current = readOffset(storageKey)
      sized.current = minSize ? readSize(storageKey) : null
    }
    seen.current = ref.current
    reclamp()
    const element = enabled ? ref.current : null

    if (element === observed.current) return
    if (observed.current) observer.current?.unobserve(observed.current)
    observed.current = element
    if (!element || typeof ResizeObserver === 'undefined') return
    observer.current ??= new ResizeObserver(() => reclamp())
    observer.current.observe(element)
  })

  useEffect(() => {
    if (!enabled) return
    const onResize = () => reclamp()

    window.addEventListener('resize', onResize)
    return () => window.removeEventListener('resize', onResize)
    // eslint-disable-next-line react-hooks/exhaustive-deps -- `reclamp` lee todo de refs.
  }, [enabled])

  useEffect(() => () => observer.current?.disconnect(), [])

  const onPointerDown: PointerHandler = (event) => {
    const element = ref.current

    if (!enabled || !element || event.pointerType === 'touch' || event.button !== 0) return
    // Los botones de la cabeza siguen siendo botones.
    if ((event.target as Element).closest('button, a, input, select, textarea')) return
    // Sin esto el mouse selecciona texto de la mesa al arrastrar y, con algo seleccionado, el navegador arranca su propio arrastre (cancela el puntero).
    event.preventDefault()
    drag.current = { id: event.pointerId, start: { x: event.clientX, y: event.clientY }, origin: current(), box: natural(element), area: visibleArea(element), moved: false }
    event.currentTarget.setPointerCapture?.(event.pointerId)
  }
  const onPointerMove: PointerHandler = (event) => {
    const now = drag.current
    const pointer = { x: event.clientX, y: event.clientY }

    if (!now || now.id !== event.pointerId) return
    if (!now.moved && !isFabDrag(now.start, pointer)) return
    now.moved = true
    write(clampOffset({ x: now.origin.x + pointer.x - now.start.x, y: now.origin.y + pointer.y - now.start.y }, now.box, now.area))
  }
  const onPointerUp: PointerHandler = (event) => {
    const now = drag.current

    if (!now || now.id !== event.pointerId) return
    drag.current = null
    if (now.moved) settle(current())
  }

  const head: MoveHead = enabled
      ? {
          onPointerDown,
          onPointerMove,
          onPointerUp,
          onPointerCancel: onPointerUp,
          onDoubleClick: (event: MouseEvent<HTMLElement>) => {
            if (!(event.target as Element).closest('button, a, input, select, textarea')) reset()
          },
        }
      : {}
  /** Un agarre para estirar: el borde derecho (`x`), el de abajo (`y`) o la esquina (los dos). Con el mouse o el lápiz; se escribe en vivo y se guarda al soltar. */
  const stretch = (x: boolean, y: boolean): Handlers => {
    if (!enabled || !minSize) return {}
    const end: PointerHandler = (event) => {
      const now = stretching.current

      if (!now || now.id !== event.pointerId) return
      stretching.current = null
      if (now.size) keepSize(now.size)
    }

    return {
      onPointerDown: (event) => {
        const element = ref.current

        if (!element || event.pointerType === 'touch' || event.button !== 0) return
        event.preventDefault()
        event.stopPropagation()
        stretching.current = { id: event.pointerId, start: { x: event.clientX, y: event.clientY }, ...stretchFrom(element) }
        event.currentTarget.setPointerCapture?.(event.pointerId)
      },
      onPointerMove: (event) => {
        const now = stretching.current
        const element = ref.current

        if (!now || now.id !== event.pointerId || !element) return
        const dx = x ? event.clientX - now.start.x : 0
        const dy = y ? event.clientY - now.start.y : 0

        if (!now.size && !dx && !dy) return
        now.size = clampSize({ width: now.from.width + dx, height: now.from.height + dy }, minSize, now.area)
        stretchTo(element, now.size, now.at, now.area)
      },
      onPointerUp: end,
      onPointerCancel: end,
    }
  }
  const root: MoveRoot = enabled
      ? {
          'aria-keyshortcuts': MOVE_SHORTCUTS,
          // Lo que dice el lector de pantalla del cartel (y el `title` de su cabeza).
          'aria-description': t('duel.prompt.move'),
          onKeyDown: (event: KeyboardEvent<HTMLElement>) => {
            const arrow = ARROWS[event.key]
            const element = ref.current

            if (!event.altKey || event.ctrlKey || event.metaKey || !arrow || !element) return
            // Alt + ← es «Atrás» en el navegador: acá mueve el cartel.
            event.preventDefault()
            moveBy(arrow.x * KEY_STEP, arrow.y * KEY_STEP)
          },
        }
      : {}

  return {
    stretch,
    moveBy,
    resizeBy,
    reset,
    /** La cabeza: se agarra por acá (con `cursor-grab`). */
    head,
    /** El cartel: Alt + flechas lo corren con el foco adentro. */
    root,
    /** Con el dedo, mientras se baja el cartel para minimizarlo (`useSwipeFold.follow`): corre lo que se arrastró sobre su lugar. */
    nudge: (dy: number | null) => write(current(), dy ?? 0),
  }
}

/** La cabeza con dos gestos: el dedo, `touch` (minimizar o abrir arrastrando); el mouse y el lápiz, `drag` (llevarlo a otro lado). */
export function touchOr<T extends Handlers>(touch: T, drag: MoveHead): T & MoveHead {
  if (!drag.onPointerDown) return touch
  // Quién arranca lo decide el tipo de puntero; lo que sigue va a los dos (cada uno sólo atiende al puntero que arrancó).
  const both = (name: keyof Handlers): PointerHandler => (event) => {
    touch[name]?.(event)
    drag[name]?.(event)
  }

  return {
    ...drag,
    ...touch,
    onPointerDown: (event) => (event.pointerType === 'touch' ? touch : drag).onPointerDown?.(event),
    onPointerMove: both('onPointerMove'),
    onPointerUp: both('onPointerUp'),
    onPointerCancel: both('onPointerCancel'),
  }
}
