import { useState } from 'react'

import type { LabViewResult, SegmentRule } from '../../app/probability-lab'
import { formatShortPercent } from '../../app/utils'
import type { HandSegment } from '../../types'
import { cx } from '../ui/cx'
import { buildFailureAdvice } from './lab-copy'
import { LAB_FOOTNOTE } from './lab-styles'
import { LabSection } from './LabSection'

/** Color de cada grupo de manos (barra, leyenda) y variable de color de su caja de reglas. */
const SEGMENT_BG: Record<HandSegment, string> = {
  clean: 'bg-success/85',
  withProblem: 'bg-warning/90',
  noOpening: 'bg-danger/85',
}

const SEGMENT_RGB: Record<HandSegment, string> = {
  clean: '[--lab-segment-rgb:var(--success-rgb)]',
  withProblem: '[--lab-segment-rgb:var(--warning-rgb)]',
  noOpening: '[--lab-segment-rgb:var(--danger-rgb)]',
}

const SEGMENTS: ReadonlyArray<{
  key: HandSegment
  label: string
  description: string
  rulesTitle: string
  emptyRules: string
}> = [
  {
    key: 'clean',
    label: 'Limpias',
    description: 'Salida y ningún problema',
    rulesTitle: 'Salidas presentes en estas manos',
    emptyRules: 'No hay manos limpias.',
  },
  {
    key: 'withProblem',
    label: 'Con problema',
    description: 'Tienen salida, pero también algún problema activo',
    rulesTitle: 'Problemas presentes en estas manos',
    emptyRules: 'Ninguna mano con salida tiene problemas.',
  },
  {
    key: 'noOpening',
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
      summary={`${formatShortPercent(values.withProblem)} con problema · ${formatShortPercent(values.noOpening)} sin salida`}
      defaultOpenOnMobile={false}
      className="order-3 min-[1101px]:order-2"
    >
      <div className="flex h-4 overflow-hidden rounded-full bg-foreground/8">
        {SEGMENTS.map((segment) => (
          <button
            key={segment.key}
            type="button"
            className={cx(
              'h-full cursor-pointer [transition:width_var(--motion-duration)_ease,filter_150ms_ease,opacity_150ms_ease] motion-reduce:transition-none',
              SEGMENT_BG[segment.key],
              activeSegment === segment.key ? 'brightness-[1.15]' : 'opacity-45',
            )}
            style={{ width: `${values[segment.key] * 100}%` }}
            aria-label={`${segment.label}: ${formatShortPercent(values[segment.key])}. Ver reglas`}
            onMouseEnter={() => setActiveSegment(segment.key)}
            onFocus={() => setActiveSegment(segment.key)}
            onClick={() => setActiveSegment(segment.key)}
          />
        ))}
      </div>

      <div className="grid grid-cols-[repeat(auto-fit,minmax(15rem,1fr))] items-start gap-3">
      <ul className="m-0 grid list-none gap-[0.45rem] p-0">
        {SEGMENTS.map((segment) => (
          <li key={segment.key}>
            <button
              type="button"
              className={cx(
                'grid w-full grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-[0.6rem] rounded-[calc(var(--radius-panel)-0.3rem)] border px-[0.45rem] py-[0.3rem] text-left transition-[background,border-color] duration-150',
                activeSegment === segment.key
                  ? 'border-border bg-foreground/4'
                  : 'border-transparent hover:border-border hover:bg-foreground/4',
              )}
              aria-pressed={activeSegment === segment.key}
              onMouseEnter={() => setActiveSegment(segment.key)}
              onClick={() => setActiveSegment(segment.key)}
            >
              <span className={cx('size-[0.7rem] rounded-[0.2rem]', SEGMENT_BG[segment.key])} aria-hidden="true" />
              <span className="grid min-w-0">
                <strong className="text-[0.82rem] text-foreground">{segment.label}</strong>
                <small className="text-[0.72rem] text-muted">{segment.description}</small>
              </span>
              <span className="text-[0.9rem] font-bold text-foreground tabular-nums">{formatShortPercent(values[segment.key])}</span>
            </button>
          </li>
        ))}
      </ul>

      <SegmentRules
        title={active.rulesTitle}
        emptyText={active.emptyRules}
        segment={active.key}
        rules={result.segmentRules[active.key].filter((rule) =>
          active.key === 'clean' ? rule.kind === 'opening' : rule.kind === 'problem',
        )}
      />
      </div>

      <p className="m-0 border-l-[3px] border-primary/70 pl-[0.6rem] text-[0.76rem] leading-[1.35] text-foreground">{buildFailureAdvice(result)}</p>
    </LabSection>
  )
}

function SegmentRules({
  title,
  emptyText,
  segment,
  rules,
}: {
  title: string
  emptyText: string
  segment: HandSegment
  rules: SegmentRule[]
}) {
  return (
    <div
      className={cx(
        'grid gap-[0.45rem] rounded-[calc(var(--radius-panel)-0.2rem)] border border-[rgb(var(--lab-segment-rgb)/0.35)] bg-[rgb(var(--lab-segment-rgb)/0.06)] px-3 py-[0.65rem]',
        SEGMENT_RGB[segment],
      )}
      aria-live="polite"
    >
      <span className="text-[0.72rem] font-bold uppercase tracking-[0.06em] text-[rgb(var(--lab-segment-rgb))]">{title}</span>
      {rules.length === 0 ? (
        <p className={LAB_FOOTNOTE}>{emptyText}</p>
      ) : (
        <ul className="m-0 grid list-none gap-[0.35rem] p-0">
          {rules.slice(0, MAX_RULES).map((rule) => (
            <li key={rule.patternId} className="grid grid-cols-[minmax(0,1.4fr)_minmax(3rem,1fr)_auto] items-center gap-[0.6rem] text-[0.8rem]">
              <span className="truncate text-foreground">{rule.name}</span>
              <span className="h-[0.4rem] overflow-hidden rounded-full bg-foreground/8" aria-hidden="true">
                <span className="block h-full bg-[rgb(var(--lab-segment-rgb)/0.85)]" style={{ width: `${Math.min(100, rule.share * 100)}%` }} />
              </span>
              <span className="font-bold text-foreground tabular-nums">{formatShortPercent(rule.share)}</span>
            </li>
          ))}
        </ul>
      )}
      <small className={LAB_FOOTNOTE}>
        % de las manos de este grupo que cumplen cada regla (una mano puede cumplir varias). Pasá el mouse o tocá otro
        grupo para cambiar.
      </small>
    </div>
  )
}
