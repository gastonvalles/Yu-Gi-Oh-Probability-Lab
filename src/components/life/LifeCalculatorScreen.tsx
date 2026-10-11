import { useEffect, useRef, useState, type CSSProperties } from 'react'

import { currentCoin } from '../../app/cosmetics'
import {
  DUELIST_NAMES,
  ROUND_LIMIT_MS,
  STARTING_LP,
  formatClock,
  interpretAmount,
  recentAmounts,
  timerRemaining,
  type Duelist,
} from '../../app/life-calculator'
import { dispatchLife, playCue, unlockAudio, useClock, useLifeState, type RoundCue } from '../../app/life-store'
import { prefersReducedMotion } from '../../app/motion'
import { useToastMessage } from '../../app/use-toast-message'
import { ConfirmDialog } from '../probability/ConfirmDialog'
import { Button } from '../ui/Button'
import { cx } from '../ui/cx'
import { Icon, type IconName } from '../ui/Icon'
import { IconButton } from '../ui/IconButton'
import { Modal } from '../ui/Modal'
import { overline } from '../ui/typography'

type Operator = '-' | '+'

const MAX_DIGITS = 6
/** El teclado de Neuron: operaciones en la primera columna, dígitos del 7 al 0 y ceros rápidos. */
const KEYS = ['Borrar', '7', '8', '9', '+', '4', '5', '6', '-', '1', '2', '3', '÷2', '0', '00', '000'] as const
type Key = (typeof KEYS)[number]
/** Últimos cinco minutos de la ronda: el reloj se pone naranja. */
const ROUND_WARNING_MS = 5 * 60 * 1000
/** Un color por duelista: el violeta de la app y el azul de las hand traps. */
const ACCENT: Record<Duelist, string> = { 0: 'text-primary-soft', 1: 'text-(--info-soft)' }
const BADGE: Record<Duelist, string> = { 0: 'bg-primary/25 text-primary-soft', 1: 'bg-[rgb(var(--info-rgb)/0.25)] text-(--info-soft)' }
/** Teclas y acciones: grandes, sin retardo táctil y con respuesta inmediata al apretar. */
const PRESSABLE =
  'touch-manipulation select-none rounded-control font-semibold text-foreground transition-[background-color,transform,color] duration-100 focus-visible:outline-none focus-visible:shadow-focus active:scale-[0.96] disabled:opacity-35 [-webkit-tap-highlight-color:transparent]'
const KEY = cx(PRESSABLE, 'min-h-12 bg-lavender active:bg-lavender-hover @xl:min-h-10')

/** A quién iba la última operación: al cerrar y volver a abrir la calculadora sigue elegido. */
let lastSelected: Duelist = 0

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

