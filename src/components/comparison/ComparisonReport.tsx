import type { BuildComparison, BuildMetrics, CardDiff, CleanComparison, ComparisonVerdict, HandCount, RuleComparisonRow } from '../../app/build-comparison'
import type { RoleDistribution } from '../../app/role-distribution'
import { formatInteger, formatShortPercent } from '../../app/utils'
import { t } from '../../i18n'
import { kindLabel } from '../probability/lab-copy'
import { Badge } from '../ui/Badge'
import { Button } from '../ui/Button'
import { Callout } from '../ui/Callout'
import { Card } from '../ui/Card'
import { cx } from '../ui/cx'
import { Icon, type IconName } from '../ui/Icon'
import { SectionHeader } from '../ui/SectionHeader'
import { TONE, type Tone } from '../ui/tone'
import { SideBadge } from './SideBadge'

/** Nombre con el que el comparador muestra tu deck actual (si no le pusiste uno). */
export const currentDeckName = () => t('meta.compare.currentDeck')

/** Los motivos de bloqueo del Lab que hablan de clasificar o revisar cartas, en español o en inglés: ya los cubre el aviso de cartas sin clasificar. */
const CLASSIFICATION_REASON = /clasific|revisi|classif|review/i

type Side = 'A' | 'B'
type Turn = 'first' | 'second'

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

const SIDE_FILL: Record<Side, string> = { A: 'bg-primary', B: 'bg-info' }
const SIDE_TEXT: Record<Side, string> = { A: 'text-primary-soft', B: 'text-info-soft' }
const TURNS: readonly Turn[] = ['first', 'second']
const TURN_LABEL = { first: 'meta.compare.rowFirst', second: 'meta.compare.rowSecond' } as const

/** Menos que esto (en décimas de punto, 0,5 pp) entre las dos builds no es una diferencia: el veredicto también lo trata como empate. */
const MIN_GAP = 5
/** Cuántas diferencias se ven de entrada: las mayores. Las demás, a un toque. */
const SHOWN_ROWS = 5

const handsText = (counts: HandCount) => t('meta.compare.handsOf', { hands: formatInteger(counts.hands), total: formatInteger(counts.total) })

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

/** La respuesta: cuál conviene y, debajo, las manos limpias de cada una (en promedio de los dos turnos). */
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
      {clean ? <CleanBlock clean={clean} /> : null}
    </Card>
  )
}

