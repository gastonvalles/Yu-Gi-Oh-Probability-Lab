import { useSyncExternalStore } from 'react'

import { t } from '../i18n'
import { showToastMessage } from './use-toast-message'

/**
 * La mascota (Cupsy, el Kuriboh alado...): un estado por animación del paquete. Las pantallas no la manejan directamente:
 * avisan qué pasa (se está cargando algo, se calcula, salió bien, salió mal) y ella reacciona.
 */
export type MascotState = 'idle' | 'look' | 'waiting' | 'running' | 'review' | 'jumping' | 'failed' | 'waving'
/** Reacciones puntuales: duran unos segundos y ganan a lo demás. */
export type MascotReaction = Extract<MascotState, 'jumping' | 'failed' | 'waving'>
/** Lo que puede estar pasando de fondo. */
export type MascotActivity = 'loading' | 'computing'

/** Cada estado es un WebP animado con transparencia dentro de la carpeta de la mascota; se baja sólo el actual. */
export const MASCOT_ANIMATION: Record<MascotState, string> = {
  idle: 'idle.webp',
  look: 'look.webp',
  waiting: 'waiting.webp',
  running: 'running.webp',
  review: 'review.webp',
  jumping: 'jumping.webp',
  failed: 'failed.webp',
  waving: 'waving.webp',
}
/** Un cuadro quieto: para "reducir movimiento" y para la lista de mascotas. */
export const MASCOT_STILL = 'idle.png'

/**
 * Las mascotas disponibles: cada una con su carpeta en public/mascot, con una animación por estado (de 192×208, ver `ANIMATION` en Mascot.tsx)
 * y un cuadro quieto (idle.png). Para sumar otra alcanza con la carpeta y una línea acá.
 */
export const MASCOTS = {
  cupsy: { name: 'Cupsy', folder: '/mascot/cupsy' },
  'winged-kuriboh': { name: 'Winged Kuriboh', folder: '/mascot/winged-kuriboh' },
} as const
export type MascotId = keyof typeof MASCOTS

const MASCOT_KEY = 'ygo-lab:mascot-id'
const ENABLED_KEY = 'ygo-lab:mascot'

function readChosenId(): MascotId {
  try {
    const stored = localStorage.getItem(MASCOT_KEY)

    if (stored && stored in MASCOTS) {
      return stored as MascotId
    }
  } catch {
    // Sin storage: la primera.
  }

  return 'cupsy'
}

let chosenId: MascotId = readChosenId()

/** El id de la mascota elegida (si la guardada ya no existe, la primera). */
export function currentMascotId(): MascotId {
  return chosenId
}

/** La mascota elegida. */
export function currentMascot(): (typeof MASCOTS)[MascotId] {
  return MASCOTS[chosenId]
}

/** Elige una mascota y la saca (si estaba descansando, vuelve). */
export function selectMascot(id: MascotId): void {
  chosenId = id

  try {
    localStorage.setItem(MASCOT_KEY, id)
  } catch {
    // Sin storage se recuerda sólo hasta recargar.
  }

  setMascotEnabled(true)
}

/** La manda a descansar (deja la pantalla libre) y avisa cómo traerla de vuelta. */
export function restMascot(): void {
  setMascotEnabled(false)
  showToastMessage(t('shell.mascot.restToast', { name: currentMascot().name }), 'info')
}

const listeners = new Set<() => void>()
const activities: Record<MascotActivity, number> = { loading: 0, computing: 0 }
let reaction: { state: MascotReaction; until: number } | null = null
let reactionTimer: ReturnType<typeof setTimeout> | null = null
let enabled = readEnabled()

function readEnabled(): boolean {
  try {
    return localStorage.getItem(ENABLED_KEY) !== 'off'
  } catch {
    return true
  }
}

function notify() {
  for (const listener of listeners) {
    listener()
  }
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}

/** Prioridad: una reacción puntual gana; después lo que pasa de fondo (carga, cálculo); después el paso; si no, reposo. */
export function computeMascotState(input: {
  reaction: MascotReaction | null
  loading: boolean
  computing: boolean
  step: string | null
}): MascotState {
  if (input.reaction) {
    return input.reaction
  }

  if (input.loading) {
    return 'waiting'
  }

  if (input.computing) {
    return 'running'
  }

  if (input.step === 'categorization') {
    return 'review'
  }

  return 'idle'
}

/** El paso actual sale del hash, igual que en la navegación (`#meta?deck=1` → `meta`). */
function currentStep(): string | null {
  if (typeof window === 'undefined') {
    return null
  }

  return window.location.hash.replace(/^#/, '').split('?')[0] || null
}

export function getMascotState(): MascotState {
  return computeMascotState({
    reaction: reaction && reaction.until > Date.now() ? reaction.state : null,
    loading: activities.loading > 0,
    computing: activities.computing > 0,
    step: currentStep(),
  })
}

/** Avisa que empezó algo de fondo; devuelve la función para avisar que terminó (llamarla dos veces no rompe nada). */
export function beginMascotActivity(kind: MascotActivity): () => void {
  activities[kind] += 1
  notify()
  let ended = false

  return () => {
    if (ended) {
      return
    }

    ended = true
    activities[kind] = Math.max(0, activities[kind] - 1)
    notify()
  }
}

/** Una reacción puntual; la última pisa a la anterior. */
export function reactMascot(state: MascotReaction, durationMs = 2500): void {
  reaction = { state, until: Date.now() + durationMs }

  if (reactionTimer) {
    clearTimeout(reactionTimer)
  }

  reactionTimer = setTimeout(() => {
    reaction = null
    reactionTimer = null
    notify()
  }, durationMs)
  notify()
}

export function isMascotEnabled(): boolean {
  return enabled
}

export function setMascotEnabled(on: boolean): void {
  enabled = on

  try {
    if (on) {
      localStorage.removeItem(ENABLED_KEY)
    } else {
      localStorage.setItem(ENABLED_KEY, 'off')
    }
  } catch {
    // Sin storage se recuerda sólo hasta recargar.
  }

  notify()
}

if (typeof window !== 'undefined') {
  window.addEventListener('hashchange', notify)
}

export function useMascotState(): MascotState {
  return useSyncExternalStore(subscribe, getMascotState, () => 'idle')
}

export function useMascotEnabled(): boolean {
  return useSyncExternalStore(subscribe, isMascotEnabled, () => true)
}

/** La mascota elegida, con su id; se actualiza cuando se elige otra. */
export function useCurrentMascot(): (typeof MASCOTS)[MascotId] & { id: MascotId } {
  const id = useSyncExternalStore(subscribe, currentMascotId, () => 'cupsy' as MascotId)

  return { id, ...MASCOTS[id] }
}

/** Para los tests: vuelve a la primera mascota y la deja afuera. */
export function resetMascotChoiceForTests(): void {
  chosenId = 'cupsy'
  enabled = true
}

/** Para los tests: vuelve todo a reposo. */
export function resetMascotForTests(): void {
  activities.loading = 0
  activities.computing = 0
  reaction = null

  if (reactionTimer) {
    clearTimeout(reactionTimer)
    reactionTimer = null
  }
}
