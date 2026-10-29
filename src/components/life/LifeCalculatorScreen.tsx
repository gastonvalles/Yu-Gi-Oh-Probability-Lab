import { useEffect, useRef, useState, type CSSProperties, type ReactNode } from 'react'

import { unlockAudio } from '../../app/audio'
import { currentCoin } from '../../app/cosmetics'
import {
  ROUND_LIMIT_MS,
  STARTING_LP,
  duelClockMs,
  duelistName,
  formatClock,
  impliedZeros,
  interpretAmount,
  lifeCounters,
  timerRemaining,
  type Counters,
  type Duelist,
  type LifeState,
} from '../../app/life-calculator'
import { dispatchLife, testCue, useClock, useLifeState, type RoundCue } from '../../app/life-store'
import { useLifeNumber, useLpFlash } from '../../app/life-effects'
import { PHONE_LANDSCAPE_MEDIA_QUERY, useMediaQuery } from '../../app/use-media-query'
import { useToastMessage } from '../../app/use-toast-message'
import { t } from '../../i18n'
import { ConfirmDialog } from '../probability/ConfirmDialog'
import { Button } from '../ui/Button'
import { cx } from '../ui/cx'
import { Icon, type IconName } from '../ui/Icon'
import { IconButton } from '../ui/IconButton'
import { Modal } from '../ui/Modal'
import { Segmented } from '../ui/Segmented'
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
/** Las teclas se reparten el alto que deja la pantalla (46 px en el celular más bajo, 360 × 640; ~85 px en uno de 844): 40 px es el piso para que entre todo sin scroll. */
export const KEY = cx(PRESSABLE, 'min-h-10 rounded-none bg-lavender active:bg-lavender-hover')

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
  const [padOpen, setPadOpen] = useState(false)
  const [confirmReset, setConfirmReset] = useState(false)
  // El celular acostado: un marcador como el de Neuron (el reloj, las dos vidas grandes y abajo Registro, Herramientas y Calcular); el teclado se abre aparte.
  const landscape = useMediaQuery(PHONE_LANDSCAPE_MEDIA_QUERY)
  const { showToast } = useToastMessage()
  const now = useClock(state.timer.running)
  const remaining = duel ? duelClockMs(state.timer, now, duel.limitMin) : timerRemaining(state.timer, now)
  const finished = !duel && remaining === 0
  const amount = interpretAmount(digits)
  const lp = state.lp[selected]
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
    setPadOpen(false)
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
      setPadOpen(false)
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

  // Con teclado (escritorio): los números teclean el monto, Borrar saca un dígito, + y − eligen la operación y Enter la aplica. Escribiendo en un campo (el buscador de la app, abierto encima) las teclas son del campo: si no, Borrar no borraba.
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.ctrlKey || event.metaKey || event.altKey) return

      const { target } = event
      if (target instanceof HTMLElement && (target.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName))) return

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

  const clockControls = (
    <div className="flex items-center gap-1">
      <button
        type="button"
        className={cx(
          // Acostado es el cronómetro del marcador: más grande y con su alto táctil.
          'inline-flex touch-manipulation select-none items-center gap-1.5 font-semibold tabular-nums [-webkit-tap-highlight-color:transparent]',
          landscape ? 'min-h-11 text-stat' : 'text-title',
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
  )
  const closeButton = onClose ? (
    <IconButton tone="ghost" aria-label={t('shell.life.close')} onClick={onClose}>
      <Icon name="x" size={20} />
    </IconButton>
  ) : null

  // Los dos LP lado a lado; en el medio, reiniciar y deshacer, como en Neuron. Se toca un duelista para elegir a quién va la operación.
  const lifePanels = (
    <div className={cx('grid grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] gap-1.5 [grid-area:lp]', landscape ? 'items-stretch gap-3' : 'items-center')}>
      <DuelistPanel position={0} big={landscape} name={nameOf(order[0])} lp={state.lp[order[0]]} selected={selected === order[0]} disabled={!editable(order[0])} onSelect={() => select(order[0])} />
      <div className={cx('grid justify-items-center', landscape ? 'content-center gap-4' : 'gap-1')}>
        {duel ? null : (
          <>
            <MiddleAction icon="refresh" big={landscape} label={t('shell.life.reset')} onClick={() => setConfirmReset(true)} />
            <MiddleAction
              icon="undo"
              big={landscape}
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
      <DuelistPanel position={1} big={landscape} name={nameOf(order[1])} lp={state.lp[order[1]]} selected={selected === order[1]} disabled={!editable(order[1])} onSelect={() => select(order[1])} />
    </div>
  )

  // La operación en curso: LP del elegido, signo y cantidad; los ceros que se sobreentienden (las centenas de «5» o «55») van apagados.
  const display = (
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
              {impliedZeros(digits) ? <span className="text-soft">{impliedZeros(digits)}</span> : null}
            </span>
          </>
        ) : null}
      </output>
      <span className={cx('shrink-0 rounded-tag px-2 py-0.5 text-micro font-semibold', BADGE[order[0] === selected ? 0 : 1])}>{name}</span>
    </div>
  )

  const keypad = (
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
  )

  const equals = (
    <button
      type="button"
      className={cx(PRESSABLE, 'rounded-none bg-primary text-stat text-primary-foreground active:bg-primary-hover [grid-area:eq] @xl:min-h-14')}
      disabled={amount === 0}
      aria-label={t(operator === '-' ? 'shell.life.apply.subtract' : 'shell.life.apply.add', { amount, name })}
      onClick={() => applyDelta(operator === '-' ? -amount : amount)}
    >
      =
    </button>
  )

  return (
    <div
      className={cx(
        landscape
          ? // El marcador: el reloj arriba, las vidas en todo lo que queda y la fila de botones abajo; sin barra de abajo de la app, deja él el margen seguro de abajo y de los costados (la muesca).
            "grid h-full min-h-0 gap-2 overflow-hidden bg-background pb-[calc(env(safe-area-inset-bottom,0px)+0.5rem)] pl-[max(0.75rem,env(safe-area-inset-left,0px))] pr-[max(0.75rem,env(safe-area-inset-right,0px))] [grid-template-areas:'head'_'lp'_'bar'] [grid-template-rows:auto_minmax(0,1fr)_auto]"
          : // Entra entera en el alto que le da el armazón, sin scroll: el teclado y el «=» (una fila más de teclas) se reparten lo que dejan el reloj, las vidas y el número que se escribe.
            "@container grid h-full min-h-0 gap-2 overflow-hidden bg-background px-3 [grid-template-areas:'head'_'lp'_'disp'_'pad'_'eq'] [grid-template-rows:auto_minmax(auto,1.2fr)_auto_minmax(0,4fr)_minmax(3rem,1fr)] @xl:[grid-template-areas:'head_head'_'lp_pad'_'disp_pad'_'._pad'_'._eq'] @xl:[grid-template-columns:minmax(0,1fr)_minmax(0,1.1fr)] @xl:[grid-template-rows:auto_auto_auto_minmax(0,1fr)_auto] @xl:gap-x-4",
        // Como vista de la app, las barras del armazón ya dejan los márgenes seguros; a pantalla completa (la del duelo), los pone ella.
        landscape ? (onClose ? 'pt-[calc(env(safe-area-inset-top,0px)+0.5rem)]' : 'pt-2') : onClose ? 'pb-[calc(env(safe-area-inset-bottom,0px)+0.5rem)] pt-[calc(env(safe-area-inset-top,0px)+0.5rem)]' : 'py-2',
      )}
      onPointerDown={unlockAudio}
    >
      {landscape ? (
        <>
          <header className="relative flex min-h-11 items-center justify-center [grid-area:head]">
            {clockControls}
            {closeButton ? <div className="absolute right-0">{closeButton}</div> : null}
          </header>
          {lifePanels}
          <div className="grid auto-cols-fr grid-flow-col gap-2 [grid-area:bar]">
            <BarAction icon="list" label={t('shell.life.log.heading')} onClick={() => setLogOpen(true)} />
            {duel ? null : <BarAction icon="dice" label={t('shell.life.tools.title')} onClick={() => setToolsOpen(true)} />}
            <BarAction icon="calculator" label={t('shell.life.calc.open')} primary onClick={() => setPadOpen(true)} />
          </div>
        </>
      ) : (
        <>
          <header className="flex items-center justify-between gap-2 [grid-area:head]">
            <div className="grid gap-0.5">
              <span className={overline}>{t('shell.life.title')}</span>
              {clockControls}
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
              {closeButton}
            </div>
          </header>
          {lifePanels}
          {display}
          {keypad}
          {equals}
        </>
      )}

      {/* Acostado, el teclado se abre aparte: el número, el «=» abajo (al alcance del pulgar) y las teclas a la derecha, todo en el alto del celular. Al aplicar se cierra y el marcador muestra el cambio. */}
      <Modal isOpen={landscape && padOpen} onClose={() => setPadOpen(false)} size="md" flush title={t('shell.life.calc.open')}>
        <div className="grid h-full min-h-0 gap-2 p-3 [grid-template-areas:'disp_pad'_'eq_pad'] [grid-template-columns:minmax(0,1fr)_minmax(0,1.4fr)] [grid-template-rows:auto_minmax(0,1fr)]">
          {display}
          {keypad}
          {equals}
        </div>
      </Modal>

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
        <Modal isOpen={toolsOpen} onClose={() => setToolsOpen(false)} size="sm" flush title={t('shell.life.tools.title')}>
          <ToolsPanel counters={lifeCounters(state)} compact={landscape} />
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

/**
 * Un duelista: su número grande (que se mueve y se pinta de verde o rojo al cambiar) y su nombre. `position` es dónde está (0 izquierda, 1 derecha: da el color y la flecha); `disabled`, el del rival en un duelo: se ve, no se elige.
 * `big`: el marcador acostado; el panel ocupa el alto de su fila y el número crece hasta lo que entra también a lo alto.
 */
function DuelistPanel({ position, big = false, name, lp, selected, disabled = false, onSelect }: { position: 0 | 1; big?: boolean; name: string; lp: number; selected: boolean; disabled?: boolean; onSelect: () => void }) {
  const shown = useLifeNumber(lp)
  const flash = useLpFlash(lp)

  return (
    <button
      type="button"
      aria-pressed={disabled ? undefined : selected}
      aria-label={disabled ? `${name}: ${lp} LP` : t(selected ? 'shell.life.duelist.selected' : 'shell.life.duelist.choose', { name, lp })}
      aria-disabled={disabled || undefined}
      data-player={position}
      className={cx(
        PRESSABLE,
        'grid min-w-0 content-center justify-items-center gap-1 rounded-card px-1',
        // Acostado, el panel es contenedor también a lo alto: el número no pasa del alto que le deja el nombre (`--score-max`).
        big ? 'py-1 [--score-max:calc(100cqh-2.75rem)] [container-type:size]' : '@container py-3 @xl:py-1',
        selected ? 'bg-card-background/70' : 'bg-transparent',
        disabled && 'cursor-default active:scale-100',
      )}
      onClick={onSelect}
    >
      <strong
        aria-live="polite"
        // El número llena el ancho del panel: a más dígitos, letra más chica (--digits), sin cortar nunca.
        style={{ '--digits': Math.max(3, String(lp).length) } as CSSProperties}
        className={cx(
          'max-w-full text-score font-bold leading-none tracking-tight tabular-nums transition-colors duration-200',
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

/** ig: en el marcador hay lugar para que mida al menos 44 × 56 px (con «Undo» quedaba de 35 de ancho). */
function MiddleAction({ icon, big = false, label, disabled, onClick }: { icon: IconName; big?: boolean; label: string; disabled?: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      className={cx(PRESSABLE, 'grid justify-items-center gap-0.5 rounded-none px-1 py-1 text-[0.625rem] font-semibold text-muted active:bg-tint/12', big && 'min-h-11 min-w-14')}
      disabled={disabled}
      aria-label={label}
      onClick={onClick}
    >
      <Icon name={icon} size={20} />
      {label}
    </button>
  )
}

/** Un botón de la fila de abajo del marcador: ícono y rótulo, recto como las teclas; `primary`, el violeta (Calcular: el que más se usa). */
function BarAction({ icon, label, primary = false, onClick }: { icon: IconName; label: string; primary?: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      className={cx(PRESSABLE, 'flex min-h-11 min-w-0 items-center justify-center gap-2 rounded-none px-2 text-body', primary ? 'bg-primary text-primary-foreground active:bg-primary-hover' : 'bg-lavender active:bg-lavender-hover')}
      onClick={onClick}
    >
      <Icon name={icon} size={20} />
      <span className="truncate">{label}</span>
    </button>
  )
}

type ToolTab = 'toss' | 'counters' | 'cues'

const TOOL_TABS: readonly ToolTab[] = ['toss', 'counters', 'cues']
const TOOL_TAB_LABEL = { toss: 'shell.life.tools.toss', counters: 'shell.life.tools.counters', cues: 'shell.life.tools.cues' } as const

/**
 * Herramientas, en pestañas como en Neuron: el dado y la moneda, los cuatro contadores y probar los avisos de la ronda. Las tres pestañas van en la misma celda (la más alta da el alto),
 * así al cambiar de una a otra el diálogo no se mueve. `compact`: el celular acostado (el dado, la moneda y los contadores en menos alto, para entrar sin scroll).
 */
function ToolsPanel({ counters, compact }: { counters: Counters; compact: boolean }) {
  const [tab, setTab] = useState<ToolTab>('toss')
  const panels: Record<ToolTab, ReactNode> = {
    toss: <TossPanel hint={!compact} />,
    counters: <CountersPanel counters={counters} columns={compact ? 2 : 1} />,
    cues: <CuesPanel />,
  }

  return (
    <div className={cx('grid', compact ? 'gap-3 p-3 [--coin:4.25rem] [--die:3rem]' : 'gap-4 p-5')}>
      <Segmented value={tab} onChange={setTab} label={t('shell.life.tools.title')} fullWidth options={TOOL_TABS.map((value) => ({ value, label: t(TOOL_TAB_LABEL[value]) }))} />
      <div className="grid [&>*]:[grid-area:1/1]">
        {TOOL_TABS.map((value) => (
          <div key={value} aria-hidden={value === tab ? undefined : true} inert={value !== tab} className={cx('min-w-0', value !== tab && 'invisible')}>
            {panels[value]}
          </div>
        ))}
      </div>
    </div>
  )
}

/** El dado y la moneda lado a lado: cada uno se tira tocándolo (con su animación) y su resultado queda abajo, en su recuadro, cuando termina de girar. Acostado no entra la pista «Tocá para tirar» (hint): la dice el nombre de cada figura. */
function TossPanel({ hint }: { hint: boolean }) {
  const [die, setDie] = useState<{ id: number; value: number } | null>(null)
  const [flip, setFlip] = useState<{ id: number; face: 0 | 1 } | null>(null)
  const count = useRef(0)
  const coin = currentCoin()

  // Las dos caras se bajan al abrir el panel: la primera tirada no espera a las imágenes.
  useEffect(() => {
    for (const url of [coin.heads, coin.tails]) {
      new Image().src = url
    }
  }, [coin])

  const next = () => {
    navigator.vibrate?.(12)
    return (count.current += 1)
  }

  return (
    <div className="grid gap-3">
      {hint ? <p className="m-0 text-center text-body text-muted">{t('shell.life.tools.tapToThrow')}</p> : null}
      <div className="grid grid-cols-2 items-end gap-2">
        <TossSlot
          label={t('shell.life.die.throw')}
          onThrow={() => setDie({ id: next(), value: 1 + Math.floor(Math.random() * 6) })}
          resultKey={die?.id}
          result={
            die ? (
              <>
                <span className="sr-only">{t('shell.life.die.rolled', { value: die.value })}</span>
                <span aria-hidden="true">{die.value}</span>
              </>
            ) : null
          }
        >
          <Die key={die?.id ?? 0} value={die?.value ?? 1} still={!die} />
        </TossSlot>
        <TossSlot
          label={t('shell.life.coin.throw')}
          onThrow={() => setFlip({ id: next(), face: Math.random() < 0.5 ? 0 : 1 })}
          resultKey={flip?.id}
          result={flip ? t(flip.face === 0 ? 'shell.life.coin.heads' : 'shell.life.coin.tails') : null}
        >
          <Coin key={flip?.id ?? 0} face={flip?.face ?? 0} still={!flip} />
        </TossSlot>
      </div>
    </div>
  )
}

/** La figura es el botón (44 px o más); abajo, el resultado, que se anuncia (`output`) y aparece al terminar de girar. Sin tirar, una raya. */
function TossSlot({ label, onThrow, result, resultKey, children }: { label: string; onThrow: () => void; result: ReactNode; resultKey: number | undefined; children: ReactNode }) {
  return (
    <div className="grid min-w-0 justify-items-center gap-2">
      <button type="button" aria-label={label} title={label} className={cx(PRESSABLE, 'grid min-h-11 min-w-11 place-items-center rounded-card p-1 [perspective:40rem] active:bg-tint/8')} onClick={onThrow}>
        {children}
      </button>
      <output aria-live="polite" className="grid min-h-10 w-full max-w-28 place-items-center rounded-control bg-input px-2 text-title font-bold tabular-nums text-foreground">
        {result === null ? (
          <span aria-hidden="true" className="text-soft">
            —
          </span>
        ) : (
          <span key={resultKey} className="animate-reveal motion-reduce:animate-none">
            {result}
          </span>
        )}
      </output>
    </div>
  )
}

/** Los cuatro contadores (fichas, contadores de hechizo, turnos): «−» rojo, el valor y «+» verde, con el texto blanco. No bajan de 0; Reiniciar los vuelve a 0. */
function CountersPanel({ counters, columns }: { counters: Counters; columns: 1 | 2 }) {
  return (
    <ol className={cx('m-0 grid list-none p-0', columns === 2 ? 'grid-cols-2 gap-x-4 gap-y-2' : 'gap-2')}>
      {counters.map((value, index) => {
        const n = index + 1
        const bump = (delta: number) => {
          dispatchLife({ type: 'counter', index, delta })
          navigator.vibrate?.(12)
        }

        return (
          <li key={index} className="grid grid-cols-[minmax(2.75rem,1fr)_minmax(3.5rem,auto)_minmax(2.75rem,1fr)] items-center gap-2">
            <button type="button" className={cx(PRESSABLE, 'grid min-h-11 place-items-center rounded-none bg-danger active:bg-danger/80')} aria-label={t('shell.life.counter.minus', { n })} disabled={value === 0} onClick={() => bump(-1)}>
              <Icon name="minus" size={22} strokeWidth={2.4} />
            </button>
            <output aria-label={t('shell.life.counter.name', { n })} className="text-center text-title font-bold tabular-nums text-foreground">
              {value}
            </output>
            <button type="button" className={cx(PRESSABLE, 'grid min-h-11 place-items-center rounded-none bg-success-solid active:bg-success-solid/80')} aria-label={t('shell.life.counter.plus', { n })} onClick={() => bump(1)}>
              <Icon name="plus" size={22} strokeWidth={2.4} />
            </button>
          </li>
        )
      })}
    </ol>
  )
}

/** Para escuchar (y sentir) cómo avisa la ronda antes de que haga falta. */
function CuesPanel() {
  return (
    <div className="grid gap-3">
      <p className="m-0 text-body text-muted">{t('shell.life.tools.testCues')}</p>
      <div className="grid grid-cols-3 gap-2">
        {CUE_TESTS.map((kind) => (
          <Button
            key={kind}
            variant="secondary"
            size="sm"
            onClick={() => {
              unlockAudio()
              testCue(kind)
            }}
          >
            {kind === 'end' ? t('shell.life.tools.cueEnd') : kind === 'five' ? '5 min' : '10 min'}
          </Button>
        ))}
      </div>
    </div>
  )
}

const CUE_TESTS: readonly RoundCue[] = ['ten', 'five', 'end']
