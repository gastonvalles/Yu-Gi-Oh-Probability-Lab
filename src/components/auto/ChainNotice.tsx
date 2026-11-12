import { useEffect, useState } from 'react'

import { CHAIN_LEAVE_MS, type ChainOutcome, type ChainRowState } from '../../app/auto/chain-feed'

// El catálogo corre la escena con el ritmo real: los valores del núcleo salen de acá (`auto-isolation.test.ts`).
export { CHAIN_LEAVE_MS, CHAIN_LINGER_MS, chainDwell, chainFeed } from '../../app/auto/chain-feed'
import { frameClass, type CardFrame } from '../../app/card-frame'
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
 * Dónde queda cada carta en la escena (de 3:4) cuando espera, por lo nueva que es (`DEPTH[0]`, la última que entró), como en Master Duel: la última, abajo a la izquierda, la más
 * grande, adelante y girada −8°; la anterior, arriba a la derecha, más chica y girada +5°; las de antes, cada vez más chicas y más arriba (en zigzag). Al entrar otra, todas se corren
 * un lugar (sólo `transform`). Se mueven con `translate` desde el centro (fracciones de la carta: un tercio del ancho). `BOND` es el centro de cada lugar en el `viewBox` de 300 × 400
 * de la cadena (la carta mide 100 × 146 y su centro sin correr es 150, 187).
 */
const DEPTH = [
  'z-5 -translate-x-1/3 translate-y-1/2 -rotate-8 scale-150',
  'translate-x-3/4 -translate-y-1/3 rotate-5 scale-100',
  '-translate-x-4/5 -translate-y-3/5 -rotate-3 scale-75',
  'translate-x-1/10 -translate-y-3/4 rotate-3 scale-60',
]
const BOND = [
  [118, 260],
  [225, 138],
  [70, 100],
  [160, 78],
] as const
/** Cuántas cartas se ven a la vez; las de antes se achican y se van hacia arriba, y vuelven cuando se resuelven las de adelante. */
const SHOWN = DEPTH.length
/** Cada cuánto va un eslabón a lo largo de la cadena y cuánto cuelga en el medio (en unidades del `viewBox`). */
const LINK_STEP = 19
const SAG = 34

type Pose = 'slot' | 'back' | 'out'

/** Cuánto se mete la cadena en cada carta desde su centro, por su lugar (las grandes, más): cruza de borde a borde y pisa un poco cada carta, como en Master Duel. */
const BOND_TRIM = [34, 22, 18, 14]

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
 * Los eslabones de metal, dibujados por nosotros: alternan uno de frente (un aro) y uno de canto (una barra), cada uno con su sombra, su cuerpo plateado y su brillo arriba (el
 * volumen son tres trazos quietos, sin gradientes ni filtros). `size`: 1 en la escena, menos en las esquinas de las cartas.
 */
function Links({ links, size = 1 }: { links: ReadonlyArray<{ x: number; y: number; angle: number }>; size?: number }) {
  const w = 26 * size
  const h = 14 * size

  return links.map(({ x, y, angle }, i) => (
    <g key={i} transform={`translate(${x} ${y}) rotate(${angle})`}>
      {i % 2 === 0 ? (
        <>
          <rect x={-w / 2} y={-h / 2} width={w} height={h} rx={h / 2} strokeWidth={6.5 * size} className="fill-none stroke-chain-metal-lo" />
          <rect x={-w / 2} y={-h / 2} width={w} height={h} rx={h / 2} strokeWidth={4.2 * size} className="fill-none stroke-chain-metal" />
          <rect x={-w / 2 + 2 * size} y={-h / 2 - 0.8 * size} width={w - 4 * size} height={h - 2 * size} rx={(h - 2 * size) / 2} strokeWidth={1.4 * size} className="fill-none stroke-chain-metal-hi" />
        </>
      ) : (
        <>
          <rect x={-w / 2} y={-3.4 * size} width={w} height={6.8 * size} rx={3.4 * size} className="fill-chain-metal-lo" />
          <rect x={-w / 2 + 1 * size} y={-2.4 * size} width={w - 2 * size} height={4.4 * size} rx={2.2 * size} className="fill-chain-metal" />
          <rect x={-w / 2 + 3 * size} y={-2 * size} width={w - 6 * size} height={1.3 * size} rx={0.65 * size} className="fill-chain-metal-hi" />
        </>
      )}
    </g>
  ))
}

