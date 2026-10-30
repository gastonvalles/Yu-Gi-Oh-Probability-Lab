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
  'handtraps.picker.dominus': 'With {dominus}, the rival can no longer use {cards} afterwards.',
  'handtraps.picker.turnOff': 'Turn the simulator off',

  // Automatic duel: the opponent's Extra Deck, in order of preference for costs (Fydraulis Harmonia reveals Synchros from it).
  'handtraps.extra.title': "Opponent's Extra Deck",
  'handtraps.extra.count': '{count} of {max}',
  'handtraps.extra.hint': 'It pays costs with the first one that fits. It never summons them.',
  'handtraps.extra.empty': 'No Extra Deck: the opponent plays without one.',
  'handtraps.extra.needs': "{name} needs a {kind} in the Extra Deck; without one it won't use it.",
  'handtraps.extra.list': "Opponent's Extra Deck, in order of preference",
  'handtraps.extra.kind.fusion': 'Fusion',
  'handtraps.extra.kind.synchro': 'Synchro',
  'handtraps.extra.kind.xyz': 'Xyz',
  'handtraps.extra.kind.link': 'Link',
  'handtraps.extra.up': 'Move {name} up',
  'handtraps.extra.down': 'Move {name} down',
  'handtraps.extra.remove': 'Remove {name} from the Extra Deck',
  'handtraps.extra.reset': 'Reset the Extra Deck',
  'handtraps.extra.search': 'Search for an Extra Deck monster',
  'handtraps.extra.noResults': 'No Extra Deck monsters match “{query}”.',
  'handtraps.extra.full': 'The Extra Deck is full ({max}): remove one to add another.',
  'handtraps.extra.add': 'Add {name} to the Extra Deck',
  'handtraps.extra.capped': '{name} already has {max} copies',
  'handtraps.extra.copies': { one: '{count} copy in the Extra', other: '{count} copies in the Extra' },

  // The mat.
  'handtraps.strip.label': "Opponent's hand",
  'handtraps.strip.used': '{name}, used on step {step}',
  'handtraps.strip.usedMark': 'Used',
  'handtraps.strip.step': 'Step {step}',
  'handtraps.menu.use': 'Use now',
  'handtraps.menu.usedAt': 'Used on step {step}',
  'handtraps.step.used': 'The opponent used {card}',
} as const
