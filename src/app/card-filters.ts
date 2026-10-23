import type { ApiCardReference, DeckFormat } from '../types'
import { POOL_BITS } from '../ygoprodeck/release'
import { EFFECT_BIT, effectMaskOf } from './card-effects'
import { getCardCopyLimit } from './deck-format'

/**
 * Los filtros de la búsqueda de cartas que se resuelven con los datos de la carta, sin pedirle nada a la API: marco, atributo, tipo de mágica o trampa, tipo de
 * monstruo, habilidades, límite de copias, efecto y estadísticas. Los grupos de chips se combinan así: dentro de un grupo vale cualquiera (Oscuridad **o** Luz), entre
 * grupos tienen que cumplirse todos (Oscuridad **y** Dragón). Todo es función pura de la carta: se prueba sin pantalla.
 */

/** Una cota mínima y una máxima, como las escribe quien filtra (texto de un campo numérico): vacía o no numérica, no pone cota. */
export interface NumberRange {
  min: string
  max: string
}

export const EMPTY_RANGE: NumberRange = { min: '', max: '' }

/** El marco de la carta, el color con el que viene impresa. Un péndulo es un marco aparte (mitad naranja, mitad celeste) sea cual sea su otra mitad. */
export const FRAME_KEYS = ['normal', 'effect', 'fusion', 'ritual', 'synchro', 'xyz', 'pendulum', 'link', 'spell', 'trap'] as const
export type FrameKey = (typeof FRAME_KEYS)[number]

/** Lo que dice el tipo de la carta: «Toon Monster», «Flip Effect Monster», «Union Effect Monster»… «Sin efecto» son los monstruos normales. */
export const ABILITY_KEYS = ['toon', 'gemini', 'union', 'spirit', 'tuner', 'flip', 'non-effect'] as const
export type AbilityKey = (typeof ABILITY_KEYS)[number]

/** Las cuatro formas de estar en una lista de prohibidas. */
export const LIMIT_KEYS = ['forbidden', 'limited', 'semi-limited', 'unlimited'] as const
export type LimitKey = (typeof LIMIT_KEYS)[number]

/** Mágicas y trampas por su subtipo: `spell:Quick-Play`, `trap:Counter`… (el subtipo viene en la raza de la carta). */
export const SPELL_TRAP_KINDS = ['spell:Normal', 'spell:Field', 'spell:Equip', 'spell:Continuous', 'spell:Quick-Play', 'spell:Ritual', 'trap:Normal', 'trap:Continuous', 'trap:Counter'] as const

// Los efectos, por lo que dice el texto de la carta, los resuelve `card-effects.ts` (con la medición de cuánto aciertan en el apéndice de `docs/motor-de-cartas.md`).
export { EFFECT_KEYS, effectMaskOf, matchesEffect, type EffectKey } from './card-effects'

/** De dónde se juega la carta: en qué formatos está. «Sólo TCG» y «sólo OCG» son las que existen en uno y no en el otro. */
export const POOL_KEYS = ['tcg', 'ocg', 'tcg-only', 'ocg-only', 'master-duel', 'duel-links', 'speed-duel'] as const
export type PoolKey = (typeof POOL_KEYS)[number]

const POOL_TESTS: Record<PoolKey, (pools: number) => boolean> = {
  tcg: (pools) => (pools & POOL_BITS.tcg) !== 0,
  ocg: (pools) => (pools & POOL_BITS.ocg) !== 0,
  'tcg-only': (pools) => (pools & POOL_BITS.tcg) !== 0 && (pools & POOL_BITS.ocg) === 0,
  'ocg-only': (pools) => (pools & POOL_BITS.ocg) !== 0 && (pools & POOL_BITS.tcg) === 0,
  'master-duel': (pools) => (pools & POOL_BITS['master-duel']) !== 0,
  'duel-links': (pools) => (pools & POOL_BITS['duel-links']) !== 0,
  'speed-duel': (pools) => (pools & POOL_BITS['speed-duel']) !== 0,
}

