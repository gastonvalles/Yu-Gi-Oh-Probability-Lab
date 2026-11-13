import { arrivals } from './field-impact'
import { cancelWhenDone, prefersReducedMotion } from './motion'
import { locateCard, type MatState } from './practice-mat'

/**
 * Los flipbooks («Impacto Ligero», módulo C: «secuencias de flipbooks de 8 a 12 cuadros»): animaciones cuadro a cuadro dibujadas por nosotros en SVG (sin imágenes), un cuadro de 64 × 64
 * al lado del otro en una tira (una sola imagen, `atlasOf`), más uno vacío al final (el reposo). La tira entera se corre con `steps()` sobre su `translate` dentro de una ventana recortada: compositor, sin repintar.
 * **Pocos y con sentido**, cada uno con el color de lo que dice (`--color-fx-*`):
 * - `SPARK`, la chispa (10 cuadros, dorado `fx-destello`): donde la línea de energía toca la carta que se encadena (`ChainStage`): activar un efecto.
 * - `CUT`, el corte (10, rojo `fx-impacto`): sobre el medallón del eslabón que queda negado o sin efecto (`ChainBadge`), en el sentido de la tacha que le queda.
 * - `BURST`, el estallido (12, rojo `fx-impacto`): donde estaba el monstruo que se va del campo al Cementerio (destruido o mandado; no los materiales ni lo que se sacrifica para
 *   invocar, `burstsOf`), mientras vuela a la pila (`use-card-flights`).
 * Con «Efectos: Livianos» o movimiento reducido no corren (`playFlipbook`).
 */

/** Una figura de un cuadro: la etiqueta SVG, sus atributos (en camelCase, como en React) y su clase (el color, un token). */
export interface FlipShape {
  tag: 'line' | 'circle' | 'rect'
  attrs: Record<string, number | string>
  className: string
}

export interface FlipbookArt {
  frames: number
  fps: number
  draw: (index: number) => FlipShape[]
}

/** El lado de un cuadro, en el `viewBox` de la tira. */
export const FLIP_FRAME = 64

const C = FLIP_FRAME / 2

/** La chispa: un núcleo blanco y ocho rayos dorados que se abren y se apagan. */
export const SPARK: FlipbookArt = {
  frames: 10,
  fps: 30,
  draw: (index) => {
    const p = index / 9
    const grow = Math.min(1, (index + 1) / 3)

    return [
      ...Array.from({ length: 8 }, (_, ray): FlipShape => {
        const angle = (ray * Math.PI) / 4 + (ray % 2 ? Math.PI / 8 : 0)
        const inner = 3 + 24 * p
        const outer = inner + ((ray % 2 ? 8 : 14) * (1 - p) + 2) * grow

        return {
          tag: 'line',
          attrs: { x1: C + Math.cos(angle) * inner, y1: C + Math.sin(angle) * inner, x2: C + Math.cos(angle) * outer, y2: C + Math.sin(angle) * outer, strokeWidth: 3.5 * (1 - p) + 0.5, strokeLinecap: 'round', opacity: 1 - p * p },
          className: 'stroke-fx-destello',
        }
      }),
      { tag: 'circle', attrs: { cx: C, cy: C, r: 9 * (1 - p) ** 2 * grow + 0.5 }, className: 'fill-white' },
    ]
  },
}

/** Un tramo del corte: el halo rojo ancho y el núcleo blanco encima. */
const slash = (x1: number, y1: number, x2: number, y2: number, width: number, opacity = 1): FlipShape[] => [
  { tag: 'line', attrs: { x1, y1, x2, y2, strokeWidth: width * 2.6, strokeLinecap: 'round', opacity: 0.45 * opacity }, className: 'stroke-fx-impacto' },
  { tag: 'line', attrs: { x1, y1, x2, y2, strokeWidth: width, strokeLinecap: 'round', opacity }, className: 'stroke-white' },
]

