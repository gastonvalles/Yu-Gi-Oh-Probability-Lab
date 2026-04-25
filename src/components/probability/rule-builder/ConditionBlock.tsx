import { useState } from 'react'

import type { CardEntry, PatternCondition, PatternKind, RequirementKind } from '../../../types'
import { formatInteger } from '../../../app/utils'
import { CloseButton } from '../../ui/IconButton'
import type { PatternEditorActions } from '../pattern-editor-actions'
import { CategoryPicker } from './CategoryPicker'
import { getConditionLabel } from './condition-labels'

interface ConditionBlockProps {
  index: number
  patternId: string
  condition: PatternCondition
  patternKind: PatternKind
  derivedMainCards: CardEntry[]
  actions: PatternEditorActions
  onRemove: () => void
}

export function ConditionBlock({
  index,
  patternId,
  condition,
  patternKind: _patternKind,
  derivedMainCards,
  actions,
  onRemove,
}: ConditionBlockProps) {
  const [isPickerOpen, setIsPickerOpen] = useState(false)
  const categoryLabel = getConditionLabel(condition.matcher, derivedMainCards)
  const hasCategory = condition.matcher !== null

  return (
    <article className="condition-block surface-card grid gap-2 px-3 py-2.5">
      <div className="flex items-center gap-0 flex-wrap">
        <KindSegment
          value={condition.kind}
          onChange={(kind) => actions.setRequirementKind(patternId, condition.id, kind)}
        />
        <QuantitySegment
          value={condition.quantity}
          onChange={(qty) => actions.setRequirementCount(patternId, condition.id, String(Math.max(1, qty)))}
        />
        <button
          type="button"
          className={[
            'condition-block-category px-3 py-1.5 text-[0.82rem] font-medium transition-colors rounded-r-md',
            hasCategory
              ? 'surface-panel-soft text-(--text-main) hover:bg-[rgb(var(--primary-rgb)/0.08)]'
              : 'surface-panel-soft text-(--text-muted) ring-1 ring-[rgb(var(--warning-rgb)/0.3)]',
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
        <p className="m-0 text-[0.72rem] text-(--warning)">
          Elegí qué tipo de cartas querés contar en esta condición.
        </p>
      ) : null}

      {isPickerOpen ? (
        <CategoryPicker
          patternId={patternId}
          conditionId={condition.id}
          currentMatcher={condition.matcher}
          derivedMainCards={derivedMainCards}
          actions={actions}
          onClose={() => setIsPickerOpen(false)}
        />
      ) : null}
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
        'condition-block-kind px-3 py-1.5 text-[0.8rem] font-medium rounded-l-md transition-colors',
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
  onChange,
}: {
  value: number
  onChange: (quantity: number) => void
}) {
  return (
    <input
      type="number"
      min={1}
      value={value}
      onChange={(event) => {
        const parsed = Number.parseInt(event.target.value, 10)
        onChange(Number.isFinite(parsed) ? Math.max(1, parsed) : 1)
      }}
      className="condition-block-qty app-field w-12 border-x-0 rounded-none px-1.5 py-1.5 text-center text-[0.84rem] font-medium"
      aria-label="Cantidad"
    />
  )
}
