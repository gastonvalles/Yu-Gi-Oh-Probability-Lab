import { DISTRIBUTION_BUCKETS, type RoleDistribution, type RoleDistributionKey } from '../../app/role-distribution'
import { formatInteger, formatShortPercent } from '../../app/utils'
import { SegmentedRing } from '../ui/SegmentedRing'
import { LabSection } from './LabSection'

/** Color de cada rol (los roles tienen su propia paleta). */
const ROLE_RGB: Record<RoleDistributionKey, string> = {
  starter: 'var(--accent-rgb)',
  extender: 'var(--extender-rgb)',
  interaction: 'var(--handtrap-rgb)',
  brick: 'var(--brick-rgb)',
}

/** Intensidad según cuántas copias se roban (0, 1, 2, 3+): cuantas más, más fuerte el color. */
const BUCKET_OPACITY = [0.22, 0.5, 0.75, 1] as const

interface LabRoleDistributionProps {
  distributions: RoleDistribution[]
  onOpenRole: (key: RoleDistributionKey) => void
}

/** Qué robás de cada rol: un anillo por rol repartido en 0 / 1 / 2 / 3+ copias; al centro, la chance de robar al menos una. */
export function LabRoleDistribution({ distributions, onOpenRole }: LabRoleDistributionProps) {
  const starters = distributions.find((distribution) => distribution.key === 'starter')

  return (
    <LabSection
      title="Qué robás de cada rol"
      icon="layers"
      summary={starters ? `${formatShortPercent(starters.atLeastOne)} con 1+ starter` : undefined}
      defaultOpenOnMobile={false}
      className="order-4 min-[1101px]:col-span-full"
    >
      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-micro text-muted" aria-hidden="true">
        <span>Copias robadas:</span>
        {DISTRIBUTION_BUCKETS.map((bucket, index) => (
          <span key={bucket} className="inline-flex items-center gap-1.5">
            <span className="size-2.5 rounded-full bg-foreground" style={{ opacity: BUCKET_OPACITY[index] }} />
            {bucket}
          </span>
        ))}
        <span className="min-[640px]:ml-auto">Al centro: 1 o más</span>
      </div>

      <ul className="m-0 grid list-none grid-cols-2 gap-x-2 gap-y-4 p-0 min-[1101px]:grid-cols-4">
        {distributions.map((distribution, index) => (
          <li key={distribution.key}>
            <button
              type="button"
              className="group grid w-full justify-items-center gap-2 rounded-card px-2 py-3 text-center transition-colors duration-150 focus-visible:outline-none focus-visible:shadow-focus enabled:hover:bg-tint/6 disabled:opacity-50"
              disabled={distribution.copies === 0}
              aria-label={`${distribution.label}: ${formatShortPercent(distribution.atLeastOne)} de robar al menos una. Ver cartas`}
              onClick={() => onOpenRole(distribution.key)}
            >
              <SegmentedRing
                size={112}
                strokeWidth={12}
                delay={index * 120}
                label={`${distribution.label}: ${DISTRIBUTION_BUCKETS.map((bucket, bucketIndex) => `${bucket} copias ${formatShortPercent(distribution.buckets[bucketIndex] ?? 0)}`).join(', ')}`}
                segments={distribution.buckets.map((value, bucketIndex) => ({
                  key: DISTRIBUTION_BUCKETS[bucketIndex] ?? String(bucketIndex),
                  value,
                  color: ROLE_RGB[distribution.key],
                  opacity: BUCKET_OPACITY[bucketIndex],
                }))}
              >
                <strong className="text-lead font-semibold text-foreground tabular-nums">{Math.round(distribution.atLeastOne * 100)}%</strong>
              </SegmentedRing>
              <span className="grid gap-0.5">
                <strong className="text-body font-semibold text-foreground">{distribution.label}</strong>
                <small className="text-micro text-muted">{formatInteger(distribution.copies)} copias</small>
              </span>
            </button>
          </li>
        ))}
      </ul>
    </LabSection>
  )
}
