import { memo, useCallback, useMemo, useRef } from 'react'

import type { ArrowAnchor, MatArrow } from '../../app/mat-arrows'
import { spotKey, type BoardChange } from '../../app/mat-step-info'
import { placedAt, type MatPile, type MatSpot, type MatState, type Placed } from '../../app/practice-mat'
import { useElementWidth } from '../../app/use-element-width'
import { t } from '../../i18n'
import { cardImageSrc } from '../../app/card-image-source'
import { cx } from '../ui/cx'
import { CARD_BACK } from './practice-styles'

/**
 * El tablero chico de un paso (Gastón, 2026-10-20, con la lista de otro simulador: «nuestras replays y movimientos no se ven así»): la mesa como quedó después de la jugada,
 * con las mismas áreas que la de verdad (siete columnas: la zona de campo y el Extra Deck a la izquierda; el destierro, el cementerio y el deck a la derecha; las Zonas Extra arriba),
 * lo que cambió enmarcado en ámbar (el color de lo que se toca, el del paso actual del reproductor) y, debajo, la mano. Las cartas boca abajo se ven atenuadas, como en la mesa
 * (son tuyas); el deck, el Extra y lo desterrado boca abajo, de dorso. Encima, las flechas blancas de lo que se movió (`arrows`; ver `Arrows`, al final).
 *
 * Es sólo un dibujo (`aria-hidden`: la frase del paso ya lo dice) y no recibe toques: en la lista, el paso entero es el botón. `content-visibility: auto`: en un combo de 70 pasos
 * los tableros que no se ven no se dibujan (`contain-intrinsic-size` reserva su alto mientras tanto, así el scroll no salta).
 */

interface MatSnapshotProps {
  state: MatState
  /** Lo que cambió con la jugada (las casillas, las pilas y las cartas que llegaron a la mano): se enmarca en ámbar. Sin esto, nada. */
  change?: BoardChange
  /** De dónde a dónde fue cada carta (`matArrows`): una flecha blanca por camino. Sin esto, ninguna. */
  arrows?: readonly MatArrow[]
  artOf: (id: string) => string | null
  className?: string
}

/** Una casilla: la línea blanca tenue del campo sobre un fondo más hundido que la tarjeta; la que cambió, con el marco ámbar (sólo el marco: un relleno ámbar sobre el índigo se ve marrón). */
const CELL = 'relative min-w-0 border bg-background/60'
const LOOK = 'border-field-line/15'
const CHANGED = 'border-info'

/** El número de una pila o de los materiales: chico, como el de la mesa (`PileBadge`), sobre un fondo que lo despega del arte. */
const COUNT = 'rounded-full bg-background/80 px-1 text-[0.6rem] font-extrabold leading-tight tabular-nums text-foreground'

