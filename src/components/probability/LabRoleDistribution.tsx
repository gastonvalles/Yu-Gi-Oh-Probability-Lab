import { createRoleGroupKey, getDeckGroupTheme } from '../../app/deck-groups'
import { DISTRIBUTION_BUCKETS, type RoleDistribution, type RoleDistributionKey } from '../../app/role-distribution'
import { formatInteger, formatShortPercent } from '../../app/utils'
import { t } from '../../i18n'
import { Icon } from '../ui/Icon'
import { ProgressRing } from '../ui/ProgressRing'
import { LabSection } from './LabSection'

/** Color de cada rol (identidad, sin juzgar): la misma paleta que las etiquetas de la pantalla de roles (interacción toma el de handtrap). */
const ROLE_RGB: Record<RoleDistributionKey, string> = {
  starter: getDeckGroupTheme(createRoleGroupKey('starter')).rgb,
  extender: getDeckGroupTheme(createRoleGroupKey('extender')).rgb,
  interaction: getDeckGroupTheme(createRoleGroupKey('handtrap')).rgb,
  brick: getDeckGroupTheme(createRoleGroupKey('brick')).rgb,
}

interface LabRoleDistributionProps {
  distributions: RoleDistribution[]
  onOpenRole: (distribution: RoleDistribution) => void
  className?: string
}

/**
 * Qué robás de cada rol: una fila por rol con su anillo (de cada 100 manos, cuántas traen al menos una copia), el nombre y las copias. El dato se ve sin abrir nada:
 * la fila abre las cartas del rol. Lista en escritorio, grilla de 2 × 2 en el celular. El reparto en 0 / 1 / 2 / 3+ queda en el texto al pasar el mouse.
 */
export function LabRoleDistribution({ distributions, onOpenRole, className }: LabRoleDistributionProps) {
  return (
    <LabSection title={t('lab.roles.title')} icon="layers" description={t('lab.roles.description')} collapsible={false} className={className}>
      <ul className="m-0 grid list-none grid-cols-2 gap-x-2 gap-y-1 p-0 md:grid-cols-1">
        {distributions.map((distribution, index) => {
          const empty = distribution.copies === 0

          return (
            <li key={distribution.key} className="min-w-0">
              <button
                type="button"
                className="grid min-h-16 w-full grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-2 rounded-control p-0.5 text-left transition-colors duration-150 focus-visible:outline-none focus-visible:shadow-focus enabled:hover:bg-tint/6 disabled:opacity-50 md:gap-3"
                disabled={empty}
                aria-label={t('lab.roles.chanceOpen', { label: distribution.label, percent: formatShortPercent(distribution.atLeastOne) })}
                title={DISTRIBUTION_BUCKETS.map((bucket, bucketIndex) => t('lab.roles.bucket', { bucket, percent: formatShortPercent(distribution.buckets[bucketIndex] ?? 0) })).join(' · ')}
                onClick={() => onOpenRole(distribution)}
              >
                <ProgressRing
                  value={distribution.atLeastOne}
                  color={ROLE_RGB[distribution.key]}
                  size={52}
                  strokeWidth={5}
                  delay={index * 100}
                  label={t('lab.roles.chance', { label: distribution.label, percent: formatShortPercent(distribution.atLeastOne) })}
                />
                <span className="grid min-w-0">
                  <strong className="text-body font-semibold text-foreground">{distribution.label}</strong>
                  <span className="text-body text-muted">{t('lab.roles.copies', { count: distribution.copies, n: formatInteger(distribution.copies) })}</span>
                </span>
                {empty ? <span aria-hidden="true" /> : <Icon name="chevron-right" size={18} className="text-soft max-md:hidden" />}
              </button>
            </li>
          )
        })}
      </ul>
    </LabSection>
  )
}
