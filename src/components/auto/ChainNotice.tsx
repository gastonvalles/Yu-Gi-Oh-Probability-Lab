import { useEffect, useState } from 'react'

import { CHAIN_LEAVE_MS, type ChainOutcome, type ChainRowState } from '../../app/auto/chain-feed'

// El catálogo corre la escena con el ritmo real: los valores del núcleo salen de acá (`auto-isolation.test.ts`).
export { CHAIN_LEAVE_MS, CHAIN_LINGER_MS, chainDwell, chainFeed } from '../../app/auto/chain-feed'
import { frameClass, type CardFrame } from '../../app/card-frame'
import { DESKTOP_DECK_BUILDER_MEDIA_QUERY, useMediaQuery } from '../../app/use-media-query'
import { t } from '../../i18n'
import { CardArt } from '../CardArt'
import { cx } from '../ui/cx'

/** Un eslabón como lo muestra la cadena: su número, de quién es y la carta. */
export interface ChainNoticeRow {
  /** 1 = el primero. */
  number: number
  /** «Vos» o el nombre del rival (el catálogo lo pasa). */
  who?: string
  /** Es tuyo (lo dice su nombre accesible; el número va blanco y celeste para los dos, como en Master Duel). */
  mine: boolean
  name: string
  art: string | null
  /** El tipo de la carta: sin imagen, el fondo va en el color de su marco (`frameKindOf`). Sin esto, neutro. */
  frame?: CardFrame
  state: ChainRowState
  /** Negado o sin efecto: el eslabón que lo hizo (1 = el primero), si se sabe. */
  by?: number
  /** Resuelta: lo que hizo, si el núcleo lo dice sin duda («Añade 1 carta», `outcomeLabel`). */
  outcome?: string
}

export const outcomeLabel = ({ kind, count }: ChainOutcome) => t(`auto.chain.outcome.${kind}`, { count })

/** Qué le pasa a un eslabón, en palabras y sin números de eslabón: lo que hizo, «Sin efecto por Ash Blossom» o su estado. */
export const whatHappened = (row: ChainNoticeRow, rows: readonly ChainNoticeRow[]) => {
  const by = row.by ? rows.find((link) => link.number === row.by)?.name : undefined
  const state = t(`auto.chain.state.${row.state}`)

  return row.outcome ?? (by ? t('auto.chain.byCard', { state, card: by }) : state)
}

/**
 * Dónde queda cada carta en la escena (de 3:4) cuando espera, por lo nueva que es (`[0]`, la última que entró), como en Master Duel: la última, abajo y adelante, la más grande; la
 * anterior, arriba en la esquina opuesta, más chica, separadas para que la cadena cuelgue en el hueco; las de antes, cada vez más chicas y más arriba. **Alternan de lado** como en el
 * video de Master Duel: un eslabón impar entra abajo a la izquierda (`left`) y uno par abajo a la derecha (`right`, el espejo). En escritorio se separan más (`wide`: la capa del
 * campo tiene ancho de sobra). Al entrar otra, todas se corren un lugar (sólo `transform`). Se mueven con `translate` desde el centro (fracciones de la carta: un tercio del ancho).
 * `bond` es el centro de cada lugar en el `viewBox` de 300 × 400 de la cadena (la carta mide 100 × 146 y su centro sin correr es 150, 187); `side`, de qué lado queda (el número va en
 * la esquina de abajo de ese lado). La inclinación 3D, quieta, va en `chain-tilt-*` (`index.css`).
 */
