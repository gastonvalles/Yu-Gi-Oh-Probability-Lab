import { getKpiDetailCards } from './kpi-detail-helpers'
import type { DeckCardInstance } from '../../app/model'
import type { CardEditMap } from './kpi-detail-helpers'
import type { ApiCardReference, CardRole } from '../../types'
import { CardArt } from '../CardArt'
import { formatInteger } from '../../app/utils'
import { getCardRoleDefinition } from '../../app/deck-groups'
import { CopiesBadge } from '../ui/CopiesBadge'
import { Modal } from '../ui/Modal'

export interface KpiDetailModalProps {
  isOpen: boolean
  role: CardRole
  side: 'A' | 'B'
  mainDeck: DeckCardInstance[]
  editsMap?: CardEditMap
  onCardClick: (card: ApiCardReference, name: string) => void
  onClose: () => void
}

function getRoleLabel(role: CardRole): string {
  const def = getCardRoleDefinition(role)
  return def.label
}

export function KpiDetailModal({
  isOpen,
  role,
  side,
  mainDeck,
  editsMap,
  onCardClick,
  onClose,
}: KpiDetailModalProps) {
  const result = isOpen ? getKpiDetailCards(mainDeck, role, editsMap) : null

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      size="md"
      kicker={`Build ${side}`}
      title={`¿Qué cartas cuentan como ${getRoleLabel(role)}?`}
      subtitle={result ? `${formatInteger(result.totalCopies)} carta${result.totalCopies === 1 ? '' : 's'}` : undefined}
    >
      {!result || result.cards.length === 0 ? (
        <p className="app-muted m-0 py-6 text-center text-[0.84rem]">No hay cartas en esta categoría.</p>
      ) : (
        <div className="grid grid-cols-1 gap-px min-[540px]:grid-cols-2">
          {result.cards.map((card) => (
            <button
              key={card.ygoprodeckId}
              type="button"
              data-testid="kpi-detail-card-row"
              className="app-list-item grid min-w-0 grid-cols-[40px_minmax(0,1fr)] items-center gap-2.5 px-1.5 py-1.5 text-left"
              onClick={() => onCardClick(card.apiCard, card.name)}
            >
              <span className="relative block w-[40px]">
                <CardArt
                  remoteUrl={card.imageUrlSmall}
                  name={card.name}
                  className="block h-auto w-full bg-input"
                  limitCard={card.apiCard}
                  limitBadgeSize="sm"
                />
                <CopiesBadge copies={card.copies} placement="overlay" />
              </span>
              <span className="grid min-w-0 gap-0.5">
                <strong className="truncate text-[0.82rem] leading-[1.1] text-(--text-main)">{card.name}</strong>
                {card.needsReview ? (
                  <span className="inline-flex w-fit items-center rounded bg-amber-400/20 px-1.5 py-0.5 text-[0.6rem] font-semibold text-amber-300">Revisar</span>
                ) : null}
              </span>
            </button>
          ))}
        </div>
      )}
    </Modal>
  )
}
