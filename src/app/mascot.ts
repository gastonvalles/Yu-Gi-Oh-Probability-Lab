import { useSyncExternalStore } from 'react'

import { t } from '../i18n'
import { showToastMessage } from './use-toast-message'

/**
 * Las mascotas (Cupsy, el Kuriboh alado...): un estado por animación del paquete. Las pantallas no las manejan directamente:
 * avisan qué pasa (se está cargando algo, se calcula, salió bien, salió mal) y ellas reaccionan.
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
 * Las mascotas disponibles: cada una con su carpeta en public/mascot, con una animación por estado (de 192×208, ver `MASCOT_ANIMATION`)
 * y un cuadro quieto (idle.png). Para sumar otra alcanza con la carpeta y una línea acá.
 */
export const MASCOTS = {
  cupsy: { name: 'Cupsy', folder: '/mascot/cupsy' },
  'winged-kuriboh': { name: 'Winged Kuriboh', folder: '/mascot/winged-kuriboh' },
} as const
export type MascotId = keyof typeof MASCOTS

/** Cuántas pueden estar afuera a la vez. */
export const MAX_ACTIVE_MASCOTS = 3

const ACTIVE_KEY = 'ygo-lab:mascots'
// Lo que se guardaba cuando había una sola: cuál era y si estaba descansando ('off'), y dónde la habían dejado.
const LEGACY_ID_KEY = 'ygo-lab:mascot-id'
const LEGACY_ENABLED_KEY = 'ygo-lab:mascot'
const LEGACY_POSITION_KEY = 'ygo-lab:mascot-position'

export const isMascotId = (value: unknown): value is MascotId => typeof value === 'string' && value in MASCOTS

/** Dónde se recuerda la posición de cada mascota (cada una la suya). */
export const mascotPositionKey = (id: MascotId): string => `ygo-lab:mascot-position:${id}`

/** La lista que queda al sacar una mascota: sin repetir, y sin pasar el máximo (si no entra, queda igual). */
export function withMascot(active: readonly MascotId[], id: MascotId, max = MAX_ACTIVE_MASCOTS): MascotId[] {
  return active.includes(id) || active.length >= max ? [...active] : [...active, id]
}

/** Lo guardado a mano o por una versión vieja: sólo mascotas que existen, sin repetir y hasta el máximo. */
export function sanitizeActiveMascots(value: unknown, max = MAX_ACTIVE_MASCOTS): MascotId[] {
  return Array.isArray(value) ? value.filter(isMascotId).filter((id, index, all) => all.indexOf(id) === index).slice(0, max) : []
}

function readActive(): MascotId[] {
  try {
    const stored = localStorage.getItem(ACTIVE_KEY)

    if (stored !== null) {
      return sanitizeActiveMascots(JSON.parse(stored))
    }

    // Primera vez con varias: la que había estaba afuera, salvo que la hubieran mandado a descansar.
    const legacyId = localStorage.getItem(LEGACY_ID_KEY)
    const id: MascotId = isMascotId(legacyId) ? legacyId : 'cupsy'
    const legacyPosition = localStorage.getItem(LEGACY_POSITION_KEY)

    if (legacyPosition !== null && localStorage.getItem(mascotPositionKey(id)) === null) {
      localStorage.setItem(mascotPositionKey(id), legacyPosition)
    }

    return localStorage.getItem(LEGACY_ENABLED_KEY) === 'off' ? [] : [id]
  } catch {
    return ['cupsy']
  }
}

function writeActive(ids: readonly MascotId[]): void {
  try {
    localStorage.setItem(ACTIVE_KEY, JSON.stringify(ids))
    // Ya está migrado: lo viejo no vuelve a leerse.
    for (const key of [LEGACY_ID_KEY, LEGACY_ENABLED_KEY, LEGACY_POSITION_KEY]) {
      localStorage.removeItem(key)
    }
  } catch {
    // Sin storage se recuerda sólo hasta recargar.
  }
}

let active: readonly MascotId[] = readActive()
let maxActive = MAX_ACTIVE_MASCOTS
const SERVER_ACTIVE: readonly MascotId[] = ['cupsy']

const listeners = new Set<() => void>()
const activities: Record<MascotActivity, number> = { loading: 0, computing: 0 }
/** Las reacciones puntuales: la clave es la mascota, o '*' si es para todas (lo que salió bien o mal en la app). */
const reactions = new Map<string, { state: MascotReaction; until: number }>()
/** Lo que pasa entre ellas (saludarse, chocarse): sólo se ve si la mascota no está ocupada con otra cosa. */
const socials = new Map<MascotId, { state: MascotReaction; until: number }>()

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

/** Cuántas vistas de duelo (la práctica) están abiertas. En un duelo hay una sola mascota, la de la vista: las que andan flotando se quedan esperando. */
let duels = 0

/** Avisa que empezó un duelo; devuelve la función para avisar que terminó (llamarla dos veces no rompe nada). */
export function beginDuel(): () => void {
  duels += 1
  notify()
  let ended = false

  return () => {
    if (ended) {
      return
    }

    ended = true
    duels = Math.max(0, duels - 1)
    notify()
  }
}

