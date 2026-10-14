import { hashString } from './lab-computation-client'
import { computeLabOdds, type LabOdds, type LabOddsInput } from './lab-odds'
import { isWorkerTimeout, runInPool, type PoolPriority } from './lab-worker-pool'

interface OddsReply {
  id: number
  odds: {
    first: number
    second: number
    clean: { first: number; second: number }
    rules: { first: [string, number][]; second: [string, number][] }
  } | null
}

// Las sugerencias prueban decenas de variantes del deck: la caché se acota y las claves se hashean
// (cada una era el JSON entero del deck).
const MAX_ENTRIES = 64
const cache = new Map<string, LabOdds | null>()
const inFlight = new Map<string, Promise<LabOdds | null>>()

const fromReply = ({ odds }: OddsReply): LabOdds | null =>
  odds && {
    first: odds.first,
    second: odds.second,
    clean: odds.clean,
    rules: { first: new Map(odds.rules.first), second: new Map(odds.rules.second) },
  }

/** Calcula las probabilidades en hilos aparte (y recuerda el resultado por contenido). Con prioridad 'low' cede el turno a lo que la persona está esperando. */
export function requestLabOdds(rawKey: string, input: LabOddsInput, priority?: PoolPriority): Promise<LabOdds | null> {
  const key = hashString(rawKey)

  if (cache.has(key)) {
    const hit = cache.get(key) ?? null
    cache.delete(key)
    cache.set(key, hit)
    return Promise.resolve(hit)
  }

  const running = inFlight.get(key)

  if (running) {
    return running
  }

  const remember = (odds: LabOdds | null) => {
    cache.set(key, odds)

    if (cache.size > MAX_ENTRIES) {
      cache.delete(cache.keys().next().value as string)
    }

    return odds
  }
  const reply = runInPool<OddsReply>((id) => ({ id, kind: 'odds', ...input }), priority)
  const inMainThread = () => new Promise<LabOdds | null>((resolve) => window.setTimeout(() => resolve(remember(computeLabOdds(input))), 0))
  // Si el worker tardó demasiado no se repite el cálculo en el hilo principal (congelaría la pantalla): queda sin dato.
  const result = (reply ? reply.then((data) => remember(fromReply(data)), (error) => (isWorkerTimeout(error) ? remember(null) : inMainThread())) : inMainThread()).finally(() => inFlight.delete(key))

  inFlight.set(key, result)

  return result
}