const LAYOUT = {
  narrow: {
    left: {
      depth: [
        'z-5 -translate-x-2/5 translate-y-1/2 -rotate-8 scale-140 chain-tilt-front',
        'translate-x-4/5 -translate-y-2/5 rotate-5 scale-95 chain-tilt-back',
        '-translate-x-4/5 -translate-y-3/5 -rotate-3 scale-75 chain-tilt-back',
        'translate-x-1/10 -translate-y-3/4 rotate-3 scale-60 chain-tilt-back',
      ],
      bond: [
        [110, 260],
        [230, 129],
        [70, 100],
        [160, 78],
      ],
    },
    right: {
      depth: [
        'z-5 translate-x-2/5 translate-y-1/2 rotate-8 scale-140 chain-tilt-front-flip',
        '-translate-x-4/5 -translate-y-2/5 -rotate-5 scale-95 chain-tilt-back-flip',
        'translate-x-4/5 -translate-y-3/5 rotate-3 scale-75 chain-tilt-back-flip',
        '-translate-x-1/10 -translate-y-3/4 -rotate-3 scale-60 chain-tilt-back-flip',
      ],
      bond: [
        [190, 260],
        [70, 129],
        [230, 100],
        [140, 78],
      ],
    },
  },
  wide: {
    left: {
      depth: [
        'z-5 -translate-x-4/5 translate-y-1/2 -rotate-8 scale-150 chain-tilt-front',
        'translate-x-6/5 -translate-y-1/3 rotate-5 scale-100 chain-tilt-back',
        '-translate-x-1/5 -translate-y-2/3 -rotate-3 scale-75 chain-tilt-back',
        'translate-x-2/5 -translate-y-full rotate-3 scale-60 chain-tilt-back',
      ],
      bond: [
        [70, 260],
        [270, 138],
        [130, 90],
        [190, 41],
      ],
    },
    right: {
      depth: [
        'z-5 translate-x-4/5 translate-y-1/2 rotate-8 scale-150 chain-tilt-front-flip',
        '-translate-x-6/5 -translate-y-1/3 -rotate-5 scale-100 chain-tilt-back-flip',
        'translate-x-1/5 -translate-y-2/3 rotate-3 scale-75 chain-tilt-back-flip',
        '-translate-x-2/5 -translate-y-full -rotate-3 scale-60 chain-tilt-back-flip',
      ],
      bond: [
        [230, 260],
        [30, 138],
        [170, 90],
        [110, 41],
      ],
    },
  },
} satisfies Record<string, Record<'left' | 'right', { depth: string[]; bond: Array<readonly [number, number]> }>>
/** De qué lado queda cada lugar cuando la última entró a la izquierda (con la última a la derecha, al revés). */
const SIDE_LEFT = ['left', 'right', 'left', 'right'] as const
/** El número pisa la esquina de abajo del lado de afuera de su carta. */
const NUMBER_CORNER = { left: 'bottom-0 left-0 -translate-x-1/3 translate-y-1/3', right: 'bottom-0 right-0 translate-x-1/3 translate-y-1/3' } as const
/** Cuánto tarda en apagarse un tramo de cadena que quedó entre lugares viejos (lo que dura su transición). */
const FADE_MS = 250
/** Cuántas cartas se ven a la vez; las de antes se achican y se van hacia arriba, y vuelven cuando se resuelven las de adelante. */
const SHOWN = LAYOUT.narrow.left.depth.length
/** Cada cuánto va un eslabón a lo largo de la cadena y cuánto cuelga en el medio (en unidades del `viewBox`): eslabones chicos y apretados, como en Master Duel. */
const LINK_STEP = 10.5
const SAG = 30

type Pose = 'slot' | 'back' | 'out'

/** Cuánto se mete la cadena en cada carta desde su centro, por su lugar (las grandes, más): cruza de borde a borde y pisa un poco cada carta, como en Master Duel. */
const BOND_TRIM = [44, 30, 22, 18]

type Point = readonly [number, number]

/** Los lugares de los eslabones sobre una cadena que cuelga de `from` a `to` (una curva con su panza hacia abajo, `sag`): cada `step`, con su ángulo. */
export function hangingLinks(from: Point, to: Point, sag: number, step = LINK_STEP): Array<{ x: number; y: number; angle: number }> {
  const control: Point = [(from[0] + to[0]) / 2, (from[1] + to[1]) / 2 + sag]
  const at = (t: number): Point => [(1 - t) ** 2 * from[0] + 2 * (1 - t) * t * control[0] + t ** 2 * to[0], (1 - t) ** 2 * from[1] + 2 * (1 - t) * t * control[1] + t ** 2 * to[1]]
  const links: Array<{ x: number; y: number; angle: number }> = []
  let [x, y] = from
  let walked = step / 2

  for (let i = 1; i <= 80; i += 1) {
    const [nx, ny] = at(i / 80)
    const piece = Math.hypot(nx - x, ny - y)

    while (walked <= piece && piece > 0) {
      links.push({ x: x + ((nx - x) * walked) / piece, y: y + ((ny - y) * walked) / piece, angle: (Math.atan2(ny - y, nx - x) * 180) / Math.PI })
      walked += step
    }
    walked -= piece
    ;[x, y] = [nx, ny]
  }
  return links
}

