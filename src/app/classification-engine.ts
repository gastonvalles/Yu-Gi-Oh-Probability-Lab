import type { ApiCardReference, CardOrigin, CardRole } from '../types'

/** Output of the classification engine for a single card. */
export interface ClassificationSuggestion {
  origin: CardOrigin
  roles: CardRole[]
}

export type ClassificationOverride = ClassificationSuggestion

/** Normalize a card name for KNOWN_CARDS_MAP lookup: trim whitespace, lowercase. */
export function normalizeCardNameForLookup(name: string): string {
  return name.trim().toLowerCase()
}

// ── Known Cards Map ──

const KNOWN_CARDS_MAP_ENTRIES: Array<[string, ClassificationSuggestion]> = [
  // Hand traps (origin: non_engine)
  ['ash blossom & joyous spring', { origin: 'non_engine', roles: ['disruption'] }],
  ['maxx "c"', { origin: 'non_engine', roles: ['disruption', 'searcher'] }],
  ['effect veiler', { origin: 'non_engine', roles: ['disruption'] }],
  ['ghost ogre & snow rabbit', { origin: 'non_engine', roles: ['disruption'] }],
  ['ghost belle & haunted mansion', { origin: 'non_engine', roles: ['disruption'] }],
  ['droll & lock bird', { origin: 'non_engine', roles: ['disruption'] }],
  ['d.d. crow', { origin: 'non_engine', roles: ['disruption'] }],
  ['nibiru, the primal being', { origin: 'non_engine', roles: ['disruption', 'boardbreaker'] }],
  ['psy-framegear gamma', { origin: 'non_engine', roles: ['disruption'] }],
  ['infinite impermanence', { origin: 'non_engine', roles: ['disruption'] }],
  ['ghost mourner & moonlit chill', { origin: 'non_engine', roles: ['disruption'] }],
  ['dimension shifter', { origin: 'non_engine', roles: ['disruption'] }],
  ['skull meister', { origin: 'non_engine', roles: ['disruption'] }],

  // Staple spells
  ['called by the grave', { origin: 'non_engine', roles: ['tech'] }],
  ['crossout designator', { origin: 'non_engine', roles: ['tech'] }],
  ['triple tactics talent', { origin: 'non_engine', roles: ['searcher', 'boardbreaker'] }],
  ['forbidden droplet', { origin: 'non_engine', roles: ['boardbreaker', 'disruption'] }],
  ['dark ruler no more', { origin: 'non_engine', roles: ['boardbreaker'] }],
  ["harpie's feather duster", { origin: 'non_engine', roles: ['boardbreaker'] }],
  ['raigeki', { origin: 'non_engine', roles: ['boardbreaker'] }],
  ['lightning storm', { origin: 'non_engine', roles: ['boardbreaker'] }],
  ['pot of prosperity', { origin: 'non_engine', roles: ['searcher'] }],
  ['pot of desires', { origin: 'non_engine', roles: ['searcher'] }],
  ['pot of extravagance', { origin: 'non_engine', roles: ['searcher'] }],
  ['allure of darkness', { origin: 'non_engine', roles: ['searcher'] }],
  ['upstart goblin', { origin: 'non_engine', roles: ['searcher'] }],
  ['foolish burial', { origin: 'engine', roles: ['searcher'] }],
  ['monster reborn', { origin: 'non_engine', roles: ['recovery'] }],
  ['one for one', { origin: 'engine', roles: ['searcher'] }],
  ['book of moon', { origin: 'non_engine', roles: ['tech'] }],

  // Staple traps
  ['solemn judgment', { origin: 'non_engine', roles: ['disruption'] }],
  ['solemn strike', { origin: 'non_engine', roles: ['disruption'] }],
  ['torrential tribute', { origin: 'non_engine', roles: ['boardbreaker'] }],
  ['compulsory evacuation device', { origin: 'non_engine', roles: ['boardbreaker'] }],
  ['dimensional barrier', { origin: 'non_engine', roles: ['disruption'] }],
  ['anti-spell fragrance', { origin: 'non_engine', roles: ['disruption'] }],
  ['skill drain', { origin: 'non_engine', roles: ['disruption'] }],
  ['rivalry of warlords', { origin: 'non_engine', roles: ['disruption'] }],
  ['gozen match', { origin: 'non_engine', roles: ['disruption'] }],
  ['there can be only one', { origin: 'non_engine', roles: ['disruption'] }],

  // Board breakers & tech
  ['evenly matched', { origin: 'non_engine', roles: ['boardbreaker'] }],
  ['lava golem', { origin: 'non_engine', roles: ['boardbreaker'] }],
  ['gameciel, the sea turtle kaiju', { origin: 'non_engine', roles: ['boardbreaker'] }],
  ['gadarla, the mystery dust kaiju', { origin: 'non_engine', roles: ['boardbreaker'] }],
  ['dogoran, the mad flame kaiju', { origin: 'non_engine', roles: ['boardbreaker'] }],
  ['kumongous, the sticky string kaiju', { origin: 'non_engine', roles: ['boardbreaker'] }],
  ['super polymerization', { origin: 'non_engine', roles: ['boardbreaker'] }],
  ['forbidden chalice', { origin: 'non_engine', roles: ['tech', 'disruption'] }],

  // Modern hand traps & staples (2024–2025 meta)
  ['mulcharmy fuwalos', { origin: 'non_engine', roles: ['disruption', 'searcher'] }],
  ['mulcharmy purulia', { origin: 'non_engine', roles: ['disruption', 'searcher'] }],
  ['mulcharmy nyalus', { origin: 'non_engine', roles: ['disruption', 'searcher'] }],
  ['bystial druiswurm', { origin: 'non_engine', roles: ['disruption', 'boardbreaker'] }],
  ['bystial magnamhut', { origin: 'non_engine', roles: ['disruption', 'searcher'] }],
  ['bystial saronir', { origin: 'non_engine', roles: ['disruption'] }],
  ['token collector', { origin: 'non_engine', roles: ['disruption'] }],
  ['contact "c"', { origin: 'non_engine', roles: ['disruption'] }],
  ['gnomaterial', { origin: 'non_engine', roles: ['disruption'] }],
  ['retaliating "c"', { origin: 'non_engine', roles: ['disruption'] }],
  ['herald of orange light', { origin: 'non_engine', roles: ['disruption'] }],
  ['herald of green light', { origin: 'non_engine', roles: ['disruption'] }],
  ['herald of purple light', { origin: 'non_engine', roles: ['disruption'] }],

  // Modern staple spells & traps
  ['forbidden crown', { origin: 'non_engine', roles: ['tech', 'disruption'] }],
  ['change of heart', { origin: 'non_engine', roles: ['boardbreaker'] }],
  ['mind control', { origin: 'non_engine', roles: ['boardbreaker'] }],
  ['cosmic cyclone', { origin: 'non_engine', roles: ['boardbreaker'] }],
  ['twin twisters', { origin: 'non_engine', roles: ['boardbreaker'] }],
  ['mystical space typhoon', { origin: 'non_engine', roles: ['boardbreaker'] }],
  ['galaxy cyclone', { origin: 'non_engine', roles: ['boardbreaker'] }],
  ['feather duster duster', { origin: 'non_engine', roles: ['boardbreaker'] }],
  ['triple tactics thrust', { origin: 'non_engine', roles: ['searcher'] }],
  ['small world', { origin: 'engine', roles: ['searcher'] }],
  ['terraforming', { origin: 'engine', roles: ['searcher'] }],
  ['reinforcement of the army', { origin: 'engine', roles: ['searcher'] }],
  ['emergency teleport', { origin: 'engine', roles: ['searcher'] }],
  ['instant fusion', { origin: 'engine', roles: ['searcher'] }],
  ['reasoning', { origin: 'engine', roles: ['starter'] }],
  ['monster gate', { origin: 'engine', roles: ['starter'] }],
  ['pot of avarice', { origin: 'non_engine', roles: ['searcher', 'recovery'] }],
  ['jar of avarice', { origin: 'non_engine', roles: ['searcher', 'recovery'] }],

  // Additional Kaijus & board breakers
  ['jizukiru, the star destroying kaiju', { origin: 'non_engine', roles: ['boardbreaker'] }],
  ['radian, the multidimensional kaiju', { origin: 'non_engine', roles: ['boardbreaker'] }],
  ['thunder king, the lightningstrike kaiju', { origin: 'non_engine', roles: ['boardbreaker'] }],
  ['interrupted kaiju slumber', { origin: 'non_engine', roles: ['boardbreaker', 'searcher'] }],
  ['owner\'s seal', { origin: 'non_engine', roles: ['tech'] }],
  ['sphere mode (the winged dragon of ra - sphere mode)', { origin: 'non_engine', roles: ['boardbreaker'] }],
  ['the winged dragon of ra - sphere mode', { origin: 'non_engine', roles: ['boardbreaker'] }],
  ['lava golem', { origin: 'non_engine', roles: ['boardbreaker'] }],

  // Floodgate monsters
  ['inspector boarder', { origin: 'non_engine', roles: ['disruption', 'starter'] }],
  ['fossil dyna pachycephalo', { origin: 'non_engine', roles: ['disruption'] }],
  ['barrier statue of the stormwinds', { origin: 'non_engine', roles: ['disruption'] }],
  ['barrier statue of the abyss', { origin: 'non_engine', roles: ['disruption'] }],
  ['barrier statue of the inferno', { origin: 'non_engine', roles: ['disruption'] }],
  ['barrier statue of the drought', { origin: 'non_engine', roles: ['disruption'] }],
  ['barrier statue of the heavens', { origin: 'non_engine', roles: ['disruption'] }],
  ['vanity\'s fiend', { origin: 'non_engine', roles: ['disruption'] }],
  ['majesty\'s fiend', { origin: 'non_engine', roles: ['disruption'] }],
  ['amano-iwato', { origin: 'non_engine', roles: ['disruption'] }],

  // 2026 meta staples (YCS Virginia 300th / Burst Protocol format)
  ['shiina, twin tempests of celestial thunder', { origin: 'non_engine', roles: ['disruption', 'boardbreaker'] }],
  ['mulcharmy meowls', { origin: 'non_engine', roles: ['disruption', 'searcher'] }],
  ['s:p little knight', { origin: 'non_engine', roles: ['boardbreaker', 'disruption'] }],
  ['divine arsenal aa-zeus - sky thunder', { origin: 'non_engine', roles: ['boardbreaker', 'payoff'] }],
  ['super starslayer ty-phon - sky crisis', { origin: 'non_engine', roles: ['boardbreaker', 'payoff'] }],
  ['i:p masquerena', { origin: 'non_engine', roles: ['extender', 'disruption'] }],
  ['knightmare unicorn', { origin: 'non_engine', roles: ['boardbreaker', 'payoff'] }],
  ['knightmare phoenix', { origin: 'non_engine', roles: ['boardbreaker', 'payoff'] }],
  ['accesscode talker', { origin: 'non_engine', roles: ['payoff', 'boardbreaker'] }],
  ['underworld goddess of the closed world', { origin: 'non_engine', roles: ['boardbreaker', 'payoff', 'disruption'] }],
  ['guardian chimera', { origin: 'non_engine', roles: ['payoff', 'searcher'] }],
  ['saryuja skull dread', { origin: 'non_engine', roles: ['payoff', 'searcher'] }],
  ['imperial princess quinquery', { origin: 'non_engine', roles: ['payoff', 'disruption'] }],

  // Generic extra deck toolbox (commonly sided/mained across meta)
  ['number 101: silent honor ark', { origin: 'non_engine', roles: ['boardbreaker', 'payoff'] }],
  ['number c101: silent honor dark', { origin: 'non_engine', roles: ['boardbreaker', 'payoff'] }],
  ['tornado dragon', { origin: 'non_engine', roles: ['boardbreaker', 'payoff'] }],
  ['abyss dweller', { origin: 'non_engine', roles: ['disruption', 'payoff'] }],
  ['bagooska the terribly tired tapir', { origin: 'non_engine', roles: ['disruption', 'payoff'] }],

  // Commonly sided going-second cards (2026 format)
  ['dark hole', { origin: 'non_engine', roles: ['boardbreaker'] }],
  ['book of eclipse', { origin: 'non_engine', roles: ['boardbreaker'] }],
  ['solemn warning', { origin: 'non_engine', roles: ['disruption'] }],
]

