import { ABILITY_KEYS, EFFECT_KEYS, FRAME_KEYS, LIMIT_KEYS, SPELL_TRAP_KINDS } from '../../app/card-filters'
import { t } from '../../i18n'
import type { MessageArgs, MessageKey } from '../../i18n/types'

/** Las claves de mensajes que no piden parámetros: las únicas que sirven de rótulo fijo de una opción. */
type PlainMessageKey = { [K in MessageKey]: MessageArgs<K> extends [] ? K : never }[MessageKey]

export interface FilterOption {
  value: string
  label: string
}

export type SearchSortOrder = 'default' | 'name-asc' | 'name-desc'

/** Una opción con su rótulo como getter: el texto se arma al leerlo (en el idioma de ese momento), no al evaluar el módulo. */
function option(value: string, key: PlainMessageKey): FilterOption {
  return {
    value,
    get label() {
      return t(key)
    },
  }
}

export const SEARCH_SORT_OPTIONS: Array<{ value: SearchSortOrder; label: string }> = [
  { value: 'default', get label() { return t('search.sort.default') } },
  { value: 'name-asc', get label() { return t('search.sort.nameAsc') } },
  { value: 'name-desc', get label() { return t('search.sort.nameDesc') } },
]

// Los rótulos salen del catálogo de textos por clave: una clave que falta no compila.
const FRAME_LABELS = {
  normal: 'search.frame.normal',
  effect: 'search.frame.effect',
  fusion: 'search.frame.fusion',
  ritual: 'search.frame.ritual',
  synchro: 'search.frame.synchro',
  xyz: 'search.frame.xyz',
  pendulum: 'search.frame.pendulum',
  link: 'search.frame.link',
  spell: 'search.frame.spell',
  trap: 'search.frame.trap',
} as const satisfies Record<(typeof FRAME_KEYS)[number], PlainMessageKey>

const KIND_LABELS = {
  'spell:Normal': 'search.kind.spellNormal',
  'spell:Field': 'search.kind.spellField',
  'spell:Equip': 'search.kind.spellEquip',
  'spell:Continuous': 'search.kind.spellContinuous',
  'spell:Quick-Play': 'search.kind.spellQuickPlay',
  'spell:Ritual': 'search.kind.spellRitual',
  'trap:Normal': 'search.kind.trapNormal',
  'trap:Continuous': 'search.kind.trapContinuous',
  'trap:Counter': 'search.kind.trapCounter',
} as const satisfies Record<(typeof SPELL_TRAP_KINDS)[number], PlainMessageKey>

const ABILITY_LABELS = {
  toon: 'search.ability.toon',
  gemini: 'search.ability.gemini',
  union: 'search.ability.union',
  spirit: 'search.ability.spirit',
  tuner: 'search.ability.tuner',
  flip: 'search.ability.flip',
  'non-effect': 'search.ability.nonEffect',
} as const satisfies Record<(typeof ABILITY_KEYS)[number], PlainMessageKey>

const LIMIT_LABELS = {
  forbidden: 'search.limit.forbidden',
  limited: 'search.limit.limited',
  'semi-limited': 'search.limit.semiLimited',
  unlimited: 'search.limit.unlimited',
} as const satisfies Record<(typeof LIMIT_KEYS)[number], PlainMessageKey>

const EFFECT_LABELS = {
  search: 'search.effect.search',
  draw: 'search.effect.draw',
  'special-summon': 'search.effect.specialSummon',
  banish: 'search.effect.banish',
  graveyard: 'search.effect.graveyard',
  'back-to-hand': 'search.effect.backToHand',
  'back-to-deck': 'search.effect.backToDeck',
  'destroy-monster': 'search.effect.destroyMonster',
  'destroy-spell-trap': 'search.effect.destroySpellTrap',
  negate: 'search.effect.negate',
  token: 'search.effect.token',
  control: 'search.effect.control',
  damage: 'search.effect.damage',
  recover: 'search.effect.recover',
} as const satisfies Record<(typeof EFFECT_KEYS)[number], PlainMessageKey>

/** Los grupos del cajón de filtros, en el orden en que se muestran. */
export const FRAME_OPTIONS: FilterOption[] = FRAME_KEYS.map((key) => option(key, FRAME_LABELS[key]))
export const SPELL_TRAP_OPTIONS: FilterOption[] = SPELL_TRAP_KINDS.map((key) => option(key, KIND_LABELS[key]))
export const ABILITY_OPTIONS: FilterOption[] = ABILITY_KEYS.map((key) => option(key, ABILITY_LABELS[key]))
export const LIMIT_OPTIONS: FilterOption[] = LIMIT_KEYS.map((key) => option(key, LIMIT_LABELS[key]))
export const EFFECT_OPTIONS: FilterOption[] = EFFECT_KEYS.map((key) => option(key, EFFECT_LABELS[key]))

export const ATTRIBUTE_OPTIONS: FilterOption[] = ['DARK', 'LIGHT', 'FIRE', 'WATER', 'EARTH', 'WIND', 'DIVINE'].map((value) => ({ value, label: value }))

/** Los tipos de monstruo (Dragón, Guerrero…) con el nombre del juego, que es el de la carta. */
export const MONSTER_RACE_OPTIONS: FilterOption[] = [
  'Aqua',
  'Beast',
  'Beast-Warrior',
  'Creator God',
  'Cyberse',
  'Dinosaur',
  'Divine-Beast',
  'Dragon',
  'Fairy',
  'Fiend',
  'Fish',
  'Illusion',
  'Insect',
  'Machine',
  'Plant',
  'Psychic',
  'Pyro',
  'Reptile',
  'Rock',
  'Sea Serpent',
  'Spellcaster',
  'Thunder',
  'Warrior',
  'Winged Beast',
  'Wyrm',
  'Zombie',
].map((value) => ({ value, label: value }))

/** El rótulo de un valor de un grupo (para el chip del filtro activo); si no se conoce, el valor tal cual. */
export function labelOf(options: FilterOption[], value: string): string {
  return options.find((candidate) => candidate.value === value)?.label ?? value
}
