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
    >
      <div className="lab-distribution" role="table" aria-label="Probabilidad de robar cada rol">
        <div className="lab-distribution-row lab-distribution-head" role="row">
          <span role="columnheader">Rol</span>
          {DISTRIBUTION_BUCKETS.map((bucket) => (
            <span key={bucket} role="columnheader" className="text-center">
              {bucket}
            </span>
          ))}
          <span role="columnheader" className="text-right">
            1+
          </span>
        </div>

        {distributions.map((distribution) => (
          <button
            key={distribution.key}
            type="button"
            role="row"
            className="lab-distribution-row"
            data-role={distribution.key}
            disabled={distribution.copies === 0}
            onClick={() => onOpenRole(distribution.key)}
          >
            <span role="rowheader" className="lab-distribution-role">
              <strong>{distribution.label}</strong>
              <small>{formatInteger(distribution.copies)} copias</small>
            </span>
            {distribution.buckets.map((value, index) => (
              <span key={DISTRIBUTION_BUCKETS[index]} role="cell" className="lab-distribution-cell">
                <span className="lab-distribution-bar" style={{ height: `${Math.max(4, value * 100)}%` }} />
                <span className="lab-distribution-value">{Math.round(value * 100)}%</span>
              </span>
            ))}
            <span role="cell" className="lab-distribution-total">
              {formatShortPercent(distribution.atLeastOne)}
            </span>
          </button>
        ))}
      </div>
      <p className="lab-footnote">Tocá un rol para ver qué cartas lo componen.</p>
    </LabSection>
  )
}
