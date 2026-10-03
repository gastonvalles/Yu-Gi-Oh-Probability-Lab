import { computeLabOdds, type LabOdds, type LabOddsInput } from './lab-odds'

interface WorkerReply {
  id: number
  odds: { first: number; second: number; rules: { first: [string, number][]; second: [string, number][] } } | null
}

const cache = new Map<string, LabOdds | null>()
const pending = new Map<number, (odds: LabOdds | null) => void>()
let worker: Worker | null | undefined
let nextId = 1

function getWorker(): Worker | null {
  if (worker !== undefined) {
    return worker
  }

  try {
    worker = typeof Worker === 'undefined' ? null : new Worker(new URL('./lab-odds.worker.ts', import.meta.url), { type: 'module' })
    worker?.addEventListener('message', (event: MessageEvent<WorkerReply>) => {
      const { id, odds } = event.data
      pending.get(id)?.(
        odds && { first: odds.first, second: odds.second, rules: { first: new Map(odds.rules.first), second: new Map(odds.rules.second) } },
      )
      pending.delete(id)
    })
  } catch {
    worker = null
  }

  return worker
}

/** Calcula las probabilidades en un hilo aparte (y recuerda el resultado por contenido). */
export function requestLabOdds(key: string, input: LabOddsInput): Promise<LabOdds | null> {
  if (cache.has(key)) {
    return Promise.resolve(cache.get(key) ?? null)
  }

  const remember = (odds: LabOdds | null) => {
    cache.set(key, odds)
    return odds
  }
  const activeWorker = getWorker()

  if (!activeWorker) {
    return new Promise((resolve) => window.setTimeout(() => resolve(remember(computeLabOdds(input))), 0))
  }

  return new Promise((resolve) => {
    const id = nextId++
    pending.set(id, (odds) => resolve(remember(odds)))
    activeWorker.postMessage({ id, ...input })
  })
}
