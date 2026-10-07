import { computeLabOdds, type LabOdds, type LabOddsInput } from './lab-odds'
import { runInPool } from './lab-worker-pool'

interface OddsReply {
  id: number
  odds: {
    first: number
    second: number
    clean: { first: number; second: number }
    rules: { first: [string, number][]; second: [string, number][] }
  } | null
}

const cache = new Map<string, LabOdds | null>()

const fromReply = ({ odds }: OddsReply): LabOdds | null =>
  odds && {
    first: odds.first,
    second: odds.second,
    clean: odds.clean,
    rules: { first: new Map(odds.rules.first), second: new Map(odds.rules.second) },
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
  const reply = runInPool<OddsReply>((id) => ({ id, kind: 'odds', ...input }))

  const inMainThread = () => new Promise<LabOdds | null>((resolve) => window.setTimeout(() => resolve(remember(computeLabOdds(input))), 0))

  return reply ? reply.then((data) => remember(fromReply(data)), inMainThread) : inMainThread()
}
