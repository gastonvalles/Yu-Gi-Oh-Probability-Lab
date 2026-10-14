import { getLocale } from '../i18n'

/** Qué pasa primero: lo que la persona está esperando ('high') o lo que se calcula por las dudas ('low', como las sugerencias). */
export type PoolPriority = 'high' | 'low'

interface Job {
  build: (id: number) => object
  resolve: (reply: unknown) => void
  reject: (reason: unknown) => void
}

interface Slot {
  worker: Worker
  /** El pedido que está corriendo: cada worker hace uno por vez y el resto espera en la cola del pool. */
  current: { id: number; job: Job; timer: ReturnType<typeof setTimeout> } | null
}

const MAX_WORKERS = 3
/** Una enumeración normal tarda milisegundos; pasado esto el worker se da por colgado y se reemplaza. Se cuenta desde que arranca, no desde que se pide. */
const REQUEST_TIMEOUT_MS = 30_000
const WORKER_TIMEOUT_MESSAGE = 'lab-worker-timeout'
const WORKER_ERROR_MESSAGE = 'lab-worker-error'

const queues: Record<PoolPriority, Job[]> = { high: [], low: [] }
let pool: Slot[] | null | undefined
let nextId = 1

/** El pedido se descartó porque el worker tardó demasiado (no conviene repetirlo en el hilo principal). */
export function isWorkerTimeout(error: unknown): boolean {
  return error instanceof Error && error.message === WORKER_TIMEOUT_MESSAGE
}

/** Libera el worker y rechaza el pedido que tenía en curso. */
function rejectCurrent(slot: Slot, reason: unknown): void {
  const { current } = slot

  if (current) {
    globalThis.clearTimeout(current.timer)
    slot.current = null
    current.job.reject(reason)
  }
}

/** Sin workers que los atiendan, los pedidos en espera no deben quedar colgados: se rechazan y cada uno calcula en el hilo principal. */
function rejectQueued(): void {
  for (const queue of Object.values(queues)) {
    for (const job of queue.splice(0)) {
      job.reject(new Error(WORKER_ERROR_MESSAGE))
    }
  }
}

function dispatch(slot: Slot, job: Job): void {
  const id = nextId++

  // El tiempo límite arranca acá: esperar turno en la cola no cuenta.
  slot.current = { id, job, timer: globalThis.setTimeout(() => replaceStuckSlot(slot), REQUEST_TIMEOUT_MS) }

  try {
    slot.worker.postMessage(job.build(id))
  } catch (error) {
    rejectCurrent(slot, error)
  }
}

/** Reparte la cola entre los workers libres: primero lo urgente, en orden de llegada; de lo demás, lo más nuevo (lo viejo suele ser de un estado que ya se dejó atrás). */
function pump(): void {
  for (const slot of pool ?? []) {
    while (!slot.current) {
      const job = queues.high.shift() ?? queues.low.pop()

      if (!job) {
        return
      }

      dispatch(slot, job)
    }
  }
}

/** Un worker que falla no vuelve a usarse (si no pudo cargar, reemplazarlo repetiría el error): su pedido se rechaza y el que llama calcula en el hilo principal. */
function retireSlot(slot: Slot): void {
  const index = pool?.indexOf(slot) ?? -1

  if (!pool || index < 0) {
    return
  }

  pool.splice(index, 1)
  slot.worker.terminate()
  rejectCurrent(slot, new Error(WORKER_ERROR_MESSAGE))

  if (pool.length === 0) {
    rejectQueued()
  } else {
    pump()
  }
}

function spawn(): Slot {
  // El worker también arma texto (los avisos de validación): el idioma se le pasa como nombre.
  const slot: Slot = { worker: new Worker(new URL('./lab-odds.worker.ts', import.meta.url), { type: 'module', name: getLocale() }), current: null }

  slot.worker.addEventListener('message', (event: MessageEvent<{ id: number }>) => {
    const { current } = slot

    if (current?.id !== event.data.id) {
      return
    }

    globalThis.clearTimeout(current.timer)
    slot.current = null
    current.job.resolve(event.data)
    pump()
  })

  slot.worker.addEventListener('error', () => retireSlot(slot))

  return slot
}

function getPool(): Slot[] | null {
  if (pool !== undefined) {
    return pool
  }

  try {
    if (typeof Worker === 'undefined') {
      pool = null
      return pool
    }

    // Cada cálculo es una enumeración completa: en celulares con varios núcleos se reparten en paralelo.
    const cores = typeof navigator === 'undefined' ? 2 : navigator.hardwareConcurrency || 2
    // Se deja libre más de un núcleo para que la pantalla siga fluida mientras se calcula.
    const size = Math.max(1, Math.min(MAX_WORKERS, cores - 2))

    pool = Array.from({ length: size }, spawn)
  } catch {
    pool = null
  }

  return pool
}

/** Un worker colgado no se puede interrumpir: se termina, se reemplaza y su pedido se rechaza por timeout. Los que esperan en la cola siguen su curso. */
function replaceStuckSlot(slot: Slot): void {
  const slots = getPool()

  if (!slots) {
    return
  }

  const index = slots.indexOf(slot)
  slot.worker.terminate()
  rejectCurrent(slot, new Error(WORKER_TIMEOUT_MESSAGE))

  if (index >= 0) {
    try {
      slots[index] = spawn()
    } catch {
      slots.splice(index, 1)
    }
  }

  if (slots.length === 0) {
    rejectQueued()
  } else {
    pump()
  }
}

/**
 * Manda un pedido a los workers y devuelve la respuesta cruda, o `null` si no hay workers
 * (entonces el que llama calcula en el hilo principal).
 */
export function runInPool<TReply>(build: (id: number) => object, priority: PoolPriority = 'high'): Promise<TReply> | null {
  const slots = getPool()

  if (!slots || slots.length === 0) {
    return null
  }

  return new Promise<TReply>((resolve, reject) => {
    queues[priority].push({ build, resolve: resolve as (reply: unknown) => void, reject })
    pump()
  })
}