/** El corte: se dibuja de abajo a la izquierda hacia arriba a la derecha (como la tacha del medallón), brilla y se parte en dos. */
export const CUT: FlipbookArt = {
  frames: 10,
  fps: 30,
  draw: (index) => {
    const [ax, ay, bx, by] = [12, 52, 52, 12]

    if (index < 4) {
      const t = (index + 1) / 4
      return slash(ax, ay, ax + (bx - ax) * t, ay + (by - ay) * t, 2 + index * 0.8)
    }
    if (index < 7) return slash(ax, ay, bx, by, 5 - (index - 4) * 1.2)
    const q = (index - 6) / 4
    const gap = 6 * q
    const [mx, my] = [(ax + bx) / 2, (ay + by) / 2]

    return [...slash(ax - gap, ay - gap, mx - gap, my - gap, 2 * (1 - q) + 0.5, 1 - q), ...slash(mx + gap, my + gap, bx + gap, by + gap, 2 * (1 - q) + 0.5, 1 - q)]
  },
}

/** El estallido: un fogonazo blanco y un anillo rojo que se abre mientras seis trozos salen girando y se apagan. */
export const BURST: FlipbookArt = {
  frames: 12,
  fps: 30,
  draw: (index) => {
    if (index < 2) return [{ tag: 'circle', attrs: { cx: C, cy: C, r: index === 0 ? 10 : 17, opacity: index === 0 ? 1 : 0.85 }, className: 'fill-white' }]
    const q = (index - 2) / 9

    return [
      { tag: 'circle', attrs: { cx: C, cy: C, r: 14 + 16 * q, fill: 'none', strokeWidth: 3 * (1 - q) + 0.5, opacity: (1 - q) * 0.85 }, className: 'stroke-fx-impacto' },
      ...Array.from({ length: 6 }, (_, shard): FlipShape => {
        const angle = (shard * Math.PI) / 3 + Math.PI / 6
        const reach = 6 + 22 * q
        const x = C + Math.cos(angle) * reach
        const y = C + Math.sin(angle) * reach

        return {
          tag: 'rect',
          attrs: { x: x - 3, y: y - 4.5, width: 6, height: 9, strokeWidth: 1, opacity: 1 - q * q, transform: `rotate(${(shard % 2 ? 1 : -1) * 120 * q} ${x} ${y})` },
          className: 'fill-fx-impacto stroke-white',
        }
      }),
    ]
  },
}

/** Dónde queda la tira en reposo: en el cuadro vacío del final (como `translate`, en % de su propio ancho). */
export const restOf = (book: FlipbookArt) => `${(-100 * book.frames) / (book.frames + 1)}% 0`

/** Cuánto dura una pasada, en ms. */
export const durationOf = (book: FlipbookArt) => Math.round((book.frames * 1000) / book.fps)

const lite = () => typeof document !== 'undefined' && document.documentElement.dataset.effects === 'lite'

/**
 * Corre la tira (`strip`, que en reposo está en su cuadro vacío) una vez, después de `delay` ms: del primer cuadro al último, de a saltos (`steps`), y vuelve al reposo. Mientras espera
 * no se ve nada (sin `fill`). Con «Livianos» o movimiento reducido, no corre (null).
 */
export function playFlipbook(strip: HTMLElement, book: FlipbookArt, delay = 0): Animation | null {
  if (typeof strip.animate !== 'function' || prefersReducedMotion() || lite()) return null

  return cancelWhenDone(strip.animate([{ translate: '0 0' }, { translate: restOf(book) }], { duration: durationOf(book), delay, easing: `steps(${book.frames})` }))
}

const kebab = (name: string) => name.replace(/[A-Z]/g, (char) => `-${char.toLowerCase()}`)
const atlases = new Map<FlipbookArt, string>()

