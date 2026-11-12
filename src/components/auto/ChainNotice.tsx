import { useEffect, useState } from 'react'

import { CHAIN_LEAVE_MS, type ChainOutcome, type ChainRowState } from '../../app/auto/chain-feed'

// El catálogo corre la escena con el ritmo real: los valores del núcleo salen de acá (`auto-isolation.test.ts`).
export { CHAIN_LEAVE_MS, CHAIN_LINGER_MS, chainDwell, chainFeed } from '../../app/auto/chain-feed'
import { frameClass, type CardFrame } from '../../app/card-frame'
import { t } from '../../i18n'
import { CardArt } from '../CardArt'
import { PLAYER_COLOR } from '../duel/player-color'
import { cx } from '../ui/cx'

/** Un eslabón como lo muestra la cadena: su número, de quién es y la carta. */
export interface ChainNoticeRow {
  /** 1 = el primero. */
  number: number
  /** «Vos» o el nombre del rival (el catálogo lo pasa; la escena dice el dueño con el color del número). */
  who?: string
  /** Es tuyo: el número va en el color de tus vidas (`PLAYER_COLOR`). */
  mine: boolean
  name: string
  art: string | null
  /** El tipo de la carta: el borde va en el color de su marco (`frameKindOf`). Sin esto, neutro. */
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
 * grande y adelante; las anteriores, cada vez más chicas, atrás y más arriba (en zigzag). Al entrar otra, todas se corren un lugar (sólo `transform`). Se mueven con `translate`
 * desde el centro (fracciones de la carta: un tercio del ancho). `BOND` es el centro de cada lugar en el `viewBox` de 300 × 400 de la cadena (la carta mide 100 × 146 y su centro sin
 * correr es 150, 187).
 */
const DEPTH = [
  'z-5 -translate-x-1/3 translate-y-1/2 -rotate-6 scale-150',
  'translate-x-3/4 -translate-y-1/3 rotate-6 scale-90',
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
/** Cada cuánto va un eslabón de metal en la cadena que une dos cartas (en unidades del `viewBox`). */
const LINK_STEP = 17

type Pose = 'slot' | 'back' | 'out'

/** Cuánto se mete la cadena en cada carta desde su centro, por su lugar (las grandes, más): cruza de borde a borde y pisa un poco cada carta, como en Master Duel. */
const BOND_TRIM = [62, 40, 32, 26]

/**
 * La cadena de metal de una carta a la otra, por encima de las cartas: eslabones alternados (uno de frente, hueco, y uno de canto, una barra), girados sobre la recta que las une.
 * Entra desde la carta anterior (`from`, en el lugar `fromAt`) hacia la nueva (`to`, `toAt`).
 */
function Bond({ number, from, to, fromAt, toAt }: { number: number; from: readonly [number, number]; to: readonly [number, number]; fromAt: number; toAt: number }) {
  const length = Math.hypot(to[0] - from[0], to[1] - from[1])
  const angle = (Math.atan2(to[1] - from[1], to[0] - from[0]) * 180) / Math.PI
  const start = BOND_TRIM[fromAt]!
  const span = Math.max(LINK_STEP * 2, length - start - BOND_TRIM[toAt]!)

  return (
    <g transform={`translate(${from[0]} ${from[1]}) rotate(${angle}) translate(${start} 0)`}>
      <g data-chain-bond={number} className="opacity-100 transition-[scale,opacity] duration-300 ease-snap starting:scale-x-0 starting:opacity-0 motion-reduce:transition-opacity">
        {Array.from({ length: Math.floor(span / LINK_STEP) }, (_, i) =>
          i % 2 === 0 ? (
            <rect key={i} x={i * LINK_STEP} y={-6} width={24} height={12} rx={6} strokeWidth={3.5} className="fill-none stroke-soft" />
          ) : (
            <rect key={i} x={i * LINK_STEP} y={-2} width={24} height={4} rx={2} className="fill-muted" />
          ),
        )}
      </g>
    </g>
  )
}

/**
 * La cadena en grande del duelo automático (K-01 a K-03 del kit; las referencias son Master Duel), **sólo al encadenar**. La pone la mesa en `duel.chain`, en la capa centrada sobre el
 * campo: llena su alto (3:4; quien la usa le da un alto).
 * - **Armar:** cada activación entra grande y derecha desde el centro y cae inclinada a su lugar (`starting:`) con un borde de luz, y el campo baja un poco más; su número enorme (del
 *   color de su dueño, con borde) se sale por la esquina de abajo y destella. La última va adelante y más grande; las anteriores, atrás, más chicas y más arriba (`DEPTH`); desde la
 *   quinta, las viejas se achican y se van hacia arriba. Una cadena de metal la une con la anterior y, con dos o más, «CADENA» destella al medio. Una activación sola entra igual, con su
 *   «1». El nombre va sólo en la carta sin imagen (con imagen ya está impreso).
 * - **El velo:** mientras está, el campo de atrás baja (una capa al lado de la escena que llena la capa de la mesa, sólo `opacity`); no ataja toques.
 * - **Sin línea a la vista:** «Se resuelve del último al primero» (y, resolviendo, qué pasó con cada uno) va en un `role="status"` oculto, para el lector de pantalla; ya lo dicen
 *   «CADENA» y los números.
 * - **Respondiendo** (`answering`, con la hoja o la ventana de «¿Respondés?» abierta): la escena se achica hacia arriba, así el número de la última carta no queda debajo del cartel.
 * - **Corrida** (`away`, mientras el núcleo pregunta algo que no es responder): ni cartas, ni velo a la vista, y vuelve después.
 * - **Resolver** (Gastón: «la animación con las cartas grandes sucede al momento de encadenar»): apenas empieza, la escena y el velo se van con un fundido corto (`CHAIN_LEAVE_MS`,
 *   sin alargar `chainDwell`) y no vuelven; quedan los medallones donde se activó cada eslabón (`ChainBadge`, `medalsOf`) y lo que pasó, en la línea oculta y en Pasos.
 * - Sólo `translate`/`rotate`/`scale`/`opacity`; con movimiento reducido aparece y se va sin moverse ni destellar (sólo la opacidad). No ataja toques (`pointer-events-none`): lo de
 *   abajo se sigue tocando. El ritmo lo pone quien la usa (`chainDwell`, `use-auto-asks.tsx`).
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
      <div aria-hidden="true" data-chain-veil="" className={cx('pointer-events-none absolute inset-0 bg-background/60 transition-opacity duration-200 ease-out starting:opacity-0 motion-reduce:transition-opacity', hidden ? 'opacity-0' : 'opacity-100')} />
      {/* Mientras entra un eslabón, el campo baja todavía más. */}
      {hidden ? null : <div key={`veil-${rows.length}`} aria-hidden="true" data-chain-dim="" className="pointer-events-none absolute inset-0 animate-chain-veil bg-background/45 motion-reduce:hidden" />}
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
          {rows.map((link, index) =>
            // La cadena entre esta carta y la anterior, mientras las dos están en la escena; cada vez que se corren, vuelve a salir desde la anterior.
            index === 0 || pose(index - 1) !== 'slot' || pose(index) !== 'slot' ? null : (
              <Bond key={`${link.number}-${depth(index)}`} number={link.number} from={BOND[depth(index - 1)]!} to={BOND[depth(index)]!} fromAt={depth(index - 1)} toAt={depth(index)} />
            ),
          )}
        </svg>
        {rows.map((link, index) => {
          const at = pose(index)
          // La que acaba de entrar: adelante y más grande, con un borde de luz y su número destellando.
          const newest = index === rows.length - 1 && !hidden

          return (
            <div
              key={link.number}
              role="img"
              aria-label={t(link.mine ? 'auto.chain.linkMine' : 'auto.chain.linkTheirs', { number: link.number, card: link.name, state: whatHappened(link, rows) })}
              data-chain-card={link.number}
              data-pose={at}
              className={cx(
                'absolute left-1/3 top-2/7 aspect-[421/614] w-1/3 p-1 transition-[translate,rotate,scale,opacity] duration-300 ease-snap starting:translate-x-0 starting:translate-y-0 starting:rotate-0 starting:scale-150 starting:opacity-0 motion-reduce:transition-opacity',
                link.frame ? frameClass(link.frame) : 'bg-input',
                at === 'out' ? '-translate-y-1/4 scale-80 opacity-0' : at === 'back' ? '-translate-y-full scale-50 opacity-0' : DEPTH[depth(index)],
              )}
            >
              <CardArt remoteUrl={link.art} name={link.name} {...(link.frame ? { frame: link.frame } : {})} className="block size-full object-cover" />
              {link.art ? null : <span data-chain-name="" className="absolute inset-x-1 top-1 truncate bg-background/85 px-1 text-micro font-semibold text-foreground">{link.name}</span>}
              {newest ? <span aria-hidden="true" data-chain-glow="" className="absolute -inset-1.5 animate-fx-flash border-4 border-foreground motion-reduce:hidden" /> : null}
              <span aria-hidden="true" data-chain-number="" className={cx('absolute -bottom-8 -left-5 text-hit font-extrabold tabular-nums', PLAYER_COLOR[link.mine ? 'mine' : 'theirs'].text)}>
                {newest ? <span data-chain-flash="" className="absolute inset-0 animate-fx-flash text-center motion-reduce:hidden">{link.number}</span> : null}
                <svg className="block h-16 w-12 overflow-visible">
                  <text x="50%" y={55} textAnchor="middle" paintOrder="stroke" strokeWidth={8} strokeLinejoin="round" className="fill-current stroke-background">
                    {link.number}
                  </text>
                </svg>
              </span>
            </div>
          )
        })}
        {rows.length > 1 && !hidden ? (
          <span key={rows.length} aria-hidden="true" data-chain-word="" className="absolute inset-0 z-20 flex animate-fx-flash items-center justify-center text-display font-extrabold uppercase text-foreground text-shadow-lg text-shadow-background motion-reduce:hidden">
            {t('auto.chain.title')}
          </span>
        ) : null}
        {over ? null : status}
      </div>
      {over ? status : null}
    </>
  )
}

