import type { VerifiedEffect } from './card-effect-map'
import { effectFactNames, type EffectFactName } from './card-effect-facts'
import { effectSentences, type EffectSentence } from './card-text'

/**
 * Los hechos confirmados de los efectos de cada carta (bits de `EFFECT_FACT` por id), generados por `scripts/build-card-effects.mjs` en `src/data/card-effects.json`: lo que el script de EDOPro y el texto de la
 * carta dicen los dos (ver `card-effect-facts.ts` y `docs/motor-de-cartas.md`, capa 1). El JSON agrupa los ids por valor de bits, como `card-rules.json`; se baja una vez, la primera vez que hace falta.
 *
 * Una carta que no está, o un bit apagado, **no dice nada**: no es que el efecto no exista, es que no hay dos fuentes que lo confirmen.
 */
export interface CardEffectData {
  scripts: string
  cards: Record<string, number[]>
}

let factsById: ReadonlyMap<number, number> | null = null
let loading: Promise<void> | null = null

export function indexCardEffects(data: CardEffectData): Map<number, number> {
  const index = new Map<number, number>()

  for (const [facts, ids] of Object.entries(data.cards)) {
    for (const id of ids) {
      index.set(id, Number(facts))
    }
  }

  return index
}

export function loadCardEffects(): Promise<void> {
  loading ??= import('../data/card-effects.json')
    .then((module) => {
      factsById = indexCardEffects(module.default as CardEffectData)
    })
    .catch((error: unknown) => {
      console.warn('No se pudieron cargar los hechos de los efectos de las cartas.', error)
      loading = null
    })

  return loading
}

/** Los bits confirmados de la carta (`EFFECT_FACT`), o undefined si no hay ninguno (o todavía no llegaron los datos). */
export function getCardEffectFacts(ygoprodeckId: number): number | undefined {
  return factsById?.get(ygoprodeckId)
}

/** Los nombres de los hechos confirmados de la carta (vacío si no hay ninguno). */
export function getCardEffectFactNames(ygoprodeckId: number): EffectFactName[] {
  return effectFactNames(getCardEffectFacts(ygoprodeckId) ?? 0)
}

export function setCardEffectsForTests(index: ReadonlyMap<number, number> | null): void {
  factsById = index
}

/**
 * Lo confirmado de **cada** efecto de las cartas con varios (`card-effect-map.ts`: la frase del texto alineada con su efecto del script), generado por `scripts/build-card-effects.mjs` en `src/data/card-effect-map.json`.
 * Por carta, y en el orden del texto: `[dónde empieza la frase, hechos, lugares]`. Una carta que no está no se pudo alinear con certeza: no dice nada de sus efectos por separado.
 */
export interface CardEffectMapData {
  scripts: string
  cards: Record<string, Array<[number, number, number]>>
}

/** Un efecto del texto con lo confirmado de él. */
export interface CardEffectOfText extends VerifiedEffect {
  sentence: EffectSentence
}

let mapById: ReadonlyMap<number, ReadonlyArray<readonly [number, number, number]>> | null = null
let mapLoading: Promise<void> | null = null

export function indexCardEffectMap(data: CardEffectMapData): Map<number, Array<[number, number, number]>> {
  return new Map(Object.entries(data.cards).map(([id, effects]) => [Number(id), effects]))
}

/** Si los efectos de cada carta ya llegaron (para no esperar de más cuando otra pantalla ya los bajó). */
export const cardEffectMapLoaded = (): boolean => mapById !== null

export function loadCardEffectMap(): Promise<void> {
  mapLoading ??= import('../data/card-effect-map.json')
    .then((module) => {
      mapById = indexCardEffectMap(module.default as unknown as CardEffectMapData)
    })
    .catch((error: unknown) => {
      console.warn('No se pudo cargar el mapa de los efectos de las cartas.', error)
      mapLoading = null
    })

  return mapLoading
}

/**
 * Los efectos del texto de la carta con lo confirmado de cada uno, o undefined si no hay (la carta no se pudo alinear, todavía no llegaron los datos o **el texto cambió** desde que se generó: si las frases ya no
 * empiezan donde estaban, el orden no es de fiar y no se dice nada).
 */
export function getCardEffectMap(ygoprodeckId: number, text: string): CardEffectOfText[] | undefined {
  const saved = mapById?.get(ygoprodeckId)

  if (saved === undefined) return undefined

  const sentences = effectSentences(text)

  if (sentences.length !== saved.length || sentences.some((sentence, index) => sentence.start !== saved[index]![0])) return undefined

  return saved.map(([start, facts, places], index) => ({ start, facts, places, sentence: sentences[index]! }))
}

export function setCardEffectMapForTests(index: ReadonlyMap<number, ReadonlyArray<readonly [number, number, number]>> | null): void {
  mapById = index
}
