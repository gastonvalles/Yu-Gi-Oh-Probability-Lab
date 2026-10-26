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
  /** Negado o sin efecto: el eslabón que lo hizo (1 = CL1), si se sabe; el estado lo dice («Sin efecto · por CL2»). */
  by?: number
}

interface ChainNoticeProps {
  /** Del CL1 en adelante (la lista los muestra al revés: en el orden en que se resuelven). */
  rows: readonly ChainNoticeRow[]
  /** El eslabón del que habla la píldora (índice en `rows`): el último que se sumó o el último que cambió al resolverse. */
  focus: number
  /** Ya empezó a resolverse: la píldora deja de decir «Cadena» y dice qué le pasa al eslabón. */
  resolving: boolean
  open: boolean
  /** El celular (menos de 1101 px): la píldora dice todo en dos renglones, «Cadena · 2 · Resuelve CL2» y qué pasa (ver arriba). */
  compact?: boolean
  onOpenChange: (open: boolean) => void
  /** Se tocó un eslabón (índice en `rows`, y dónde está la fila): quien la usa lo muestra en el detalle o, sin detalle, grande. */
  onPick: (index: number, rect: DOMRect) => void
}

const STATE_TONE: Record<ChainRowState, Tone> = { chained: 'neutral', solving: 'info', solved: 'success', negated: 'danger', disabled: 'warning' }
const stateLabel = ({ state, by }: Pick<ChainNoticeRow, 'state' | 'by'>) => (by ? t('auto.chain.by', { state: t(`auto.chain.state.${state}`), by }) : t(`auto.chain.state.${state}`))
const colorOf = (mine: boolean) => PLAYER_COLOR[mine ? 'mine' : 'theirs']
/** El celular, segundo renglón: qué le pasa al eslabón. Negado por un eslabón que se conoce, la frase («Ash Blossom le quita el efecto a Ponix»); si no, el nombre y, si ya le pasó algo, su estado. */
const saysOf = (rows: readonly ChainNoticeRow[], row: ChainNoticeRow) => {
  const by = row.state === 'negated' || row.state === 'disabled' ? rows.find((link) => link.number === row.by) : undefined

  if (by) return t(`auto.chain.void.${row.state as 'negated' | 'disabled'}`, { by: by.name, card: row.name })
  return row.state === 'chained' || row.state === 'solving' ? row.name : `${row.name} · ${stateLabel(row)}`
}

/**
 * La pila de la cadena (duelo automático: «Jugar solo» y el duelo por enlace). La pone la mesa en `duel.chain`, centrada arriba de su columna, debajo de la barra.
 * - **Plegada** (la píldora): el ícono de la cadena con cuántos eslabones tiene, «Cadena · CL2 · Rival» mientras se arma (el último eslabón) o «Resolviendo · CL2 · Vos» mientras
 *   se resuelve (el dueño, en su color), con la carta en ámbar debajo, y la flecha que la despliega (44 px, `aria-expanded`).
 * - **En el celular** (`compact`): dos renglones que dicen todo, «Cadena · 2 · Resuelve CL2» (el eslabón en el color de su dueño) y qué pasa: «Ash Blossom le quita el efecto a Ponix» si se
 *   sabe quién lo negó (`by`), si no el nombre y su estado. Mientras la mesa tiene una pregunta abierta, la capa lleva `data-banded` (`group/chain`, `PracticeMat`): queda el primer
 *   renglón, sin flecha ni lista, para que la pregunta entre debajo.
 * - **Desplegada**: debajo, la pila en el orden en que se resuelve (el último eslabón arriba): número, carta, de quién y su estado (en espera, resolviendo, resuelta, negada o sin efecto, con quién lo negó si se sabe: «Sin
 *   efecto · por CL2», también en la píldora). Tiene tope de alto y se desplaza sola.
 * - **El color del dueño** (violeta claro lo tuyo, ámbar lo del rival: el de las vidas, `PLAYER_COLOR`) va en la etiqueta del número, rellena, y en el «de quién». No se confunde
 *   con el ámbar de lo que se resuelve, que es un **aro** alrededor de toda la fila (`listItemSelected`, como el brillo de las cartas): forma distinta, mismo significado de siempre.
 * - **Tocar un eslabón** (`onPick`) lo muestra para leerlo: cada fila es un botón de 44 px o más con su nombre entero («Eslabón 2: Ash Blossom, del rival. Resolviendo»).
 * - El ritmo, cuándo aparece y cuándo se va lo decide quien la usa (`use-auto-asks.tsx`); acá sólo se dibuja. Sin animar a propósito: es un cartel con temporizador.
 * - Accesibilidad: el texto de la píldora es un `status` (lo lee el lector de pantalla cuando cambia); la flecha dice qué hace y controla la lista.
 * - Hacer: dejar pasar los toques fuera de la píldora y la lista (la caja de la mesa va con `pointer-events-none`); tocarla no salta la mesa al final (`skipAhead` la saltea).
 *   No hacer: taparla con otra cosa, moverla de lugar ni ponerle velo.
 */
