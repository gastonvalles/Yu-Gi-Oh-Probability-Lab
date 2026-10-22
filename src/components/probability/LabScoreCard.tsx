import { useState } from 'react'

import type { LabResults } from '../../app/probability-lab'
import { formatShortPercent } from '../../app/utils'
import { t } from '../../i18n'
import type { TurnView } from '../../types'
import { Badge } from '../ui/Badge'
import { Card } from '../ui/Card'
import { cx } from '../ui/cx'
import { Icon } from '../ui/Icon'
import { IconButton } from '../ui/IconButton'
import { formatPer100 } from '../ui/ring-shared'
import { SegmentedRing } from '../ui/SegmentedRing'
import { RING_ARC } from '../ui/tone'
import { LabFailureBreakdown } from './LabFailureBreakdown'
import { LabScoreSheet } from './LabScoreSheet'
import { KPI_TONE, KPI_TONE_LABELS, formatCardCount, getKpiTone } from './lab-copy'
import { TurnViewToggle } from './TurnViewToggle'

interface LabScoreCardProps {
  results: LabResults
  view: TurnView
  /** La lente (Promedio / Yendo 1º / Yendo 2º) va adentro del veredicto, debajo del anillo. */
  onViewChange: (view: TurnView) => void
  isRecalculating: boolean
  /** Las cartas de la mano yendo primero: la ficha cuenta las manos de cada turno y la lente dice cuántas cartas mira. */
  handSize: number
  /** Abre el aviso de cómo leer los porcentajes (desde la ficha). */
  onOpenDisclaimer: () => void
  className?: string
}

/**
 * El veredicto, en una tarjeta común: un solo anillo de reparto (el arco verde es el número del centro, las manos buenas; la cola, las que no abren), la nota junto
 * a la frase, las manos sin salida y con problema (cada una se abre con sus problemas) y, debajo, la lente con un anillo por turno.
 */
export function LabScoreCard({ results, view, onViewChange, isRecalculating, handSize, onOpenDisclaimer, className }: LabScoreCardProps) {
  const [sheetOpen, setSheetOpen] = useState(false)
  const current = results[view]
  const kpi = getKpiTone(current.cleanProbability)
  // El orden del reparto es el de la lectura: desde las 12, lo bueno; al final, la cola de lo que no abre.
  const segments = [
    { key: 'clean', value: current.cleanProbability, color: RING_ARC.success },
    { key: 'withProblem', value: current.withProblemProbability, color: RING_ARC.warning },
    { key: 'noOpening', value: current.noOpeningProbability, color: RING_ARC.danger },
  ]

  return (
    <Card padding="lg" aria-label={t('lab.score.label')} aria-busy={isRecalculating} className={cx('grid content-start gap-4 transition-opacity duration-150 aria-busy:opacity-75', className)}>
      <div className="relative grid grid-cols-[auto_minmax(0,1fr)] items-center gap-4 md:gap-7">
        {/* 140 px en el celular y 184 en escritorio: el anillo crece con su caja (`fluid`). */}
        <span className="size-35 md:size-46">
          <SegmentedRing
            fluid
            size={184}
            strokeWidth={16}
            segments={segments}
            format={(value) => <VerdictNumber value={value} />}
            label={t('lab.score.ringLabel', {
              good: formatShortPercent(current.cleanProbability),
              problem: formatShortPercent(current.withProblemProbability),
              none: formatShortPercent(current.noOpeningProbability),
              tone: KPI_TONE_LABELS[kpi],
            })}
          />
        </span>

        <div className="grid min-w-0 content-center justify-items-start gap-1.5 pr-8">
          <Badge tone={KPI_TONE[kpi]}>{KPI_TONE_LABELS[kpi]}</Badge>
          <p className="m-0 text-lead font-semibold text-foreground md:text-title">{t('lab.score.goodHands')}</p>
          <p className="m-0 text-body text-muted">{t('lab.score.byYourRules')}</p>
        </div>

        <IconButton tone="close" size="sm" className="absolute -right-2 -top-2" aria-label={t('lab.sheet.open')} title={t('lab.sheet.open')} onClick={() => setSheetOpen(true)}>
          <Icon name="info" />
        </IconButton>
      </div>

      <LabFailureBreakdown result={current} />

      <TurnViewToggle
        activeView={view}
        onChange={onViewChange}
        values={{ average: results.average.cleanProbability, first: results.first.cleanProbability, second: results.second.cleanProbability }}
        details={{ average: t('lab.turnView.bothHands', { first: handSize, second: handSize + 1 }), first: formatCardCount(handSize), second: formatCardCount(handSize + 1) }}
      />

      <LabScoreSheet isOpen={sheetOpen} onClose={() => setSheetOpen(false)} results={results} handSize={handSize} onOpenDisclaimer={onOpenDisclaimer} />
    </Card>
  )
}

/** El número y su unidad, pegados y adentro del anillo: «81 / de cada 100». */
function VerdictNumber({ value }: { value: number }) {
  return (
    <span className="grid justify-items-center leading-none">
      <span>{formatPer100(value)}</span>
      <span className="mt-1 text-body font-normal tracking-normal text-muted">{t('lab.score.unit')}</span>
    </span>
  )
}
