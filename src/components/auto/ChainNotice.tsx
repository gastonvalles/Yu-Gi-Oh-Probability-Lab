import { useId } from 'react'

import type { ChainRowState } from '../../app/auto/chain-feed'
import { t } from '../../i18n'
import { CardArt } from '../CardArt'
import { PLAYER_COLOR } from '../duel/player-color'
import { Badge } from '../ui/Badge'
import { cx } from '../ui/cx'
import { Icon } from '../ui/Icon'
import { IconButton } from '../ui/IconButton'
import { listItem, listItemSelected } from '../ui/surfaces'
import type { Tone } from '../ui/tone'

/** Un eslabón como lo muestra la pila: su número, de quién es y la carta. */
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
}

interface ChainNoticeProps {
  /** Del CL1 en adelante (la lista los muestra al revés: en el orden en que se resuelven). */
  rows: readonly ChainNoticeRow[]
  /** El eslabón del que habla la píldora (índice en `rows`): el último que se sumó o el último que cambió al resolverse. */
  focus: number
  /** Ya empezó a resolverse: la píldora deja de decir «Cadena» y dice qué le pasa al eslabón. */
  resolving: boolean
  open: boolean
  onOpenChange: (open: boolean) => void
  /** Se tocó un eslabón (índice en `rows`, y dónde está la fila): quien la usa lo muestra en el detalle o, sin detalle, grande. */
  onPick: (index: number, rect: DOMRect) => void
}

const STATE_TONE: Record<ChainRowState, Tone> = { chained: 'neutral', solving: 'info', solved: 'success', negated: 'danger', disabled: 'warning' }
const stateLabel = (state: ChainRowState) => t(`auto.chain.state.${state}` as const)
const colorOf = (mine: boolean) => PLAYER_COLOR[mine ? 'mine' : 'theirs']

/**
 * La pila de la cadena (duelo automático: «Jugar solo» y el duelo por enlace). La pone la mesa en `duel.chain`, centrada arriba de su columna, debajo de la barra.
 * - **Plegada** (la píldora): el ícono de la cadena con cuántos eslabones tiene, «Cadena · CL2 · Rival» mientras se arma (el último eslabón) o «Resolviendo · CL2 · Vos» mientras
 *   se resuelve (el dueño, en su color), con la carta en ámbar debajo, y la flecha que la despliega (44 px, `aria-expanded`).
 * - **Desplegada**: debajo, la pila en el orden en que se resuelve (el último eslabón arriba): número, carta, de quién y su estado (en espera, resolviendo, resuelta, negada, sin
 *   efecto). Tiene tope de alto y se desplaza sola.
 * - **El color del dueño** (violeta claro lo tuyo, ámbar lo del rival: el de las vidas, `PLAYER_COLOR`) va en la etiqueta del número, rellena, y en el «de quién». No se confunde
 *   con el ámbar de lo que se resuelve, que es un **aro** alrededor de toda la fila (`listItemSelected`, como el brillo de las cartas): forma distinta, mismo significado de siempre.
 * - **Tocar un eslabón** (`onPick`) lo muestra para leerlo: cada fila es un botón de 44 px o más con su nombre entero («Eslabón 2: Ash Blossom, del rival. Resolviendo»).
 * - El ritmo, cuándo aparece y cuándo se va lo decide quien la usa (`use-auto-asks.tsx`); acá sólo se dibuja. Sin animar a propósito: es un cartel con temporizador.
 * - Accesibilidad: el texto de la píldora es un `status` (lo lee el lector de pantalla cuando cambia); la flecha dice qué hace y controla la lista.
 * - Hacer: dejar pasar los toques fuera de la píldora y la lista (la caja de la mesa va con `pointer-events-none`); tocarla no salta la mesa al final (`skipAhead` la saltea).
 *   No hacer: taparla con otra cosa, moverla de lugar ni ponerle velo.
 */
export function ChainNotice({ rows, focus, resolving, open, onOpenChange, onPick }: ChainNoticeProps) {
  const listId = useId()
  const row = rows[focus] ?? rows[rows.length - 1]

  if (!row) return null
  const lead = resolving ? stateLabel(row.state) : t('auto.chain.title')

  return (
    <div data-testid="chain-notice" className="pointer-events-none flex w-[min(24rem,100%)] flex-col items-stretch gap-1">
      <div className="pointer-events-auto flex min-h-14 items-center gap-2 rounded-full border border-border-subtle bg-card-background py-1 pl-3 pr-1 shadow-overlay">
        <span className="grid shrink-0 justify-items-center text-info" aria-hidden="true">
          <Icon name="link" size={18} />
          <span className="text-micro font-bold tabular-nums leading-none text-foreground">{rows.length}</span>
        </span>
        <p role="status" className="m-0 grid min-w-0 flex-1 leading-tight">
          <span className="truncate text-micro text-muted">
            {`${lead} · CL${row.number} · `}
            <span className={cx('font-semibold', colorOf(row.mine).text)}>{row.who}</span>
          </span>
          <span className={cx('truncate text-body font-semibold text-info', row.state === 'negated' && 'line-through')}>{row.name}</span>
        </p>
        <IconButton size="lg" aria-expanded={open} aria-controls={listId} aria-label={open ? t('auto.chain.hide') : t('auto.chain.show')} title={open ? t('auto.chain.hide') : t('auto.chain.show')} onClick={() => onOpenChange(!open)}>
          <Icon name={open ? 'chevron-up' : 'chevron-down'} />
        </IconButton>
      </div>
      {open ? (
        <ol id={listId} aria-label={t('auto.chain.list')} className="pointer-events-auto m-0 grid max-h-[min(18rem,40dvh)] list-none gap-1 overflow-y-auto overscroll-contain rounded-card border border-border-subtle bg-card-background p-1.5 shadow-overlay">
          {[...rows].reverse().map((link, at) => {
            const color = colorOf(link.mine)
            const label = t(link.mine ? 'auto.chain.linkMine' : 'auto.chain.linkTheirs', { number: link.number, card: link.name, state: stateLabel(link.state) })

            return (
              <li key={link.number} aria-current={link.state === 'solving' ? 'step' : undefined}>
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
                    <span className={cx('truncate text-micro font-semibold', color.text)}>{link.who}</span>
                  </span>
                  <Badge tone={STATE_TONE[link.state]} size="sm" className="shrink-0">
                    {stateLabel(link.state)}
                  </Badge>
                </button>
              </li>
            )
          })}
        </ol>
      ) : null}
    </div>
  )
}