/** Static map of known card names → pre-assigned classifications. */
export const KNOWN_CARDS_MAP: ReadonlyMap<string, ClassificationSuggestion> =
  new Map(KNOWN_CARDS_MAP_ENTRIES)

/** A single heuristic rule that inspects card data and may contribute roles. */
export interface HeuristicRule {
  id: string
  /** Returns roles this rule suggests for the given card, or empty array. */
  evaluate: (card: ApiCardReference) => CardRole[]
}

/** Roles that advance the player's own game plan. */
const GAME_PLAN_ROLES: ReadonlySet<CardRole> = new Set([
  'starter', 'extender', 'enabler', 'searcher', 'payoff', 'recovery',
])

/** Roles that interact with the opponent. */
const INTERACTION_ROLES: ReadonlySet<CardRole> = new Set(['disruption', 'boardbreaker'])

/**
 * Pure function. Given a set of suggested roles, derives the origin.
 */
export function deriveOrigin(roles: CardRole[]): CardOrigin {
  if (roles.length === 0) {
    return 'non_engine'
  }

  const hasTech = roles.includes('tech')
  const hasBrick = roles.includes('brick')
  const hasGamePlan = roles.some((r) => GAME_PLAN_ROLES.has(r))
  const hasInteraction = roles.some((r) => INTERACTION_ROLES.has(r))

  // tech (and no game-plan or interaction) → non_engine
  if (hasTech && !hasGamePlan && !hasInteraction) {
    return 'non_engine'
  }

  // brick (and no interaction) → engine
  if (hasBrick && !hasInteraction) {
    return 'engine'
  }

  // any role of the player's own game plan → engine (even if it also interacts)
  if (hasGamePlan) {
    return 'engine'
  }

  return 'non_engine'
}

