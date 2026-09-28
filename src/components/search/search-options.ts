import type { SearchQuickTypeFilter } from '../../app/card-search'

export interface FilterOption {
  value: string
  label: string
}

export interface FilterOptionGroup {
  label: string
  options: FilterOption[]
}

export interface QuickTypeMeta {
  exactTypeLabel: string
  raceLabel: string
  levelLabel: string
  showAttribute: boolean
  showLevel: boolean
}

export type SearchSortOrder = 'default' | 'name-asc' | 'name-desc'

export const QUICK_TYPE_OPTIONS: Array<{ value: SearchQuickTypeFilter; label: string }> = [
  { value: 'all', label: 'Todas' },
  { value: 'monster', label: 'Monstruos' },
  { value: 'spell', label: 'Magias' },
  { value: 'trap', label: 'Trampas' },
]

export const QUICK_TYPE_META: Record<SearchQuickTypeFilter, QuickTypeMeta> = {
  all: {
    exactTypeLabel: 'Tipo exacto',
    raceLabel: 'Raza / subtipo',
    levelLabel: 'Nivel / rango',
    showAttribute: true,
    showLevel: true,
  },
  monster: {
    exactTypeLabel: 'Tipo de monstruo',
    raceLabel: 'Raza',
    levelLabel: 'Nivel / rango',
    showAttribute: true,
    showLevel: true,
  },
  spell: {
    exactTypeLabel: 'Tipo de carta',
    raceLabel: 'Subtipo',
    levelLabel: 'Nivel / rango',
    showAttribute: false,
    showLevel: false,
  },
  trap: {
    exactTypeLabel: 'Tipo de carta',
    raceLabel: 'Subtipo',
    levelLabel: 'Nivel / rango',
    showAttribute: false,
    showLevel: false,
  },
}

export const SEARCH_SORT_OPTIONS: Array<{ value: SearchSortOrder; label: string }> = [
  { value: 'default', label: 'Orden base' },
  { value: 'name-asc', label: 'Nombre A-Z' },
  { value: 'name-desc', label: 'Nombre Z-A' },
]

export const ATTRIBUTE_OPTIONS: FilterOption[] = [
  { value: '', label: 'Cualquiera' },
  { value: 'DARK', label: 'DARK' },
  { value: 'LIGHT', label: 'LIGHT' },
  { value: 'FIRE', label: 'FIRE' },
  { value: 'WATER', label: 'WATER' },
  { value: 'EARTH', label: 'EARTH' },
  { value: 'WIND', label: 'WIND' },
  { value: 'DIVINE', label: 'DIVINE' },
]

const MONSTER_EXACT_TYPE_OPTIONS: FilterOption[] = [
  { value: 'Normal Monster', label: 'Normal Monster' },
  { value: 'Normal Tuner Monster', label: 'Normal Tuner Monster' },
  { value: 'Effect Monster', label: 'Effect Monster' },
  { value: 'Tuner Monster', label: 'Tuner Monster' },
  { value: 'Flip Monster', label: 'Flip Monster' },
  { value: 'Flip Effect Monster', label: 'Flip Effect Monster' },
  { value: 'Spirit Monster', label: 'Spirit Monster' },
  { value: 'Union Effect Monster', label: 'Union Effect Monster' },
  { value: 'Gemini Monster', label: 'Gemini Monster' },
  { value: 'Pendulum Effect Monster', label: 'Pendulum Effect Monster' },
  { value: 'Pendulum Normal Monster', label: 'Pendulum Normal Monster' },
  { value: 'Pendulum Effect Ritual Monster', label: 'Pendulum Effect Ritual Monster' },
  { value: 'Pendulum Tuner Effect Monster', label: 'Pendulum Tuner Effect Monster' },
  { value: 'Ritual Monster', label: 'Ritual Monster' },
  { value: 'Ritual Effect Monster', label: 'Ritual Effect Monster' },
  { value: 'Toon Monster', label: 'Toon Monster' },
  { value: 'Fusion Monster', label: 'Fusion Monster' },
  { value: 'Synchro Monster', label: 'Synchro Monster' },
  { value: 'Synchro Tuner Monster', label: 'Synchro Tuner Monster' },
  { value: 'Synchro Pendulum Effect Monster', label: 'Synchro Pendulum Effect Monster' },
  { value: 'XYZ Monster', label: 'XYZ Monster' },
  { value: 'XYZ Pendulum Effect Monster', label: 'XYZ Pendulum Effect Monster' },
  { value: 'Link Monster', label: 'Link Monster' },
  { value: 'Pendulum Flip Effect Monster', label: 'Pendulum Flip Effect Monster' },
  { value: 'Pendulum Effect Fusion Monster', label: 'Pendulum Effect Fusion Monster' },
]

