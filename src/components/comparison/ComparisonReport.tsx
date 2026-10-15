import { useState, type ReactNode } from 'react'

import type { BuildComparison, BuildMetrics, CardDiff, CleanComparison, ComparisonVerdict, HandCount, RuleComparisonRow } from '../../app/build-comparison'
import type { RoleDistribution } from '../../app/role-distribution'
import { formatInteger, formatShortPercent } from '../../app/utils'
import type { TurnView } from '../../types'
import { t } from '../../i18n'
import { KindBadge } from '../probability/KindBadge'
import { Badge } from '../ui/Badge'
import { Button } from '../ui/Button'
import { Callout } from '../ui/Callout'
import { Card } from '../ui/Card'
import { cx } from '../ui/cx'
import { Icon, type IconName } from '../ui/Icon'
import { ProgressRing } from '../ui/ProgressRing'
import { Segmented } from '../ui/Segmented'
import { SectionHeader } from '../ui/SectionHeader'
import { TONE, type Tone } from '../ui/tone'
import { overline } from '../ui/typography'
import { SideBadge } from './SideBadge'

/** Nombre con el que el comparador muestra tu deck actual (si no le pusiste uno). */
export const currentDeckName = () => t('meta.compare.currentDeck')

/** Los motivos de bloqueo del Lab que hablan de clasificar o revisar cartas, en español o en inglés: ya los cubre el aviso de cartas sin clasificar. */
const CLASSIFICATION_REASON = /clasific|revisi|classif|review/i

type Side = 'A' | 'B'

/** Los % se muestran con un decimal: dos valores son "iguales" sólo si se ven iguales. */
const shown = (value: number) => Math.round(value * 1000)

/** Quién gana: `null` es empate. Para problemas (bricks) el menor valor es el mejor. */
function winnerOf(a: number | null, b: number | null, higherIsBetter = true): Side | null {
  if (a === null || b === null || shown(a) === shown(b)) {
    return null
  }
  return b > a === higherIsBetter ? 'B' : 'A'
}

function formatValue(value: number | null): string {
  return value === null ? '—' : formatShortPercent(value)
}

function formatPoints(delta: number): string {
  return `${(Math.abs(delta) * 100).toFixed(1)} pp`
}

const mean = (left: number, right: number) => (left + right) / 2

