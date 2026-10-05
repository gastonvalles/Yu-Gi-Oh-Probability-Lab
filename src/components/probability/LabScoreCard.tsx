import type { LabResults } from '../../app/probability-lab'
import { formatInteger, formatPercent, formatShortPercent } from '../../app/utils'
import type { TurnView } from '../../types'
import { cx } from '../ui/cx'
import {
  KPI_THRESHOLDS,
  KPI_TONE_LABELS,
  buildHandsOutOfTen,
  buildVerdict,
  getKpiTone,
} from './lab-copy'

/** Color del resultado: lo heredan el borde, la etiqueta y la barra. */
export const LAB_TONE_COLOR = {
  excellent: '[--lab-tone-rgb:var(--accent-rgb)]',
  good: '[--lab-tone-rgb:var(--foreground-rgb)]',
  improvable: '[--lab-tone-rgb:var(--warning-rgb)]',
  critical: '[--lab-tone-rgb:var(--danger-rgb)]',
} as const

interface LabScoreCardProps {
  results: LabResults
  view: TurnView
  isRecalculating: boolean
}

export function LabScoreCard({ results, view, isRecalculating }: LabScoreCardProps) {
  const current = results[view]
  const tone = getKpiTone(current.cleanProbability)

  return (
    <section
      className={cx(
        'order-1 grid min-w-0 gap-[0.7rem] rounded-panel border border-[rgb(var(--lab-tone-rgb)/0.35)] px-[1.1rem] pb-[1.1rem] pt-4 transition-opacity duration-150 [background:radial-gradient(circle_at_top_right,rgb(var(--lab-tone-rgb)/0.12),transparent_45%),linear-gradient(180deg,rgb(var(--secondary-rgb)/0.98),rgb(var(--background-rgb)/1))] aria-busy:opacity-75',
        LAB_TONE_COLOR[tone],
      )}
      aria-busy={isRecalculating}
    >
      <div className="flex items-center justify-between gap-2">
        <p className="text-accent m-0 text-[0.68rem] uppercase tracking-widest">Manos jugables sin problemas</p>
        <span className="rounded-full border border-[rgb(var(--lab-tone-rgb)/0.35)] bg-[rgb(var(--lab-tone-rgb)/0.12)] px-[0.6rem] py-1 text-[0.68rem] font-extrabold uppercase tracking-[0.08em] text-[rgb(var(--lab-tone-rgb))]">
          {KPI_TONE_LABELS[tone]}
        </span>
      </div>

      <div className="flex flex-wrap items-center gap-[0.6rem]">
        <strong className="text-[clamp(2.8rem,9vw,4.4rem)] font-extrabold leading-[0.95] tracking-[-0.04em] text-foreground tabular-nums">{formatPercent(current.cleanProbability)}</strong>
      </div>

      <ScoreGauge probability={current.cleanProbability} />

      <p className="m-0 text-[0.86rem] leading-[1.35] text-muted [&_strong]:text-foreground">
        <strong>{buildHandsOutOfTen(current.cleanProbability)}.</strong> {buildVerdict(tone, view)}
      </p>

      <dl className="m-0 grid grid-cols-2 gap-2">
        {view === 'average' ? (
          <>
            <Fact label="Yendo primero" value={formatShortPercent(results.first.cleanProbability)} />
            <Fact label="Yendo segundo" value={formatShortPercent(results.second.cleanProbability)} />
          </>
        ) : (
          <>
            <Fact label="Manos posibles" value={formatInteger(current.totalHands ?? 0)} />
            <Fact label="Manos limpias" value={formatInteger(current.cleanHands ?? 0)} />
          </>
        )}
      </dl>
    </section>
  )
}

function ScoreGauge({ probability }: { probability: number }) {
  const percent = Math.max(0, Math.min(1, probability)) * 100

  return (
    <div
      className="relative h-[0.6rem] overflow-hidden rounded-full bg-foreground/8"
      role="meter"
      aria-label="Manos limpias"
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={Math.round(percent)}
    >
      <div
        className="h-full rounded-[inherit] bg-linear-to-r from-[rgb(var(--lab-tone-rgb)/0.55)] to-[rgb(var(--lab-tone-rgb))] transition-[width] motion-reduce:transition-none"
        style={{ width: `${percent}%` }} />
      {KPI_THRESHOLDS.map((threshold) => (
        <span
          key={threshold.value}
          className="absolute inset-y-0 w-0.5 bg-background/90"
          style={{ left: `${threshold.value * 100}%` }}
          title={`${KPI_TONE_LABELS[threshold.tone]} desde ${threshold.value * 100}%`}
        />
      ))}
    </div>
  )
}

function Fact({ label, value }: { label: string; value: string }) {
  return (
    <div className="grid gap-[0.1rem] rounded-[calc(var(--radius-panel)-0.3rem)] border border-border bg-background/50 px-[0.65rem] py-[0.45rem]">
      <dt className="text-[0.7rem] text-muted">{label}</dt>
      <dd className="m-0 text-[1rem] font-bold text-foreground tabular-nums">{value}</dd>
    </div>
  )
}
