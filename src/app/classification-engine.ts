import type { ApiCardReference, CardOrigin, CardRole } from '../types'
import { getCardRuleFlags } from './card-rules'
import { CARD_RULE } from './card-script-rules'

/** Output of the classification engine for a single card. */
export interface ClassificationSuggestion {
  origin: CardOrigin
  roles: CardRole[]
}

/** Normalize a card name for KNOWN_CARDS_MAP lookup: trim whitespace, lowercase. */
export function normalizeCardNameForLookup(name: string): string {
  return name.trim().toLowerCase()
}

// ── Known Cards Map ──

const KNOWN_CARDS_MAP_ENTRIES: Array<[string, ClassificationSuggestion]> = [
  // Hand traps (origin: non_engine)
  ['ash blossom & joyous spring', { origin: 'non_engine', roles: ['handtrap'] }],
  ['maxx "c"', { origin: 'non_engine', roles: ['handtrap', 'draw', 'floodgate'] }],
  ['effect veiler', { origin: 'non_engine', roles: ['handtrap'] }],
  ['ghost ogre & snow rabbit', { origin: 'non_engine', roles: ['handtrap'] }],
  ['ghost belle & haunted mansion', { origin: 'non_engine', roles: ['handtrap'] }],
  ['droll & lock bird', { origin: 'non_engine', roles: ['handtrap', 'floodgate'] }],
  ['d.d. crow', { origin: 'non_engine', roles: ['handtrap'] }],
  ['nibiru, the primal being', { origin: 'non_engine', roles: ['handtrap', 'boardbreaker'] }],
  ['psy-framegear gamma', { origin: 'non_engine', roles: ['handtrap'] }],
  ['infinite impermanence', { origin: 'non_engine', roles: ['handtrap', 'disruption'] }],
  ['ghost mourner & moonlit chill', { origin: 'non_engine', roles: ['handtrap'] }],
  ['dimension shifter', { origin: 'non_engine', roles: ['handtrap', 'floodgate'] }],
  ['skull meister', { origin: 'non_engine', roles: ['handtrap'] }],

  // Staple spells
  ['called by the grave', { origin: 'non_engine', roles: ['disruption'] }],
  ['crossout designator', { origin: 'non_engine', roles: ['disruption'] }],
  ['triple tactics talent', { origin: 'non_engine', roles: ['draw', 'boardbreaker'] }],
  ['forbidden droplet', { origin: 'non_engine', roles: ['boardbreaker', 'disruption'] }],
  ['dark ruler no more', { origin: 'non_engine', roles: ['boardbreaker'] }],
  ["harpie's feather duster", { origin: 'non_engine', roles: ['boardbreaker'] }],
  ['raigeki', { origin: 'non_engine', roles: ['boardbreaker'] }],
  ['lightning storm', { origin: 'non_engine', roles: ['boardbreaker'] }],
  ['pot of prosperity', { origin: 'non_engine', roles: ['draw'] }],
  ['pot of desires', { origin: 'non_engine', roles: ['draw'] }],
  ['pot of extravagance', { origin: 'non_engine', roles: ['draw'] }],
  ['allure of darkness', { origin: 'non_engine', roles: ['draw'] }],
  ['upstart goblin', { origin: 'non_engine', roles: ['draw'] }],
  ['foolish burial', { origin: 'engine', roles: ['searcher'] }],
  ['monster reborn', { origin: 'non_engine', roles: ['recovery'] }],
  ['one for one', { origin: 'engine', roles: ['searcher'] }],
  ['book of moon', { origin: 'non_engine', roles: ['disruption'] }],

  // Staple traps
  ['solemn judgment', { origin: 'non_engine', roles: ['disruption'] }],
  ['solemn strike', { origin: 'non_engine', roles: ['disruption'] }],
  ['torrential tribute', { origin: 'non_engine', roles: ['boardbreaker'] }],
  ['compulsory evacuation device', { origin: 'non_engine', roles: ['boardbreaker'] }],
  ['dimensional barrier', { origin: 'non_engine', roles: ['floodgate'] }],
  ['anti-spell fragrance', { origin: 'non_engine', roles: ['floodgate'] }],
  ['skill drain', { origin: 'non_engine', roles: ['floodgate'] }],
  ['rivalry of warlords', { origin: 'non_engine', roles: ['floodgate'] }],
  ['gozen match', { origin: 'non_engine', roles: ['floodgate'] }],
  ['there can be only one', { origin: 'non_engine', roles: ['floodgate'] }],

  // Board breakers & tech
  ['evenly matched', { origin: 'non_engine', roles: ['boardbreaker'] }],
  ['lava golem', { origin: 'non_engine', roles: ['boardbreaker'] }],
  ['gameciel, the sea turtle kaiju', { origin: 'non_engine', roles: ['boardbreaker'] }],
  ['gadarla, the mystery dust kaiju', { origin: 'non_engine', roles: ['boardbreaker'] }],
  ['dogoran, the mad flame kaiju', { origin: 'non_engine', roles: ['boardbreaker'] }],
  ['kumongous, the sticky string kaiju', { origin: 'non_engine', roles: ['boardbreaker'] }],
  ['super polymerization', { origin: 'non_engine', roles: ['boardbreaker'] }],
  ['forbidden chalice', { origin: 'non_engine', roles: ['disruption'] }],

  // Modern hand traps & staples (2024–2025 meta)
  ['mulcharmy fuwalos', { origin: 'non_engine', roles: ['handtrap', 'draw', 'floodgate'] }],
  ['mulcharmy purulia', { origin: 'non_engine', roles: ['handtrap', 'draw', 'floodgate'] }],
  ['mulcharmy nyalus', { origin: 'non_engine', roles: ['handtrap', 'draw', 'floodgate'] }],
  ['bystial druiswurm', { origin: 'non_engine', roles: ['handtrap', 'boardbreaker'] }],
  ['bystial magnamhut', { origin: 'non_engine', roles: ['handtrap', 'searcher'] }],
  ['bystial saronir', { origin: 'non_engine', roles: ['handtrap'] }],
  ['token collector', { origin: 'non_engine', roles: ['handtrap'] }],
  ['contact "c"', { origin: 'non_engine', roles: ['handtrap'] }],
  ['gnomaterial', { origin: 'non_engine', roles: ['handtrap'] }],
  ['retaliating "c"', { origin: 'non_engine', roles: ['handtrap'] }],
  ['herald of orange light', { origin: 'non_engine', roles: ['handtrap', 'disruption'] }],
  ['herald of green light', { origin: 'non_engine', roles: ['handtrap', 'disruption'] }],
  ['herald of purple light', { origin: 'non_engine', roles: ['handtrap', 'disruption'] }],

  // Modern staple spells & traps
  ['forbidden crown', { origin: 'non_engine', roles: ['disruption'] }],
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
  ['pot of avarice', { origin: 'non_engine', roles: ['draw', 'recovery'] }],
  ['jar of avarice', { origin: 'non_engine', roles: ['draw', 'recovery'] }],

  // Additional Kaijus & board breakers
  ['jizukiru, the star destroying kaiju', { origin: 'non_engine', roles: ['boardbreaker'] }],
  ['radian, the multidimensional kaiju', { origin: 'non_engine', roles: ['boardbreaker'] }],
  ['thunder king, the lightningstrike kaiju', { origin: 'non_engine', roles: ['boardbreaker'] }],
  ['interrupted kaiju slumber', { origin: 'non_engine', roles: ['boardbreaker', 'searcher'] }],
  ['owner\'s seal', { origin: 'non_engine', roles: ['disruption'] }],
  ['sphere mode (the winged dragon of ra - sphere mode)', { origin: 'non_engine', roles: ['boardbreaker'] }],
  ['the winged dragon of ra - sphere mode', { origin: 'non_engine', roles: ['boardbreaker'] }],
  ['lava golem', { origin: 'non_engine', roles: ['boardbreaker'] }],

  // Floodgate monsters
  ['inspector boarder', { origin: 'non_engine', roles: ['floodgate', 'starter'] }],
  ['fossil dyna pachycephalo', { origin: 'non_engine', roles: ['floodgate'] }],
  ['barrier statue of the stormwinds', { origin: 'non_engine', roles: ['floodgate'] }],
  ['barrier statue of the abyss', { origin: 'non_engine', roles: ['floodgate'] }],
  ['barrier statue of the inferno', { origin: 'non_engine', roles: ['floodgate'] }],
  ['barrier statue of the drought', { origin: 'non_engine', roles: ['floodgate'] }],
  ['barrier statue of the heavens', { origin: 'non_engine', roles: ['floodgate'] }],
  ['vanity\'s fiend', { origin: 'non_engine', roles: ['floodgate'] }],
  ['majesty\'s fiend', { origin: 'non_engine', roles: ['floodgate'] }],
  ['amano-iwato', { origin: 'non_engine', roles: ['floodgate'] }],

  // 2026 meta staples (YCS Virginia 300th / Burst Protocol format)
  ['shiina, twin tempests of celestial thunder', { origin: 'non_engine', roles: ['handtrap', 'boardbreaker'] }],
  ['mulcharmy meowls', { origin: 'non_engine', roles: ['handtrap', 'draw', 'floodgate'] }],
  ['s:p little knight', { origin: 'non_engine', roles: ['boardbreaker', 'disruption'] }],
  ['divine arsenal aa-zeus - sky thunder', { origin: 'non_engine', roles: ['boardbreaker', 'payoff'] }],
  ['super starslayer ty-phon - sky crisis', { origin: 'non_engine', roles: ['boardbreaker', 'payoff'] }],
  ['i:p masquerena', { origin: 'non_engine', roles: ['extender', 'disruption'] }],
  ['knightmare unicorn', { origin: 'non_engine', roles: ['boardbreaker', 'payoff'] }],
  ['knightmare phoenix', { origin: 'non_engine', roles: ['boardbreaker', 'payoff'] }],
  ['accesscode talker', { origin: 'non_engine', roles: ['payoff', 'boardbreaker'] }],
  ['underworld goddess of the closed world', { origin: 'non_engine', roles: ['boardbreaker', 'payoff', 'floodgate'] }],
  ['guardian chimera', { origin: 'non_engine', roles: ['payoff', 'draw'] }],
  ['saryuja skull dread', { origin: 'non_engine', roles: ['payoff', 'draw'] }],
  ['imperial princess quinquery', { origin: 'non_engine', roles: ['payoff', 'floodgate'] }],

  // Generic extra deck toolbox (commonly sided/mained across meta)
  ['number 101: silent honor ark', { origin: 'non_engine', roles: ['boardbreaker', 'payoff'] }],
  ['number c101: silent honor dark', { origin: 'non_engine', roles: ['boardbreaker', 'payoff'] }],
  ['tornado dragon', { origin: 'non_engine', roles: ['boardbreaker', 'payoff'] }],
  ['abyss dweller', { origin: 'non_engine', roles: ['floodgate', 'payoff'] }],
  ['bagooska the terribly tired tapir', { origin: 'non_engine', roles: ['floodgate', 'payoff'] }],

  // Commonly sided going-second cards (2026 format)
  ['dark hole', { origin: 'non_engine', roles: ['boardbreaker'] }],
  ['book of eclipse', { origin: 'non_engine', roles: ['boardbreaker'] }],
  ['solemn warning', { origin: 'non_engine', roles: ['disruption'] }],
]

