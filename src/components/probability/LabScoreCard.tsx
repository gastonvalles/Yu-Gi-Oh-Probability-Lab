import { useState } from 'react'

import { per100Delta } from '../../app/lab-change'
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
import { Skeleton } from '../ui/Skeleton'
import { RING_ARC } from '../ui/tone'
import { LabDelta } from './LabDelta'
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
  /**
   * Probando un cambio («Probar el cambio»): `results` es tu deck con el cambio y esto, tu deck de verdad. Suma el chip «Con el cambio», «▲3 antes 81» bajo la frase
   * y el ▲ / ▼ de «Sin salida» y «Con problema». El anillo no cambia de lugar ni de tamaño: sólo su contenido.
   */
  before?: LabResults
  /** Mientras se mide tu deck con el cambio: el anillo, la nota y los números son un esqueleto del mismo tamaño (nunca los de antes como si fueran nuevos). */
  measuring?: boolean
  className?: string
}

/**
 * El veredicto, en una tarjeta común: un solo anillo de reparto (el arco verde es el número del centro, las manos buenas; la cola, las que no abren), la nota junto
 * a la frase, las manos sin salida y con problema (cada una se abre con sus problemas) y, debajo, la lente con un anillo por turno.
 */
export function LabScoreCard({ results, view, onViewChange, isRecalculating, handSize, onOpenDisclaimer, before, measuring = false, className }: LabScoreCardProps) {
  const [sheetOpen, setSheetOpen] = useState(false)
  const current = results[view]
  const kpi = getKpiTone(current.cleanProbability)
  // El orden del reparto es el de la lectura: desde las 12, lo bueno; al final, la cola de lo que no abre.
  const segments = [
    { key: 'clean', value: current.cleanProbability, color: RING_ARC.success },
    { key: 'withProblem', value: current.withProblemProbability, color: RING_ARC.warning },
    { key: 'noOpening', value: current.noOpeningProbability, color: RING_ARC.danger },
  ]
  const previous = before?.[view]

  return (
    <Card
      padding="lg"
      aria-label={t('lab.score.label')}
      aria-busy={isRecalculating || measuring}
      className={cx('grid content-start gap-4 transition-opacity duration-150 aria-busy:opacity-75', className)}
    >
      <div className="relative grid grid-cols-[auto_minmax(0,1fr)] items-center gap-4 md:gap-7">
        {/* 140 px en el celular y 184 en escritorio: el anillo crece con su caja (`fluid`). */}
        <span className="size-35 md:size-46">
          {measuring ? (
            <Skeleton radius="chip" className="size-full" role="img" aria-hidden={false} aria-label={t('lab.change.measuring')} />
          ) : (
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
          )}
        </span>

        <div className="grid min-w-0 content-center justify-items-start gap-1.5 pr-8">
          <div className="flex flex-wrap gap-1.5">
            {measuring ? <Skeleton radius="chip" className="h-6 w-16" /> : <Badge tone={KPI_TONE[kpi]}>{KPI_TONE_LABELS[kpi]}</Badge>}
            {/* `wrap`: al lado del anillo, en 320 px o en la tableta, «Con el cambio» no entra en un renglón y se salía de la tarjeta. */}
            {before ? (
              <Badge tone="info" wrap>
                {t('lab.change.chip')}
              </Badge>
            ) : null}
          </div>
          <p className="m-0 text-lead font-semibold text-foreground md:text-title">{t('lab.score.goodHands')}</p>
          {!previous ? (
            <p className="m-0 text-body text-muted">{t('lab.score.byYourRules')}</p>
          ) : measuring ? (
            <Skeleton radius="control" className="h-5 w-24" />
          ) : (
            <BeforeLine before={previous.cleanProbability} after={current.cleanProbability} />
          )}
        </div>

        <IconButton tone="close" size="sm" className="absolute -right-2 -top-2" disabled={measuring} aria-label={t('lab.sheet.open')} title={t('lab.sheet.open')} onClick={() => setSheetOpen(true)}>
          <Icon name="info" />
        </IconButton>
      </div>

      <LabFailureBreakdown result={current} before={previous} measuring={measuring} />

      <TurnViewToggle
        activeView={view}
        onChange={onViewChange}
        measuring={measuring}
        values={{ average: results.average.cleanProbability, first: results.first.cleanProbability, second: results.second.cleanProbability }}
        details={{ average: t('lab.turnView.bothHands', { first: handSize, second: handSize + 1 }), first: formatCardCount(handSize), second: formatCardCount(handSize + 1) }}
      />

      <LabScoreSheet isOpen={sheetOpen} onClose={() => setSheetOpen(false)} results={results} handSize={handSize} onOpenDisclaimer={onOpenDisclaimer} />
    </Card>
  )
}

/** «▲ 4 antes 81»: cuánto movió el cambio el número del centro y cuál era sin él (verde si sube, rojo si baja). Para el lector de pantalla, una sola frase. */
function BeforeLine({ before, after }: { before: number; after: number }) {
  const diff = per100Delta(before, after)
  const value = formatPer100(before)
  const said = diff === 0 ? t('lab.change.delta.same', { before: value }) : t(diff > 0 ? 'lab.change.delta.up' : 'lab.change.delta.down', { n: Math.abs(diff), before: value })

  return (
    <p className="m-0 flex flex-wrap items-baseline gap-x-1.5 text-body text-muted">
      <span aria-hidden="true" className="contents">
        <LabDelta diff={diff} />
        <span>{t('lab.change.before', { value })}</span>
      </span>
      <span className="sr-only">{said}</span>
    </p>
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
