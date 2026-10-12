import { useEffect, useState, useSyncExternalStore } from 'react'

import {
  formatClock,
  lifeReducer,
  readLifeState,
  timerRemaining,
  writeLifeState,
  type LifeAction,
  type LifeState,
} from './life-calculator'
import { showToastMessage, type ToastTone } from './use-toast-message'

/**
 * Un solo duelo para toda la app: la calculadora lo edita y el botón flotante muestra el reloj de
 * la ronda en cualquier pantalla mientras corre. Vive fuera de React (como la mascota) y se guarda
 * en el dispositivo en cada cambio.
 */
let state: LifeState = readLifeState()
const listeners = new Set<() => void>()
let alarms: ReturnType<typeof setTimeout>[] = []
/** Al llegar a cero, la alarma se repite cada tanto hasta que se reinicia el reloj. */
let endAlarm: ReturnType<typeof setInterval> | null = null
const END_ALARM_EVERY_MS = 3000
let audio: AudioContext | null = null

export type RoundCue = 'ten' | 'five' | 'end'

interface CueSpec {
  /** Tonos: frecuencia (Hz) y duración (s), uno tras otro. */
  tones: ReadonlyArray<readonly [number, number]>
  gap: number
  gain: number
  vibrate: number[]
  message: string
  tone: ToastTone
}

/** Los tres avisos de la ronda: dos toques a los 10 minutos, tres en subida a los 5, y la alarma al llegar a cero. */
const ROUND_CUES: Record<RoundCue, CueSpec> = {
  ten: { tones: [[660, 0.18], [660, 0.18]], gap: 0.12, gain: 0.5, vibrate: [150, 100, 150], message: 'Quedan 10 minutos de ronda', tone: 'info' },
  five: { tones: [[660, 0.16], [784, 0.16], [988, 0.22]], gap: 0.1, gain: 0.6, vibrate: [150, 100, 150, 100, 150], message: 'Quedan 5 minutos de ronda', tone: 'warning' },
  end: { tones: [[880, 0.35], [1175, 0.35], [880, 0.35], [1175, 0.35]], gap: 0.1, gain: 0.7, vibrate: [300, 150, 300, 150, 600], message: 'Se terminó el tiempo de la ronda', tone: 'warning' },
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

  if (timerChanged) {
    stopEndAlarm()
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

/** El reloj de la ronda como texto ("49:12") mientras corre; null si está parado. */
export function useRoundCountdownLabel(): string | null {
  const { timer } = useLifeState()
  const now = useClock(timer.running)

  return timer.running ? formatClock(timerRemaining(timer, now)) : null
}

/** El audio se desbloquea con un toque (iOS lo exige): así los avisos pueden sonar solos durante la ronda. */
export function unlockAudio(): void {
  if (typeof AudioContext === 'undefined') {
    return
  }

  audio ??= new AudioContext()
  void audio.resume()
}

/** Sonido, vibración y aviso de uno de los tres momentos de la ronda (también sirve para probarlos). */
export function playCue(kind: RoundCue): void {
  soundCue(kind)
  showToastMessage(ROUND_CUES[kind].message, ROUND_CUES[kind].tone)
}

/** Sólo el sonido y la vibración (la alarma final los repite sin volver a avisar). */
function soundCue(kind: RoundCue): void {
  const cue = ROUND_CUES[kind]

  if (audio) {
    let at = audio.currentTime + 0.02

    for (const [frequency, duration] of cue.tones) {
      const oscillator = audio.createOscillator()
      const gain = audio.createGain()

      oscillator.type = 'square'
      oscillator.frequency.value = frequency
      gain.gain.setValueAtTime(0.0001, at)
      gain.gain.exponentialRampToValueAtTime(cue.gain, at + 0.02)
      gain.gain.exponentialRampToValueAtTime(0.0001, at + duration)
      oscillator.connect(gain).connect(audio.destination)
      oscillator.start(at)
      oscillator.stop(at + duration + 0.05)
      at += duration + cue.gap
    }
  }

  navigator.vibrate?.(cue.vibrate)
}

function stopEndAlarm(): void {
  if (endAlarm !== null) {
    clearInterval(endAlarm)
    endAlarm = null
  }
}

/** La alarma del final suena una y otra vez hasta que el reloj se reinicia (cualquier cambio del reloj la corta). */
function startEndAlarm(): void {
  stopEndAlarm()
  playCue('end')
  endAlarm = setInterval(() => soundCue('end'), END_ALARM_EVERY_MS)
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

  const left = timerRemaining(state.timer, Date.now())

  if (left <= 0) {
    return
  }

  for (const [kind, before] of CUE_BEFORE_END_MS) {
    if (left > before) {
      alarms.push(setTimeout(() => playCue(kind), left - before))
    }
  }

  alarms.push(
    setTimeout(() => {
      // Primero se para el reloj (eso corta cualquier alarma vieja) y recién después arranca la que se repite.
      dispatchLife({ type: 'timer-toggle', now: Date.now() })
      startEndAlarm()
    }, left),
  )
}

// Si el reloj quedó corriendo al cerrar la app, los avisos se vuelven a programar al abrirla.
armAlarms()
