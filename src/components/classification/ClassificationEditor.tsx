import { formatInteger } from '../../app/utils'
import { t } from '../../i18n'
import type { CardEntry, CardOrigin, CardRole } from '../../types'
import { buildCardSummary } from '../card-detail/card-summary'
import { Button } from '../ui/Button'
import { Callout } from '../ui/Callout'
import { ClassificationOverlay } from './ClassificationOverlay'
import { CARD_TYPE_LABEL, getCardType } from './classification-model'

interface ClassificationEditorProps {
  card: CardEntry
  position: number
  total: number
  onSetOrigin: (ygoprodeckId: number, origin: CardOrigin) => void
  onToggleRole: (ygoprodeckId: number, role: CardRole) => void
  onConfirm: (ygoprodeckId: number) => void
  onPrevious?: () => void
  onNext?: () => void
  onOpenHelp?: () => void
  onClose: () => void
}

/** Clasificar una carta del Main: los cambios se aplican en el momento. */
export function ClassificationEditor({
  card,
  position,
  total,
  onSetOrigin,
  onToggleRole,
  onConfirm,
  onPrevious,
  onNext,
  onOpenHelp,
  onClose,
}: ClassificationEditorProps) {
  const ygoprodeckId = card.apiCard?.ygoprodeckId ?? 0
  const summary = card.apiCard ? buildCardSummary(card.apiCard) : null
  const needsConfirm = card.needsReview && card.origin !== null && card.roles.length > 0

  return (
    <ClassificationOverlay
      name={card.name}
      card={card.apiCard ?? null}
      lines={[
        t('roles.editor.line', {
          summary: summary ? `${summary.typeLine}${summary.statLine ? ` · ${summary.statLine}` : ''}` : CARD_TYPE_LABEL[getCardType(card)].singular,
          copies: formatInteger(card.copies),
        }),
      ]}
      origin={card.origin}
      roles={card.roles}
      onSetOrigin={(origin) => onSetOrigin(ygoprodeckId, origin)}
      onToggleRole={(role) => onToggleRole(ygoprodeckId, role)}
      notice={
        needsConfirm ? (
          <Callout
            tone="warning"
            action={
              <Button variant="primary" size="sm" onClick={() => onConfirm(ygoprodeckId)}>
                {t('roles.editor.confirm')}
              </Button>
            }
          >
            {t('roles.editor.suggested')}
          </Callout>
        ) : null
      }
      position={position}
      total={total}
      onPrevious={onPrevious}
      onNext={onNext}
      onOpenHelp={onOpenHelp}
      onClose={onClose}
    />
  )
}
