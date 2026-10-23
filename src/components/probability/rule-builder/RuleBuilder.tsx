import { useEffect, useId, useLayoutEffect, useMemo, useRef, useState, type PointerEvent as ReactPointerEvent, type RefObject } from 'react'

import { buildDerivedDeckGroupMap } from '../../../app/deck-groups'
import { getPatternMatchMode, normalizeMinimumConditionMatches } from '../../../app/patterns'
import { formatInteger } from '../../../app/utils'
import { t } from '../../../i18n'
import type { CardEntry, HandPattern } from '../../../types'
import { Button } from '../../ui/Button'
import { Callout } from '../../ui/Callout'
import { cx } from '../../ui/cx'
import { overline } from '../../ui/typography'
import { joinWord } from '../pattern-helpers'
import type { PatternEditorActions } from '../pattern-editor-actions'

import { ConditionBlock } from './ConditionBlock'
import { KindToggle } from './KindToggle'
import { LogicSelector } from './LogicSelector'
import { PatternNameInput } from './PatternNameInput'
import { RuleSettings } from './RuleSettings'
import { RuleStep } from './RuleStep'
import { TurnContextToggle } from './TurnContextToggle'

interface RuleBuilderProps {
  actions: PatternEditorActions
  derivedMainCards: CardEntry[]
  pattern: HandPattern
  /** Abre el selector de qué cuenta de una condición. */
  onPickCondition: (conditionId: string) => void
  /** Mueve una condición de lugar (el orden no cambia lo que mide la regla). */
  onMoveCondition: (from: number, to: number) => void
  /** Ya se intentó guardar: las condiciones sin qué cuenta se marcan como error. */
  showErrors?: boolean
}

/**
 * El editor de una regla en una sola pantalla, en orden: nombre (opcional) → qué es → cuándo vale → la mano tiene (cómo se combinan, las condiciones y
 * «Sumar condición») → los ajustes que aplican. Las condiciones se reordenan con el agarre: arrastrándolas o con ↑ ↓.
 */
