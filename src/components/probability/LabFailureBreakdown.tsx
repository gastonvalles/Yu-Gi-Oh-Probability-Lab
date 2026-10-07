import { useState } from 'react'

import type { LabViewResult, SegmentRule } from '../../app/probability-lab'
import { formatShortPercent } from '../../app/utils'
import type { HandSegment } from '../../types'
import { Callout } from '../ui/Callout'
import { cx } from '../ui/cx'
import { Meter } from '../ui/Meter'
import { TONE, type Tone } from '../ui/tone'
import { overline } from '../ui/typography'
import { buildFailureAdvice } from './lab-copy'
import { LAB_FOOTNOTE } from './lab-styles'
import { LabSection } from './LabSection'

const SEGMENTS: ReadonlyArray<{
  key: HandSegment
  tone: Tone
  label: string
  description: string
  rulesTitle: string
  emptyRules: string
}> = [
  {
    key: 'clean',
    tone: 'success',
    label: 'Limpias',
    description: 'Salida y ningún problema',
    rulesTitle: 'Salidas presentes en estas manos',
    emptyRules: 'No hay manos limpias.',
  },
  {
    key: 'withProblem',
    tone: 'warning',
    label: 'Con problema',
    description: 'Tienen salida, pero también algún problema activo',
    rulesTitle: 'Problemas presentes en estas manos',
    emptyRules: 'Ninguna mano con salida tiene problemas.',
  },
  {
    key: 'noOpening',
    tone: 'danger',
    label: 'Sin salida',
    description: 'No cumplen ninguna salida',
    rulesTitle: 'Problemas presentes en estas manos',
    emptyRules: 'Estas manos no tienen ningún problema activo: sólo les falta una salida.',
  },
]

const MAX_RULES = 4

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
      className="order-3 min-[1101px]:order-2 min-[1101px]:col-span-7"
    >
      <div className="flex h-4 gap-0.5 overflow-hidden rounded-full">
        {SEGMENTS.map((segment) => (
          <button
            key={segment.key}
            type="button"
            className={cx(
              'h-full min-w-1 cursor-pointer [transition:width_var(--motion-duration)_ease,filter_150ms_ease,opacity_150ms_ease] first:rounded-l-full last:rounded-r-full focus-visible:outline-none focus-visible:shadow-focus motion-reduce:transition-none',
              TONE[segment.tone].fill,
              activeSegment === segment.key ? 'brightness-110' : 'opacity-40',
            )}
            style={{ width: `${values[segment.key] * 100}%` }}
            aria-label={`${segment.label}: ${formatShortPercent(values[segment.key])}. Ver reglas`}
            onMouseEnter={() => setActiveSegment(segment.key)}
            onFocus={() => setActiveSegment(segment.key)}
            onClick={() => setActiveSegment(segment.key)}
          />
        ))}
      </div>

      <div className="grid grid-cols-[repeat(auto-fit,minmax(15rem,1fr))] items-start gap-4">
        <ul className="m-0 grid list-none gap-1 p-0">
          {SEGMENTS.map((segment) => (
            <li key={segment.key}>
              <button
                type="button"
                className={cx(
                  'grid w-full grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-3 rounded-control border px-3 py-2 text-left transition-[background-color,border-color] duration-150 focus-visible:outline-none focus-visible:shadow-focus',
                  activeSegment === segment.key ? 'border-white/10 bg-white/5' : 'border-transparent hover:bg-white/4',
                )}
                aria-pressed={activeSegment === segment.key}
                onMouseEnter={() => setActiveSegment(segment.key)}
                onClick={() => setActiveSegment(segment.key)}
              >
                <span className={cx('size-2.5 rounded-full', TONE[segment.tone].fill)} aria-hidden="true" />
                <span className="grid min-w-0">
                  <strong className="text-body font-semibold text-foreground">{segment.label}</strong>
                  <small className="text-caption text-muted">{segment.description}</small>
                </span>
                <span className="text-lead font-bold text-foreground tabular-nums">{formatShortPercent(values[segment.key])}</span>
              </button>
            </li>
          ))}
        </ul>

        <SegmentRules
          title={active.rulesTitle}
          emptyText={active.emptyRules}
          tone={active.tone}
          rules={result.segmentRules[active.key].filter((rule) => (active.key === 'clean' ? rule.kind === 'opening' : rule.kind === 'problem'))}
        />
      </div>

      <Callout tone="info" icon="sparkles">
        {buildFailureAdvice(result)}
      </Callout>
    </LabSection>
  )
}

function SegmentRules({ title, emptyText, tone, rules }: { title: string; emptyText: string; tone: Tone; rules: SegmentRule[] }) {
  return (
    <div className={cx('grid gap-3 rounded-control border p-3', TONE[tone].tint)} aria-live="polite">
      <span className={cx(overline, TONE[tone].text)}>{title}</span>
      {rules.length === 0 ? (
        <p className={LAB_FOOTNOTE}>{emptyText}</p>
      ) : (
        <ul className="m-0 grid list-none gap-2 p-0">
          {rules.slice(0, MAX_RULES).map((rule) => (
            <li key={rule.patternId} className="grid grid-cols-[minmax(0,1.4fr)_minmax(3rem,1fr)_auto] items-center gap-3 text-small">
              <span className="truncate text-foreground">{rule.name}</span>
              <Meter value={rule.share} tone={tone} size="sm" label={rule.name} />
              <span className="font-bold text-foreground tabular-nums">{formatShortPercent(rule.share)}</span>
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