export const MatSnapshot = memo(function MatSnapshot({ state, change, arrows, artOf, className }: MatSnapshotProps) {
  const changed = (spot: MatSpot, index: number) => change?.spots.has(spotKey(spot, index)) ?? false
  const pileChanged = (pile: MatPile) => change?.piles.has(pile) ?? false

  return (
    <div aria-hidden="true" data-snapshot="" className={cx('relative grid gap-1.5 [contain-intrinsic-size:auto_10rem] [content-visibility:auto]', className)}>
      {/* Las áreas de la mesa de escritorio (`PracticeMat`): las columnas de los costados miden lo justo de una carta y las cinco del centro son cuadradas. */}
      <div className="grid grid-cols-[minmax(0,0.6857fr)_repeat(5,minmax(0,1fr))_minmax(0,0.6857fr)] gap-0.5 [grid-template-areas:'._._emz1_._emz2_._ban'_'fld_m1_m2_m3_m4_m5_gy'_'extra_s1_s2_s3_s4_s5_deck']">
        {state.emz.map((placed, index) => (
          <Spot key={`emz${index}`} area={`emz${index + 1}`} spot="emz" placed={placed} changed={changed('emz', index)} artOf={artOf} />
        ))}
        {state.mz.map((placed, index) => (
          <Spot key={`mz${index}`} area={`m${index + 1}`} spot="mz" placed={placed} changed={changed('mz', index)} artOf={artOf} />
        ))}
        {state.st.map((placed, index) => (
          <Spot key={`st${index}`} area={`s${index + 1}`} spot="st" placed={placed} changed={changed('st', index)} artOf={artOf} />
        ))}
        <Spot area="fld" spot="field" placed={state.field} changed={changed('field', 0)} artOf={artOf} />
        <Pile area="deck" pile="deck" state={state} changed={pileChanged('deck')} artOf={artOf} />
        <Pile area="extra" pile="extra" state={state} changed={pileChanged('extra')} artOf={artOf} />
        <Pile area="gy" pile="gy" state={state} changed={pileChanged('gy')} artOf={artOf} />
        <Pile area="ban" pile="banished" state={state} changed={pileChanged('banished')} artOf={artOf} />
      </div>

      <div className="flex min-w-0 items-center gap-2">
        <span className={cx('shrink-0 text-micro font-semibold tabular-nums', pileChanged('hand') ? 'text-info-soft' : 'text-soft')}>{t('practice.snapshot.hand', { count: state.hand.length })}</span>
        {/* Encimadas como la mano de la mesa; la que acaba de llegar, con el marco ámbar y por delante. */}
        <span className="flex min-w-0 overflow-hidden py-px pl-px">
          {state.hand.map((id, index) => (
            <span key={id} className={cx('relative aspect-[421/614] h-7 shrink-0 overflow-hidden shadow-[0_0_0_1px_rgb(var(--background-rgb)/0.9)]', index > 0 && '-ml-2', change?.toHand.has(id) && 'z-1 outline-1 outline-info')}>
              <Art url={artOf(id)} />
            </span>
          ))}
        </span>
      </div>

      {arrows && arrows.length > 0 ? <Arrows arrows={arrows} state={state} /> : null}
    </div>
  )
})

/**
 * El arte de una carta en el tablero chico: una imagen sola, sin el esqueleto ni los reintentos de `CardArt` (un combo largo dibuja cientos y son de 24 px; es la misma
 * imagen que la mesa ya pidió, así que sale de la caché). Si no carga, queda la casilla oscura.
 */
function Art({ url }: { url: string | null }) {
  return url ? <img src={cardImageSrc(url)} alt="" loading="lazy" decoding="async" draggable={false} className="block h-full w-full object-cover" /> : null
}

/** Una zona del campo con su carta: parada ocupa el alto de la casilla; en defensa (o boca abajo en una de monstruo) se acuesta a su tamaño, como en la mesa. */
function Spot({ area, spot, placed, changed, artOf }: { area: string; spot: MatSpot; placed: Placed | null; changed: boolean; artOf: (id: string) => string | null }) {
  const sideways = placed !== null && spot !== 'st' && spot !== 'field' && placed.pos !== 'atk'

  return (
    <span className={cx(CELL, spot === 'field' ? 'aspect-[421/614]' : 'aspect-square', changed ? CHANGED : LOOK)} style={{ gridArea: area }}>
      {placed ? (
        <span className={cx('absolute overflow-hidden', spot === 'field' ? 'inset-0' : 'inset-x-0 top-0 mx-auto aspect-[421/614] w-[68.57%]', sideways && 'rotate-90')}>
          <span className={cx('block h-full w-full', placed.pos === 'set' && 'brightness-[0.4] saturate-[0.55]')}>
            <Art url={artOf(placed.id)} />
          </span>
          {placed.materials.length > 0 ? <span className={cx('absolute bottom-0 right-0', COUNT)}>+{placed.materials.length}</span> : null}
          {placed.counters > 0 ? <span className="absolute left-0 top-0 rounded-full bg-warning px-1 text-[0.6rem] font-extrabold leading-tight tabular-nums text-accent-foreground">{placed.counters}</span> : null}
        </span>
      ) : null}
    </span>
  )
}

