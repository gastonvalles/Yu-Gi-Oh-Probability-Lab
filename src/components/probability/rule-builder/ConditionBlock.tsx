import { useEffect, useMemo, useState } from 'react'

import { getCopiesUsedByOtherConditions, getMaxConditionQuantity } from '../../../app/pattern-card-usage'
import type { CardEntry, HandPattern, PatternCondition, RequirementKind } from '../../../types'
import { CloseButton } from '../../ui/IconButton'
import { Modal } from '../../ui/Modal'
import type { PatternEditorActions } from '../pattern-editor-actions'
import { CategoryPicker } from './CategoryPicker'
import { getConditionLabel } from './condition-labels'
import { NumberField } from '../../ui/NumberField'
import { surface } from '../../ui/surfaces'
import { cx } from '../../ui/cx'
import { TONE } from '../../ui/tone'

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
    <article className={`${surface.card} grid gap-2 px-3 py-3`}>
      <div className="flex flex-wrap items-center gap-2">
        <div className="inline-flex min-w-0 max-w-full items-stretch overflow-hidden rounded-control border border-border-subtle">
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
            className={cx(
              'min-w-0 px-3 py-2 text-left text-body font-medium transition-colors focus-visible:outline-none focus-visible:shadow-focus',
              hasCategory ? 'bg-white/4 text-foreground hover:bg-primary/12' : cx('text-warning-soft hover:bg-warning/16', 'bg-warning/10'),
            )}
            onClick={() => setIsPickerOpen(true)}
          >
            {hasCategory ? categoryLabel : 'Elegí qué contar'}
          </button>
        </div>

        <CloseButton
          size="sm"
          className="ml-auto shrink-0"
          aria-label={`Quitar condición ${index + 1}`}
          onClick={onRemove}
        />
      </div>

      {!hasCategory ? (
        <p className="m-0 text-small text-warning-soft">Elegí qué tipo de cartas querés contar en esta condición.</p>
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
      className={cx(
        'px-3 py-2 text-body font-semibold transition-colors focus-visible:outline-none focus-visible:shadow-focus',
        isInclude ? cx('bg-success/14 hover:bg-success/22', TONE.success.text) : cx('bg-danger/14 hover:bg-danger/22', TONE.danger.text),
      )}
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
      className="w-12 border-x border-border-subtle bg-black/25 px-1.5 py-2 text-center text-body font-medium text-foreground outline-none [color-scheme:dark] focus:bg-black/40 focus-visible:shadow-focus"
      aria-label="Cantidad"
    />
  )
}
