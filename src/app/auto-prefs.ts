import { useSyncExternalStore } from 'react'

/**
 * Las preferencias del duelo automático (beta), recordadas en el navegador. `flag` es la bandera de la beta: hasta que se decida la licencia
 * del núcleo nadie ve el modo; la prende `?auto=1` en la dirección y la apaga `?auto=0` (y queda guardado). `duel` es el switch del lobby;
 * `chain`, «Respuestas: Preguntar · Nunca»; `place`, «Casilla: preguntar · automática». No importa nada de `auto/`: lo lee el lobby.
 */
export interface AutoPrefs {
  flag: boolean
  duel: boolean
  chain: 'ask' | 'never'
  place: 'ask' | 'auto'
}

export const AUTO_KEYS = { flag: 'ygo-lab:auto-flag', duel: 'ygo-lab:auto-duel', chain: 'ygo-lab:auto-chain', place: 'ygo-lab:auto-place' } as const
export const DEFAULT_AUTO_PREFS: AutoPrefs = { flag: false, duel: false, chain: 'ask', place: 'ask' }

const stored = (value: AutoPrefs[keyof AutoPrefs]) => (value === true ? 'on' : value === false ? 'off' : value)

function write(storage: () => Storage, key: string, value: string): void {
  try {
    storage().setItem(key, value)
  } catch {
    // Sin almacenamiento (ventana privada, cuota): vale hasta recargar.
  }
}

/** Lo guardado (lo que no se entiende vale lo de siempre), con la bandera que diga la dirección. */
export function readAutoPrefs(storage: () => Storage = () => localStorage, search: string = typeof location === 'undefined' ? '' : location.search): AutoPrefs {
  const get = (key: string) => {
    try {
      return storage().getItem(key)
    } catch {
      return null
    }
  }
  const url = new URLSearchParams(search).get('auto')

  if (url === '1' || url === '0') write(storage, AUTO_KEYS.flag, url === '1' ? 'on' : 'off')

  return {
    flag: url === '1' || (url !== '0' && get(AUTO_KEYS.flag) === 'on'),
    duel: get(AUTO_KEYS.duel) === 'on',
    chain: get(AUTO_KEYS.chain) === 'never' ? 'never' : 'ask',
    place: get(AUTO_KEYS.place) === 'auto' ? 'auto' : 'ask',
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