/** Una pila con su cantidad: el deck y el Extra de dorso (el Extra muestra el último Péndulo boca arriba, si tiene); el cementerio y el destierro, con la carta de arriba. */
function Pile({ area, pile, state, changed, artOf }: { area: string; pile: Exclude<MatPile, 'hand'>; state: MatState; changed: boolean; artOf: (id: string) => string | null }) {
  const cards = state[pile]
  const up = pile === 'extra' ? state.extraUp : []
  const top = pile === 'gy' || pile === 'banished' ? (cards[cards.length - 1] ?? null) : (up[up.length - 1] ?? null)
  const back = pile === 'deck' ? cards.length > 0 : pile === 'extra' ? cards.length > 0 && up.length === 0 : top !== null && state.facedown.includes(top)

  return (
    <span className={cx(CELL, 'aspect-[421/614] overflow-hidden', changed ? CHANGED : LOOK)} style={{ gridArea: area }}>
      {back ? <span className={CARD_BACK} /> : top ? <Art url={artOf(top)} /> : null}
      {cards.length > 0 ? (
        <span className="absolute inset-0 z-2 grid place-items-center">
          <span className={COUNT}>{cards.length}</span>
        </span>
      ) : null}
    </span>
  )
}

/**
 * Las medidas del tablero de arriba, para ubicar las flechas sin medir cada casilla: 2 px entre casillas (`gap-0.5`), las columnas de los costados al 68,57 % de una del
 * centro y filas tan altas como una casilla del centro; la tira de la mano, 6 px más abajo (`gap-1.5`), de 30 px (cartas `h-7` con `py-px`) y con «Mano N» en `text-micro`
 * (16 px de interlineado). Si cambia la grilla, cambian estas.
 */
const GAP = 2
const SIDE = 0.6857
const HAND_GAP = 6
const STRIP = 30
const LABEL = 16
/** El medio de «Mano N»: ahí llegan (y de ahí salen) las flechas de la mano. */
const HAND_X = 20
/** El ancho del tablero en la columna de la mesa: el que vale hasta medirlo (y en las pruebas, que no miden). */
const FALLBACK_WIDTH = 232
/**
 * Cuánto se curva una flecha: una fracción de su largo (así las que van al mismo lugar llegan con el mismo ángulo y terminan en una sola cabeza), hasta 1,3 casillas; si va de borde
 * a borde (sale de una pila o de una casilla que no quedó vacía), al menos 0,8 casillas: entre dos vecinas, con menos, la curva quedaría en el hueco de 2 px.
 */
const BEND = 0.22
/** La cabeza: una V abierta de brazos de 4,5 px a 30° de la línea. */
const ARM = 4.5
const ARM_COS = Math.cos(Math.PI / 6)
const ARM_SIN = Math.sin(Math.PI / 6)
/** El trazo: sin relleno y con las puntas y las esquinas redondeadas (el halo y la línea son el mismo trazo, de distinto ancho). */
const LINE = { fill: 'none', strokeLinecap: 'round', strokeLinejoin: 'round' } as const

/** Dónde va cada pila y cada Zona Extra (fila y columna de la grilla); las zonas de monstruos y de Mágicas y Trampas, en la fila del medio y la de abajo, de la columna 1 a la 5. */
const AREAS: Partial<Record<ArrowAnchor, readonly [number, number]>> = { 'emz:0': [0, 2], 'emz:1': [0, 4], banished: [0, 6], 'field:0': [1, 0], gy: [1, 6], extra: [2, 0], deck: [2, 6] }

interface Point {
  x: number
  y: number
}

interface Box extends Point {
  w: number
  h: number
}

