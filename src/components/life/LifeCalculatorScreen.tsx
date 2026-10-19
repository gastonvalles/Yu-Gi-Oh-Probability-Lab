import { useEffect, useRef, useState, type CSSProperties } from 'react'

import { unlockAudio } from '../../app/audio'
import { currentCoin } from '../../app/cosmetics'
import {
  ROUND_LIMIT_MS,
  STARTING_LP,
  duelClockMs,
  duelistName,
  formatClock,
  interpretAmount,
  recentAmounts,
  timerRemaining,
  type Duelist,
  type LifeState,
} from '../../app/life-calculator'
import { dispatchLife, playCue, useClock, useLifeState, type RoundCue } from '../../app/life-store'
import { useAnimatedNumber, useLpFlash } from '../../app/life-effects'
import { useToastMessage } from '../../app/use-toast-message'
import { t } from '../../i18n'
import { ConfirmDialog } from '../probability/ConfirmDialog'
import { Button } from '../ui/Button'
import { cx } from '../ui/cx'
import { Icon, type IconName } from '../ui/Icon'
import { IconButton } from '../ui/IconButton'
import { Modal } from '../ui/Modal'
import { Coin, Die } from './Toss'
import { overline } from '../ui/typography'

type Operator = '-' | '+'

export const MAX_DIGITS = 6
/** El teclado de Neuron: operaciones en la primera columna, dígitos del 7 al 0 y ceros rápidos. */
export const KEYS = ['clear', '7', '8', '9', '+', '4', '5', '6', '-', '1', '2', '3', '÷2', '0', '00', '000'] as const
export type Key = (typeof KEYS)[number]
/** Últimos cinco minutos de la ronda: el reloj se pone naranja. */
const ROUND_WARNING_MS = 5 * 60 * 1000
/** Un color por duelista: el violeta de la app y el azul de las hand traps. */
const ACCENT: Record<Duelist, string> = { 0: 'text-primary-soft', 1: 'text-(--info-soft)' }
const BADGE: Record<Duelist, string> = { 0: 'bg-primary/25 text-primary-soft', 1: 'bg-[rgb(var(--info-rgb)/0.25)] text-(--info-soft)' }
/** Teclas y acciones: grandes, sin retardo táctil y con respuesta inmediata al apretar. Van con las esquinas rectas (el radio lo pone cada pieza: las teclas, ninguno). */
export const PRESSABLE =
  'touch-manipulation select-none font-semibold text-foreground transition-[background-color,transform,color] duration-100 focus-visible:outline-none focus-visible:shadow-focus active:scale-[0.96] disabled:opacity-35 [-webkit-tap-highlight-color:transparent]'
export const KEY = cx(PRESSABLE, 'min-h-12 rounded-none bg-lavender active:bg-lavender-hover @xl:min-h-10')

/** A quién iba la última operación: al cerrar y volver a abrir la calculadora sigue elegido. */
let lastSelected: Duelist = 0

/** Mientras la calculadora está abierta la pantalla no se apaga (si el sistema lo permite). */
function useWakeLock(): void {
  useEffect(() => {
    if (!('wakeLock' in navigator)) {
      return
    }

    let sentinel: WakeLockSentinel | null = null
    const request = () => {
      if (document.visibilityState !== 'visible') {
        return
      }

      navigator.wakeLock
        .request('screen')
        .then((lock) => {
          sentinel = lock
        })
        .catch(() => {
          // Batería baja o pestaña sin foco: se sigue sin el bloqueo.
        })
    }

    request()
    document.addEventListener('visibilitychange', request)

    return () => {
      document.removeEventListener('visibilitychange', request)
      void sentinel?.release()
    }
  }, [])
}