/** Static map of known card names → pre-assigned classifications. */
export const KNOWN_CARDS_MAP: ReadonlyMap<string, ClassificationSuggestion> =
  new Map(KNOWN_CARDS_MAP_ENTRIES)

/** A single heuristic rule that inspects card data and may contribute roles. */
interface HeuristicRule {
  id: string
  /** Returns roles this rule suggests for the given card, or empty array. */
  evaluate: (card: ApiCardReference) => CardRole[]
}

/** Roles that advance the player's own game plan. */
const GAME_PLAN_ROLES: ReadonlySet<CardRole> = new Set([
  'starter', 'extender', 'enabler', 'searcher', 'draw', 'payoff', 'recovery',
])

/** Roles that interact with the opponent. */
const INTERACTION_ROLES: ReadonlySet<CardRole> = new Set(['handtrap', 'disruption', 'boardbreaker', 'floodgate'])

/**
 * Pure function. Given a set of suggested roles, derives the origin. Con las reglas de la carta (bits de
 * CARD_RULE) pesan dos datos más: si los decks de torneo la juegan en cualquier arquetipo es non-engine aunque
 * robe o quite cartas; si menciona a su paquete y sólo interactúa (una trampa de arquetipo), es engine.
 */
export function deriveOrigin(roles: CardRole[], ruleFlags = 0): CardOrigin {
  if (roles.length === 0) {
    return 'non_engine'
  }

  if (ruleFlags & CARD_RULE.generic && roles.every((role) => INTERACTION_ROLES.has(role) || role === 'draw')) {
    return 'non_engine'
  }

  if (ruleFlags & CARD_RULE.mentions && !(ruleFlags & CARD_RULE.generic) && roles.every((role) => INTERACTION_ROLES.has(role))) {
    return 'engine'
  }

  const hasDeadCard = roles.includes('brick') || roles.includes('garnet')
  const hasGamePlan = roles.some((r) => GAME_PLAN_ROLES.has(r))
  const hasInteraction = roles.some((r) => INTERACTION_ROLES.has(r))

  // brick or garnet (and no interaction) → engine
  if (hasDeadCard && !hasInteraction) {
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

/**
 * Rol por tipo de carta cuando el texto no dio ninguna pista. Es una sugerencia (queda marcada para
 * revisar), pero evita que "Clasificar todo" deje cartas sin función y la clasificación no cierre.
 */
function fallbackRole(card: ApiCardReference): CardRole {
  const type = card.cardType.toLowerCase()
  const desc = card.description ?? ''
  const targetsOpponent = BOARDBREAKER_OPPONENT_TARGET.test(desc)

  if (isTrapCard(card)) {
    // Una trampa desconocida se juega en el turno del rival: interacción.
    return 'disruption'
  }

  if (isSpellCard(card)) {
    if (type.includes('quick-play')) {
      return targetsOpponent ? 'disruption' : 'extender'
    }

    // Ritual, campo, continua y equipo: piezas que otras cartas necesitan.
    if (type.includes('ritual') || type.includes('field') || type.includes('continuous') || type.includes('equip')) {
      return 'enabler'
    }

    if (SPECIAL_SUMMON_CLAUSE.test(desc)) {
      return 'starter'
    }

    return targetsOpponent ? 'boardbreaker' : 'enabler'
  }

  // Monstruo del Main sin pista: pieza del plan, a confirmar.
  return 'enabler'
}

const ruleHandtrap: HeuristicRule = {
  id: 'handtrap',
  evaluate(card) {
    const desc = card.description
    if (!desc) return []

    // Trap cards with hand-activation language
    if (isTrapCard(card) && HANDTRAP_TRAP_HAND_ACTIVATION.test(desc)) {
      return ['handtrap']
    }

    if (!isMonsterCard(card)) return []

    const hasHandActivation = HANDTRAP_HAND_ACTIVATION.test(desc)
    const hasDisruptionEffect = HANDTRAP_DISRUPTION_EFFECT.test(desc)
    const hasQuickEffect = HANDTRAP_QUICK_MONSTER.test(desc)

    if (hasHandActivation && hasDisruptionEffect) return ['handtrap']
    if (hasQuickEffect && hasDisruptionEffect) return ['handtrap']

    // "if your opponent" trigger + special summon from hand
    if (HANDTRAP_OPPONENT_TRIGGER.test(desc) && HANDTRAP_SPECIAL_SUMMON_FROM_HAND.test(desc)) {
      return ['handtrap']
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
    if (DRAW_PATTERN.test(desc) || DRAW_FILTER_PATTERN.test(desc)) return ['draw']

    // Excavate/reveal the top + add to hand (spell cards)
    if (isSpellCard(card) && DRAW_EXCAVATE_REVEAL.test(desc) && DRAW_ADD_TO_HAND.test(desc)) return ['draw']

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
    if (isContinuousSpellOrTrap(card) && FLOODGATE_RESTRICTION.test(desc)) return ['floodgate']
    if ((isSpellCard(card) || isTrapCard(card)) && FLOODGATE_RESTRICTION.test(desc) && !DISRUPTION_NEGATE.test(desc)) return ['floodgate']

    // Monster floodgates: "while this card is face-up" + "cannot"
    if (isMonsterCard(card) && FLOODGATE_MONSTER_FACE_UP.test(desc) && FLOODGATE_CANNOT.test(desc)) return ['floodgate']

    // "each player can only" or "neither player can" (any card type)
    if (FLOODGATE_PLAYER_RESTRICTION.test(desc)) return ['floodgate']

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
const RULE_SET: readonly HeuristicRule[] = [
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

  // Con script, los roles que son reglas puras salen de ahí; sin script, del texto.
  const ruleFlags = getCardRuleFlags(card.ygoprodeckId)
  const collectedRoles =
    ruleFlags === undefined ? rolesFromText(card, RULE_SET) : isExtraDeckMonster(card) ? rolesForExtraDeck(ruleFlags) : rolesFromRules(card, ruleFlags)

  // Rule 10 special: brick only applies if no other roles matched
  if (collectedRoles.includes('brick') && collectedRoles.length > 1) {
    const index = collectedRoles.indexOf('brick')
    collectedRoles.splice(index, 1)
  }

  if (collectedRoles.length === 0) {
    collectedRoles.push(fallbackRole(card))
  }

  // Que mencione a su paquete hace engine a una magia o trampa de arquetipo; un monstruo que sólo interactúa
  // (un Kaiju nombra a los Kaiju) sigue siendo non-engine.
  const originFlags = ruleFlags !== undefined && isMonsterCard(card) ? ruleFlags & ~CARD_RULE.mentions : ruleFlags
  const origin = deriveOrigin(collectedRoles, originFlags)

  return { origin, roles: collectedRoles }
}

function rolesFromText(card: ApiCardReference, rules: readonly HeuristicRule[]): CardRole[] {
  const collectedRoles: CardRole[] = []
  let hasBoardbreaker = false
  let hasFloodgate = false

  for (const rule of rules) {
    const suggested = rule.evaluate(card)

    if (suggested.length === 0) continue

    // Track boardbreaker/floodgate for mutual exclusion with removal/disruption
    if (rule.id === 'boardbreaker') {
      hasBoardbreaker = true
    }
    if (rule.id === 'floodgate') {
      hasFloodgate = true
    }

    // Rule 5 (removal): skip if boardbreaker already matched
    if (rule.id === 'removal' && hasBoardbreaker) continue

    // Rule 8 (disruption): skip if floodgate already matched
    if (rule.id === 'disruption' && hasFloodgate) continue

    for (const role of suggested) {
      if (!collectedRoles.includes(role)) {
        collectedRoles.push(role)
      }
    }
  }

  return collectedRoles
}

/** Lo único que sigue saliendo del texto con script: un monstruo de nivel alto sin más función es un brick. */
const TEXT_ONLY_RULES: readonly HeuristicRule[] = [ruleBrick]

/**
 * Los roles que las reglas de la carta justifican. Qué hace cada efecto, desde dónde y a quién le pega viene
 * del script (ver CARD_RULE); el tipo de carta decide cómo se lee: una trampa que quita es interacción en el
 * turno del rival, una magia que quita es para romper el campo yendo segundo.
 */
function rolesFromRules(card: ApiCardReference, flags: number): CardRole[] {
  const has = (bit: number) => (flags & bit) !== 0
  const trap = isTrapCard(card)
  const quickPlay = isSpellCard(card) && QUICK_PLAY_SPELL.test(card.cardType)
  const monster = isMonsterCard(card)
  const roles: CardRole[] = []

  if (has(CARD_RULE.handtrap)) roles.push('handtrap')
  if (has(CARD_RULE.search | CARD_RULE.recruit)) roles.push('searcher')
  if (has(CARD_RULE.draw)) roles.push('draw')
  // Un Kaiju también "se invoca desde la mano", pero al campo del rival: no extiende nada.
  if (monster && has(CARD_RULE.selfFromHand) && !has(CARD_RULE.givesToOpponent)) roles.push('extender')

  if (
    card.cardType.toLowerCase().includes('counter') ||
    ((trap || quickPlay) && has(CARD_RULE.negate | CARD_RULE.hitsEither)) ||
    (monster && has(CARD_RULE.quickFromField)) ||
    has(CARD_RULE.hitsGrave)
  ) {
    roles.push('disruption')
  }

  if (has(CARD_RULE.hitsOpponent | CARD_RULE.givesToOpponent) || (isSpellCard(card) && !quickPlay && has(CARD_RULE.hitsEither))) {
    roles.push('boardbreaker')
  }

  if (has(CARD_RULE.floodgate)) roles.push('floodgate')

  // Empieza la jugada: un monstruo que al entrar saca ventaja del Deck, o una magia que invoca o fusiona.
  // Una Quick-Play que invoca es un extender, como ya decía el rol por tipo.
  // Un monstruo de engine de nivel bajo con efecto al invocarse también: con él arrancás, aunque ese efecto no busque nada.
  const engineOpener = monster && (card.level ?? 0) <= 4 && has(CARD_RULE.onSummon) && !has(CARD_RULE.generic) && (has(CARD_RULE.mentions) || card.archetype !== null)

  if (has(CARD_RULE.starts) || engineOpener) {
    if (quickPlay) {
      if (!roles.includes('extender')) roles.push('extender')
    } else if (monster || isSpellCard(card)) {
      roles.push('starter')
    }
  }

  if (has(CARD_RULE.recovery)) roles.push('recovery')

  // Un jefe del Main: nivel alto con interacción propia en el campo.
  if (monster && (card.level ?? 0) >= 7 && has(CARD_RULE.quickFromField | CARD_RULE.floodgate | CARD_RULE.negate | CARD_RULE.pressures)) {
    roles.push('payoff')
  }

  // No se puede invocar normal y en la mano no hace nada: si otra carta la busca o la invoca es un garnet
  // (está en el deck para eso, no para robarla); si no, un brick.
  if (monster && CANNOT_NORMAL_SUMMON.test(card.description ?? '') && !has(CARD_RULE.usesHand)) {
    roles.push(has(CARD_RULE.referenced) ? 'garnet' : 'brick')
  }

  for (const role of rolesFromText(card, TEXT_ONLY_RULES)) {
    if (!roles.includes(role)) {
      roles.push(role)
    }
  }

  return roles
}

/** El Extra es todo payoff; con script, además, lo que cada carta sabe hacer. */
function rolesForExtraDeck(flags: number): CardRole[] {
  const has = (bit: number) => (flags & bit) !== 0
  const roles: CardRole[] = ['payoff']

  if (has(CARD_RULE.quickFromField | CARD_RULE.negate | CARD_RULE.hitsGrave)) roles.push('disruption')
  if (has(CARD_RULE.hitsOpponent | CARD_RULE.givesToOpponent)) roles.push('boardbreaker')
  if (has(CARD_RULE.floodgate)) roles.push('floodgate')
  if (has(CARD_RULE.search | CARD_RULE.recruit)) roles.push('searcher')
  if (has(CARD_RULE.draw)) roles.push('draw')
  if (has(CARD_RULE.recovery)) roles.push('recovery')

  return roles
}
