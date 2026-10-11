import { useEffect, useReducer, useRef, useState, type CSSProperties } from 'react'

import {
  DUELIST_NAMES,
  ROUND_LIMIT_MS,
  STARTING_LP,
  formatClock,
  lifeReducer,
  readLifeState,
  timerRemaining,
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
/** Últimos cinco minutos de la ronda: el reloj se pone naranja. */
const ROUND_WARNING_MS = 5 * 60 * 1000
/** Un color por duelista: el violeta de la app y el azul de las hand traps. */
const ACCENT: Record<Duelist, string> = { 0: 'text-primary-soft', 1: 'text-(--info-soft)' }
/** Teclas y acciones: grandes, sin retardo táctil y con respuesta inmediata al apretar. */
const PRESSABLE =
  'touch-manipulation select-none rounded-control font-semibold text-foreground transition-[background-color,transform] duration-100 focus-visible:outline-none focus-visible:shadow-focus active:scale-[0.96] disabled:opacity-35 [-webkit-tap-highlight-color:transparent]'
const KEY = cx(PRESSABLE, 'h-10 bg-lavender text-lead active:bg-lavender-hover portrait:h-11')
const ACTION = cx(PRESSABLE, 'h-11 min-w-[4.25rem] flex-1 text-title leading-none')

let audio: AudioContext | null = null

/** El audio se desbloquea con un toque (iOS lo exige): así la alarma puede sonar sola cuando se acaba la ronda. */
function unlockAudio(): void {
  if (typeof AudioContext === 'undefined') {
    return
  }

  audio ??= new AudioContext()
  void audio.resume()
}

/** Cuatro pitidos alternados, sin archivos de sonido. */
function playAlarm(): void {
  if (!audio) {
    return
  }

  const start = audio.currentTime

  for (let beep = 0; beep < 4; beep += 1) {
    const at = start + beep * 0.45
    const oscillator = audio.createOscillator()
    const gain = audio.createGain()

    oscillator.type = 'square'
    oscillator.frequency.value = beep % 2 === 0 ? 880 : 1175
    gain.gain.setValueAtTime(0.0001, at)
    gain.gain.exponentialRampToValueAtTime(0.25, at + 0.02)
    gain.gain.exponentialRampToValueAtTime(0.0001, at + 0.35)
    oscillator.connect(gain).connect(audio.destination)
    oscillator.start(at)
    oscillator.stop(at + 0.4)
  }
}

/** El reloj de la pantalla: avanza cada segundo mientras la cuenta corre (y se corrige al volver a la app). */
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
  const remaining = timerRemaining(state.timer, now)
  const value = Number(amount) || 0

  useEffect(() => writeLifeState(state), [state])
  useWakeLock()

  // La alarma se programa para el instante justo en que se acaba la ronda (el reloj se guarda: sobrevive a recargar).
  useEffect(() => {
    if (!state.timer.running) {
      return
    }

    const left = timerRemaining(state.timer, Date.now())

    if (left <= 0) {
      return
    }

    const id = window.setTimeout(() => {
      dispatch({ type: 'timer-toggle', now: Date.now() })
      playAlarm()
      navigator.vibrate?.([300, 150, 300, 150, 600])
      showToast('Se terminó el tiempo de la ronda', 'warning')
    }, left)

    return () => window.clearTimeout(id)
  }, [state.timer, showToast])

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
  const toggleClock = () => {
    unlockAudio()
    dispatch(remaining === 0 ? { type: 'timer-reset' } : { type: 'timer-toggle', now: Date.now() })
  }

  return (
    <div
      className="fixed inset-x-0 top-0 bottom-[calc(var(--deck-mobile-step-nav-height,4.3rem)+env(safe-area-inset-bottom,0px))] z-130 grid min-h-0 gap-2 overflow-hidden bg-background px-gutter pb-2 pt-[calc(env(safe-area-inset-top,0px)+0.5rem)] [grid-template-areas:'head'_'one'_'two'_'pad'] [grid-template-rows:auto_minmax(0,1fr)_minmax(0,1fr)_auto] landscape:[grid-template-areas:'head_head_head'_'one_pad_two'] landscape:[grid-template-columns:minmax(0,1fr)_auto_minmax(0,1fr)] landscape:[grid-template-rows:auto_minmax(0,1fr)] min-[1101px]:static min-[1101px]:h-full min-[1101px]:px-6 min-[1101px]:pt-4"
      onPointerDown={unlockAudio}
    >
      <header className="flex items-center justify-between gap-2 [grid-area:head]">
        <div className="grid gap-0.5">
          <span className={overline}>Calculadora de LP</span>
          <div className="flex items-center gap-1">
            <button
              type="button"
              className={cx(
                'inline-flex touch-manipulation select-none items-center gap-1.5 text-lead font-semibold tabular-nums [-webkit-tap-highlight-color:transparent]',
                remaining === 0 ? 'text-danger-soft' : remaining <= ROUND_WARNING_MS ? 'text-warning' : 'text-foreground',
              )}
              aria-label={remaining === 0 ? 'Volver a 50:00' : state.timer.running ? 'Pausar el reloj de la ronda' : 'Poner a correr el reloj de la ronda'}
              title="Cuenta regresiva de la ronda (50 minutos); suena al llegar a cero"
              onClick={toggleClock}
            >
              <Icon name={state.timer.running ? 'pause' : 'play'} size={18} variant="bold" />
              {formatClock(remaining)}
            </button>
            <IconButton
              tone="ghost"
              size="sm"
              aria-label="Volver a 50:00"
              disabled={!state.timer.running && remaining === ROUND_LIMIT_MS}
              className="disabled:opacity-35"
              onClick={() => dispatch({ type: 'timer-reset' })}
            >
              <Icon name="timer" size={18} />
            </IconButton>
          </div>
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
          <IconButton tone="ghost" aria-label="Moneda y dado" onClick={() => setToolsOpen(true)}>
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
        subtitle={`${formatClock(remaining)} de ronda · ${state.log.length} ${state.log.length === 1 ? 'cambio' : 'cambios'}`}
      >
        {state.log.length === 0 ? (
          <p className="m-0 py-6 text-center text-body text-muted">Todavía no cambió ningún LP.</p>
        ) : (
          <ol className="m-0 grid list-none gap-1 p-0">
            {state.log
              .map((entry, index) => (
                <li key={index} className="grid grid-cols-[3.5rem_minmax(0,1fr)_auto] items-center gap-2 rounded-control bg-tint/5 px-3 py-2 text-body tabular-nums">
                  <span className="text-muted">{formatClock(Math.max(0, ROUND_LIMIT_MS - entry.at))}</span>
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

      <Modal isOpen={toolsOpen} onClose={() => setToolsOpen(false)} size="sm" title="Moneda y dado">
        <ToolsPanel />
      </Modal>

      <ConfirmDialog
        isOpen={confirmReset}
        title="¿Reiniciar el duelo?"
        description={`Los dos vuelven a ${STARTING_LP} LP y se vacía el registro. El reloj de la ronda sigue como está.`}
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

type Toss = { id: number; kind: 'coin'; face: 0 | 1 } | { id: number; kind: 'die'; value: number }

/** Moneda y dado de seis caras: se tiran con animación y el resultado aparece cuando terminan de girar. */
function ToolsPanel() {
  const [toss, setToss] = useState<Toss | null>(null)
  const count = useRef(0)
  const throwCoin = () => {
    setToss({ id: (count.current += 1), kind: 'coin', face: Math.random() < 0.5 ? 0 : 1 })
    navigator.vibrate?.(12)
  }
  const throwDie = () => {
    setToss({ id: (count.current += 1), kind: 'die', value: 1 + Math.floor(Math.random() * 6) })
    navigator.vibrate?.(12)
  }
  const label = toss === null ? ' ' : toss.kind === 'coin' ? (toss.face === 0 ? 'Cara' : 'Cruz') : `Salió ${toss.value}`

  return (
    <div className="grid gap-4">
      <div className="grid grid-cols-2 gap-2">
        <Button variant="secondary" onClick={throwCoin}>
          Moneda
        </Button>
        <Button variant="secondary" onClick={throwDie}>
          Dado
        </Button>
      </div>
      <div className="grid min-h-32 place-items-center [perspective:40rem]">
        {toss === null ? (
          <p className="m-0 text-body text-muted">Tocá para tirar.</p>
        ) : toss.kind === 'coin' ? (
          <Coin key={toss.id} face={toss.face} />
        ) : (
          <Die key={toss.id} value={toss.value} />
        )}
      </div>
      <p key={toss?.id ?? 'none'} aria-live="polite" className={cx('m-0 min-h-8 text-center text-title font-bold text-foreground', toss && 'animate-reveal motion-reduce:animate-none')}>
        {label}
      </p>
    </div>
  )
}

/** Cara adelante, cruz atrás: la animación da cinco vueltas y cae del lado que salió (sin movimiento, cae directo). */
function Coin({ face }: { face: 0 | 1 }) {
  return (
    <div
      className="relative size-24 animate-coin-flip [transform-style:preserve-3d] motion-reduce:animate-none"
      style={{ transform: `rotateY(${face * 180}deg)`, '--coin-turns': `${1800 + face * 180}deg` } as CSSProperties}
    >
      <span className="absolute inset-0 grid place-items-center rounded-full bg-primary text-lead font-bold text-primary-foreground shadow-brand [backface-visibility:hidden]">Cara</span>
      <span className="absolute inset-0 grid place-items-center rounded-full bg-lavender-light text-lead font-bold text-primary [backface-visibility:hidden] [transform:rotateY(180deg)]">Cruz</span>
    </div>
  )
}

/** Puntos de cada cara (celdas de una grilla de 3×3) y cómo se ubica cada cara en el cubo. */
const PIPS: Record<number, number[]> = { 1: [4], 2: [2, 6], 3: [2, 4, 6], 4: [0, 2, 6, 8], 5: [0, 2, 4, 6, 8], 6: [0, 2, 3, 5, 6, 8] }
const FACE_PLACEMENT: Record<number, string> = { 1: 'rotateY(0deg)', 2: 'rotateX(90deg)', 3: 'rotateY(90deg)', 4: 'rotateY(-90deg)', 5: 'rotateX(-90deg)', 6: 'rotateY(180deg)' }
/** Giro del cubo (X, Y) que deja esa cara mirando al frente. */
const FACE_UP: Record<number, [number, number]> = { 1: [0, 0], 2: [-90, 0], 3: [0, -90], 4: [0, 90], 5: [90, 0], 6: [0, 180] }

function Die({ value }: { value: number }) {
  const [x, y] = FACE_UP[value] ?? [0, 0]

  return (
    <div
      className="relative size-20 animate-die-roll [transform-style:preserve-3d] motion-reduce:animate-none"
      style={{ transform: `rotateX(${x}deg) rotateY(${y}deg)`, '--die-x': `${x + 720}deg`, '--die-y': `${y + 1080}deg` } as CSSProperties}
    >
      {[1, 2, 3, 4, 5, 6].map((face) => (
        <span
          key={face}
          className="absolute inset-0 grid grid-cols-3 grid-rows-3 gap-1 rounded-card bg-lavender-light p-3 shadow-card [backface-visibility:hidden]"
          style={{ transform: `${FACE_PLACEMENT[face]} translateZ(2.5rem)` }}
        >
          {Array.from({ length: 9 }, (_, cell) => (
            <span key={cell} className={cx('rounded-full', PIPS[face]?.includes(cell) && 'bg-primary')} />
          ))}
        </span>
      ))}
    </div>
  )
}