/** Los filtros de esta capa (los de texto —nombre, arquetipo, texto del efecto— y «ocultar prohibidas» los resuelve `card-search`). */
export interface LocalCardFilters {
  frames: string[]
  attributes: string[]
  spellTrapKinds: string[]
  races: string[]
  abilities: string[]
  limits: string[]
  pools: string[]
  effects: string[]
  level: NumberRange
  atk: NumberRange
  def: NumberRange
  scale: NumberRange
  genesysPoints: NumberRange
  year: NumberRange
}

type FilterableCard = Pick<ApiCardReference, 'frameType' | 'cardType' | 'race' | 'attribute' | 'level' | 'linkValue' | 'atk' | 'def' | 'description' | 'banlist' | 'genesys' | 'scale' | 'year' | 'pools'>

const isMonster = (card: Pick<ApiCardReference, 'cardType'>) => card.cardType.toLowerCase().includes('monster')

/** El marco de la carta (`FrameKey`), o lo que diga el dato si es otra cosa (una ficha, una carta de habilidad). */
export function frameOf(card: Pick<ApiCardReference, 'frameType'>): string {
  const frame = card.frameType.toLowerCase()

  return frame.includes('pendulum') ? 'pendulum' : frame
}

/** Las habilidades de la carta, por su tipo («Flip Effect Monster» → flip; «Normal Tuner Monster» → tuner y sin efecto). */
export function abilitiesOf(card: Pick<ApiCardReference, 'cardType'>): AbilityKey[] {
  const type = card.cardType.toLowerCase()

  if (!type.includes('monster')) {
    return []
  }

  return ABILITY_KEYS.filter((key) => (key === 'non-effect' ? type.includes('normal') : type.includes(key)))
}

/** `spell:Quick-Play`, `trap:Counter`…; nada si no es una mágica ni una trampa. */
export function spellTrapKindOf(card: Pick<ApiCardReference, 'cardType' | 'race'>): string | null {
  const type = card.cardType.toLowerCase()
  const family = type.includes('spell') ? 'spell' : type.includes('trap') ? 'trap' : null

  return family && card.race ? `${family}:${card.race}` : null
}

/** Cuántas copias deja la lista del formato, dicho como límite: prohibida (0), limitada (1), semi-limitada (2) o sin límite. */
export function limitOf(card: Pick<ApiCardReference, 'banlist' | 'cardType'> & Partial<ApiCardReference>, deckFormat: DeckFormat): LimitKey {
  const copies = getCardCopyLimit(card as ApiCardReference, deckFormat)

  return copies === 0 ? 'forbidden' : copies === 1 ? 'limited' : copies === 2 ? 'semi-limited' : 'unlimited'
}

/** Los formatos sin lista de prohibidas (el libre y Genesys, que limita por puntos) no tienen límite que filtrar. */
export const formatHasLimits = (deckFormat: DeckFormat) => deckFormat !== 'unlimited' && deckFormat !== 'genesys'

/** La cota escrita como número, o nada si está vacía o no es un número. */
function bound(value: string): number | null {
  const text = value.trim()

  return text === '' || !Number.isFinite(Number(text)) ? null : Number(text)
}

/** Un valor numérico dentro de las cotas (que no estén puestas, no cuentan). Con una cota puesta, una carta sin ese dato —o con «?»— queda afuera. */
export function inRange(value: number | null, range: NumberRange): boolean {
  const min = bound(range.min)
  const max = bound(range.max)

  if (min === null && max === null) {
    return true
  }

  return value !== null && (min === null || value >= min) && (max === null || value <= max)
}

export const isRangeActive = (range: NumberRange) => bound(range.min) !== null || bound(range.max) !== null

/** ATK y DEF vienen como texto: un número o «?» (y las cartas que no son monstruos, nada). */
function statOf(value: string | null): number | null {
  if (value === null) {
    return null
  }

  const stat = Number(value)

  return Number.isFinite(stat) ? stat : null
}

/** Los textos de un grupo de chips, sin importar mayúsculas: la API dice «DARK» y «Quick-Play»; las opciones, lo mismo, pero no se confía en eso. */
const lower = (values: readonly string[]) => values.map((value) => value.toLowerCase())

