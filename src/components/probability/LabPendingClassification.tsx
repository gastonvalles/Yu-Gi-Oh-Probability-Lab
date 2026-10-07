import { useMemo, useState } from 'react'

import { isCardFullyClassified } from '../../app/role-step'
import { formatInteger } from '../../app/utils'
import type { CardEntry, CardOrigin, CardRole } from '../../types'
import { ClassificationEditor } from '../classification/ClassificationEditor'
import { ClassificationQueue } from '../classification/ClassificationQueue'
import { compareCardsForQueue } from '../classification/classification-model'
import { Button } from '../ui/Button'
import { Modal } from '../ui/Modal'
import { surface } from '../ui/surfaces'

interface LabPendingClassificationProps {
  cards: CardEntry[]
  message: string
  onSetOrigin: (ygoprodeckId: number, origin: CardOrigin) => void
  onToggleRole: (ygoprodeckId: number, role: CardRole) => void
  onConfirm: (ygoprodeckId: number) => void
}

const isPending = (card: CardEntry) => !isCardFullyClassified(card) || card.needsReview

/**
 * El Lab no calcula hasta que todas las cartas estén clasificadas: en vez de una pestaña vacía,
 * muestra las que faltan y se resuelven acá mismo. Al terminar, el Lab calcula solo.
 */
export function LabPendingClassification({ cards, message, onSetOrigin, onToggleRole, onConfirm }: LabPendingClassificationProps) {
  const [selectedId, setSelectedId] = useState<string | null>(null)
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
      <section className={`${surface.cardWarning} grid gap-2 px-3 py-3`}>
        <p className="m-0 text-[0.68rem] font-semibold uppercase tracking-widest text-warning">Falta clasificar</p>
        <h3 className="m-0 text-[1rem] leading-tight text-foreground">
          {formatInteger(pendingCount)} carta{pendingCount === 1 ? '' : 's'} por cerrar
        </h3>
        <p className="m-0 text-[0.82rem] leading-[1.3] text-muted">
          {message} Tocá una carta, resolvela acá mismo y cuando termines el Lab calcula solo.
        </p>
        <div
          className="h-1 w-full overflow-hidden rounded-(--radius-chip) bg-[rgb(var(--border-rgb)/0.9)]"
          role="progressbar"
          aria-label="Cartas clasificadas"
          aria-valuenow={classified}
          aria-valuemin={0}
          aria-valuemax={cards.length}
        >
          <div
            className="h-full origin-left rounded-(--radius-chip) bg-accent transition-transform"
            style={{ transform: `scaleX(${cards.length > 0 ? classified / cards.length : 0})` }}
          />
        </div>
      </section>

      <ClassificationQueue cards={visible} selectedId={selectedId} onSelect={setSelectedId} />

      <Modal
        isOpen={selected !== null}
        onClose={() => setSelectedId(null)}
        size="sheet"
        bare
        ariaLabel="Clasificar carta"
        footer={
          <div className="flex flex-1 items-center justify-end gap-2 max-[1100px]:[&>button]:flex-1">
            <Button variant="secondary" size="md" onClick={() => previous && setSelectedId(previous.id)} disabled={!previous}>
              ← Anterior
            </Button>
            <span className="text-soft min-w-12 text-center text-[0.74rem] tabular-nums min-[1101px]:hidden">
              {formatInteger(index + 1)} / {formatInteger(visible.length)}
            </span>
            <Button variant="primary" size="md" onClick={() => next && setSelectedId(next.id)} disabled={!next}>
              Siguiente →
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
