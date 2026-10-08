import type { LabComputation } from './probability-lab'

/**
 * Resultados del Lab guardados en el dispositivo: abrir la app de nuevo con el mismo deck y las mismas
 * reglas muestra el resultado al instante, sin volver a enumerar todas las manos.
 */
export const LAB_CACHE_KEY = 'ygo-lab-cache:v1'
const MAX_ENTRIES = 4

interface Stored {
  /** Del más viejo al más usado. */
  order: string[]
  entries: Record<string, LabComputation>
}

let loaded: Stored | null = null

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value)

function load(): Stored {
  if (loaded) {
    return loaded
  }

  try {
    const raw = typeof localStorage === 'undefined' ? null : localStorage.getItem(LAB_CACHE_KEY)
    const parsed: unknown = raw ? JSON.parse(raw) : null

    loaded =
      isRecord(parsed) && Array.isArray(parsed.order) && isRecord(parsed.entries)
        ? { order: parsed.order.filter((key): key is string => typeof key === 'string'), entries: parsed.entries as Record<string, LabComputation> }
        : { order: [], entries: {} }
  } catch {
    loaded = { order: [], entries: {} }
  }

  return loaded
}

/** Un resultado guardado con otra forma (versión vieja, dato corrupto) se ignora en vez de romper al dibujar. */
function isUsableComputation(value: unknown): value is LabComputation {
  return (
    isRecord(value) &&
    value.status === 'ok' &&
    isRecord(value.results) &&
    isRecord(value.results.first) &&
    isRecord(value.results.second) &&
    isRecord(value.results.average) &&
    Array.isArray(value.issues)
  )
}

export function readPersistedComputation(key: string): LabComputation | null {
  const entry: unknown = load().entries[key]
  return isUsableComputation(entry) ? entry : null
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
      localStorage.setItem(LAB_CACHE_KEY, JSON.stringify(store))
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
