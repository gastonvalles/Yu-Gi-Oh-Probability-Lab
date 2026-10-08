interface Slot {
  worker: Worker
  /** Pedidos en curso: cada cálculo va al hilo menos ocupado. */
  load: number
}

const MAX_WORKERS = 3
const pending = new Map<number, { resolve: (reply: unknown) => void; reject: (reason: unknown) => void; slot: Slot }>()
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

    // Cada cálculo es una enumeración completa: en celulares con varios núcleos se reparten en paralelo.
    const cores = typeof navigator === 'undefined' ? 2 : navigator.hardwareConcurrency || 2
    // Se deja libre más de un núcleo para que la pantalla siga fluida mientras se calcula.
    const size = Math.max(1, Math.min(MAX_WORKERS, cores - 2))

    pool = Array.from({ length: size }, () => {
      const slot: Slot = { worker: new Worker(new URL('./lab-odds.worker.ts', import.meta.url), { type: 'module' }), load: 0 }

      slot.worker.addEventListener('message', (event: MessageEvent<{ id: number }>) => {
        const entry = pending.get(event.data.id)

        pending.delete(event.data.id)
        slot.load = Math.max(0, slot.load - 1)
        entry?.resolve(event.data)
      })

      // Si el worker no puede cargarse o falla, los pedidos pendientes se rechazan y el que llama calcula en el hilo principal.
      slot.worker.addEventListener('error', () => {
        for (const [id, entry] of pending) {
          if (entry.slot === slot) {
            pending.delete(id)
            entry.reject(new Error('lab-worker-error'))
          }
        }

        slot.load = 0
      })

      return slot
    })
  } catch {
    pool = null
  }

  return pool
}

/**
 * Manda un pedido a los workers y devuelve la respuesta cruda, o `null` si no hay workers
 * (entonces el que llama calcula en el hilo principal).
 */
export function runInPool<TReply>(build: (id: number) => object): Promise<TReply> | null {
  const slots = getPool()

  if (!slots) {
    return null
  }

  const slot = slots.reduce((least, candidate) => (candidate.load < least.load ? candidate : least))

  return new Promise<TReply>((resolve, reject) => {
    const id = nextId++

    slot.load += 1
    pending.set(id, { resolve: resolve as (reply: unknown) => void, reject, slot })
    slot.worker.postMessage(build(id))
  })
}

/** Cuántos hilos hay (para repartir un cálculo en partes parejas). */
export function getPoolSize(): number {
  return getPool()?.length ?? 0
}
