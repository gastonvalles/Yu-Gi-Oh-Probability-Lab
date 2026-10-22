import type { BuildComparison, BuildMetrics, HandCount, RuleComparisonRow } from '../../app/build-comparison'
import { roleMeasure, ruleMeasure, type MeasureKey } from '../../app/change-effects'
import type { LabViewResult } from '../../app/probability-lab'
import { formatInteger } from '../../app/utils'
import { numberLocale, perLocale, t } from '../../i18n'
import type { TurnView } from '../../types'
import { formatPer100 } from '../ui/ring-shared'

/**
 * Las filas espejo de Comparar (`A | medida ▲/▼ | B`), puras y sin DOM: de dónde sale cada número en cada vista (Promedio, Yendo 1º, Yendo 2º),
 * cuánto se aparta B de A, quién gana y qué filas van juntas. La pantalla sólo las dibuja.
 */

export type Side = 'A' | 'B'
export type Turn = 'first' | 'second'

export const TURNS: readonly Turn[] = ['first', 'second']
export const VIEWS: readonly TurnView[] = ['average', 'first', 'second']
export const TURN_LABEL = { first: 'meta.compare.rowFirst', second: 'meta.compare.rowSecond' } as const

/** Menos que esto (en décimas de punto, 0,5 pp) entre las dos builds no es una diferencia: el veredicto también lo trata como empate. */
const MIN_GAP = 5

/** Los % se comparan con un decimal: dos valores son "iguales" sólo si se ven iguales. */
const shown = (value: number) => Math.round(value * 1000)

/** Lo que vale una medida en A y en B (probabilidad); `null` donde no aplica (una regla «Solo 1º» yendo 2º) o todavía no hay cálculo. */
export interface Pair {
  a: number | null
  b: number | null
}

/**
 * B contra A en puntos «de cada 100», enteros y con signo (menos de uno se dice uno): `0` si la diferencia es menor que `MIN_GAP` y `null` si no se puede
 * comparar. Es el ▲/▼ de toda la pantalla.
 */
export function deltaPoints({ a, b }: Pair): number | null {
  if (a === null || b === null) {
    return null
  }

  const gap = shown(b) - shown(a)

  return Math.abs(gap) < MIN_GAP ? 0 : Math.sign(gap) * Math.max(1, Math.round(Math.abs(gap) / 10))
}

/** Quién gana en esa vista: `null` si es empate o no se puede comparar. Para lo que traba (sin salida, un problema, los bricks) el menor es el mejor. */
export function winnerOf(pair: Pair, higherIsBetter: boolean): Side | null {
  const points = deltaPoints(pair)

  return points ? (points > 0 === higherIsBetter ? 'B' : 'A') : null
}

/** El número «de cada 100» de un valor, como el centro de un anillo («<1», «>99»); «—» si no aplica. */
export const per100 = (value: number | null) => (value === null ? '—' : formatPer100(value))

/** El valor con su decimal, como lo escribe el idioma, para el nombre accesible y la ficha («81,3»). */
const oneDecimal = perLocale((tag) => new Intl.NumberFormat(tag, { minimumFractionDigits: 1, maximumFractionDigits: 1 }))
export const per100Exact = (value: number | null) => (value === null ? '—' : oneDecimal(numberLocale()).format(value * 100))

export const handsText = (counts: HandCount) => t('meta.compare.handsOf', { hands: formatInteger(counts.hands), total: formatInteger(counts.total) })

export interface MirrorRowData {
  key: string
  /** La medida de `useChangeEffects` que mueve esta fila (para «Qué lo mueve»). */
  measure: MeasureKey
  label: string
  /** "Solo 1º" y parecidos: la regla vale para un único turno. */
  tag?: string
  higherIsBetter: boolean
  values: Record<TurnView, Pair>
  /** En cuántas manos pasa, de cuántas, en cada turno (el promedio no tiene una cuenta). */
  counts: Record<Turn, { a: HandCount | null; b: HandCount | null }>
  /** En qué builds le falta a la regla una carta (ahí no puede cumplirse). */
  missingIn: Side[]
}

const mean = (left: number | null, right: number | null) => (left === null || right === null ? null : (left + right) / 2)

const countOf = (probability: number | null, total: number | null | undefined): HandCount | null =>
  probability === null || total === null || total === undefined ? null : { hands: Math.round(probability * total), total }

/** Sin salida y con problema: las dos filas del veredicto, del mismo cálculo que los anillos. */
export function verdictRows(comparison: BuildComparison): MirrorRowData[] {
  const row = (key: 'noOpening' | 'withProblem', pick: (view: LabViewResult) => number): MirrorRowData => {
    const valueOf = (build: BuildMetrics, view: TurnView) => (build.results ? pick(build.results[view]) : null)
    const pair = (view: TurnView): Pair => ({ a: valueOf(comparison.a, view), b: valueOf(comparison.b, view) })
    const counts = (turn: Turn) => ({
      a: countOf(valueOf(comparison.a, turn), comparison.a.results?.[turn].totalHands),
      b: countOf(valueOf(comparison.b, turn), comparison.b.results?.[turn].totalHands),
    })

    return {
      key,
      measure: key,
      label: t(key === 'noOpening' ? 'meta.compare.noOpening' : 'meta.compare.withProblem'),
      higherIsBetter: false,
      values: { average: pair('average'), first: pair('first'), second: pair('second') },
      counts: { first: counts('first'), second: counts('second') },
      missingIn: [],
    }
  }

  return [row('noOpening', (view) => view.noOpeningProbability), row('withProblem', (view) => view.withProblemProbability)]
}

