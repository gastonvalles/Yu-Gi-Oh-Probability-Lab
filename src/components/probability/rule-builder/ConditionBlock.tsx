import { useEffect, useId, useMemo, type CSSProperties, type KeyboardEvent, type PointerEvent } from 'react'

import type { DerivedDeckGroup } from '../../../app/deck-groups'
import { getCopiesUsedByOtherConditions, getMaxConditionQuantity } from '../../../app/pattern-card-usage'
import { resolveConditionCardIds } from '../../../app/patterns'
import { formatCopies } from '../../../app/utils'
import { t } from '../../../i18n'
import type { CardEntry, HandPattern, PatternCondition, RequirementKind } from '../../../types'
import { cx } from '../../ui/cx'
import { Icon } from '../../ui/Icon'
import { CloseIcon, IconButton } from '../../ui/IconButton'
import { Segmented } from '../../ui/Segmented'
import { Stepper } from '../../ui/Stepper'
import type { PatternEditorActions } from '../pattern-editor-actions'
import { getConditionLabel, getConditionRgb } from './condition-labels'

interface ConditionBlockProps {
  index: number
  /** Cuántas condiciones tiene la regla: con dos o más aparece el agarre para reordenarlas. */
  count: number
  patternId: string
  /** Regla completa: sirve para saber qué cartas ya usan las otras condiciones. */
  pattern: Pick<HandPattern, 'reusePolicy' | 'conditions'>
  condition: PatternCondition
  derivedMainCards: CardEntry[]
  groupsByKey: Map<string, DerivedDeckGroup>
  actions: PatternEditorActions
  /** Se está arrastrando esta condición. */
  dragging?: boolean
  /** Ya se intentó guardar la regla: si falta qué cuenta, se marca como error (en rojo y con qué falta). Antes, faltar es sólo el paso que sigue. */
  showError?: boolean
  onRemove: () => void
  /** Abre el selector de qué cuenta (en el mismo cajón). */
  onPick: (conditionId: string) => void
  /** Mover la condición con el teclado (↑ ↓): `delta` es −1 o +1. */
  onMoveBy: (index: number, delta: -1 | 1) => void
  /** Empieza a arrastrarla con el mouse o el dedo desde el agarre. */
  onDragStart: (index: number, event: PointerEvent<HTMLButtonElement>) => void
}

/**
 * Una condición se lee como una frase: [⋮⋮] [Tiene | No tiene] [− N +] [×] y debajo [● qué cuenta ×copias ›]. «No tiene» es «ninguna»: la cantidad sólo aparece
 * si ya pedía más de una. Sin qué cuenta, el botón es el paso que sigue y se ve como cualquier campo; con `showError` (se intentó guardar así), va en rojo y dice qué
 * falta. La cantidad no pasa de las copias que hay en el deck.
 */