const SPELL_TRAP_EXACT_TYPE_OPTIONS: FilterOption[] = [
  { value: 'Spell Card', label: 'Spell Card' },
  { value: 'Trap Card', label: 'Trap Card' },
]

const OTHER_EXACT_TYPE_OPTIONS: FilterOption[] = [
  { value: 'Skill Card', label: 'Skill Card' },
  { value: 'Token', label: 'Token' },
]

const MONSTER_RACE_OPTIONS: FilterOption[] = [
  { value: 'Aqua', label: 'Aqua' },
  { value: 'Beast', label: 'Beast' },
  { value: 'Beast-Warrior', label: 'Beast-Warrior' },
  { value: 'Creator God', label: 'Creator God' },
  { value: 'Cyberse', label: 'Cyberse' },
  { value: 'Dinosaur', label: 'Dinosaur' },
  { value: 'Divine-Beast', label: 'Divine-Beast' },
  { value: 'Dragon', label: 'Dragon' },
  { value: 'Fairy', label: 'Fairy' },
  { value: 'Fiend', label: 'Fiend' },
  { value: 'Fish', label: 'Fish' },
  { value: 'Illusion', label: 'Illusion' },
  { value: 'Insect', label: 'Insect' },
  { value: 'Machine', label: 'Machine' },
  { value: 'Plant', label: 'Plant' },
  { value: 'Psychic', label: 'Psychic' },
  { value: 'Pyro', label: 'Pyro' },
  { value: 'Reptile', label: 'Reptile' },
  { value: 'Rock', label: 'Rock' },
  { value: 'Sea Serpent', label: 'Sea Serpent' },
  { value: 'Spellcaster', label: 'Spellcaster' },
  { value: 'Thunder', label: 'Thunder' },
  { value: 'Warrior', label: 'Warrior' },
  { value: 'Winged Beast', label: 'Winged Beast' },
  { value: 'Wyrm', label: 'Wyrm' },
  { value: 'Zombie', label: 'Zombie' },
]

const SPELL_RACE_OPTIONS: FilterOption[] = [
  { value: 'Normal', label: 'Normal' },
  { value: 'Continuous', label: 'Continuous' },
  { value: 'Equip', label: 'Equip' },
  { value: 'Field', label: 'Field' },
  { value: 'Quick-Play', label: 'Quick-Play' },
  { value: 'Ritual', label: 'Ritual' },
]

const TRAP_RACE_OPTIONS: FilterOption[] = [
  { value: 'Normal', label: 'Normal' },
  { value: 'Continuous', label: 'Continuous' },
  { value: 'Counter', label: 'Counter' },
]

export function getExactTypeFilterGroups(quickType: SearchQuickTypeFilter): FilterOptionGroup[] {
  if (quickType === 'monster') {
    return [{ label: 'Monstruos', options: MONSTER_EXACT_TYPE_OPTIONS }]
  }

  if (quickType === 'spell') {
    return [
      {
        label: 'Magias',
        options: SPELL_TRAP_EXACT_TYPE_OPTIONS.filter((option) => option.value === 'Spell Card'),
      },
    ]
  }

  if (quickType === 'trap') {
    return [
      {
        label: 'Trampas',
        options: SPELL_TRAP_EXACT_TYPE_OPTIONS.filter((option) => option.value === 'Trap Card'),
      },
    ]
  }

  return [
    { label: 'Monstruos', options: MONSTER_EXACT_TYPE_OPTIONS },
    { label: 'Spell / Trap', options: SPELL_TRAP_EXACT_TYPE_OPTIONS },
    { label: 'Otros', options: OTHER_EXACT_TYPE_OPTIONS },
  ]
}

export function getRaceFilterGroups(quickType: SearchQuickTypeFilter): FilterOptionGroup[] {
  if (quickType === 'spell') {
    return [{ label: 'Magias', options: SPELL_RACE_OPTIONS }]
  }

  if (quickType === 'trap') {
    return [{ label: 'Trampas', options: TRAP_RACE_OPTIONS }]
  }

  if (quickType === 'monster') {
    return [{ label: 'Monstruos', options: MONSTER_RACE_OPTIONS }]
  }

  return [
    { label: 'Monstruos', options: MONSTER_RACE_OPTIONS },
    { label: 'Magias', options: SPELL_RACE_OPTIONS },
    { label: 'Trampas', options: TRAP_RACE_OPTIONS },
  ]
}

export function collectFilterValues(groups: FilterOptionGroup[]): Set<string> {
  return new Set(groups.flatMap((group) => group.options.map((option) => option.value)))
}
