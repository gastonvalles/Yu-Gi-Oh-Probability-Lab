import type { ReactNode } from 'react'

import type { BuildComparison, BuildMetrics, CardDiff, CleanComparison, ComparisonVerdict, RuleComparisonRow } from '../../app/build-comparison'
import type { RoleDistribution } from '../../app/role-distribution'
import { formatInteger, formatShortPercent } from '../../app/utils'
import { KindBadge } from '../probability/KindBadge'
import { Badge } from '../ui/Badge'
import { Button } from '../ui/Button'
import { Callout } from '../ui/Callout'
import { Card } from '../ui/Card'
import { cx } from '../ui/cx'
import { Icon, type IconName } from '../ui/Icon'
import { ProgressRing } from '../ui/ProgressRing'
import { SectionHeader } from '../ui/SectionHeader'
import { TONE, type Tone } from '../ui/tone'
import { overline } from '../ui/typography'
import { SideBadge } from './SideBadge'

/** Nombre con el que el comparador muestra tu deck actual. */
export const CURRENT_DECK_NAME = 'Deck actual'

/** Diferencias menores a esto se consideran empate (0.1 pp). */
const TIE_GAP = 0.001

type Side = 'A' | 'B'

/** Quién gana: `null` es empate. Para problemas (bricks) el menor valor es el mejor. */
function winnerOf(a: number | null, b: number | null, higherIsBetter = true): Side | null {
  if (a === null || b === null || Math.abs(b - a) < TIE_GAP) {
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
      </div>
      <div className="grid min-w-0 gap-4">
        <CardDiffCard diffs={comparison.cardDiffs} />
        <DetailCard comparison={comparison} />
      </div>
    </div>
  )
}

/** Un aviso por build: primero lo que falta clasificar (con qué hacer), después otros bloqueos. */
function BuildNotes({ side, build, canClassifyHere, onShowCards }: { side: Side; build: BuildMetrics; canClassifyHere: boolean; onShowCards: () => void }) {
  const pending = build.pendingCards.length
  const otherReasons = pending > 0 ? build.blockedReasons.filter((reason) => !/clasific|revisi/i.test(reason)) : build.blockedReasons

  return (
    <>
      {pending > 0 ? (
        <Callout
          tone="warning"
          title={`Build ${side}: ${formatInteger(pending)} carta${pending === 1 ? '' : 's'} sin clasificar`}
          action={
            canClassifyHere ? (
              <Button variant="secondary" size="sm" onClick={onShowCards}>
                Ver cartas
              </Button>
            ) : undefined
          }
        >
          {canClassifyHere ? 'Clasificalas para que la comparación sea fiel.' : 'Clasificalas en Categorización para poder comparar.'}
        </Callout>
      ) : null}
      {otherReasons.map((reason) => (
        <Callout key={reason} tone="warning" title={`Build ${side}`}>
          {reason}
        </Callout>
      ))}
    </>
  )
}

const VERDICT_LOOK: Record<ComparisonVerdict['kind'], { tone: Tone; icon: IconName }> = {
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

const CLEAN_COLUMNS = 'grid grid-cols-[minmax(0,1fr)_5.5rem_5.5rem] items-center gap-x-3'

function CleanTable({ clean }: { clean: CleanComparison }) {
  const rows = [
    { key: 'first', label: 'Yendo 1º', data: clean.first },
    { key: 'second', label: 'Yendo 2º', data: clean.second },
    { key: 'average', label: 'Promedio', data: clean.average },
  ] as const

  return (
    <div className="grid gap-3 border-t border-border-subtle pt-4">
      <SectionHeader as="h3" title="Manos limpias" description="Manos con salida y sin problemas, según tus reglas." />
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
                  {winner ? `Gana ${winner} · +${formatPoints(row.data.delta)}` : 'Empate'}
                </span>
              </div>
              <CleanRing side="A" value={row.data.a} dimmed={winner === 'B'} delay={index * 140} />
              <CleanRing side="B" value={row.data.b} dimmed={winner === 'A'} delay={index * 140 + 90} />
            </li>
          )
        })}
      </ul>
    </div>
  )
}

