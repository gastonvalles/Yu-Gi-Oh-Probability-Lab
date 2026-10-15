import { useId, useState } from 'react'

import type { BuildComparison, BuildMetrics, CardDiff, CleanComparison, ComparisonVerdict, HandCount, RuleComparisonRow } from '../../app/build-comparison'
import type { RoleDistribution } from '../../app/role-distribution'
import { formatInteger } from '../../app/utils'
import { t } from '../../i18n'
import { Button } from '../ui/Button'
import { Callout } from '../ui/Callout'
import { Card } from '../ui/Card'
import { cx } from '../ui/cx'
import { Icon, type IconName } from '../ui/Icon'
import { SectionHeader } from '../ui/SectionHeader'
import { Skeleton } from '../ui/Skeleton'
import { Switch } from '../ui/Switch'
import { TONE, type Tone } from '../ui/tone'
import { SideBadge } from './SideBadge'

/** Nombre con el que el comparador muestra tu deck actual (si no le pusiste uno). */
export const currentDeckName = () => t('meta.compare.currentDeck')

/** Los motivos de bloqueo del Lab que hablan de clasificar o revisar cartas, en español o en inglés: ya los cubre el aviso de cartas sin clasificar. */
const CLASSIFICATION_REASON = /clasific|revisi|classif|review/i

type Side = 'A' | 'B'
type Turn = 'first' | 'second'
type Group = 'start' | 'stuck'

/** Los % se comparan con un decimal: dos valores son "iguales" sólo si se ven iguales. */
const shown = (value: number) => Math.round(value * 1000)

/** Quién gana: `null` es empate. Para las que traban (bricks) el menor valor es el mejor. */
function winnerOf(a: number | null, b: number | null, higherIsBetter = true): Side | null {
  if (a === null || b === null || shown(a) === shown(b)) {
    return null
  }
  return b > a === higherIsBetter ? 'B' : 'A'
}

/** De cada 100 manos (el número solo: la unidad la dice el encabezado). */
const per100 = (value: number | null) => (value === null ? '—' : (value * 100).toFixed(1))

const mean = (left: number, right: number) => (left + right) / 2

const TURNS: readonly Turn[] = ['first', 'second']
const TURN_LABEL = { first: 'meta.compare.rowFirst', second: 'meta.compare.rowSecond' } as const

/** Menos que esto (en décimas de punto, 0,5 pp) entre las dos builds no es una diferencia: el veredicto también lo trata como empate. */
const MIN_GAP = 5

const handsText = (counts: HandCount) => t('meta.compare.handsOf', { hands: formatInteger(counts.hands), total: formatInteger(counts.total) })

interface ComparisonReportProps {
  comparison: BuildComparison
  /** Qué lado es tu deck actual (se clasifica en Categorización, no acá). */
  isCurrentDeck: { A: boolean; B: boolean }
  /** Lleva a los mazos de cada build, donde se clasifican las cartas pendientes. */
  onShowCards: () => void
}

export function ComparisonReport({ comparison, isCurrentDeck, onShowCards }: ComparisonReportProps) {
  const { a, b } = comparison

  return (
    <div className="grid min-w-0 gap-4 min-[1101px]:grid-cols-2 min-[1101px]:items-start min-[1101px]:gap-5">
      <div className="grid min-w-0 gap-4">
        {([['A', a], ['B', b]] as const).map(([side, build]) => (
          <BuildNotes key={side} side={side} build={build} canClassifyHere={!isCurrentDeck[side]} onShowCards={onShowCards} />
        ))}
        <ResultCard comparison={comparison} />
        <CardDiffCard diffs={comparison.cardDiffs} />
      </div>
      <DifferencesCard comparison={comparison} />
    </div>
  )
}