/** Cómo se pregunta por una carta: sin el `effectMask` lo calcula del texto; el índice del catálogo lo trae hecho (y ahí cuesta una sola vez, en rebanadas, no en cada búsqueda). */
export type LocalCardPredicate = (card: FilterableCard, effectMask?: number) => boolean

/**
 * Arma, una sola vez por búsqueda, la pregunta «¿cumple esta carta los filtros?»: pasa los chips a conjuntos, las cotas a números y los efectos a una máscara, así
 * recorrer las ~14,6 mil cartas del catálogo no vuelve a hacer nada de eso. Devuelve `null` si no hay ningún filtro de esta capa puesto (entonces no se mira la carta).
 */
export function compileLocalCardFilters(filters: LocalCardFilters, deckFormat: DeckFormat): LocalCardPredicate | null {
  const frames = new Set(filters.frames)
  const attributes = new Set(lower(filters.attributes))
  const kinds = new Set(lower(filters.spellTrapKinds))
  const races = new Set(lower(filters.races))
  const abilities = new Set<string>(filters.abilities)
  const limits = formatHasLimits(deckFormat) ? new Set<string>(filters.limits) : new Set<string>()
  const pools = POOL_KEYS.filter((key) => filters.pools.includes(key)).map((key) => POOL_TESTS[key])
  const wanted = filters.effects.reduce((mask, key) => mask | (EFFECT_BIT[key as keyof typeof EFFECT_BIT] ?? 0), 0)
  const useGenesys = deckFormat === 'genesys' && isRangeActive(filters.genesysPoints)
  const useRange = [filters.level, filters.atk, filters.def, filters.scale, filters.year].some(isRangeActive)
  const active = frames.size > 0 || attributes.size > 0 || kinds.size > 0 || races.size > 0 || abilities.size > 0 || limits.size > 0 || pools.length > 0 || wanted !== 0 || useRange || useGenesys

  if (!active) {
    return null
  }

  return (card, effectMask) => {
    if (frames.size > 0 && !frames.has(frameOf(card))) {
      return false
    }

    if (attributes.size > 0 && !attributes.has((card.attribute ?? '').toLowerCase())) {
      return false
    }

    if (kinds.size > 0 && !kinds.has((spellTrapKindOf(card) ?? '').toLowerCase())) {
      return false
    }

    if (races.size > 0 && !(isMonster(card) && races.has((card.race ?? '').toLowerCase()))) {
      return false
    }

    if (abilities.size > 0 && !abilitiesOf(card).some((ability) => abilities.has(ability))) {
      return false
    }

    if (limits.size > 0 && !limits.has(limitOf(card, deckFormat))) {
      return false
    }

    // Una carta que llegó sin los formatos (no vino del catálogo) no se puede ubicar en ninguno: queda afuera.
    if (pools.length > 0 && !pools.some((test) => test(card.pools ?? 0))) {
      return false
    }

    if (wanted !== 0 && (wanted & (effectMask ?? effectMaskOf(card.description))) === 0) {
      return false
    }

    if (!inRange(isMonster(card) ? (card.level ?? card.linkValue) : null, filters.level)) {
      return false
    }

    if (!inRange(statOf(card.atk), filters.atk) || !inRange(statOf(card.def), filters.def)) {
      return false
    }

    if (!inRange(card.scale ?? null, filters.scale) || !inRange(card.year ?? null, filters.year)) {
      return false
    }

    return !useGenesys || inRange(card.genesys.points, filters.genesysPoints)
  }
}

/** ¿Hay algún filtro de esta capa puesto? */
export const hasLocalFilters = (filters: LocalCardFilters, deckFormat: DeckFormat) => compileLocalCardFilters(filters, deckFormat) !== null

/** Una sola carta contra los filtros (para pocas cartas, como lo que devuelve la API; el catálogo entero usa `compileLocalCardFilters`). */
export const matchesLocalCardFilters = (card: FilterableCard, filters: LocalCardFilters, deckFormat: DeckFormat) => (compileLocalCardFilters(filters, deckFormat)?.(card) ?? true)
