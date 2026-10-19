import { CARD_ORIGIN_DEFINITIONS, getCardRoleDefinition, serializeGroupKey } from '../../app/deck-groups'
import { t } from '../../i18n'
import type { CardOrigin, CardRole } from '../../types'
import { ROLE_REFERENCE_MARK, originOption, roleOptionButton } from '../classification-styles'
import { cx } from '../ui/cx'
import { Icon } from '../ui/Icon'
import { overline } from '../ui/typography'
import { ORIGIN_BLURB_TEXT, ORIGIN_HELP_TEXT, ROLE_EDITOR_SECTIONS, ROLE_HELP_TEXT } from './classification-copy'
import { getClassificationStyle } from './classification-model'

const KICKER = `m-0 ${overline}`

interface ClassificationFieldsProps {
  origin: CardOrigin | null
  roles: readonly CardRole[]
  onSetOrigin: (origin: CardOrigin) => void
  onToggleRole: (role: CardRole) => void
  /** Abre la guía de roles. Sin esto no se muestra el enlace. */
  onOpenHelp?: () => void
}

/** Los dos campos de clasificar una carta: dónde encaja (origen) y qué función cumple (roles). Los usan todas las pantallas que clasifican. */
export function ClassificationFields({ origin, roles, onSetOrigin, onToggleRole, onOpenHelp }: ClassificationFieldsProps) {
  return (
    <div className="grid gap-4">
      <section className="grid gap-2" aria-label={t('roles.fields.originAria')}>
        <p className={KICKER}>{t('roles.fields.originQuestion')}</p>
        <div className="grid gap-1.5 min-[560px]:grid-cols-2 min-[560px]:gap-2">
          {CARD_ORIGIN_DEFINITIONS.map((definition) => {
            const active = origin === definition.key.value
            const muted = origin !== null && !active

            return (
              <button
                key={serializeGroupKey(definition.key)}
                type="button"
                aria-pressed={active}
                title={ORIGIN_HELP_TEXT[definition.key.value]}
                className={cx(
                  originOption({ active, muted }),
                  'grid min-h-12 grid-cols-[auto_minmax(0,1fr)] items-center gap-x-2.5 gap-y-0.5 rounded-card px-3 py-2 text-left min-[560px]:min-h-[4.25rem] min-[560px]:grid-cols-[auto_minmax(0,1fr)] min-[560px]:gap-x-3',
                )}
                style={getClassificationStyle(definition.key)}
                onClick={() => onSetOrigin(definition.key.value)}
              >
                <span className="flex min-w-0 items-center gap-2 min-[560px]:contents">
                  <span className={cx(ROLE_REFERENCE_MARK, 'min-[560px]:col-start-1 min-[560px]:row-span-2 min-[560px]:self-center')} />
                  <strong className="truncate text-body font-semibold leading-none text-foreground min-[560px]:col-start-2 min-[560px]:row-start-1">{definition.shortLabel ?? definition.label}</strong>
                </span>
                <span className="min-w-0 text-micro text-muted max-[559px]:text-right min-[560px]:col-start-2 min-[560px]:row-start-2">{ORIGIN_BLURB_TEXT[definition.key.value]}</span>
              </button>
            )
          })}
        </div>
      </section>

      <section className="grid gap-2" aria-label={t('roles.fields.rolesAria')}>
        <div className="flex items-center justify-between gap-2">
          <p className={KICKER}>{t('roles.fields.roleQuestion')}</p>
          {onOpenHelp ? (
            <button
              type="button"
              className="inline-flex shrink-0 items-center gap-1.5 rounded-full px-2 py-1 text-micro font-semibold text-muted transition-colors hover:text-foreground focus-visible:outline-none focus-visible:shadow-focus"
              onClick={onOpenHelp}
            >
              <Icon name="info" size={14} />
              {t('roles.fields.help')}
            </button>
          ) : null}
        </div>

        {ROLE_EDITOR_SECTIONS.map((section) => (
          <div key={section.title} className="flex flex-wrap items-center gap-1.5">
            <strong className="mr-1 w-full text-micro font-semibold uppercase tracking-[0.06em] text-soft min-[560px]:w-auto min-[560px]:min-w-24">{section.title}</strong>
            <div className="flex flex-1 flex-wrap gap-1.5">
              {section.roles.map((role) => {
                const definition = getCardRoleDefinition(role)
                const active = roles.includes(role)

                return (
                  <button
                    key={serializeGroupKey(definition.key)}
                    type="button"
                    aria-pressed={active}
                    title={ROLE_HELP_TEXT[role]}
                    className={cx(roleOptionButton(active), 'min-h-9 px-3 py-1.5 text-body leading-none min-[1101px]:min-h-8')}
                    style={getClassificationStyle(definition.key)}
                    onClick={() => onToggleRole(role)}
                  >
                    {definition.label}
                  </button>
                )
              })}
            </div>
          </div>
        ))}
      </section>
    </div>
  )
}
