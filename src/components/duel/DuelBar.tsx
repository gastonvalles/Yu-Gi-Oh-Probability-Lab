import { useEffect, useState } from 'react'

import { duelResult, type DuelResult } from '../../app/duel-games'
import type { Duel, DuelSnapshot } from '../../app/duel-session'
import type { SocketStatus } from '../../app/duel-socket'
import { duelTurnNumber } from '../../app/duel-turn'
import { formatClock, interpretAmount, timerRemaining } from '../../app/life-calculator'
import { PHASES } from '../../app/practice-mat'
import { formatInteger } from '../../app/utils'
import { t } from '../../i18n'
import { Button } from '../ui/Button'
import { Callout } from '../ui/Callout'
import { cx } from '../ui/cx'
import { Icon } from '../ui/Icon'
import { IconButton } from '../ui/IconButton'
import { Modal } from '../ui/Modal'
import { SideDrawer } from '../ui/SideDrawer'
import { ConfirmDialog } from '../probability/ConfirmDialog'
import { DuelChat, useChatUnread } from './DuelChat'
import { DuelGames, type GameActions } from './DuelGames'

/** Cambios de un toque a los puntos de vida; el resto, en el campo de monto. */
const QUICK_AMOUNTS = [-1000, -500, -100, 100, 500, 1000] as const

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

interface DuelBarProps {
  snapshot: DuelSnapshot
  status: SocketStatus
  turn: 'mine' | 'theirs'
  onToggleClock: () => void
  onRematch: () => void
  onLeave: () => void
}

/**
 * Lo de arriba de la mesa en un duelo, que es lo del rival y lo que se mira sin tocar: sus puntos de vida, el reloj de la ronda (tocarlo lo pausa),
 * el turno con la fase en que va quien juega, y cómo va la conexión. Lo propio (tus puntos de vida, el chat, los dados, deshacer) está abajo, al alcance
 * del pulgar. Salir pide confirmación y queda en la esquina de arriba, lejos de donde se toca jugando.
 */
