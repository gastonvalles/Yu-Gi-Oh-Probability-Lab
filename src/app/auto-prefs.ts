import { useSyncExternalStore } from 'react'

/**
 * Las preferencias del duelo automático (beta), recordadas en el navegador. `duel` es el interruptor del lobby de Jugar: prendido, «Entrenar solo» abre la mesa contra el núcleo de
 * reglas; apagado, la mesa manual de siempre. `chain`, «Respuestas: Siempre · Cuando importa · Nunca»; `place`, «Casilla: preguntar · automática»; `blind`, «A ciegas»: la mano del rival de
 * handtraps de dorso. No importa nada de `auto/`: lo lee el lobby. La bandera de antes (`?auto=1`, `ygo-lab:auto-flag`) ya no existe: el modo lo ve todo el mundo y la clave vieja se ignora.
 */
export interface AutoPrefs {
  duel: boolean
  chain: 'always' | 'ask' | 'never'
  place: 'ask' | 'auto'
  blind: boolean
}

export const AUTO_KEYS = { duel: 'ygo-lab:auto-duel', chain: 'ygo-lab:auto-chain', place: 'ygo-lab:auto-place', blind: 'ygo-lab:auto-blind' } as const
/** Lo de quien no tocó nada. `duel: false`: se arranca en la mesa manual (con `true` arrancaría en el automático; quien lo apagó lo sigue teniendo apagado). */
export const DEFAULT_AUTO_PREFS: AutoPrefs = { duel: false, chain: 'ask', place: 'ask', blind: false }

/** El núcleo corre en WebAssembly y en un Worker: un navegador sin alguno de los dos no lo puede correr, y entonces el interruptor va apagado y la preferencia no se usa. */
export const canRunAuto = (scope: { WebAssembly?: unknown; Worker?: unknown } = globalThis): boolean => typeof scope.WebAssembly === 'object' && typeof scope.Worker === 'function'

const stored = (value: AutoPrefs[keyof AutoPrefs]) => (value === true ? 'on' : value === false ? 'off' : value)

function write(storage: () => Storage, key: string, value: string): void {
  try {
    storage().setItem(key, value)
  } catch {
    // Sin almacenamiento (ventana privada, cuota): vale hasta recargar.
  }
}

/** Lo guardado; lo que no se entiende (o no está) vale lo de siempre (`DEFAULT_AUTO_PREFS`). */
export function readAutoPrefs(storage: () => Storage = () => localStorage): AutoPrefs {
  const get = (key: string) => {
    try {
      return storage().getItem(key)
    } catch {
      return null
    }
  }
  const duel = get(AUTO_KEYS.duel)
  const chain = get(AUTO_KEYS.chain)

  return {
    duel: duel === 'on' || (duel !== 'off' && DEFAULT_AUTO_PREFS.duel),
    chain: chain === 'never' || chain === 'always' ? chain : 'ask',
    place: get(AUTO_KEYS.place) === 'auto' ? 'auto' : 'ask',
    blind: get(AUTO_KEYS.blind) === 'on',
  }
}

let prefs = readAutoPrefs()
const listeners = new Set<() => void>()

export const autoPrefs = (): AutoPrefs => prefs

export function setAutoPref<K extends keyof AutoPrefs>(key: K, value: AutoPrefs[K], storage: () => Storage = () => localStorage): void {
  if (prefs[key] === value) return
  prefs = { ...prefs, [key]: value }
  write(storage, AUTO_KEYS[key], stored(value))
  listeners.forEach((listener) => listener())
}

export function useAutoPrefs(): AutoPrefs {
  return useSyncExternalStore(
    (listener) => {
      listeners.add(listener)

      return () => {
        listeners.delete(listener)
      }
    },
    () => prefs,
    () => DEFAULT_AUTO_PREFS,
  )
}
