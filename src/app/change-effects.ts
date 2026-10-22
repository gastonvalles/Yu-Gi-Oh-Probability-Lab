import type { TurnContext, TurnView } from '../types'
import { buildActiveRules, type ComparisonRules, type HandCount } from './build-comparison'
import { deriveMainDeckCardsFromZone } from './calculator-state'
import type { MainChange } from './change-pairs'
import type { LabOdds, LabOddsInput } from './lab-odds'
import type { DeckCardInstance } from './model'
import { labInputSignature } from './probability-lab'
import { buildRoleDistributions, choose } from './role-distribution'

/**
 * El efecto de CADA cambio de «Qué cambiaste» por separado: el deck A con ese cambio solo, medido con el mismo motor y las mismas reglas
 * que Comparar. De ahí salen el «▲3» de cada cambio y el «qué cartas la mueven» de cada fila espejo (todas las medidas salen del mismo
 * cálculo: abrir una fila no cuesta otro). Puro: el hook `useChangeEffects` pide los cálculos a los workers.
 */

/**
 * Una medida de Comparar: manos buenas (`clean`), sin salida, con problema, una regla (`rule:<id del patrón>`, el `RuleComparisonRow.id`)
 * o un rol (`role:<key>`, el `RoleDistribution.key`: starter, extender, interaction, brick).
 */
export type MeasureKey = 'clean' | 'noOpening' | 'withProblem' | `rule:${string}` | `role:${string}`

export const ruleMeasure = (patternId: string): MeasureKey => `rule:${patternId}`
export const roleMeasure = (roleKey: string): MeasureKey => `role:${roleKey}`

/** Probabilidad (0 a 1) por turno; `null` donde no aplica (una regla «Solo 1º» yendo 2º). El promedio es el de Comparar. */
export interface TurnValues {
  first: number | null
  second: number | null
  average: number | null
}

/** Lo que vale cada medida en un deck y cuántas manos posibles hay en cada turno (para decir «N de M»). */
export interface MeasureSnapshot {
  values: Record<string, TurnValues>
  totals: { first: number; second: number }
}

export interface ChangeEffect {
  /** Con el cambio menos sin él, por medida (`MeasureKey`), en probabilidad: 0,03 son 3 manos más de cada 100. */
  delta: Record<string, TurnValues>
  /** Los valores del deck A con el cambio. */
  after: MeasureSnapshot
}

export type ChangeEffectResult =
  | { status: 'loading' }
  /** Una carta del cambio no tiene clasificación: se mide al clasificarla (la pantalla muestra «?»). */
  | { status: 'pending' }
  /** Pasó el tope de cambios medidos (`MAX_MEASURED_CHANGES`). */
  | { status: 'skipped' }
  /** El motor no lo pudo medir (un deck de menos de 40, reglas que no se pueden calcular). */
  | { status: 'blocked' }
  | { status: 'done'; effect: ChangeEffect }

/** Cada cambio es una enumeración entera en un worker: en un celular, más de esto no se mide. */
export const MAX_MEASURED_CHANGES = 8
/** Una diferencia menor que esto se vería «0,0» de cada 100: no mueve la medida. */
const MIN_SHOWN_DELTA = 0.0005

const mainIdOf = (card: DeckCardInstance) => card.apiCard.ygoprodeckId

/** El Main de A con ese cambio solo: sin las copias que salen y con las que entran (copias de la de B). El orden no cambia la cuenta. */
export function applyChangeToMain(main: DeckCardInstance[], change: MainChange): DeckCardInstance[] {
  let next = main

  if (change.out) {
    const outId = mainIdOf(change.out.card)
    let removed = 0

    next = next.filter((card) => {
      if (removed < change.copies && mainIdOf(card) === outId) {
        removed += 1
        return false
      }

      return true
    })
  }

  if (change.in) {
    const template = change.in.card
    next = [...next, ...Array.from({ length: change.copies }, (_, index) => ({ ...template, instanceId: `${template.instanceId}~${index}` }))]
  }

  return next
}

/** Lo que se le pide al motor para un Main (las reglas activas dependen de las cartas, como en Comparar). */
export function oddsInputOf(main: DeckCardInstance[], rules: ComparisonRules): LabOddsInput {
  const cards = deriveMainDeckCardsFromZone(main)

  return { cards, patterns: buildActiveRules(cards, rules), handSize: rules.handSize }
}

