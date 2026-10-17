import { useEffect, useRef, useState, type CSSProperties } from 'react'

import { currentCoin } from '../../app/cosmetics'
import {
  ROUND_LIMIT_MS,
  STARTING_LP,
  duelistName,
  formatClock,
  interpretAmount,
  recentAmounts,
  timerRemaining,
  type Duelist,
  type LifeEntry,
} from '../../app/life-calculator'
import { dispatchLife, playCue, unlockAudio, useClock, useLifeState, type RoundCue } from '../../app/life-store'
import { prefersReducedMotion } from '../../app/motion'
import { useToastMessage } from '../../app/use-toast-message'
import { t } from '../../i18n'
import { ConfirmDialog } from '../probability/ConfirmDialog'
import { Button } from '../ui/Button'
import { cx } from '../ui/cx'
import { Heading } from '../ui/Heading'
import { Icon } from '../ui/Icon'
import { IconButton } from '../ui/IconButton'
import { Modal } from '../ui/Modal'
import { overline } from '../ui/typography'
import { LpPad, MAX_DIGITS, PRESSABLE, type PadKey } from './LpPad'
import { Coin, Die } from './Toss'

type Operator = '-' | '+'

/** Últimos cinco minutos de la ronda: el reloj se pone naranja. */
const ROUND_WARNING_MS = 5 * 60 * 1000
/** Un color por duelista: el violeta claro de «Vos» y el ámbar del rival. */
const ACCENT: Record<Duelist, string> = { 0: 'text-primary-soft', 1: 'text-info-soft' }
const BORDER: Record<Duelist, string> = { 0: 'border-primary-soft', 1: 'border-info' }

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
  const name = duelistName(selected)

  useWakeLock()

  // Reiniciar las vidas borra el registro de la ronda: vive en el registro, no al pie de la calculadora.
  const pristine = state.log.length === 0 && state.lp[0] === STARTING_LP && state.lp[1] === STARTING_LP
  const resetButton = (
    <Button
      variant="tertiary"
      color="danger"
      size="sm"
      disabled={pristine}
      onClick={() => {
        setLogOpen(false)
        setConfirmReset(true)
      }}
    >
      {t('shell.life.resetButton')}
    </Button>
  )

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
  const press = (key: PadKey) => {
    if (key === '+' || key === '-') {
      setOperator(key)
    } else if (key === 'back') {
      setDigits((current) => current.slice(0, -1))
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
    // El contenedor y el que usa sus medidas (`@2xl:`) tienen que ser dos elementos: una consulta de contenedor sólo vale para lo que está adentro.
    <div className="@container h-full min-h-0" onPointerDown={unlockAudio}>
      <div
        className="grid h-full min-h-0 gap-3 overflow-hidden bg-background px-gutter pb-[calc(env(safe-area-inset-bottom,0px)+0.75rem)] pt-[calc(env(safe-area-inset-top,0px)+0.5rem)] [grid-template-areas:'head'_'lp'_'disp'_'quick'_'pad'] [grid-template-columns:minmax(0,1fr)] [grid-template-rows:auto_auto_auto_auto_minmax(0,1fr)] @2xl:[grid-template-areas:'head_head'_'lp_log'_'disp_log'_'quick_log'_'pad_log'] @2xl:[grid-template-columns:minmax(0,1fr)_15rem] @2xl:[grid-template-rows:auto_auto_auto_auto_minmax(0,1fr)] @2xl:gap-x-5 @2xl:px-5"
      >
        <header className="flex items-center gap-1.5 [grid-area:head]">
          <Heading level="card" as="h2" className="min-w-0 flex-1 truncate">
            {t('shell.life.title')}
          </Heading>
          <button
            type="button"
            className={cx(
              PRESSABLE,
              'inline-flex min-h-11 items-center gap-1.5 rounded-full border border-border bg-input px-3 text-body tabular-nums',
              remaining === 0 ? 'text-danger-soft' : remaining <= ROUND_WARNING_MS ? 'text-warning' : 'text-foreground',
            )}
            aria-label={remaining === 0 ? t('shell.life.clock.reset') : state.timer.running ? t('shell.life.clock.pause') : t('shell.life.clock.start')}
            title={t('shell.life.clock.hint')}
            onClick={toggleClock}
          >
            <Icon name={state.timer.running ? 'pause' : 'play'} size={16} variant="bold" />
            {formatClock(remaining)}
          </button>
          <IconButton tone="ghost" size="sm" aria-label={t('shell.life.tools.title')} title={t('shell.life.tools.title')} onClick={() => setToolsOpen(true)}>
            <Icon name="dice" size={20} />
          </IconButton>
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
          <IconButton tone="ghost" aria-label={t('shell.life.log.open')} className="@2xl:hidden" onClick={() => setLogOpen(true)}>
            <Icon name="list" size={20} />
          </IconButton>
          <IconButton tone="ghost" aria-label={t('shell.life.close')} onClick={onClose}>
            <Icon name="x" size={20} />
          </IconButton>
        </header>

        {/* Los dos LP lado a lado: se toca un duelista para elegir a quién va la operación. */}
        <div className="grid grid-cols-2 gap-2 [grid-area:lp]">
          <DuelistPanel player={0} lp={state.lp[0]} selected={selected === 0} onSelect={() => select(0)} />
          <DuelistPanel player={1} lp={state.lp[1]} selected={selected === 1} onSelect={() => select(1)} />
        </div>

        {/* La operación en curso: «Tecleá la cantidad» o «LP −» y, a la derecha, el monto; con menos de tres dígitos los ceros de las centenas van apagados. */}
        <div className="flex min-h-[4.5rem] items-center rounded-control border border-border bg-input px-4 [grid-area:disp]">
          <output
            aria-live="polite"
            aria-label={digits ? t(operator === '-' ? 'shell.life.operation.minus' : 'shell.life.operation.plus', { name, lp, amount }) : `${name}: ${lp} LP`}
            className="flex w-full min-w-0 items-center justify-between gap-3"
          >
            <span className="min-w-0 truncate text-micro text-muted tabular-nums">
              {digits ? (
                <>
                  {lp} <span className={operator === '-' ? 'text-danger-soft' : 'text-success-soft'}>{operator === '-' ? '−' : '+'}</span>
                </>
              ) : (
                t('shell.life.display.hint')
              )}
            </span>
            <strong className={cx('shrink-0 text-stat font-bold leading-none tabular-nums', digits ? 'text-foreground' : 'text-soft')}>
              {digits || '0'}
              {digits && digits.length < 3 ? <span className="text-soft">00</span> : null}
            </strong>
          </output>
        </div>

        {/* Los últimos cambios, para repetirlos con un toque sobre el duelista elegido. */}
        <div className="flex min-h-11 flex-wrap items-center gap-1.5 [grid-area:quick]" role="group" aria-label={t('shell.life.recent.label')}>
          {recent.length > 0 ? <span className={overline}>{t('shell.life.recent.title')}</span> : null}
          {recent.map((delta) => (
            <button
              key={delta}
              type="button"
              className={cx(PRESSABLE, 'min-h-11 rounded-full border border-border bg-input px-3 text-micro tabular-nums active:bg-surface-hover')}
              aria-label={t(delta < 0 ? 'shell.life.recent.subtract' : 'shell.life.recent.add', { amount: Math.abs(delta), name })}
              onClick={() => applyDelta(delta)}
            >
              {delta < 0 ? '−' : '+'}
              {Math.abs(delta)}
            </button>
          ))}
          <Button
            variant="secondary"
            size="sm"
            icon="undo"
            className="ml-auto"
            disabled={state.log.length === 0}
            onClick={() => {
              dispatchLife({ type: 'undo' })
              buzz()
            }}
          >
            {t('shell.life.undo')}
          </Button>
        </div>

        <div className="min-h-0 [grid-area:pad]">
          <LpPad
            operator={operator}
            name={name}
            amount={amount}
            applyLabel={t(operator === '-' ? 'shell.life.apply.subtract' : 'shell.life.apply.add', { amount, name })}
            onKey={press}
            onApply={() => applyDelta(operator === '-' ? -amount : amount)}
          />
        </div>

        {/* Desde un ancho de diálogo, el registro va a la derecha, siempre a la vista; en el celular se abre desde el ícono de arriba. */}
        <aside aria-label={t('shell.life.log.title')} className="hidden min-h-0 flex-col [grid-area:log] @2xl:flex">
          <span className={cx(overline, 'mb-1.5')}>{t('shell.life.log.heading')}</span>
          <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain">
            <LogList log={state.log} variant="aside" />
          </div>
          {resetButton}
        </aside>

        <Modal
          isOpen={logOpen}
          onClose={() => setLogOpen(false)}
          size="sheet"
          title={t('shell.life.log.title')}
          subtitle={t('shell.life.log.subtitle', { clock: formatClock(remaining), count: state.log.length })}
          footer={resetButton}
        >
          <LogList log={state.log} variant="sheet" />
        </Modal>

        <Modal isOpen={toolsOpen} onClose={() => setToolsOpen(false)} size="sm" title={t('shell.life.tools.title')}>
          <ToolsPanel />
        </Modal>

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
    </div>
  )
}

