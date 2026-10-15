import type { BuildComparison, BuildMetrics, HandCount, RuleComparisonRow } from '../../app/build-comparison'
import type { RoleDistribution } from '../../app/role-distribution'
import { formatInteger } from '../../app/utils'
import { t } from '../../i18n'

export type Side = 'A' | 'B'
export type Turn = 'first' | 'second'
export type Group = 'start' | 'stuck'

export const TURNS: readonly Turn[] = ['first', 'second']
export const TURN_LABEL = { first: 'meta.compare.rowFirst', second: 'meta.compare.rowSecond' } as const

/** Menos que esto (en décimas de punto, 0,5 pp) entre las dos builds no es una diferencia: el veredicto también lo trata como empate. */
export const MIN_GAP = 5

/** Los % se comparan con un decimal: dos valores son "iguales" sólo si se ven iguales. */
export const shown = (value: number) => Math.round(value * 1000)

/** Quién gana: `null` es empate. Para las que traban (bricks) el menor valor es el mejor. */
export function winnerOf(a: number | null, b: number | null, higherIsBetter = true): Side | null {
  if (a === null || b === null || shown(a) === shown(b)) {
    return null
  }
  return b > a === higherIsBetter ? 'B' : 'A'
}

/** De cada 100 manos (el número solo: la unidad la dice el encabezado). */
export const per100 = (value: number | null) => (value === null ? '—' : (value * 100).toFixed(1))

export const handsText = (counts: HandCount) => t('meta.compare.handsOf', { hands: formatInteger(counts.hands), total: formatInteger(counts.total) })

const mean = (left: number, right: number) => (left + right) / 2

export interface DiffRowData {
  key: string
  label: string
  /** "Solo 1º" y parecidos: la regla vale para un único turno. */
  tag?: string
  group: Group
  a: number | null
  b: number | null
  higherIsBetter: boolean
  /** En qué builds le falta a la regla una carta (ahí no puede cumplirse). */
  missingIn: Side[]
  /** En qué cantidad de manos pasa, de cuántas, en cada turno (el promedio no tiene una cuenta). */
  counts: Partial<Record<Turn, { a: HandCount | null; b: HandCount | null }>>
}

/** Qué tan distintas son las dos builds en una fila (en lo que se ve: décimas de punto). */
export const gapOf = (row: DiffRowData) => (row.a === null || row.b === null ? 0 : Math.abs(shown(row.b) - shown(row.a)))

/** Quién gana la fila: sólo si la diferencia es de verdad (menos de medio punto no cuenta). */
export const rowWinner = (row: DiffRowData) => (gapOf(row) >= MIN_GAP ? winnerOf(row.a, row.b, row.higherIsBetter) : null)

/** Probabilidad de ver al menos uno de un rol en la mano (promediando yendo 1º y 2º) y, en cada turno, en cuántas manos de todas las posibles. */
function roleRow(comparison: BuildComparison, index: number): DiffRowData | null {
  const { a: buildA, b: buildB } = comparison
  const roleA: RoleDistribution = buildA.roles.first[index]!
  const roleB: RoleDistribution = buildB.roles.first[index]!

  if (roleA.copies === 0 && roleB.copies === 0) {
    return null
  }

  const average = (build: BuildMetrics) => mean(build.roles.first[index]!.atLeastOne, build.roles.second[index]!.atLeastOne)
  const counts = (build: BuildMetrics, turn: Turn): HandCount | null => {
    const total = build.results?.[turn].totalHands ?? null

    return total === null ? null : { hands: Math.round(build.roles[turn][index]!.atLeastOne * total), total }
  }

  return {
    key: roleA.key,
    label: t('meta.compare.roleRow', { role: roleA.label }),
    // Los bricks traban; los demás roles son cosas que se quiere tener en la mano.
    group: roleA.key === 'brick' ? 'stuck' : 'start',
    a: average(buildA),
    b: average(buildB),
    higherIsBetter: roleA.key !== 'brick',
    missingIn: [],
    counts: Object.fromEntries(TURNS.map((turn) => [turn, { a: counts(buildA, turn), b: counts(buildB, turn) }])),
  }
}

function ruleRowOf(row: RuleComparisonRow): DiffRowData {
  return {
    key: row.id,
    label: row.name,
    tag: row.turnContext === 'either' ? undefined : t(row.turnContext === 'first' ? 'meta.compare.onlyFirst' : 'meta.compare.onlySecond'),
    group: row.kind === 'opening' ? 'start' : 'stuck',
    a: row.a,
    b: row.b,
    higherIsBetter: row.kind === 'opening',
    missingIn: row.missingCardsIn,
    counts: Object.fromEntries(TURNS.map((turn) => [turn, { a: row.turns[turn].a?.counts ?? null, b: row.turns[turn].b?.counts ?? null }])),
  }
}

/** Todas las filas, de la mayor diferencia a la menor dentro de cada grupo. Un rol que repite una regla (mismos valores) no se lista dos veces. */
export function diffRows(comparison: BuildComparison): Record<Group, DiffRowData[]> {
  const rules = comparison.rules.map(ruleRowOf).filter((row) => row.a !== null || row.b !== null)
  const roles = comparison.a.roles.first.flatMap((_, index) => roleRow(comparison, index) ?? [])
  const sameAsARule = (role: DiffRowData) =>
    rules.some((rule) => rule.group === role.group && rule.a !== null && rule.b !== null && role.a !== null && role.b !== null && shown(rule.a) === shown(role.a) && shown(rule.b) === shown(role.b))
  const biggestFirst = (rows: DiffRowData[]) => [...rows].sort((left, right) => gapOf(right) - gapOf(left))
  const all = [...rules, ...roles.filter((role) => !sameAsARule(role))]

  return {
    start: biggestFirst(all.filter((row) => row.group === 'start')),
    stuck: biggestFirst(all.filter((row) => row.group === 'stuck')),
  }
}
