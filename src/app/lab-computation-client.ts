import { persistComputation, readPersistedComputation } from './lab-cache-store'
import { runInPool } from './lab-worker-pool'
import { assembleLabComputation, computeLabResults, labInputSignature, type LabComputation } from './probability-lab'
import type { CalculationOutput, CardEntry, HandPattern } from '../types'

/** Sube este número si cambia la matemática del Lab: invalida los resultados guardados. */
const LAB_ENGINE_VERSION = 1
const MAX_MEMORY_ENTRIES = 24

export interface LabComputationInput {
  cards: CardEntry[]
  patterns: HandPattern[]
  handSize: number
}

const memory = new Map<string, LabComputation>()
const inFlight = new Map<string, Promise<LabComputation>>()
const keyMemo = new WeakMap<CardEntry[], WeakMap<HandPattern[], Map<number, string>>>()

/** Hash de 53 bits (cyrb53): la clave es corta aunque el deck y las reglas pesen cientos de KB de JSON. */
function hashString(text: string): string {
  let h1 = 0xdeadbeef
  let h2 = 0x41c6ce57

  for (let index = 0; index < text.length; index += 1) {
    const code = text.charCodeAt(index)

    h1 = Math.imul(h1 ^ code, 2654435761)
    h2 = Math.imul(h2 ^ code, 1597334677)
  }

  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909)
  h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909)

  return (4294967296 * (2097151 & h2) + (h1 >>> 0)).toString(36)
}

/** Clave por contenido (cartas + reglas + mano): dos arrays distintos con lo mismo dan la misma clave. */
export function labComputationKey({ cards, patterns, handSize }: LabComputationInput): string {
  let byPatterns = keyMemo.get(cards)
  let byHand = byPatterns?.get(patterns)

  if (!byPatterns) {
    byPatterns = new WeakMap()
    keyMemo.set(cards, byPatterns)
  }

  if (!byHand) {
    byHand = new Map()
    byPatterns.set(patterns, byHand)
  }

  let key = byHand.get(handSize)

  if (!key) {
    key = `${LAB_ENGINE_VERSION}-${hashString(labInputSignature(cards, patterns, handSize))}`
    byHand.set(handSize, key)
  }

  return key
}

function remember(key: string, computation: LabComputation): LabComputation {
  memory.delete(key)
  memory.set(key, computation)

  if (memory.size > MAX_MEMORY_ENTRIES) {
    memory.delete(memory.keys().next().value as string)
  }

  persistComputation(key, computation)

  return computation
}

/** Resultado ya calculado (en memoria o guardado en el dispositivo): permite mostrarlo sin esperar. */
export function peekLabComputation(key: string): LabComputation | null {
  const cached = memory.get(key) ?? readPersistedComputation(key)

  if (cached && !memory.has(key)) {
    memory.set(key, cached)
  }

  return cached
}

/**
 * Calcula el Lab fuera del hilo principal: cada turno va a un worker distinto (en paralelo) y el
 * resultado se recuerda por contenido, en memoria y en el dispositivo.
 */
export function requestLabComputation(input: LabComputationInput, key = labComputationKey(input)): Promise<LabComputation> {
  const cached = peekLabComputation(key)

  if (cached) {
    return Promise.resolve(cached)
  }

  const running = inFlight.get(key)

  if (running) {
    return running
  }

  const { cards, patterns, handSize } = input
  const first = runInPool<{ output: CalculationOutput }>((id) => ({ id, kind: 'view', cards, patterns, handSize, view: 'first' }))
  const second = runInPool<{ output: CalculationOutput }>((id) => ({ id, kind: 'view', cards, patterns, handSize, view: 'second' }))
  const inMainThread = () =>
    new Promise<LabComputation>((resolve) => window.setTimeout(() => resolve(computeLabResults(cards, patterns, handSize)), 0))
  const computation =
    first && second
      ? Promise.all([first, second])
          .then(([a, b]) => assembleLabComputation(a.output, b.output, patterns, handSize))
          // Sin workers utilizables (bloqueados o con error) se calcula igual, en el hilo principal.
          .catch(inMainThread)
      : inMainThread()
  const tracked = computation
    .then((result) => remember(key, result))
    .finally(() => {
      inFlight.delete(key)
    })

  inFlight.set(key, tracked)

  return tracked
}