// ── Regex helpers (case-insensitive) ──

const HANDTRAP_HAND_ACTIVATION = /(?:you can (?:discard|send) this card|send this card from your hand(?: to the gy)?|discard this card|banish this card from your hand|reveal this card in your hand)/i
const HANDTRAP_DISRUPTION_EFFECT = /(?:negate|destroy|banish|return.*to the hand|send.*to the gy|lose)/i
const HANDTRAP_QUICK_MONSTER = /(?:during (?:either player's|your opponent's) (?:turn|main phase)|quick effect)/i
const HANDTRAP_OPPONENT_TRIGGER = /if your opponent/i
const HANDTRAP_SPECIAL_SUMMON_FROM_HAND = /special summon.*from your hand/i
const HANDTRAP_TRAP_HAND_ACTIVATION = /you can activate this card from your hand/i

const DRAW_PATTERN = /\bdraw (?:1|2|3) cards?\b/i
const DRAW_FILTER_PATTERN = /\bdraw \d+ card/i
const DRAW_EXCAVATE_REVEAL = /(?:excavate the top|reveal the top)/i
const DRAW_ADD_TO_HAND = /add.*to your hand/i

const SEARCHER_PATTERN = /add.*from your deck(?:\s+to your hand)?/i
const SEARCHER_ADD_UP_TO = /add (?:1|up to).*from your deck/i
const SEARCHER_EXCAVATE_LOOK = /(?:excavate|look at the top).*add.*to your hand/i
const SEARCHER_DECK_RECRUIT = /special summon.*from your deck/i

