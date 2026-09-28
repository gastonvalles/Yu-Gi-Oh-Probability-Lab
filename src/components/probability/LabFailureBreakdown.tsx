import type { LabViewResult } from '../../app/probability-lab'
import { formatShortPercent } from '../../app/utils'
import { buildFailureAdvice } from './lab-copy'
import { LabSection } from './LabSection'

const SEGMENTS = [
  { key: 'clean', label: 'Limpias', description: 'Salida y ningún problema' },
  { key: 'blocked', label: 'Frenadas', description: 'Tienen salida, pero un problema las frena' },
  { key: 'noOpening', label: 'Sin salida', description: 'No cumplen ninguna salida' },
] as const

export function LabFailureBreakdown({ result }: { result: LabViewResult }) {
  const values: Record<(typeof SEGMENTS)[number]['key'], number> = {
    clean: result.cleanProbability,
    blocked: result.blockedOpeningProbability,
    noOpening: result.noOpeningProbability,
  }

  return (
    <LabSection
      title="Por qué fallan las manos"
      summary={`${formatShortPercent(values.noOpening)} sin salida · ${formatShortPercent(values.blocked)} frenadas`}
      defaultOpenOnMobile={false}
      className="lab-breakdown"
    >
      <div className="lab-stack-bar" aria-hidden="true">
        {SEGMENTS.map((segment) => (
          <span
            key={segment.key}
            className="lab-stack-segment"
            data-segment={segment.key}
            style={{ width: `${values[segment.key] * 100}%` }}
          />
        ))}
      </div>

      <ul className="lab-legend">
        {SEGMENTS.map((segment) => (
          <li key={segment.key} className="lab-legend-item">
            <span className="lab-legend-swatch" data-segment={segment.key} aria-hidden="true" />
            <span className="lab-legend-text">
              <strong>{segment.label}</strong>
              <small>{segment.description}</small>
            </span>
            <span className="lab-legend-value">{formatShortPercent(values[segment.key])}</span>
          </li>
        ))}
      </ul>

      <p className="lab-advice">{buildFailureAdvice(result)}</p>
    </LabSection>
  )
}
