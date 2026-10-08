import { useEffect, useMemo, useState } from 'react'

import { getCopiesUsedByOtherConditions, getMaxConditionQuantity } from '../../../app/pattern-card-usage'
import type { CardEntry, HandPattern, PatternCondition, RequirementKind } from '../../../types'
import { cx } from '../../ui/cx'
import { Icon } from '../../ui/Icon'
import { CloseButton } from '../../ui/IconButton'
import { Modal } from '../../ui/Modal'
import { Stepper } from '../../ui/Stepper'
import { TONE } from '../../ui/tone'
import type { PatternEditorActions } from '../pattern-editor-actions'
import { CategoryPicker } from './CategoryPicker'
import { getConditionLabel, getKindLabel } from './condition-labels'

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

/** Cada pieza de la "frase" de la condición: misma altura, separadas por una línea fina. */
const SEGMENT =
  'inline-flex min-h-10 items-center gap-1.5 px-3 text-body transition-colors duration-150 focus-visible:outline-none focus-visible:shadow-focus'

/**
 * Una condición se lee como una frase: [Al menos] [− 2 +] [copias] [de qué cartas].
 * Cada pieza se toca para cambiarla; la cantidad no pasa de las copias que hay en el deck.
 */
export function ConditionBlock({ index, patternId, pattern, condition, derivedMainCards, actions, onRemove }: ConditionBlockProps) {
  const [isPickerOpen, setIsPickerOpen] = useState(false)
  const categoryLabel = getConditionLabel(condition.matcher, derivedMainCards)
  const hasCategory = condition.matcher !== null
  const usedCopies = useMemo(
    () => getCopiesUsedByOtherConditions(pattern, condition.id, derivedMainCards),
    [pattern, condition.id, derivedMainCards],
  )
  const maxQuantity = useMemo(
    () => getMaxConditionQuantity(condition, derivedMainCards, usedCopies),
    [condition, derivedMainCards, usedCopies],
  )
  // Con una sola copia da lo mismo contar copias o nombres: el selector sólo aparece cuando importa
  // (o si ya está en "nombres", para poder volver).
  const showUnit = condition.quantity > 1 || condition.distinct

  // Si se elige algo que tiene menos copias que la cantidad pedida, la cantidad baja a lo que hay.
  useEffect(() => {
    if (hasCategory && condition.quantity > maxQuantity) {
      actions.setRequirementCount(patternId, condition.id, String(maxQuantity))
    }
  }, [actions, condition.id, condition.quantity, hasCategory, maxQuantity, patternId])

  return (
    <article className="grid gap-2 border-b border-border-subtle pb-3 last:border-b-0 last:pb-0" aria-label={`Condición ${index + 1}`}>
      <div className="flex items-start gap-2">
        <div className="flex min-w-0 flex-1 flex-wrap items-stretch divide-x divide-border-subtle overflow-hidden rounded-control bg-tint/4">
          <KindSegment value={condition.kind} onChange={(kind) => actions.setRequirementKind(patternId, condition.id, kind)} />
          <Stepper
            variant="inline"
            label="Cantidad"
            value={condition.quantity}
            min={1}
            max={Math.max(maxQuantity, condition.quantity)}
            onChange={(quantity) => actions.setRequirementCount(patternId, condition.id, String(quantity))}
          />
          {showUnit ? (
            <UnitSegment distinct={condition.distinct} onChange={(distinct) => actions.setRequirementDistinct(patternId, condition.id, distinct)} />
          ) : null}
          <button
            type="button"
            className={cx(
              SEGMENT,
              // Si no le queda un ancho razonable en la fila, baja a la línea siguiente a todo lo ancho.
              'min-w-[12rem] flex-1 justify-between text-left font-medium',
              hasCategory ? 'text-foreground hover:bg-primary/12' : cx('bg-warning/10 hover:bg-warning/16', TONE.warning.text),
            )}
            aria-label={hasCategory ? `Qué contar: ${categoryLabel}. Cambiar` : 'Elegí qué contar'}
            onClick={() => setIsPickerOpen(true)}
          >
            <span className="min-w-0 truncate">{hasCategory ? categoryLabel : 'Elegí qué contar'}</span>
            <Icon name="chevron-down" size={14} className="shrink-0 opacity-70" />
          </button>
        </div>

        <CloseButton size="sm" className="shrink-0" aria-label={`Quitar condición ${index + 1}`} onClick={onRemove} />
      </div>

      <Modal
        isOpen={isPickerOpen}
        onClose={() => setIsPickerOpen(false)}
        size="md"
        bare
        flush
        ariaLabel="Qué contar en esta condición"
        closeSize="sm"
        closeClassName="right-3 top-3"
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

/** "Al menos" (verde) o "Sin" (rojo): se toca para alternar; el ícono avisa que cambia. */
function KindSegment({ value, onChange }: { value: RequirementKind; onChange: (kind: RequirementKind) => void }) {
  const isInclude = value === 'include'
  const other: RequirementKind = isInclude ? 'exclude' : 'include'

  return (
    <button
      type="button"
      className={cx(
        SEGMENT,
        'font-semibold',
        isInclude ? cx('bg-success/14 hover:bg-success/22', TONE.success.text) : cx('bg-danger/14 hover:bg-danger/22', TONE.danger.text),
      )}
      aria-label={`${getKindLabel(value)}. Cambiar a ${getKindLabel(other)}`}
      title={`Cambiar a "${getKindLabel(other)}"`}
      onClick={() => onChange(other)}
    >
      {getKindLabel(value)}
      <Icon name="swap" size={14} className="opacity-70" />
    </button>
  )
}

/** Copias o nombres distintos: "2 copias de X" vs "2 nombres distintos de X". */
function UnitSegment({ distinct, onChange }: { distinct: boolean; onChange: (distinct: boolean) => void }) {
  return (
    <button
      type="button"
      className={cx(SEGMENT, 'font-medium text-muted hover:bg-tint/10 hover:text-foreground')}
      aria-label={distinct ? 'nombres distintos. Cambiar a copias' : 'copias. Cambiar a nombres distintos'}
      title={distinct ? 'Contar copias en vez de nombres distintos' : 'Contar nombres distintos en vez de copias'}
      onClick={() => onChange(!distinct)}
    >
      {distinct ? 'nombres' : 'copias'}
      <Icon name="swap" size={14} className="opacity-70" />
    </button>
  )
}
