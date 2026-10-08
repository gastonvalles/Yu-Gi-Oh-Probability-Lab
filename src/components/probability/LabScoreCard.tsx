import type { LabResults } from '../../app/probability-lab'
import { formatInteger, formatShortPercent } from '../../app/utils'
import type { TurnView } from '../../types'
import { Badge } from '../ui/Badge'
import { Card } from '../ui/Card'
import { cx } from '../ui/cx'
import { ProgressRing } from '../ui/ProgressRing'
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
      <div className="flex items-center justify-between gap-2">
        <p className={cx('m-0', overline)}>Manos jugables sin problemas</p>
        <Badge tone={tone} dot>
          {KPI_TONE_LABELS[kpi]}
        </Badge>
      </div>

      <div className="grid justify-items-center gap-5 min-[520px]:grid-cols-[auto_minmax(0,1fr)] min-[520px]:items-center min-[520px]:justify-items-start">
        <ProgressRing value={current.cleanProbability} tone={tone} size={168} strokeWidth={14} ticks={THRESHOLD_TICKS} label="Manos limpias">
          <span className="grid justify-items-center gap-1 leading-none">
            <span>{formatShortPercent(current.cleanProbability)}</span>
            <span className="text-micro font-normal tracking-normal text-muted">manos limpias</span>
          </span>
        </ProgressRing>

        <p className="m-0 grid gap-1.5 text-body text-muted">
          <strong className="text-lead font-semibold text-foreground">{buildHandsOutOfTen(current.cleanProbability)}.</strong>
          <span>{buildVerdict(kpi, view)}</span>
        </p>
      </div>

      <ul className="m-0 flex list-none flex-wrap gap-x-4 gap-y-1 p-0 text-micro" aria-label="Escala de notas">
        {KPI_SCALE.map((step) => (
          <li key={step.tone} className={cx('inline-flex items-center gap-1.5', step.tone === kpi ? 'font-semibold text-foreground' : 'text-soft')}>
            <span className={cx('size-2 rounded-full', TONE[KPI_TONE[step.tone]].fill, step.tone !== kpi && 'opacity-50')} aria-hidden="true" />
            {KPI_TONE_LABELS[step.tone]} <span className="tabular-nums">{step.range}</span>
          </li>
        ))}
      </ul>

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