/** La cadena entre dos cartas, colgando y por encima de ellas. Entra con opacidad. */
function Bond({ number, from, to, fromAt, toAt }: { number: number; from: Point; to: Point; fromAt: number; toAt: number }) {
  const length = Math.hypot(to[0] - from[0], to[1] - from[1]) || 1
  const [ux, uy] = [(to[0] - from[0]) / length, (to[1] - from[1]) / length]
  const start: Point = [from[0] + ux * BOND_TRIM[fromAt]!, from[1] + uy * BOND_TRIM[fromAt]!]
  const end: Point = [to[0] - ux * BOND_TRIM[toAt]!, to[1] - uy * BOND_TRIM[toAt]!]

  return (
    <g data-chain-bond={number} className="opacity-100 transition-opacity duration-300 ease-snap starting:opacity-0 motion-reduce:transition-opacity">
      <Links links={hangingLinks(start, end, SAG)} />
    </g>
  )
}

/** Los tramos de cadena que atan cada carta por dos esquinas (arriba a la izquierda y abajo a la derecha), en el `viewBox` de la carta (100 × 146): pasan por delante de ella. */
const CORNER_TIES: ReadonlyArray<readonly [Point, Point]> = [
  [
    [-17, 30],
    [30, -17],
  ],
  [
    [70, 163],
    [117, 116],
  ],
]

/** Los siete segmentos de cada dígito (a b c d e f g), cuadrados y encimados, en una caja de 40 × 68 con trazo de 11: el número «digital» de la escena, dibujado por nosotros. */
const SEGMENTS: Record<string, string> = {
  a: 'M0 0h40v11h-40z',
  b: 'M29 0h11v40h-11z',
  c: 'M29 28.5h11v39.5h-11z',
  d: 'M0 57h40v11h-40z',
  e: 'M0 28.5h11v39.5h-11z',
  f: 'M0 0h11v40h-11z',
  g: 'M0 28.5h40v11h-40z',
}
const DIGITS = ['abcdef', 'bc', 'abged', 'abgcd', 'fgbc', 'afgcd', 'afgedc', 'abc', 'abcdefg', 'abcdfg']
/** Los segmentos de un número, dígito por dígito (cada uno 50 a la derecha del anterior). */
const segmentsOf = (value: number) => [...String(value)].flatMap((digit, i) => (DIGITS[Number(digit)] ?? '').split('').map((segment) => ({ key: `${i}${segment}`, d: SEGMENTS[segment]!, x: 50 * i })))

/**
 * El número del eslabón como en Master Duel: blanco, de trazo cuadrado, con contorno y resplandor celestes, el mismo para los dos jugadores. Tres capas quietas, cada una con todos
 * los segmentos (así no se ven las uniones): el halo ancho y tenue, el contorno y el relleno blanco encima. `flash`: la copia amarilla que destella al entrar.
 */
function ChainNumber({ value, flash = false, className }: { value: number; flash?: boolean; className?: string }) {
  const segments = segmentsOf(value)
  const layer = (strokeWidth: number, tone: string, stroke = true) =>
    segments.map(({ key, d, x }) => <path key={key} d={d} transform={`translate(${x} 0)`} {...(stroke ? { strokeWidth, strokeLinejoin: 'round' as const } : {})} className={tone} />)

  return (
    <svg aria-hidden="true" {...(flash ? { 'data-chain-flash': '' } : {})} viewBox={`-10 -10 ${50 * String(value).length + 10} 88`} className={cx('absolute h-1/2 overflow-visible', className)}>
      {flash ? (
        layer(14, 'fill-chain-flash stroke-chain-flash/60')
      ) : (
        <>
          <g>{layer(16, 'fill-chain-glow/30 stroke-chain-glow/25')}</g>
          <g>{layer(6, 'fill-chain-glow stroke-chain-glow')}</g>
          <g>{layer(0, 'fill-white', false)}</g>
        </>
      )}
    </svg>
  )
}

