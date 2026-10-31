import type { solo as es } from '../es/solo'
import type { Translated } from '../types'

export const solo: Translated<typeof es> = {
  'solo.subtitle': 'Pick who you play against: a bot with its deck, or your table with no bot.',
  'solo.rival': 'Who you play against',
  'solo.group.bots': 'Bots · each with its deck',
  'solo.group.noBot': 'No bot',
  'solo.last': 'Last played',
  'solo.botNeedsAuto': 'Needs automatic mode',
  'solo.noAuto': "This browser can't run automatic mode: bots don't play here. Passive and Handtraps go manual.",
  'solo.passive': "Doesn't play: only takes hits.",
  'solo.passiveManual': 'Your table, no opponent: you move everything.',
  'solo.lp': '{lp} LP',
  'solo.deckSize': 'Main {main} · Extra {extra}',
  'solo.sheet': 'Details & settings',
  'solo.play': 'Play vs {name}',
  'solo.playShort': 'Play',
  'solo.playHandtraps': 'Play vs the handtraps',
  'solo.playTable': 'Open your table',
  'solo.needDeck': 'Pick your deck',
} as const
