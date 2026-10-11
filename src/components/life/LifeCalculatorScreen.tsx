import { useEffect, useReducer, useRef, useState } from 'react'

import {
  DUELIST_NAMES,
  ROUND_LIMIT_MS,
  STARTING_LP,
  formatClock,
  lifeReducer,
  readLifeState,
  timerElapsed,
  writeLifeState,
  type Duelist,
} from '../../app/life-calculator'
import { prefersReducedMotion } from '../../app/motion'
import { useToastMessage } from '../../app/use-toast-message'
import { ConfirmDialog } from '../probability/ConfirmDialog'
import { Button } from '../ui/Button'
import { cx } from '../ui/cx'
import { Icon } from '../ui/Icon'
import { IconButton } from '../ui/IconButton'
import { Modal } from '../ui/Modal'
import { overline } from '../ui/typography'

const MAX_DIGITS = 6
const KEYS = ['1', '2', '3', '4', '5', '6', '7', '8', '9', '00', '0', '⌫'] as const
/** Un color por duelista: el violeta de la app y el azul de las hand traps. */
const ACCENT: Record<Duelist, string> = { 0: 'text-primary-soft', 1: 'text-(--info-soft)' }
/** Teclas y acciones: grandes, sin retardo táctil y con respuesta inmediata al apretar. */
const PRESSABLE =
  'touch-manipulation select-none rounded-control font-semibold text-foreground transition-[background-color,transform] duration-100 focus-visible:outline-none focus-visible:shadow-focus active:scale-[0.96] disabled:opacity-35 [-webkit-tap-highlight-color:transparent]'
const KEY = cx(PRESSABLE, 'h-10 bg-lavender text-lead active:bg-lavender-hover portrait:h-11')
const ACTION = cx(PRESSABLE, 'h-11 min-w-[4.25rem] flex-1 text-title leading-none')

/** El reloj de la pantalla: avanza cada segundo mientras el cronómetro corre (y se corrige al volver a la app). */
function useClock(active: boolean): number {
  const [now, setNow] = useState(() => Date.now())

  useEffect(() => {
    if (!active) {
      return
    }

    const tick = () => setNow(Date.now())

    tick()
    const id = window.setInterval(tick, 1000)
    document.addEventListener('visibilitychange', tick)

    return () => {
      window.clearInterval(id)
      document.removeEventListener('visibilitychange', tick)
    }
  }, [active])

  return now
}

/** El número de LP se mueve hasta el valor nuevo en vez de saltar (salvo con movimiento reducido). */
function useAnimatedNumber(target: number): number {
  const [shown, setShown] = useState(target)
  const shownRef = useRef(target)

  useEffect(() => {
    const from = shownRef.current

    if (from === target || prefersReducedMotion()) {
      shownRef.current = target
      setShown(target)
      return
    }

    const start = performance.now()
    const duration = 320
    let frame = 0
    const step = (time: number) => {
      const progress = Math.min(1, (time - start) / duration)
      const eased = 1 - (1 - progress) ** 3
      const value = Math.round(from + (target - from) * eased)

      shownRef.current = value
      setShown(value)

      if (progress < 1) {
        frame = requestAnimationFrame(step)
      }
    }

    frame = requestAnimationFrame(step)

    return () => cancelAnimationFrame(frame)
  }, [target])

  return shown
}

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