/** Al cambiar, el LP se pinta un momento de verde (subió) o rojo (bajó). */
function useLpFlash(lp: number): 'up' | 'down' | null {
  const [flash, setFlash] = useState<'up' | 'down' | null>(null)
  const previous = useRef(lp)

  useEffect(() => {
    if (previous.current === lp) {
      return
    }

    setFlash(lp > previous.current ? 'up' : 'down')
    previous.current = lp
    const id = window.setTimeout(() => setFlash(null), 900)

    return () => window.clearTimeout(id)
  }, [lp])

  return flash
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

export function LifeCalculatorScreen({ onClose }: { onClose: () => void }) {
  const state = useLifeState()
  const [selected, setSelected] = useState<Duelist>(() => lastSelected)
  const [operator, setOperator] = useState<Operator>('-')
  const [digits, setDigits] = useState('')
  const [logOpen, setLogOpen] = useState(false)
  const [toolsOpen, setToolsOpen] = useState(false)
  const [confirmReset, setConfirmReset] = useState(false)
  const { showToast } = useToastMessage()
  const now = useClock(state.timer.running)
  const remaining = timerRemaining(state.timer, now)
  const amount = interpretAmount(digits)
  const lp = state.lp[selected]
  const recent = recentAmounts(state.log)
  const name = DUELIST_NAMES[selected]

  useWakeLock()

  const buzz = () => navigator.vibrate?.(12)
  const select = (player: Duelist) => {
    lastSelected = player
    setSelected(player)
  }
  const applyDelta = (delta: number) => {
    if (delta === 0) {
      return
    }

    dispatchLife({ type: 'change', player: selected, delta, now: Date.now() })
    setDigits('')
    setOperator('-')
    buzz()
  }
  const press = (key: Key) => {
    if (key === 'Borrar') {
      setDigits('')
      setOperator('-')
    } else if (key === '+' || key === '-') {
      setOperator(key)
    } else if (key === '÷2') {
      dispatchLife({ type: 'halve', player: selected, now: Date.now() })
      setDigits('')
      buzz()
    } else {
      setDigits((current) => (current + key).slice(0, MAX_DIGITS))
    }
  }
  const toggleClock = () => {
    unlockAudio()
    dispatchLife(remaining === 0 ? { type: 'timer-reset' } : { type: 'timer-toggle', now: Date.now() })
  }

  return (
    <div
      className="@container grid h-full min-h-0 gap-2 overflow-hidden bg-background px-3 pb-[calc(env(safe-area-inset-bottom,0px)+0.5rem)] pt-[calc(env(safe-area-inset-top,0px)+0.5rem)] [grid-template-areas:'head'_'lp'_'disp'_'quick'_'pad'_'eq'] [grid-template-rows:auto_minmax(auto,1.2fr)_auto_auto_minmax(auto,4fr)_auto] @xl:[grid-template-areas:'head_head'_'lp_pad'_'disp_pad'_'quick_pad'_'._eq'] @xl:[grid-template-columns:minmax(0,1fr)_minmax(0,1.1fr)] @xl:[grid-template-rows:auto_auto_auto_minmax(0,1fr)_auto] @xl:gap-x-4"
      onPointerDown={unlockAudio}
    >
      <header className="flex items-center justify-between gap-2 [grid-area:head]">
        <div className="grid gap-0.5">
          <span className={overline}>Calculadora de LP</span>
          <div className="flex items-center gap-1">
            <button
              type="button"
              className={cx(
                'inline-flex touch-manipulation select-none items-center gap-1.5 text-title font-semibold tabular-nums [-webkit-tap-highlight-color:transparent]',
                remaining === 0 ? 'text-danger-soft' : remaining <= ROUND_WARNING_MS ? 'text-warning' : 'text-foreground',
              )}
              aria-label={remaining === 0 ? 'Volver a 50:00' : state.timer.running ? 'Pausar el reloj de la ronda' : 'Poner a correr el reloj de la ronda'}
              title="Cuenta regresiva de la ronda (50 minutos); suena al llegar a cero"
              onClick={toggleClock}
            >
              <Icon name={state.timer.running ? 'pause' : 'play'} size={22} variant="bold" />
              {formatClock(remaining)}
            </button>
            <IconButton
              tone="ghost"
              size="sm"
              aria-label="Volver a 50:00"
              disabled={!state.timer.running && remaining === ROUND_LIMIT_MS}
              className="disabled:opacity-35"
              onClick={() => dispatchLife({ type: 'timer-reset' })}
            >
              <Icon name="timer" size={18} />
            </IconButton>
          </div>
        </div>
        <div className="flex items-center gap-1">
          <IconButton tone="ghost" aria-label="Ver el registro del duelo" onClick={() => setLogOpen(true)}>
            <Icon name="list" size={20} />
          </IconButton>
          <IconButton tone="ghost" aria-label="Moneda, dado y avisos" onClick={() => setToolsOpen(true)}>
            <Icon name="dice" size={20} />
          </IconButton>
          <IconButton tone="ghost" aria-label="Cerrar la calculadora" onClick={onClose}>
            <Icon name="x" size={20} />
          </IconButton>
        </div>
      </header>

      {/* Los dos LP lado a lado; en el medio, reiniciar y deshacer, como en Neuron. Se toca un duelista para elegir a quién va la operación. */}
      <div className="grid grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] items-center gap-1.5 [grid-area:lp]">
        <DuelistPanel player={0} lp={state.lp[0]} selected={selected === 0} onSelect={() => select(0)} />
        <div className="grid justify-items-center gap-1">
          <MiddleAction icon="refresh" label="Reiniciar" onClick={() => setConfirmReset(true)} />
          <MiddleAction
            icon="undo"
            label="Deshacer"
            disabled={state.log.length === 0}
            onClick={() => {
              dispatchLife({ type: 'undo' })
              buzz()
            }}
          />
        </div>
        <DuelistPanel player={1} lp={state.lp[1]} selected={selected === 1} onSelect={() => select(1)} />
      </div>

      {/* La operación en curso: LP del elegido, signo y cantidad; con menos de tres dígitos los ceros de las centenas van apagados. */}
      <div className="flex min-h-12 items-center justify-between gap-2 rounded-control bg-input px-3 [grid-area:disp]">
        <output
          aria-live="polite"
          aria-label={digits ? `${name}: ${lp} ${operator === '-' ? 'menos' : 'más'} ${amount}` : `${name}: ${lp} LP`}
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
        <span className={cx('shrink-0 rounded-tag px-2 py-0.5 text-micro font-semibold', BADGE[selected])}>{name}</span>
      </div>

      {/* Los últimos cambios, para repetirlos con un toque sobre el duelista elegido. */}
      <div className="grid grid-cols-3 gap-1.5 [grid-area:quick] @xl:self-start" aria-label="Repetir un cambio reciente">
        {[0, 1, 2].map((slot) => {
          const delta = recent[slot]

          return delta === undefined ? (
            <span key={slot} className="min-h-10" aria-hidden="true" />
          ) : (
            <button
              key={slot}
              type="button"
              className={cx(PRESSABLE, 'min-h-10 text-lead tabular-nums', delta < 0 ? 'bg-danger/15 text-danger-soft active:bg-danger/30' : 'bg-success/12 text-success-soft active:bg-success/25')}
              aria-label={`${delta < 0 ? 'Restar' : 'Sumar'} ${Math.abs(delta)} a ${name}`}
              onClick={() => applyDelta(delta)}
            >
              {delta < 0 ? '−' : '+'}
              {Math.abs(delta)}
            </button>
          )
        })}
      </div>

      <div className="grid grid-cols-4 grid-rows-4 gap-2 [grid-area:pad]" role="group" aria-label="Teclado">
        {KEYS.map((key) => {
          const isOperator = key === '+' || key === '-'
          const active = isOperator && operator === key

          return (
            <button
              key={key}
              type="button"
              className={cx(
                KEY,
                key === 'Borrar' ? 'text-lead' : 'text-[1.75rem]',
                active && (key === '-' ? 'bg-danger/25 text-danger-soft active:bg-danger/35' : 'bg-success/20 text-success-soft active:bg-success/30'),
              )}
              aria-label={key === '÷2' ? `Dejar a ${name} con la mitad` : key === '-' ? 'Restar' : key === '+' ? 'Sumar' : key === 'Borrar' ? 'Borrar lo tecleado' : undefined}
              aria-pressed={isOperator ? active : undefined}
              onClick={() => press(key)}
            >
              {key === '-' ? '−' : key}
            </button>
          )
        })}
      </div>

      <button
        type="button"
        className={cx(PRESSABLE, 'min-h-[5.25rem] bg-primary text-stat text-primary-foreground shadow-brand active:bg-primary-hover [grid-area:eq] @xl:min-h-14')}
        disabled={amount === 0}
        aria-label={`Aplicar: ${operator === '-' ? 'restar' : 'sumar'} ${amount} a ${name}`}
        onClick={() => applyDelta(operator === '-' ? -amount : amount)}
      >
        =
      </button>

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

      <Modal isOpen={toolsOpen} onClose={() => setToolsOpen(false)} size="sm" title="Moneda, dado y avisos">
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
          dispatchLife({ type: 'reset' })
          setDigits('')
          setOperator('-')
          setConfirmReset(false)
          showToast('Duelo reiniciado', 'success')
        }}
      />
    </div>
  )
}

