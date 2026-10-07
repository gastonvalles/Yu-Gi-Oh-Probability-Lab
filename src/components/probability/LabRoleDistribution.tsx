import { DISTRIBUTION_BUCKETS, type RoleDistribution, type RoleDistributionKey } from '../../app/role-distribution'
import { formatInteger, formatShortPercent } from '../../app/utils'
import { cx } from '../ui/cx'
import { Icon } from '../ui/Icon'
import { LabSection } from './LabSection'
import { LAB_FOOTNOTE } from './lab-styles'

/** Color del rol: lo heredan el punto y las barras de la fila (los roles tienen su propia paleta). */
const ROLE_RGB: Record<RoleDistributionKey, string> = {
  starter: '[--lab-role-rgb:var(--accent-rgb)]',
  extender: '[--lab-role-rgb:var(--extender-rgb)]',
  interaction: '[--lab-role-rgb:var(--handtrap-rgb)]',
  brick: '[--lab-role-rgb:var(--brick-rgb)]',
}

/** Intensidad según cuántas copias se roban (0, 1, 2, 3+). */
const BUCKET_SEGMENT = [
  'bg-[rgb(var(--lab-role-rgb)/0.14)] text-muted',
  'bg-[rgb(var(--lab-role-rgb)/0.4)] text-foreground',
  'bg-[rgb(var(--lab-role-rgb)/0.65)] text-foreground',
  'bg-[rgb(var(--lab-role-rgb)/0.9)] text-background',
]
const BUCKET_SWATCH = ['opacity-[0.14]', 'opacity-40', 'opacity-65', 'opacity-90']

interface LabRoleDistributionProps {
  distributions: RoleDistribution[]
  onOpenRole: (key: RoleDistributionKey) => void
}

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
      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-caption text-muted" aria-hidden="true">
        <span>Copias robadas:</span>
        {DISTRIBUTION_BUCKETS.map((bucket, index) => (
          <span key={bucket} className="inline-flex items-center gap-1.5">
            <span className={cx('size-2.5 rounded-tag bg-foreground/80', BUCKET_SWATCH[index])} />
            {bucket}
          </span>
        ))}
      </div>

      <ul className="m-0 grid list-none gap-1 p-0">
        {distributions.map((distribution) => (
          <li key={distribution.key}>
            <button
              type="button"
              className={cx(
                'group grid w-full grid-cols-[minmax(5.5rem,8rem)_minmax(0,1fr)_minmax(3.6rem,auto)_auto] items-center gap-3 rounded-control border border-transparent px-3 py-2 text-left transition-[background-color,border-color] duration-150 focus-visible:outline-none focus-visible:shadow-focus enabled:hover:bg-white/4 disabled:opacity-50',
                ROLE_RGB[distribution.key],
              )}
              disabled={distribution.copies === 0}
              aria-label={`${distribution.label}: ${formatShortPercent(distribution.atLeastOne)} de robar al menos una. Ver cartas`}
              onClick={() => onOpenRole(distribution.key)}
            >
              <span className="flex min-w-0 items-center gap-2.5">
                <span className="size-2.5 shrink-0 rounded-full bg-[rgb(var(--lab-role-rgb))]" aria-hidden="true" />
                <span className="grid min-w-0">
                  <strong className="truncate text-body font-semibold text-foreground">{distribution.label}</strong>
                  <small className="text-caption text-muted">{formatInteger(distribution.copies)} copias</small>
                </span>
              </span>
              <span className="flex h-6 gap-px overflow-hidden rounded-tag bg-white/6" aria-hidden="true">
                {distribution.buckets.map((value, index) => (
                  <span
                    key={DISTRIBUTION_BUCKETS[index]}
                    className={cx(
                      'grid place-items-center overflow-hidden whitespace-nowrap text-micro font-bold tabular-nums transition-[width]',
                      BUCKET_SEGMENT[index],
                    )}
                    style={{ width: `${value * 100}%` }}
                    title={`${DISTRIBUTION_BUCKETS[index]} copias: ${formatShortPercent(value)}`}
                  >
                    {value >= 0.09 ? `${Math.round(value * 100)}%` : ''}
                  </span>
                ))}
              </span>
              <span className="grid justify-items-end tabular-nums">
                <strong className="text-lead font-bold text-foreground">{formatShortPercent(distribution.atLeastOne)}</strong>
                <small className="text-caption text-muted">1 o más</small>
              </span>
              <Icon name="chevron-right" size={16} className="text-soft transition-colors group-enabled:group-hover:text-foreground" />
            </button>
          </li>
        ))}
      </ul>
      <p className={LAB_FOOTNOTE}>Tocá un rol para ver qué cartas lo componen.</p>
    </LabSection>
  )
}
