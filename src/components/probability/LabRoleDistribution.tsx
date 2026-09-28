import { DISTRIBUTION_BUCKETS, type RoleDistribution, type RoleDistributionKey } from '../../app/role-distribution'
import { formatInteger, formatShortPercent } from '../../app/utils'
import { LabSection } from './LabSection'

interface LabRoleDistributionProps {
  distributions: RoleDistribution[]
  onOpenRole: (key: RoleDistributionKey) => void
}

export function LabRoleDistribution({ distributions, onOpenRole }: LabRoleDistributionProps) {
  const starters = distributions.find((distribution) => distribution.key === 'starter')

  return (
    <LabSection
      title="Qué robás de cada rol"
      summary={starters ? `${formatShortPercent(starters.atLeastOne)} con 1+ starter` : undefined}
      defaultOpenOnMobile={false}
      className="lab-roles"
    >
      <div className="lab-distribution-legend" aria-hidden="true">
        <span>Copias robadas:</span>
        {DISTRIBUTION_BUCKETS.map((bucket, index) => (
          <span key={bucket} className="lab-distribution-legend-item">
            <span className="lab-distribution-swatch" data-bucket={index} />
            {bucket}
          </span>
        ))}
      </div>

      <ul className="lab-distribution">
        {distributions.map((distribution) => (
          <li key={distribution.key}>
            <button
              type="button"
              className="lab-distribution-row"
              data-role={distribution.key}
              disabled={distribution.copies === 0}
              aria-label={`${distribution.label}: ${formatShortPercent(distribution.atLeastOne)} de robar al menos una. Ver cartas`}
              onClick={() => onOpenRole(distribution.key)}
            >
              <span className="lab-distribution-role">
                <strong>{distribution.label}</strong>
                <small>{formatInteger(distribution.copies)} copias</small>
              </span>
              <span className="lab-distribution-bar" aria-hidden="true">
                {distribution.buckets.map((value, index) => (
                  <span
                    key={DISTRIBUTION_BUCKETS[index]}
                    className="lab-distribution-segment"
                    data-bucket={index}
                    style={{ width: `${value * 100}%` }}
                    title={`${DISTRIBUTION_BUCKETS[index]} copias: ${formatShortPercent(value)}`}
                  >
                    {value >= 0.09 ? `${Math.round(value * 100)}%` : ''}
                  </span>
                ))}
              </span>
              <span className="lab-distribution-total">
                <strong>{formatShortPercent(distribution.atLeastOne)}</strong>
                <small>1 o más</small>
              </span>
            </button>
          </li>
        ))}
      </ul>
      <p className="lab-footnote">Tocá un rol para ver qué cartas lo componen.</p>
    </LabSection>
  )
}
