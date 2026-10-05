import { useEffect, useMemo, useState } from 'react'

import { getCopiesUsedByOtherConditions, getMaxConditionQuantity } from '../../../app/pattern-card-usage'
import type { CardEntry, HandPattern, PatternCondition, RequirementKind } from '../../../types'
import { CloseButton } from '../../ui/IconButton'
import { Modal } from '../../ui/Modal'
import type { PatternEditorActions } from '../pattern-editor-actions'
import { CategoryPicker } from './CategoryPicker'
import { getConditionLabel } from './condition-labels'
import { NumberField } from '../../ui/NumberField'
import { field, surface } from '../../ui/surfaces'

interface ConditionBlockProps {
  index: number
  patternId: string
  /** Regla completa: sirve para saber qué cartas ya usan las otras condiciones. */
  pattern: Pick<HandPattern, 'reusePolicy' | 'conditions'>
  condition: PatternCondition
  derivedMainCards: CardEntry[]
  actions: PatternEditorActions
  onRemove: () => void
}

export function ConditionBlock({
  index,
  patternId,
  pattern,
  condition,
  derivedMainCards,
  actions,
  onRemove,
}: ConditionBlockProps) {
  const [isPickerOpen, setIsPickerOpen] = useState(false)
  const categoryLabel = getConditionLabel(condition.matcher, derivedMainCards)
  const hasCategory = condition.matcher !== null
  const usedCopies = useMemo(
    () => getCopiesUsedByOtherConditions(pattern, condition.id, derivedMainCards),
    [pattern, condition.id, derivedMainCards],
  )
  // La cantidad no puede pasar de las copias que realmente hay en el deck.
  const maxQuantity = useMemo(
    () => getMaxConditionQuantity(condition, derivedMainCards, usedCopies),
    [condition, derivedMainCards, usedCopies],
  )

  // Si se elige algo que tiene menos copias que la cantidad pedida, la cantidad baja a lo que hay.
  useEffect(() => {
    if (hasCategory && condition.quantity > maxQuantity) {
      actions.setRequirementCount(patternId, condition.id, String(maxQuantity))
    }
  }, [actions, condition.id, condition.quantity, hasCategory, maxQuantity, patternId])

  return (
    <article className={`condition-block ${surface.card} grid gap-2 px-3 py-2.5`}>
      <div className="flex items-center gap-0 flex-wrap">
        <KindSegment
          value={condition.kind}
          onChange={(kind) => actions.setRequirementKind(patternId, condition.id, kind)}
        />
        <QuantitySegment
          value={condition.quantity}
          max={maxQuantity}
          onChange={(qty) => actions.setRequirementCount(patternId, condition.id, String(qty))}
        />
        <button
          type="button"
          className={[
            'condition-block-category px-3 py-1.5 text-[0.92rem] font-medium transition-colors rounded-r-md',
            hasCategory
              ? `${surface.panelSoft} text-(--text-main) hover:bg-[rgb(var(--primary-rgb)/0.08)]`
              : `${surface.panelSoft} text-(--text-muted) ring-1 ring-[rgb(var(--warning-rgb)/0.3)]`,
          ].join(' ')}
          onClick={() => setIsPickerOpen(true)}
        >
          {hasCategory ? categoryLabel : 'Elegí qué contar'}
        </button>

        <CloseButton
          size="sm"
          className="ml-auto shrink-0"
          aria-label={`Quitar condición ${index + 1}`}
          onClick={onRemove}
        />
      </div>

      {!hasCategory ? (
        <p className="m-0 text-[0.82rem] text-(--warning)">
          Elegí qué tipo de cartas querés contar en esta condición.
        </p>
      ) : null}

      <Modal
        isOpen={isPickerOpen}
        onClose={() => setIsPickerOpen(false)}
        size="md"
        bare
        flush
        ariaLabel="Qué contar en esta condición"
        closeTone="flat"
        closeSize="sm"
        closeClassName="right-2 top-[0.65rem]"
      >
        <CategoryPicker
          patternId={patternId}
          conditionId={condition.id}
          currentMatcher={condition.matcher}
          derivedMainCards={derivedMainCards}
          usedCopies={usedCopies}
          actions={actions}
          onClose={() => setIsPickerOpen(false)}
        />
      </Modal>
    </article>
  )
}

function KindSegment({
  value,
  onChange,
}: {
  value: RequirementKind
  onChange: (kind: RequirementKind) => void
}) {
  const isInclude = value === 'include'

  return (
    <button
      type="button"
      className={[
        'condition-block-kind px-3 py-1.5 text-[0.9rem] font-medium rounded-l-md transition-colors',
        isInclude
          ? 'bg-[rgb(var(--success-rgb)/0.14)] text-accent'
          : 'bg-[rgb(var(--danger-rgb)/0.14)] text-destructive',
      ].join(' ')}
      onClick={() => onChange(isInclude ? 'exclude' : 'include')}
      aria-label={isInclude ? 'Cambiar a Sin' : 'Cambiar a Al menos'}
    >
      {isInclude ? 'Al menos' : 'Sin'}
    </button>
  )
}

function QuantitySegment({
  value,
  max,
  onChange,
}: {
  value: number
  max: number
  onChange: (quantity: number) => void
}) {
  return (
    <NumberField
      value={value}
      min={1}
      max={Math.max(max, value)}
      onChange={onChange}
      className={`condition-block-qty ${field} w-12 border-x-0 rounded-none px-1.5 py-1.5 text-center text-[0.94rem] font-medium`}
      aria-label="Cantidad"
    />
  )
}
