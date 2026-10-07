import { useEffect, useMemo, useState } from 'react'

import { isCardFullyClassified } from '../../app/role-step'
import { formatInteger } from '../../app/utils'
import type { CardEntry, CardOrigin, CardRole } from '../../types'
import { ClassificationEditor } from '../classification/ClassificationEditor'
import { ClassificationQueue } from '../classification/ClassificationQueue'
import { compareCardsForQueue } from '../classification/classification-model'
import { Button } from '../ui/Button'
import { Card } from '../ui/Card'
import { cx } from '../ui/cx'
import { Icon } from '../ui/Icon'
import { Meter } from '../ui/Meter'
import { Modal } from '../ui/Modal'
import { TONE } from '../ui/tone'
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
      <Card tone={pendingCount > 0 ? 'warning' : 'success'} className="grid gap-4">
        <div className="flex min-w-0 items-start gap-3">
          <span className={cx('grid size-10 shrink-0 place-items-center rounded-control border', TONE[pendingCount > 0 ? 'warning' : 'success'].tint, TONE[pendingCount > 0 ? 'warning' : 'success'].text)}>
            <Icon name={pendingCount > 0 ? 'tag' : 'check-circle'} size={20} />
          </span>
          <div className="grid min-w-0 gap-0.5">
            <p className={cx('m-0', overline)}>{pendingCount > 0 ? 'Falta clasificar' : 'Todo clasificado'}</p>
            <h3 className="m-0 text-lead font-semibold leading-tight text-foreground">
              {pendingCount > 0
                ? `${formatInteger(pendingCount)} carta${pendingCount === 1 ? '' : 's'} por cerrar`
                : 'Ya no falta ninguna carta'}
            </h3>
            <p className={supportText}>
              {pendingCount > 0
                ? `${message} Tocá una carta, resolvela acá mismo y cuando termines el Lab calcula solo.`
                : 'Cerrá el editor para ver el resultado.'}
            </p>
          </div>
        </div>
        <Meter value={cards.length > 0 ? classified / cards.length : 0} tone={pendingCount > 0 ? 'warning' : 'success'} size="sm" label="Cartas clasificadas" />
      </Card>

      <ClassificationQueue cards={visible} selectedId={selectedId} onSelect={setSelectedId} />

      <Modal
        isOpen={selected !== null}
        onClose={() => setSelectedId(null)}
        size="sheet"
        bare
        ariaLabel="Clasificar carta"
        footer={
          <div className="flex flex-1 items-center justify-end gap-2 max-[1100px]:[&>button]:flex-1">
            <Button variant="secondary" size="md" icon="chevron-left" onClick={() => previous && setSelectedId(previous.id)} disabled={!previous}>
              Anterior
            </Button>
            <span className="text-soft min-w-12 text-center text-caption tabular-nums min-[1101px]:hidden">
              {formatInteger(index + 1)} / {formatInteger(visible.length)}
            </span>
            <Button variant="primary" size="md" iconEnd="chevron-right" onClick={() => next && setSelectedId(next.id)} disabled={!next}>
              Siguiente
            </Button>
          </div>
        }
      >
        {selected ? (
          <ClassificationEditor
            key={selected.id}
            card={selected}
            position={index + 1}
            total={visible.length}
            completed={classified}
            onSetOrigin={onSetOrigin}
            onToggleRole={onToggleRole}
            onConfirm={onConfirm}
          />
        ) : null}
      </Modal>
    </div>
  )
}
