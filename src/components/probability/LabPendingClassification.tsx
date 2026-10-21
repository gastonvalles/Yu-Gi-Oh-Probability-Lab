import { useEffect, useMemo, useState } from 'react'

import { isCardFullyClassified } from '../../app/role-step'
import { formatInteger, formatWholePercent } from '../../app/utils'
import { t } from '../../i18n'
import type { CardEntry, CardOrigin, CardRole } from '../../types'
import { ClassificationEditor } from '../classification/ClassificationEditor'
import { ClassificationQueue } from '../classification/ClassificationQueue'
import { compareCardsForQueue } from '../classification/classification-model'
import { Button } from '../ui/Button'
import { Heading } from '../ui/Heading'
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
  /** Da por buenas todas las sugerencias (las que ya tienen origen y roles) de un toque. */
  onConfirmAll: () => void
  /** Avisa si hay una carta abierta: el Lab mantiene esta vista hasta que se cierra, aunque ya no falte nada. */
  onEditingChange: (editing: boolean) => void
}

const isPending = (card: CardEntry) => !isCardFullyClassified(card) || card.needsReview

/**
 * El Lab no calcula hasta que todas las cartas estén clasificadas: en vez de una pestaña vacía,
 * muestra las que faltan y se resuelven acá mismo. Al terminar, el Lab calcula solo.
 */
export function LabPendingClassification({ cards, message, onSetOrigin, onToggleRole, onConfirm, onConfirmAll, onEditingChange }: LabPendingClassificationProps) {
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
  // Las sugerencias que sólo esperan un «sí»: completas pero sin confirmar. Las que les falta origen o roles hay que decidirlas.
  const suggestions = useMemo(() => cards.filter((card) => card.needsReview && isCardFullyClassified(card)).length, [cards])

  return (
    <div className="grid min-w-0 content-start gap-3">
      <Card tone={pendingCount > 0 ? 'warning' : 'success'} className="flex items-center justify-between gap-4">
        <div className="grid min-w-0 gap-0.5">
          <p className={cx('m-0', overline)}>{pendingCount > 0 ? t('lab.pending.overline') : t('lab.pending.allDone')}</p>
          <Heading level="section" className="leading-tight">
            {pendingCount > 0
              ? t('lab.pending.count', { count: pendingCount, n: formatInteger(pendingCount) })
              : t('lab.pending.none')}
          </Heading>
          <p className={supportText}>
            {pendingCount > 0
              ? t('lab.pending.help', { message })
              : t('lab.pending.closeEditor')}
          </p>
        </div>
        <ProgressRing value={cards.length > 0 ? classified / cards.length : 0} tone={pendingCount > 0 ? 'warning' : 'success'} size={76} strokeWidth={8} format={formatWholePercent} label={t('lab.pending.ringLabel')} />
      </Card>

      {suggestions > 0 && !isEditing ? (
        <Button variant="primary" icon="check" onClick={onConfirmAll}>
          {t('lab.pending.confirmAll', { count: suggestions })}
        </Button>
      ) : null}

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