function CleanBlock({ clean }: { clean: CleanComparison }) {
  const { a, b } = clean.average
  const winner = winnerOf(a, b)

  return (
    <div className="grid gap-3 border-t border-border-subtle pt-4">
      <SectionHeader as="h3" title={t('meta.compare.cleanTitle')} description={t('meta.compare.cleanHint')} />
      <CleanBar side="A" value={a} dimmed={winner === 'B'} />
      <CleanBar side="B" value={b} dimmed={winner === 'A'} />
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

/** Manos limpias de una build como barra (0 a 100 %); la que pierde se apaga. */
function CleanBar({ side, value, dimmed }: { side: Side; value: number | null; dimmed: boolean }) {
  return (
    <div className={cx('grid grid-cols-[1.25rem_minmax(0,1fr)_3.75rem] items-center gap-x-3 transition-opacity duration-200', dimmed && 'opacity-60')}>
      <SideBadge side={side} size="sm" />
      <span role="img" aria-label={t('meta.compare.cleanRing', { side, value: formatValue(value) })} className="h-3 overflow-hidden rounded-full bg-tint/8">
        <span
          className={cx('block h-full rounded-full transition-[width] duration-500 motion-reduce:transition-none', SIDE_FILL[side])}
          style={{ width: `${Math.min(100, Math.max(0, (value ?? 0) * 100))}%` }}
        />
      </span>
      <strong className="text-right text-lead font-bold tabular-nums text-foreground">{formatValue(value)}</strong>
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

interface DiffRowData {
  key: string
  label: string
  /** "Rol", o de una regla: salida o problema, y si vale para un único turno. */
  subtitle: string
  a: number | null
  b: number | null
  higherIsBetter: boolean
  note?: string
  /** En qué cantidad de manos pasa, de cuántas, en cada turno (el promedio no tiene una cuenta). */
  counts: Partial<Record<Turn, { a: HandCount | null; b: HandCount | null }>>
}

/** Qué tan distintas son las dos builds en una fila (en lo que se ve: décimas de punto). */
const gapOf = (row: DiffRowData) => (row.a === null || row.b === null ? 0 : Math.abs(shown(row.b) - shown(row.a)))

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
    label: roleA.label,
    subtitle: t('meta.compare.roleTag'),
    a: average(buildA),
    b: average(buildB),
    // Para bricks, robar menos es mejor.
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
  const onlyOne = row.turnContext === 'either' ? null : t(row.turnContext === 'first' ? 'meta.compare.onlyFirst' : 'meta.compare.onlySecond')

  return {
    key: row.id,
    label: row.name,
    subtitle: [kindLabel(row.kind), onlyOne].filter(Boolean).join(' · '),
    a: row.a,
    b: row.b,
    higherIsBetter: row.kind === 'opening',
    note: missing,
    counts: Object.fromEntries(TURNS.map((turn) => [turn, { a: row.turns[turn].a?.counts ?? null, b: row.turns[turn].b?.counts ?? null }])),
  }
}

/**
 * Dónde se nota la diferencia: una barra por rol y regla que apunta hacia la build que gana, tanto más larga cuanto más gana.
 * De entrada, las mayores; los porcentajes y las cantidades de manos quedan plegados en cada fila.
 */
function DifferencesCard({ comparison }: { comparison: BuildComparison }) {
  const roles = comparison.a.roles.first.flatMap((_, index) => roleRow(comparison, index) ?? [])
  const rules = comparison.rules.map(ruleRowOf).filter((row) => row.a !== null || row.b !== null)
  // Todas juntas, de la mayor diferencia a la menor (entre iguales se conserva el orden de siempre).
  const sorted = [...roles, ...rules].sort((left, right) => gapOf(right) - gapOf(left))

  if (sorted.length === 0) {
    return null
  }

  const maxGap = Math.max(MIN_GAP, gapOf(sorted[0]!))
  const main = sorted.filter((row) => gapOf(row) >= MIN_GAP).slice(0, SHOWN_ROWS)
  const rest = sorted.filter((row) => !main.includes(row))

  return (
    <Card padding="md" className="grid min-w-0 gap-3 self-start">
      <SectionHeader as="h3" title={t('meta.compare.detailTitle')} description={t('meta.compare.detailHint')} />
      {main.length > 0 ? (
        <>
          <div className="grid grid-cols-[minmax(0,1fr)_5rem] gap-3 text-micro text-soft">
            <div className="grid grid-cols-2">
              <span className="inline-flex items-center gap-1.5">
                <SideBadge side="A" size="sm" />
                {t('meta.compare.winnerLegend', { side: 'A' })}
              </span>
              <span className="inline-flex items-center justify-end gap-1.5">
                {t('meta.compare.winnerLegend', { side: 'B' })}
                <SideBadge side="B" size="sm" />
              </span>
            </div>
          </div>
          <ul className="m-0 grid list-none divide-y divide-border-subtle p-0">
            {main.map((row) => (
              <DiffRow key={row.key} row={row} maxGap={maxGap} />
            ))}
          </ul>
        </>
      ) : (
        <p className="m-0 text-body text-muted">{t('meta.compare.allClose')}</p>
      )}
      {rest.length > 0 ? (
        <details className="group border-t border-border-subtle pt-3">
          <summary className="flex cursor-pointer list-none items-center justify-between gap-3 rounded-control text-body font-semibold text-muted focus-visible:outline-none focus-visible:shadow-focus [&::-webkit-details-marker]:hidden">
            {t('meta.compare.moreRows', { count: rest.length })}
            <Icon name="chevron-down" size={16} className="shrink-0 text-soft transition-transform duration-200 group-open:rotate-180" />
          </summary>
          <ul className="m-0 mt-1 grid list-none divide-y divide-border-subtle p-0">
            {rest.map((row) => (
              <DiffRow key={row.key} row={row} maxGap={maxGap} />
            ))}
          </ul>
        </details>
      ) : null}
    </Card>
  )
}

function DiffRow({ row, maxGap }: { row: DiffRowData; maxGap: number }) {
  const winner = winnerOf(row.a, row.b, row.higherIsBetter)

  return (
    <li>
      <details className="group py-2.5">
        <summary className="grid cursor-pointer list-none gap-1.5 rounded-control focus-visible:outline-none focus-visible:shadow-focus [&::-webkit-details-marker]:hidden">
          <span className="flex min-w-0 items-baseline justify-between gap-2">
            <span className="min-w-0 text-body">
              <span className="font-semibold text-foreground">{row.label}</span>
              <span className="ml-2 text-micro text-soft">{row.subtitle}</span>
            </span>
            <Icon name="chevron-down" size={16} className="shrink-0 self-center text-soft transition-transform duration-200 group-open:rotate-180" />
          </span>
          <DiffBar winner={winner} gap={gapOf(row)} maxGap={maxGap} />
        </summary>
        <div className="mt-2 grid gap-2 text-micro tabular-nums">
          {(['A', 'B'] as const).map((side) => (
            <div key={side} className="grid gap-0.5">
              <p className="m-0 flex items-center gap-2">
                <SideBadge side={side} size="sm" />
                <strong className="text-body font-semibold text-foreground">{formatValue(side === 'A' ? row.a : row.b)}</strong>
              </p>
              {TURNS.map((turn) => {
                const counts = row.counts[turn]?.[side === 'A' ? 'a' : 'b']

                return counts ? (
                  <p key={turn} className="m-0 pl-7 text-soft">
                    {t(TURN_LABEL[turn])}: {handsText(counts)}
                  </p>
                ) : null
              })}
            </div>
          ))}
          {row.note ? <p className="m-0 text-warning-soft">{row.note}</p> : null}
        </div>
      </details>
    </li>
  )
}

/** Barra que sale del centro hacia la build que gana (izquierda A, derecha B); el largo es lo que gana, relativo a la mayor diferencia. */
function DiffBar({ winner, gap, maxGap }: { winner: Side | null; gap: number; maxGap: number }) {
  const width = winner ? Math.max(4, (gap / maxGap) * 100) : 0

  return (
    <span className="grid grid-cols-[minmax(0,1fr)_5rem] items-center gap-3">
      <span className="relative grid h-2 grid-cols-2 rounded-full bg-tint/8" aria-hidden="true">
        <span className="flex justify-end">{winner === 'A' ? <span className={cx('h-full rounded-l-full', SIDE_FILL.A)} style={{ width: `${width}%` }} /> : null}</span>
        <span className="flex justify-start">{winner === 'B' ? <span className={cx('h-full rounded-r-full', SIDE_FILL.B)} style={{ width: `${width}%` }} /> : null}</span>
        <span className="absolute bottom-[-3px] left-1/2 top-[-3px] w-px bg-tint/25" />
      </span>
      <span className={cx('text-right text-micro font-bold tabular-nums', winner ? SIDE_TEXT[winner] : 'text-soft')}>
        {winner ? `${winner} · ${formatPoints(gap / 1000)}` : '='}
      </span>
    </span>
  )
}