/** Un aviso por build: primero lo que falta clasificar (con qué hacer), después otros bloqueos. */
function BuildNotes({ side, build, canClassifyHere, onShowCards }: { side: Side; build: BuildMetrics; canClassifyHere: boolean; onShowCards: () => void }) {
  const pending = build.pendingCards.length
  const otherReasons = pending > 0 ? build.blockedReasons.filter((reason) => !CLASSIFICATION_REASON.test(reason)) : build.blockedReasons

  return (
    <>
      {pending > 0 ? (
        <Callout
          tone="warning"
          title={t('meta.compare.pending', { side, count: pending })}
          action={
            canClassifyHere ? (
              <Button variant="secondary" size="sm" onClick={onShowCards}>
                {t('meta.compare.viewCards')}
              </Button>
            ) : undefined
          }
        >
          {t(canClassifyHere ? 'meta.compare.classifyHere' : 'meta.compare.classifyElsewhere')}
        </Callout>
      ) : null}
      {otherReasons.map((reason) => (
        <Callout key={reason} tone="warning" title={t('meta.compare.build', { side })}>
          {reason}
        </Callout>
      ))}
    </>
  )
}

const VERDICT_LOOK: Record<ComparisonVerdict['kind'], { tone: Tone; icon: IconName }> = {
  computing: { tone: 'info', icon: 'flask' },
  a: { tone: 'success', icon: 'check-circle' },
  b: { tone: 'success', icon: 'check-circle' },
  split: { tone: 'warning', icon: 'swap' },
  incomplete: { tone: 'danger', icon: 'alert' },
  identical: { tone: 'neutral', icon: 'columns' },
  equivalent: { tone: 'info', icon: 'columns' },
}

/** La respuesta: cuál conviene, dicho en "de cada 100 manos", y los dos números lado a lado. */
function ResultCard({ comparison }: { comparison: BuildComparison }) {
  const { verdict, clean } = comparison
  const look = VERDICT_LOOK[verdict.kind]
  const average = clean?.average
  const best = verdict.kind === 'a' ? 'A' : verdict.kind === 'b' ? 'B' : null
  const detail =
    average && best
      ? t('meta.compare.verdict.per100', {
          best,
          bestValue: Math.round((best === 'A' ? average.a : average.b) * 100),
          other: best === 'A' ? 'B' : 'A',
          otherValue: Math.round((best === 'A' ? average.b : average.a) * 100),
        })
      : verdict.detail

  return (
    <Card padding="md" className="grid min-w-0 gap-4">
      <div className="flex items-center gap-3" aria-live="polite">
        {best ? <SideBadge side={best} size="lg" /> : <Icon name={look.icon} size={28} className={cx('shrink-0', TONE[look.tone].text)} />}
        <div className="grid min-w-0 gap-0.5">
          <strong className="text-lead font-semibold text-foreground">{verdict.title}</strong>
          <span className="text-body text-muted">{detail}</span>
        </div>
      </div>
      {clean ? <CleanBlock clean={clean} names={{ A: comparison.a.name, B: comparison.b.name }} best={best} /> : null}
    </Card>
  )
}