/**
 * Los eslabones de metal, dibujados por nosotros: chicos y apretados, alternan uno de frente (un aro) y uno de canto (una barra). Cada uno con su sombra abajo, su cuerpo plateado y su
 * brillo arriba (el volumen son trazos quietos corridos, sin gradientes ni filtros). `size`: 1 en la escena, menos en las esquinas de las cartas.
 */
function Links({ links, size = 1, offset = 0 }: { links: ReadonlyArray<{ x: number; y: number; angle: number }>; size?: number; offset?: number }) {
  const w = 16 * size
  const h = 9 * size
  const s = size

  return links.map(({ x, y, angle }, i) => (
    <g key={i} transform={`translate(${x} ${y}) rotate(${angle})`}>
      {(i + offset) % 2 === 0 ? (
        <>
          <rect x={-w / 2} y={-h / 2 + 0.8 * s} width={w} height={h} rx={h / 2} strokeWidth={4.4 * s} className="fill-none stroke-chain-metal-lo" />
          <rect x={-w / 2} y={-h / 2} width={w} height={h} rx={h / 2} strokeWidth={3 * s} className="fill-none stroke-chain-metal" />
          <rect x={-w / 2 + 2.2 * s} y={-h / 2 - 0.9 * s} width={w - 4.4 * s} height={1.4 * s} rx={0.7 * s} className="fill-chain-metal-hi" />
        </>
      ) : (
        <>
          <rect x={-w / 2} y={-2.6 * s} width={w} height={6 * s} rx={2.6 * s} className="fill-chain-metal-lo" />
          <rect x={-w / 2 + 0.8 * s} y={-2.6 * s} width={w - 1.6 * s} height={4.2 * s} rx={2.1 * s} className="fill-chain-metal" />
          <rect x={-w / 2 + 2.4 * s} y={-2.2 * s} width={w - 4.8 * s} height={1.2 * s} rx={0.6 * s} className="fill-chain-metal-hi" />
        </>
      )}
    </g>
  ))
}

/**
 * La cadena entre dos cartas, colgando y por encima de ellas. Se dibuja entre los lugares a los que van las cartas, así que entra recién cuando llegaron (`delay-300`, con opacidad) y
 * la que quedó entre los lugares viejos se apaga mientras viajan (`fading`), nunca de golpe. Al empezar a resolverse (`broken`) se corta en el medio: las dos mitades se separan y se
 * apagan (sólo `translate`/`opacity`, en lo que dura la salida de la escena; con movimiento reducido, sólo se apagan).
 */
function Bond({ number, from, to, fromAt, toAt, broken = false, fading = false }: { number: number; from: Point; to: Point; fromAt: number; toAt: number; broken?: boolean; fading?: boolean }) {
  const length = Math.hypot(to[0] - from[0], to[1] - from[1]) || 1
  const [ux, uy] = [(to[0] - from[0]) / length, (to[1] - from[1]) / length]
  const start: Point = [from[0] + ux * BOND_TRIM[fromAt]!, from[1] + uy * BOND_TRIM[fromAt]!]
  const end: Point = [to[0] - ux * BOND_TRIM[toAt]!, to[1] - uy * BOND_TRIM[toAt]!]
  const links = hangingLinks(start, end, SAG)
  const half = Math.ceil(links.length / 2)

  return (
    <g
      data-chain-bond={number}
      {...(broken ? { 'data-broken': '' } : {})}
      {...(fading ? { 'data-fading': '' } : {})}
      className={cx('transition-opacity duration-200 ease-out motion-reduce:transition-opacity', fading ? 'opacity-0' : 'opacity-100 delay-300 starting:opacity-0')}
    >
      {[links.slice(0, half), links.slice(half)].map((piece, i) => (
        <g key={i} className={cx('transition-[translate,opacity] duration-200 ease-out motion-reduce:transition-opacity', broken && (i === 0 ? '-translate-x-3 translate-y-2 opacity-0' : 'translate-x-3 translate-y-2 opacity-0'))}>
          <Links links={piece} offset={i === 0 ? 0 : half} />
        </g>
      ))}
    </g>
  )
}

