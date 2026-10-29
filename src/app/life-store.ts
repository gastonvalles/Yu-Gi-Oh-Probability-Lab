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
/** La pausa entre una vuelta y la siguiente de los avisos de 10 y 5 minutos: son frases («dos veces», «tres veces») y respiran. La alarma del final no la lleva: es un loop. */
export const CUE_PAUSE_MS = 400
/** Vibra sólo en las tres primeras vueltas: un teléfono que vibra sin parar es insoportable (la alarma del final sigue sonando). */
const VIBRATE_ROUNDS = 3
/** Al probarlos, el del final da tres vueltas y se calla: el reloj no corre y no hay nada que reiniciar. */
const TEST_ROUNDS = 3
/**
 * Cuánto audio queda programado por delante. Las vueltas las toca el reloj del audio, no `setTimeout`: el temporizador sólo rellena la cola, y con la pestaña
 * oculta Chrome lo frena a una vez por segundo y, a los 5 minutos, a una por minuto. 90 s cubren ese minuto con margen y son unas 50 vueltas del final (200
 * osciladores en espera: poco).
 */
export const CUE_AHEAD_S = 90
/** Cada cuánto se rellena la cola (si el navegador lo deja). */
const REFILL_MS = 1000
/** La primera nota arranca apenas después de ahora: programada en el pasado, el navegador la cortaría al empezar. */
const CUE_LEAD_S = 0.02

/** Cada cuánto empieza una vuelta (s): sus tonos y los silencios entre ellos y, después, en el loop del final el mismo silencio que hay entre las notas (sin hueco) y en los avisos previos su pausa. */
export function cuePeriod(kind: RoundCue): number {
  const cue = ROUND_CUES[kind]
  const length = cue.tones.reduce((total, [, duration]) => total + duration, 0) + cue.gap * (cue.tones.length - 1)

  return length + (cue.rounds === Infinity ? cue.gap : CUE_PAUSE_MS / 1000)
}

/** Por dónde va un aviso: el instante (en el reloj del audio) en que empieza la vuelta 0 y la próxima vuelta que falta programar. */
export interface CuePlan {
  anchor: number
  next: number
}

/**
 * Qué vueltas programar ahora: las que empiezan antes de `now + ahead`, sin pasar de `rounds`. Cada inicio es `anchor + n · period` (multiplicado, no sumado:
 * en mil vueltas no se corre ni una muestra). Si la próxima quedó en el pasado (el relleno se frenó más que lo programado por delante), se reancla en ahora:
 * no suenan vueltas viejas ni encimadas.
 */
export function planRounds(plan: CuePlan, period: number, rounds: number, now: number, ahead = CUE_AHEAD_S): { starts: number[]; plan: CuePlan } {
  const { next } = plan
  const anchor = plan.anchor + next * period < now + CUE_LEAD_S ? now + CUE_LEAD_S - next * period : plan.anchor
  const starts: number[] = []

  for (let round = next; round < rounds && anchor + round * period < now + ahead; round += 1) {
    starts.push(anchor + round * period)
  }

  return { starts, plan: { anchor, next: next + starts.length } }
}

/** Lo que el programador usa del audio: el de la página o, para medirlo sin oírlo, un `OfflineAudioContext`. */
export type CueAudio = Pick<BaseAudioContext, 'currentTime' | 'state' | 'destination' | 'createGain' | 'createOscillator'> & { resume: () => Promise<void> }

/** Una vuelta: los tonos uno tras otro desde `at`, con el sobre de siempre (sube y baja a casi cero: empalmar vueltas no hace clic). */
function scheduleRound(audio: CueAudio, cue: CueSpec, at: number, bus: GainNode, live: Set<OscillatorNode>): void {
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
    live.add(oscillator)
    oscillator.onended = () => live.delete(oscillator)
    at += duration + cue.gap
  }
}

/**
 * Hace sonar `rounds` vueltas de un aviso (Infinity: sin parar) con el reloj del audio y un solo volumen para todo y, en las primeras vueltas, vibra. El audio
 * se pide en cada relleno: sin un toque no suena nada, y si el toque llega con la alarma del final sonando, desde ahí suena. Devuelve con qué callarlo en seco:
 * lo que suena, lo programado y la vibración.
 */
export function ringRounds(kind: RoundCue, rounds: number, getAudio: () => CueAudio | null = audioContext): () => void {
  const cue = ROUND_CUES[kind]
  const period = cuePeriod(kind)
  // La vibración no tiene reloj de audio: va con temporizadores (no hace falta que sea exacta).
  const vibrations = Array.from({ length: Math.min(rounds, VIBRATE_ROUNDS) }, (_, round) =>
    setTimeout(() => navigator.vibrate?.(cue.vibrate), round * period * 1000),
  )
  const live = new Set<OscillatorNode>()
  let bus: GainNode | null = null
  let plan: CuePlan | null = null
  let refill: ReturnType<typeof setInterval> | undefined

  const fill = () => {
    const audio = getAudio()

    if (audio) {
      // Si el navegador lo suspendió (la pantalla se apagó), se retoma: su reloj quedó quieto, así que lo programado sigue donde estaba.
      if (audio.state === 'suspended') void audio.resume()

      if (!bus) {
        bus = audio.createGain()
        bus.connect(audio.destination)
      }

      const step = planRounds(plan ?? { anchor: audio.currentTime + CUE_LEAD_S, next: 0 }, period, rounds, audio.currentTime)

      plan = step.plan
      for (const at of step.starts) scheduleRound(audio, cue, at, bus, live)
    }

    // Programado todo, ya no hay qué rellenar. Un aviso previo sin audio no espera a un toque (sonaría tarde); la alarma del final sí.
    return (plan?.next ?? 0) < rounds && (audio !== null || rounds === Infinity)
  }

  if (fill()) {
    refill = setInterval(() => fill() || clearInterval(refill), REFILL_MS)
  }

  return () => {
    clearInterval(refill)
    for (const id of vibrations) clearTimeout(id)
    bus?.disconnect()
    for (const oscillator of live) oscillator.stop()
    live.clear()
    navigator.vibrate?.(0)
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

  return ringRounds(kind, rounds)
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
