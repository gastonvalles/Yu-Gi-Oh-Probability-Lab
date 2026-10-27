import { t } from '../i18n'
import { isRecord } from './utils'

/**
 * Calculadora de LP (la pestaña "LP" del celular): el estado de un duelo y cómo cambia.
 * Todo es puro: la pantalla despacha acciones y guarda el resultado en el dispositivo.
 */

export const STARTING_LP = 8000
/** Tope por si alguien suma de más: que el número no rompa el layout. */
export const MAX_LP = 999_999
export const LIFE_STORAGE_KEY = 'ygo-lab:life-calculator'
/** Lo que dura una ronda de torneo: el reloj cuenta para atrás desde acá y suena al llegar a cero. */
export const ROUND_LIMIT_MS = 50 * 60 * 1000

export function duelistName(player: Duelist): string {
  return t(player === 0 ? 'shell.life.duelist.first' : 'shell.life.duelist.second')
}

export type Duelist = 0 | 1

export interface LifeEntry {
  /** Reloj del duelo (ms) cuando pasó. */
  at: number
  player: Duelist
  /** Negativo es daño o pago. */
  delta: number
  from: number
  to: number
}

export interface LifeTimer {
  running: boolean
  /** Instante (Date.now) en que arrancó por última vez; sólo cuenta mientras corre. */
  startedAt: number
  /** Lo acumulado hasta la última pausa. */
  elapsedMs: number
}

export interface LifeState {
  lp: [number, number]
  log: LifeEntry[]
  timer: LifeTimer
}

export type LifeAction =
  | { type: 'change'; player: Duelist; delta: number; now: number }
  | { type: 'halve'; player: Duelist; now: number }
  | { type: 'undo' }
  | { type: 'reset' }
  | { type: 'timer-reset' }
  | { type: 'timer-toggle'; now: number }

export function createLifeState(): LifeState {
  return { lp: [STARTING_LP, STARTING_LP], log: [], timer: { running: false, startedAt: 0, elapsedMs: 0 } }
}

export function timerElapsed(timer: LifeTimer, now: number): number {
  return timer.elapsedMs + (timer.running ? Math.max(0, now - timer.startedAt) : 0)
}

/** Lo que falta de la ronda (nunca menos de 0). */
/** Lo que marca el reloj de un duelo: lo que falta para el límite que se eligió, o lo que va corrido si no hay límite (`limitMin` 0). */
export function duelClockMs(timer: LifeTimer, now: number, limitMin: number): number {
  return limitMin > 0 ? timerRemaining(timer, now, limitMin * 60_000) : timerElapsed(timer, now)
}

export function timerRemaining(timer: LifeTimer, now: number, limitMs: number = ROUND_LIMIT_MS): number {
  return Math.max(0, limitMs - timerElapsed(timer, now))
}

/** mm:ss; pasada la hora, h:mm:ss. */
export function formatClock(ms: number): string {
  const total = Math.floor(ms / 1000)
  const pad = (value: number) => String(value).padStart(2, '0')
  const minutes = pad(Math.floor(total / 60) % 60)
  const seconds = pad(total % 60)
  const hours = Math.floor(total / 3600)

  return hours > 0 ? `${hours}:${minutes}:${seconds}` : `${minutes}:${seconds}`
}

/** Lo que vale lo tecleado: con uno o dos dígitos se entiende en centenas ("8" es 800, "25" es 2500), con tres se completa el cuarto con un 0 ("185" es 1850, "015" es 150) y con cuatro o más, literal ("0150" es 150). */
export function interpretAmount(digits: string): number {
  if (digits === '') {
    return 0
  }

  return Number(digits.length < 3 ? `${digits}00` : digits.length === 3 ? `${digits}0` : digits)
}

/** Los ceros que se sobreentienden detrás de lo tecleado (los que `interpretAmount` completa): "00" con uno o dos dígitos, "0" con tres. */
export function impliedZeros(digits: string): string {
  return digits.length < 3 ? '00' : digits.length === 3 ? '0' : ''
}

function setLp(state: LifeState, player: Duelist, to: number, now: number): LifeState {
  const from = state.lp[player]
  const next = Math.max(0, Math.min(MAX_LP, to))

  if (next === from) {
    return state
  }

  const lp: [number, number] = [state.lp[0], state.lp[1]]
  lp[player] = next

  return { ...state, lp, log: [...state.log, { at: timerElapsed(state.timer, now), player, delta: next - from, from, to: next }] }
}

export function lifeReducer(state: LifeState, action: LifeAction): LifeState {
  switch (action.type) {
    case 'change':
      return setLp(state, action.player, state.lp[action.player] + action.delta, action.now)
    case 'halve':
      return setLp(state, action.player, Math.floor(state.lp[action.player] / 2), action.now)
    case 'undo': {
      const last = state.log.at(-1)

      if (!last) {
        return state
      }

      const lp: [number, number] = [state.lp[0], state.lp[1]]
      lp[last.player] = last.from

      return { ...state, lp, log: state.log.slice(0, -1) }
    }
    case 'reset':
      // Nuevo juego del mismo match: el reloj de la ronda sigue.
      return { ...createLifeState(), timer: state.timer }
    case 'timer-reset':
      return { ...state, timer: createLifeState().timer }
    case 'timer-toggle':
      return {
        ...state,
        timer: state.timer.running
          ? { running: false, startedAt: 0, elapsedMs: timerElapsed(state.timer, action.now) }
          : { ...state.timer, running: true, startedAt: action.now },
      }
  }
}

const isLp = (value: unknown): boolean => typeof value === 'number' && Number.isInteger(value) && value >= 0 && value <= MAX_LP
const isEntry = (value: unknown): boolean =>
  isRecord(value) && (value.player === 0 || value.player === 1) && [value.at, value.delta, value.from, value.to].every((n) => typeof n === 'number')

function isLifeState(value: unknown): value is LifeState {
  if (!isRecord(value) || !isRecord(value.timer) || !Array.isArray(value.lp) || !Array.isArray(value.log)) {
    return false
  }

  const { lp, log, timer } = value

  return (
    lp.length === 2 &&
    lp.every(isLp) &&
    log.every(isEntry) &&
    typeof timer.running === 'boolean' &&
    typeof timer.startedAt === 'number' &&
    typeof timer.elapsedMs === 'number'
  )
}

/** El duelo guardado en el dispositivo; si no hay o está roto, uno nuevo. */
export function readLifeState(): LifeState {
  try {
    const parsed: unknown = JSON.parse(localStorage.getItem(LIFE_STORAGE_KEY) ?? 'null')

    if (isLifeState(parsed)) {
      return parsed
    }
  } catch {
    // Sin storage o con basura: duelo nuevo.
  }

  return createLifeState()
}

export function writeLifeState(state: LifeState): void {
  try {
    localStorage.setItem(LIFE_STORAGE_KEY, JSON.stringify(state))
  } catch {
    // Sin storage: el duelo vive sólo en la pantalla.
  }
}
