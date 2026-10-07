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
const MAX_CANDIDATES = 5
const OPENING_ROLES: readonly CardRole[] = ['starter', 'extender', 'enabler', 'searcher', 'draw', 'combo_piece']

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

/** Un cambio a probar (sacar una copia, sumar una, o cambiar una por otra) y el deck resultante. */
export interface Candidate {
  changes: Change[]
  cards: CardEntry[]
}

export interface Evaluation {
  candidate: Candidate
  odds: LabOdds | null
}

export interface Outcome {
  changes: Change[]
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

const candidateOf = (cards: CardEntry[], changes: Change[]): Candidate => {
  const net = changes.filter((change) => change.action === 'add').length - changes.filter((change) => change.action === 'remove').length
  const adjusted = adjust(cards, changes)

  return { changes, cards: net < 0 ? [...adjusted, { ...NEUTRAL_CARD, copies: -net }] : adjusted }
}
const byCopies = (direction: 1 | -1) => (left: CardEntry, right: CardEntry) =>
  direction * (left.copies - right.copies) || left.name.localeCompare(right.name)
const isOpener = (card: CardEntry) => card.roles.some((role) => OPENING_ROLES.includes(role))

/** Roles que no se tocan salvo que no quede otra: son lo que el deck usa para jugar contra el rival. */
const VALUABLE_ROLES: readonly CardRole[] = ['handtrap', 'disruption', 'boardbreaker', 'removal', 'floodgate']
const SUPPORT_ROLES: readonly CardRole[] = ['payoff', 'recovery', 'draw', 'searcher']

/**
 * Cuánto cuesta sacar una carta (menor = más fácil de sacrificar): lo que el propio deck marcó como
 * mala (Brick/Garnet) primero, después el relleno (Tech o sin roles), el soporte y, último, la interacción.
 */
export function cutCost(card: CardEntry): number {
  if (card.roles.some((role) => role === 'brick' || role === 'garnet')) return 0
  if (card.roles.length === 0 || card.roles.every((role) => role === 'tech')) return 1
  if (card.roles.some((role) => VALUABLE_ROLES.includes(role))) return 4
  return card.roles.some((role) => SUPPORT_ROLES.includes(role)) ? 3 : 2
}

/**
 * Cambios que atacan al culpable, siempre con el deck del mismo tamaño y respetando el límite de
 * copias del formato (banlist):
 * - problema por presencia ("2+ Brick"): sacar una copia de lo que lo causa, o cambiarla por un opener;
 * - problema por ausencia ("0 Handtrap"): sumar lo que falta a costa de la carta más sacrificable;
 * - manos sin salida: cambiar la carta más sacrificable por un starter/extender.
 */
export function buildCandidates(
  culprit: Culprit,
  cards: CardEntry[],
  checks: HandPattern[],
  maxCopiesOf: (card: CardEntry) => number = () => MAX_COPIES,
): Candidate[] {
  const hasRoom = (card: CardEntry) => card.copies < maxCopiesOf(card)
  const room = (card: CardEntry) => maxCopiesOf(card) - card.copies
  const openers = (role: 'starter' | 'extender') => cards.filter((card) => card.roles.includes(role) && hasRoom(card)).sort(byCopies(1))
  const openersPool = [...openers('starter'), ...openers('extender')].slice(0, 2)
  const cuttable = (excluded: Set<string>) =>
    cards.filter((card) => !excluded.has(card.id) && !isOpener(card)).sort((left, right) => cutCost(left) - cutCost(right) || right.copies - left.copies || left.name.localeCompare(right.name))
  const withCut = (cut: CardEntry | undefined, card: CardEntry) =>
    candidateOf(cards, [...(cut ? [{ action: 'remove' as const, card: cut }] : []), { action: 'add', card }])

  if (culprit.kind === 'no-opening') {
    const cut = cuttable(new Set(openersPool.map((card) => card.id)))[0]

    return openersPool.map((card) => withCut(cut, card))
  }

  const pattern = checks.find((check) => check.id === culprit.patternId)
  const groups = buildDerivedDeckGroupMap(cards)
  const idsOf = (conditionKind: 'include' | 'exclude') =>
    new Set(
      (pattern?.conditions ?? [])
        .filter((condition) => condition.kind === conditionKind)
        .flatMap((condition) => resolveConditionCardIds(condition, groups, cards)),
    )
  const includeIds = idsOf('include')
  const excludeIds = idsOf('exclude')
  // Un problema por presencia baja sacando copias; uno por ausencia baja sumándolas (solo las que la banlist permite).
  const causes = cards.filter((card) => includeIds.has(card.id)).sort((l, r) => cutCost(l) - cutCost(r) || r.copies - l.copies).slice(0, 3)
  const missing = cards.filter((card) => excludeIds.has(card.id) && hasRoom(card)).sort((l, r) => room(r) - room(l) || l.copies - r.copies).slice(0, 2)
  const cut = cuttable(new Set([...excludeIds, ...openersPool.map((card) => card.id)]))[0]

  // En orden de prioridad (se recorta a MAX_CANDIDATES): lo que ataca el problema primero; subir salidas, al final.
  const candidates = [
    ...causes.map((card) => candidateOf(cards, [{ action: 'remove', card }])),
    ...missing.map((card) => withCut(cut, card)),
    // Si el problema en sí no se puede bajar sin perder más de lo que se gana, queda subir las salidas.
    ...openersPool.map((card) => withCut(cut, card)),
  ]

  return candidates.slice(0, MAX_CANDIDATES)
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

    return cleanProbability === null || culpritProbability === null ? [] : [{ changes: candidate.changes, culpritProbability, cleanProbability }]
  })
}

/** El cambio que más sube las manos limpias (si no sube lo suficiente, no hay recomendación). */
export function pickBest(outcomes: Outcome[], baseClean: number): Outcome | null {
  const best = outcomes.reduce<Outcome | null>((top, outcome) => (!top || outcome.cleanProbability > top.cleanProbability ? outcome : top), null)

  return best && best.cleanProbability - baseClean >= MIN_CLEAN_GAIN ? best : null
}

/**
 * Si nada mejora, el cambio que más baja el problema: sirve para explicar que sacar esas cartas
 * cuesta más salidas de las que ahorra.
 */
export function pickTradeoff(outcomes: Outcome[], baseCulprit: number): Outcome | null {
  return outcomes
    .filter((outcome) => outcome.changes.length === 1 && outcome.changes[0].action === 'remove' && outcome.culpritProbability < baseCulprit)
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

/** Cartas del deck que causan el problema (para nombrarlas cuando no hay un cambio que convenga). */
export function listCauses(culprit: Culprit, cards: CardEntry[], checks: HandPattern[]): CardEntry[] {
  if (culprit.kind !== 'problem') {
    return []
  }

  return buildCandidates(culprit, cards, checks)
    .filter((candidate) => candidate.changes.length === 1 && candidate.changes[0].action === 'remove')
    .map((candidate) => candidate.changes[0].card)
}