function ruleRowOf(row: RuleComparisonRow): MirrorRowData {
  const turn = (side: 'a' | 'b', which: Turn) => row.turns[which][side]?.probability ?? null

  return {
    key: row.id,
    measure: ruleMeasure(row.id),
    label: row.name,
    tag: row.turnContext === 'either' ? undefined : t(row.turnContext === 'first' ? 'meta.compare.onlyFirst' : 'meta.compare.onlySecond'),
    higherIsBetter: row.kind === 'opening',
    values: { average: { a: row.a, b: row.b }, first: { a: turn('a', 'first'), b: turn('b', 'first') }, second: { a: turn('a', 'second'), b: turn('b', 'second') } },
    counts: Object.fromEntries(TURNS.map((which) => [which, { a: row.turns[which].a?.counts ?? null, b: row.turns[which].b?.counts ?? null }])) as MirrorRowData['counts'],
    missingIn: row.missingCardsIn,
  }
}

/** Probabilidad de ver al menos uno de un rol en la mano, en cada turno (y su promedio), y en cuántas manos de todas las posibles. */
function roleRows(comparison: BuildComparison): MirrorRowData[] {
  const { a: buildA, b: buildB } = comparison

  return buildA.roles.first.flatMap((roleA, index) => {
    if (roleA.copies === 0 && buildB.roles.first[index]!.copies === 0) {
      return []
    }

    const at = (build: BuildMetrics, turn: Turn) => build.roles[turn][index]!.atLeastOne
    const pair = (turn: Turn): Pair => ({ a: at(buildA, turn), b: at(buildB, turn) })
    const counts = (turn: Turn) => ({ a: countOf(at(buildA, turn), buildA.results?.[turn].totalHands), b: countOf(at(buildB, turn), buildB.results?.[turn].totalHands) })

    return [
      {
        key: roleA.key,
        measure: roleMeasure(roleA.key),
        label: t('meta.compare.roleRow', { role: roleA.label }),
        // Los bricks traban; los demás roles son cosas que se quiere tener en la mano.
        higherIsBetter: roleA.key !== 'brick',
        values: {
          average: { a: mean(at(buildA, 'first'), at(buildA, 'second')), b: mean(at(buildB, 'first'), at(buildB, 'second')) },
          first: pair('first'),
          second: pair('second'),
        },
        counts: { first: counts('first'), second: counts('second') },
        missingIn: [],
      },
    ]
  })
}

/** Igual en las dos en TODAS las vistas: así cambiar de vista no saca ni mete filas (nada se corre de lugar). */
const sameEverywhere = (row: MirrorRowData) => VIEWS.every((view) => !deltaPoints(row.values[view]))
const averageGap = (row: MirrorRowData) => {
  const { a, b } = row.values.average

  return a === null || b === null ? 0 : Math.abs(shown(b) - shown(a))
}

export interface MirrorGroups {
  /** Las reglas de problema (lo que traba: menos es mejor). */
  problems: MirrorRowData[]
  /** Las reglas de salida. */
  rules: MirrorRowData[]
  /** Qué se roba de cada rol. */
  roles: MirrorRowData[]
  /** Lo que da igual en las dos en todas las vistas: va plegado en una sola fila. */
  same: MirrorRowData[]
}

/**
 * Las filas espejo, agrupadas y de la mayor diferencia a la menor (la del promedio: el orden no cambia con la vista). Un rol que repite una regla
 * (mismos valores en el promedio) no se lista dos veces. Sin salida y con problema no van acá: son las del veredicto (`verdictRows`).
 */
export function mirrorGroups(comparison: BuildComparison): MirrorGroups {
  const rules = comparison.rules.map(ruleRowOf).filter((row) => row.values.average.a !== null || row.values.average.b !== null)
  const sameAsARule = (role: MirrorRowData) =>
    rules.some(
      (rule) =>
        rule.higherIsBetter === role.higherIsBetter &&
        [rule.values.average.a, rule.values.average.b, role.values.average.a, role.values.average.b].every((value) => value !== null) &&
        shown(rule.values.average.a!) === shown(role.values.average.a!) &&
        shown(rule.values.average.b!) === shown(role.values.average.b!),
    )
  const roles = roleRows(comparison).filter((role) => !sameAsARule(role))
  const biggestFirst = (rows: MirrorRowData[]) => rows.filter((row) => !sameEverywhere(row)).sort((left, right) => averageGap(right) - averageGap(left))

  return {
    problems: biggestFirst(rules.filter((row) => !row.higherIsBetter)),
    rules: biggestFirst(rules.filter((row) => row.higherIsBetter)),
    roles: biggestFirst(roles),
    same: [...rules, ...roles].filter(sameEverywhere),
  }
}