export function ChainNotice({ rows, focus, resolving, open, compact = false, onOpenChange, onPick }: ChainNoticeProps) {
  const listId = useId()
  const row = rows[focus] ?? rows[rows.length - 1]

  if (!row) return null
  const lead = resolving ? stateLabel(row) : t('auto.chain.title')
  // El celular, al resolverse: el eslabón que se está resolviendo (el que niega a otro sigue «Resolviendo» mientras lo niega); entre uno y otro, el último que cambió.
  const solver = rows.find((link) => link.state === 'solving') ?? row
  const clOf = (number: number) => (
    <span className={cx('font-semibold', colorOf(rows.find((link) => link.number === number)?.mine ?? false).text)}>{`CL${number}`}</span>
  )

  return (
    <div data-testid="chain-notice" className="pointer-events-none flex w-[min(24rem,100%)] flex-col items-stretch gap-1">
      <div className="pointer-events-auto flex min-h-14 items-center gap-2 rounded-full border border-border-subtle bg-card-background py-1 pl-3 pr-1 shadow-overlay group-data-banded/chain:min-h-11 group-data-banded/chain:pr-3">
        <span className="grid shrink-0 justify-items-center text-info" aria-hidden="true">
          <Icon name="link" size={18} />
          {compact ? null : <span className="text-micro font-bold tabular-nums leading-none text-foreground">{rows.length}</span>}
        </span>
        {compact ? (
          <p role="status" className="m-0 grid min-w-0 flex-1 leading-tight">
            <span className="truncate text-micro text-muted">
              {`${t('auto.chain.count', { count: rows.length })} · `}
              {resolving ? (
                <>
                  {`${t('auto.chain.resolves')} `}
                  {clOf(solver.number)}
                </>
              ) : (
                <>
                  {`CL${row.number} · `}
                  <span className={cx('font-semibold', colorOf(row.mine).text)}>{row.who}</span>
                </>
              )}
            </span>
            <span className="truncate text-body font-semibold text-info group-data-banded/chain:hidden">{saysOf(rows, row)}</span>
          </p>
        ) : (
          <p role="status" className="m-0 grid min-w-0 flex-1 leading-tight">
            <span className="truncate text-micro text-muted">
              {`${lead} · CL${row.number} · `}
              <span className={cx('font-semibold', colorOf(row.mine).text)}>{row.who}</span>
            </span>
            <span className={cx('truncate text-body font-semibold text-info', row.state === 'negated' && 'line-through')}>{row.name}</span>
          </p>
        )}
        <IconButton size="lg" className="group-data-banded/chain:hidden" aria-expanded={open} aria-controls={listId} aria-label={open ? t('auto.chain.hide') : t('auto.chain.show')} title={open ? t('auto.chain.hide') : t('auto.chain.show')} onClick={() => onOpenChange(!open)}>
          <Icon name={open ? 'chevron-up' : 'chevron-down'} />
        </IconButton>
      </div>
      {open ? (
        <ol id={listId} aria-label={t('auto.chain.list')} className="pointer-events-auto m-0 grid max-h-[min(18rem,40dvh)] list-none gap-1 overflow-y-auto overscroll-contain rounded-card border border-border-subtle bg-card-background p-1.5 shadow-overlay group-data-banded/chain:hidden">
          {[...rows].reverse().map((link, at) => {
            const color = colorOf(link.mine)
            const label = t(link.mine ? 'auto.chain.linkMine' : 'auto.chain.linkTheirs', { number: link.number, card: link.name, state: stateLabel(link) })

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
                    {stateLabel(link)}
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
