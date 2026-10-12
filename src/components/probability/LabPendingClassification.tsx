import { useEffect, useMemo, useState } from 'react'

import { isCardFullyClassified } from '../../app/role-step'
import { formatInteger } from '../../app/utils'
import { t } from '../../i18n'
import type { CardEntry, CardOrigin, CardRole } from '../../types'
import { ClassificationEditor } from '../classification/ClassificationEditor'
import { ClassificationQueue } from '../classification/ClassificationQueue'
import { compareCardsForQueue } from '../classification/classification-model'
import { Card } from '../ui/Card'
import { cx } from '../ui/cx'
import { ProgressRing } from '../ui/ProgressRing'
import { overline, supportText } from '../ui/typography'

interface LabPendingClassificationProps {
  cards: CardEntry[]
  message: string
  onSetOrigin: (ygoprodeckId: number, origin: CardOrigin) => void
  onToggleRole: (ygoprodeckId: number, role: CardRole) => void
  onConfirm: (ygoprodeckId: number) => void
  /** Avisa si hay una carta abierta: el Lab mantiene esta vista hasta que se cierra, aunque ya no falte nada. */
  onEditingChange: (editing: boolean) => void
}

const isPending = (card: CardEntry) => !isCardFullyClassified(card) || card.needsReview

/**
 * El Lab no calcula hasta que todas las cartas estén clasificadas: en vez de una pestaña vacía,
 * muestra las que faltan y se resuelven acá mismo. Al terminar, el Lab calcula solo.
 */
export function LabPendingClassification({ cards, message, onSetOrigin, onToggleRole, onConfirm, onEditingChange }: LabPendingClassificationProps) {
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const isEditing = selectedId !== null

  useEffect(() => {
    onEditingChange(isEditing)
  }, [isEditing, onEditingChange])

  const pendingCount = useMemo(() => cards.filter(isPending).length, [cards])
  // La carta abierta queda en la lista aunque ya esté resuelta: el usuario avanza con "Siguiente".
  const visible = useMemo(
    () => cards.filter((card) => isPending(card) || card.id === selectedId).sort(compareCardsForQueue),
    [cards, selectedId],
  )
  const index = visible.findIndex((card) => card.id === selectedId)
  const selected = index >= 0 ? visible[index] : null
  const previous = index > 0 ? visible[index - 1] : null
  const next = index >= 0 && index < visible.length - 1 ? visible[index + 1] : null
  const classified = cards.length - pendingCount

  return (
    <div className="grid min-w-0 content-start gap-3">
      <Card tone={pendingCount > 0 ? 'warning' : 'success'} className="flex items-center justify-between gap-4">
        <div className="grid min-w-0 gap-0.5">
          <p className={cx('m-0', overline)}>{pendingCount > 0 ? t('lab.pending.overline') : t('lab.pending.allDone')}</p>
          <h3 className="m-0 text-lead font-semibold leading-tight text-foreground">
            {pendingCount > 0
              ? t('lab.pending.count', { count: pendingCount, n: formatInteger(pendingCount) })
              : t('lab.pending.none')}
          </h3>
          <p className={supportText}>
            {pendingCount > 0
              ? t('lab.pending.help', { message })
              : t('lab.pending.closeEditor')}
          </p>
        </div>
        <ProgressRing value={cards.length > 0 ? classified / cards.length : 0} tone={pendingCount > 0 ? 'warning' : 'success'} size={76} strokeWidth={8} label={t('lab.pending.ringLabel')} />
      </Card>

      <ClassificationQueue cards={visible} selectedId={selectedId} onSelect={setSelectedId} />

      {selected ? (
        <ClassificationEditor
          card={selected}
          position={index + 1}
          total={visible.length}
          onSetOrigin={onSetOrigin}
          onToggleRole={onToggleRole}
          onConfirm={onConfirm}
          onPrevious={previous ? () => setSelectedId(previous.id) : undefined}
          onNext={next ? () => setSelectedId(next.id) : undefined}
          onClose={() => setSelectedId(null)}
        />
      ) : null}
    </div>
  )
}
