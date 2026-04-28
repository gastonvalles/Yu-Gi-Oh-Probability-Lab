import type { PatternComparison } from '../../app/build-comparison'
import { formatPercent } from '../../app/utils'

interface ProbabilityComparisonProps {
  patterns: PatternComparison[]
  totalOpeningsA: number
  totalOpeningsB: number
  totalProblemsA: number
  totalProblemsB: number
}

export function ProbabilityComparison({
  patterns,
  totalOpeningsA,
  totalOpeningsB,
  totalProblemsA,
  totalProblemsB,
}: ProbabilityComparisonProps) {
  const openingsDelta = totalOpeningsA - totalOpeningsB
  const problemsDelta = totalProblemsA - totalProblemsB

  return (
    <div className="grid gap-3">
      <div className="grid gap-2 min-[720px]:grid-cols-2">
        <SummaryRow label="Openings" valueA={totalOpeningsA} valueB={totalOpeningsB} delta={openingsDelta} />
        <SummaryRow label="Problems" valueA={totalProblemsA} valueB={totalProblemsB} delta={problemsDelta} />
      </div>

      {patterns.length > 0 ? (
        <div className="grid gap-1">
          <div className="grid grid-cols-[minmax(0,1fr)_auto_auto_auto] gap-2 px-2 py-1">
            <span className="app-muted text-[0.68rem] uppercase tracking-[0.08em]">Patrón</span>
            <span className="app-muted w-[4.5rem] text-right text-[0.68rem] uppercase tracking-[0.08em]">A</span>
            <span className="app-muted w-[4.5rem] text-right text-[0.68rem] uppercase tracking-[0.08em]">B</span>
            <span className="app-muted w-[4.5rem] text-right text-[0.68rem] uppercase tracking-[0.08em]">Delta</span>
          </div>

          {patterns.map((pattern) => (
            <div
              key={pattern.definitionKey}
              className="surface-card grid grid-cols-[minmax(0,1fr)_auto_auto_auto] items-center gap-2 px-2 py-1.5"
            >
              <div className="flex min-w-0 items-center gap-2">
                <span className="truncate text-[0.84rem] text-(--text-main)">{pattern.patternName}</span>
                {pattern.exclusiveTo ? (
                  <span className="surface-card-warning shrink-0 px-1.5 py-0.5 text-[0.64rem]">
                    Solo {pattern.exclusiveTo}
                  </span>
                ) : null}
              </div>
              <span className="w-[4.5rem] text-right text-[0.84rem] tabular-nums text-(--text-main)">
                {pattern.probabilityA !== null ? formatPercent(pattern.probabilityA) : '—'}
              </span>
              <span className="w-[4.5rem] text-right text-[0.84rem] tabular-nums text-(--text-main)">
                {pattern.probabilityB !== null ? formatPercent(pattern.probabilityB) : '—'}
              </span>
              <span className={`w-[4.5rem] text-right text-[0.84rem] tabular-nums ${getDeltaColor(pattern.delta)}`}>
                {pattern.delta !== null ? formatDelta(pattern.delta) : '—'}
              </span>
            </div>
          ))}
        </div>
      ) : null}
    </div>
  )
}

function SummaryRow({ label, valueA, valueB, delta }: { label: string; valueA: number; valueB: number; delta: number }) {
  return (
    <div className="surface-card grid gap-1 px-3 py-2">
      <span className="app-muted text-[0.68rem] uppercase tracking-[0.08em]">{label}</span>
      <div className="flex items-baseline gap-3">
        <span className="text-[0.84rem] text-(--text-main)">A: {formatPercent(valueA)}</span>
        <span className="text-[0.84rem] text-(--text-main)">B: {formatPercent(valueB)}</span>
        <span className={`text-[0.84rem] tabular-nums ${getDeltaColor(delta)}`}>
          {formatDelta(delta)}
        </span>
      </div>
    </div>
  )
}

function formatDelta(delta: number): string {
  const sign = delta >= 0 ? '+' : ''
  return `${sign}${(delta * 100).toFixed(1)}%`
}

function getDeltaColor(delta: number | null): string {
  if (delta === null || Math.abs(delta) < 0.001) return 'text-(--text-muted)'
  return delta > 0 ? 'text-accent' : 'text-destructive'
}