const BOARDBREAKER_PATTERN = /(?:destroy all|return all|send all)/i
const BOARDBREAKER_BANISH_SHUFFLE_ALL = /(?:banish all|shuffle all.*into the deck)/i
const BOARDBREAKER_NEGATE_ALL = /negate the effects of all/i
const BOARDBREAKER_OPPONENT_TARGET = /(?:your opponent|opponent's|opponent controls)/i

const REMOVAL_TARGETED = /(?:destroy 1|banish 1|return 1.*to the hand|target 1.*destroy|target 1.*banish)/i
const REMOVAL_KAIJU_TRIBUTE = /tribute 1 monster your opponent controls/i
const REMOVAL_NEGATE_SINGLE = /negate the effects of 1 face-up/i

const RECOVERY_GY = /(?:add.*from your gy(?:\s+to your hand)?|special summon.*from your gy|add.*that is banished)/i

const FLOODGATE_RESTRICTION = /(?:cannot special summon|cannot activate|cannot (?:add|draw|send))/i
const FLOODGATE_MONSTER_FACE_UP = /while this card is face-up/i
const FLOODGATE_CANNOT = /cannot/i
const FLOODGATE_PLAYER_RESTRICTION = /(?:each player can only|neither player can)/i

const DISRUPTION_NEGATE = /(?:negate (?:the|that|its)|negate the (?:activation|effect)|destroy (?:that|it|the))/i
const DISRUPTION_NEGATE_SUMMON_DESTROY = /negate the summon.*destroy/i
const QUICK_PLAY_SPELL = /quick-play/i

const CANNOT_NORMAL_SUMMON = /cannot be normal summoned/i
const SPECIAL_SUMMON_CLAUSE = /special summon/i

// ── Rule implementations ──

function isMonsterCard(card: ApiCardReference): boolean {
  return card.cardType.toLowerCase().includes('monster')
}

function isSpellCard(card: ApiCardReference): boolean {
  return card.cardType.toLowerCase().includes('spell')
}

function isTrapCard(card: ApiCardReference): boolean {
  return card.cardType.toLowerCase().includes('trap')
}

function isContinuousSpellOrTrap(card: ApiCardReference): boolean {
  const ct = card.cardType.toLowerCase()
  return ct.includes('continuous') || (ct.includes('field') && ct.includes('spell'))
}

function isExtraDeckMonster(card: ApiCardReference): boolean {
  const ft = card.frameType.toLowerCase()
  return ft.includes('fusion') || ft.includes('synchro') || ft.includes('xyz') || ft.includes('link')
}

const ruleHandtrap: HeuristicRule = {
  id: 'handtrap',
  evaluate(card) {
    const desc = card.description
    if (!desc) return []

    // Trap cards with hand-activation language
    if (isTrapCard(card) && HANDTRAP_TRAP_HAND_ACTIVATION.test(desc)) {
      return ['disruption']
    }

    if (!isMonsterCard(card)) return []

    const hasHandActivation = HANDTRAP_HAND_ACTIVATION.test(desc)
    const hasDisruptionEffect = HANDTRAP_DISRUPTION_EFFECT.test(desc)
    const hasQuickEffect = HANDTRAP_QUICK_MONSTER.test(desc)

    if (hasHandActivation && hasDisruptionEffect) return ['disruption']
    if (hasQuickEffect && hasDisruptionEffect) return ['disruption']

    // "if your opponent" trigger + special summon from hand
    if (HANDTRAP_OPPONENT_TRIGGER.test(desc) && HANDTRAP_SPECIAL_SUMMON_FROM_HAND.test(desc)) {
      return ['disruption']
    }

    return []
  },
}

const ruleDraw: HeuristicRule = {
  id: 'draw',
  evaluate(card) {
    const desc = card.description
    if (!desc) return []

    // Standard draw patterns (any card type)
    if (DRAW_PATTERN.test(desc) || DRAW_FILTER_PATTERN.test(desc)) return ['searcher']

    // Excavate/reveal the top + add to hand (spell cards)
    if (isSpellCard(card) && DRAW_EXCAVATE_REVEAL.test(desc) && DRAW_ADD_TO_HAND.test(desc)) return ['searcher']

    return []
  },
}

const ruleSearcher: HeuristicRule = {
  id: 'searcher',
  evaluate(card) {
    const desc = card.description
    if (!desc) return []

    if (SEARCHER_PATTERN.test(desc)) return ['searcher']
    if (SEARCHER_ADD_UP_TO.test(desc)) return ['searcher']
    if (SEARCHER_EXCAVATE_LOOK.test(desc)) return ['searcher']
    if (SEARCHER_DECK_RECRUIT.test(desc)) return ['searcher']

    return []
  },
}

const ruleBoardbreaker: HeuristicRule = {
  id: 'boardbreaker',
  evaluate(card) {
    const desc = card.description
    if (!desc) return []

    if (BOARDBREAKER_PATTERN.test(desc)) return ['boardbreaker']
    if (BOARDBREAKER_BANISH_SHUFFLE_ALL.test(desc) && BOARDBREAKER_OPPONENT_TARGET.test(desc)) return ['boardbreaker']
    if (BOARDBREAKER_NEGATE_ALL.test(desc) && BOARDBREAKER_OPPONENT_TARGET.test(desc)) return ['boardbreaker']

    return []
  },
}

const ruleRemoval: HeuristicRule = {
  id: 'removal',
  evaluate(card) {
    const desc = card.description
    if (!desc) return []

    if (REMOVAL_TARGETED.test(desc)) return ['boardbreaker']
    if (REMOVAL_KAIJU_TRIBUTE.test(desc)) return ['boardbreaker']
    if (REMOVAL_NEGATE_SINGLE.test(desc)) return ['boardbreaker']

    return []
  },
}

const ruleRecovery: HeuristicRule = {
  id: 'recovery',
  evaluate(card) {
    const desc = card.description
    if (!desc) return []

    if (RECOVERY_GY.test(desc)) return ['recovery']

    return []
  },
}

const ruleFloodgate: HeuristicRule = {
  id: 'floodgate',
  evaluate(card) {
    const desc = card.description
    if (!desc) return []

    // Continuous spell/trap or field spell with restriction language
    if (isContinuousSpellOrTrap(card) && FLOODGATE_RESTRICTION.test(desc)) return ['disruption']
    if ((isSpellCard(card) || isTrapCard(card)) && FLOODGATE_RESTRICTION.test(desc) && !DISRUPTION_NEGATE.test(desc)) return ['disruption']

    // Monster floodgates: "while this card is face-up" + "cannot"
    if (isMonsterCard(card) && FLOODGATE_MONSTER_FACE_UP.test(desc) && FLOODGATE_CANNOT.test(desc)) return ['disruption']

    // "each player can only" or "neither player can" (any card type)
    if (FLOODGATE_PLAYER_RESTRICTION.test(desc)) return ['disruption']

    return []
  },
}

const ruleDisruption: HeuristicRule = {
  id: 'disruption',
  evaluate(card) {
    const desc = card.description
    if (!desc) return []

    // Counter traps are always disruption
    if (card.cardType.toLowerCase().includes('counter')) return ['disruption']

    if (isTrapCard(card) && DISRUPTION_NEGATE.test(desc)) return ['disruption']
    if (isTrapCard(card) && DISRUPTION_NEGATE_SUMMON_DESTROY.test(desc)) return ['disruption']
    if (isSpellCard(card) && QUICK_PLAY_SPELL.test(card.cardType) && DISRUPTION_NEGATE.test(desc)) return ['disruption']

    return []
  },
}

const rulePayoff: HeuristicRule = {
  id: 'payoff',
  evaluate(card) {
    if (isExtraDeckMonster(card)) return ['payoff']
    return []
  },
}

const ruleBrick: HeuristicRule = {
  id: 'brick',
  evaluate(card) {
    if (!isMonsterCard(card)) return []
    const desc = card.description

    // "cannot be Normal Summoned" without special summon clause
    if (desc && CANNOT_NORMAL_SUMMON.test(desc) && !SPECIAL_SUMMON_CLAUSE.test(desc)) {
      return ['brick']
    }

    // High level (≥7) — brick role is only added if no other roles matched,
    // but that check happens in classifyCard. Here we just flag the candidate.
    if (card.level !== null && card.level >= 7) {
      return ['brick']
    }

    return []
  },
}

/** The ordered collection of all heuristic rules. Exported for isolated testing. */
export const RULE_SET: readonly HeuristicRule[] = [
  ruleHandtrap,   // 1
  ruleDraw,        // 2
  ruleSearcher,    // 3
  ruleBoardbreaker,// 4
  ruleRemoval,     // 5
  ruleRecovery,    // 6
  ruleFloodgate,   // 7
  ruleDisruption,  // 8
  rulePayoff,      // 9
  ruleBrick,       // 10
]

/**
 * Pure function. Checks KNOWN_CARDS_MAP first; if not found, runs RULE_SET.
 * Always returns a new object (never a reference to stored data).
 */
export function classifyCard(
  card: ApiCardReference,
  name?: string,
  overrides?: ReadonlyMap<string, ClassificationSuggestion>,
): ClassificationSuggestion {
  // Map lookup: if a name is provided, normalize and check the known-cards map
  if (name && name.trim().length > 0) {
    const normalizedName = normalizeCardNameForLookup(name)

    // Check user overrides first
    if (overrides) {
      const overrideEntry = overrides.get(normalizedName)
      if (overrideEntry) {
        return { origin: overrideEntry.origin, roles: [...overrideEntry.roles] }
      }
    }

    // Then check known cards map
    const knownEntry = KNOWN_CARDS_MAP.get(normalizedName)
    if (knownEntry) {
      return { origin: knownEntry.origin, roles: [...knownEntry.roles] }
    }
  }

  const collectedRoles: CardRole[] = []
  let hasBoardbreaker = false
  let hasFloodgate = false

  for (const rule of RULE_SET) {
    const suggested = rule.evaluate(card)

    if (suggested.length === 0) continue

    // Track boardbreaker/floodgate for mutual exclusion with removal/disruption
    if (rule.id === 'boardbreaker') {
      hasBoardbreaker = true
    }
    if (rule.id === 'disruption') {
      hasFloodgate = true
    }

    // Rule 5 (removal): skip if boardbreaker already matched
    if (rule.id === 'boardbreaker' && hasBoardbreaker) continue

    // Rule 8 (disruption): skip if floodgate already matched
    if (rule.id === 'disruption' && hasFloodgate) continue

    for (const role of suggested) {
      if (!collectedRoles.includes(role)) {
        collectedRoles.push(role)
      }
    }
  }

  // Rule 10 special: brick only applies if no other roles matched
  if (collectedRoles.includes('brick') && collectedRoles.length > 1) {
    const index = collectedRoles.indexOf('brick')
    collectedRoles.splice(index, 1)
  }

  const origin = deriveOrigin(collectedRoles)

  return { origin, roles: collectedRoles }
}