/** Los tramos cortos de cadena (unos cinco eslabones) que abrazan dos esquinas de cada carta (arriba a la izquierda y abajo a la derecha), en el `viewBox` de la carta (100 × 146). */
const CORNER_TIES: ReadonlyArray<readonly [Point, Point]> = [
  [
    [-11, 22],
    [22, -11],
  ],
  [
    [78, 157],
    [111, 124],
  ],
]

/**
 * Los dígitos del número, en bloques (3 × 5 celdas de 14, gruesos y cuadrados como el número de Master Duel, dibujados por nosotros): el 1 con su banderita y su base. Cada fila
 * dice qué celdas van llenas.
 */
const GLYPHS: readonly string[][] = [
  ['###', '#.#', '#.#', '#.#', '###'],
  ['##.', '.#.', '.#.', '.#.', '###'],
  ['###', '..#', '###', '#..', '###'],
  ['###', '..#', '###', '..#', '###'],
  ['#.#', '#.#', '###', '..#', '..#'],
  ['###', '#..', '###', '..#', '###'],
  ['###', '#..', '###', '#.#', '###'],
  ['###', '..#', '..#', '..#', '..#'],
  ['###', '#.#', '###', '#.#', '###'],
  ['###', '#.#', '###', '..#', '###'],
]
const CELL = 14
const DIGIT_STEP = 3 * CELL + 10
/** Las celdas de un número, dígito por dígito: cada una, un cuadrado. */
export const glyphCells = (value: number) =>
  [...String(value)].flatMap((digit, i) => (GLYPHS[Number(digit)] ?? []).flatMap((line, row) => [...line].flatMap((cell, col) => (cell === '#' ? [{ x: DIGIT_STEP * i + col * CELL, y: row * CELL }] : []))))

/**
 * El número del eslabón como en Master Duel: blanco, en bloques gruesos, con contorno y resplandor celestes bien marcados, el mismo para los dos jugadores. Tres capas quietas, cada
 * una con todas las celdas (así no se ven las uniones): el halo ancho y tenue, el contorno y el relleno blanco encima. `flash`: la copia amarilla que destella al entrar.
 */
function ChainNumber({ value, flash = false, className }: { value: number; flash?: boolean; className?: string }) {
  // Todas las celdas en un solo camino: el relleno es la unión, sin costuras entre celdas.
  const d = glyphCells(value)
    .map(({ x, y }) => `M${x} ${y}h${CELL}v${CELL}h-${CELL}z`)
    .join('')
  const layer = (strokeWidth: number, tone: string) => <path d={d} {...(strokeWidth ? { strokeWidth, strokeLinejoin: 'miter' as const } : {})} className={tone} />


  return (
    <svg aria-hidden="true" {...(flash ? { 'data-chain-flash': '' } : {})} viewBox={`-12 -12 ${DIGIT_STEP * String(value).length + 14} ${5 * CELL + 24}`} className={cx('absolute h-1/2 overflow-visible', className)}>
      {flash ? (
        layer(16, 'fill-chain-flash stroke-chain-flash/60')
      ) : (
        <>
          <g>{layer(18, 'fill-chain-glow/30 stroke-chain-glow/25')}</g>
          <g>{layer(8, 'fill-chain-glow stroke-chain-glow')}</g>
          <g>{layer(0, 'fill-white')}</g>
        </>
      )}
    </svg>
  )
}