interface ComparisonReportProps {
  comparison: BuildComparison
  /** Qué lado es tu deck actual (se clasifica en Categorización, no acá). */
  isCurrentDeck: { A: boolean; B: boolean }
  /** Lleva a la vista de cartas, donde se clasifican las pendientes. */
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
      {/* A la derecha sólo el detalle, ya desplegado: es lo que se consulta después del veredicto. */}
      <DetailCard comparison={comparison} />
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

/** Resultado: primero la respuesta (cuál conviene) y abajo, una sola vez, las cifras de manos limpias. */
function ResultCard({ comparison }: { comparison: BuildComparison }) {
  const { verdict, clean } = comparison
  const look = VERDICT_LOOK[verdict.kind]

  return (
    <Card padding="md" className="grid min-w-0 gap-5">
      <div className="flex items-center gap-3" aria-live="polite">
        {verdict.kind === 'a' || verdict.kind === 'b' ? (
          <SideBadge side={verdict.kind === 'a' ? 'A' : 'B'} size="lg" />
        ) : (
          <Icon name={look.icon} size={28} className={cx('shrink-0', TONE[look.tone].text)} />
        )}
        <div className="grid min-w-0 gap-0.5">
          <strong className="text-lead font-semibold text-foreground">{verdict.title}</strong>
          <span className="text-body text-muted">{verdict.detail}</span>
        </div>
      </div>
      {clean ? <CleanTable clean={clean} /> : null}
    </Card>
  )
}

const CLEAN_COLUMNS = 'grid grid-cols-[minmax(0,1fr)_6.25rem_6.25rem] items-center gap-x-3'

function CleanTable({ clean }: { clean: CleanComparison }) {
  const rows = [
    { key: 'first', label: t('meta.compare.rowFirst'), data: clean.first },
    { key: 'second', label: t('meta.compare.rowSecond'), data: clean.second },
    { key: 'average', label: t('meta.compare.rowAverage'), data: clean.average },
  ] as const

  return (
    <div className="grid gap-3 border-t border-border-subtle pt-4">
      <SectionHeader as="h3" title={t('meta.compare.cleanTitle')} description={t('meta.compare.cleanHint')} />
      <div className={cx(CLEAN_COLUMNS, 'justify-items-center')}>
        <span />
        <SideBadge side="A" size="sm" />
        <SideBadge side="B" size="sm" />
      </div>
      <ul className="m-0 grid list-none gap-0 divide-y divide-border-subtle p-0 tabular-nums">
        {rows.map((row, index) => {
          const winner = winnerOf(row.data.a, row.data.b)

          return (
            <li key={row.key} className={cx(CLEAN_COLUMNS, 'py-3 first:pt-0 last:pb-0')}>
              <div className="grid min-w-0 gap-0.5">
                <strong className={cx('text-body text-foreground', row.key === 'average' ? 'font-bold' : 'font-semibold')}>{row.label}</strong>
                <span className={cx('text-micro', winner ? 'font-semibold text-success-soft' : 'text-soft')}>
                  {winner ? t('meta.compare.wins', { side: winner, points: formatPoints(row.data.delta) }) : t('meta.compare.tie')}
                </span>
              </div>
              <CleanRing side="A" value={row.data.a} counts={row.data.countsA} dimmed={winner === 'B'} delay={index * 140} />
              <CleanRing side="B" value={row.data.b} counts={row.data.countsB} dimmed={winner === 'A'} delay={index * 140 + 90} />
            </li>
          )
        })}
      </ul>
    </div>
  )
}

/** Manos limpias de una build y cuántas son de todas las posibles; la que pierde en esa fila se apaga para que se vea quién gana. */
function CleanRing({ side, value, counts, dimmed, delay }: { side: Side; value: number | null; counts: HandCount | null; dimmed: boolean; delay: number }) {
  return (
    <div className={cx('grid justify-items-center gap-1 transition-opacity duration-200', dimmed && 'opacity-50')}>
      <ProgressRing value={value ?? 0} tone={side === 'A' ? 'brand' : 'info'} size={64} strokeWidth={6} delay={delay} label={t('meta.compare.cleanRing', { side, value: formatValue(value) })}>
        {formatValue(value)}
      </ProgressRing>
      {counts ? (
        <span className="grid justify-items-center text-micro leading-tight">
          <strong className="font-semibold text-foreground">{formatInteger(counts.hands)}</strong>
          <span className="text-soft">{t('meta.compare.ofTotal', { total: formatInteger(counts.total) })}</span>
        </span>
      ) : null}
    </div>
  )
}

function CardDiffCard({ diffs }: { diffs: CardDiff[] }) {
  // Sin diferencias no hay nada que listar (el veredicto ya dice que son iguales).
  if (diffs.length === 0) {
    return null
  }

  return (
    <Card padding="md" className="grid min-w-0 gap-3">
      <SectionHeader as="h3" title={t('meta.compare.diffTitle')} description={t('meta.compare.diffHint')} />
      <ul className="m-0 grid list-none gap-1.5 p-0">
        {diffs.map((diff) => (
          <li key={diff.cardId} className="grid grid-cols-[2.75rem_minmax(0,1fr)] items-center gap-2 text-body">
            <Badge tone={diff.delta > 0 ? 'success' : 'danger'} size="sm" className="justify-center tabular-nums">
              {diff.delta > 0 ? '+' : '−'}
              {formatInteger(Math.abs(diff.delta))}
            </Badge>
            <span className="truncate text-foreground">{diff.name}</span>
          </li>
        ))}
      </ul>
    </Card>
  )
}

interface DetailRowData {
  key: string
  label: ReactNode
  a: number | null
  b: number | null
  higherIsBetter: boolean
  note?: string
  /** En qué cantidad de manos pasa, de cuántas: sólo yendo 1º o 2º (el promedio no tiene una cuenta). */
  counts?: { a: HandCount | null; b: HandCount | null }
}

const TURN_OPTIONS = ['first', 'second', 'average'] as const

/** Qué tan distintas son las dos builds en una fila (en lo que se ve: décimas de punto). */
const gapOf = (row: DetailRowData) => (row.a === null || row.b === null ? 0 : Math.abs(shown(row.b) - shown(row.a)))

/** Roles y reglas, plegado: una fila por cosa, con los dos valores y quién gana. */
function DetailCard({ comparison }: { comparison: BuildComparison }) {
  const [view, setView] = useState<TurnView>('average')
  const roleRows: DetailRowData[] = comparison.a.roles.first.flatMap((roleA, index) => {
    const roleB = comparison.b.roles.first[index]!
    if (roleA.copies === 0 && roleB.copies === 0) {
      return []
    }
    const a = roleValue(comparison.a, index, view)
    const b = roleValue(comparison.b, index, view)
    return [
      {
        key: roleA.key,
        label: roleA.label,
        a: a.probability,
        b: b.probability,
        // Para bricks, robar menos es mejor.
        higherIsBetter: roleA.key !== 'brick',
        counts: view === 'average' ? undefined : { a: a.counts, b: b.counts },
      },
    ]
  })
  // Una regla que no se evalúa en el turno elegido (p. ej. "Solo 1º" yendo 2º) no tiene nada que comparar.
  const ruleRows: DetailRowData[] = comparison.rules.map((row) => toRuleRow(row, view)).filter((row) => row.a !== null || row.b !== null)

  if (roleRows.length === 0 && ruleRows.length === 0) {
    return null
  }

  // Lo más distinto primero (el orden de antes se conserva entre iguales): es lo que se busca a simple vista.
  const mostDifferentFirst = (rows: DetailRowData[]) => [...rows].sort((left, right) => gapOf(right) - gapOf(left))
  const tally = { A: 0, B: 0, tie: 0 }

  for (const row of [...roleRows, ...ruleRows]) {
    tally[winnerOf(row.a, row.b, row.higherIsBetter) ?? 'tie'] += 1
  }

  return (
    <Card padding="md" className="min-w-0 self-start">
      <details className="group" open>
        <summary className="flex cursor-pointer list-none items-center justify-between gap-3 rounded-control focus-visible:outline-none focus-visible:shadow-focus [&::-webkit-details-marker]:hidden">
          <SectionHeader as="h3" title={t('meta.compare.detailTitle')} description={t('meta.compare.detailHint')} />
          <Icon name="chevron-down" size={20} className="shrink-0 text-soft transition-transform duration-200 group-open:rotate-180" />
        </summary>
        <div className="mt-4 grid gap-5">
          <div className="grid gap-3">
            <Segmented
              label={t('meta.compare.turnView')}
              value={view}
              onChange={setView}
              size="sm"
              fullWidth
              options={TURN_OPTIONS.map((value) => ({ value, label: t(value === 'first' ? 'meta.compare.rowFirst' : value === 'second' ? 'meta.compare.rowSecond' : 'meta.compare.rowAverage') }))}
            />
            <p className="m-0 flex flex-wrap items-center gap-x-4 gap-y-1 text-body text-muted tabular-nums">
              {(['A', 'B'] as const).map((side) => (
                <span key={side} className="inline-flex items-center gap-1.5">
                  <SideBadge side={side} size="sm" />
                  {t('meta.compare.tallyWins', { count: tally[side] })}
                </span>
              ))}
              <span>{t('meta.compare.tallyTies', { count: tally.tie })}</span>
            </p>
          </div>
          <DetailGroup title={t('meta.compare.groupRoles')} rows={mostDifferentFirst(roleRows)} />
          <DetailGroup title={t('meta.compare.groupRules')} rows={mostDifferentFirst(ruleRows)} />
        </div>
      </details>
    </Card>
  )
}

/** Probabilidad de ver al menos uno de un rol en la mano (promediando yendo 1º y 2º) y, en un turno, en cuántas manos de todas las posibles. */
function roleValue(build: BuildMetrics, index: number, view: TurnView): { probability: number; counts: HandCount | null } {
  const first: RoleDistribution = build.roles.first[index]!
  const second: RoleDistribution = build.roles.second[index]!

  if (view === 'average') {
    return { probability: mean(first.atLeastOne, second.atLeastOne), counts: null }
  }

  const probability = (view === 'first' ? first : second).atLeastOne
  const total = build.results?.[view].totalHands ?? null

  return { probability, counts: total === null ? null : { hands: Math.round(probability * total), total } }
}

function toRuleRow(row: RuleComparisonRow, view: TurnView): DetailRowData {
  const turn = view === 'average' ? null : row.turns[view]

  const missing =
    row.missingCardsIn.length === 2
      ? t('meta.compare.missingBoth')
      : row.missingCardsIn.length === 1
        ? t('meta.compare.missingOne', { side: row.missingCardsIn[0]! })
        : undefined

  return {
    key: row.id,
    label: (
      <span className="flex min-w-0 flex-wrap items-center gap-1.5">
        <KindBadge kind={row.kind} />
        <span className="font-semibold text-foreground">{row.name}</span>
        {row.turnContext !== 'either' ? (
          <Badge tone="warning" size="sm" shape="tag">
            {t(row.turnContext === 'first' ? 'meta.compare.onlyFirst' : 'meta.compare.onlySecond')}
          </Badge>
        ) : null}
      </span>
    ),
    a: turn ? (turn.a?.probability ?? null) : row.a,
    b: turn ? (turn.b?.probability ?? null) : row.b,
    higherIsBetter: row.kind === 'opening',
    note: missing,
    counts: turn ? { a: turn.a?.counts ?? null, b: turn.b?.counts ?? null } : undefined,
  }
}

const DETAIL_COLUMNS = 'grid grid-cols-[minmax(0,1fr)_3.25rem_3.25rem_4.25rem] items-center gap-x-2'

function DetailGroup({ title, rows }: { title: string; rows: DetailRowData[] }) {
  if (rows.length === 0) {
    return null
  }

  return (
    <div className="grid gap-2">
      <div className={DETAIL_COLUMNS}>
        <span className={overline}>{title}</span>
        <span className="justify-self-end"><SideBadge side="A" size="sm" /></span>
        <span className="justify-self-end"><SideBadge side="B" size="sm" /></span>
        <span className="justify-self-end text-micro text-soft">Δ pp</span>
      </div>
      <ul className="m-0 grid list-none gap-0 divide-y divide-border-subtle p-0 tabular-nums">
        {rows.map((row) => {
          const winner = winnerOf(row.a, row.b, row.higherIsBetter)

          return (
            <li key={row.key} className="grid gap-1 py-2 first:pt-0 last:pb-0">
              <div className={cx(DETAIL_COLUMNS, 'text-body')}>
                <span className="min-w-0 text-foreground">{row.label}</span>
                <DetailValue value={row.a} wins={winner === 'A'} />
                <DetailValue value={row.b} wins={winner === 'B'} />
                <DeltaChip winner={winner} delta={row.a !== null && row.b !== null ? row.b - row.a : null} />
              </div>
              {row.counts ? (
                <p className="m-0 flex flex-wrap items-center gap-x-4 gap-y-1 text-micro text-soft">
                  {(['A', 'B'] as const).map((side) => {
                    const counts = row.counts![side === 'A' ? 'a' : 'b']

                    return counts ? (
                      <span key={side} className="inline-flex items-center gap-1.5">
                        <SideBadge side={side} size="sm" />
                        {t('meta.compare.handsOf', { hands: formatInteger(counts.hands), total: formatInteger(counts.total) })}
                      </span>
                    ) : null
                  })}
                </p>
              ) : null}
              {row.note ? <p className="m-0 text-micro text-warning-soft">{row.note}</p> : null}
            </li>
          )
        })}
      </ul>
    </div>
  )
}

/** Quién gana la fila y por cuánto, en el color de esa build: la diferencia se ve sin leer los dos valores. */
function DeltaChip({ winner, delta }: { winner: Side | null; delta: number | null }) {
  if (!winner || delta === null) {
    return <span className="justify-self-end text-soft" title={t('meta.compare.tie')}>=</span>
  }

  return (
    <span
      title={t('meta.compare.better', { side: winner })}
      className={cx(
        'inline-flex items-center gap-1 justify-self-end rounded-full px-2 py-0.5 text-micro font-bold',
        winner === 'A' ? 'bg-primary text-primary-foreground' : 'bg-info text-background',
      )}
    >
      {winner}
      <span>+{(Math.abs(delta) * 100).toFixed(1)}</span>
    </span>
  )
}

function DetailValue({ value, wins }: { value: number | null; wins: boolean }) {
  return <span className={cx('justify-self-end text-right', wins ? 'font-bold text-success-soft' : 'text-muted')}>{formatValue(value)}</span>
}