/** Clave de caché por contenido (la misma enumeración de antes no se repite). */
export const oddsKeyOf = (input: LabOddsInput) => `change|${labInputSignature(input.cards, input.patterns, input.handSize)}`

const mean = (values: Array<number | null>): number | null => {
  const present = values.filter((value): value is number => value !== null)

  return present.length === 0 ? null : present.reduce((total, value) => total + value, 0) / present.length
}

const both = (first: number, second: number): TurnValues => ({ first, second, average: (first + second) / 2 })

const appliesTo = (context: TurnContext, turn: 'first' | 'second') => context === 'either' || context === turn

/** Todas las medidas de un deck a partir de lo que calculó el motor. */
export function measureSnapshot(odds: LabOdds, input: LabOddsInput): MeasureSnapshot {
  const deckSize = input.cards.reduce((total, card) => total + card.copies, 0)
  const values: Record<string, TurnValues> = {
    clean: both(odds.clean.first, odds.clean.second),
    noOpening: both(odds.first, odds.second),
    // Limpias + con problema + sin salida son todas las manos.
    withProblem: both(Math.max(0, 1 - odds.clean.first - odds.first), Math.max(0, 1 - odds.clean.second - odds.second)),
  }

  for (const rule of input.patterns) {
    const turn = (side: 'first' | 'second') => (appliesTo(rule.turnContext, side) ? (odds.rules[side].get(rule.id) ?? 0) : null)
    const first = turn('first')
    const second = turn('second')

    values[ruleMeasure(rule.id)] = { first, second, average: mean([first, second]) }
  }

  const firstRoles = buildRoleDistributions(input.cards, [input.handSize])
  const secondRoles = buildRoleDistributions(input.cards, [input.handSize + 1])

  firstRoles.forEach((role, index) => {
    values[roleMeasure(role.key)] = both(role.atLeastOne, secondRoles[index]?.atLeastOne ?? 0)
  })

  return {
    values,
    totals: { first: Math.round(choose(deckSize, input.handSize)), second: Math.round(choose(deckSize, input.handSize + 1)) },
  }
}

const minus = (after: number | null, before: number | null) => (after === null || before === null ? null : after - before)
// Una regla que una de las dos versiones no evalúa (le falta la carta) vale 0 en los turnos en que aplica, como en Comparar.
const zeroLike = (values: TurnValues): TurnValues => ({
  first: values.first === null ? null : 0,
  second: values.second === null ? null : 0,
  average: values.average === null ? null : 0,
})

export function changeEffectOf(base: MeasureSnapshot, after: MeasureSnapshot): ChangeEffect {
  const keys = new Set([...Object.keys(base.values), ...Object.keys(after.values)])
  const delta: Record<string, TurnValues> = {}

  for (const key of keys) {
    const afterValues = after.values[key] ?? zeroLike(base.values[key]!)
    const baseValues = base.values[key] ?? zeroLike(afterValues)

    delta[key] = {
      first: minus(afterValues.first, baseValues.first),
      second: minus(afterValues.second, baseValues.second),
      average: minus(afterValues.average, baseValues.average),
    }
  }

  return { delta, after }
}

/** Cuántas manos cumplen esa medida de cuántas, en un turno (`null` si no aplica o no hay dato). */
export function handsOf(snapshot: MeasureSnapshot, measure: MeasureKey, turn: 'first' | 'second'): HandCount | null {
  const value = snapshot.values[measure]?.[turn] ?? null

  return value === null ? null : { hands: Math.round(value * snapshot.totals[turn]), total: snapshot.totals[turn] }
}

export interface Mover {
  change: MainChange
  /** Lo que ese cambio solo le suma (o resta) a la medida, en probabilidad. */
  delta: number
}

/** «Qué la mueve»: los cambios ya medidos que mueven esa medida en esa vista, del que más al que menos (sin los que no la mueven). */
export function whatMovesMeasure(
  changes: readonly MainChange[],
  results: Readonly<Record<string, ChangeEffectResult>>,
  measure: MeasureKey,
  view: TurnView,
): Mover[] {
  return changes
    .flatMap((change) => {
      const result = results[change.key]
      const delta = result?.status === 'done' ? (result.effect.delta[measure]?.[view] ?? null) : null

      return delta !== null && Math.abs(delta) >= MIN_SHOWN_DELTA ? [{ change, delta }] : []
    })
    .sort((left, right) => Math.abs(right.delta) - Math.abs(left.delta))
}
