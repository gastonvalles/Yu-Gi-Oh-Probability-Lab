import type { handtraps as es } from '../es/handtraps'
import type { Translated } from '../types'

export const handtraps: Translated<typeof es> = {
  // In the room rules, with Solo mode.
  'handtraps.title': "Opponent's hand traps",
  'handtraps.row.summary': '{count} in hand',
  'handtraps.row.empty': 'None chosen',
  'handtraps.row.choose': 'Choose…',
  'handtraps.row.chooseLabel': "Choose… the hand traps in the opponent's hand",

  // In the toolbar of the «Train solo» mat.
  'handtraps.mat.on': "Opponent's hand traps: on",
  'handtraps.mat.off': "Opponent's hand traps: off",

  // The sheet: how many copies of each one the opponent has in hand.
  'handtraps.picker.subtitle': 'Choose how many copies of each one they have in hand.',
  'handtraps.picker.list': "Hand traps for the opponent's hand",
  'handtraps.picker.copies': "Copies of {name} in the opponent's hand",
  'handtraps.picker.count': "In the opponent's hand: {count}",
  'handtraps.picker.cap': 'At most {max} in hand.',
  'handtraps.picker.empty': 'Add at least one hand trap.',
  'handtraps.picker.use': 'Use this hand',
  'handtraps.picker.add': 'Add another card',
  'handtraps.picker.search': 'Search another card',
  'handtraps.picker.searchPlaceholder': 'Card name',
  'handtraps.picker.searching': 'Searching…',
  'handtraps.picker.noResults': 'No cards match “{query}”.',
  'handtraps.picker.addCard': 'Add {name} to the list',
  'handtraps.picker.listed': '{name} is already on the list',
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
