import { deckCardsSignature, type BuildZones, type SavedBuild } from './saved-builds'
import { isRecord } from './utils'

/**
 * Qué compara Comparar (A y B) y cuál es la B de entrada. La selección se recuerda en `localStorage['ygo-lab:comparison-selection']`
 * con la misma forma de siempre (`{ a, b }`, más `pickedAt` opcional): la pantalla de hoy la sigue leyendo (una fuente que no conoce,
 * como el `draft` del Lab que ya no existe, la ve como «sin B»). Ningún worker la lee.
 */
export const COMPARISON_SELECTION_KEY = 'ygo-lab:comparison-selection'

/** Tu deck del builder, sin guardarlo (el A de siempre). */
export const CURRENT_SOURCE = 'current'
/** «Tu deck de antes» (`deck-before.ts`). */
export const DECK_BEFORE_SOURCE = 'deck-before'
/** Una de las dos de arriba o el `id` de una build guardada (`build-…`: no choca con ellas). */
export type BuildSource = string

export interface ComparisonSelection {
  a: BuildSource
  b: BuildSource | null
}

/** Lo que se guarda: la selección y cuándo elegiste B a mano (ISO). Lo guardado antes no trae `pickedAt`. */
export interface StoredComparisonSelection extends ComparisonSelection {
  pickedAt?: string
}

/** Lo que hay para comparar ahora. */
export interface ComparisonSources {
  current: BuildZones
  deckBefore: (BuildZones & { savedAt: string }) | null
  savedBuilds: readonly SavedBuild[]
}

export function zonesOfSource(source: BuildSource | null, sources: ComparisonSources): BuildZones | null {
  if (source === CURRENT_SOURCE) return sources.current
  if (source === DECK_BEFORE_SOURCE) return sources.deckBefore

  return sources.savedBuilds.find((build) => build.id === source) ?? null
}

/**
 * La B de entrada: «Tu deck de antes» si existe y tiene otras cartas que A; si no, la build guardada más reciente que no sea igual a A;
 * si no, `null` (primera vez: no hay con qué comparar).
 */
export function defaultComparisonB(sources: ComparisonSources, a: BuildSource = CURRENT_SOURCE): BuildSource | null {
  const signatureA = deckCardsSignature(zonesOfSource(a, sources) ?? sources.current)
  const differs = (zones: BuildZones) => deckCardsSignature(zones) !== signatureA

  if (a !== DECK_BEFORE_SOURCE && sources.deckBefore && differs(sources.deckBefore)) {
    return DECK_BEFORE_SOURCE
  }

  const latest = sources.savedBuilds
    .filter((build) => build.id !== a && differs(build))
    .reduce<SavedBuild | null>((best, build) => (!best || build.savedAt > best.savedAt ? build : best), null)

  return latest?.id ?? null
}

/**
 * La selección que vale ahora, a partir de la guardada:
 * - A que ya no existe → tu deck actual.
 * - B que ya no existe (una build borrada) o que nunca se eligió → la de entrada (`defaultComparisonB`).
 * - Un «Tu deck de antes» guardado DESPUÉS de que elegiste B (volviste a cambiar cartas, o cargaste otra build) pasa a ser B: la pregunta
 *   vuelve a ser «¿quedó mejor?». Si lo pisó una sesión nueva, B muestra la copia nueva.
 * Renombrar una build no la toca (se guarda el id).
 */
export function resolveComparisonSelection(stored: StoredComparisonSelection, sources: ComparisonSources): ComparisonSelection {
  const zonesA = zonesOfSource(stored.a, sources)
  const a = zonesA ? stored.a : CURRENT_SOURCE
  const before = sources.deckBefore
  const beforeIsNewer =
    before !== null &&
    a !== DECK_BEFORE_SOURCE &&
    (stored.pickedAt ?? '') < before.savedAt &&
    deckCardsSignature(before) !== deckCardsSignature(zonesA ?? sources.current)

  if (beforeIsNewer) {
    return { a, b: DECK_BEFORE_SOURCE }
  }

  return { a, b: stored.b !== null && zonesOfSource(stored.b, sources) ? stored.b : defaultComparisonB(sources, a) }
}

export function parseComparisonSelection(value: unknown): StoredComparisonSelection {
  const record = isRecord(value) ? value : {}

  return {
    a: typeof record.a === 'string' ? record.a : CURRENT_SOURCE,
    b: typeof record.b === 'string' ? record.b : null,
    ...(typeof record.pickedAt === 'string' ? { pickedAt: record.pickedAt } : {}),
  }
}

export function readComparisonSelection(): StoredComparisonSelection {
  try {
    return parseComparisonSelection(JSON.parse(localStorage.getItem(COMPARISON_SELECTION_KEY) ?? 'null'))
  } catch {
    return { a: CURRENT_SOURCE, b: null }
  }
}

export function writeComparisonSelection(selection: StoredComparisonSelection): void {
  try {
    localStorage.setItem(COMPARISON_SELECTION_KEY, JSON.stringify(selection))
  } catch {
    // La selección es una comodidad: si no se puede guardar, Comparar arranca con la de entrada.
  }
}