/** El registro de la ronda, del cambio más nuevo al más viejo: en la hoja con la hora y lo que quedó; al costado (`aside`), una línea por cambio, como en el lienzo. */
function LogList({ log, variant }: { log: LifeEntry[]; variant: 'sheet' | 'aside' }) {
  if (log.length === 0) {
    return <p className="m-0 py-6 text-center text-body text-muted">{t('shell.life.log.empty')}</p>
  }

  const entries = [...log].reverse()

  return variant === 'aside' ? (
    <ol className="m-0 list-none p-0">
      {entries.map((entry, index) => (
        <li key={index} className="flex items-baseline justify-between gap-2 border-t border-border-subtle py-2 text-body tabular-nums">
          <span className="min-w-0 truncate">
            {duelistName(entry.player)}{' '}
            <span className={entry.delta < 0 ? 'text-danger-soft' : 'text-success-soft'}>
              {entry.delta < 0 ? '−' : '+'}
              {Math.abs(entry.delta)}
            </span>
          </span>
          <strong className="shrink-0 font-semibold text-foreground">{entry.to}</strong>
        </li>
      ))}
    </ol>
  ) : (
    <ol className="m-0 grid list-none gap-1 p-0">
      {entries.map((entry, index) => (
        <li key={index} className="grid grid-cols-[3.5rem_minmax(0,1fr)_auto] items-center gap-2 rounded-control bg-tint/5 px-3 py-2 text-body tabular-nums">
          <span className="text-muted">{formatClock(Math.max(0, ROUND_LIMIT_MS - entry.at))}</span>
          <span className="truncate font-semibold text-foreground">{duelistName(entry.player)}</span>
          <span>
            <span className={entry.delta < 0 ? 'text-danger-soft' : 'text-success-soft'}>
              {entry.delta < 0 ? '−' : '+'}
              {Math.abs(entry.delta)}
            </span>
            <span className="text-muted"> → {entry.to}</span>
          </span>
        </li>
      ))}
    </ol>
  )
}