export function LifeCalculatorScreen() {
  const [state, dispatch] = useReducer(lifeReducer, undefined, () => readLifeState())
  const [amount, setAmount] = useState('')
  const [logOpen, setLogOpen] = useState(false)
  const [toolsOpen, setToolsOpen] = useState(false)
  const [confirmReset, setConfirmReset] = useState(false)
  const { showToast } = useToastMessage()
  const now = useClock(state.timer.running)
  const elapsed = timerElapsed(state.timer, now)
  const value = Number(amount) || 0

  useEffect(() => writeLifeState(state), [state])
  useWakeLock()

  const buzz = () => navigator.vibrate?.(12)
  const change = (player: Duelist, sign: 1 | -1) => {
    if (value === 0) {
      return
    }

    dispatch({ type: 'change', player, delta: sign * value, now: Date.now() })
    setAmount('')
    buzz()
  }
  const halve = (player: Duelist) => {
    dispatch({ type: 'halve', player, now: Date.now() })
    buzz()
  }
  const press = (key: string) => {
    setAmount((current) => (key === '⌫' ? current.slice(0, -1) : (current + key).replace(/^0+(?=\d)/, '').slice(0, MAX_DIGITS)))
  }

  return (
    <div className="fixed inset-x-0 top-0 bottom-[calc(var(--deck-mobile-step-nav-height,4.3rem)+env(safe-area-inset-bottom,0px))] z-130 grid min-h-0 gap-2 overflow-hidden bg-background px-gutter pb-2 pt-[calc(env(safe-area-inset-top,0px)+0.5rem)] [grid-template-areas:'head'_'one'_'two'_'pad'] [grid-template-rows:auto_minmax(0,1fr)_minmax(0,1fr)_auto] landscape:[grid-template-areas:'head_head_head'_'one_pad_two'] landscape:[grid-template-columns:minmax(0,1fr)_auto_minmax(0,1fr)] landscape:[grid-template-rows:auto_minmax(0,1fr)] min-[1101px]:static min-[1101px]:h-full min-[1101px]:px-6 min-[1101px]:pt-4">
      <header className="flex items-center justify-between gap-2 [grid-area:head]">
        <div className="grid gap-0.5">
          <span className={overline}>Calculadora de LP</span>
          <button
            type="button"
            className={cx(
              'inline-flex touch-manipulation select-none items-center gap-1.5 text-lead font-semibold tabular-nums [-webkit-tap-highlight-color:transparent]',
              elapsed >= ROUND_LIMIT_MS ? 'text-warning' : 'text-foreground',
            )}
            aria-label={state.timer.running ? 'Pausar el reloj' : 'Poner a correr el reloj'}
            title={elapsed >= ROUND_LIMIT_MS ? 'Se pasaron los 40 minutos de la ronda' : undefined}
            onClick={() => dispatch({ type: 'timer-toggle', now: Date.now() })}
          >
            <Icon name={state.timer.running ? 'pause' : 'play'} size={18} variant="bold" />
            {formatClock(elapsed)}
          </button>
        </div>
        <div className="flex items-center gap-1">
          <IconButton
            tone="ghost"
            aria-label="Deshacer el último cambio"
            disabled={state.log.length === 0}
            className="disabled:opacity-35"
            onClick={() => {
              dispatch({ type: 'undo' })
              buzz()
            }}
          >
            <Icon name="undo" size={20} />
          </IconButton>
          <IconButton tone="ghost" aria-label="Ver el registro del duelo" onClick={() => setLogOpen(true)}>
            <Icon name="list" size={20} />
          </IconButton>
          <IconButton tone="ghost" aria-label="Moneda, dado y sorteo" onClick={() => setToolsOpen(true)}>
            <Icon name="dice" size={20} />
          </IconButton>
          <IconButton tone="ghost" aria-label="Reiniciar el duelo" onClick={() => setConfirmReset(true)}>
            <Icon name="refresh" size={20} />
          </IconButton>
        </div>
      </header>

      <DuelistPanel player={0} lp={state.lp[0]} amount={value} onChange={change} onHalve={halve} />
      <DuelistPanel player={1} lp={state.lp[1]} amount={value} onChange={change} onHalve={halve} />

      <div className="grid gap-1.5 [grid-area:pad] landscape:w-[13.5rem] landscape:self-center">
        <div className="flex min-h-10 items-center justify-between gap-2 rounded-control bg-input px-3">
          <output aria-label="Cantidad a restar o sumar" className="text-title font-bold tabular-nums text-foreground">
            {amount || '0'}
          </output>
          <button type="button" className={cx(PRESSABLE, 'px-2 py-1 text-body text-muted')} disabled={amount === ''} onClick={() => setAmount('')}>
            Borrar
          </button>
        </div>
        <div className="grid grid-cols-3 gap-1.5">
          {KEYS.map((key) => (
            <button key={key} type="button" className={KEY} aria-label={key === '⌫' ? 'Borrar el último dígito' : undefined} onClick={() => press(key)}>
              {key}
            </button>
          ))}
        </div>
      </div>

      <Modal
        isOpen={logOpen}
        onClose={() => setLogOpen(false)}
        size="sheet"
        title="Registro del duelo"
        subtitle={`${formatClock(elapsed)} de duelo · ${state.log.length} ${state.log.length === 1 ? 'cambio' : 'cambios'}`}
      >
        {state.log.length === 0 ? (
          <p className="m-0 py-6 text-center text-body text-muted">Todavía no cambió ningún LP.</p>
        ) : (
          <ol className="m-0 grid list-none gap-1 p-0">
            {state.log
              .map((entry, index) => (
                <li key={index} className="grid grid-cols-[3.5rem_minmax(0,1fr)_auto] items-center gap-2 rounded-control bg-tint/5 px-3 py-2 text-body tabular-nums">
                  <span className="text-muted">{formatClock(entry.at)}</span>
                  <span className="truncate font-semibold text-foreground">{DUELIST_NAMES[entry.player]}</span>
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

      <Modal isOpen={toolsOpen} onClose={() => setToolsOpen(false)} size="sm" title="Moneda, dado y sorteo">
        <ToolsPanel />
      </Modal>

      <ConfirmDialog
        isOpen={confirmReset}
        title="¿Reiniciar el duelo?"
        description={`Los dos vuelven a ${STARTING_LP} LP, se vacía el registro y el reloj vuelve a cero.`}
        confirmLabel="Reiniciar"
        confirmColor="danger"
        onCancel={() => setConfirmReset(false)}
        onConfirm={() => {
          dispatch({ type: 'reset' })
          setAmount('')
          setConfirmReset(false)
          showToast('Duelo reiniciado', 'success')
        }}
      />
    </div>
  )
}

function DuelistPanel({
  player,
  lp,
  amount,
  onChange,
  onHalve,
}: {
  player: Duelist
  lp: number
  amount: number
  onChange: (player: Duelist, sign: 1 | -1) => void
  onHalve: (player: Duelist) => void
}) {
  const shown = useAnimatedNumber(lp)
  const name = DUELIST_NAMES[player]

  return (
    <section
      aria-label={name}
      className={cx(
        'grid min-h-0 content-center justify-items-center gap-1 rounded-card bg-card-background/60 px-3 py-2',
        player === 0 ? '[grid-area:one]' : '[grid-area:two]',
      )}
    >
      <span className={overline}>{name}</span>
      <strong
        aria-live="polite"
        className={cx('text-[clamp(2.5rem,13vw,4.75rem)] font-bold leading-none tracking-tight tabular-nums', lp === 0 ? 'text-danger-soft' : ACCENT[player])}
      >
        {shown}
      </strong>
      <span className="min-h-5 text-body tabular-nums text-muted" aria-hidden={amount === 0}>
        {amount > 0 ? `−${amount} → ${Math.max(0, lp - amount)}` : ' '}
      </span>
      <div className="flex w-full max-w-[18rem] gap-2 pt-1">
        <button
          type="button"
          className={cx(ACTION, 'bg-danger/20 text-danger-soft active:bg-danger/35')}
          disabled={amount === 0}
          aria-label={`Restar ${amount} a ${name}`}
          onClick={() => onChange(player, -1)}
        >
          −
        </button>
        <button
          type="button"
          className={cx(ACTION, 'bg-success/15 text-success-soft active:bg-success/30')}
          disabled={amount === 0}
          aria-label={`Sumar ${amount} a ${name}`}
          onClick={() => onChange(player, 1)}
        >
          +
        </button>
        <button type="button" className={cx(ACTION, 'bg-lavender active:bg-lavender-hover')} disabled={lp === 0} aria-label={`Dejar a ${name} con la mitad`} onClick={() => onHalve(player)}>
          ½
        </button>
      </div>
    </section>
  )
}

function ToolsPanel() {
  const [result, setResult] = useState<{ id: number; text: string } | null>(null)
  const roll = (text: string) => {
    setResult({ id: Date.now(), text })
    navigator.vibrate?.(12)
  }

  return (
    <div className="grid gap-3">
      <div className="grid grid-cols-3 gap-2">
        <Button variant="secondary" onClick={() => roll(Math.random() < 0.5 ? 'Cara' : 'Cruz')}>
          Moneda
        </Button>
        <Button variant="secondary" onClick={() => roll(`Dado: ${1 + Math.floor(Math.random() * 6)}`)}>
          Dado
        </Button>
        <Button variant="secondary" onClick={() => roll(`Empieza ${DUELIST_NAMES[Math.random() < 0.5 ? 0 : 1]}`)}>
          Sorteo
        </Button>
      </div>
      <p key={result?.id ?? 'none'} aria-live="polite" className={cx('m-0 min-h-12 text-center text-title font-bold text-foreground', result && 'animate-pop motion-reduce:animate-none')}>
        {result?.text ?? ' '}
      </p>
    </div>
  )
}
