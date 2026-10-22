import { useState } from 'react'

import type { LabViewResult, SegmentRule } from '../../app/probability-lab'
import { formatShortPercent } from '../../app/utils'
import { t, type MessageKey } from '../../i18n'
import type { HandSegment } from '../../types'
import { cx } from '../ui/cx'
import { ProgressRing } from '../ui/ProgressRing'
import { SegmentedRing } from '../ui/SegmentedRing'
import { RING_ARC, TONE, type Tone } from '../ui/tone'
import { overline } from '../ui/typography'
import { LAB_FOOTNOTE } from './lab-styles'
import { LabSection } from './LabSection'

// Los textos de cada tramo son claves de mensajes: se arman al dibujar, en el idioma de ese momento.
const SEGMENTS = [
  {
    key: 'clean',
    tone: 'success',
    rgb: RING_ARC.success,
    label: 'lab.breakdown.clean.label',
    description: 'lab.breakdown.clean.description',
    rulesTitle: 'lab.breakdown.clean.rules',
    emptyRules: 'lab.breakdown.clean.empty',
  },
  {
    key: 'withProblem',
    tone: 'warning',
    rgb: RING_ARC.warning,
    label: 'lab.breakdown.withProblem.label',
    description: 'lab.breakdown.withProblem.description',
    rulesTitle: 'lab.breakdown.withProblem.rules',
    emptyRules: 'lab.breakdown.withProblem.empty',
  },
  {
    key: 'noOpening',
    tone: 'danger',
    rgb: RING_ARC.danger,
    label: 'lab.breakdown.noOpening.label',
    description: 'lab.breakdown.noOpening.description',
    rulesTitle: 'lab.breakdown.noOpening.rules',
    emptyRules: 'lab.breakdown.noOpening.empty',
  },
] as const satisfies ReadonlyArray<{
  key: HandSegment
  tone: Tone
  /** "R G B" del tramo en el anillo. */
  rgb: string
  label: MessageKey
  description: MessageKey
  rulesTitle: MessageKey
  emptyRules: MessageKey
}>

const MAX_RULES = 4

/** Cómo se reparten las manos: un anillo de tres tramos, la leyenda tocable y las reglas del tramo elegido. */
export function LabFailureBreakdown({ result }: { result: LabViewResult }) {
  const [selectedSegment, setActiveSegment] = useState<HandSegment | null>(null)
  const values: Record<HandSegment, number> = {
    clean: result.cleanProbability,
    withProblem: result.withProblemProbability,
    noOpening: result.noOpeningProbability,
  }
  // Sin elección del usuario, se muestra el grupo no limpio con más manos.
  const activeSegment = selectedSegment ?? (values.withProblem >= values.noOpening ? 'withProblem' : 'noOpening')
  const active = SEGMENTS.find((segment) => segment.key === activeSegment) ?? SEGMENTS[0]!

  return (
    <LabSection
      title={t('lab.breakdown.title')}
      icon="chart"
      summary={t('lab.breakdown.summary', { withProblem: formatShortPercent(values.withProblem), noOpening: formatShortPercent(values.noOpening) })}
      defaultOpenOnMobile={false}
      className="order-3 min-[1101px]:order-2 min-[1101px]:col-span-7 min-[1101px]:col-start-6 min-[1101px]:row-span-2 min-[1101px]:row-start-2"
    >
      <div className="grid items-center justify-items-center gap-5 min-[560px]:grid-cols-[auto_minmax(0,1fr)] min-[560px]:justify-items-start min-[560px]:gap-8">
        <SegmentedRing
          size={168}
          strokeWidth={14}
          activeKey={selectedSegment}
          onSegmentSelect={(key) => setActiveSegment(key as HandSegment)}
          label={SEGMENTS.map((segment) => `${t(segment.label)}: ${formatShortPercent(values[segment.key])}`).join(', ')}
          segments={SEGMENTS.map((segment) => ({ key: segment.key, value: values[segment.key], color: segment.rgb }))}
        >
          {/* Como en los demás anillos, el centro dice el porcentaje: el del grupo que tocás o recorrés con el mouse. */}
          {formatShortPercent(values[activeSegment])}
        </SegmentedRing>

        <ul className="m-0 grid w-full list-none gap-1 p-0">
          {SEGMENTS.map((segment) => (
            <li key={segment.key}>
              <button
                type="button"
                className={cx(
                  'grid w-full grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-x-3 rounded-control px-3 py-2 text-left transition-colors duration-150 focus-visible:outline-none focus-visible:shadow-focus',
                  activeSegment === segment.key ? 'bg-tint/10' : 'hover:bg-tint/6',
                )}
                aria-pressed={activeSegment === segment.key}
                onMouseEnter={() => setActiveSegment(segment.key)}
                onFocus={() => setActiveSegment(segment.key)}
                onClick={() => setActiveSegment(segment.key)}
              >
                <span className={cx('size-2.5 rounded-full', TONE[segment.tone].fill)} aria-hidden="true" />
                <span className="grid min-w-0">
                  <strong className="text-body font-semibold text-foreground">{t(segment.label)}</strong>
                  <small className="text-micro text-muted">{t(segment.description)}</small>
                </span>
                <span className="text-lead font-semibold tabular-nums text-foreground">{formatShortPercent(values[segment.key])}</span>
              </button>
            </li>
          ))}
        </ul>
      </div>

      <SegmentRules
        title={t(active.rulesTitle)}
        emptyText={t(active.emptyRules)}
        tone={active.tone}
        rules={result.segmentRules[active.key].filter((rule) => (active.key === 'clean' ? rule.kind === 'opening' : rule.kind === 'problem'))}
      />

    </LabSection>
  )
}

function SegmentRules({ title, emptyText, tone, rules }: { title: string; emptyText: string; tone: Tone; rules: SegmentRule[] }) {
  return (
    <div className="grid gap-3 border-t border-border-subtle pt-4" aria-live="polite">
      <span className={cx(overline, TONE[tone].text)}>{title}</span>
      {rules.length === 0 ? (
        <p className={LAB_FOOTNOTE}>{emptyText}</p>
      ) : (
        <ul className="m-0 grid list-none gap-x-6 gap-y-3 p-0 min-[640px]:grid-cols-2">
          {rules.slice(0, MAX_RULES).map((rule, index) => (
            <li key={rule.patternId} className="flex min-w-0 items-center gap-3 text-body">
              <ProgressRing value={rule.share} tone={tone} size={44} strokeWidth={4} delay={index * 90} label={`${rule.name}: ${formatShortPercent(rule.share)}`}>
                {formatShortPercent(rule.share)}
              </ProgressRing>
              <span className="min-w-0 truncate text-foreground">{rule.name}</span>
            </li>
          ))}
        </ul>
      )}
      <small className={LAB_FOOTNOTE}>{t('lab.breakdown.footnote')}</small>
    </div>
  )
}