/** La casilla de cada lugar en un tablero de ese ancho (la mano es un punto, arriba de «Mano N») y cuánto mide una casilla del centro y todo el dibujo de alto. */
function boardOf(width: number) {
  const cell = (width - 6 * GAP) / (5 + 2 * SIDE)
  const side = cell * SIDE
  const board = 3 * cell + 2 * GAP
  const boxOf = (anchor: ArrowAnchor): Box | null => {
    if (anchor === 'hand') return { x: HAND_X, y: board + HAND_GAP + (STRIP - LABEL) / 2, w: 0, h: 0 }

    const [spot, n] = anchor.split(':')
    const area = AREAS[anchor] ?? (spot === 'mz' ? [1, Number(n) + 1] : spot === 'st' ? [2, Number(n) + 1] : null)

    if (!area) return null

    const [row, column] = area
    const edge = column === 0 || column === 6

    return { x: column === 0 ? 0 : column === 6 ? width - side : side + GAP + (column - 1) * (cell + GAP), y: row * (cell + GAP), w: edge ? side : cell, h: cell }
  }

  return { cell, height: board + HAND_GAP + STRIP, boxOf }
}

const centerOf = (box: Box): Point => ({ x: box.x + box.w / 2, y: box.y + box.h / 2 })
const clamp = (value: number, low: number, high: number) => Math.min(Math.max(value, low), high)
const pointText = ({ x, y }: Point) => `${x.toFixed(1)} ${y.toFixed(1)}`

/** Por dónde sale la curva de una casilla (o entra): el borde que cruza la recta del centro hacia el punto de control, y `gap` más afuera para no pisar su marco. */
function edgeToward(box: Box, toward: Point, gap: number): Point {
  const center = centerOf(box)
  const dx = toward.x - center.x
  const dy = toward.y - center.y
  const length = Math.hypot(dx, dy) || 1
  const reach = Math.min(dx === 0 ? Infinity : box.w / 2 / Math.abs(dx), dy === 0 ? Infinity : box.h / 2 / Math.abs(dy))

  return { x: center.x + dx * reach + (dx / length) * gap, y: center.y + dy * reach + (dy / length) * gap }
}

/**
 * Una flecha de un lugar a otro: una curva suave (cuadrática) que se abomba hacia arriba —donde el tablero está más libre: la fila de las Zonas Extra— o, si es vertical, hacia
 * el medio, sin salirse del dibujo, y termina en una V abierta en el borde del lugar al que llega (no tapa la carta ni su marco). Sale del medio de la casilla si quedó vacía (la carta se
 * fue: no tapa nada y la flecha se lee aunque las casillas sean vecinas) y, si no, del borde. `label` es dónde va su cantidad: al lado de la mitad de la curva, del lado de afuera.
 */
function arrowPath(from: Box, to: Box, fromMiddle: boolean, width: number, height: number, cell: number): { d: string; label: Point } {
  const a = centerOf(from)
  const b = centerOf(to)
  const mid = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 }
  const length = Math.hypot(b.x - a.x, b.y - a.y) || 1
  const flip = -(b.y - a.y) * (width / 2 - mid.x) + (b.x - a.x) * (-height - mid.y) < 0 ? -1 : 1
  const normal = { x: (flip * -(b.y - a.y)) / length, y: (flip * (b.x - a.x)) / length }
  const edgeToEdge = !fromMiddle && from.w > 0 && to.w > 0
  const bend = clamp(length * BEND, edgeToEdge ? cell * 0.8 : 0, cell * 1.3)
  // El medio de la curva (la mitad entre el medio de la recta y el punto de control) no se sale de la caja.
  const control = { x: clamp(mid.x + normal.x * bend, 4 - mid.x, 2 * width - 4 - mid.x), y: clamp(mid.y + normal.y * bend, 4 - mid.y, 2 * height - 4 - mid.y) }
  const start = fromMiddle ? a : edgeToward(from, control, 1.5)
  const end = edgeToward(to, control, 2.5)
  const reach = Math.hypot(end.x - control.x, end.y - control.y) || 1
  const ux = (end.x - control.x) / reach
  const uy = (end.y - control.y) / reach
  const left = { x: end.x - ARM * (ux * ARM_COS - uy * ARM_SIN), y: end.y - ARM * (uy * ARM_COS + ux * ARM_SIN) }
  const right = { x: end.x - ARM * (ux * ARM_COS + uy * ARM_SIN), y: end.y - ARM * (uy * ARM_COS - ux * ARM_SIN) }
  const apex = { x: (start.x + 2 * control.x + end.x) / 4, y: (start.y + 2 * control.y + end.y) / 4 }

  return {
    d: `M${pointText(start)}Q${pointText(control)} ${pointText(end)}M${pointText(left)}L${pointText(end)}L${pointText(right)}`,
    label: { x: clamp(apex.x + normal.x * 7, 6, width - 6), y: clamp(apex.y + normal.y * 7, 6, height - 6) },
  }
}