/** Los rayos del estallido de entrada (en un `viewBox` de −100 a 100): 18, de largo alternado, desde el centro. */
const BURST_RAYS = Array.from({ length: 18 }, (_, i) => ({ angle: i * 20, reach: i % 2 === 0 ? 98 : 72 }))

/** El estallido de rayos dorados que sale de atrás de la carta que entra (Master Duel): una capa quieta que escala y se apaga (`animate-fx-flash`); con movimiento reducido, no está. */
function Burst() {
  return (
    <span aria-hidden="true" data-chain-burst="" className="absolute -inset-1/2 -z-1 animate-fx-flash motion-reduce:hidden">
      <svg viewBox="-100 -100 200 200" preserveAspectRatio="none" className="block size-full overflow-visible">
        {BURST_RAYS.map(({ angle, reach }) => (
          <polygon key={angle} points={`-5,0 5,0 0,-${reach}`} transform={`rotate(${angle})`} className="fill-chain-burst/70" />
        ))}
        <circle r={34} className="fill-chain-flash/50" />
      </svg>
    </span>
  )
}

/**
 * La cadena en grande del duelo automático, **sólo al encadenar**, igual a Master Duel (Gastón: «debemos clonar esto, debe quedar igual de ser posible»; todo dibujado por nosotros).
 * La pone la mesa en `duel.chain`, en la capa centrada sobre el campo: llena su alto (3:4; quien la usa le da un alto).
 * - **Armar:** cada activación entra grande y derecha desde el centro y cae inclinada a su lugar (`starting:`), con un estallido de rayos dorados detrás (`Burst`) y un destello
 *   amarillo alrededor de la carta y de su número. La última va adelante y abajo, la más grande, alternando de lado (impar a la izquierda, par a la derecha); la anterior, arriba en la
 *   esquina opuesta; las de antes, más chicas y más arriba (`LAYOUT`); desde la quinta, se van hacia arriba. Cada carta entera, con su halo blanco (una sombra quieta), una leve
 *   inclinación 3D y atada por dos esquinas con cadena; entre carta y carta la cadena, de eslabones chicos, cuelga en curva por delante. El número, enorme, blanco en bloques con
 *   contorno y resplandor celestes (`ChainNumber`), pisa la esquina de abajo del lado de afuera. Con dos o más, «CADENA» (itálica) aparece al medio, por delante, y se queda. El
 *   nombre va sólo en la carta sin imagen (con imagen ya está impreso). Al empezar a resolver, la cadena se corta en el medio mientras la escena se va.
 * - **El velo:** mientras está, el campo de atrás baja y se azula (una capa al lado de la escena que llena la capa de la mesa, sólo `opacity`); no ataja toques.
 * - **Sin línea a la vista:** «Se resuelve del último al primero» (y, resolviendo, qué pasó con cada uno) va en un `role="status"` oculto, para el lector de pantalla.
 * - **Respondiendo** (`answering`, con la hoja o la ventana de «¿Respondés?» abierta): la escena se achica hacia arriba, así el número de la última carta no queda debajo del cartel.
 * - **Corrida** (`away`, mientras el núcleo pregunta algo que no es responder): ni cartas, ni velo a la vista, y vuelve después.
 * - **Resolver**: apenas empieza, la escena y el velo se van con un fundido corto (`CHAIN_LEAVE_MS`, sin alargar `chainDwell`) y no vuelven; quedan los medallones donde se activó cada
 *   eslabón (`ChainBadge`, `medalsOf`) y lo que pasó, en la línea oculta y en Pasos.
 * - Sólo se anima `translate`/`rotate`/`scale`/`opacity`; el halo, el resplandor y el volumen de la cadena son capas quietas. Con movimiento reducido aparece y se va sin moverse ni
 *   destellar (sólo la opacidad). No ataja toques (`pointer-events-none`). El ritmo lo pone quien la usa (`chainDwell`, `use-auto-asks.tsx`).
 */
