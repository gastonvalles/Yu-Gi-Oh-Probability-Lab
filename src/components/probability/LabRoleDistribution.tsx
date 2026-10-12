import { createRoleGroupKey, getDeckGroupTheme } from '../../app/deck-groups'
import { DISTRIBUTION_BUCKETS, type RoleDistribution, type RoleDistributionKey } from '../../app/role-distribution'
import { formatInteger, formatShortPercent, formatWholePercent } from '../../app/utils'
import { t } from '../../i18n'
import { ProgressRing } from '../ui/ProgressRing'
import { LabSection } from './LabSection'

/** Color de cada rol: la misma paleta que las etiquetas de la pantalla de roles (interacción toma el de handtrap). */
const ROLE_RGB: Record<RoleDistributionKey, string> = {
  starter: getDeckGroupTheme(createRoleGroupKey('starter')).rgb,
  extender: getDeckGroupTheme(createRoleGroupKey('extender')).rgb,
  interaction: getDeckGroupTheme(createRoleGroupKey('handtrap')).rgb,
  brick: getDeckGroupTheme(createRoleGroupKey('brick')).rgb,
}

interface LabRoleDistributionProps {
  distributions: RoleDistribution[]
  onOpenRole: (distribution: RoleDistribution) => void
}

/** Qué robás de cada rol: un anillo por rol que se llena según la chance de robar al menos una copia (el reparto en 0 / 1 / 2 / 3+ queda en el texto al pasar el mouse). */
export function LabRoleDistribution({ distributions, onOpenRole }: LabRoleDistributionProps) {
  const starters = distributions.find((distribution) => distribution.key === 'starter')

  return (
    <LabSection
      title={t('lab.roles.title')}
      icon="layers"
      summary={starters ? t('lab.roles.summary', { percent: formatShortPercent(starters.atLeastOne) }) : undefined}
      defaultOpenOnMobile={false}
      className="order-4 min-[1101px]:col-span-full"
    >
      <ul className="m-0 grid list-none grid-cols-2 gap-x-2 gap-y-4 p-0 min-[1101px]:grid-cols-4">
        {distributions.map((distribution, index) => (
          <li key={distribution.key}>
            <button
              type="button"
              className="group grid w-full justify-items-center gap-2 rounded-card px-2 py-3 text-center transition-colors duration-150 focus-visible:outline-none focus-visible:shadow-focus enabled:hover:bg-tint/6 disabled:opacity-50"
              disabled={distribution.copies === 0}
              aria-label={t('lab.roles.chanceOpen', { label: distribution.label, percent: formatShortPercent(distribution.atLeastOne) })}
              title={DISTRIBUTION_BUCKETS.map((bucket, bucketIndex) => t('lab.roles.bucket', { bucket, percent: formatShortPercent(distribution.buckets[bucketIndex] ?? 0) })).join(' · ')}
              onClick={() => onOpenRole(distribution)}
            >
              <ProgressRing
                value={distribution.atLeastOne}
                color={ROLE_RGB[distribution.key]}
                size={112}
                strokeWidth={12}
                delay={index * 120}
                label={t('lab.roles.chance', { label: distribution.label, percent: formatShortPercent(distribution.atLeastOne) })}
              >
                <strong className="text-lead font-semibold text-foreground tabular-nums">{formatWholePercent(distribution.atLeastOne)}</strong>
              </ProgressRing>
              <span className="grid gap-0.5">
                <strong className="text-body font-semibold text-foreground">{distribution.label}</strong>
                <small className="text-micro text-muted">{t('lab.roles.copies', { count: distribution.copies, n: formatInteger(distribution.copies) })}</small>
              </span>
            </button>
          </li>
        ))}
      </ul>
    </LabSection>
  )
}
