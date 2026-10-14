import { useEffect, useState } from 'react'

import type { DuelSnapshot } from '../../app/duel-session'
import type { SocketStatus } from '../../app/duel-socket'
import { formatClock, interpretAmount, timerRemaining } from '../../app/life-calculator'
import { formatInteger } from '../../app/utils'
import { t } from '../../i18n'
import { Button } from '../ui/Button'
import { Callout } from '../ui/Callout'
import { cx } from '../ui/cx'
import { Icon } from '../ui/Icon'
import { IconButton } from '../ui/IconButton'
import { Modal } from '../ui/Modal'
import { ConfirmDialog } from '../probability/ConfirmDialog'

/** Cambios de un toque a los puntos de vida; el resto, en el campo de monto. */
const QUICK_AMOUNTS = [-1000, -500, -100, 100, 500, 1000] as const

interface DuelBarProps {
  snapshot: DuelSnapshot
  status: SocketStatus
  myName: string
  turn: 'mine' | 'theirs'
  onChangeLife: (delta: number) => void
  onHalve: () => void
  onToggleClock: () => void
  onResetClock: () => void
  onLeave: () => void
}

/** Un reloj de pared que se actualiza cada `ms` (el reloj de la ronda se calcula contra él). */
function useTick(ms: number): number {
  const [now, setNow] = useState(() => Date.now())

  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), ms)
    return () => clearInterval(id)
  }, [ms])

  return now
}

const STATUS_TEXT: Record<Exclude<SocketStatus, 'open'>, () => string> = {
  connecting: () => t('duel.status.connecting'),
  reconnecting: () => t('duel.status.reconnecting'),
  full: () => t('duel.status.full'),
  closed: () => t('duel.status.closed'),
}

/**
 * La barra de arriba de la mesa en un duelo: los puntos de vida de los dos (los tuyos se cambian tocándolos), de quién es el turno,
 * el reloj de la ronda (compartido) y cómo va la conexión. Salir pide confirmación.
 */
export function DuelBar({ snapshot, status, myName, turn, onChangeLife, onHalve, onToggleClock, onResetClock, onLeave }: DuelBarProps) {
  const now = useTick(1000)
  const [lifeOpen, setLifeOpen] = useState(false)
  const [leaving, setLeaving] = useState(false)
  const { life, me, peerPresent } = snapshot
  const rivalName = snapshot.peerName ?? t('duel.bar.rival')
  const running = life.timer.running
  const clock = formatClock(timerRemaining(life.timer, now))

  return (
    <div className="grid gap-1.5 px-0.5">
      <div className="grid grid-cols-2 gap-1.5">
        <LifeTile name={rivalName} life={life.lp[me === 0 ? 1 : 0]} />
        <LifeTile name={myName || t('duel.bar.you')} life={life.lp[me]} mine onClick={() => setLifeOpen(true)} />
      </div>

      <div className="flex min-h-9 flex-wrap items-center gap-x-2 gap-y-1">
        <span className={cx('whitespace-nowrap rounded-full px-2.5 py-1 text-micro font-semibold', turn === 'mine' ? 'bg-accent/20 text-accent' : 'bg-tint/8 text-muted')}>
          {turn === 'mine' ? t('duel.bar.yourTurn') : t('duel.bar.theirTurn', { name: rivalName })}
        </span>
        <span className="flex items-center" role="group" aria-label={t('duel.bar.clock', { time: clock })}>
          <span className="px-1 text-micro font-semibold tabular-nums text-foreground">{clock}</span>
          <IconButton tone="flat" size="sm" aria-label={running ? t('duel.bar.clockPause') : t('duel.bar.clockStart')} title={running ? t('duel.bar.clockPause') : t('duel.bar.clockStart')} onClick={onToggleClock}>
            <Icon name={running ? 'pause' : 'play'} />
          </IconButton>
          <IconButton tone="flat" size="sm" aria-label={t('duel.bar.clockReset')} title={t('duel.bar.clockReset')} onClick={onResetClock}>
            <Icon name="refresh" />
          </IconButton>
        </span>
        <IconButton tone="flat" size="sm" aria-label={t('duel.bar.leave')} title={t('duel.bar.leave')} className="ml-auto" onClick={() => setLeaving(true)}>
          <Icon name="x" />
        </IconButton>
      </div>

      {status !== 'open' ? (
        <Callout tone="warning" icon="alert">{STATUS_TEXT[status]()}</Callout>
      ) : !peerPresent ? (
        <Callout tone="info">{t('duel.peer.absent')}</Callout>
      ) : null}

      <LifeDialog
        isOpen={lifeOpen}
        life={life.lp[me]}
        onClose={() => setLifeOpen(false)}
        onChange={(delta) => {
          onChangeLife(delta)
          setLifeOpen(false)
        }}
        onHalve={() => {
          onHalve()
          setLifeOpen(false)
        }}
      />

      <ConfirmDialog
        isOpen={leaving}
        title={t('duel.bar.leaveTitle')}
        description={t('duel.bar.leaveText')}
        confirmLabel={t('duel.bar.leave')}
        confirmColor="danger"
        onCancel={() => setLeaving(false)}
        onConfirm={() => {
          setLeaving(false)
          onLeave()
        }}
      />
    </div>
  )
}

