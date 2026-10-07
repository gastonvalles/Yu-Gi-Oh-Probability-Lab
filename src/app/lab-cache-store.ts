import type { LabComputation } from './probability-lab'

/**
 * Resultados del Lab guardados en el dispositivo: abrir la app de nuevo con el mismo deck y las mismas
 * reglas muestra el resultado al instante, sin volver a enumerar todas las manos.
 */
const STORAGE_KEY = 'ygo-lab-cache:v1'
const MAX_ENTRIES = 4

interface Stored {
  /** Del más viejo al más usado. */
  order: string[]
  entries: Record<string, LabComputation>
}

let loaded: Stored | null = null

function load(): Stored {
  if (loaded) {
    return loaded
  }

  try {
    const raw = typeof localStorage === 'undefined' ? null : localStorage.getItem(STORAGE_KEY)
    const parsed = raw ? (JSON.parse(raw) as Stored) : null

    loaded = parsed && Array.isArray(parsed.order) && parsed.entries ? parsed : { order: [], entries: {} }
  } catch {
    loaded = { order: [], entries: {} }
  }

  return loaded
}

export function readPersistedComputation(key: string): LabComputation | null {
  return load().entries[key] ?? null
}

/** Guarda el resultado sin bloquear: la serialización se hace cuando el navegador está libre. */
export function persistComputation(key: string, computation: LabComputation): void {
  if (computation.status !== 'ok') {
    return
  }

  const store = load()

  store.order = [...store.order.filter((entry) => entry !== key), key]
  store.entries[key] = computation

  while (store.order.length > MAX_ENTRIES) {
    delete store.entries[store.order.shift() as string]
  }

  const write = () => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(store))
    } catch {
      // Sin espacio o sin acceso: el resultado igual queda en memoria.
    }
  }

  if (typeof window !== 'undefined' && typeof window.requestIdleCallback === 'function') {
    window.requestIdleCallback(write, { timeout: 2000 })
  } else {
    globalThis.setTimeout(write, 0)
  }
}
