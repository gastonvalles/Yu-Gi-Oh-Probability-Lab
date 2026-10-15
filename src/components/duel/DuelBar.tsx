import { useEffect, useState, type ReactNode } from 'react'

import { duelResult } from '../../app/duel-games'
import type { Duel, DuelSnapshot } from '../../app/duel-session'
import type { SocketStatus } from '../../app/duel-socket'
import { duelTurnNumber } from '../../app/duel-turn'
import { formatClock, interpretAmount, timerRemaining } from '../../app/life-calculator'
import { PHASES } from '../../app/practice-mat'
import { KEYS, KEY, MAX_DIGITS, PRESSABLE, type Key } from '../life/LifeCalculatorScreen'
import { t } from '../../i18n'
import { Callout } from '../ui/Callout'
import { cx } from '../ui/cx'
import { Icon } from '../ui/Icon'
import { IconButton } from '../ui/IconButton'
import { Modal } from '../ui/Modal'
import { SideDrawer } from '../ui/SideDrawer'
import { ConfirmDialog } from '../probability/ConfirmDialog'
import { DuelChat, GOOD_MESSAGE, thinkingMessage, useChatUnread } from './DuelChat'
import { DuelGames, type GameActions } from './DuelGames'
import { ResultStrip } from './DuelResult'
import { PLAYER_COLOR, type PlayerSide } from './player-color'

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
  unsupported: () => t('duel.status.unsupported'),
}

interface DuelBarProps {
  snapshot: DuelSnapshot
  status: SocketStatus
  turn: 'mine' | 'theirs'
  /** La mano del rival (sus dorsos): en el celular va abajo de los datos; en escritorio, en el medio de la misma fila. */
  theirHand: ReactNode
  onToggleClock: () => void
  onRematch: () => void
  onLeave: () => void
  /** Rendirme: el duelo termina y gana el rival (se pide confirmar). */
  onConcede: () => void
  /** Mandar una señal (pensando, todo bien): sólo en el celular, donde el chat no está a la vista; en escritorio no se pasa y los botones están en el chat. */
  onSignal?: (text: string) => void
  /** Volver a conectarme a la sala ya: lo toca cualquiera de los dos si el duelo quedó en pausa por un aviso que no llegó, y el relay vuelve a decirle a cada uno si el otro está. */
  onReconnect: () => void
  /** La tarjeta del resultado está abierta sobre la mesa: la línea de arriba no la repite. */
  resultOpen?: boolean
  /** La señal del rival que está a la vista (pensando, todo bien): sale como un globo junto a sus vidas. */
  rivalSignal?: string | null
}

/**
 * Lo de arriba de la mesa en un duelo, que es lo del rival y lo que se mira sin tocar: sus puntos de vida, el reloj de la ronda (tocarlo lo pausa),
 * el turno con la fase en que va quien juega, y cómo va la conexión. Lo propio (tus puntos de vida, el chat, los dados, deshacer) está abajo, al alcance
 * del pulgar. Salir pide confirmación y queda en la esquina de arriba, lejos de donde se toca jugando.
 */
