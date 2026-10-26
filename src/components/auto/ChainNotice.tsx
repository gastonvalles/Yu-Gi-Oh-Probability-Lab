import { useId } from 'react'

import type { ChainRowState } from '../../app/auto/chain-feed'
import { t } from '../../i18n'
import { CardArt } from '../CardArt'
import { Badge } from '../ui/Badge'
import { cx } from '../ui/cx'
import { Icon } from '../ui/Icon'
import { IconButton } from '../ui/IconButton'
import { listItemSelected } from '../ui/surfaces'
import type { Tone } from '../ui/tone'

/** Un eslabón como lo muestra el aviso: su número, de quién es y la carta. */
export interface ChainNoticeRow {
  /** 1 = CL1. */
  number: number
  /** «Vos» o el nombre del rival. */
  who: string
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
}

const STATE_TONE: Record<ChainRowState, Tone> = { chained: 'neutral', solving: 'info', solved: 'success', negated: 'danger', disabled: 'warning' }
const stateLabel = (state: ChainRowState) => t(`auto.chain.state.${state}` as const)

/**
 * El aviso de la cadena (duelo automático: «Jugar solo» y el duelo por enlace). La pone la mesa en `duel.chain`, centrada arriba de su columna, debajo de la barra.
 * - **Plegado** (la píldora): el ícono de la cadena con cuántos eslabones tiene, «Cadena · CL2 · Rival» mientras se arma (el último eslabón) o «Resolviendo · CL2 · Vos» mientras
 *   se resuelve, con la carta en ámbar debajo, y la flecha que la despliega (44 px, `aria-expanded`).
 * - **Desplegado**: debajo, una tarjeta con los eslabones en el orden en que se resuelven (el último primero): número, carta, de quién y su estado (en espera, resolviendo —con
 *   el aro ámbar de lo elegido—, resuelta, negada, sin efecto). Tiene tope de alto y se desplaza sola.
 * - El ritmo, cuándo aparece y cuándo se va lo decide quien la usa (`use-auto-asks.tsx`); acá sólo se dibuja. Sin animar a propósito: es un cartel con temporizador.
 * - Accesibilidad: el texto de la píldora es un `status` (lo lee el lector de pantalla cuando cambia); la flecha dice qué hace y controla la lista.
 * - Hacer: dejar pasar los toques fuera de la píldora y la lista (la caja de la mesa va con `pointer-events-none`). No hacer: taparla con otra cosa ni moverla de lugar.
 */
export function ChainNotice({ rows, focus, resolving, open, onOpenChange }: ChainNoticeProps) {
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
          <span className="truncate text-micro text-muted">{`${lead} · CL${row.number} · ${row.who}`}</span>
          <span className={cx('truncate text-body font-semibold text-info', row.state === 'negated' && 'line-through')}>{row.name}</span>
        </p>
        <IconButton size="lg" aria-expanded={open} aria-controls={listId} aria-label={open ? t('auto.chain.hide') : t('auto.chain.show')} title={open ? t('auto.chain.hide') : t('auto.chain.show')} onClick={() => onOpenChange(!open)}>
          <Icon name={open ? 'chevron-up' : 'chevron-down'} />
        </IconButton>
      </div>
      {open ? (
        <ol id={listId} aria-label={t('auto.chain.list')} className="pointer-events-auto m-0 grid max-h-[min(18rem,40dvh)] list-none gap-1 overflow-y-auto overscroll-contain rounded-card border border-border-subtle bg-card-background p-1.5 shadow-overlay">
          {[...rows].reverse().map((link) => (
            <li key={link.number} aria-current={link.state === 'solving' ? 'step' : undefined} className={cx('flex items-center gap-2.5 rounded-card p-1.5', link.state === 'solving' && listItemSelected)}>
              <span className="w-8 shrink-0 text-center text-micro font-bold tabular-nums text-muted">{`CL${link.number}`}</span>
              <span className="relative block aspect-[421/614] w-8 shrink-0 overflow-hidden bg-input">
                <CardArt remoteUrl={link.art} name={link.name} className={cx('block h-full w-full object-cover', (link.state === 'solved' || link.state === 'negated') && 'opacity-60')} />
              </span>
              <span className="grid min-w-0 flex-1 leading-tight">
                <span className={cx('truncate text-body font-semibold', link.state === 'solving' ? 'text-info' : 'text-foreground', link.state === 'negated' && 'line-through')}>{link.name}</span>
                <span className="truncate text-micro text-muted">{link.who}</span>
              </span>
              <Badge tone={STATE_TONE[link.state]} size="sm" className="shrink-0">
                {stateLabel(link.state)}
              </Badge>
            </li>
          ))}
        </ol>
      ) : null}
    </div>
  )
}