export function ChainStage({
  rows,
  current,
  done = false,
  away = false,
  answering = false,
}: {
  rows: readonly ChainNoticeRow[]
  /** El que se resuelve (índice en `rows`); -1 mientras se arma. */
  current: number
  done?: boolean
  /** Se corre: el núcleo te pregunta algo que no es responder (el campo se ve entero). */
  away?: boolean
  /** Está abierto «¿Respondés?»: la escena se achica hacia arriba. */
  answering?: boolean
}) {
  // Resolviendo (algún eslabón dejó de esperar) o terminada: la escena se va con un fundido y queda sólo la línea oculta.
  const over = done || current >= 0 || rows.some((link) => link.state !== 'chained')
  const [gone, setGone] = useState(over)

  if (!over && gone) setGone(false)
  useEffect(() => {
    if (!over) return
    const timer = window.setTimeout(() => setGone(true), CHAIN_LEAVE_MS)

    return () => window.clearTimeout(timer)
  }, [over])
  // En escritorio las cartas se separan más (la capa del campo tiene ancho de sobra).
  // La última entra de un lado y la anterior queda arriba del otro, alternando (impar a la izquierda, par a la derecha).
  const mirror = (rows[rows.length - 1]?.number ?? 1) % 2 === 0
  const { depth: DEPTH, bond: BOND } = LAYOUT[useMediaQuery(DESKTOP_DECK_BUILDER_MEDIA_QUERY) ? 'wide' : 'narrow'][mirror ? 'right' : 'left']
  const sideOf = (at: number) => {
    const side = SIDE_LEFT[Math.min(at, SHOWN - 1)]!

    return mirror ? (side === 'left' ? 'right' : 'left') : side
  }
  const row = rows[current >= 0 ? current : rows.length - 1]
  const depth = (index: number) => rows.length - 1 - index
  const pose = (index: number): Pose => (away ? 'out' : depth(index) >= SHOWN ? 'back' : 'slot')
  const hidden = away || over
  // La cadena entre cada carta y la anterior, mientras las dos están en la escena: un tramo por par de lugares. Cuando las cartas se corren, el tramo viejo se apaga (`fading`, un rato)
  // y el nuevo entra cuando llegan.
  const bonds = rows.flatMap((link, index) =>
    index === 0 || pose(index - 1) !== 'slot' || pose(index) !== 'slot'
      ? []
      : [{ key: `${link.number}:${BOND[depth(index - 1)]!.join()}:${BOND[depth(index)]!.join()}`, number: link.number, from: BOND[depth(index - 1)]!, to: BOND[depth(index)]!, fromAt: depth(index - 1), toAt: depth(index) }],
  )
  const [drawn, setDrawn] = useState(bonds)
  const [fading, setFading] = useState<typeof bonds>([])
  const isNow = (key: string) => bonds.some((bond) => bond.key === key)

  if (bonds.map((bond) => bond.key).join() !== drawn.map((bond) => bond.key).join()) {
    setFading([...fading, ...drawn].filter((bond) => !isNow(bond.key)))
    setDrawn(bonds)
  }
  useEffect(() => {
    if (!fading.length) return
    const timer = window.setTimeout(() => setFading([]), FADE_MS)

    return () => window.clearTimeout(timer)
  }, [fading])
  const status = (
    <p data-testid={over ? 'chain-notice' : undefined} role="status" className="sr-only">
      {current < 0 || !row ? t('auto.chain.order') : t('auto.chain.say', { card: row.name, what: whatHappened(row, rows) })}
    </p>
  )

  if (!row) return null
  if (over && gone) return status
  return (
    <>
      <div aria-hidden="true" data-chain-veil="" className={cx('pointer-events-none absolute inset-0 bg-chain-veil/65 transition-opacity duration-200 ease-out starting:opacity-0 motion-reduce:transition-opacity', hidden ? 'opacity-0' : 'opacity-100')} />
      {/* Mientras entra un eslabón, el campo baja todavía más. */}
      {hidden ? null : <div key={`veil-${rows.length}`} aria-hidden="true" data-chain-dim="" className="pointer-events-none absolute inset-0 animate-chain-veil bg-chain-veil/45 motion-reduce:hidden" />}
      <div
        data-testid={over ? undefined : 'chain-notice'}
        data-chain-stage=""
        {...(away ? { 'data-away': '' } : {})}
        {...(over ? { 'data-leaving': '' } : {})}
        className={cx(
          'pointer-events-none relative aspect-3/4 h-full max-w-full origin-top select-none transition-[scale,opacity] duration-200 ease-out motion-reduce:transition-opacity',
          answering && 'scale-85',
          over && 'opacity-0',
        )}
      >
        <svg aria-hidden="true" viewBox="0 0 300 400" className="absolute inset-0 z-6 size-full overflow-visible">
          {[...fading.map((bond) => ({ ...bond, gone: true })), ...bonds.map((bond) => ({ ...bond, gone: false }))].map(({ key, gone, ...bond }) => (
            <Bond key={key} {...bond} broken={over} fading={gone} />
          ))}
        </svg>
        {rows.map((link, index) => {
          const at = pose(index)
          // La que acaba de entrar: adelante y más grande, con su destello alrededor y en su número.
          const newest = index === rows.length - 1 && !hidden
          // El número pisa la esquina de abajo del lado de afuera de su carta (como en Master Duel).
          const corner = NUMBER_CORNER[sideOf(depth(index))]

          return (
            <div
              key={link.number}
              role="img"
              aria-label={t(link.mine ? 'auto.chain.linkMine' : 'auto.chain.linkTheirs', { number: link.number, card: link.name, state: whatHappened(link, rows) })}
              data-chain-card={link.number}
              data-pose={at}
              className={cx(
                'absolute left-1/3 top-2/7 aspect-[421/614] w-1/3 shadow-chain-halo transition-[translate,rotate,scale,opacity,transform] duration-350 ease-in-out starting:translate-x-0 starting:translate-y-0 starting:rotate-0 starting:scale-150 starting:opacity-0 motion-reduce:transition-opacity',
                link.art ? 'bg-input' : link.frame ? frameClass(link.frame) : 'bg-input',
                newest && 'delay-100',
                at === 'out' ? '-translate-y-1/4 scale-80 opacity-0' : at === 'back' ? '-translate-y-full scale-50 opacity-0' : DEPTH[depth(index)],
              )}
            >
              {newest ? <Burst /> : null}
              <CardArt remoteUrl={link.art} name={link.name} {...(link.frame ? { frame: link.frame } : {})} className="block size-full object-cover" />
              {link.art ? null : <span data-chain-name="" className="absolute inset-x-1 top-1 truncate bg-background/85 px-1 text-micro font-semibold text-foreground">{link.name}</span>}
              {newest ? <span aria-hidden="true" data-chain-glow="" className="absolute -inset-2 animate-fx-flash border-4 border-chain-flash motion-reduce:hidden" /> : null}
              <svg aria-hidden="true" viewBox="0 0 100 146" preserveAspectRatio="none" data-chain-ties="" className="absolute inset-0 size-full overflow-visible">
                {CORNER_TIES.map(([from, to], i) => (
                  <Links key={i} links={hangingLinks(from, to, 2, 7.5)} size={0.7} />
                ))}
              </svg>
              <span aria-hidden="true" data-chain-number={link.number} className="contents">
                <ChainNumber value={link.number} className={corner} />
                {newest ? <ChainNumber value={link.number} flash className={cx(corner, 'animate-fx-flash motion-reduce:hidden')} /> : null}
              </span>
            </div>
          )
        })}
        {/* «CADENA» (con dos o más): grande, blanca e itálica, al medio, entre las cartas y por delante; aparece cuando la carta se asienta y se queda hasta que se va la escena. */}
        {rows.length > 1 && !hidden ? (
          <span key={rows.length} aria-hidden="true" data-chain-word="" className="absolute inset-x-0 top-2/5 z-7 flex justify-center text-title font-extrabold uppercase italic text-white text-shadow-lg text-shadow-chain-glow transition-[opacity,scale] delay-100 duration-300 ease-out starting:scale-75 starting:opacity-0 motion-reduce:transition-opacity min-[1101px]:text-display">
            {t('auto.chain.title')}
          </span>
        ) : null}
        {over ? null : status}
      </div>
      {over ? status : null}
    </>
  )
}

