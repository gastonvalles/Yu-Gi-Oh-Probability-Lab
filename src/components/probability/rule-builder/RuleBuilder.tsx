import { useEffect, useMemo, useRef, type ReactNode } from 'react'

import type { CardEntry, HandPattern } from '../../../types'
import { getPatternMatchMode, normalizeMinimumConditionMatches } from '../../../app/patterns'
import { buildPatternCompactSummary, buildPatternPreview } from '../pattern-helpers'
import type { PatternEditorActions } from '../pattern-editor-actions'
import { Button } from '../../ui/Button'
import { PlusIcon } from '../../ui/icons'

import { AdvancedSettings } from './AdvancedSettings'
import { ConditionBlock } from './ConditionBlock'
import { KindToggle } from './KindToggle'
import { getConnectorWord, LogicSelector } from './LogicSelector'
import { PatternNameInput } from './PatternNameInput'
import { TurnContextToggle } from './TurnContextToggle'

interface RuleBuilderProps {
  actions: PatternEditorActions
  derivedMainCards: CardEntry[]
  isPendingCreation: boolean
  pattern: HandPattern
}

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

  return (
    <div className="rule-builder grid gap-5">
      <section className="rule-preview" data-kind={pattern.kind} aria-live="polite">
        <span className="rule-preview-heading">{preview.heading}</span>
        <ul>
          {preview.items.map((item, index) => (
            <li key={`${index}-${item}`}>{item}</li>
          ))}
        </ul>
        {conditionCount > 1 ? <span className="rule-preview-logic">{preview.logic}</span> : null}
      </section>

      <RuleStep number={1} title="¿Qué representa?">
        <KindToggle patternId={pattern.id} currentKind={pattern.kind} actions={actions} />
      </RuleStep>

      <RuleStep number={2} title="¿Qué tiene que tener la mano?">
        {conditionCount > 1 ? (
          <LogicSelector
            patternId={pattern.id}
            currentMode={matchMode}
            conditionCount={conditionCount}
            minimumConditionMatches={normalizeMinimumConditionMatches(pattern)}
            actions={actions}
          />
        ) : null}

        <div className="grid gap-0">
          {pattern.conditions.map((condition, index) => (
            <div key={condition.id} className="grid gap-0">
              {index > 0 ? (
                <div className="flex justify-center py-1">
                  <span className="text-[0.8rem] font-medium uppercase tracking-widest text-(--text-soft)">
                    {connector}
                  </span>
                </div>
              ) : null}
              <ConditionBlock
                index={index}
                patternId={pattern.id}
                condition={condition}
                derivedMainCards={derivedMainCards}
                actions={actions}
                onRemove={() => actions.removeRequirement(pattern.id, condition.id)}
              />
            </div>
          ))}
        </div>

        <Button
          variant="secondary"
          size="sm"
          className="justify-self-start"
          onClick={() => actions.addRequirement(pattern.id)}
        >
          <PlusIcon width={14} height={14} /> Agregar condición
        </Button>
      </RuleStep>

      <RuleStep number={3} title="¿Cuándo cuenta?">
        <TurnContextToggle patternId={pattern.id} currentTurnContext={pattern.turnContext} actions={actions} />
      </RuleStep>

      <RuleStep number={4} title="Nombre" hint="Opcional: si lo dejás vacío se usa el resumen.">
        <PatternNameInput
          patternId={pattern.id}
          currentName={pattern.name}
          placeholderSummary={preview.items.some((item) => item.startsWith('(')) ? 'Ej.: Mi combo principal' : summary}
          isPendingCreation={false}
          actions={actions}
        />
      </RuleStep>

      <AdvancedSettings pattern={pattern} actions={actions} derivedMainCards={derivedMainCards} />
    </div>
  )
}

function RuleStep({
  number,
  title,
  hint,
  children,
}: {
  number: number
  title: string
  hint?: string
  children: ReactNode
}) {
  return (
    <section className="rule-step">
      <header className="rule-step-head">
        <span className="rule-step-number" aria-hidden="true">
          {number}
        </span>
        <h4>{title}</h4>
        {hint ? <small>{hint}</small> : null}
      </header>
      <div className="rule-step-body">{children}</div>
    </section>
  )
}
