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

/**
 * `ref`: el cartel entero (lo que se corre). Sin `enabled` (el celular, la hoja de abajo) no hace nada. `vars`: el que ya se centra con un `translate` de Tailwind (el `Modal` de la mesa) no se
 * pisa: se escriben `--drag-x` y `--drag-y`, que sus clases le suman (`translate-x-[calc(var(--drag-x,0px)-50%)]`).
 */
export function useDraggableOffset(storageKey: string, ref: RefObject<HTMLElement | null>, enabled: boolean, vars = false) {
  const stored = useRef<FabPosition | null>(null)
  // Lo que tiene puesto el cartel ahora (y en cuál: al minimizarse, el asa es otro elemento).
  const applied = useRef<{ element: HTMLElement | null; offset: FabPosition }>({ element: null, offset: ZERO })
  const drag = useRef<Drag | null>(null)
  const observed = useRef<HTMLElement | null>(null)
  const observer = useRef<ResizeObserver | null>(null)
  const seen = useRef<HTMLElement | null>(null)

  stored.current ??= readOffset(storageKey)

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
  const reclamp = () => {
    const element = ref.current

    if (!element || drag.current) return
    // Pasó al celular con el cartel abierto (el mismo elemento): sin lo corrido y sin `data-moved`.
    if (!enabled) {
      if (applied.current.element !== element) return
      applied.current = { element: null, offset: ZERO }
      element.style.translate = ''
      element.style.removeProperty('--drag-x')
      element.style.removeProperty('--drag-y')
      delete element.dataset.moved
      return
    }
    const { x, y } = stored.current!

    // En su lugar no hay nada que acotar (ni que medir: sin una lectura de más por cada vez que se dibuja).
    write(x || y ? clampOffset(stored.current!, natural(element), visibleArea(element)) : ZERO)
  }

  // Cada vez que se dibuja (otra pregunta, minimizado/abierto): el cartel en su lugar recordado, acotado; y su tamaño, vigilado.
  useLayoutEffect(() => {
    // Al aparecer, lo último guardado de su lugar.
    if (ref.current && !seen.current) stored.current = readOffset(storageKey)
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
            if (!(event.target as Element).closest('button, a, input, select, textarea')) settle(ZERO)
          },
        }
      : {}
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
            const { x, y } = current()

            settle(clampOffset({ x: x + arrow.x * KEY_STEP, y: y + arrow.y * KEY_STEP }, natural(element), visibleArea(element)))
          },
        }
      : {}

  return {
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