function DuelistPanel({ player, lp, selected, onSelect }: { player: Duelist; lp: number; selected: boolean; onSelect: () => void }) {
  const shown = useAnimatedNumber(lp)
  const flash = useLpFlash(lp)
  const name = duelistName(player)

  return (
    <button
      type="button"
      aria-pressed={selected}
      aria-label={t(selected ? 'shell.life.duelist.selected' : 'shell.life.duelist.choose', { name, lp })}
      className={cx(
        PRESSABLE,
        '@container grid min-h-24 min-w-0 content-center justify-items-center gap-0.5 rounded-card border-2 bg-card-background px-1 py-3 @2xl:min-h-28',
        selected ? BORDER[player] : 'border-border',
      )}
      onClick={onSelect}
    >
      <span className={cx(overline, ACCENT[player])}>{name}</span>
      <strong
        aria-live="polite"
        // El número llena el ancho de la tarjeta: a más dígitos, letra más chica (--digits), sin cortar nunca.
        style={{ '--digits': Math.max(3, String(lp).length) } as CSSProperties}
        className={cx(
          'max-w-full text-[clamp(1.75rem,calc(152cqw/var(--digits)),2.75rem)] font-bold leading-none tracking-tight tabular-nums transition-colors duration-200',
          flash === 'up' ? 'text-success' : flash === 'down' ? 'text-danger' : lp === 0 ? 'text-danger-soft' : 'text-foreground',
        )}
      >
        {shown}
      </strong>
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
