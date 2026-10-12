import type { rules as es } from '../es/rules'
import type { Translated } from '../types'

export const rules: Translated<typeof es> = {
  // Checks before calculating (they also run in the worker: `t()` reads the worker's language).
  'rules.validation.deckSizeInvalid': 'The deck size must be a positive integer.',
  'rules.validation.handSizeInvalid': 'The opening hand size must be a positive integer.',
  'rules.validation.deckTooSmall': 'The Main Deck must have at least 40 cards to calculate the exact probability.',
  'rules.validation.deckTooBig': 'In Yu-Gi-Oh! the Main Deck is usually between 40 and 60 cards.',
  'rules.validation.handBiggerThanDeck': "The opening hand can't be larger than the deck.",
  'rules.validation.noCards': 'Add at least one card or group of cards.',
  'rules.validation.missingOrigin': 'Some cards are unclassified (origin). Review them in Role categorization.',
  'rules.validation.missingRoles': 'Some cards are unclassified (roles). Review them in Role categorization.',
  'rules.validation.pendingReview': 'Some cards have a classification pending review. Review them in Role categorization.',
  'rules.validation.cardNeedsName': 'Every card or group must have a name.',
  'rules.validation.duplicateName': 'The name "{name}" is repeated. Use unique names to avoid ambiguity.',
  'rules.validation.copiesInvalid': 'The number of copies of "{name}" must be an integer greater than or equal to 0.',
  'rules.validation.copiesOverDeck': 'The sum of the defined copies exceeds the deck size.',
  'rules.validation.missingCopies': {
    one: 'Missing {count} card. It will be treated as "Other cards".',
    other: 'Missing {count} cards. They will be treated as "Other cards".',
  },
  'rules.validation.noRules': 'Add at least one opening or problem rule.',
  'rules.validation.unnamedRule': 'unnamed',
  'rules.validation.ruleNeedsReview': 'Rule "{name}" comes from an earlier version and needs a manual review before calculating.',
  'rules.validation.ruleNoRequirements': 'Rule "{name}" has no requirements.',
  'rules.validation.ruleTooManyRequired': 'Rule "{name}" asks for more requirements than it has.',
  'rules.validation.conditionNoGroup': 'Rule "{name}" has a condition with no group selected.',
  'rules.validation.conditionNoMonsterValue': 'Rule "{name}" has a monster condition with no value selected.',
  'rules.validation.groupEmpty': 'Rule "{name}" uses an empty group. Adjust origin/roles in the deck or pick another group.',
  'rules.validation.noMonsters': 'Rule "{name}" finds no monsters {filter} in the Main Deck.',
  'rules.validation.noMonstersFilter': 'with that filter',
  'rules.validation.requirementNoCards': 'Rule "{name}" has a requirement with no cards selected.',
  'rules.validation.quantityInvalid': 'Rule "{name}" has an invalid quantity in one of its requirements.',
  'rules.validation.cardGone': 'Rule "{name}" references a card that no longer exists.',
  'rules.validation.poolTooFewNames': {
    one: 'Rule "{name}" asks for {count} distinct name in a pool that only has {available}.',
    other: 'Rule "{name}" asks for {count} distinct names in a pool that only has {available}.',
  },
  'rules.validation.poolTooFewCopies': {
    one: 'Rule "{name}" asks for {count} copy in a pool that only adds up to {total}.',
    other: 'Rule "{name}" asks for {count} copies in a pool that only adds up to {total}.',
  },
  'rules.validation.quantityOverHand': 'Rule "{name}" asks for more cards than fit in the opening hand.',

  // Calculation errors (shown as a Lab notice)
  'rules.compute.tooSlow': 'The calculation took too long and was canceled. Try fewer conditions or a smaller card pool.',
  'rules.compute.failed': "Couldn't calculate the probabilities. Try again.",

  // Suggestions: what holds the deck back the most and what to change
  'rules.suggestion.noOpening': 'Hands with no opening',
  'rules.suggestion.fillerCard': 'filler card',
  'rules.suggestion.missingRole': {
    one: 'Your deck has no cards with the {roles} role: adding one is what lowers it the most.',
    other: 'Your deck has no cards with the {roles} roles: adding one is what lowers it the most.',
  },
  'rules.suggestion.maxed': 'The cards that prevent it ({names}) are already at the maximum copies your format allows: to lower it, add different cards with those roles.',

  // Name given to an own rule that was saved without one
  'rules.curation.unnamedOpening': 'Unnamed opening',
  'rules.curation.unnamedProblem': 'Unnamed problem',

  // System rules (catalog): title, what it measures, short condition and how often it happens
  'rules.preset.starterOpening.title': 'Basic opening',
  'rules.preset.starterOpening.description': 'Draw at least one Starter: the minimum any deck needs to start its play.',
  'rules.preset.starterOpening.subtitle': '1+ Starter',
  'rules.preset.starterOpening.probability': 'You open at least one Starter in {percent} of hands.',
  'rules.preset.deadCards.title': '2+ dead cards',
  'rules.preset.deadCards.description': 'Two or more Bricks or Garnets in hand leave your play without resources, in any deck.',
  'rules.preset.deadCards.subtitle': '2+ Brick or Garnet',
  'rules.preset.deadCards.probability': 'You open 2 or more dead cards in {percent} of hands.',
  'rules.preset.starterExtender.title': 'Opening with follow-up',
  'rules.preset.starterExtender.description': 'Starter and Extender in different cards: the hand can keep going if it gets interrupted.',
  'rules.preset.starterExtender.subtitle': 'Starter + Extender',
  'rules.preset.starterExtender.probability': 'You open Starter and Extender in {percent} of hands.',
  'rules.preset.starterInteraction.title': 'Opening with interaction',
  'rules.preset.starterInteraction.description': 'Start your play and also be able to stop your opponent with a Handtrap or Disruption.',
  'rules.preset.starterInteraction.subtitle': 'Starter + Handtrap/Disruption',
  'rules.preset.starterInteraction.probability': 'You open Starter with interaction in {percent} of hands.',
  'rules.preset.starterBoardbreaker.title': 'Board-breaking opening',
  'rules.preset.starterBoardbreaker.description': "Going second: start your play and have a way to break your opponent's board.",
  'rules.preset.starterBoardbreaker.subtitle': 'Starter + Boardbreaker',
  'rules.preset.starterBoardbreaker.probability': 'Going second, you open Starter and Boardbreaker in {percent} of hands.',
  'rules.preset.noAnswerSecond.title': 'No answer going second',
  'rules.preset.noAnswerSecond.description': "Going second, with no Handtrap or Boardbreaker in your opening 5 cards (the one you draw doesn't count) you're at the mercy of your opponent's board.",
  'rules.preset.noAnswerSecond.subtitle': '0 Handtrap or Boardbreaker in the 5 cards',
  'rules.preset.noAnswerSecond.probability': 'Going second, you have no answer in {percent} of hands.',

  // The sentence that says when a rule is met. One sentence per message: {conditions} are the already built conditions,
  // joined (with "and", "or" or a comma depending on the mode). "Separate" is when one card can't count for two conditions.
  'rules.engine.noRequirements': 'No requirements',
  'rules.engine.unnamedRule': 'Unnamed rule',
  'rules.engine.label.all': 'The rule is met if {conditions}.',
  'rules.engine.label.allSeparate': 'The rule, without reusing the same card across conditions, is met if {conditions}.',
  'rules.engine.label.any': 'The rule is met if any of these options happens: {conditions}.',
  'rules.engine.label.anySeparate': 'The rule, without reusing the same card across conditions, is met if any of these options happens: {conditions}.',
  'rules.engine.label.atLeast': 'The rule is met if at least {required} of these options happen: {conditions}.',
  'rules.engine.label.atLeastSeparate': 'The rule, without reusing the same card across conditions, is met if at least {required} of these options happen: {conditions}.',
  'rules.engine.joinAnd': 'and',
  'rules.engine.joinOr': 'or',

  // What each condition counts (the label that goes after "copy of", "monster"…)
  'rules.engine.groupDeleted': 'Deleted group',
  'rules.engine.monsterFilter': 'Monster filter',
  'rules.engine.archetype': 'Archetype: {name}',
  'rules.engine.cardType.monster': 'Type: Monster',
  'rules.engine.cardType.spell': 'Type: Spell',
  'rules.engine.cardType.trap': 'Type: Trap',
  'rules.engine.emptyPool': 'Empty pool',

  // One condition: how many are asked for (`one`: 1; `other`: the rest) and of what. Copies or distinct names; open or don't open.
  // "cards": single cards, pools, groups and archetypes.
  'rules.engine.phrase.cards.includeCopies': { one: 'you open 1 copy of {label}', other: 'you open {count} copies of {label}' },
  'rules.engine.phrase.cards.includeNames': { one: 'you open 1 distinct name from {label}', other: 'you open {count} distinct names from {label}' },
  'rules.engine.phrase.cards.excludeCopies': { one: "you don't open any copy of {label}", other: "you don't open {count} or more copies of {label}" },
  'rules.engine.phrase.cards.excludeNames': { one: "you don't open any card from {label}", other: "you don't open {count} or more distinct names from {label}" },
  // "monster": attribute, level, monster type, ATK, DEF.
  'rules.engine.phrase.monster.includeCopies': { one: 'you open 1 monster {label}', other: 'you open {count} monsters {label}' },
  'rules.engine.phrase.monster.includeNames': { one: 'you open 1 monster {label}', other: 'you open {count} distinct monster names {label}' },
  'rules.engine.phrase.monster.excludeCopies': { one: "you don't open any monster {label}", other: "you don't open {count} or more monsters {label}" },
  'rules.engine.phrase.monster.excludeNames': { one: "you don't open any monster {label}", other: "you don't open {count} or more distinct monster names {label}" },
  // "cardType": Monster, Spell or Trap.
  'rules.engine.phrase.cardType.includeCopies': { one: 'you open 1 card of {label}', other: 'you open {count} cards of {label}' },
  'rules.engine.phrase.cardType.includeNames': { one: 'you open 1 card of {label}', other: 'you open {count} distinct card names of {label}' },
  'rules.engine.phrase.cardType.excludeCopies': { one: "you don't open any card of {label}", other: "you don't open {count} or more cards of {label}" },
  'rules.engine.phrase.cardType.excludeNames': { one: "you don't open any card of {label}", other: "you don't open {count} or more distinct card names of {label}" },
}
