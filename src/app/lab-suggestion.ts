import type { CardEntry, CardRole, HandPattern, TurnView } from '../types'
import { buildDerivedDeckGroupMap, getCardRoleDefinition } from './deck-groups'
import type { LabOdds } from './lab-odds'
import { resolveConditionCardIds } from './patterns'
import type { LabViewResult } from './probability-lab'

/** Por debajo de esta probabilidad el "problema principal" no vale la pena marcarlo. */
const MIN_CULPRIT_PROBABILITY = 0.02
/** Mejora mínima de manos limpias (en puntos de probabilidad) para recomendar un cambio. */
const MIN_CLEAN_GAIN = 0.003
const MAX_COPIES = 3
/** Tope de variantes a calcular: cada una enumera todas las manos, en celulares pesa. */
const MAX_CANDIDATES = 6

/** Qué le quita más manos limpias al deck en la vista activa. */
export interface Culprit {
  kind: 'problem' | 'no-opening'
  /** Regla que causa el problema (null cuando son manos sin ninguna salida). */
  patternId: string | null
  name: string
  probability: number
}

export interface Change {
  action: 'remove' | 'add'
  card: CardEntry
}

/** Familias de cartas con las que un jugador razona el deck: "sacá un starter y meté una handtrap". */
export type RoleGroup = 'starter' | 'interaction' | 'brick' | 'filler'

export const ROLE_GROUP_LABEL: Record<RoleGroup, string> = {
  starter: 'starter',
  interaction: 'handtrap',
  brick: 'brick',
  filler: 'carta de relleno',
}

/** Un cambio a probar (sacar una copia, sumar una, o cambiar una por otra) y el deck resultante. */
export interface Candidate {
  changes: Change[]
  cards: CardEntry[]
  /** Familia de la que sale y a la que entra la copia (para decirlo como lo diría un jugador). */
  swap: { from: RoleGroup | null; to: RoleGroup | null }
}

export interface Evaluation {
  candidate: Candidate
  odds: LabOdds | null
}

export interface Outcome {
  changes: Change[]
  swap: Candidate['swap']
  culpritProbability: number
  cleanProbability: number
}

export function findCulprit(result: LabViewResult): Culprit | null {
  const problemRules = result.segmentRules.withProblem.filter((rule) => rule.kind === 'problem')
  const topProblem = problemRules.reduce<(typeof problemRules)[number] | null>(
    (best, rule) => (!best || rule.jointProbability > best.jointProbability ? rule : best),
    null,
  )
  const problemProbability = topProblem
    ? (result.patternResults.find((entry) => entry.patternId === topProblem.patternId)?.probability ?? 0)
    : 0

  if (topProblem && problemProbability >= result.noOpeningProbability && problemProbability >= MIN_CULPRIT_PROBABILITY) {
    return { kind: 'problem', patternId: topProblem.patternId, name: topProblem.name, probability: problemProbability }
  }

  return result.noOpeningProbability >= MIN_CULPRIT_PROBABILITY
    ? { kind: 'no-opening', patternId: null, name: 'Manos sin ninguna salida', probability: result.noOpeningProbability }
    : null
}

const adjust = (cards: CardEntry[], changes: Change[]): CardEntry[] => {
  const delta = new Map<string, number>()
  for (const { action, card } of changes) {
    delta.set(card.id, (delta.get(card.id) ?? 0) + (action === 'add' ? 1 : -1))
  }

  return cards.map((card) => ({ ...card, copies: card.copies + (delta.get(card.id) ?? 0) })).filter((card) => card.copies > 0)
}

/** Relleno para sacar una carta sin achicar el deck (el motor pide 40 cartas como mínimo). */
const NEUTRAL_CARD: CardEntry = {
  id: '__neutral__',
  name: 'una carta neutra',
  copies: 1,
  source: 'manual',
  apiCard: null,
  origin: 'non_engine',
  roles: ['tech'],
  needsReview: false,
}

const candidateOf = (cards: CardEntry[], changes: Change[], swap: Candidate['swap']): Candidate => {
  const net = changes.filter((change) => change.action === 'add').length - changes.filter((change) => change.action === 'remove').length
  const adjusted = adjust(cards, changes)

  return { changes, swap, cards: net < 0 ? [...adjusted, { ...NEUTRAL_CARD, copies: -net }] : adjusted }
}
const byCopies = (direction: 1 | -1) => (left: CardEntry, right: CardEntry) =>
  direction * (left.copies - right.copies) || left.name.localeCompare(right.name)

const STARTER_ROLES: readonly CardRole[] = ['starter', 'extender']
const INTERACTION_ROLES: readonly CardRole[] = ['handtrap', 'disruption', 'boardbreaker', 'removal', 'floodgate']

