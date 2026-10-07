import type { LabResults } from '../../app/probability-lab'
import { formatInteger, formatPercent, formatShortPercent } from '../../app/utils'
import type { TurnView } from '../../types'
import { Badge } from '../ui/Badge'
import { Card } from '../ui/Card'
import { cx } from '../ui/cx'
import { Meter } from '../ui/Meter'
import { TONE } from '../ui/tone'
import { overline } from '../ui/typography'
import {
  KPI_SCALE,
  KPI_THRESHOLDS,
  KPI_TONE,
  KPI_TONE_LABELS,
  buildHandsOutOfTen,
  buildVerdict,
  getKpiTone,
} from './lab-copy'

interface LabScoreCardProps {
  results: LabResults
  view: TurnView
  isRecalculating: boolean
}

const THRESHOLD_TICKS = KPI_THRESHOLDS.map((threshold) => ({
  value: threshold.value,
  label: `${KPI_TONE_LABELS[threshold.tone]} desde ${threshold.value * 100}%`,
}))

/** El resultado principal: % de manos limpias, su nota (con color) y el detalle por turno. */
export function LabScoreCard({ results, view, isRecalculating }: LabScoreCardProps) {
  const current = results[view]
  const kpi = getKpiTone(current.cleanProbability)
  const tone = KPI_TONE[kpi]

  return (
    <Card
      tone={tone}
      padding="lg"
      className="order-1 flex flex-col gap-4 transition-opacity duration-150 aria-busy:opacity-75 min-[1101px]:col-span-5"
      aria-busy={isRecalculating}
    >
      <div className="flex items-center justify-between gap-2">
        <p className={cx('m-0', overline)}>Manos jugables sin problemas</p>
        <Badge tone={tone} dot>
          {KPI_TONE_LABELS[kpi]}
        </Badge>
      </div>

      <strong className="text-[clamp(3rem,10vw,4.25rem)] font-extrabold leading-none tracking-[-0.04em] text-foreground tabular-nums">
        {formatPercent(current.cleanProbability)}
      </strong>

      <div className="grid gap-2">
        <Meter value={current.cleanProbability} tone={tone} size="lg" ticks={THRESHOLD_TICKS} label="Manos limpias" />
        <ul className="m-0 flex list-none flex-wrap gap-x-4 gap-y-1 p-0 text-micro" aria-label="Escala de notas">
          {KPI_SCALE.map((step) => (
            <li key={step.tone} className={cx('inline-flex items-center gap-1.5', step.tone === kpi ? 'font-semibold text-foreground' : 'text-soft')}>
              <span className={cx('size-2 rounded-full', TONE[KPI_TONE[step.tone]].fill, step.tone !== kpi && 'opacity-50')} aria-hidden="true" />
              {KPI_TONE_LABELS[step.tone]} <span className="tabular-nums">{step.range}</span>
            </li>
          ))}
        </ul>
      </div>

      <p className="m-0 text-body text-muted [&_strong]:font-semibold [&_strong]:text-foreground">
        <strong>{buildHandsOutOfTen(current.cleanProbability)}.</strong> {buildVerdict(kpi, view)}
      </p>

      <dl className="m-0 mt-auto grid grid-cols-2 gap-2">
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
    </Card>
  )
}

function Fact({ label, value }: { label: string; value: string }) {
  return (
    <div className="grid gap-0.5 rounded-control border border-border-subtle bg-black/25 px-3 py-2">
      <dt className="text-caption text-muted">{label}</dt>
      <dd className="m-0 text-lead font-bold text-foreground tabular-nums">{value}</dd>
    </div>
  )
}