/** Quiénes están afuera, en el orden en que salieron. */
export function activeMascotIds(): readonly MascotId[] {
  return active
}

export function isMascotActive(id: MascotId): boolean {
  return active.includes(id)
}

/** Cuántas pueden estar afuera a la vez. */
export function maxActiveMascots(): number {
  return maxActive
}

/** Cuántas pueden salir todavía. */
export function freeMascotSlots(): number {
  return Math.max(0, maxActive - active.length)
}

/** La primera que está afuera (o Cupsy si no hay ninguna): la de la pantalla de error, por ejemplo. */
export function currentMascot(): (typeof MASCOTS)[MascotId] {
  return MASCOTS[active[0] ?? 'cupsy']
}

function setActive(next: readonly MascotId[]) {
  active = next
  writeActive(next)
  notify()
}

/** La saca (saluda al llegar). Devuelve false si ya hay el máximo afuera. */
export function summonMascot(id: MascotId): boolean {
  if (active.includes(id)) {
    return true
  }

  const next = withMascot(active, id, maxActive)

  if (next.length === active.length) {
    return false
  }

  setActive(next)
  reactMascot('waving', 2600, id)
  return true
}

/** La manda a descansar (deja la pantalla libre) y avisa cómo traerla de vuelta. */
export function restMascot(id: MascotId): void {
  if (!active.includes(id)) {
    return
  }

  setActive(active.filter((other) => other !== id))
  showToastMessage(t('shell.mascot.restToast', { name: MASCOTS[id].name }), 'info')
}

/** Prioridad: una reacción puntual gana; después lo que pasa de fondo (carga, cálculo); después el paso; después lo social; si no, reposo. */
export function computeMascotState(input: {
  reaction: MascotReaction | null
  loading: boolean
  computing: boolean
  step: string | null
  social?: MascotReaction | null
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

  return input.social ?? 'idle'
}

/** El paso actual sale del hash, igual que en la navegación (`#meta?deck=1` → `meta`). */
function currentStep(): string | null {
  if (typeof window === 'undefined') {
    return null
  }

  return window.location.hash.replace(/^#/, '').split('?')[0] || null
}

/** La reacción que está en curso para esa mascota: la suya o la de todas, la que empezó después. */
function reactionOf(id: MascotId | undefined, now: number): MascotReaction | null {
  const candidates = [id ? reactions.get(id) : undefined, reactions.get('*')].filter((reaction) => reaction && reaction.until > now)

  return candidates.sort((first, second) => second!.until - first!.until)[0]?.state ?? null
}

/** Qué animación le toca a esa mascota (sin `id`, la de las reacciones y tareas que son de todas). */
export function getMascotState(id?: MascotId): MascotState {
  const now = Date.now()
  const social = id ? socials.get(id) : undefined

  return computeMascotState({
    reaction: reactionOf(id, now),
    loading: activities.loading > 0,
    computing: activities.computing > 0,
    step: currentStep(),
    social: social && social.until > now ? social.state : null,
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

/** Avisa cuando vence una reacción, para volver a dibujar con la animación de reposo. */
function expireAfter(durationMs: number) {
  setTimeout(notify, durationMs + 20)
}

/** Una reacción puntual (de todas, o sólo de `id`); la última pisa a la anterior. */
export function reactMascot(state: MascotReaction, durationMs = 2500, id?: MascotId): void {
  reactions.set(id ?? '*', { state, until: Date.now() + durationMs })
  notify()
  expireAfter(durationMs)
}

/** Algo que pasa entre mascotas (saludo, choque): la mascota lo muestra sólo si está en reposo, así no tapa lo que está haciendo. */
export function playMascotSocial(id: MascotId, state: MascotReaction, durationMs = 2400): void {
  socials.set(id, { state, until: Date.now() + durationMs })
  notify()
  expireAfter(durationMs)
}

if (typeof window !== 'undefined') {
  window.addEventListener('hashchange', notify)
}

export function useMascotState(id?: MascotId): MascotState {
  return useSyncExternalStore(
    subscribe,
    () => getMascotState(id),
    () => 'idle',
  )
}

/** Hay un duelo abierto: las mascotas no flotan por encima de la mesa, la de la vista es la única. */
export function useInDuel(): boolean {
  return useSyncExternalStore(
    subscribe,
    () => duels > 0,
    () => false,
  )
}

/** Las que están afuera, en el orden en que salieron; se actualiza cuando sale o descansa alguna. */
export function useActiveMascots(): readonly MascotId[] {
  return useSyncExternalStore(subscribe, activeMascotIds, () => SERVER_ACTIVE)
}

/** Para los tests: vuelve a la primera mascota afuera, el máximo de siempre y nada guardado. */
export function resetMascotChoiceForTests(): void {
  active = ['cupsy']
  maxActive = MAX_ACTIVE_MASCOTS
}

/** Para los tests: cuántas pueden estar afuera a la vez (para probar el tope sin tener tres mascotas). */
export function setMaxActiveMascotsForTests(max: number): void {
  maxActive = max
}

/** Para los tests: vuelve todo a reposo. */
export function resetMascotForTests(): void {
  duels = 0
  activities.loading = 0
  activities.computing = 0
  reactions.clear()
  socials.clear()
}