function DuelistPanel({ player, lp, selected, onSelect }: { player: Duelist; lp: number; selected: boolean; onSelect: () => void }) {
  const shown = useAnimatedNumber(lp)
  const flash = useLpFlash(lp)
  const name = DUELIST_NAMES[player]

  return (
    <button
      type="button"
      aria-pressed={selected}
      aria-label={`${name}: ${lp} LP. ${selected ? 'Elegido para la operación' : 'Elegir para la operación'}`}
      className={cx(PRESSABLE, '@container grid min-w-0 content-center justify-items-center gap-1 rounded-card px-1 py-3 @xl:py-1', selected ? 'bg-card-background/70' : 'bg-transparent')}
      onClick={onSelect}
    >
      <strong
        aria-live="polite"
        // El número llena el ancho del panel: a más dígitos, letra más chica (--digits), sin cortar nunca.
        style={{ '--digits': Math.max(3, String(lp).length) } as CSSProperties}
        className={cx(
          'max-w-full text-[clamp(2rem,calc(152cqw/var(--digits)),4.25rem)] font-bold leading-none tracking-tight tabular-nums transition-colors duration-200',
          flash === 'up' ? 'text-success' : flash === 'down' ? 'text-danger' : lp === 0 ? 'text-danger-soft' : selected ? ACCENT[player] : 'text-soft',
        )}
      >
        {shown}
      </strong>
      <span className={cx('text-lead font-semibold', selected ? 'text-foreground' : 'text-soft')}>
        {player === 1 ? '« ' : null}
        {name}
        {player === 0 ? ' »' : null}
      </span>
    </button>
  )
}