/** A qué familia pertenece una carta (la primera que corresponda: starter > handtrap > brick > relleno). */
export function roleGroupOf(card: CardEntry): RoleGroup | null {
  if (card.roles.some((role) => STARTER_ROLES.includes(role))) return 'starter'
  if (card.roles.some((role) => INTERACTION_ROLES.includes(role))) return 'interaction'
  if (card.roles.some((role) => role === 'brick' || role === 'garnet')) return 'brick'
  if (card.roles.length === 0 || card.roles.every((role) => role === 'tech')) return 'filler'
  return null
}

/**
 * Cambios que atacan al culpable, pensados como lo haría un jugador: mover un lugar del deck de una
 * familia a otra ("sacá un starter y meté una handtrap"), con el deck del mismo tamaño y respetando
 * el límite de copias del formato. Las familias brick y relleno solo se sacan si son non-engine:
 * un brick del engine es una pieza del combo y no se toca.
 */
export function buildCandidates(
  culprit: Culprit,
  cards: CardEntry[],
  checks: HandPattern[],
  maxCopiesOf: (card: CardEntry) => number = () => MAX_COPIES,
): Candidate[] {
  const room = (card: CardEntry) => maxCopiesOf(card) - card.copies
  // Quién sale: de cada familia, la carta con más copias (se pierde menos redundancia).
  const outgoing = (group: RoleGroup): CardEntry | undefined =>
    cards
      .filter((card) => roleGroupOf(card) === group && (group === 'starter' || group === 'interaction' || card.origin === 'non_engine'))
      .sort((left, right) => right.copies - left.copies || left.name.localeCompare(right.name))[0]
  // Quién entra: de la familia, la que más margen legal tiene y menos copias lleva.
  const incoming = (group: RoleGroup, not?: CardEntry): CardEntry | undefined =>
    cards
      .filter((card) => roleGroupOf(card) === group && room(card) > 0 && card.id !== not?.id)
      .sort((left, right) => room(right) - room(left) || left.copies - right.copies || left.name.localeCompare(right.name))[0]
  const swapOf = (from: RoleGroup, to: RoleGroup): Candidate | null => {
    const out = outgoing(from)
    const inn = incoming(to, out)

    return out && inn ? candidateOf(cards, [{ action: 'remove', card: out }, { action: 'add', card: inn }], { from, to }) : null
  }

  // A qué familia le falta cuota: lo que el problema por ausencia pide, o starters si no hay salida / hay bricks.
  const pattern = checks.find((check) => check.id === culprit.patternId)
  const deckGroups = buildDerivedDeckGroupMap(cards)
  const cardById = new Map(cards.map((card) => [card.id, card]))
  // Las reglas del sistema cuentan "grupos" armados con ids de cartas (pool), no solo roles: se mira qué
  // cartas son las que la regla pide NO tener y a qué familia pertenecen.
  const absentGroups = new Set(
    culprit.kind === 'problem'
      ? (pattern?.conditions ?? [])
          .filter((condition) => condition.kind === 'exclude')
          .flatMap((condition) => resolveConditionCardIds(condition, deckGroups, cards))
          .flatMap((cardId) => {
            const group = cardById.has(cardId) ? roleGroupOf(cardById.get(cardId)!) : null
            return group ? [group] : []
          })
      : [],
  )
  const wanted: RoleGroup[] = absentGroups.size > 0 ? [...absentGroups] : ['starter']
  // De dónde se saca el lugar, de lo más prescindible a lo más importante (nunca de la familia que se refuerza).
  const sources: RoleGroup[] = ['filler', 'brick', 'interaction', 'starter']
  const groups = new Set(cards.map(roleGroupOf))

  const swaps = wanted.flatMap((to) => sources.filter((from) => from !== to && groups.has(from)).map((from) => swapOf(from, to)))
  // Problema por presencia ("2+ Brick"): además, achicar la familia que lo causa (si es non-engine) a cambio de un starter.
  const presence =
    culprit.kind === 'problem' && absentGroups.size === 0
      ? [swapOf('brick', 'starter'), swapOf('brick', 'interaction')]
      : []

  return [...presence, ...swaps].filter((candidate): candidate is Candidate => candidate !== null).slice(0, MAX_CANDIDATES)
}

/**
 * Valor de la vista: 1º o 2º leen su lado; el promedio usa los turnos en los que la regla aplica
 * (una regla "Solo 2º" no existe yendo 1º), igual que el resultado del Lab.
 */
