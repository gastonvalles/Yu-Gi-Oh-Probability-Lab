import type { CardEntry, HandPattern, TurnView } from '../types'
import { buildDerivedDeckGroupMap, getCardRoleDefinition } from './deck-groups'
import type { LabOdds } from './lab-odds'
import { resolveConditionCardIds } from './patterns'
import type { LabViewResult } from './probability-lab'

/** Por debajo de esta probabilidad el "problema principal" no vale la pena marcarlo. */
const MIN_CULPRIT_PROBABILITY = 0.02
const MAX_CANDIDATES = 3
const MAX_COPIES = 3

/** Qué le quita más manos limpias al deck en la vista activa. */
export interface Culprit {
  kind: 'problem' | 'no-opening'
  /** Regla que causa el problema (null cuando son manos sin ninguna salida). */
  patternId: string | null
  name: string
  probability: number
}

export interface Candidate {
  action: 'remove' | 'add'
  card: CardEntry
  /** Deck con el cambio aplicado (una copia menos / una más). */
  cards: CardEntry[]
}

export interface Suggestion {
  action: Candidate['action']
  card: CardEntry
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

const withCopies = (cards: CardEntry[], cardId: string, delta: number): CardEntry[] =>
  cards.map((card) => (card.id === cardId ? { ...card, copies: card.copies + delta } : card)).filter((card) => card.copies > 0)

/** Cambios de una copia que atacan al culpable: sacar lo que causa el problema, sumar lo que falta, o sumar starters. */
export function buildCandidates(culprit: Culprit, cards: CardEntry[], checks: HandPattern[]): Candidate[] {
  if (culprit.kind === 'problem') {
    const pattern = checks.find((check) => check.id === culprit.patternId)
    const groups = buildDerivedDeckGroupMap(cards)
    const idsOf = (conditionKind: 'include' | 'exclude') =>
      new Set(
        (pattern?.conditions ?? [])
          .filter((condition) => condition.kind === conditionKind)
          .flatMap((condition) => resolveConditionCardIds(condition, groups, cards)),
      )
    // Un problema por presencia ("2+ Brick") baja sacando copias; uno por ausencia ("0 Handtrap") baja sumándolas.
    const causes = cards.filter((card) => idsOf('include').has(card.id)).sort((l, r) => r.copies - l.copies || l.name.localeCompare(r.name))
    const missing = cards
      .filter((card) => idsOf('exclude').has(card.id) && card.copies < MAX_COPIES)
      .sort((l, r) => l.copies - r.copies || l.name.localeCompare(r.name))
    const perKind = causes.length > 0 && missing.length > 0 ? 2 : MAX_CANDIDATES

    return [
      ...causes.slice(0, perKind).map((card): Candidate => ({ action: 'remove', card, cards: withCopies(cards, card.id, -1) })),
      ...missing.slice(0, perKind).map((card): Candidate => ({ action: 'add', card, cards: withCopies(cards, card.id, 1) })),
    ]
  }

  const openers = (role: 'starter' | 'extender') =>
    cards
      .filter((card) => card.roles.includes(role) && card.copies < MAX_COPIES)
      .sort((left, right) => left.copies - right.copies || left.name.localeCompare(right.name))
  const pool = openers('starter').length > 0 ? openers('starter') : openers('extender')

  return pool.slice(0, MAX_CANDIDATES).map((card) => ({ action: 'add', card, cards: withCopies(cards, card.id, 1) }))
}

const pick = (odds: LabOdds | null, view: TurnView, read: (side: 'first' | 'second') => number | undefined): number | null => {
  if (!odds) {
    return null
  }

  const first = read('first')
  const second = read('second')

  if (first === undefined || second === undefined) {
    return null
  }

  return view === 'first' ? first : view === 'second' ? second : (first + second) / 2
}

/** Elige el cambio que más sube las manos limpias (si no sube casi nada, no hay sugerencia). */
export function pickBestSuggestion(
  culprit: Culprit,
  baseClean: number,
  view: TurnView,
  evaluated: Array<{ candidate: Candidate; odds: LabOdds | null }>,
  minGain = 0.005,
): Suggestion | null {
  let best: Suggestion | null = null

  for (const { candidate, odds } of evaluated) {
    const clean = pick(odds, view, (side) => odds?.clean[side])
    const culpritProbability = pick(odds, view, (side) =>
      culprit.patternId ? odds?.rules[side].get(culprit.patternId) : odds?.[side],
    )

    if (clean === null || culpritProbability === null || clean - baseClean < minGain) {
      continue
    }

    if (!best || clean > best.cleanProbability) {
      best = { action: candidate.action, card: candidate.card, culpritProbability, cleanProbability: clean }
    }
  }

  return best
}

/**
 * Cuando el problema es por ausencia ("0 Handtrap") y el deck no tiene ninguna carta de ese rol,
 * no hay una copia para sumar: se avisa qué rol falta.
 */
export function buildMissingRoleHint(culprit: Culprit, cards: CardEntry[], checks: HandPattern[]): string | null {
  if (culprit.kind === 'no-opening') {
    return buildCandidates(culprit, cards, checks).length === 0
      ? 'Ya tenés el máximo de copias de tus Starters y Extenders: para mejorarlo, sumá cartas distintas con esos roles.'
      : null
  }

  const pattern = checks.find((check) => check.id === culprit.patternId)
  const groups = buildDerivedDeckGroupMap(cards)
  const labels = (pattern?.conditions ?? [])
    .filter((condition) => condition.kind === 'exclude' && condition.matcher?.type === 'role')
    .filter((condition) => resolveConditionCardIds(condition, groups, cards).length === 0)
    .map((condition) => (condition.matcher?.type === 'role' ? getCardRoleDefinition(condition.matcher.value).label : ''))

  return labels.length > 0 ? `Tu deck no tiene cartas con rol ${labels.join(', ')}: sumar alguna es lo que más lo baja.` : null
}
