import type { handtraps as es } from '../es/handtraps'
import type { Translated } from '../types'

export const handtraps: Translated<typeof es> = {
  // In the room rules, with Solo mode.
  'handtraps.title': "Opponent's hand traps",
  'handtraps.row.summary': { one: '{hand} in hand · from {count} card', other: '{hand} in hand · from {count} cards' },
  'handtraps.row.choose': 'Choose…',
  'handtraps.row.chooseLabel': "Choose… the opponent's hand traps",

  // In the ⋯ menu of the mat toolbar: how the simulator is set.
  'handtraps.mat.on': 'on',
  'handtraps.mat.off': 'off',

  // The sheet: how many copies of each one the opponent has in their deck and how many cards they hold (dealt at random).
  'handtraps.picker.subtitle': 'Choose how many copies of each one the opponent has; their hand is dealt at random.',
  'handtraps.picker.list': 'Hand traps the opponent can have',
  'handtraps.picker.copies': "Copies of {name} in the opponent's deck",
  'handtraps.picker.hand': "Cards in the opponent's hand",
  'handtraps.picker.pool': { one: 'Dealt at random from {count} card.', other: 'Dealt at random from {count} cards.' },
  'handtraps.picker.short': 'With these cards the hand comes out with {count}.',
  'handtraps.picker.empty': 'Choose at least one card.',
  'handtraps.picker.use': 'Use these hand traps',
  'handtraps.picker.add': 'Add another card',
  'handtraps.picker.search': 'Search another card',
  'handtraps.picker.searchPlaceholder': 'Card name',
  'handtraps.picker.searching': 'Searching…',
  'handtraps.picker.noResults': 'No cards match “{query}”.',
  'handtraps.picker.addCard': 'Add {name} to the list',
  'handtraps.picker.listed': '{name} is already on the list',
  'handtraps.picker.dealsNew': 'Applying deals a new hand.',
  'handtraps.picker.restarts': 'Applying restarts the duel.',
  'handtraps.picker.notAuto': "It doesn't use it on its own yet",
  'handtraps.picker.turnOff': 'Turn the simulator off',

  // The mat.
  'handtraps.strip.label': "Opponent's hand",
  'handtraps.strip.used': '{name}, used on step {step}',
  'handtraps.strip.usedMark': 'Used',
  'handtraps.strip.step': 'Step {step}',
  'handtraps.menu.use': 'Use now',
  'handtraps.menu.usedAt': 'Used on step {step}',
  'handtraps.step.used': 'The opponent used {card}',
} as const
