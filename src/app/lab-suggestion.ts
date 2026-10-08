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

/** Familias de cartas con las que un jugador razona el deck: "sacá un starter y meté una disruption". */
export type RoleGroup = 'starter' | 'interaction' | 'brick' | 'filler'

export const ROLE_GROUP_LABEL: Record<RoleGroup, string> = {
  starter: 'starter',
  interaction: 'disruption',
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
  /** Manos limpias por turno después del cambio (se muestra en el Promedio). */
  cleanBySide: { first: number; second: number } | null
  culpritProbability: number
  cleanProbability: number
}

/** Resultado de cada turno: sirve para ponderar bien las reglas que solo valen en uno (vista Promedio). */
export interface PerTurnResults {
  first: LabViewResult
  second: LabViewResult
}

/**
 * Qué le quita más manos limpias en la vista activa. En el Promedio una regla "Solo 2º" pesa la mitad
 * (no existe yendo 1º), así que el culpable global puede ser otro que el de cada turno.
 */
export function findCulprit(result: LabViewResult, perTurn?: PerTurnResults): Culprit | null {
  const effective = (patternId: string): number => {
    if (!perTurn) {
      return result.patternResults.find((entry) => entry.patternId === patternId)?.probability ?? 0
    }

    const read = (view: LabViewResult) => view.patternResults.find((entry) => entry.patternId === patternId)?.probability ?? 0
    return (read(perTurn.first) + read(perTurn.second)) / 2
  }
  const problemRules = result.segmentRules.withProblem.filter((rule) => rule.kind === 'problem')
  const topProblem = problemRules.reduce<(typeof problemRules)[number] | null>(
    (best, rule) => (!best || effective(rule.patternId) > effective(best.patternId) ? rule : best),
    null,
  )
  const problemProbability = topProblem ? effective(topProblem.patternId) : 0

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
const INTERACTION_ROLES: readonly CardRole[] = ['disruption', 'boardbreaker']

/** A qué familia pertenece una carta (la primera que corresponda: starter > disruption > brick > relleno). */
export function roleGroupOf(card: CardEntry): RoleGroup | null {
  if (card.roles.some((role) => STARTER_ROLES.includes(role))) return 'starter'
  if (card.roles.some((role) => INTERACTION_ROLES.includes(role))) return 'interaction'
  if (card.roles.includes('brick')) return 'brick'
  if (card.roles.length === 0 || card.roles.every((role) => role === 'tech')) return 'filler'
  return null
}

/**
 * Cambios que atacan al culpable, pensados como lo haría un jugador: mover un lugar del deck de una
 * familia a otra ("sacá un starter y meté una disruption"), con el deck del mismo tamaño y respetando
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
  const pattern = checks.find((check) => check.id === culprit.patternId)
  const deckGroups = buildDerivedDeckGroupMap(cards)
  // Las reglas del sistema cuentan pools de cartas (no solo roles): se resuelve qué cartas pide la regla
  // tener (causan el problema) y cuáles pide NO tener (lo evitan).
  const idsOf = (conditionKind: 'include' | 'exclude') =>
    new Set(
      culprit.kind === 'problem'
        ? (pattern?.conditions ?? [])
            .filter((condition) => condition.kind === conditionKind)
            .flatMap((condition) => resolveConditionCardIds(condition, deckGroups, cards))
        : [],
    )
  const saviorIds = idsOf('exclude')
  const causeIds = idsOf('include')
  const isAbsence = saviorIds.size > 0

  // Quién sale: de cada familia, la carta con más copias (se pierde menos redundancia). El engine no se toca
  // salvo starters; un brick/relleno del engine es una pieza del combo.
  const outgoing = (group: RoleGroup, notIds: ReadonlySet<string>): CardEntry | undefined =>
    cards
      .filter((card) => roleGroupOf(card) === group && !notIds.has(card.id) && (group === 'starter' || group === 'interaction' || card.origin === 'non_engine'))
      .sort((left, right) => right.copies - left.copies || left.name.localeCompare(right.name))[0]
  const byRoom = (left: CardEntry, right: CardEntry) => room(right) - room(left) || left.copies - right.copies || left.name.localeCompare(right.name)
  const swap = (out: CardEntry | undefined, inn: CardEntry | undefined): Candidate | null => {
    const from = out ? (roleGroupOf(out) ?? 'filler') : null
    const to = inn ? (roleGroupOf(inn) ?? 'filler') : null

    return out && inn && out.id !== inn.id
      ? candidateOf(cards, [{ action: 'remove', card: out }, { action: 'add', card: inn }], { from, to })
      : null
  }
  // De dónde se saca el lugar, de lo más prescindible a lo más importante.
  const sources: RoleGroup[] = ['filler', 'brick', 'interaction', 'starter']

  // Sin salida (o como alternativa de un problema): entra un starter/extender a costa de lo más prescindible.
  const openerSwaps = (): Array<Candidate | null> =>
    cards
      .filter((card) => roleGroupOf(card) === 'starter' && room(card) > 0 && !causeIds.has(card.id))
      .sort(byRoom)
      .slice(0, 2)
      .flatMap((inn) => sources.filter((from) => from !== 'starter').map((from) => swap(outgoing(from, new Set()), inn)))

  let candidates: Array<Candidate | null>

  if (isAbsence) {
    // "Sin interrupción": entra una carta de las que la regla cuenta (no cualquier handtrap) con margen legal.
    const savers = cards.filter((card) => saviorIds.has(card.id) && room(card) > 0).sort(byRoom).slice(0, 2)
    candidates = savers.flatMap((inn) => sources.map((from) => swap(outgoing(from, saviorIds), inn)))
  } else if (culprit.kind === 'problem') {
    // "2+ Brick" / "2+ Mulcharmy": sale una copia de lo que lo causa (non-engine) y entra un starter;
    // si lo causan piezas del engine, queda subir las salidas por otro lado.
    const causes = cards
      .filter((card) => causeIds.has(card.id) && card.origin === 'non_engine')
      .sort((left, right) => right.copies - left.copies || left.name.localeCompare(right.name))
      .slice(0, 2)
    const starters = cards.filter((card) => roleGroupOf(card) === 'starter' && !causeIds.has(card.id) && room(card) > 0).sort(byRoom)
    candidates = [...causes.flatMap((out) => starters.slice(0, 2).map((inn) => swap(out, inn))), ...openerSwaps()]
  } else {
    candidates = openerSwaps()
  }

  return candidates.filter((candidate): candidate is Candidate => candidate !== null).slice(0, MAX_CANDIDATES)
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
  const values = sides.map(read)

  // Una regla "Solo 2º" no existe yendo 1º: en el Promedio vale 0 ese turno (igual que el culpable global).
  if (view !== 'average' && values[0] === undefined) {
    return null
  }

  return values.reduce<number>((total, value) => total + (value ?? 0), 0) / values.length
}

export function toOutcomes(culprit: Culprit, view: TurnView, evaluated: Evaluation[]): Outcome[] {
  return evaluated.flatMap(({ candidate, odds }) => {
    const cleanProbability = pick(odds, view, (side) => odds?.clean[side])
    const culpritProbability = pick(odds, view, (side) => (culprit.patternId ? odds?.rules[side].get(culprit.patternId) : odds?.[side]))

    return cleanProbability === null || culpritProbability === null ? [] : [{ changes: candidate.changes, swap: candidate.swap, cleanBySide: view === 'average' && odds ? odds.clean : null, culpritProbability, cleanProbability }]
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
