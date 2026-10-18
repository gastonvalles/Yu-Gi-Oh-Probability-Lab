import type { ApiCardReference, DeckFormat } from '../types'
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

/**
 * Efectos por lo que dice el texto de la carta (en inglés). Son heurísticas sobre el texto: aciertan en lo común y pueden dejar afuera una carta con una redacción
 * rara o sumar una que lo menciona de pasada; por eso la pantalla los llama «según el texto de la carta».
 */
export const EFFECT_PATTERNS = {
  search: /\badd\b[^.]*\bfrom your deck\b[^.]*\bto your hand\b/i,
  draw: /\bdraws?\b[^.]*\bcards?\b/i,
  'special-summon': /\bspecial summon/i,
  banish: /\bbanish/i,
  graveyard: /\b(graveyard|gy)\b/i,
  'back-to-hand': /\breturn(s|ed)?\b[^.]*\bto the hand\b/i,
  'back-to-deck': /\b(return(s|ed)?|shuffle)\b[^.]*\b(into|to) the (extra )?deck\b/i,
  'destroy-monster': /\bdestroy\b[^.]*\bmonsters?\b/i,
  'destroy-spell-trap': /\bdestroy\b[^.]*\b(spells?|traps?)\b/i,
  negate: /\bnegat(e|es|ed|ing)\b/i,
  token: /\btokens?\b/i,
  control: /\btake control\b/i,
  damage: /\binflict\b[^.]*\bdamage\b/i,
  recover: /\bgain\b[^.]*\bLP\b/i,
} as const satisfies Record<string, RegExp>
export type EffectKey = keyof typeof EFFECT_PATTERNS
export const EFFECT_KEYS = Object.keys(EFFECT_PATTERNS) as EffectKey[]

/** Los filtros de esta capa (los de texto —nombre, arquetipo, texto del efecto— y «ocultar prohibidas» los resuelve `card-search`). */
export interface LocalCardFilters {
  frames: string[]
  attributes: string[]
  spellTrapKinds: string[]
  races: string[]
  abilities: string[]
  limits: string[]
  effects: string[]
  level: NumberRange
  atk: NumberRange
  def: NumberRange
  genesysPoints: NumberRange
}

type FilterableCard = Pick<ApiCardReference, 'frameType' | 'cardType' | 'race' | 'attribute' | 'level' | 'linkValue' | 'atk' | 'def' | 'description' | 'banlist' | 'genesys'>

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

/** Un bit por efecto, en el orden de `EFFECT_KEYS` (son menos de 16): la carta guarda cuáles cumple y filtrar por efecto es un AND. */
const EFFECT_BIT: Record<string, number> = Object.fromEntries(EFFECT_KEYS.map((key, index) => [key, 1 << index]))

/** Qué efectos dice el texto de la carta, como máscara de bits. Cuesta una pasada de expresiones por carta: el índice del catálogo la hace una sola vez (en rebanadas), no en cada búsqueda. */
export function effectMaskOf(description: string | null): number {
  const text = description ?? ''
  let mask = 0

  for (const key of EFFECT_KEYS) {
    if (EFFECT_PATTERNS[key].test(text)) {
      mask |= EFFECT_BIT[key]!
    }
  }

  return mask
}

/** Cómo se pregunta por una carta: sin el `effectMask` lo calcula del texto; el índice del catálogo lo trae hecho. */
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
  const wanted = filters.effects.reduce((mask, key) => mask | (EFFECT_BIT[key] ?? 0), 0)
  const useGenesys = deckFormat === 'genesys' && isRangeActive(filters.genesysPoints)
  const active =
    frames.size > 0 || attributes.size > 0 || kinds.size > 0 || races.size > 0 || abilities.size > 0 || limits.size > 0 || wanted !== 0 || isRangeActive(filters.level) || isRangeActive(filters.atk) || isRangeActive(filters.def) || useGenesys

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

    if (wanted !== 0 && (wanted & (effectMask ?? effectMaskOf(card.description))) === 0) {
      return false
    }

    if (!inRange(isMonster(card) ? (card.level ?? card.linkValue) : null, filters.level)) {
      return false
    }

    if (!inRange(statOf(card.atk), filters.atk) || !inRange(statOf(card.def), filters.def)) {
      return false
    }

    return !useGenesys || inRange(card.genesys.points, filters.genesysPoints)
  }
}

/** ¿Hay algún filtro de esta capa puesto? */
export const hasLocalFilters = (filters: LocalCardFilters, deckFormat: DeckFormat) => compileLocalCardFilters(filters, deckFormat) !== null

/** Una sola carta contra los filtros (para pocas cartas, como lo que devuelve la API; el catálogo entero usa `compileLocalCardFilters`). */
export const matchesLocalCardFilters = (card: FilterableCard, filters: LocalCardFilters, deckFormat: DeckFormat) => (compileLocalCardFilters(filters, deckFormat)?.(card) ?? true)