function CleanBlock({ clean, names, best }: { clean: CleanComparison; names: Record<Side, string>; best: Side | null }) {
  return (
    <div className="grid gap-3 border-t border-border-subtle pt-4">
      <div className="grid grid-cols-2 divide-x divide-border-subtle">
        {(['A', 'B'] as const).map((side) => {
          const wins = best === side

          return (
            <div key={side} className="grid min-w-0 content-start gap-1 first:pr-4 last:pl-4">
              <span className="flex min-w-0 items-center gap-1.5 text-micro text-muted">
                <SideBadge side={side} size="sm" />
                <span className="truncate">{names[side]}</span>
              </span>
              <span className={cx('text-title font-bold tabular-nums', wins ? 'text-success-soft' : 'text-foreground')}>
                {Math.round(clean.average[side === 'A' ? 'a' : 'b'] * 100)} <span className="text-micro font-normal text-soft">{t('meta.compare.outOf100')}</span>
              </span>
              <span className={cx('inline-flex items-center gap-1 text-micro font-semibold text-success-soft', !wins && 'invisible')} aria-hidden={!wins}>
                <Icon name="check" size={14} />
                {t('meta.compare.better')}
              </span>
            </div>
          )
        })}
      </div>
      <p className="m-0 text-micro text-soft">{t('meta.compare.cleanHint')}</p>
      <details className="group">
        <summary className="flex cursor-pointer list-none items-center gap-1.5 rounded-control text-micro font-semibold text-muted focus-visible:outline-none focus-visible:shadow-focus [&::-webkit-details-marker]:hidden">
          {t('meta.compare.seeHands')}
          <Icon name="chevron-down" size={14} className="text-soft transition-transform duration-200 group-open:rotate-180" />
        </summary>
        <ul className="m-0 mt-2 grid list-none gap-1 p-0 text-micro tabular-nums">
          {(['A', 'B'] as const).flatMap((side) =>
            TURNS.map((turn) => {
              const counts = side === 'A' ? clean[turn].countsA : clean[turn].countsB

              return counts ? (
                <li key={`${side}-${turn}`} className="flex flex-wrap items-center gap-x-2">
                  <SideBadge side={side} size="sm" />
                  <span className="text-soft">{t(TURN_LABEL[turn])}</span>
                  <span className="text-foreground">{handsText(counts)}</span>
                </li>
              ) : null
            }),
          )}
        </ul>
      </details>
    </div>
  )
}