const pick = (odds: LabOdds | null, view: TurnView, read: (side: 'first' | 'second') => number | undefined): number | null => {
  if (!odds) {
    return null
  }

  const sides = view === 'average' ? (['first', 'second'] as const) : ([view] as const)
  const values = sides.map(read).filter((value): value is number => value !== undefined)

  return values.length > 0 ? values.reduce((total, value) => total + value, 0) / values.length : null
}

export function toOutcomes(culprit: Culprit, view: TurnView, evaluated: Evaluation[]): Outcome[] {
  return evaluated.flatMap(({ candidate, odds }) => {
    const cleanProbability = pick(odds, view, (side) => odds?.clean[side])
    const culpritProbability = pick(odds, view, (side) => (culprit.patternId ? odds?.rules[side].get(culprit.patternId) : odds?.[side]))

    return cleanProbability === null || culpritProbability === null ? [] : [{ changes: candidate.changes, swap: candidate.swap, culpritProbability, cleanProbability }]
  })
}

/** El cambio que más sube las manos limpias (si no sube lo suficiente, no hay recomendación). */
export function pickBest(outcomes: Outcome[], baseClean: number): Outcome | null {
  const best = outcomes.reduce<Outcome | null>((top, outcome) => (!top || outcome.cleanProbability > top.cleanProbability ? outcome : top), null)

  return best && best.cleanProbability - baseClean >= MIN_CLEAN_GAIN ? best : null
}

/**
 * Si nada mejora, el cambio que más baja el problema: sirve para explicar que moverlo
 * cuesta más manos limpias de las que ahorra.
 */
export function pickTradeoff(outcomes: Outcome[], baseCulprit: number): Outcome | null {
  return outcomes
    .filter((outcome) => outcome.culpritProbability < baseCulprit)
    .reduce<Outcome | null>((top, outcome) => (!top || outcome.culpritProbability < top.culpritProbability ? outcome : top), null)
}

/**
 * Cuando el problema es por ausencia ("0 Handtrap") y el deck no tiene ninguna carta de ese rol,
 * no hay una copia para sumar: se avisa qué rol falta.
 */
export function buildMissingRoleHint(culprit: Culprit, cards: CardEntry[], checks: HandPattern[]): string | null {
  const pattern = checks.find((check) => check.id === culprit.patternId)
  const groups = buildDerivedDeckGroupMap(cards)
  const labels = (pattern?.conditions ?? [])
    .filter((condition) => condition.kind === 'exclude' && condition.matcher?.type === 'role')
    .filter((condition) => resolveConditionCardIds(condition, groups, cards).length === 0)
    .map((condition) => (condition.matcher?.type === 'role' ? getCardRoleDefinition(condition.matcher.value).label : ''))

  return labels.length > 0 ? `Tu deck no tiene cartas con rol ${labels.join(', ')}: sumar alguna es lo que más lo baja.` : null
}

/** Problema por ausencia cuyas cartas "salvadoras" ya están al máximo de copias: hay que sumar cartas distintas. */
export function buildMaxedHint(
  culprit: Culprit,
  cards: CardEntry[],
  checks: HandPattern[],
  maxCopiesOf: (card: CardEntry) => number = () => MAX_COPIES,
): string | null {
  const pattern = checks.find((check) => check.id === culprit.patternId)
  const groups = buildDerivedDeckGroupMap(cards)
  const excludeIds = new Set(
    (pattern?.conditions ?? [])
      .filter((condition) => condition.kind === 'exclude')
      .flatMap((condition) => resolveConditionCardIds(condition, groups, cards)),
  )
  const saviors = cards.filter((card) => excludeIds.has(card.id))

  return saviors.length > 0 && saviors.every((card) => card.copies >= maxCopiesOf(card))
    ? `Las cartas que lo evitan (${saviors.map((card) => card.name).join(', ')}) ya están al máximo de copias que permite tu formato: para bajarlo, sumá cartas distintas con esos roles.`
    : null
}

/** Cartas del deck que cuentan para el problema (por presencia), sean o no sacables: sirve para nombrarlas. */
export function listCauses(culprit: Culprit, cards: CardEntry[], checks: HandPattern[]): CardEntry[] {
  if (culprit.kind !== 'problem') {
    return []
  }

  const pattern = checks.find((check) => check.id === culprit.patternId)
  const groups = buildDerivedDeckGroupMap(cards)
  const ids = new Set(
    (pattern?.conditions ?? [])
      .filter((condition) => condition.kind === 'include')
      .flatMap((condition) => resolveConditionCardIds(condition, groups, cards)),
  )

  return cards.filter((card) => ids.has(card.id)).sort(byCopies(-1))
}
