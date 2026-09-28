import type { LabResults } from '../../app/probability-lab'
import { formatInteger, formatPercent, formatShortPercent } from '../../app/utils'
import type { TurnView } from '../../types'
import {
  KPI_THRESHOLDS,
  KPI_TONE_LABELS,
  buildHandsOutOfTen,
  buildVerdict,
  getKpiTone,
} from './lab-copy'

interface LabScoreCardProps {
  results: LabResults
  view: TurnView
  feedback: { label: string; tone: 'positive' | 'negative' } | null
  isRecalculating: boolean
}

export function LabScoreCard({ results, view, feedback, isRecalculating }: LabScoreCardProps) {
  const current = results[view]
  const tone = getKpiTone(current.cleanProbability)

  return (
    <section className="lab-score" data-tone={tone} aria-busy={isRecalculating}>
      <div className="lab-score-head">
        <p className="app-kicker m-0 text-[0.68rem] uppercase tracking-widest">Manos jugables sin problemas</p>
        <span className="lab-tone-badge" data-tone={tone}>
          {KPI_TONE_LABELS[tone]}
        </span>
      </div>

      <div className="lab-score-value-row">
        <strong className="lab-score-value">{formatPercent(current.cleanProbability)}</strong>
        {feedback ? (
          <span className="lab-feedback-chip" data-tone={feedback.tone}>
            {feedback.label}
          </span>
        ) : null}
      </div>

      <ScoreGauge probability={current.cleanProbability} />

      <p className="lab-score-verdict">
        <strong>{buildHandsOutOfTen(current.cleanProbability)}.</strong> {buildVerdict(tone, view)}
      </p>

      <dl className="lab-score-facts">
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
      className="lab-gauge"
      role="meter"
      aria-label="Manos limpias"
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={Math.round(percent)}
    >
      <div className="lab-gauge-fill" style={{ width: `${percent}%` }} />
      {KPI_THRESHOLDS.map((threshold) => (
        <span
          key={threshold.value}
          className="lab-gauge-mark"
          style={{ left: `${threshold.value * 100}%` }}
          title={`${KPI_TONE_LABELS[threshold.tone]} desde ${threshold.value * 100}%`}
        />
      ))}
    </div>
  )
}

function Fact({ label, value }: { label: string; value: string }) {
  return (
    <div className="lab-score-fact">
      <dt>{label}</dt>
      <dd>{value}</dd>
    </div>
  )
}