function MiddleAction({ icon, label, disabled, onClick }: { icon: IconName; label: string; disabled?: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      className={cx(PRESSABLE, 'grid justify-items-center gap-0.5 px-1 py-1 text-[0.625rem] font-semibold text-muted active:bg-tint/12')}
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
      <div className="grid min-h-44 place-items-center [perspective:40rem]">
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

      {/* Para escuchar (y sentir) cómo avisa la ronda antes de que haga falta. */}
      <div className="grid gap-2 border-t border-border-subtle pt-3">
        <span className={overline}>Probar los avisos de la ronda</span>
        <div className="grid grid-cols-3 gap-2">
          {CUE_TESTS.map(([kind, label]) => (
            <Button
              key={kind}
              variant="secondary"
              size="sm"
              onClick={() => {
                unlockAudio()
                playCue(kind)
              }}
            >
              {label}
            </Button>
          ))}
        </div>
      </div>
    </div>
  )
}

const CUE_TESTS: ReadonlyArray<readonly [RoundCue, string]> = [
  ['ten', '10 min'],
  ['five', '5 min'],
  ['end', 'Fin'],
]

/** El salto (con su sombra en el piso) va aparte del giro: cada uno es una animación continua y el conjunto se ve fluido. */
function Toss({ shadowWidth, children }: { shadowWidth: string; children: React.ReactNode }) {
  return (
    <div className="relative grid place-items-center pb-6">
      {/* Sobre el fondo oscuro una sombra sola no se ve: va una mesa tenue y, encima, la sombra que se achica en el aire. */}
      <span aria-hidden="true" className="absolute bottom-0 h-6 w-40 rounded-[50%] bg-tint/10" />
      <span aria-hidden="true" className={cx('absolute bottom-1.5 h-3 animate-toss-shadow rounded-[50%] bg-black/75 blur-[3px] motion-reduce:animate-none', shadowWidth)} />
      <div className="animate-toss-hop [transform-style:preserve-3d] motion-reduce:animate-none">{children}</div>
    </div>
  )
}

