import type { auto as es } from '../es/auto'
import type { Translated } from '../types'

export const auto: Translated<typeof es> = {
  // The entry: the switch in the Play lobby, below the tiles.
  'auto.entry.switch': 'Automatic duel (beta)',
  'auto.entry.hint': "The rules engine applies the rules, solo or with a friend (in a private room). Solo, the opponent doesn't play its turn: it only uses the hand traps you give it.",
  // The passive opponent, said on the loading cover and in «More options».
  'auto.rival.passive': "The opponent doesn't play: it only receives. Use it to test your plays with the real rules.",
  // The opponent with the simulator's hand traps, on the loading cover.
  'auto.rival.handtraps': "The opponent doesn't play its turn: it uses its hand traps on its own, against what you do, when the rules allow it.",
  'auto.rival.responds': '{name} responds to {to}',

  // The engine's yes/no question, in the middle of the mat.
  'auto.ask.effect': "Activate {card}'s effect?",
  'auto.ask.kicker': 'Trigger effect',
  'auto.ask.effectAt': 'Activate the effect of {card} ({place})?',
  'auto.ask.afterOwn': 'After the {event} of {card} ({place}): activate its effect?',
  'auto.ask.after': 'After the {event} of {cards}: activate the effect of {card} ({place})?',
  'auto.ask.during': 'During the {phase}: activate the effect of {card} ({place})?',
  'auto.ask.event.normal': 'Normal Summon',
  'auto.ask.event.special': 'Special Summon',
  'auto.ask.event.flip': 'Flip Summon',
  'auto.ask.at.mz': 'in the Monster Zone',
  'auto.ask.at.emz': 'in the Extra Monster Zone',
  'auto.ask.at.st': 'in the Spell & Trap Zone',
  'auto.ask.at.field': 'in the Field Zone',
  'auto.ask.at.hand': 'in your hand',
  'auto.ask.at.gy': 'in the GY',
  'auto.ask.at.banished': 'banished',
  'auto.ask.at.deck': 'in the Deck',
  'auto.ask.at.extra': 'in the Extra Deck',
  'auto.ask.at.material': 'as Xyz Material',
  'auto.ask.what': 'What it does',
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
  'auto.pick.for': '{what} {why}',
  'auto.pick.count': '{chosen}/{max}',
  'auto.pick.why.tribute': 'to Tribute',
  'auto.pick.why.discard': 'to discard',
  'auto.pick.why.destroy': 'to destroy',
  'auto.pick.why.banish': 'to banish',
  'auto.pick.why.toGy': 'to send to the GY',
  'auto.pick.why.returnToHand': 'to return to the hand',
  'auto.pick.why.addToHand': 'to add to your hand',
  'auto.pick.why.toDeck': 'to return to the Deck',
  'auto.pick.why.normalSummon': 'to Normal Summon',
  'auto.pick.why.specialSummon': 'to Special Summon',
  'auto.pick.why.set': 'to Set',
  'auto.pick.why.fusion': 'as Fusion Material',
  'auto.pick.why.synchro': 'as Synchro Material',
  'auto.pick.why.detach': 'to detach',
  'auto.pick.why.reveal': 'to reveal',
  'auto.pick.why.place': 'to place on the field',
  'auto.pick.why.link': 'as Link Material',
  'auto.pick.why.target': 'as the target of the effect',
  'auto.band.from': '{place} · {count}',
  'auto.band.hint': 'Tap a card to choose it; tap it again to let it go.',
  'auto.pick.done': 'Done',
  'auto.pick.chosen': 'Chosen',
  'auto.phase.notYet': 'Not yet',

  // The chain link badge on a card («CL1»): the short form is shown; the card's name says it in words.
  'auto.link.badge': 'CL{numbers}',
  'auto.link.label': '{name}, chain link {numbers}',
  'auto.link.labelHand': '{name}, chain link {numbers}, activated from the hand',
  'auto.link.void': '{label}. {state}',

  // The top bar and «More options».
  'auto.bar.chain': 'Responses',
  'auto.bar.chainHint': 'Whether it asks you when you can respond to a chain.',
  'auto.bar.place': 'Zone',
  'auto.bar.placeHint': 'Where each card goes: you choose, or it goes to the first free one.',
  'auto.bar.ask': 'Ask',
  'auto.bar.never': 'Never',
  'auto.bar.auto': 'Automatic',
  // «New hand» (the bar) sets up another duel; this one repeats the same.
  'auto.bar.restart': 'Restart the same duel',
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
  'auto.lane.respondTo': 'You can respond to {card} with {cards}',
  'auto.lane.respondNow': 'You can activate {cards} now',
  'auto.lane.pass': "Don't respond",
  'auto.lane.mustActivate': 'You must activate {cards}: tap it',
  // Several mandatory ones at once: you pick which one enters the chain first (the band in the middle).
  'auto.forced.title': 'You must activate these {count}. Which goes first (CL{link})?',
  'auto.forced.activate': 'Activate {card} first',
  'auto.forced.hint': 'No “Don’t respond”: they’re mandatory.',
  'auto.lane.autoZone': 'The zone was picked for you',
  'auto.lane.unmapped': "The mat can't show: {what}",
  'auto.lane.script': "{card}'s script failed: the duel goes on.",
  'auto.lane.error': 'Something went wrong: {message}',

  // The chain notice (the pill above the mat and its list): how it goes and the state of each link.
  'auto.chain.title': 'Chain',
  'auto.chain.show': 'Show the chain',
  'auto.chain.hide': 'Hide the chain',
  'auto.chain.list': 'Chain links, in resolution order',
  'auto.chain.state.chained': 'Waiting',
  'auto.chain.state.solving': 'Resolving',
  'auto.chain.state.solved': 'Resolved',
  'auto.chain.state.negated': 'Negated',
  'auto.chain.state.disabled': 'No effect',
  // Negated or no effect, with the link that did it (the core doesn't say: the adapter works it out).
  'auto.chain.by': '{state} · by CL{by}',
  // Each link is tapped to read it in the detail: what the screen reader says.
  'auto.chain.linkMine': 'Chain Link {number}: {card}, yours. {state}',
  'auto.chain.linkTheirs': 'Chain Link {number}: {card}, your opponent’s. {state}',

  // Steps and combos (the practice panel): the empty list (no dragging or holding here) and reviewing a combo or your plays on the same mat, with the way back.
  'auto.steps.empty': 'Tap a card or the phase button to see what you can do. Every play is noted here.',
  // Chains in the steps list: the link of your activation, how it resolved and the closing line (every link, the rival's too).
  'auto.steps.link': 'Chain {chain} · CL{link}',
  'auto.steps.cost': 'Chain {chain} · CL{link} · cost',
  'auto.steps.noEffect': 'Resolves: no effect',
  'auto.steps.noEffectBy': 'Resolves: no effect · by CL{by}',
  'auto.steps.solvedStep': 'Resolves: step {step}',
  'auto.steps.solvedSteps': 'Resolves: steps {from}–{to}',
  'auto.steps.chainEnd': 'Chain {chain} resolved',
  'auto.steps.endLink': 'CL{link} {card}: {state}',
  'auto.steps.endLinkBy': 'CL{link} {card}: {state} by CL{by}',
  'auto.steps.theirs': '{card} ({rival})',
  'auto.review.combo': 'Reviewing “{name}”: the duel waits where you left it.',
  'auto.review.plays': 'Reviewing your plays: the duel waits where you left it.',
  'auto.review.back': 'Back to the duel',

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

  // The lobby switch in a browser that can't run the engine, and continuing the game on the manual table from «More options» (or from the engine error).
  'auto.entry.unsupported': "Your browser can't run the rules engine.",
  'auto.bar.manual': 'Continue in manual mode',
  'auto.bar.manualHint': 'The game continues on the manual table, with every option. If the automatic mode got something wrong, you can go back a few plays.',
  'auto.manual.text': 'The table stays as it is, with every option. If the automatic mode got something wrong, go back and redo those plays by hand.',
  'auto.manual.back': 'Go back',
  'auto.manual.none': 'Nothing: continue from here',
  'auto.manual.plays': { one: '{count} play', other: '{count} plays' },
  'auto.manual.rivalHand': "Only the opponent's hand of hand traps carries over: not their field or their graveyard.",
  'auto.manual.rivalNone': "The opponent doesn't carry over: the manual table is just yours.",
  'auto.manual.busy': 'Rebuilding the table…',
  'auto.manual.confirm': 'Continue in manual',

  // The automatic link duel: what the room tells whoever is waiting (below the deck), the line while the other one chooses and what cuts the duel short.
  'auto.online.waitingDeck': "Waiting for {name}'s deck…",
  'auto.online.checking': "Checking that both players' cards have rules…",
  'auto.online.blockedMine': { one: '{count} of your cards is missing its rules: swap it in the builder.', other: '{count} of your cards are missing their rules: swap them in the builder.' },
  'auto.online.blockedTheirs': { one: "{count} of {name}'s cards is missing its rules.", other: "{count} of {name}'s cards are missing their rules." },
  'auto.online.outdated': '{name} has to update the app to play with automatic rules.',
  'auto.online.version': "Your app and {name}'s aren't the same version: reload the page to play with automatic rules.",
  'auto.online.off': 'Automatic link duels are turned off for now.',
  'auto.online.data': "The duel's rules couldn't be downloaded: try again in a while.",
  'auto.online.rivalChoosing': '{name} is choosing…',
  'auto.online.lost': 'The duel was lost: the host reloaded the page.',
  'auto.online.cut': 'The duel was cut short: {name} sent invalid plays.',
  'auto.online.broken': "The duel was cut short and can't go on.",
  'auto.online.deckOutWin': "{name} couldn't draw.",

  // Going on with the link duel in manual mode (from «More options»): the row, the request to the other player, the wait and how it ended.
  'auto.online.manualTitle': 'Manual mode',
  'auto.online.manualHint': 'You ask {name}: if they agree, you both go on by hand, with the table as it is. Automatic comes back with the rematch.',
  'auto.online.manualControlHint': "Not right now: a card is under the other player's control.",
  'auto.online.manualAsk': 'Switch to manual',
  'auto.online.manualCancel': 'Cancel request',
  'auto.online.manualAsking': 'Waiting for {name} to agree to go on in manual mode…',
  'auto.online.manualAsked': '{name} wants to go on with the duel in manual mode: each of you moves your own cards by hand, with the table as it is.',
  'auto.online.manualKeep': 'Stay automatic',
  'auto.online.manualSwitching': 'Switching to manual mode…',
  'auto.online.manualDeclined': '{name} chose to stay automatic.',
  'auto.online.manualExpired': "{name} didn't answer: the duel stays automatic.",
  'auto.online.manualControl': "Couldn't switch to manual: a card is under the other player's control.",
  'auto.online.manualDone': 'You go on in manual mode: each of you moves your own cards.',
  'auto.online.manualDoneDropped': 'You go on in manual mode. What was half played was dropped: the table stayed as it was.',

  // A card of yours with no plays: why (only what is known), the shortcut to the manual table and the core's restrictions (the card's own text, as is).
  'auto.why.title': 'No plays right now',
  'auto.why.unknown': 'The automatic duel offers no plays for this card right now.',
  'auto.why.rivalTurn': "It's your opponent's turn.",
  'auto.why.summoned': 'You already Normal Summoned this turn.',
  'auto.why.set': 'You already Set a monster this turn.',
  'auto.why.monsterZones': 'Your five Monster Zones are taken.',
  'auto.why.spellZones': 'Your five Spell & Trap Zones are taken.',
  'auto.why.limitOf': 'A restriction from {card} applies.',
  'auto.why.mismatch': 'Not what you expected?',
  'auto.limits.label': { one: '{count} active restriction', other: '{count} active restrictions' },
}
