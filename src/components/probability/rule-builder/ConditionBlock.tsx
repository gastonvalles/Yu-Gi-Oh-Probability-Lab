import { useEffect, useLayoutEffect, useRef, useState, type CSSProperties } from 'react'
import { createPortal } from 'react-dom'

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
  const categoryButtonRef = useRef<HTMLButtonElement>(null)
  const pickerPopoverRef = useRef<HTMLDivElement>(null)
  const [pickerPosition, setPickerPosition] = useState<PickerPopoverPosition | null>(null)
  const categoryLabel = getConditionLabel(condition.matcher, derivedMainCards)
  const hasCategory = condition.matcher !== null

  useLayoutEffect(() => {
    if (!isPickerOpen || typeof window === 'undefined') {
      setPickerPosition(null)
      return
    }

    let frame = 0
    const updatePosition = () => {
      const rect = categoryButtonRef.current?.getBoundingClientRect()

      if (!rect) {
        return
      }

      const viewportWidth = window.innerWidth
      const viewportHeight = window.innerHeight
      const gutter = 12
      const width = Math.min(Math.max(rect.width, 560), viewportWidth - gutter * 2)
      const left = Math.min(Math.max(gutter, rect.left), viewportWidth - width - gutter)
      const spaceBelow = viewportHeight - rect.bottom - gutter
      const spaceAbove = rect.top - gutter
      const preferredBelow = spaceBelow >= 280 || spaceBelow >= spaceAbove
      const availableSpace = preferredBelow ? spaceBelow : spaceAbove
      const maxHeight = Math.min(420, Math.max(240, availableSpace - 8))
      const top = preferredBelow
        ? rect.bottom + 6
        : Math.max(gutter, rect.top - maxHeight - 6)

      setPickerPosition({ left, top, width, maxHeight })
    }
    const requestUpdatePosition = () => {
      window.cancelAnimationFrame(frame)
      frame = window.requestAnimationFrame(updatePosition)
    }

    updatePosition()
    window.addEventListener('resize', requestUpdatePosition)
    window.addEventListener('scroll', requestUpdatePosition, true)

    return () => {
      window.cancelAnimationFrame(frame)
      window.removeEventListener('resize', requestUpdatePosition)
      window.removeEventListener('scroll', requestUpdatePosition, true)
    }
  }, [isPickerOpen])

  useEffect(() => {
    if (!isPickerOpen || typeof document === 'undefined') {
      return
    }

    const handlePointerDown = (event: PointerEvent) => {
      const target = event.target

      if (!(target instanceof Node)) {
        return
      }

      if (categoryButtonRef.current?.contains(target) || pickerPopoverRef.current?.contains(target)) {
        return
      }

      setIsPickerOpen(false)
    }
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setIsPickerOpen(false)
      }
    }

    document.addEventListener('pointerdown', handlePointerDown)
    document.addEventListener('keydown', handleKeyDown)

    return () => {
      document.removeEventListener('pointerdown', handlePointerDown)
      document.removeEventListener('keydown', handleKeyDown)
    }
  }, [isPickerOpen])

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
          ref={categoryButtonRef}
          type="button"
          className={[
            'condition-block-category px-3 py-1.5 text-[0.92rem] font-medium transition-colors rounded-r-md',
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
        <p className="m-0 text-[0.82rem] text-(--warning)">
          Elegí qué tipo de cartas querés contar en esta condición.
        </p>
      ) : null}

      {isPickerOpen && pickerPosition && typeof document !== 'undefined'
        ? createPortal(
            <div
              ref={pickerPopoverRef}
              className="category-picker-popover"
              style={{
                left: pickerPosition.left,
                top: pickerPosition.top,
                width: pickerPosition.width,
                '--category-picker-max-height': `${pickerPosition.maxHeight}px`,
              } as CSSProperties}
            >
              <CategoryPicker
                patternId={patternId}
                conditionId={condition.id}
                currentMatcher={condition.matcher}
                derivedMainCards={derivedMainCards}
                actions={actions}
                onClose={() => setIsPickerOpen(false)}
              />
            </div>,
            document.body,
          )
        : null}
    </article>
  )
}

interface PickerPopoverPosition {
  left: number
  top: number
  width: number
  maxHeight: number
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
  onChange,
}: {
  value: number
  onChange: (quantity: number) => void
}) {
  const [localValue, setLocalValue] = useState(value)
  const timeoutRef = useRef<number | null>(null)

  // Sync from parent when value changes externally
  useEffect(() => {
    setLocalValue(value)
  }, [value])

  // Cleanup on unmount
  useEffect(() => () => {
    if (timeoutRef.current !== null) {
      window.clearTimeout(timeoutRef.current)
    }
  }, [])

  const handleChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const parsed = Number.parseInt(event.target.value, 10)
    const next = Number.isFinite(parsed) ? Math.max(1, parsed) : 1
    setLocalValue(next)

    if (timeoutRef.current !== null) {
      window.clearTimeout(timeoutRef.current)
    }

    timeoutRef.current = window.setTimeout(() => {
      onChange(next)
    }, 300)
  }

  return (
    <input
      type="number"
      min={1}
      value={localValue}
      onChange={handleChange}
      className="condition-block-qty app-field w-12 border-x-0 rounded-none px-1.5 py-1.5 text-center text-[0.94rem] font-medium"
      aria-label="Cantidad"
    />
  )
}