export function DuelBar({ snapshot, status, turn, onToggleClock, onRematch, onLeave }: DuelBarProps) {
  const now = useTick(1000)
  const [leaving, setLeaving] = useState(false)
  const { life, me, peerPresent } = snapshot
  const rivalName = snapshot.peerName ?? t('duel.bar.rival')
  const running = life.timer.running
  const clock = formatClock(timerRemaining(life.timer, now))
  const result = duelResult(life.lp, snapshot.conceded)
  // La fase que se ve es la de quien tiene el turno: así los dos saben en qué punto va.
  const phaseId = (turn === 'mine' ? snapshot.mine : snapshot.theirs?.state)?.phase
  const phase = PHASES.find((entry) => entry.id === phaseId)?.name

  return (
    <div className="grid gap-1.5 px-0.5 pt-1.5">
      <div className="flex items-center gap-1.5">
        <LifeTile name={rivalName} life={life.lp[me === 0 ? 1 : 0]} />
        <button
          type="button"
          aria-label={`${t('duel.bar.clock', { time: clock })}. ${running ? t('duel.bar.clockPause') : t('duel.bar.clockStart')}`}
          title={running ? t('duel.bar.clockPause') : t('duel.bar.clockStart')}
          className="inline-flex h-11 shrink-0 cursor-pointer items-center gap-1.5 rounded-card border border-border-subtle bg-card-background px-2.5 text-micro font-semibold tabular-nums text-foreground focus-visible:outline-none focus-visible:shadow-focus"
          onClick={onToggleClock}
        >
          <Icon name={running ? 'pause' : 'play'} size={14} />
          {clock}
        </button>
        <IconButton tone="flat" size="sm" aria-label={t('duel.bar.leave')} title={t('duel.bar.leave')} className="ml-auto" onClick={() => setLeaving(true)}>
          <Icon name="x" />
        </IconButton>
      </div>

      <div className="flex flex-wrap items-center gap-1.5">
        <span className="whitespace-nowrap rounded-full bg-tint/8 px-2.5 py-1 text-micro font-semibold tabular-nums text-muted">{t('practice.mat.turn', { turn: duelTurnNumber(snapshot.mine, snapshot.theirs?.state ?? null) })}</span>
        <span className={cx('whitespace-nowrap rounded-full px-2.5 py-1 text-micro font-semibold', turn === 'mine' ? 'bg-accent/20 text-accent' : 'bg-tint/8 text-muted')}>
          {turn === 'mine' ? t('duel.bar.yourTurn') : t('duel.bar.theirTurn', { name: rivalName })}
          {phase ? <span data-testid="duel-phase">{` · ${phase}`}</span> : null}
        </span>
      </div>

      {status !== 'open' ? (
        <Callout tone="warning" icon="alert">{STATUS_TEXT[status]()}</Callout>
      ) : !peerPresent ? (
        <Callout tone="info">{t('duel.peer.absent')}</Callout>
      ) : null}

      {result ? <ResultBanner result={result} snapshot={snapshot} rival={rivalName} onRematch={onRematch} /> : null}

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

interface DuelToolsProps {
  snapshot: DuelSnapshot
  myName: string
  /** Moneda, dado, piedra-papel-tijera, quién empieza y rendirse. */
  games: GameActions
  /** Escribirle al rival. */
  onSendChat: Duel['sendChat']
}

/**
 * Los botones propios del duelo, abajo a la derecha (el pulgar de quien juega con la derecha): los dados y juegos, y el chat (con un contador de lo que no leíste),
 * que se abre como un panel por la derecha.
 */
export function DuelTools({ snapshot, myName, games, onSendChat }: DuelToolsProps) {
  const [gamesOpen, setGamesOpen] = useState(false)
  const [chatOpen, setChatOpen] = useState(false)
  const unread = useChatUnread(snapshot, chatOpen)
  const rivalName = snapshot.peerName ?? t('duel.bar.rival')

  return (
    <>
      <IconButton tone="flat" size="sm" aria-label={t('duel.games.open')} title={t('duel.games.open')} onClick={() => setGamesOpen(true)}>
        <Icon name="dice" />
      </IconButton>
      <span className="relative">
        <IconButton tone="flat" size="sm" aria-label={unread > 0 ? `${t('duel.chat.open')} (${t('duel.chat.unread', { count: unread })})` : t('duel.chat.open')} title={t('duel.chat.open')} onClick={() => setChatOpen(true)}>
          <Icon name="chat" />
        </IconButton>
        {unread > 0 ? (
          <span aria-hidden="true" className="pointer-events-none absolute right-0 top-0 grid min-w-4 place-items-center rounded-full bg-accent px-1 text-[0.625rem] font-extrabold leading-4 text-[#06140e]">
            {unread}
          </span>
        ) : null}
      </span>

      <SideDrawer isOpen={chatOpen} onClose={() => setChatOpen(false)} title={t('duel.chat.title', { name: rivalName })}>
        <DuelChat snapshot={snapshot} myName={myName} onSend={onSendChat} fill />
      </SideDrawer>

      <DuelGames isOpen={gamesOpen} onClose={() => setGamesOpen(false)} snapshot={snapshot} myName={myName} actions={games} />
    </>
  )
}

interface DuelLifeProps {
  snapshot: DuelSnapshot
  myName: string
  onChangeLife: (delta: number) => void
  onHalve: () => void
}

/** Tus puntos de vida, abajo junto a las fases: se tocan para cambiarlos. */
export function DuelLife({ snapshot, myName, onChangeLife, onHalve }: DuelLifeProps) {
  const [open, setOpen] = useState(false)
  const lp = snapshot.life.lp[snapshot.me]

  return (
    <>
      <LifeTile name={myName || t('duel.bar.you')} life={lp} mine onClick={() => setOpen(true)} />
      <LifeDialog
        isOpen={open}
        life={lp}
        onClose={() => setOpen(false)}
        onChange={(delta) => {
          onChangeLife(delta)
          setOpen(false)
        }}
        onHalve={() => {
          onHalve()
          setOpen(false)
        }}
      />
    </>
  )
}

/** Cómo terminó el duelo (sin puntos de vida o rendido) y la revancha: pedirla, o aceptarla si el rival ya la pidió. */
function ResultBanner({ result, snapshot, rival, onRematch }: { result: DuelResult; snapshot: DuelSnapshot; rival: string; onRematch: () => void }) {
  const { me, conceded, rematch } = snapshot
  const won = result.kind === 'loss' && result.loser !== me
  const text =
    result.kind === 'draw'
      ? t('duel.result.draw')
      : won
        ? conceded !== null ? t('duel.result.winConceded', { name: rival }) : t('duel.result.win')
        : conceded === me ? t('duel.result.loseConceded') : t('duel.result.lose')
  const note = rematch.mine ? t('duel.result.rematchWaiting', { name: rival }) : rematch.theirs ? t('duel.result.rematchOffered', { name: rival }) : null

  return (
    <Callout
      tone={result.kind === 'draw' ? 'info' : won ? 'success' : 'danger'}
      icon="trophy"
      action={
        rematch.mine ? null : (
          <Button variant="primary" size="sm" disabled={!snapshot.peerPresent} onClick={onRematch}>
            {t('duel.result.rematch')}
          </Button>
        )
      }
    >
      <span role="status">{text}</span>
      {note ? <span className="block text-micro text-soft">{note}</span> : null}
    </Callout>
  )
}

/** Los puntos de vida de uno: su nombre y el número grande. Los propios son un botón que abre el cambio. */
function LifeTile({ name, life, mine = false, onClick }: { name: string; life: number; mine?: boolean; onClick?: () => void }) {
  // `data-lp`: a qué casilla va la espada de un ataque directo (ver `measureStrike`).
  const side = mine ? 'mine' : 'theirs'
  const body = (
    <>
      <span className="min-w-0 truncate text-micro font-semibold uppercase tracking-[0.04em] text-soft">{name}</span>
      <span className={cx('shrink-0 text-title font-extrabold leading-tight tabular-nums', mine ? 'text-accent' : 'text-foreground')}>{formatInteger(life)}</span>
    </>
  )
  // Las dos vidas miden lo mismo (la del rival arriba, la tuya abajo).
  const style = 'flex h-11 w-36 shrink-0 items-center justify-between gap-2 rounded-card border border-border-subtle bg-card-background px-2.5 text-left'

  return onClick ? (
    <button type="button" data-lp={side} aria-label={`${t('duel.bar.lifeOf', { name })}: ${formatInteger(life)}. ${t('duel.bar.changeLife')}`} className={cx(style, 'cursor-pointer focus-visible:outline-none focus-visible:shadow-focus')} onClick={onClick}>
      {body}
    </button>
  ) : (
    <div role="group" data-lp={side} aria-label={`${t('duel.bar.lifeOf', { name })}: ${formatInteger(life)}`} className={style}>
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