export function RuleBuilder({ actions, derivedMainCards, pattern, onPickCondition, onMoveCondition, showErrors = false }: RuleBuilderProps) {
  const nameId = useId()
  const groupsByKey = useMemo(() => buildDerivedDeckGroupMap(derivedMainCards), [derivedMainCards])
  const matchMode = getPatternMatchMode(pattern)
  const conditionCount = pattern.conditions.length
  const listRef = useRef<HTMLDivElement>(null)
  const [moved, setMoved] = useState<{ id: string; message: string } | null>(null)
  const drag = useConditionDrag(listRef, onMoveCondition)

  // Una regla en blanco arranca con su primera condición lista para completar (una sola vez por regla).
  const seededPatternIdRef = useRef<string | null>(null)

  useEffect(() => {
    if (conditionCount === 0 && seededPatternIdRef.current !== pattern.id) {
      seededPatternIdRef.current = pattern.id
      actions.addRequirement(pattern.id)
    }
  }, [actions, conditionCount, pattern.id])

  // Mover con el teclado: React reubica el nodo y el agarre pierde el foco; se lo devuelve.
  useLayoutEffect(() => {
    if (moved) {
      listRef.current?.querySelector<HTMLElement>(`[data-condition-handle="${moved.id}"]`)?.focus()
    }
  }, [moved])

  const moveBy = (index: number, delta: -1 | 1) => {
    const to = index + delta

    if (to < 0 || to >= conditionCount) {
      return
    }

    onMoveCondition(index, to)
    setMoved({ id: pattern.conditions[index]!.id, message: t('builder.condition.moved', { index: formatInteger(to + 1), count: formatInteger(conditionCount) }) })
  }

  return (
    <div className="grid gap-5">
      {pattern.needsReview ? <Callout tone="warning">{t('builder.reviewNotice')}</Callout> : null}

      <RuleStep title={t('builder.field.name')} note={t('builder.field.optional')} htmlFor={nameId}>
        <PatternNameInput id={nameId} patternId={pattern.id} currentName={pattern.name} actions={actions} />
      </RuleStep>
      <RuleStep title={t('builder.field.kind')}>
        <KindToggle patternId={pattern.id} currentKind={pattern.kind} actions={actions} />
      </RuleStep>
      <RuleStep title={t('builder.field.turn')}>
        <TurnContextToggle patternId={pattern.id} currentTurnContext={pattern.turnContext} actions={actions} />
      </RuleStep>

      <RuleStep title={t('builder.field.conditions')}>
        <div className="grid gap-3">
          {conditionCount > 1 ? (
            <LogicSelector
              patternId={pattern.id}
              currentMode={matchMode}
              conditionCount={conditionCount}
              minimumConditionMatches={normalizeMinimumConditionMatches(pattern)}
              actions={actions}
            />
          ) : null}

          <div ref={listRef} className="grid gap-2">
            {pattern.conditions.map((condition, index) => (
              <div key={condition.id} className="grid gap-2">
                {index > 0 ? (
                  <p aria-hidden="true" className={cx('m-0 flex items-center gap-2.5 before:flex-1 before:border-t before:border-border-subtle after:flex-1 after:border-t after:border-border-subtle', overline)}>
                    {joinWord(pattern)}
                  </p>
                ) : null}
                <ConditionBlock
                  index={index}
                  count={conditionCount}
                  patternId={pattern.id}
                  pattern={pattern}
                  condition={condition}
                  derivedMainCards={derivedMainCards}
                  groupsByKey={groupsByKey}
                  actions={actions}
                  dragging={drag.draggingId === condition.id}
                  showError={showErrors}
                  onRemove={() => actions.removeRequirement(pattern.id, condition.id)}
                  onPick={onPickCondition}
                  onMoveBy={moveBy}
                  onDragStart={(start, event) => drag.start(condition.id, start, event)}
                />
              </div>
            ))}
          </div>
          <span className="sr-only" aria-live="polite">
            {moved?.message ?? ''}
          </span>

          <Button variant="secondary" size="sm" icon="plus" className="justify-self-start" onClick={() => actions.addRequirement(pattern.id)}>
            {t('builder.add')}
          </Button>
        </div>
      </RuleStep>

      <RuleSettings pattern={pattern} actions={actions} derivedMainCards={derivedMainCards} groupsByKey={groupsByKey} />
    </div>
  )
}

/**
 * Arrastrar una condición por su agarre (mouse o dedo): al pasar la mitad de la vecina, cambian de lugar y se sigue arrastrando. Escucha en `window` (no con
 * `setPointerCapture`): al reordenar, React mueve los nodos y la captura del puntero se perdería.
 */
function useConditionDrag(listRef: RefObject<HTMLDivElement | null>, onMove: (from: number, to: number) => void) {
  const [draggingId, setDraggingId] = useState<string | null>(null)
  const onMoveRef = useRef(onMove)

  useEffect(() => {
    onMoveRef.current = onMove
  })

  const start = (id: string, index: number, event: ReactPointerEvent<HTMLButtonElement>) => {
    if (event.button !== 0) {
      return
    }

    event.preventDefault()
    let current = index
    setDraggingId(id)

    const onPointerMove = (move: PointerEvent) => {
      const items = [...(listRef.current?.querySelectorAll<HTMLElement>('[data-condition]') ?? [])]
      const before = items[current - 1]?.getBoundingClientRect()
      const after = items[current + 1]?.getBoundingClientRect()

      if (before && move.clientY < before.top + before.height / 2) {
        onMoveRef.current(current, current - 1)
        current -= 1
      } else if (after && move.clientY > after.top + after.height / 2) {
        onMoveRef.current(current, current + 1)
        current += 1
      }
    }
    const stop = () => {
      setDraggingId(null)
      window.removeEventListener('pointermove', onPointerMove)
      window.removeEventListener('pointerup', stop)
      window.removeEventListener('pointercancel', stop)
    }

    window.addEventListener('pointermove', onPointerMove)
    window.addEventListener('pointerup', stop)
    window.addEventListener('pointercancel', stop)
  }

  return { draggingId, start }
}