/**
 * Las flechas de lo que se movió en el paso, encima del tablero (Gastón, 2026-10-21: «flechas blancas minimalistas que muestren los movimientos de las cartas»): una línea blanca
 * fina con las puntas redondeadas y la cabeza abierta, con un halo muy tenue del índigo del fondo para que se lea sobre el arte (no es una sombra); la cantidad, si varias cartas
 * hicieron el mismo camino, va al lado, sin caja. Primero todos los halos y después todas las líneas: una flecha que cruza a otra no la corta. Los números de las pilas van por
 * encima. Se ubican con el ancho del tablero y las medidas de su grilla, sin medir ninguna casilla: `useElementWidth` sobre la caja del tablero (la madre del dibujo, que tiene su
 * ancho aunque `content-visibility` no dibuje lo de adentro). La caja se toma desde el propio `<svg>`: la referencia de la madre recién se engancha después de este efecto.
 */
function Arrows({ arrows, state }: { arrows: readonly MatArrow[]; state: MatState }) {
  const board = useRef<HTMLElement | null>(null)
  const findBoard = useCallback((svg: SVGSVGElement | null) => {
    board.current = svg?.parentElement ?? null
  }, [])
  const width = useElementWidth(board) || FALLBACK_WIDTH
  const drawn = useMemo(() => {
    const { cell, height, boxOf } = boardOf(width)
    const vacated = (anchor: ArrowAnchor) => {
      const [spot, n] = anchor.split(':')

      return n !== undefined && placedAt(state, spot as MatSpot, Number(n)) === null
    }

    return arrows.flatMap((arrow) => {
      const from = boxOf(arrow.from)
      const to = boxOf(arrow.to)

      return from && to ? [{ key: `${arrow.from}>${arrow.to}`, count: arrow.count, ...arrowPath(from, to, vacated(arrow.from), width, height, cell) }] : []
    })
  }, [arrows, state, width])

  return (
    <svg ref={findBoard} aria-hidden="true" data-arrows="" className="pointer-events-none absolute inset-0 size-full">
      {drawn.map((arrow) => (
        <path key={arrow.key} d={arrow.d} {...LINE} strokeWidth={3.5} className="stroke-background/55" />
      ))}
      {drawn.map((arrow) => (
        <path key={arrow.key} data-arrow={arrow.key} d={arrow.d} {...LINE} strokeWidth={1.35} className="stroke-field-line" />
      ))}
      {drawn.map((arrow) =>
        arrow.count > 1 ? (
          <text key={arrow.key} x={arrow.label.x} y={arrow.label.y} textAnchor="middle" dominantBaseline="central" strokeWidth={2.5} className="fill-foreground stroke-background/70 text-[0.6rem] font-extrabold tabular-nums [paint-order:stroke]">
            ×{arrow.count}
          </text>
        ) : null,
      )}
    </svg>
  )
}
