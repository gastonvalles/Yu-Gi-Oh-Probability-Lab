import type { builder as es } from '../es/builder'
import type { Translated } from '../types'

export const builder: Translated<typeof es> = {
  // Rule editor drawer
  'builder.drawer.hint': 'The analysis updates when you save.',
  'builder.drawer.titleNew': 'New rule',
  'builder.drawer.titleEdit': 'Edit rule',
  'builder.drawer.close': 'Close editor',
  'builder.drawer.preparing': 'Getting the editor ready…',
  'builder.drawer.delete': 'Delete rule',
  'builder.drawer.create': 'Create rule',
  'builder.drawer.saveChanges': 'Save changes',

  // Renaming a system rule
  'builder.rename.title': 'Rule name',
  'builder.rename.restore': 'Restore',
  'builder.rename.name': 'Name',

  // Editor steps, top to bottom
  'builder.step.name': 'Name',
  'builder.step.kind': 'Type',
  'builder.step.turn': 'Turn',
  'builder.step.conditions': 'Conditions',
  'builder.step.settings': 'Settings',

  'builder.name.label': 'Name',
  'builder.name.placeholder': 'Rule name (optional)',
  'builder.name.useSummary': 'Optional: otherwise the summary is used',

  'builder.patternKind.label': 'Rule type',
  'builder.patternKind.opening': 'Opening',
  'builder.patternKind.problem': 'Problem',

  // Short on purpose: the three options share one row and go under the "Turn" title
  'builder.turn.label': 'Turn context',
  'builder.turn.either': 'Always',
  'builder.turn.first': 'Going first',
  'builder.turn.second': 'Going second',

  'builder.reviewNotice': 'This rule comes from an earlier version. Check these settings before trusting the result.',
  'builder.addAnd': 'And another condition',
  'builder.addOr': 'Or another condition',
  'builder.add': 'Add condition',

  // How the conditions combine
  'builder.logic.label': 'How the conditions combine',
  'builder.logic.and': 'AND',
  'builder.logic.or': 'OR',
  'builder.logic.all': 'AND · all',
  'builder.logic.allNegated': 'AND · none present',
  'builder.logic.any': 'OR · any one',
  'builder.logic.anyNegated': 'OR · one missing',
  'builder.logic.atLeast': 'At least {count}',
  'builder.logic.atLeastNegated': 'At least {count} missing',
  'builder.logic.minimum': 'Minimum conditions to meet',
  'builder.logic.outOf': 'of {count}',

  // One condition: [At least] [− 2 +] [copies] [which cards]
  'builder.condition.label': 'Condition {index}',
  'builder.condition.quantity': 'Quantity',
  'builder.condition.pick': 'Choose what to count',
  'builder.condition.picked': 'What to count: {label}. Change',
  'builder.condition.remove': 'Remove condition {index}',
  'builder.condition.pickerLabel': 'What to count in this condition',
  'builder.condition.kindChange': '{kind}. Change to {other}',
  'builder.condition.kindTitle': 'Change to "{kind}"',
  'builder.condition.unitNames': 'names',
  'builder.condition.unitCopies': 'copies',
  'builder.condition.unitToNames': 'copies. Change to distinct names',
  'builder.condition.unitToCopies': 'distinct names. Change to copies',
  'builder.condition.unitToNamesTitle': 'Count distinct names instead of copies',
  'builder.condition.unitToCopiesTitle': 'Count copies instead of distinct names',

  'builder.requirementKind.include': 'At least',
  'builder.requirementKind.exclude': 'Without',

  'builder.cardType.monster': 'Monster',
  'builder.cardType.spell': 'Spell',
  'builder.cardType.trap': 'Trap',

  // What a condition counts (the right-hand segment)
  'builder.label.undefined': 'Not defined',
  'builder.label.cardMissing': 'Card not in the deck',
  'builder.label.poolEmpty': 'Empty pool',
  'builder.label.poolMore': '{name} +{count} more',
  'builder.label.attribute': 'Attribute {value}',
  'builder.label.level': 'Level {value}',
  'builder.label.archetype': 'Archetype {value}',
  'builder.label.atk': '{value} ATK',
  'builder.label.def': '{value} DEF',

  // "What to count" picker
  'builder.picker.title': 'What do you want to count?',
  'builder.picker.placeholder': 'Search cards, roles, archetypes…',
  'builder.picker.search': 'Search',
  'builder.picker.multiOn': 'Several cards ✓',
  'builder.picker.multiOff': 'Pick several cards',
  'builder.picker.noCards': 'There are no cards in the deck.',
  'builder.picker.noMatches': 'Nothing matches your search.',
  'builder.picker.used': 'Already used in another condition: {names}.',
  'builder.picker.selected': { one: '{count} card selected', other: '{count} cards selected' },
  'builder.picker.hint': 'Tap cards from any group to build the pool',
  'builder.picker.clear': 'Clear',
  'builder.picker.confirm': 'Use selection',
  'builder.picker.group.cards': 'Cards',
  'builder.picker.group.archetype': 'Archetype',
  'builder.picker.group.cardType': 'Card type',
  'builder.picker.group.role': 'Roles',
  'builder.picker.group.origin': 'Origin',
  'builder.picker.group.attribute': 'Attribute',
  'builder.picker.group.level': 'Level',
  'builder.picker.group.monsterType': 'Monster type',
  'builder.picker.group.atk': 'ATK',
  'builder.picker.group.def': 'DEF',

  // Settings that change how the rule is evaluated
  'builder.settings.draw.title': 'Count the card you draw going second',
  'builder.settings.draw.handOnly': "Only the opening hand of 5 is checked (e.g. interaction for your opponent's turn).",
  'builder.settings.draw.withDraw': 'Going second, the rule sees all 6 cards, including the one you drew.',
  'builder.settings.rescue.title': 'Rescue the cards it uses',
  'builder.settings.rescue.on': "If the hand meets this opening, its cards don't count as dead in problems.",
  'builder.settings.rescue.off': 'Problems count every card in the hand.',
  'builder.settings.shared.title': 'The same card counts for more than one condition',
  'builder.settings.shared.on': 'Some cards are in more than one condition: a single copy can meet several at once.',
  'builder.settings.shared.off': 'Some cards are in more than one condition: each condition needs different cards.',

  // The rule read as one sentence (under the conditions)
  'builder.readback.and': 'and',
  'builder.readback.or': 'or',
  'builder.readback.turnFirst': 'Going first only.',
  'builder.readback.turnSecond': 'Going second only.',

  'builder.preview.headingProblem': 'This problem happens if:',
  'builder.preview.headingOpening': 'This opening requires:',
  'builder.preview.noConditions': 'define at least one condition',
  // It has to start with "(": the editor uses that to tell the rule still needs what to count.
  'builder.preview.chooseCards': '(choose which cards to count)',
  'builder.preview.logicAll': 'All conditions must be met.',
  'builder.preview.logicAny': 'Meeting one condition is enough.',
  'builder.preview.logicAtLeast': 'At least {count} conditions must be met.',
  'builder.preview.reuseSingle': "The reuse policy doesn't change the result while there is only one positive condition.",
  'builder.preview.reuseAllowed': 'The same card can be reused across conditions.',
  'builder.preview.reuseForbidden': 'The same card cannot be reused across conditions.',
  'builder.preview.cardGone': 'a card that is no longer in the deck',
  'builder.preview.copiesInclude': { one: 'at least {count} copy of {card}', other: 'at least {count} copies of {card}' },
  'builder.preview.copiesExclude': { one: 'you draw no copies of {card}', other: "you don't draw {count} or more copies of {card}" },

  // One condition: how many are asked for + what is counted ({tail} is the criterion: "with role Starter", "of Level 4"…).
  // "You draw none" is the same counting copies or names, so the singular of the excluding "names" variants says "cards" / "monsters".
  'builder.preview.include.cards': { one: 'at least {count} card {tail}', other: 'at least {count} cards {tail}' },
  'builder.preview.include.names': { one: 'at least {count} distinct name {tail}', other: 'at least {count} distinct names {tail}' },
  'builder.preview.include.monsters': { one: 'at least {count} monster {tail}', other: 'at least {count} monsters {tail}' },
  'builder.preview.include.monsterNames': { one: 'at least {count} distinct monster name {tail}', other: 'at least {count} distinct monster names {tail}' },
  'builder.preview.exclude.cards': { one: 'you draw no cards {tail}', other: "you don't draw {count} or more cards {tail}" },
  'builder.preview.exclude.names': { one: 'you draw no cards {tail}', other: "you don't draw {count} or more distinct names {tail}" },
  'builder.preview.exclude.monsters': { one: 'you draw no monsters {tail}', other: "you don't draw {count} or more monsters {tail}" },
  'builder.preview.exclude.monsterNames': { one: 'you draw no monsters {tail}', other: "you don't draw {count} or more distinct monster names {tail}" },

  'builder.tail.pool': 'from the pool {pool}',
  'builder.tail.poolMissing': 'from a pool of cards',
  'builder.tail.cardType': 'of type {type}',
  'builder.tail.archetype': 'of the {name} archetype',
  'builder.tail.role': 'with role {role}',
  'builder.tail.origin': 'with origin {origin}',
  'builder.tail.attribute': 'with the {attribute} attribute',
  'builder.tail.level': 'of Level {level}',
  'builder.tail.monsterType': 'of type {type}',
  'builder.tail.atk': 'with {value} ATK',
  'builder.tail.def': 'with {value} DEF',

  // The short summary of a rule: it becomes the name when the person didn't type one
  'builder.summary.undefinedRule': 'Undefined rule',
  'builder.summary.anyOf': 'One of these: {parts}',
  'builder.summary.atLeastOf': '{count} of these: {parts}',
  'builder.summary.conditionUndefined': 'not defined',
  'builder.summary.without': 'without {label}',
  'builder.summary.withoutMany': 'without {count}+ {label}',
  'builder.summary.many': '{count}+ {label}',
  'builder.summary.cardMissing': 'card not in the deck',
  'builder.summary.pool': 'pool',
  'builder.summary.poolManual': 'manual pool',
  'builder.summary.criterion': 'criterion',
}
