import { getKpiDetailCards } from './kpi-detail-helpers'
import type { DeckCardInstance } from '../../app/model'
import type { CardEditMap } from './kpi-detail-helpers'
import type { ApiCardReference, CardRole } from '../../types'
import { CardArt } from '../CardArt'
import { formatInteger } from '../../app/utils'
import { getCardRoleDefinition } from '../../app/deck-groups'
import { useLeaving } from '../../app/use-presence'
import { t } from '../../i18n'
import { Heading } from '../ui/Heading'
import { Badge } from '../ui/Badge'
import { CopiesBadge } from '../ui/CopiesBadge'
import { Modal } from '../ui/Modal'
import { listItem } from '../ui/surfaces'

interface KpiDetailModalProps {
  isOpen: boolean
  /** Título y roles que suma el anillo que se clickeó: la lista tiene que coincidir con ese número. */
  label: string
  roles: readonly CardRole[]
  /** Sólo en el comparador: qué build es. En el Lab no hace falta. */
  side?: 'A' | 'B'
  mainDeck: DeckCardInstance[]
  editsMap?: CardEditMap
  onCardClick: (card: ApiCardReference, name: string) => void
  onClose: () => void
}

export function KpiDetailModal({
  isOpen,
  label,
  roles,
  side,
  mainDeck,
  editsMap,
  onCardClick,
  onClose,
}: KpiDetailModalProps) {
  // Si lo monta un `Presence` (la Lab), al cerrarse sigue ahí mientras sale: `isOpen` todavía dice lo último que se vio.
  const leaving = useLeaving()
  const result = isOpen ? getKpiDetailCards(mainDeck, roles, editsMap) : null
  // Cada carta va en el primer rol del anillo que tenga, así la suma de los grupos es la del anillo.
  const groups = roles
    .map((role) => ({ role, cards: (result?.cards ?? []).filter((card) => roles.find((r) => card.roles.includes(r)) === role) }))
    .filter((group) => group.cards.length > 0)

  return (
    <Modal
      isOpen={isOpen && !leaving}
      onClose={onClose}
      size="md"
      kicker={side ? t('meta.compare.build', { side }) : undefined}
      title={t('meta.kpi.title', { label })}
      subtitle={result ? t('meta.kpi.copies', { count: result.totalCopies }) : undefined}
    >
      {groups.length === 0 ? (
        <p className="text-muted m-0 py-6 text-center text-body">{t('meta.kpi.empty')}</p>
      ) : (
        <div className="grid gap-4">
          {groups.map((group) => (
            <section key={group.role} className="grid gap-2" aria-label={getCardRoleDefinition(group.role).label}>
              {roles.length > 1 ? (
                <Heading level="card" as="h4" className="flex items-center gap-2">
                  {getCardRoleDefinition(group.role).label}
                  <Badge tone="neutral" size="sm">{formatInteger(group.cards.reduce((total, card) => total + card.copies, 0))}</Badge>
                </Heading>
              ) : null}
              <div className="grid grid-cols-1 gap-2 min-[540px]:grid-cols-2">
                {group.cards.map((card) => (
                  <button
                    key={card.ygoprodeckId}
                    type="button"
                    data-testid="kpi-detail-card-row"
                    className={`${listItem} grid min-w-0 grid-cols-[40px_minmax(0,1fr)] items-center gap-3 p-2 text-left`}
                    onClick={() => onCardClick(card.apiCard, card.name)}
                  >
                    <span className="relative block w-[40px]">
                      <CardArt
                        tilt
                        remoteUrl={card.imageUrlSmall}
                        name={card.name}
                        className="block h-auto w-full bg-input"
                        limitCard={card.apiCard}
                        limitBadgeSize="sm"
                      />
                      <CopiesBadge copies={card.copies} placement="overlay" />
                    </span>
                    <span className="grid min-w-0 gap-0.5">
                      <strong className="line-clamp-2 text-body font-semibold text-foreground">{card.name}</strong>
                      {card.needsReview ? (
                        <Badge tone="warning" size="sm" shape="tag" className="w-fit">
                          {t('meta.kpi.review')}
                        </Badge>
                      ) : null}
                    </span>
                  </button>
                ))}
              </div>
            </section>
          ))}
        </div>
      )}
    </Modal>
  )
}