export function DuelBar({ snapshot, status, turn, theirHand, onToggleClock, onRematch, onLeave, onConcede, onReconnect, onSignal, resultOpen = false, rivalSignal = null }: DuelBarProps) {
  const now = useTick(1000)
  const [leaving, setLeaving] = useState(false)
  const [conceding, setConceding] = useState(false)
  const { life, me, peerPresent } = snapshot
  const rivalName = snapshot.peerName ?? t('duel.bar.rival')
  const running = life.timer.running
  const clock = formatClock(timerRemaining(life.timer, now))
  const result = duelResult(life.lp, snapshot.conceded)
  // La fase que se ve es la de quien tiene el turno: así los dos saben en qué punto va.
  const phaseId = (turn === 'mine' ? snapshot.mine : snapshot.theirs?.state)?.phase
  const phase = PHASES.find((entry) => entry.id === phaseId)?.name

  return (
    // Celular: una fila con las vidas, el reloj y salir; abajo los turnos y la mano del rival. Escritorio: una sola fila con las vidas del rival y el reloj arriba a la izquierda, su mano en el centro (el del campo) y,
    // arriba a la derecha, el turno y salir; tus vidas van en la esquina de enfrente, abajo a la derecha.
    <div className="relative flex flex-wrap items-center gap-1.5 px-0.5 pt-1.5">
      <LifeTile name={rivalName} life={life.lp[me === 0 ? 1 : 0]} bubble={rivalSignal} />
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
      {/* Escritorio: el turno y salir juntos a la derecha. Celular: salir al final de la primera fila, el turno en su propia fila y la mano del rival en la tercera (`contents` y `order` los acomodan). */}
      <div className="contents min-[1101px]:ml-auto min-[1101px]:flex min-[1101px]:items-center min-[1101px]:gap-2">
        <div className="order-2 flex basis-full flex-wrap items-center gap-1.5 min-[1101px]:order-none min-[1101px]:basis-auto min-[1101px]:flex-nowrap">
          {snapshot.watchers > 0 ? (
            <span className="inline-flex items-center gap-1 whitespace-nowrap rounded-full bg-tint/8 px-2.5 py-1 text-micro font-semibold tabular-nums text-muted" title={t('duel.room.watchers', { count: snapshot.watchers })} aria-label={t('duel.room.watchers', { count: snapshot.watchers })}>
              <Icon name="eye" size={14} />
              {snapshot.watchers}
            </span>
          ) : null}
          <span className="whitespace-nowrap rounded-full bg-tint/8 px-2.5 py-1 text-micro font-semibold tabular-nums text-muted">{t('practice.mat.turn', { turn: duelTurnNumber(snapshot.mine, snapshot.theirs?.state ?? null) })}</span>
          <span className={cx('whitespace-nowrap rounded-full px-2.5 py-1 text-micro font-semibold', turn === 'mine' ? 'bg-accent/20 text-accent' : 'bg-tint/8 text-muted')}>
            {turn === 'mine' ? t('duel.bar.yourTurn') : t('duel.bar.theirTurn', { name: rivalName })}
            {phase ? <span data-testid="duel-phase">{` · ${phase}`}</span> : null}
          </span>
          {/* Las dos señales a la derecha de la fila del turno: siempre a mano, sin sacarle lugar al chat de la barra de abajo. */}
          {onSignal ? (
            <span className="ml-auto flex shrink-0 items-center gap-1.5">
              {[
                { emoji: '💭', label: t('duel.signal.thinking'), text: thinkingMessage() },
                { emoji: '👍', label: t('duel.signal.good'), text: GOOD_MESSAGE },
              ].map(({ emoji, label, text }) => (
                <button
                  key={emoji}
                  type="button"
                  aria-label={label}
                  title={label}
                  disabled={!peerPresent}
                  className="grid h-8 min-w-10 cursor-pointer place-items-center rounded-full bg-tint/8 px-2.5 text-lead leading-none transition-colors hover:bg-tint/16 focus-visible:outline-none focus-visible:shadow-focus disabled:cursor-default disabled:opacity-40"
                  onClick={() => onSignal(text)}
                >
                  <span aria-hidden="true">{emoji}</span>
                </button>
              ))}
            </span>
          ) : null}
        </div>
        <span className="order-1 ml-auto flex items-center min-[1101px]:order-none min-[1101px]:ml-0">
          {/* Reconectar también: lo tocan los dos, y el duelo sigue en cuanto el relay le dice a cada uno que el otro está. */}
          <IconButton tone="flat" size="sm" aria-label={t('duel.bar.reconnect')} title={t('duel.bar.reconnect')} onClick={onReconnect}>
            <Icon name="refresh" />
          </IconButton>
          {/* Rendirse queda a la vista, junto a salir (arriba, lejos de donde se juega) y pide confirmar. Terminado el duelo, o sin rival, no hay a quién rendirse. */}
          <IconButton tone="flat" size="sm" aria-label={t('duel.bar.concede')} title={t('duel.bar.concede')} className="disabled:opacity-35" disabled={Boolean(result) || !peerPresent} onClick={() => setConceding(true)}>
            <Icon name="flag" />
          </IconButton>
          <IconButton tone="flat" size="sm" aria-label={t('duel.bar.leave')} title={t('duel.bar.leave')} onClick={() => setLeaving(true)}>
            <Icon name="x" />
          </IconButton>
        </span>
      </div>

      <div className="order-3 flex basis-full justify-center min-[1101px]:absolute min-[1101px]:left-1/2 min-[1101px]:top-1.5 min-[1101px]:basis-auto min-[1101px]:-translate-x-1/2">{theirHand}</div>

      {status !== 'open' ? (
        <Callout className="order-4 basis-full" tone="warning" icon="alert">{STATUS_TEXT[status]()}</Callout>
      ) : !peerPresent ? (
        <Callout className="order-4 basis-full" tone="info">{t('duel.peer.absent')}</Callout>
      ) : null}

      {result && !resultOpen ? (
        <div className="order-4 basis-full">
          <ResultStrip result={result} snapshot={snapshot} rival={rivalName} onRematch={onRematch} />
        </div>
      ) : null}

      <ConfirmDialog
        isOpen={conceding}
        title={t('duel.bar.concedeTitle')}
        description={t('duel.bar.concedeText', { name: rivalName })}
        confirmLabel={t('duel.bar.concede')}
        confirmColor="danger"
        onCancel={() => setConceding(false)}
        onConfirm={() => {
          setConceding(false)
          onConcede()
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

interface DuelToolsProps {
  snapshot: DuelSnapshot
  myName: string
  /** Moneda, dado, piedra-papel-tijera, quién empieza y rendirse. */
  games: GameActions
  /** Escribirle al rival. */
  onSendChat: Duel['sendChat']
  /** El chat está fijo al costado (escritorio): no hay botón ni panel que abrir. */
  chatDocked?: boolean
}

/**
 * Los botones propios del duelo, abajo a la derecha (el pulgar de quien juega con la derecha): los dados y juegos, y el chat (con un contador de lo que no leíste),
 * que se abre como un panel por la derecha.
 */
export function DuelTools({ snapshot, myName, games, onSendChat, chatDocked = false }: DuelToolsProps) {
  const [gamesOpen, setGamesOpen] = useState(false)
  const [chatOpen, setChatOpen] = useState(false)
  const unread = useChatUnread(snapshot, chatOpen || chatDocked)
  const rivalName = snapshot.peerName ?? t('duel.bar.rival')

  return (
    <>
      <IconButton tone="flat" size="sm" aria-label={t('duel.games.open')} title={t('duel.games.open')} onClick={() => setGamesOpen(true)}>
        <Icon name="dice" />
      </IconButton>
      {chatDocked ? null : (
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
      )}

      {chatDocked ? null : (
        <SideDrawer isOpen={chatOpen} onClose={() => setChatOpen(false)} title={t('duel.chat.title', { name: rivalName })}>
          <DuelChat snapshot={snapshot} myName={myName} onSend={onSendChat} fill />
        </SideDrawer>
      )}

      <DuelGames isOpen={gamesOpen} onClose={() => setGamesOpen(false)} snapshot={snapshot} myName={myName} actions={games} />
    </>
  )
}

interface DuelLifeProps {
  snapshot: DuelSnapshot
  myName: string
  onChangeLife: (delta: number) => void
  onHalve: () => void
  /** Lo que acabás de avisar (pensando, todo bien): sale como un globo junto a tus vidas. */
  signal?: string | null
}

/** Tus puntos de vida, abajo junto a las fases: se tocan para cambiarlos. */
export function DuelLife({ snapshot, myName, onChangeLife, onHalve, signal = null }: DuelLifeProps) {
  const [open, setOpen] = useState(false)
  const lp = snapshot.life.lp[snapshot.me]

  return (
    <>
      <LifeTile name={myName || t('duel.bar.you')} life={lp} mine bubble={signal} onClick={() => setOpen(true)} />
      <LifeDialog
        isOpen={open}
        life={lp}
        name={myName || t('duel.bar.you')}
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

/** Los puntos de vida de uno: su nombre y el número grande. Los propios son un botón que abre el cambio. */
export function LifeTile({ name, life, mine = false, color, bubble = null, onClick }: { name: string; life: number; mine?: boolean; /** Un aviso que sale un instante junto a las vidas, con el color de su dueño: el rival, debajo; el propio, arriba. */ bubble?: string | null; /** De qué jugador es el color (por defecto, el tuyo si es "mine"): quien mira pone el suyo a cada uno. */ color?: PlayerSide; onClick?: () => void }) {
  // `data-lp`: a qué casilla va la espada de un ataque directo (ver `measureStrike`).
  const side = mine ? 'mine' : 'theirs'
  const tone = PLAYER_COLOR[color ?? side]
  const body = (
    <>
      <span className="min-w-0 truncate text-micro font-semibold uppercase tracking-[0.04em] text-soft">{name}</span>
      <span className={cx('shrink-0 text-title font-extrabold leading-tight tabular-nums', tone.text)}>{life}</span>
      {bubble ? (
        <span role="status" className={cx('pointer-events-none absolute z-30 w-max max-w-[16rem] animate-pop truncate rounded-card border bg-card-background px-2.5 py-1 text-body font-semibold normal-case tracking-normal text-foreground shadow-[0_8px_20px_rgba(0,0,0,0.4)] motion-reduce:animate-none', tone.border, mine ? 'bottom-full right-0 mb-1.5' : 'left-0 top-full mt-1.5')}>
          {bubble}
        </span>
      ) : null}
    </>
  )
  // Las dos vidas miden lo mismo (la del rival arriba, la tuya abajo).
  const style = cx('relative flex h-11 w-36 shrink-0 items-center justify-between gap-2 rounded-card border bg-card-background px-2.5 text-left', tone.border)

  return onClick ? (
    <button type="button" data-lp={side} aria-label={`${t('duel.bar.lifeOf', { name })}: ${life}. ${t('duel.bar.changeLife')}`} className={cx(style, 'cursor-pointer focus-visible:outline-none focus-visible:shadow-focus')} onClick={onClick}>
      {body}
    </button>
  ) : (
    <div role="group" data-lp={side} aria-label={`${t('duel.bar.lifeOf', { name })}: ${life}`} className={style}>
      {body}
    </div>
  )
}

/**
 * Cambiar los puntos de vida propios con el teclado de la calculadora de LP (la misma disposición): se teclea el monto (con menos de tres cifras se entiende en
 * centenas), se elige restar o sumar, la mitad se aplica sola y "=" lo confirma. Sale de abajo en el celular, donde llega el pulgar, y muestra cómo quedan los puntos.
 */
function LifeDialog({ isOpen, life, name, onClose, onChange, onHalve }: { isOpen: boolean; life: number; name: string; onClose: () => void; onChange: (delta: number) => void; onHalve: () => void }) {
  return (
    <Modal isOpen={isOpen} onClose={onClose} size="keypad" title={t('duel.life.title')} ariaLabel={t('duel.life.title')}>
      <LifeKeypad life={life} name={name} onChange={onChange} onHalve={onHalve} />
    </Modal>
  )
}

function LifeKeypad({ life, name, onChange, onHalve }: { life: number; name: string; onChange: (delta: number) => void; onHalve: () => void }) {
  const [digits, setDigits] = useState('')
  const [operator, setOperator] = useState<'-' | '+'>('-')
  const amount = interpretAmount(digits)
  const delta = operator === '-' ? -amount : amount
  const result = Math.max(0, life + delta)

  const press = (key: Key) => {
    if (key === 'clear') {
      setDigits('')
    } else if (key === '+' || key === '-') {
      setOperator(key)
    } else if (key === '÷2') {
      onHalve()
    } else {
      setDigits((current) => (current + key).slice(0, MAX_DIGITS))
    }
  }

  // Con teclado físico (escritorio): números, borrar, signo y Enter.
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.ctrlKey || event.metaKey || event.altKey) return

      if (/^\d$/.test(event.key)) setDigits((current) => (current + event.key).slice(0, MAX_DIGITS))
      else if (event.key === 'Backspace') setDigits((current) => current.slice(0, -1))
      else if (event.key === '+' || event.key === '-') setOperator(event.key)
      else if (event.key === 'Enter' && amount > 0) onChange(delta)
      else return

      event.preventDefault()
    }

    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [amount, delta, onChange])

  return (
    <div className="grid gap-3">
      <div role="status" aria-live="polite" className="grid justify-items-center gap-0.5 rounded-card bg-tint/5 px-3 py-3">
        <span className={cx('text-stat font-extrabold leading-none tabular-nums', digits ? (operator === '-' ? 'text-danger-soft' : 'text-success-soft') : 'text-accent')}>{digits ? result : life}</span>
        <span className="text-micro text-soft">{digits ? `${life} ${operator === '-' ? '−' : '+'} ${amount}` : t('duel.life.empty')}</span>
      </div>

      <div className="grid grid-cols-4 gap-2" role="group" aria-label={t('shell.life.keypad')}>
        {KEYS.map((key) => {
          const isOperator = key === '+' || key === '-'
          const active = isOperator && operator === key

          return (
            <button
              key={key}
              type="button"
              className={cx(KEY, key === 'clear' ? 'text-lead' : 'text-[1.5rem]', active && (key === '-' ? 'bg-danger/25! text-danger-soft! active:bg-danger/35!' : 'bg-success/20! text-success-soft! active:bg-success/30!'))}
              aria-label={key === '÷2' ? t('shell.life.key.half', { name }) : key === '-' ? t('shell.life.key.subtract') : key === '+' ? t('shell.life.key.add') : key === 'clear' ? t('shell.life.key.clearLabel') : undefined}
              aria-pressed={isOperator ? active : undefined}
              onClick={() => press(key)}
            >
              {key === '-' ? '−' : key === 'clear' ? t('shell.life.key.clear') : key}
            </button>
          )
        })}
      </div>

      <button
        type="button"
        className={cx(PRESSABLE, 'min-h-14 bg-primary text-stat text-primary-foreground shadow-brand active:bg-primary-hover')}
        disabled={amount === 0}
        aria-label={t(operator === '-' ? 'duel.life.applySubtract' : 'duel.life.applyAdd', { amount })}
        onClick={() => onChange(delta)}
      >
        =
      </button>
    </div>
  )
}
