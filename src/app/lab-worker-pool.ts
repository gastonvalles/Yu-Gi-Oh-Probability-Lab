interface Slot {
  worker: Worker
  /** Pedidos en curso: cada cálculo va al hilo menos ocupado. */
  load: number
}

interface PendingRequest {
  resolve: (reply: unknown) => void
  reject: (reason: unknown) => void
  slot: Slot
  timer: ReturnType<typeof setTimeout>
}

const MAX_WORKERS = 3
/** Una enumeración normal tarda milisegundos; pasado esto el worker se da por colgado y se reemplaza. */
const REQUEST_TIMEOUT_MS = 30_000
const WORKER_TIMEOUT_MESSAGE = 'lab-worker-timeout'

const pending = new Map<number, PendingRequest>()
let pool: Slot[] | null | undefined
let nextId = 1

/** El pedido se descartó porque el worker tardó demasiado (no conviene repetirlo en el hilo principal). */
export function isWorkerTimeout(error: unknown): boolean {
  return error instanceof Error && error.message === WORKER_TIMEOUT_MESSAGE
}

function rejectPendingFor(slot: Slot, reason: Error): void {
  for (const [id, entry] of pending) {
    if (entry.slot === slot) {
      pending.delete(id)
      globalThis.clearTimeout(entry.timer)
      entry.reject(reason)
    }
  }

  slot.load = 0
}

function spawn(): Slot {
  const slot: Slot = { worker: new Worker(new URL('./lab-odds.worker.ts', import.meta.url), { type: 'module' }), load: 0 }

  slot.worker.addEventListener('message', (event: MessageEvent<{ id: number }>) => {
    const entry = pending.get(event.data.id)

    pending.delete(event.data.id)
    slot.load = Math.max(0, slot.load - 1)

    if (entry) {
      globalThis.clearTimeout(entry.timer)
      entry.resolve(event.data)
    }
  })

  // Si el worker no puede cargarse o falla, los pedidos pendientes se rechazan y el que llama calcula en el hilo principal.
  slot.worker.addEventListener('error', () => rejectPendingFor(slot, new Error('lab-worker-error')))

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

/** Un worker colgado no se puede interrumpir: se termina, se reemplaza y sus pedidos se rechazan por timeout. */
function replaceStuckSlot(slot: Slot): void {
  const slots = getPool()

  if (!slots) {
    return
  }

  const index = slots.indexOf(slot)
  slot.worker.terminate()
  rejectPendingFor(slot, new Error(WORKER_TIMEOUT_MESSAGE))

  if (index >= 0) {
    try {
      slots[index] = spawn()
    } catch {
      slots.splice(index, 1)
    }
  }
}

/**
 * Manda un pedido a los workers y devuelve la respuesta cruda, o `null` si no hay workers
 * (entonces el que llama calcula en el hilo principal).
 */
export function runInPool<TReply>(build: (id: number) => object): Promise<TReply> | null {
  const slots = getPool()

  if (!slots || slots.length === 0) {
    return null
  }

  const slot = slots.reduce((least, candidate) => (candidate.load < least.load ? candidate : least))

  return new Promise<TReply>((resolve, reject) => {
    const id = nextId++
    const timer = globalThis.setTimeout(() => {
      if (pending.has(id)) {
        replaceStuckSlot(slot)
      }
    }, REQUEST_TIMEOUT_MS)

    slot.load += 1
    pending.set(id, { resolve: resolve as (reply: unknown) => void, reject, slot, timer })
    slot.worker.postMessage(build(id))
  })
}