/**
 * La tira entera como una sola imagen (el «atlas» del documento: un SVG en un `data:`), armada una vez por sesión: cada flipbook es un `<img>` y no noventa nodos SVG, así montarlo en la
 * cadena no alarga la jugada. Las clases de color se cambian por el valor de su token (`--color-fx-*`, en `:root`): una imagen no lee el CSS de la página.
 */
export function atlasOf(book: FlipbookArt): string {
  const cached = atlases.get(book)
  if (cached) return cached

  const root = typeof document === 'undefined' ? null : getComputedStyle(document.documentElement)
  const color = (name: string) => (name === 'white' ? '#fff' : root?.getPropertyValue(`--color-${name}`).trim() || '#fff')
  const paint = (className: string) => className.split(' ').map((token) => /^(stroke|fill)-(.+)$/.exec(token)).flatMap((match) => (match ? [`${match[1]}="${color(match[2]!)}"`] : [])).join(' ')
  const frames = Array.from({ length: book.frames }, (_, index) => {
    const shapes = book.draw(index).map(({ tag, attrs, className }) => `<${tag} ${Object.entries(attrs).map(([name, value]) => `${kebab(name)}="${value}"`).join(' ')} ${paint(className)}/>`)

    return `<g transform="translate(${index * FLIP_FRAME} 0)">${shapes.join('')}</g>`
  })
  const url = `data:image/svg+xml,${encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${(book.frames + 1) * FLIP_FRAME} ${FLIP_FRAME}">${frames.join('')}</svg>`)}`

  atlases.set(book, url)
  return url
}

/**
 * Un flipbook en un punto de la pantalla (`x`, `y`, su centro), de `size` px, a los `delay` ms: una capa fija encima del campo (la del anillo de impacto) que se quita sola. Con «Livianos»
 * o movimiento reducido, nada.
 */
export function flipbookAt(x: number, y: number, book: FlipbookArt, delay = 0, size = 72): void {
  if (typeof document === 'undefined' || typeof document.body.animate !== 'function' || prefersReducedMotion() || lite()) return

  const layer = document.createElement('div')
  layer.className = 'pointer-events-none fixed left-0 top-0 z-[115] overflow-hidden'
  layer.dataset.fx = 'flipbook'
  layer.setAttribute('aria-hidden', 'true')
  Object.assign(layer.style, { width: `${size}px`, height: `${size}px`, translate: `${Math.round(x - size / 2)}px ${Math.round(y - size / 2)}px` })
  const strip = document.createElement('img')
  strip.className = 'block h-full max-w-none'
  strip.alt = ''
  strip.src = atlasOf(book)
  Object.assign(strip.style, { width: `${(book.frames + 1) * 100}%`, translate: restOf(book) })
  layer.append(strip)
  document.body.append(layer)

  const run = playFlipbook(strip, book, delay)
  if (!run) {
    layer.remove()
    return
  }
  const remove = () => layer.remove()
  run.addEventListener?.('finish', remove)
  run.addEventListener?.('cancel', remove)
}

/** Lo que se cuenta como un golpe a la vez: más estallidos juntos serían ruido (y en un celular flojo, trabajo). */
const MAX_BURSTS = 3

/**
 * Los monstruos que se fueron del campo al Cementerio entre dos estados de un lado (destruidos o mandados), para su estallido: no si en la misma jugada llegó un monstruo al campo (eran
 * materiales o lo sacrificado para invocarlo) ni los materiales Xyz que se desacoplan. Las Mágicas y Trampas tampoco: una Mágica que se resolvió se va al Cementerio en cada jugada.
 * Hasta `MAX_BURSTS`.
 */
export function burstsOf(before: MatState, after: MatState): string[] {
  if (arrivals(before, after).length > 0) return []

  const fromField = (id: string) => {
    const where = locateCard(before, id)

    return where?.kind === 'spot' && (where.spot === 'mz' || where.spot === 'emz')
  }

  return after.gy.filter((id) => !before.gy.includes(id) && fromField(id)).slice(0, MAX_BURSTS)
}
