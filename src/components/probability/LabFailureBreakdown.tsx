import { useState } from 'react'

import type { LabViewResult, SegmentRule } from '../../app/probability-lab'
import { formatShortPercent } from '../../app/utils'
import type { HandSegment } from '../../types'
import { Callout } from '../ui/Callout'
import { cx } from '../ui/cx'
import { ProgressRing } from '../ui/ProgressRing'
import { SegmentedRing } from '../ui/SegmentedRing'
import { TONE, type Tone } from '../ui/tone'
import { overline } from '../ui/typography'
import { buildFailureAdvice } from './lab-copy'
import { LAB_FOOTNOTE } from './lab-styles'
import { LabSection } from './LabSection'

const SEGMENTS: ReadonlyArray<{
  key: HandSegment
  tone: Tone
  /** "R G B" del tramo en el anillo. */
  rgb: string
  label: string
  description: string
  rulesTitle: string
  emptyRules: string
}> = [
  {
    key: 'clean',
    tone: 'success',
    rgb: 'var(--success-rgb)',
    label: 'Limpias',
    description: 'Salida y ningún problema',
    rulesTitle: 'Salidas presentes en estas manos',
    emptyRules: 'No hay manos limpias.',
  },
  {
    key: 'withProblem',
    tone: 'warning',
    rgb: 'var(--warning-rgb)',
    label: 'Con problema',
    description: 'Tienen salida, pero también algún problema activo',
    rulesTitle: 'Problemas presentes en estas manos',
    emptyRules: 'Ninguna mano con salida tiene problemas.',
  },
  {
    key: 'noOpening',
    tone: 'danger',
    rgb: 'var(--danger-rgb)',
    label: 'Sin salida',
    description: 'No cumplen ninguna salida',
    rulesTitle: 'Problemas presentes en estas manos',
    emptyRules: 'Estas manos no tienen ningún problema activo: sólo les falta una salida.',
  },
]

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
      title="Cómo se reparten tus manos"
      icon="chart"
      summary={`${formatShortPercent(values.withProblem)} con problema · ${formatShortPercent(values.noOpening)} sin salida`}
      defaultOpenOnMobile={false}
      className="order-3 min-[1101px]:order-2 min-[1101px]:col-span-7 min-[1101px]:col-start-6 min-[1101px]:row-span-2 min-[1101px]:row-start-2"
    >
      <div className="grid items-center justify-items-center gap-5 min-[560px]:grid-cols-[auto_minmax(0,1fr)] min-[560px]:justify-items-start min-[560px]:gap-8">
        <SegmentedRing
          size={176}
          strokeWidth={16}
          activeKey={activeSegment}
          label={SEGMENTS.map((segment) => `${segment.label}: ${formatShortPercent(values[segment.key])}`).join(', ')}
          segments={SEGMENTS.map((segment) => ({ key: segment.key, value: values[segment.key], color: segment.rgb }))}
        >
          <span className="grid gap-1 leading-none">
            <strong className="text-stat font-bold tracking-[-0.02em] text-foreground tabular-nums">{formatShortPercent(values[active.key])}</strong>
            <span className="text-micro text-muted">{active.label.toLowerCase()}</span>
          </span>
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
                  <strong className="text-body font-semibold text-foreground">{segment.label}</strong>
                  <small className="text-micro text-muted">{segment.description}</small>
                </span>
                <span className="text-lead font-semibold tabular-nums text-foreground">{formatShortPercent(values[segment.key])}</span>
              </button>
            </li>
          ))}
        </ul>
      </div>

      <SegmentRules
        title={active.rulesTitle}
        emptyText={active.emptyRules}
        tone={active.tone}
        rules={result.segmentRules[active.key].filter((rule) => (active.key === 'clean' ? rule.kind === 'opening' : rule.kind === 'problem'))}
      />

      <Callout tone="info" icon="sparkles" className="mt-auto">
        {buildFailureAdvice(result)}
      </Callout>
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
                {Math.round(rule.share * 100)}%
              </ProgressRing>
              <span className="grid min-w-0">
                <span className="truncate text-foreground">{rule.name}</span>
                <span className="text-micro tabular-nums text-muted">{formatShortPercent(rule.share)} de estas manos</span>
              </span>
            </li>
          ))}
        </ul>
      )}
      <small className={LAB_FOOTNOTE}>
        % de las manos de este grupo que cumplen cada regla (una mano puede cumplir varias). Pasá el mouse o tocá otro grupo para cambiar.
      </small>
    </div>
  )
}
