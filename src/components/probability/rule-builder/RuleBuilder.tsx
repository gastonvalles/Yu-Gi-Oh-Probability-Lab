import { useEffect, useMemo, useRef } from 'react'

import type { CardEntry, HandPattern } from '../../../types'
import { getPatternMatchMode, normalizeMinimumConditionMatches } from '../../../app/patterns'
import { buildPatternCompactSummary, buildPatternPreview } from '../pattern-helpers'
import type { PatternEditorActions } from '../pattern-editor-actions'
import { Button } from '../../ui/Button'
import { Callout } from '../../ui/Callout'
import { overline } from '../../ui/typography'

import { ConditionBlock } from './ConditionBlock'
import { KindToggle } from './KindToggle'
import { getConnectorWord, LogicSelector } from './LogicSelector'
import { PatternNameInput } from './PatternNameInput'
import { RuleReadback } from './RuleReadback'
import { RuleSettings } from './RuleSettings'
import { RuleStep } from './RuleStep'
import { TurnContextToggle } from './TurnContextToggle'

interface RuleBuilderProps {
  actions: PatternEditorActions
  derivedMainCards: CardEntry[]
  isPendingCreation: boolean
  pattern: HandPattern
}

/**
 * Editor de una regla, de arriba abajo: nombre → tipo y turno → condiciones (con la regla leída
 * en una frase debajo) → ajustes que sólo aparecen cuando aplican.
 */
export function RuleBuilder({ actions, derivedMainCards, isPendingCreation, pattern }: RuleBuilderProps) {
  const cardById = useMemo(() => new Map(derivedMainCards.map((card) => [card.id, card])), [derivedMainCards])
  const summary = useMemo(() => buildPatternCompactSummary(pattern, cardById), [pattern, cardById])
  const preview = useMemo(() => buildPatternPreview(pattern, cardById), [pattern, cardById])
  const matchMode = getPatternMatchMode(pattern)
  const conditionCount = pattern.conditions.length
  const connector = getConnectorWord(matchMode)

  // Una regla nueva arranca con su primera condición lista para completar (una sola vez).
  const seededPatternIdRef = useRef<string | null>(null)

  useEffect(() => {
    if (isPendingCreation && conditionCount === 0 && seededPatternIdRef.current !== pattern.id) {
      seededPatternIdRef.current = pattern.id
      actions.addRequirement(pattern.id)
    }
  }, [actions, conditionCount, isPendingCreation, pattern.id])

  const addCondition = (mode?: 'any') => {
    actions.addRequirement(pattern.id)

    if (mode) {
      actions.setPatternMatchMode(pattern.id, mode)
    }
  }

  return (
    <div className="grid gap-5">
      {pattern.needsReview ? (
        <Callout tone="warning">Esta regla viene de una versión anterior. Revisá estos ajustes antes de confiar en el resultado.</Callout>
      ) : null}

      <div className="grid gap-2">
        <RuleStep title="Nombre" inline>
          <PatternNameInput
            patternId={pattern.id}
            currentName={pattern.name}
            placeholderSummary={preview.items.some((item) => item.startsWith('(')) ? 'Opcional: si no, se usa el resumen' : summary}
            isPendingCreation={isPendingCreation}
            actions={actions}
          />
        </RuleStep>
        <RuleStep title="Tipo" inline>
          <KindToggle patternId={pattern.id} currentKind={pattern.kind} actions={actions} />
        </RuleStep>
        <RuleStep title="Turno" inline>
          <TurnContextToggle patternId={pattern.id} currentTurnContext={pattern.turnContext} actions={actions} />
        </RuleStep>
      </div>

      <RuleStep title="Condiciones">
        {conditionCount > 1 ? (
          <LogicSelector
            patternId={pattern.id}
            currentMode={matchMode}
            conditionCount={conditionCount}
            minimumConditionMatches={normalizeMinimumConditionMatches(pattern)}
            negated={pattern.conditions.every((condition) => condition.kind === 'exclude')}
            actions={actions}
          />
        ) : null}

        <div className="grid gap-0">
          {pattern.conditions.map((condition, index) => (
            <div key={condition.id} className="grid gap-0">
              {index > 0 ? (
                <div className="flex justify-center py-1">
                  <span className={overline}>{connector}</span>
                </div>
              ) : null}
              <ConditionBlock
                index={index}
                patternId={pattern.id}
                pattern={pattern}
                condition={condition}
                derivedMainCards={derivedMainCards}
                actions={actions}
                onRemove={() => actions.removeRequirement(pattern.id, condition.id)}
              />
            </div>
          ))}
        </div>

        {conditionCount <= 1 ? (
          <div className="flex flex-wrap gap-2">
            <Button variant="secondary" size="sm" icon="plus" onClick={() => addCondition()}>
              Y otra condición
            </Button>
            <Button variant="secondary" size="sm" icon="plus" onClick={() => addCondition('any')}>
              O otra condición
            </Button>
          </div>
        ) : (
          <Button variant="secondary" size="sm" icon="plus" className="justify-self-start" onClick={() => addCondition()}>
            Agregar condición
          </Button>
        )}

        <RuleReadback pattern={pattern} cardById={cardById} />
      </RuleStep>

      <RuleSettings pattern={pattern} actions={actions} derivedMainCards={derivedMainCards} />
    </div>
  )
}