export function ConditionBlock({ index, count, patternId, pattern, condition, derivedMainCards, groupsByKey, actions, dragging = false, showError = false, onRemove, onPick, onMoveBy, onDragStart }: ConditionBlockProps) {
  const errorId = useId()
  const hasCategory = condition.matcher !== null
  const invalid = showError && !hasCategory
  const usedCopies = useMemo(
    () => getCopiesUsedByOtherConditions(pattern, condition.id, derivedMainCards),
    [pattern, condition.id, derivedMainCards],
  )
  const maxQuantity = useMemo(
    () => getMaxConditionQuantity(condition, derivedMainCards, usedCopies),
    [condition, derivedMainCards, usedCopies],
  )
  const copies = useMemo(() => {
    const byId = new Map(derivedMainCards.map((card) => [card.id, card]))
    return resolveConditionCardIds(condition, groupsByKey, derivedMainCards).reduce((total, id) => total + (byId.get(id)?.copies ?? 0), 0)
  }, [condition, derivedMainCards, groupsByKey])
  const label = getConditionLabel(condition.matcher, derivedMainCards)
  const rgb = getConditionRgb(condition.matcher, derivedMainCards)
  const showQuantity = condition.kind === 'include' || condition.quantity > 1
  // Copias o nombres distintos da lo mismo con una sola: el selector sólo aparece cuando importa (o si ya está en «nombres», para poder volver).
  const showUnit = condition.quantity > 1 || condition.distinct

  // Si se elige algo que tiene menos copias que la cantidad pedida, la cantidad baja a lo que hay.
  useEffect(() => {
    if (hasCategory && condition.quantity > maxQuantity) {
      actions.setRequirementCount(patternId, condition.id, String(maxQuantity))
    }
  }, [actions, condition.id, condition.quantity, hasCategory, maxQuantity, patternId])

  const setKind = (kind: RequirementKind) => {
    actions.setRequirementKind(patternId, condition.id, kind)

    // «No tiene» es «ninguna»: se lee así y la cantidad deja de verse.
    if (kind === 'exclude' && condition.quantity !== 1) {
      actions.setRequirementCount(patternId, condition.id, '1')
    }
  }

  const handleKey = (event: KeyboardEvent<HTMLButtonElement>) => {
    if (event.key === 'ArrowUp' || event.key === 'ArrowDown') {
      event.preventDefault()
      onMoveBy(index, event.key === 'ArrowUp' ? -1 : 1)
    }
  }

  return (
    <article
      data-condition={condition.id}
      aria-label={t('builder.condition.label', { index: index + 1 })}
      className={cx('grid gap-2 rounded-control transition-[background-color,box-shadow] duration-150', dragging && 'bg-tint/6 shadow-overlay')}
    >
      <div className="flex items-center gap-1.5">
        {count > 1 ? (
          <button
            type="button"
            data-condition-handle={condition.id}
            className="grid h-11 w-6 shrink-0 cursor-grab touch-none place-items-center rounded-tag text-soft transition-colors duration-150 hover:text-info focus-visible:outline-none focus-visible:shadow-focus active:cursor-grabbing"
            aria-label={t('builder.condition.move', { index: index + 1 })}
            onKeyDown={handleKey}
            onPointerDown={(event) => onDragStart(index, event)}
          >
            <Icon name="grip" size={16} />
          </button>
        ) : null}
        <Segmented
          fullWidth
          dense
          className="min-w-0 flex-1"
          label={t('builder.condition.hasLabel')}
          value={condition.kind}
          options={[
            { value: 'include', label: t('builder.condition.has') },
            { value: 'exclude', label: t('builder.condition.hasNot') },
          ]}
          onChange={setKind}
        />
        {showQuantity ? (
          <Stepper
            size="lg"
            label={t('builder.condition.quantity')}
            value={condition.quantity}
            min={1}
            max={Math.max(maxQuantity, condition.quantity)}
            onChange={(quantity) => actions.setRequirementCount(patternId, condition.id, String(quantity))}
          />
        ) : null}
        <IconButton tone="raised" size="lg" aria-label={t('builder.condition.remove', { index: index + 1 })} onClick={onRemove}>
          <CloseIcon />
        </IconButton>
      </div>

      <button
        type="button"
        data-condition-pick={condition.id}
        aria-invalid={invalid || undefined}
        aria-describedby={invalid ? errorId : undefined}
        aria-label={hasCategory ? t('builder.condition.picked', { label }) : t('builder.condition.pick')}
        style={rgb ? ({ '--role-rgb': rgb } as CSSProperties) : undefined}
        className={cx(
          'flex min-h-12 w-full items-center gap-2.5 rounded-control bg-input pl-3.5 pr-3 text-left text-body font-semibold transition-colors duration-150 hover:bg-input-hover focus-visible:outline-none focus-visible:shadow-focus',
          invalid ? 'text-danger-soft inset-ring-2 inset-ring-danger-soft' : 'text-foreground',
        )}
        onClick={() => onPick(condition.id)}
      >
        {rgb ? <span aria-hidden="true" className="size-2.5 shrink-0 rounded-full bg-[rgb(var(--role-rgb))]" /> : null}
        <span className="min-w-0 flex-1 truncate">{hasCategory ? label : t('builder.condition.pick')}</span>
        {hasCategory ? <span className="shrink-0 font-normal tabular-nums text-muted">{formatCopies(copies)}</span> : null}
        <Icon name="chevron-right" size={18} className="shrink-0 text-soft" />
      </button>
      {invalid ? (
        <p id={errorId} className="m-0 flex items-center gap-1.5 text-body font-semibold text-danger-soft">
          <Icon name="alert" size={16} className="shrink-0" />
          {t('builder.condition.missing')}
        </p>
      ) : null}

      {showUnit ? (
        <Segmented
          variant="chips"
          size="sm"
          label={t('builder.condition.unitLabel')}
          value={condition.distinct ? 'names' : 'copies'}
          options={[
            { value: 'copies', label: t('builder.condition.unitCopies') },
            { value: 'names', label: t('builder.condition.unitNames') },
          ]}
          onChange={(unit) => actions.setRequirementDistinct(patternId, condition.id, unit === 'names')}
        />
      ) : null}
    </article>
  )
}
