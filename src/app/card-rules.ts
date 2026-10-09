import { CARD_RULE, type CardRuleFlag } from './card-script-rules'

/**
 * Las reglas de cada carta (bits de CARD_RULE por id), destiladas de los scripts de EDOPro por
 * scripts/sync-meta-decks.mjs en src/data/card-rules.json. El JSON agrupa los ids por valor de bits para
 * pesar menos; se baja una vez, al abrir la app, y hasta que llega el clasificador usa el texto de la carta.
 */
export interface CardRulesData {
  scripts: string
  cards: Record<string, number[]>
}

let flagsById: ReadonlyMap<number, number> | null = null
let loading: Promise<void> | null = null

export function indexCardRules(data: CardRulesData): Map<number, number> {
  const index = new Map<number, number>()

  for (const [flags, ids] of Object.entries(data.cards)) {
    for (const id of ids) {
      index.set(id, Number(flags))
    }
  }

  return index
}

export function loadCardRules(): Promise<void> {
  loading ??= import('../data/card-rules.json')
    .then((module) => {
      flagsById = indexCardRules(module.default as CardRulesData)
    })
    .catch((error: unknown) => {
      console.warn('No se pudieron cargar las reglas de las cartas; se clasifica por texto.', error)
      loading = null
    })

  return loading
}

/** Los bits de la carta, o undefined si no tiene script (monstruos normales, cartas nuevas, artes alternativas). */
export function getCardRuleFlags(ygoprodeckId: number): number | undefined {
  return flagsById?.get(ygoprodeckId)
}

export function hasCardRule(flags: number, flag: CardRuleFlag): boolean {
  return (flags & CARD_RULE[flag]) !== 0
}

export function setCardRulesForTests(index: ReadonlyMap<number, number> | null): void {
  flagsById = index
}