/**
 * La cadena en grande del duelo automático, **sólo al encadenar**, igual a Master Duel (Gastón: «debemos clonar esto, debe quedar igual de ser posible»; todo dibujado por nosotros).
 * La pone la mesa en `duel.chain`, en la capa centrada sobre el campo: llena su alto (3:4; quien la usa le da un alto).
 * - **Armar:** cada activación entra grande y derecha desde el centro y cae inclinada a su lugar (`starting:`), con un destello amarillo alrededor de la carta y de su número. La
 *   última va adelante, abajo a la izquierda, la más grande; las anteriores, atrás, más chicas y más arriba (`DEPTH`); desde la quinta, las viejas se achican y se van hacia arriba.
 *   Cada carta entera, con su halo blanco (una sombra quieta) y atada por dos esquinas con cadena; entre carta y carta la cadena cuelga en curva por delante. El número, enorme,
 *   blanco con resplandor celeste y trazo digital (`ChainNumber`), pisa la esquina de abajo (la última, a la izquierda; las otras, a la derecha). Con dos o más, «CADENA» destella
 *   detrás de las cartas. El nombre va sólo en la carta sin imagen (con imagen ya está impreso).
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
  const row = rows[current >= 0 ? current : rows.length - 1]
  const depth = (index: number) => rows.length - 1 - index
  const pose = (index: number): Pose => (away ? 'out' : depth(index) >= SHOWN ? 'back' : 'slot')
  const hidden = away || over
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
        {/* «CADENA», detrás de las cartas. */}
        {rows.length > 1 && !hidden ? (
          <span key={rows.length} aria-hidden="true" data-chain-word="" className="absolute inset-0 flex animate-fx-flash items-center justify-center text-display font-extrabold uppercase text-white text-shadow-lg text-shadow-chain-glow motion-reduce:hidden">
            {t('auto.chain.title')}
          </span>
        ) : null}
        <svg aria-hidden="true" viewBox="0 0 300 400" className="absolute inset-0 z-6 size-full overflow-visible">
          {rows.map((link, index) =>
            // La cadena entre esta carta y la anterior, mientras las dos están en la escena; cada vez que se corren, vuelve a salir.
            index === 0 || pose(index - 1) !== 'slot' || pose(index) !== 'slot' ? null : (
              <Bond key={`${link.number}-${depth(index)}`} number={link.number} from={BOND[depth(index - 1)]!} to={BOND[depth(index)]!} fromAt={depth(index - 1)} toAt={depth(index)} />
            ),
          )}
        </svg>
        {rows.map((link, index) => {
          const at = pose(index)
          // La que acaba de entrar: adelante y más grande, con su destello alrededor y en su número.
          const newest = index === rows.length - 1 && !hidden
          // El número pisa la esquina de abajo: la de adelante a la izquierda, las otras a la derecha (como en Master Duel).
          const corner = depth(index) === 0 ? 'bottom-0 left-0 -translate-x-1/3 translate-y-1/3' : 'bottom-0 right-0 translate-x-1/3 translate-y-1/4'

          return (
            <div
              key={link.number}
              role="img"
              aria-label={t(link.mine ? 'auto.chain.linkMine' : 'auto.chain.linkTheirs', { number: link.number, card: link.name, state: whatHappened(link, rows) })}
              data-chain-card={link.number}
              data-pose={at}
              className={cx(
                'absolute left-1/3 top-2/7 aspect-[421/614] w-1/3 shadow-chain-halo transition-[translate,rotate,scale,opacity] duration-300 ease-snap starting:translate-x-0 starting:translate-y-0 starting:rotate-0 starting:scale-150 starting:opacity-0 motion-reduce:transition-opacity',
                link.art ? 'bg-input' : link.frame ? frameClass(link.frame) : 'bg-input',
                at === 'out' ? '-translate-y-1/4 scale-80 opacity-0' : at === 'back' ? '-translate-y-full scale-50 opacity-0' : DEPTH[depth(index)],
              )}
            >
              <CardArt remoteUrl={link.art} name={link.name} {...(link.frame ? { frame: link.frame } : {})} className="block size-full object-cover" />
              {link.art ? null : <span data-chain-name="" className="absolute inset-x-1 top-1 truncate bg-background/85 px-1 text-micro font-semibold text-foreground">{link.name}</span>}
              {newest ? <span aria-hidden="true" data-chain-glow="" className="absolute -inset-2 animate-fx-flash border-4 border-chain-flash motion-reduce:hidden" /> : null}
              <svg aria-hidden="true" viewBox="0 0 100 146" preserveAspectRatio="none" data-chain-ties="" className="absolute inset-0 size-full overflow-visible">
                {CORNER_TIES.map(([from, to], i) => (
                  <Links key={i} links={hangingLinks(from, to, 3, 12)} size={0.8} />
                ))}
              </svg>
              <span aria-hidden="true" data-chain-number={link.number} className="contents">
                <ChainNumber value={link.number} className={corner} />
                {newest ? <ChainNumber value={link.number} flash className={cx(corner, 'animate-fx-flash motion-reduce:hidden')} /> : null}
              </span>
            </div>
          )
        })}
        {over ? null : status}
      </div>
      {over ? status : null}
    </>
  )
}

