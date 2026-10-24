import { useEffect, useState, useSyncExternalStore } from 'react'

import { audioContext } from './audio'
import {
  formatClock,
  lifeReducer,
  readLifeState,
  timerRemaining,
  writeLifeState,
  type LifeAction,
  type LifeState,
} from './life-calculator'
import { t } from '../i18n'
import { showToastMessage, type ToastTone } from './use-toast-message'

/**
 * Un solo duelo para toda la app: la calculadora lo edita y el botón flotante muestra el reloj de
 * la ronda en cualquier pantalla mientras corre. Vive fuera de React (como la mascota) y se guarda
 * en el dispositivo en cada cambio.
 */
let state: LifeState = readLifeState()
const listeners = new Set<() => void>()
let alarms: ReturnType<typeof setTimeout>[] = []
/** Con qué callar el aviso de la ronda que está sonando y, aparte, el que se está probando (probar un sonido no calla la alarma de verdad). */
let ringing: (() => void) | null = null
let testing: (() => void) | null = null

export type RoundCue = 'ten' | 'five' | 'end'

interface CueSpec {
  /** Tonos: frecuencia (Hz) y duración (s), uno tras otro. */
  tones: ReadonlyArray<readonly [number, number]>
  gap: number
  gain: number
  vibrate: number[]
  /** Cuántas vueltas da, una detrás de la otra (Infinity: hasta que se reinicie el reloj). */
  rounds: number
  message: 'shell.life.cue.ten' | 'shell.life.cue.five' | 'shell.life.cue.timeUp'
  tone: ToastTone
}

/** Los tres avisos de la ronda: dos toques a los 10 minutos (dos veces), tres en subida a los 5 (tres veces) y, al llegar a cero, la alarma sin parar hasta que se reinicie el reloj. */
const ROUND_CUES: Record<RoundCue, CueSpec> = {
  ten: { tones: [[660, 0.18], [660, 0.18]], gap: 0.12, gain: 0.5, vibrate: [150, 100, 150], rounds: 2, message: 'shell.life.cue.ten', tone: 'info' },
  five: { tones: [[660, 0.16], [784, 0.16], [988, 0.22]], gap: 0.1, gain: 0.6, vibrate: [150, 100, 150, 100, 150], rounds: 3, message: 'shell.life.cue.five', tone: 'warning' },
  end: { tones: [[880, 0.35], [1175, 0.35], [880, 0.35], [1175, 0.35]], gap: 0.1, gain: 0.7, vibrate: [300, 150, 300, 150, 600], rounds: Infinity, message: 'shell.life.cue.timeUp', tone: 'warning' },
}
/** La pausa entre una vuelta y la siguiente: seguidas, no encimadas. */
export const CUE_PAUSE_MS = 400
/** Vibra sólo en las tres primeras vueltas: un teléfono que vibra sin parar es insoportable (la alarma del final sigue sonando). */
const VIBRATE_ROUNDS = 3
/** Al probarlos, el del final da tres vueltas y se calla: el reloj no corre y no hay nada que reiniciar. */
const TEST_ROUNDS = 3

/** Una vuelta de un aviso: cuánto dura (ms) y cómo cortarla en seco (lo que suena y la vibración). */
export interface CueSound {
  ms: number
  cut: () => void
}

/**
 * Hace sonar `rounds` vueltas seguidas (Infinity: sin parar): cada una empieza cuando termina la anterior, tras una pausa corta. Lo que suena lo pone `play` (en las pruebas,
 * uno falso) y el tiempo, `setTimeout`. Devuelve con qué callarlo: corta la vuelta que suena y las que faltan; después de la última, no hace nada.
 */
export function repeatCue(play: (round: number) => CueSound, rounds: number): () => void {
  let round = 0
  let sound: CueSound | null = null
  let timer: ReturnType<typeof setTimeout> | undefined

  const next = () => {
    const current = play(round)

    sound = current
    round += 1
    timer = round < rounds ? setTimeout(next, current.ms + CUE_PAUSE_MS) : setTimeout(() => (sound = null), current.ms)
  }

  next()

  return () => {
    clearTimeout(timer)
    sound?.cut()
    sound = null
  }
}
/** A cuánto del final suena cada aviso previo. */
const CUE_BEFORE_END_MS: ReadonlyArray<readonly [RoundCue, number]> = [
  ['ten', 10 * 60 * 1000],
  ['five', 5 * 60 * 1000],
]

function getLifeState(): LifeState {
  return state
}

function subscribeLife(listener: () => void): () => void {
  listeners.add(listener)

  return () => {
    listeners.delete(listener)
  }
}