/** Qué cartas cambiaron: cuántas copias hay en cada build (la lista ya viene con lo que suma B primero). */
function CardDiffCard({ diffs }: { diffs: CardDiff[] }) {
  // Sin diferencias no hay nada que listar (el veredicto ya dice que son iguales).
  if (diffs.length === 0) {
    return null
  }

  return (
    <Card padding="md" className="grid min-w-0 gap-3">
      <SectionHeader as="h3" title={t('meta.compare.diffTitle')} description={t('meta.compare.diffHint')} />
      <table className="w-full table-fixed border-collapse text-body tabular-nums">
        <caption className="sr-only">{t('meta.compare.diffTitle')}</caption>
        <thead>
          <tr>
            <th scope="col" className="py-1.5 text-left text-micro font-normal text-soft">
              {t('meta.compare.cardColumn')}
            </th>
            <BuildColumn side="A" />
            <BuildColumn side="B" />
          </tr>
        </thead>
        <tbody>
          {diffs.map((diff) => (
            <tr key={diff.cardId} className="border-t border-border-subtle">
              <th scope="row" className="py-2 pr-2 text-left font-semibold text-foreground">
                {diff.name}
              </th>
              <td className="py-2 text-right text-muted">{formatInteger(diff.copiesA)}</td>
              <td className="py-2 text-right font-bold text-foreground">{formatInteger(diff.copiesB)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </Card>
  )
}

function BuildColumn({ side }: { side: Side }) {
  return (
    <th scope="col" className="w-[4.5rem] py-1.5 text-right font-normal">
      <SideBadge side={side} size="sm" />
    </th>
  )
}

interface DiffRowData {
  key: string
  label: string
  /** "Solo 1º" y parecidos: la regla vale para un único turno. */
  tag?: string
  group: Group
  a: number | null
  b: number | null
  higherIsBetter: boolean
  note?: string
  /** En qué cantidad de manos pasa, de cuántas, en cada turno (el promedio no tiene una cuenta). */
  counts: Partial<Record<Turn, { a: HandCount | null; b: HandCount | null }>>
}

/** Qué tan distintas son las dos builds en una fila (en lo que se ve: décimas de punto). */
const gapOf = (row: DiffRowData) => (row.a === null || row.b === null ? 0 : Math.abs(shown(row.b) - shown(row.a)))

/** Quién gana la fila: sólo si la diferencia es de verdad (menos de medio punto no cuenta). */
const rowWinner = (row: DiffRowData) => (gapOf(row) >= MIN_GAP ? winnerOf(row.a, row.b, row.higherIsBetter) : null)

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
    counts: Object.fromEntries(TURNS.map((turn) => [turn, { a: counts(buildA, turn), b: counts(buildB, turn) }])),
  }
}

function ruleRowOf(row: RuleComparisonRow): DiffRowData {
  const missing =
    row.missingCardsIn.length === 2
      ? t('meta.compare.missingBoth')
      : row.missingCardsIn.length === 1
        ? t('meta.compare.missingOne', { side: row.missingCardsIn[0]! })
        : undefined

  return {
    key: row.id,
    label: row.name,
    tag: row.turnContext === 'either' ? undefined : t(row.turnContext === 'first' ? 'meta.compare.onlyFirst' : 'meta.compare.onlySecond'),
    group: row.kind === 'opening' ? 'start' : 'stuck',
    a: row.a,
    b: row.b,
    higherIsBetter: row.kind === 'opening',
    note: missing,
    counts: Object.fromEntries(TURNS.map((turn) => [turn, { a: row.turns[turn].a?.counts ?? null, b: row.turns[turn].b?.counts ?? null }])),
  }
}

/** Todas las filas, de la mayor diferencia a la menor dentro de cada grupo. Un rol que repite una regla (mismos valores) no se lista dos veces. */
function diffRows(comparison: BuildComparison): Record<Group, DiffRowData[]> {
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

/**
 * En qué se diferencian: una tabla de dos columnas (A y B), cada fila con "de cada 100 manos" y el mejor marcado.
 * De entrada sólo lo que difiere; en cuántas manos pasa, por turno, queda a un toque.
 */
function DifferencesCard({ comparison }: { comparison: BuildComparison }) {
  const [onlyDiffs, setOnlyDiffs] = useState(true)
  const [open, setOpen] = useState<ReadonlySet<string>>(new Set())
  const tableId = useId()
  const groups = diffRows(comparison)
  const total = groups.start.length + groups.stuck.length
  const differing = [...groups.start, ...groups.stuck].filter((row) => gapOf(row) >= MIN_GAP).length
  const visible = (rows: DiffRowData[]) => (onlyDiffs ? rows.filter((row) => gapOf(row) >= MIN_GAP) : rows)
  const sections = ([['start', 'meta.compare.groupStart'], ['stuck', 'meta.compare.groupStuck']] as const).map(([group, title]) => ({ group, title, rows: visible(groups[group]) })).filter((section) => section.rows.length > 0)
  const toggle = (key: string) =>
    setOpen((current) => {
      const next = new Set(current)

      if (!next.delete(key)) {
        next.add(key)
      }

      return next
    })

  if (comparison.verdict.kind === 'computing') {
    return (
      <Card padding="md" className="grid min-w-0 gap-3 self-start" aria-busy="true">
        <SectionHeader as="h3" title={t('meta.compare.detailTitle')} description={t('meta.compare.verdict.computing.detail')} />
        {[0, 1, 2, 3].map((row) => (
          <Skeleton key={row} className="h-9" />
        ))}
      </Card>
    )
  }

  if (total === 0) {
    return null
  }

  return (
    <Card padding="md" className="grid min-w-0 gap-3 self-start">
      <SectionHeader as="h3" title={t('meta.compare.detailTitle')} description={t('meta.compare.detailHint')} />
      <label className="flex items-center justify-between gap-3 text-body text-muted">
        <span className="tabular-nums">{t('meta.compare.onlyDiffs', { shown: differing, total })}</span>
        <Switch checked={onlyDiffs} onChange={setOnlyDiffs} label={t('meta.compare.onlyDiffsLabel')} />
      </label>
      {sections.length > 0 ? (
        <table className="w-full table-fixed border-collapse text-body tabular-nums">
          <caption className="sr-only">{t('meta.compare.tableCaption')}</caption>
          <thead>
            <tr>
              <th scope="col" className="py-1.5 text-left text-micro font-normal text-soft">
                {t('meta.compare.perHundred')}
              </th>
              <BuildColumn side="A" />
              <BuildColumn side="B" />
            </tr>
          </thead>
          {sections.map((section) => (
            <tbody key={section.group}>
              <tr>
                <th scope="rowgroup" colSpan={3} className="pb-1 pt-4 text-left text-micro font-normal text-soft">
                  {t(section.title)}
                </th>
              </tr>
              {section.rows.map((row) => (
                <DiffTableRow key={row.key} row={row} open={open.has(row.key)} onToggle={() => toggle(row.key)} detailId={`${tableId}-${row.key}`} />
              ))}
            </tbody>
          ))}
        </table>
      ) : (
        <div className="grid justify-items-center gap-2 py-4 text-center">
          <strong className="text-body font-semibold text-foreground">{t('meta.compare.noDiffsTitle')}</strong>
          <p className="m-0 text-body text-muted">{t('meta.compare.noDiffsBody')}</p>
          <Button variant="secondary" size="sm" onClick={() => setOnlyDiffs(false)}>
            {t('meta.compare.showAllRows')}
          </Button>
        </div>
      )}
    </Card>
  )
}

function DiffTableRow({ row, open, onToggle, detailId }: { row: DiffRowData; open: boolean; onToggle: () => void; detailId: string }) {
  const winner = rowWinner(row)
  const lines = (['A', 'B'] as const).flatMap((side) => TURNS.flatMap((turn) => {
    const counts = row.counts[turn]?.[side === 'A' ? 'a' : 'b']

    return counts ? [{ side, turn, counts }] : []
  }))
  const label = (
    <>
      <span className="min-w-0 text-foreground">{row.label}</span>
      {row.tag ? <span className="ml-1.5 whitespace-nowrap text-micro text-soft">{row.tag}</span> : null}
    </>
  )

  return (
    <>
      <tr className="border-t border-border-subtle transition-colors hover:bg-tint/5">
        <th scope="row" className="py-2.5 pr-2 text-left font-normal">
          {lines.length > 0 ? (
            <button
              type="button"
              aria-expanded={open}
              aria-controls={detailId}
              onClick={onToggle}
              className="flex w-full items-start gap-1.5 rounded-control text-left focus-visible:outline-none focus-visible:shadow-focus"
            >
              <span className="min-w-0 flex-1">{label}</span>
              <Icon name="chevron-down" size={14} className={cx('mt-1 shrink-0 text-soft transition-transform duration-200', open && 'rotate-180')} />
            </button>
          ) : (
            <span>{label}</span>
          )}
          {row.note ? <span className="mt-0.5 block text-micro text-warning-soft">{row.note}</span> : null}
        </th>
        <DiffCell value={row.a} wins={winner === 'A'} />
        <DiffCell value={row.b} wins={winner === 'B'} />
      </tr>
      {open ? (
        <tr id={detailId}>
          <td colSpan={3} className="pb-3">
            <ul className="m-0 grid list-none gap-1 p-0 text-micro text-soft">
              {lines.map(({ side, turn, counts }) => (
                <li key={`${side}-${turn}`} className="flex flex-wrap items-center gap-x-2">
                  <SideBadge side={side} size="sm" />
                  <span>{t(TURN_LABEL[turn])}:</span>
                  <span className="text-foreground">{handsText(counts)}</span>
                </li>
              ))}
            </ul>
          </td>
        </tr>
      ) : null}
    </>
  )
}

/** El valor de una build en esa fila; el mejor lleva ✓ y va en negrita (no se apoya sólo en el color). */
function DiffCell({ value, wins }: { value: number | null; wins: boolean }) {
  return (
    <td className={cx('py-2.5 text-right align-top', wins ? 'font-bold text-success-soft' : 'text-muted')}>
      {wins ? <Icon name="check" size={14} className="mr-1 inline-block align-[-2px]" /> : null}
      {per100(value)}
      {wins ? <span className="sr-only"> {t('meta.compare.better')}</span> : null}
    </td>
  )
}
