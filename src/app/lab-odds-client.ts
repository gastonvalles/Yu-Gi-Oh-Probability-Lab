import { computeLabOdds, type LabOdds, type LabOddsInput } from './lab-odds'

interface WorkerReply {
  id: number
  odds: {
    first: number
    second: number
    clean: { first: number; second: number }
    rules: { first: [string, number][]; second: [string, number][] }
  } | null
}

interface Slot {
  worker: Worker
  /** Pedidos en curso: se reparte cada cálculo al hilo menos ocupado. */
  load: number
}

const MAX_WORKERS = 3
const cache = new Map<string, LabOdds | null>()
const pending = new Map<number, { resolve: (odds: LabOdds | null) => void; slot: Slot }>()
let pool: Slot[] | null | undefined
let nextId = 1

function getPool(): Slot[] | null {
  if (pool !== undefined) {
    return pool
  }

  try {
    if (typeof Worker === 'undefined') {
      pool = null
      return pool
    }

    // Cada variante es una enumeración completa: en celulares con varios núcleos se reparten en paralelo.
    const size = Math.max(1, Math.min(MAX_WORKERS, (typeof navigator === 'undefined' ? 2 : navigator.hardwareConcurrency || 2) - 1))
    pool = Array.from({ length: size }, () => {
      const worker = new Worker(new URL('./lab-odds.worker.ts', import.meta.url), { type: 'module' })
      const slot: Slot = { worker, load: 0 }

      worker.addEventListener('message', (event: MessageEvent<WorkerReply>) => {
        const { id, odds } = event.data
        const entry = pending.get(id)

        entry?.resolve(
          odds && {
            first: odds.first,
            second: odds.second,
            clean: odds.clean,
            rules: { first: new Map(odds.rules.first), second: new Map(odds.rules.second) },
          },
        )
        pending.delete(id)
        slot.load = Math.max(0, slot.load - 1)
      })

      return slot
    })
  } catch {
    pool = null
  }

  return pool
}

/** Calcula las probabilidades en hilos aparte (y recuerda el resultado por contenido). */
export function requestLabOdds(key: string, input: LabOddsInput): Promise<LabOdds | null> {
  if (cache.has(key)) {
    return Promise.resolve(cache.get(key) ?? null)
  }

  const remember = (odds: LabOdds | null) => {
    cache.set(key, odds)
    return odds
  }
  const slots = getPool()

  if (!slots) {
    return new Promise((resolve) => window.setTimeout(() => resolve(remember(computeLabOdds(input))), 0))
  }

  const slot = slots.reduce((least, candidate) => (candidate.load < least.load ? candidate : least))

  return new Promise((resolve) => {
    const id = nextId++
    slot.load += 1
    pending.set(id, { resolve: (odds) => resolve(remember(odds)), slot })
    slot.worker.postMessage({ id, ...input })
  })
}
