import { useState } from 'react'

import type { LabViewResult, SegmentRule } from '../../app/probability-lab'
import { formatShortPercent } from '../../app/utils'
import type { HandSegment } from '../../types'
import { buildFailureAdvice } from './lab-copy'
import { LabSection } from './LabSection'

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
      className="lab-breakdown"
    >
      <div className="lab-stack-bar">
        {SEGMENTS.map((segment) => (
          <button
            key={segment.key}
            type="button"
            className="lab-stack-segment"
            data-segment={segment.key}
            data-active={activeSegment === segment.key ? 'true' : 'false'}
            style={{ width: `${values[segment.key] * 100}%` }}
            aria-label={`${segment.label}: ${formatShortPercent(values[segment.key])}. Ver reglas`}
            onMouseEnter={() => setActiveSegment(segment.key)}
            onFocus={() => setActiveSegment(segment.key)}
            onClick={() => setActiveSegment(segment.key)}
          />
        ))}
      </div>

      <div className="lab-breakdown-body">
      <ul className="lab-legend">
        {SEGMENTS.map((segment) => (
          <li key={segment.key}>
            <button
              type="button"
              className="lab-legend-item"
              data-active={activeSegment === segment.key ? 'true' : 'false'}
              aria-pressed={activeSegment === segment.key}
              onMouseEnter={() => setActiveSegment(segment.key)}
              onClick={() => setActiveSegment(segment.key)}
            >
              <span className="lab-legend-swatch" data-segment={segment.key} aria-hidden="true" />
              <span className="lab-legend-text">
                <strong>{segment.label}</strong>
                <small>{segment.description}</small>
              </span>
              <span className="lab-legend-value">{formatShortPercent(values[segment.key])}</span>
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

      <p className="lab-advice">{buildFailureAdvice(result)}</p>
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
    <div className="lab-segment-rules" data-segment={segment} aria-live="polite">
      <span className="lab-segment-rules-title">{title}</span>
      {rules.length === 0 ? (
        <p className="lab-footnote m-0">{emptyText}</p>
      ) : (
        <ul>
          {rules.slice(0, MAX_RULES).map((rule) => (
            <li key={rule.patternId}>
              <span className="lab-segment-rule-name">{rule.name}</span>
              <span className="lab-segment-rule-bar" aria-hidden="true">
                <span style={{ width: `${Math.min(100, rule.share * 100)}%` }} />
              </span>
              <span className="lab-segment-rule-value">{formatShortPercent(rule.share)}</span>
            </li>
          ))}
        </ul>
      )}
      <small className="lab-footnote">
        % de las manos de este grupo que cumplen cada regla (una mano puede cumplir varias). Pasá el mouse o tocá otro
        grupo para cambiar.
      </small>
    </div>
  )
}