export function dispatchLife(action: LifeAction): void {
  const next = lifeReducer(state, action)

  if (next === state) {
    return
  }

  const timerChanged = next.timer !== state.timer

  state = next
  writeLifeState(next)

  // Tocar el reloj (pausarlo, reanudarlo o reiniciarlo) calla lo que esté sonando y vuelve a programar los avisos: con el reloj en cero, sólo se puede reiniciar, así que la alarma del final suena hasta eso.
  if (timerChanged) {
    ringing?.()
    ringing = null
    armAlarms()
  }

  for (const listener of listeners) {
    listener()
  }
}

export function useLifeState(): LifeState {
  return useSyncExternalStore(subscribeLife, getLifeState, getLifeState)
}

/** Avanza cada segundo mientras `active` (y se corrige al volver a la app). */
export function useClock(active: boolean): number {
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

/** El reloj de la ronda como texto ("49:12") mientras corre y "00:00" cuando se acabó (la alarma suena hasta que se reinicie: el botón sigue ahí para llegar a hacerlo); null si está parado con tiempo. */
export function useRoundCountdownLabel(): string | null {
  const { timer } = useLifeState()
  const now = useClock(timer.running)
  const left = timerRemaining(timer, now)

  return timer.running || left === 0 ? formatClock(left) : null
}

/** Uno de los tres momentos de la ronda: el aviso escrito y el sonido con sus vueltas (el del final, hasta que se reinicie el reloj). Un aviso nuevo calla al anterior. */
export function playCue(kind: RoundCue): void {
  ringing?.()
  ringing = ringCue(kind, ROUND_CUES[kind].rounds)
}

/** Para escuchar (y sentir) un aviso antes de que haga falta, con sus vueltas (el del final, tres) y aparte del de verdad: no lo calla. */
export function testCue(kind: RoundCue): void {
  testing?.()
  testing = ringCue(kind, Math.min(ROUND_CUES[kind].rounds, TEST_ROUNDS))
}

function ringCue(kind: RoundCue, rounds: number): () => void {
  showToastMessage(t(ROUND_CUES[kind].message), ROUND_CUES[kind].tone)

  return repeatCue((round) => soundCue(kind, round), rounds)
}

/** Una vuelta de un aviso: los tonos (si el audio ya se desbloqueó con un toque) y, en las primeras vueltas, la vibración. Todo pasa por un volumen propio para poder cortarlo en seco. */
function soundCue(kind: RoundCue, round: number): CueSound {
  const cue = ROUND_CUES[kind]
  const audio = audioContext()
  let bus: GainNode | null = null

  if (audio) {
    // Si el navegador lo suspendió en el medio (la pantalla se apagó), se retoma: el toque que arrancó el reloj ya lo desbloqueó.
    if (audio.state === 'suspended') void audio.resume()
    bus = audio.createGain()
    bus.connect(audio.destination)
    let at = audio.currentTime + 0.02

    for (const [frequency, duration] of cue.tones) {
      const oscillator = audio.createOscillator()
      const gain = audio.createGain()

      oscillator.type = 'square'
      oscillator.frequency.value = frequency
      gain.gain.setValueAtTime(0.0001, at)
      gain.gain.exponentialRampToValueAtTime(cue.gain, at + 0.02)
      gain.gain.exponentialRampToValueAtTime(0.0001, at + duration)
      oscillator.connect(gain).connect(bus)
      oscillator.start(at)
      oscillator.stop(at + duration + 0.05)
      at += duration + cue.gap
    }
  }

  if (round < VIBRATE_ROUNDS) navigator.vibrate?.(cue.vibrate)

  return {
    ms: Math.round((cue.tones.reduce((total, [, duration]) => total + duration, 0) + cue.gap * (cue.tones.length - 1)) * 1000),
    cut: () => {
      bus?.disconnect()
      navigator.vibrate?.(0)
    },
  }
}

/** Los avisos se programan para el instante justo (10 y 5 minutos antes, y el final), esté abierta la pantalla que esté. */
function armAlarms(): void {
  for (const id of alarms) {
    clearTimeout(id)
  }

  alarms = []

  if (typeof window === 'undefined' || !state.timer.running) {
    return
  }

  const now = Date.now()
  const left = timerRemaining(state.timer, now)

  if (left <= 0) {
    return
  }

  const end = now + left

  for (const [kind, before] of CUE_BEFORE_END_MS) {
    if (left > before) {
      alarms.push(setTimeout(() => playCue(kind), left - before))
    }
  }

  alarms.push(
    setTimeout(() => {
      // Primero se para el reloj (eso calla cualquier aviso viejo) y recién después arranca la alarma, que suena hasta que se reinicie el reloj. Se para en el instante exacto del final: un temporizador que salta un milisegundo antes lo dejaría con tiempo.
      dispatchLife({ type: 'timer-toggle', now: Math.max(Date.now(), end) })
      playCue('end')
    }, left),
  )
}

// Si el reloj quedó corriendo al cerrar la app, los avisos se vuelven a programar al abrirla.
armAlarms()
