import type { LabResults } from '../../app/probability-lab'
import { formatInteger, formatShortPercent } from '../../app/utils'
import type { TurnView } from '../../types'
import { Card } from '../ui/Card'
import { cx } from '../ui/cx'
import { ProgressRing } from '../ui/ProgressRing'
import { overline } from '../ui/typography'
import {
  KPI_THRESHOLDS,
  KPI_TONE,
  KPI_TONE_LABELS,
  buildHandsOutOfTen,
  getKpiTone,
} from './lab-copy'

interface LabScoreCardProps {
  results: LabResults
  view: TurnView
  isRecalculating: boolean
}

/** Las marcas del anillo son los cortes de la nota (40 %, 60 %, 85 %). */
const THRESHOLD_TICKS = KPI_THRESHOLDS.map((threshold) => threshold.value)

/** El resultado principal: % de manos limpias en un anillo grande, su nota (con color) y el detalle por turno. */
export function LabScoreCard({ results, view, isRecalculating }: LabScoreCardProps) {
  const current = results[view]
  const kpi = getKpiTone(current.cleanProbability)
  const tone = KPI_TONE[kpi]

  return (
    <Card
      tone={tone}
      padding="lg"
      className="order-1 grid content-start gap-5 transition-opacity duration-150 aria-busy:opacity-75 min-[1101px]:col-span-5 min-[1101px]:col-start-1"
      aria-busy={isRecalculating}
    >
      <p className={cx('m-0', overline)}>Manos jugables sin problemas</p>

      <div className="grid justify-items-center gap-5 min-[520px]:grid-cols-[auto_minmax(0,1fr)] min-[520px]:items-center min-[520px]:justify-items-start">
        <ProgressRing
          value={current.cleanProbability}
          tone={tone}
          size={168}
          strokeWidth={14}
          ticks={THRESHOLD_TICKS}
          label={`Manos limpias: ${formatShortPercent(current.cleanProbability)} (${KPI_TONE_LABELS[kpi]})`}
        >
          {formatShortPercent(current.cleanProbability)}
        </ProgressRing>

        <p className="m-0 text-lead font-semibold text-foreground">{buildHandsOutOfTen(current.cleanProbability)}.</p>
      </div>

      <dl className="m-0 grid grid-cols-2 gap-x-4 border-t border-border-subtle pt-4">
        {view === 'average' ? (
          <>
            <TurnRing label="Yendo primero" value={results.first.cleanProbability} />
            <TurnRing label="Yendo segundo" value={results.second.cleanProbability} />
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

/** Resultado de un turno puntual: un anillo chico con su nota de color. */
function TurnRing({ label, value }: { label: string; value: number }) {
  return (
    <div className="flex items-center gap-2.5">
      <ProgressRing value={value} tone={KPI_TONE[getKpiTone(value)]} size={46} strokeWidth={5} delay={250} label={`${label}: ${formatShortPercent(value)}`}>
        {Math.round(value * 100)}%
      </ProgressRing>
      <div className="grid gap-0.5">
        <dt className="text-micro text-muted">{label}</dt>
        <dd className="m-0 text-lead font-semibold text-foreground tabular-nums">{formatShortPercent(value)}</dd>
      </div>
    </div>
  )
}

function Fact({ label, value }: { label: string; value: string }) {
  return (
    <div className="grid gap-0.5">
      <dt className="text-micro text-muted">{label}</dt>
      <dd className="m-0 text-lead font-semibold text-foreground tabular-nums">{value}</dd>
    </div>
  )
}