/** La moneda King of Games: cara adelante, cruz atrás; gira cinco vueltas frenando suave y cae del lado que salió. */
function Coin({ face }: { face: 0 | 1 }) {
  const coin = currentCoin()

  return (
    <Toss shadowWidth="w-20">
      <div
        className="relative size-28 animate-coin-spin [transform-style:preserve-3d] motion-reduce:animate-none"
        style={{ transform: `rotateY(${face * 180}deg)`, '--coin-turns': `${1800 + face * 180}deg` } as CSSProperties}
      >
        <img src={coin.heads} alt="" draggable={false} className="absolute inset-0 size-full rounded-full object-cover [backface-visibility:hidden]" />
        <img src={coin.tails} alt="" draggable={false} className="absolute inset-0 size-full rounded-full object-cover [backface-visibility:hidden] [transform:rotateY(180deg)]" />
      </div>
    </Toss>
  )
}

/** Puntos de cada cara (celdas de una grilla de 3×3) y cómo se ubica cada cara en el cubo. */
const PIPS: Record<number, number[]> = { 2: [2, 6], 3: [2, 4, 6], 4: [0, 2, 6, 8], 5: [0, 2, 4, 6, 8], 6: [0, 2, 3, 5, 6, 8] }
const FACE_PLACEMENT: Record<number, string> = { 1: 'rotateY(0deg)', 2: 'rotateX(90deg)', 3: 'rotateY(90deg)', 4: 'rotateY(-90deg)', 5: 'rotateX(-90deg)', 6: 'rotateY(180deg)' }
/** Giro del cubo (X, Y) que deja esa cara mirando al frente. */
const FACE_UP: Record<number, [number, number]> = { 1: [0, 0], 2: [-90, 0], 3: [0, -90], 4: [0, 90], 5: [90, 0], 6: [0, 180] }
/** Dado dorado como el de la referencia: caras con degradé metálico y puntos tallados; el 1 es el Ojo Milenario. */
const FACE =
  'absolute inset-0 grid grid-cols-3 grid-rows-3 gap-1 rounded-xl p-3 [backface-visibility:hidden] bg-[linear-gradient(145deg,#fbe48f_0%,#dcb345_48%,#b5841c_100%)] shadow-[inset_0_0_0_2px_rgba(255,244,196,0.8),inset_0_-8px_14px_rgba(110,70,0,0.4)]'
const PIP = 'rounded-full bg-[radial-gradient(circle_at_35%_35%,#ffeaa8,#d68a0e_55%,#6e4100)] shadow-[inset_0_1px_2px_rgba(0,0,0,0.5)]'

function Die({ value }: { value: number }) {
  const [x, y] = FACE_UP[value] ?? [0, 0]

  return (
    <Toss shadowWidth="w-16">
      <div
        className="relative size-20 animate-die-spin [transform-style:preserve-3d] motion-reduce:animate-none"
        style={{ transform: `rotateX(${x}deg) rotateY(${y}deg)`, '--die-x': `${x + 720}deg`, '--die-y': `${y + 1080}deg` } as CSSProperties}
      >
        {[1, 2, 3, 4, 5, 6].map((face) => (
          <span key={face} className={FACE} style={{ transform: `${FACE_PLACEMENT[face]} translateZ(2.5rem)` }}>
            {face === 1 ? (
              <MillenniumEye className="col-span-3 row-span-3 h-[72%] w-auto place-self-center" />
            ) : (
              Array.from({ length: 9 }, (_, cell) => <span key={cell} className={cx(PIPS[face]?.includes(cell) && PIP)} />)
            )}
          </span>
        ))}
      </div>
    </Toss>
  )
}

/** El símbolo Milenario: un triángulo invertido con el ojo adentro. */
function MillenniumEye({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 64 46" className={className} aria-hidden="true">
      <path d="M5 7h54L32 43Z" fill="#f3d26b" stroke="#6b4300" strokeWidth="2.5" strokeLinejoin="round" />
      <path d="M14 17q18-15 36 0q-18 15-36 0Z" fill="#fff4c4" stroke="#6b4300" strokeWidth="2" />
      <circle cx="32" cy="17" r="6" fill="#6b4300" />
      <circle cx="33.5" cy="15.5" r="2" fill="#ffeaa8" />
    </svg>
  )
}