/** Los puntos de vida de uno: su nombre y el número grande. Los propios son un botón que abre el cambio. */
function LifeTile({ name, life, mine = false, onClick }: { name: string; life: number; mine?: boolean; onClick?: () => void }) {
  const body = (
    <>
      <span className="block truncate text-micro font-semibold uppercase tracking-[0.04em] text-soft">{name}</span>
      <span className={cx('block text-lead font-extrabold leading-tight tabular-nums', mine ? 'text-accent' : 'text-foreground')}>{formatInteger(life)}</span>
    </>
  )
  const style = 'min-w-0 rounded-card border border-border-subtle bg-card-background px-3 py-1.5 text-left'

  return onClick ? (
    <button type="button" aria-label={`${t('duel.bar.lifeOf', { name })}: ${formatInteger(life)}. ${t('duel.bar.changeLife')}`} className={cx(style, 'cursor-pointer focus-visible:outline-none focus-visible:shadow-focus')} onClick={onClick}>
      {body}
    </button>
  ) : (
    <div role="group" aria-label={`${t('duel.bar.lifeOf', { name })}: ${formatInteger(life)}`} className={style}>
      {body}
    </div>
  )
}

/** Cambiar los puntos de vida propios: montos de un toque, la mitad, o un monto escrito (menos de tres cifras se entiende en centenas, como en la calculadora). */
function LifeDialog({ isOpen, life, onClose, onChange, onHalve }: { isOpen: boolean; life: number; onClose: () => void; onChange: (delta: number) => void; onHalve: () => void }) {
  const [digits, setDigits] = useState('')
  const amount = interpretAmount(digits)

  return (
    <Modal isOpen={isOpen} onClose={onClose} size="sm" title={t('duel.life.title')} subtitle={formatInteger(life)} ariaLabel={t('duel.life.title')}>
      <div className="grid gap-3">
        <div className="grid grid-cols-3 gap-2">
          {QUICK_AMOUNTS.map((delta) => (
            <Button key={delta} variant="secondary" size="sm" onClick={() => onChange(delta)}>
              {delta > 0 ? `+${formatInteger(delta)}` : `−${formatInteger(-delta)}`}
            </Button>
          ))}
        </div>
        <Button variant="secondary" size="sm" onClick={onHalve}>
          {t('duel.life.halve')}
        </Button>
        <div className="flex items-center gap-2">
          <input
            inputMode="numeric"
            aria-label={t('duel.life.amount')}
            placeholder={t('duel.life.amount')}
            value={digits}
            onChange={(event) => setDigits(event.target.value.replace(/\D/g, '').slice(0, 6))}
            className="h-10 min-w-0 flex-1 rounded-card border border-border-subtle bg-card-background px-3 text-body font-semibold text-foreground outline-none placeholder:font-normal placeholder:text-soft focus:border-primary/60"
          />
          <Button variant="secondary" size="sm" disabled={amount === 0} aria-label={`−${formatInteger(amount)}`} onClick={() => onChange(-amount)}>
            −
          </Button>
          <Button variant="primary" size="sm" disabled={amount === 0} aria-label={`+${formatInteger(amount)}`} onClick={() => onChange(amount)}>
            +
          </Button>
        </div>
      </div>
    </Modal>
  )
}
