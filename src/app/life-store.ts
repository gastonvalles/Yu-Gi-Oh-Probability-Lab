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
import { showToastMessage } from './use-toast-message'

/**
 * Un solo duelo para toda la app: la calculadora lo edita y la pestaña LP muestra el reloj de la
 * ronda en cualquier pantalla mientras corre. Vive fuera de React (como la mascota) y se guarda
 * en el dispositivo en cada cambio.
 */
let state: LifeState = readLifeState()
const listeners = new Set<() => void>()
let alarm: ReturnType<typeof setTimeout> | null = null
let audio: AudioContext | null = null

export function getLifeState(): LifeState {
  return state
}

export function subscribeLife(listener: () => void): () => void {
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
    armAlarm()
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

/** El audio se desbloquea con un toque (iOS lo exige): así la alarma puede sonar sola cuando se acaba la ronda. */
export function unlockAudio(): void {
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

/** La alarma se programa para el instante justo en que se acaba la ronda, esté abierta la pantalla que esté. */
function armAlarm(): void {
  if (alarm !== null) {
    clearTimeout(alarm)
    alarm = null
  }

  if (typeof window === 'undefined' || !state.timer.running) {
    return
  }

  const left = timerRemaining(state.timer, Date.now())

  if (left <= 0) {
    return
  }

  alarm = setTimeout(() => {
    alarm = null
    dispatchLife({ type: 'timer-toggle', now: Date.now() })
    playAlarm()
    navigator.vibrate?.([300, 150, 300, 150, 600])
    showToastMessage('Se terminó el tiempo de la ronda', 'warning')
  }, left)
}

// Si el reloj quedó corriendo al cerrar la app, la alarma se vuelve a programar al abrirla.
armAlarm()
