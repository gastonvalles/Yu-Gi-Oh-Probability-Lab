import { effectFactNames, type EffectFactName } from './card-effect-facts'

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