/** Manos limpias de una build; la que pierde en esa fila se apaga para que se vea quién gana. */
function CleanRing({ side, value, dimmed, delay }: { side: Side; value: number | null; dimmed: boolean; delay: number }) {
  return (
    <div className={cx('grid justify-items-center transition-opacity duration-200', dimmed && 'opacity-50')}>
      <ProgressRing value={value ?? 0} tone={side === 'A' ? 'brand' : 'info'} size={64} strokeWidth={6} delay={delay} label={`Manos limpias de la build ${side}: ${formatValue(value)}`}>
        {formatValue(value)}
      </ProgressRing>
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
      <SectionHeader as="h3" title="Qué cambia en el Main Deck" description="Copias de B respecto de A." />
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
}

/** Roles y reglas, plegado: una fila por cosa, con los dos valores y quién gana. */
function DetailCard({ comparison }: { comparison: BuildComparison }) {
  const roleRows: DetailRowData[] = comparison.a.roles.first.flatMap((roleA, index) => {
    const roleB = comparison.b.roles.first[index]!
    if (roleA.copies === 0 && roleB.copies === 0) {
      return []
    }
    return [
      {
        key: roleA.key,
        label: roleA.label,
        a: averageOneOrMore(roleA, comparison.a.roles.second[index]!),
        b: averageOneOrMore(roleB, comparison.b.roles.second[index]!),
        // Para bricks, robar menos es mejor.
        higherIsBetter: roleA.key !== 'brick',
      },
    ]
  })
  const ruleRows: DetailRowData[] = comparison.rules.map(toRuleRow)

  if (roleRows.length === 0 && ruleRows.length === 0) {
    return null
  }

  return (
    <Card padding="md" className="min-w-0">
      <details className="group">
        <summary className="flex cursor-pointer list-none items-center justify-between gap-3 rounded-control focus-visible:outline-none focus-visible:shadow-focus [&::-webkit-details-marker]:hidden">
          <SectionHeader as="h3" title="Dónde gana cada una" description="Por rol y por regla, en promedio. El veredicto sale de las manos limpias." />
          <Icon name="chevron-down" size={20} className="shrink-0 text-soft transition-transform duration-200 group-open:rotate-180" />
        </summary>
        <div className="mt-4 grid gap-5">
          <DetailGroup title="Roles" rows={roleRows} />
          <DetailGroup title="Reglas" rows={ruleRows} />
        </div>
      </details>
    </Card>
  )
}

/** Probabilidad de ver al menos uno en la mano, promediando yendo 1º y 2º. */
function averageOneOrMore(first: RoleDistribution, second: RoleDistribution): number {
  return mean(first.atLeastOne, second.atLeastOne)
}

function toRuleRow(row: RuleComparisonRow): DetailRowData {
  const missing = row.missingCardsIn.length === 2 ? 'ambas builds' : row.missingCardsIn.length === 1 ? `la build ${row.missingCardsIn[0]}` : null

  return {
    key: row.id,
    label: (
      <span className="flex min-w-0 flex-wrap items-center gap-1.5">
        <KindBadge kind={row.kind} />
        <span className="font-semibold text-foreground">{row.name}</span>
        {row.turnContext !== 'either' ? (
          <Badge tone="warning" size="sm" shape="tag">
            {row.turnContext === 'first' ? 'Solo 1º' : 'Solo 2º'}
          </Badge>
        ) : null}
      </span>
    ),
    a: row.a,
    b: row.b,
    higherIsBetter: row.kind === 'opening',
    note: missing ? `Falta una carta de la regla en ${missing}.` : undefined,
  }
}

const DETAIL_COLUMNS = 'grid grid-cols-[minmax(0,1fr)_3.25rem_3.25rem_1.5rem] items-center gap-x-2'

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
        <span />
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
                <span className="justify-self-end" title={winner ? `Mejor: ${winner}` : 'Empate'}>
                  {winner ? <SideBadge side={winner} size="sm" /> : <span className="text-soft">=</span>}
                </span>
              </div>
              {row.note ? <p className="m-0 text-micro text-warning-soft">{row.note}</p> : null}
            </li>
          )
        })}
      </ul>
    </div>
  )
}

function DetailValue({ value, wins }: { value: number | null; wins: boolean }) {
  return <span className={cx('justify-self-end text-right', wins ? 'font-bold text-success-soft' : 'text-muted')}>{formatValue(value)}</span>
}
