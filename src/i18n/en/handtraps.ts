import type { handtraps as es } from '../es/handtraps'
import type { Translated } from '../types'

export const handtraps: Translated<typeof es> = {
  // In the room rules, with Solo mode.
  'handtraps.title': "Opponent's hand traps",
  'handtraps.row.summary': '{count} in hand · pool of {pool}',
  'handtraps.row.choose': 'Choose…',
  'handtraps.row.chooseLabel': "Choose… the opponent's hand trap pool",

  // In the toolbar of the «Train solo» mat.
  'handtraps.mat.on': "Opponent's hand traps: on",
  'handtraps.mat.off': "Opponent's hand traps: off",

  // The pool sheet.
  'handtraps.picker.subtitle': 'Mark the ones they can draw and tap the type to change it.',
  'handtraps.picker.list': 'Hand trap pool',
  'handtraps.kind.repeatable': 'Repeatable · 3 copies',
  'handtraps.kind.single': 'Only one',
  'handtraps.kind.charmy': 'Charmy · max. 2 together',
  'handtraps.kind.change': 'Type of {name}: {kind}',
  'handtraps.picker.count': "In the opponent's hand",
  'handtraps.picker.max': 'With this pool the opponent can have at most {max}.',
  'handtraps.picker.empty': 'Choose at least one hand trap.',
  'handtraps.picker.use': 'Use this pool',
  'handtraps.picker.add': 'Add another card',
  'handtraps.picker.search': 'Search a card for the pool',
  'handtraps.picker.searchPlaceholder': 'Card name',
  'handtraps.picker.searching': 'Searching…',
  'handtraps.picker.noResults': 'No cards match “{query}”.',
  'handtraps.picker.addCard': 'Add {name} to the pool',
  'handtraps.picker.inPool': '{name} is already in the pool',
  'handtraps.picker.dealsNew': 'Applying deals a new hand.',
  'handtraps.picker.turnOff': 'Turn the simulator off',

  // The mat.
  'handtraps.strip.label': "Opponent's hand",
  'handtraps.strip.title': 'Opponent',
  'handtraps.strip.used': '{name}, used on step {step}',
  'handtraps.menu.use': 'Use now',
  'handtraps.menu.usedAt': 'Used on step {step}',
  'handtraps.step.used': 'The opponent used {card}',
} as const
