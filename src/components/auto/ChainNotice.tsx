import type { ChainOutcome, ChainRowState } from '../../app/auto/chain-feed'
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
 * Dónde queda cada carta en la escena (de 3:4) cuando espera: arriba a la izquierda, arriba a la derecha y abajo al medio, inclinadas, como en Master Duel. Se corren con `translate` desde el
 * centro (fracciones de la carta: un tercio del ancho), así ir al centro es sólo `transform`. `BOND` es el centro de cada lugar en el `viewBox` de 300 × 400 de los eslabones.
 */
const SLOT = ['-translate-x-9/10 -translate-y-7/12 -rotate-6', 'translate-x-9/10 -translate-y-7/10 rotate-6', 'translate-y-1/2 -rotate-3']
const BOND = [
  [60, 104],
  [240, 87],
  [150, 257],
] as const
/** Cuántas cartas se ven a la vez; con más, las primeras esperan detrás y vuelven cuando se van las de arriba. */
const SHOWN = 3

type Pose = 'slot' | 'center' | 'out'
const slotOf = (number: number) => (number - 1) % SHOWN

/**
 * La cadena en grande del duelo automático (K-01 a K-03 del kit; las referencias son Master Duel). La pone la mesa en `duel.chain`, en la capa centrada sobre el campo: llena su alto (3:4; quien la usa le da un alto).
 * - **Armar:** cada activación entra grande y se acomoda inclinada en su lugar (`starting:`), con su número enorme (`text-hit`, del color de su dueño) y el borde del color de su tipo; un
 *   eslabón la une con la anterior. Una activación sola entra igual, con su «1».
 * - **Resolver**, del último al primero (`current`): la carta va al centro, crece y, cuando empieza la siguiente, se va hacia arriba; su eslabón se corta. La negada o sin efecto se tacha antes.
 * - **Una sola línea** abajo (`role="status"`): armando, «Se resuelve del último al primero»; resolviendo, qué pasó con la que está en el centro.
 * - Sólo `translate`/`rotate`/`scale`/`opacity`; con movimiento reducido aparece y se va sin moverse (sólo la opacidad). La capa no ataja toques (`pointer-events-none`): lo de abajo se
 *   sigue tocando. El ritmo lo pone quien la usa (`chainDwell`, `use-auto-asks.tsx`).
 */
export function ChainStage({ rows, current, done = false }: { rows: readonly ChainNoticeRow[]; /** El que se resuelve (índice en `rows`); -1 mientras se arma. */ current: number; done?: boolean }) {
  const pose = (index: number): Pose => (done || (current >= 0 && index > current) ? 'out' : index === current ? 'center' : 'slot')
  // ponytail: con más de tres, sólo las tres de arriba; las de abajo vuelven a su lugar al irse aquéllas.
  const shown = new Set(rows.filter((_, index) => pose(index) !== 'out').slice(-SHOWN).map((row) => row.number))
  const row = rows[current >= 0 ? current : rows.length - 1]

  if (!row) return null
  return (
    <div data-testid="chain-notice" data-chain-stage="" className="pointer-events-none relative aspect-3/4 h-full max-w-full select-none">
      <svg aria-hidden="true" viewBox="0 0 300 400" preserveAspectRatio="none" className="absolute inset-0 size-full">
        {rows.slice(1).map((link) => {
          const [x1, y1] = BOND[slotOf(link.number - 1)]!
          const [x2, y2] = BOND[slotOf(link.number)]!
          const on = shown.has(link.number - 1) && shown.has(link.number)

          return (
            <line
              key={link.number}
              data-chain-bond={link.number}
              x1={x1}
              y1={y1}
              x2={x2}
              y2={y2}
              strokeWidth={9}
              strokeDasharray="15 7"
              strokeLinecap="round"
              vectorEffect="non-scaling-stroke"
              className={cx('stroke-muted transition-opacity duration-200', on ? 'opacity-100' : 'opacity-0')}
            />
          )
        })}
      </svg>
      {rows.map((link, index) => {
        const at = pose(index)

        if (at !== 'out' && !shown.has(link.number)) return null
        const voided = link.state === 'negated' || link.state === 'disabled'

        return (
          <div
            key={link.number}
            role="img"
            aria-label={t(link.mine ? 'auto.chain.linkMine' : 'auto.chain.linkTheirs', { number: link.number, card: link.name, state: whatHappened(link, rows) })}
            data-chain-card={link.number}
            data-pose={at}
            {...(voided ? { 'data-voided': '' } : {})}
            className={cx(
              'absolute left-1/3 top-2/7 aspect-[421/614] w-1/3 p-1 transition-[translate,rotate,scale,opacity] duration-300 ease-snap starting:scale-150 starting:opacity-0 motion-reduce:transition-opacity',
              link.frame ? frameClass(link.frame) : 'bg-input',
              at === 'center' ? 'z-10 scale-135' : at === 'out' ? '-translate-y-1/4 scale-80 opacity-0' : SLOT[slotOf(link.number)],
            )}
          >
            <CardArt remoteUrl={link.art} name={link.name} {...(link.frame ? { frame: link.frame } : {})} className="block size-full object-cover" />
            <span className="absolute inset-x-1 top-1 truncate bg-background/85 px-1 text-micro font-semibold text-foreground">{link.name}</span>
            {voided ? (
              <svg aria-hidden="true" viewBox="0 0 100 146" preserveAspectRatio="none" className="absolute inset-0 size-full">
                <line x1={4} y1={142} x2={96} y2={4} strokeWidth={6} strokeLinecap="round" vectorEffect="non-scaling-stroke" className="stroke-danger" />
              </svg>
            ) : null}
            <span aria-hidden="true" className={cx('absolute -bottom-6 -right-3 text-hit font-extrabold tabular-nums text-shadow-lg text-shadow-background', PLAYER_COLOR[link.mine ? 'mine' : 'theirs'].text)}>
              {link.number}
            </span>
          </div>
        )
      })}
      <p role="status" className="absolute inset-x-0 bottom-0 m-0 min-h-11 border-t border-border-subtle bg-background px-3 py-2.5 text-body font-semibold text-foreground">
        {current < 0 ? t('auto.chain.order') : t('auto.chain.say', { card: row.name, what: whatHappened(row, rows) })}
      </p>
    </div>
  )
}

