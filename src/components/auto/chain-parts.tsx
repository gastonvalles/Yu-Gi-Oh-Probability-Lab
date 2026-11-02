import type { ChainRowState } from '../../app/auto/chain-feed'
import { t } from '../../i18n'
import { CardArt } from '../CardArt'
import { PLAYER_COLOR } from '../duel/player-color'
import { Badge } from '../ui/Badge'
import { cx } from '../ui/cx'
import { listItem, listItemSelected } from '../ui/surfaces'
import type { Tone } from '../ui/tone'

/** Un eslabón como lo muestra la cadena: su número, de quién es y la carta. */
export interface ChainNoticeRow {
  /** 1 = CL1. */
  number: number
  /** «Vos» o el nombre del rival. */
  who: string
  /** Es tuyo: da el color del dueño (el de sus vidas, `PLAYER_COLOR`). */
  mine: boolean
  name: string
  art: string | null
  state: ChainRowState
  /** Negado o sin efecto: el eslabón que lo hizo (1 = CL1), si se sabe; el estado lo dice («Sin efecto · por CL2»). */
  by?: number
}

export const STATE_TONE: Record<ChainRowState, Tone> = { chained: 'neutral', solving: 'info', solved: 'success', negated: 'danger', disabled: 'warning' }
export const stateLabel = ({ state, by }: Pick<ChainNoticeRow, 'state' | 'by'>) => (by ? t('auto.chain.by', { state: t(`auto.chain.state.${state}`), by }) : t(`auto.chain.state.${state}`))
export const colorOf = (mine: boolean) => PLAYER_COLOR[mine ? 'mine' : 'theirs']

/**
 * Las filas de la pila de la cadena, en el orden en que se resuelven (el último eslabón arriba): número en el color de su dueño, arte, nombre, de quién y su estado. Cada una es un botón de 44 px o más con su
 * nombre entero («Eslabón 2: Ash Blossom, del rival. Resolviendo»); el que se resuelve lleva el aro ámbar. Sin `who`, el dueño sólo por el color de su número (la hoja del celular: nada dicho dos veces). La usan la pila de escritorio (`ChainNotice`) y el detalle de la hoja del celular (`ChainSheet`).
 */
export function ChainListRows({ rows, onPick, who = true }: { rows: readonly ChainNoticeRow[]; onPick: (index: number, rect: DOMRect) => void; who?: boolean }) {
  return [...rows].reverse().map((link, at) => {
    const color = colorOf(link.mine)
    const label = t(link.mine ? 'auto.chain.linkMine' : 'auto.chain.linkTheirs', { number: link.number, card: link.name, state: stateLabel(link) })

    return (
      <li key={link.number} aria-current={link.state === 'solving' ? 'step' : undefined} className="snap-start">
        <button
          type="button"
          aria-label={label}
          className={cx(listItem, 'flex min-h-11 w-full items-center gap-2.5 p-1.5 text-left focus-visible:outline-none focus-visible:shadow-focus', link.state === 'solving' && listItemSelected)}
          onClick={(event) => onPick(rows.length - 1 - at, event.currentTarget.getBoundingClientRect())}
        >
          <span className={cx('w-9 shrink-0 rounded-tag border py-0.5 text-center text-micro font-bold tabular-nums text-white', color.border, color.bubble)}>{`CL${link.number}`}</span>
          <span className="relative block aspect-[421/614] w-8 shrink-0 overflow-hidden bg-input">
            <CardArt remoteUrl={link.art} name={link.name} className={cx('block h-full w-full object-cover', (link.state === 'solved' || link.state === 'negated') && 'opacity-60')} />
          </span>
          <span className="grid min-w-0 flex-1 leading-tight">
            <span className={cx('truncate text-body font-semibold', link.state === 'solving' ? 'text-info' : 'text-foreground', link.state === 'negated' && 'line-through')}>{link.name}</span>
            {who ? <span className={cx('truncate text-micro font-semibold', color.text)}>{link.who}</span> : null}
          </span>
          <Badge tone={STATE_TONE[link.state]} size="sm" className="shrink-0">
            {stateLabel(link)}
          </Badge>
        </button>
      </li>
    )
  })
}