/**
 * La calculadora abierta desde un duelo (sin salir de él): en lugar del estado del dispositivo usa el del duelo, que se replica con el rival, así los dos ven los mismos números. Cada uno maneja
 * sólo sus propias vidas (el otro panel se ve pero no se elige), el reloj es el de la ronda del duelo (se pausa o se arranca para los dos) y no hay reiniciar, deshacer ni moneda y dado (el duelo trae los suyos).
 */
export interface DuelLifeBinding {
  state: LifeState
  /** Quién soy (0 = anfitrión, 1 = invitado): mis vidas van a la izquierda y son las únicas que se eligen. */
  me: Duelist
  /** Cómo se llama cada uno (0 = anfitrión, 1 = invitado). */
  names: readonly [string, string]
  /** Los minutos de la ronda (0 = sin límite: el reloj cuenta para adelante). */
  limitMin: number
  onChange: (delta: number) => void
  onHalve: () => void
  onToggleClock: () => void
}

export function LifeCalculatorScreen({ onClose, duel }: { /** Con `onClose` la calculadora es un modal (la del duelo): lleva su X. Sin él es una vista de la app y se sale por el menú. */ onClose?: () => void; duel?: DuelLifeBinding }) {
  const stored = useLifeState()
  const state = duel ? duel.state : stored
  // El de la izquierda y el de la derecha: en un duelo, yo y mi rival; solo, el Duelista 1 y el 2.
  const order: readonly [Duelist, Duelist] = duel ? [duel.me, duel.me === 0 ? 1 : 0] : [0, 1]
  const nameOf = (player: Duelist) => (duel ? duel.names[player] : duelistName(player))
  const editable = (player: Duelist) => !duel || player === duel.me
  const limited = !duel || duel.limitMin > 0
  const [selected, setSelected] = useState<Duelist>(() => (duel ? duel.me : lastSelected))
  const [operator, setOperator] = useState<Operator>('-')
  const [digits, setDigits] = useState('')
  const [logOpen, setLogOpen] = useState(false)
  const [toolsOpen, setToolsOpen] = useState(false)
  const [confirmReset, setConfirmReset] = useState(false)
  const { showToast } = useToastMessage()
  const now = useClock(state.timer.running)
  const remaining = duel ? duelClockMs(state.timer, now, duel.limitMin) : timerRemaining(state.timer, now)
  const finished = !duel && remaining === 0
  const amount = interpretAmount(digits)
  const lp = state.lp[selected]
  const recent = recentAmounts(state.log)
  const name = nameOf(selected)

  useWakeLock()

  const buzz = () => navigator.vibrate?.(12)
  const select = (player: Duelist) => {
    if (!editable(player)) return
    if (!duel) lastSelected = player
    setSelected(player)
  }
  const applyDelta = (delta: number) => {
    if (delta === 0) {
      return
    }

    if (duel) duel.onChange(delta)
    else dispatchLife({ type: 'change', player: selected, delta, now: Date.now() })
    setDigits('')
    setOperator('-')
    buzz()
  }
  const press = (key: Key) => {
    if (key === 'clear') {
      setDigits('')
      setOperator('-')
    } else if (key === '+' || key === '-') {
      setOperator(key)
    } else if (key === '÷2') {
      if (duel) duel.onHalve()
      else dispatchLife({ type: 'halve', player: selected, now: Date.now() })
      setDigits('')
      buzz()
    } else {
      setDigits((current) => (current + key).slice(0, MAX_DIGITS))
    }
  }
  const toggleClock = () => {
    unlockAudio()

    if (duel) {
      duel.onToggleClock()
      return
    }

    dispatchLife(remaining === 0 ? { type: 'timer-reset' } : { type: 'timer-toggle', now: Date.now() })
  }

  // Con teclado (escritorio): los números teclean el monto, Borrar saca un dígito, + y − eligen la operación y Enter la aplica.
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.ctrlKey || event.metaKey || event.altKey) return

      if (/^\d$/.test(event.key)) setDigits((current) => (current + event.key).slice(0, MAX_DIGITS))
      else if (event.key === 'Backspace') setDigits((current) => current.slice(0, -1))
      else if (event.key === '+' || event.key === '-') setOperator(event.key)
      else if (event.key === 'Enter' && amount > 0) applyDelta(operator === '-' ? -amount : amount)
      else return

      event.preventDefault()
    }

    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  })

  return (
    <div
      className="@container grid h-full min-h-0 gap-2 overflow-hidden bg-background px-3 pb-[calc(env(safe-area-inset-bottom,0px)+0.5rem)] pt-[calc(env(safe-area-inset-top,0px)+0.5rem)] [grid-template-areas:'head'_'lp'_'disp'_'quick'_'pad'_'eq'] [grid-template-rows:auto_minmax(auto,1.2fr)_auto_auto_minmax(auto,4fr)_auto] @xl:[grid-template-areas:'head_head'_'lp_pad'_'disp_pad'_'quick_pad'_'._eq'] @xl:[grid-template-columns:minmax(0,1fr)_minmax(0,1.1fr)] @xl:[grid-template-rows:auto_auto_auto_minmax(0,1fr)_auto] @xl:gap-x-4"
      onPointerDown={unlockAudio}
    >
      <header className="flex items-center justify-between gap-2 [grid-area:head]">
        <div className="grid gap-0.5">
          <span className={overline}>{t('shell.life.title')}</span>
          <div className="flex items-center gap-1">
            <button
              type="button"
              className={cx(
                'inline-flex touch-manipulation select-none items-center gap-1.5 text-title font-semibold tabular-nums [-webkit-tap-highlight-color:transparent]',
                limited && remaining === 0 ? 'text-danger-soft' : limited && remaining <= ROUND_WARNING_MS ? 'text-warning' : 'text-foreground',
              )}
              aria-label={finished ? t('shell.life.clock.reset') : state.timer.running ? t('shell.life.clock.pause') : t('shell.life.clock.start')}
              title={t('shell.life.clock.hint')}
              onClick={toggleClock}
            >
              <Icon name={state.timer.running ? 'pause' : 'play'} size={22} variant="bold" />
              {formatClock(remaining)}
            </button>
            {duel ? null : (
              <IconButton
                tone="ghost"
                size="sm"
                aria-label={t('shell.life.clock.reset')}
                disabled={!state.timer.running && remaining === ROUND_LIMIT_MS}
                className="disabled:opacity-35"
                onClick={() => dispatchLife({ type: 'timer-reset' })}
              >
                <Icon name="timer" size={18} />
              </IconButton>
            )}
          </div>
        </div>
        <div className="flex items-center gap-1">
          <IconButton tone="ghost" aria-label={t('shell.life.log.open')} onClick={() => setLogOpen(true)}>
            <Icon name="list" size={20} />
          </IconButton>
          {duel ? null : (
            <IconButton tone="ghost" aria-label={t('shell.life.tools.title')} onClick={() => setToolsOpen(true)}>
              <Icon name="dice" size={20} />
            </IconButton>
          )}
          {onClose ? (
            <IconButton tone="ghost" aria-label={t('shell.life.close')} onClick={onClose}>
              <Icon name="x" size={20} />
            </IconButton>
          ) : null}
        </div>
      </header>

      {/* Los dos LP lado a lado; en el medio, reiniciar y deshacer, como en Neuron. Se toca un duelista para elegir a quién va la operación. */}
      <div className="grid grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] items-center gap-1.5 [grid-area:lp]">
        <DuelistPanel position={0} name={nameOf(order[0])} lp={state.lp[order[0]]} selected={selected === order[0]} disabled={!editable(order[0])} onSelect={() => select(order[0])} />
        <div className="grid justify-items-center gap-1">
          {duel ? null : (
            <>
              <MiddleAction icon="refresh" label={t('shell.life.reset')} onClick={() => setConfirmReset(true)} />
              <MiddleAction
                icon="undo"
                label={t('shell.life.undo')}
                disabled={state.log.length === 0}
                onClick={() => {
                  dispatchLife({ type: 'undo' })
                  buzz()
                }}
              />
            </>
          )}
        </div>
        <DuelistPanel position={1} name={nameOf(order[1])} lp={state.lp[order[1]]} selected={selected === order[1]} disabled={!editable(order[1])} onSelect={() => select(order[1])} />
      </div>

      {/* La operación en curso: LP del elegido, signo y cantidad; con menos de tres dígitos los ceros de las centenas van apagados. */}
      <div className="flex min-h-12 items-center justify-between gap-2 rounded-control bg-input px-3 [grid-area:disp]">
        <output
          aria-live="polite"
          aria-label={digits ? t(operator === '-' ? 'shell.life.operation.minus' : 'shell.life.operation.plus', { name, lp, amount }) : `${name}: ${lp} LP`}
          className="flex min-w-0 items-baseline gap-1.5 text-[1.75rem] font-bold tabular-nums text-foreground"
        >
          <span>{lp}</span>
          {digits ? (
            <>
              <span className={operator === '-' ? 'text-danger-soft' : 'text-success-soft'}>{operator === '-' ? '−' : '+'}</span>
              <span>
                {digits}
                {digits.length < 3 ? <span className="text-soft">00</span> : null}
              </span>
            </>
          ) : null}
        </output>
        <span className={cx('shrink-0 rounded-tag px-2 py-0.5 text-micro font-semibold', BADGE[order[0] === selected ? 0 : 1])}>{name}</span>
      </div>

      {/* Los últimos cambios, para repetirlos con un toque sobre el duelista elegido. */}
      <div className="grid grid-cols-3 gap-1.5 [grid-area:quick] @xl:self-start" aria-label={t('shell.life.recent.label')}>
        {[0, 1, 2].map((slot) => {
          const delta = recent[slot]

          return delta === undefined ? (
            <span key={slot} className="min-h-10" aria-hidden="true" />
          ) : (
            <button
              key={slot}
              type="button"
              className={cx(PRESSABLE, 'min-h-10 rounded-none text-lead tabular-nums', delta < 0 ? 'bg-danger/15 text-danger-soft active:bg-danger/30' : 'bg-success/12 text-success-soft active:bg-success/25')}
              aria-label={t(delta < 0 ? 'shell.life.recent.subtract' : 'shell.life.recent.add', { amount: Math.abs(delta), name })}
              onClick={() => applyDelta(delta)}
            >
              {delta < 0 ? '−' : '+'}
              {Math.abs(delta)}
            </button>
          )
        })}
      </div>

      <div className="grid grid-cols-4 grid-rows-4 gap-2 [grid-area:pad]" role="group" aria-label={t('shell.life.keypad')}>
        {KEYS.map((key) => {
          const isOperator = key === '+' || key === '-'
          const active = isOperator && operator === key

          return (
            <button
              key={key}
              type="button"
              className={cx(
                KEY,
                key === 'clear' ? 'text-lead' : 'text-[1.75rem]',
                active && (key === '-' ? 'bg-danger/25 text-danger-soft active:bg-danger/35' : 'bg-success/20 text-success-soft active:bg-success/30'),
              )}
              aria-label={key === '÷2' ? t('shell.life.key.half', { name }) : key === '-' ? t('shell.life.key.subtract') : key === '+' ? t('shell.life.key.add') : key === 'clear' ? t('shell.life.key.clearAllLabel') : undefined}
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
        className={cx(PRESSABLE, 'min-h-[5.25rem] rounded-none bg-primary text-stat text-primary-foreground active:bg-primary-hover [grid-area:eq] @xl:min-h-14')}
        disabled={amount === 0}
        aria-label={t(operator === '-' ? 'shell.life.apply.subtract' : 'shell.life.apply.add', { amount, name })}
        onClick={() => applyDelta(operator === '-' ? -amount : amount)}
      >
        =
      </button>

      <Modal
        isOpen={logOpen}
        onClose={() => setLogOpen(false)}
        size="sheet"
        title={t('shell.life.log.title')}
        subtitle={t('shell.life.log.subtitle', { clock: formatClock(remaining), count: state.log.length })}
      >
        {state.log.length === 0 ? (
          <p className="m-0 py-6 text-center text-body text-muted">{t('shell.life.log.empty')}</p>
        ) : (
          <ol className="m-0 grid list-none gap-1 p-0">
            {state.log
              .map((entry, index) => (
                <li key={index} className="grid grid-cols-[3.5rem_minmax(0,1fr)_auto] items-center gap-2 rounded-control bg-tint/5 px-3 py-2 text-body tabular-nums">
                  <span className="text-muted">{formatClock(duel ? (duel.limitMin > 0 ? Math.max(0, duel.limitMin * 60_000 - entry.at) : entry.at) : Math.max(0, ROUND_LIMIT_MS - entry.at))}</span>
                  <span className="truncate font-semibold text-foreground">{nameOf(entry.player)}</span>
                  <span>
                    <span className={entry.delta < 0 ? 'text-danger-soft' : 'text-success-soft'}>
                      {entry.delta < 0 ? '−' : '+'}
                      {Math.abs(entry.delta)}
                    </span>
                    <span className="text-muted"> → {entry.to}</span>
                  </span>
                </li>
              ))
              .reverse()}
          </ol>
        )}
      </Modal>

      {duel ? null : (
        <Modal isOpen={toolsOpen} onClose={() => setToolsOpen(false)} size="sm" title={t('shell.life.tools.title')}>
          <ToolsPanel />
        </Modal>
      )}

      <ConfirmDialog
        isOpen={confirmReset}
        title={t('shell.life.resetDialog.title')}
        description={t('shell.life.resetDialog.description', { lp: STARTING_LP })}
        confirmLabel={t('shell.life.resetDialog.confirm')}
        confirmColor="danger"
        onCancel={() => setConfirmReset(false)}
        onConfirm={() => {
          dispatchLife({ type: 'reset' })
          setDigits('')
          setOperator('-')
          setConfirmReset(false)
          showToast(t('shell.life.resetDialog.done'), 'success')
        }}
      />
    </div>
  )
}

/** Un duelista: su número grande (que se mueve y se pinta de verde o rojo al cambiar) y su nombre. `position` es dónde está (0 izquierda, 1 derecha: da el color y la flecha); `disabled`, el del rival en un duelo: se ve, no se elige. */
function DuelistPanel({ position, name, lp, selected, disabled = false, onSelect }: { position: 0 | 1; name: string; lp: number; selected: boolean; disabled?: boolean; onSelect: () => void }) {
  const shown = useAnimatedNumber(lp)
  const flash = useLpFlash(lp)

  return (
    <button
      type="button"
      aria-pressed={disabled ? undefined : selected}
      aria-label={disabled ? `${name}: ${lp} LP` : t(selected ? 'shell.life.duelist.selected' : 'shell.life.duelist.choose', { name, lp })}
      aria-disabled={disabled || undefined}
      data-player={position}
      className={cx(PRESSABLE, '@container grid min-w-0 content-center justify-items-center gap-1 rounded-card px-1 py-3 @xl:py-1', selected ? 'bg-card-background/70' : 'bg-transparent', disabled && 'cursor-default active:scale-100')}
      onClick={onSelect}
    >
      <strong
        aria-live="polite"
        // El número llena el ancho del panel: a más dígitos, letra más chica (--digits), sin cortar nunca.
        style={{ '--digits': Math.max(3, String(lp).length) } as CSSProperties}
        className={cx(
          'max-w-full text-[clamp(2rem,calc(152cqw/var(--digits)),4.25rem)] font-bold leading-none tracking-tight tabular-nums transition-colors duration-200',
          flash === 'up' ? 'text-success' : flash === 'down' ? 'text-danger' : lp === 0 ? 'text-danger-soft' : selected || disabled ? ACCENT[position] : 'text-soft',
        )}
      >
        {shown}
      </strong>
      <span className={cx('max-w-full truncate text-lead font-semibold', selected || disabled ? 'text-foreground' : 'text-soft')}>
        {position === 1 ? '« ' : null}
        {name}
        {position === 0 ? ' »' : null}
      </span>
    </button>
  )
}

function MiddleAction({ icon, label, disabled, onClick }: { icon: IconName; label: string; disabled?: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      className={cx(PRESSABLE, 'grid justify-items-center gap-0.5 rounded-none px-1 py-1 text-[0.625rem] font-semibold text-muted active:bg-tint/12')}
      disabled={disabled}
      aria-label={label}
      onClick={onClick}
    >
      <Icon name={icon} size={20} />
      {label}
    </button>
  )
}

type Toss = { id: number; kind: 'coin'; face: 0 | 1 } | { id: number; kind: 'die'; value: number }

/** Moneda y dado de seis caras: se tiran con animación y el resultado aparece cuando terminan de girar. */
function ToolsPanel() {
  const [toss, setToss] = useState<Toss | null>(null)
  const count = useRef(0)
  const coin = currentCoin()

  // Las dos caras se bajan al abrir el panel: la primera tirada no espera a las imágenes.
  useEffect(() => {
    for (const url of [coin.heads, coin.tails]) {
      new Image().src = url
    }
  }, [coin])

  const throwCoin = () => {
    setToss({ id: (count.current += 1), kind: 'coin', face: Math.random() < 0.5 ? 0 : 1 })
    navigator.vibrate?.(12)
  }
  const throwDie = () => {
    setToss({ id: (count.current += 1), kind: 'die', value: 1 + Math.floor(Math.random() * 6) })
    navigator.vibrate?.(12)
  }
  const label = toss === null ? ' ' : toss.kind === 'coin' ? t(toss.face === 0 ? 'shell.life.coin.heads' : 'shell.life.coin.tails') : t('shell.life.die.rolled', { value: toss.value })

  return (
    <div className="grid gap-4">
      <div className="grid grid-cols-2 gap-2">
        <Button variant="secondary" onClick={throwCoin}>
          {t('shell.life.coin.button')}
        </Button>
        <Button variant="secondary" onClick={throwDie}>
          {t('shell.life.die.button')}
        </Button>
      </div>
      <div className="grid min-h-44 place-items-center [perspective:40rem]">
        {toss === null ? (
          <p className="m-0 text-body text-muted">{t('shell.life.tools.tapToThrow')}</p>
        ) : toss.kind === 'coin' ? (
          <Coin key={toss.id} face={toss.face} />
        ) : (
          <Die key={toss.id} value={toss.value} />
        )}
      </div>
      <p key={toss?.id ?? 'none'} aria-live="polite" className={cx('m-0 min-h-8 text-center text-title font-bold text-foreground', toss && 'animate-reveal motion-reduce:animate-none')}>
        {label}
      </p>

      {/* Para escuchar (y sentir) cómo avisa la ronda antes de que haga falta. */}
      <div className="grid gap-2 border-t border-border-subtle pt-3">
        <span className={overline}>{t('shell.life.tools.testCues')}</span>
        <div className="grid grid-cols-3 gap-2">
          {CUE_TESTS.map((kind) => (
            <Button
              key={kind}
              variant="secondary"
              size="sm"
              onClick={() => {
                unlockAudio()
                playCue(kind)
              }}
            >
              {kind === 'end' ? t('shell.life.tools.cueEnd') : kind === 'five' ? '5 min' : '10 min'}
            </Button>
          ))}
        </div>
      </div>
    </div>
  )
}

const CUE_TESTS: readonly RoundCue[] = ['ten', 'five', 'end']
