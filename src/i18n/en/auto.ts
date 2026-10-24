import type { auto as es } from '../es/auto'
import type { Translated } from '../types'

export const auto: Translated<typeof es> = {
  // The entry: the switch in the Play lobby, below the tiles.
  'auto.entry.switch': 'Automatic duel (beta)',
  'auto.entry.hint': "The rules engine applies the rules. You play; the opponent doesn't play its turn: it only uses the hand traps you give it.",
  // The passive opponent, said on the loading cover and in «More options».
  'auto.rival.passive': "The opponent doesn't play: it only receives. Use it to test your plays with the real rules.",
  // The opponent with the simulator's hand traps, on the loading cover.
  'auto.rival.handtraps': "The opponent doesn't play its turn: it uses its hand traps on its own, against what you do, when the rules allow it.",
  'auto.rival.responds': '{name} responds to {to}',

  // The engine's yes/no question, in the middle of the mat.
  'auto.ask.effect': "Activate {card}'s effect?",
  'auto.ask.fallback': 'Do you do it?',
  'auto.ask.skipEffect': "Don't activate",
  'auto.ask.yes': 'Do it',
  'auto.ask.no': "Don't do it",

  // The engine's options (a sheet): an option, the position, a number, Types or Attributes.
  'auto.options.option': 'Choose an option',
  'auto.options.position': 'Choose the position',
  'auto.options.number': 'Declare a number',
  'auto.options.race': { one: 'Declare {count} Type', other: 'Declare {count} Types' },
  'auto.options.attribute': { one: 'Declare {count} Attribute', other: 'Declare {count} Attributes' },
  'auto.options.declare': 'Declare',
  'auto.position.faceDownAttack': 'Face-down Attack Position',

  // Choosing cards from a list that is not on the field.
  'auto.picker.title': 'Choose cards',
  'auto.picker.cards': 'Cards to choose from',
  'auto.picker.choose': { one: 'Choose {count} card', other: 'Choose {count} cards' },
  'auto.picker.status': '{chosen} of {max}',

  // Ordering cards (the top of the deck).
  'auto.sort.title': 'Order the cards',
  'auto.sort.hint': 'Tap them in the order they go: the first one ends up on top.',
  'auto.sort.done': 'Use this order',
  'auto.sort.asIs': 'Keep the current order',

  // What is chosen on the mat (the status line below): zones and cards.
  'auto.pick.zone': { one: 'Choose {count} zone', other: 'Choose {count} zones' },
  'auto.pick.cards': { one: 'Choose {count} card', other: 'Choose {count} cards' },
  'auto.pick.range': 'Choose {min} to {max} cards',
  'auto.pick.tribute': 'Tributes: {chosen} of {total}',
  'auto.pick.sum': 'Levels: {chosen} of {total}',
  'auto.pick.counter': 'Counters: {chosen} of {total}',
  'auto.pick.attackTarget': 'Choose which monster to attack',
  'auto.pick.done': 'Done',
  'auto.pick.chosen': 'Chosen',
  'auto.phase.notYet': 'Not yet',

  // The top bar and «More options».
  'auto.bar.soundsHint': 'Plays and life points.',
  'auto.bar.chain': 'Responses',
  'auto.bar.chainHint': 'Whether it asks you when you can respond to a chain.',
  'auto.bar.place': 'Zone',
  'auto.bar.placeHint': 'Where each card goes: you choose, or it goes to the first free one.',
  'auto.bar.ask': 'Ask',
  'auto.bar.never': 'Never',
  'auto.bar.auto': 'Automatic',
  'auto.bar.restart': 'Restart the duel',
  'auto.bar.restartHint': 'The same duel from the start: the same cards, in the same order.',
  'auto.bar.handtrapsOn': '{cards} · {hand} in hand',
  'auto.bar.handtrapsOff': 'Off: the opponent uses nothing.',
  'auto.bar.handtrapsChange': 'Change hand traps',
  'auto.bar.blind': 'Blind',
  'auto.bar.blindHint': "The opponent's hand is face down: you see each card when it's used.",
  // The current ATK and DEF in the card detail, when they differ from the printed ones.
  'auto.dock.now': 'now {value}',

  // The log line: what the engine does, the chain and the notices that don't stop the duel.
  'auto.lane.thinking': 'The rules engine is resolving…',
  'auto.lane.rivalChoosing': 'The opponent is choosing',
  'auto.lane.chainLink': 'Chain {link}: {card}',
  'auto.lane.chain': 'Chain {link}: {card} responds to {to}',
  'auto.lane.resolve': '{card} resolves',
  'auto.lane.negated': 'Negated: {card}',
  'auto.lane.respondTo': 'You can respond to {card} with {cards}',
  'auto.lane.respondNow': 'You can activate {cards} now',
  'auto.lane.pass': "Don't respond",
  'auto.lane.mustActivate': 'You must activate {cards}: tap it',
  'auto.lane.autoZone': 'The zone was picked for you',
  'auto.lane.unmapped': "The mat can't show: {what}",
  'auto.lane.script': "{card}'s script failed: the duel goes on.",
  'auto.lane.error': 'Something went wrong: {message}',

  // The loading cover.
  'auto.loading.start': 'Setting up the duel…',
  'auto.loading.rules': "Loading your cards' rules… {done} of {total}",

  // The errors that don't let you play.
  'auto.fault.rules': { one: '{count} card is missing its rules', other: '{count} cards are missing their rules' },
  'auto.fault.rulesText': "The rules engine doesn't have their data or script: the automatic duel can't start with them.",
  'auto.fault.manual': 'Play in manual mode',
  'auto.fault.back': 'Back to the lobby',
  'auto.fault.setup': "The duel couldn't be created",
  'auto.fault.crash': 'The rules engine crashed',
  'auto.fault.retry': 'Try again',

  // The end (the title and life points use `duel.result.*`).
  'auto.end.again': 'Play again',
  'auto.end.deckOutWin': "The opponent couldn't draw.",
  'auto.end.deckOutLose': "You couldn't draw: your deck ran out.",
  'auto.end.effectWin': 'You won by a card effect.',
  'auto.end.effectLose': 'You lost by a card effect.',

  // The lobby switch in a browser that can't run the engine, and going back to the manual table from «More options».
  'auto.entry.unsupported': "Your browser can't run the rules engine.",
  'auto.bar.manual': 'Play in manual mode',
  'auto.bar.manualHint': 'Turns off the automatic rules and opens the manual table with the same deck.',
}
