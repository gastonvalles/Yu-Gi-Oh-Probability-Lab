import { useEffect, useMemo, useRef, type ReactNode } from 'react'

import type { CardEntry, HandPattern } from '../../../types'
import { getPatternMatchMode, normalizeMinimumConditionMatches } from '../../../app/patterns'
import { buildPatternCompactSummary, buildPatternPreview } from '../pattern-helpers'
import type { PatternEditorActions } from '../pattern-editor-actions'
import { Button } from '../../ui/Button'
import { overline } from '../../ui/typography'

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
    <div className="grid gap-6">
      <RuleStep title="Nombre" hint="Opcional">
        <PatternNameInput
          patternId={pattern.id}
          currentName={pattern.name}
          placeholderSummary={preview.items.some((item) => item.startsWith('(')) ? 'Ej.: Mi combo principal' : summary}
          isPendingCreation={isPendingCreation}
          actions={actions}
        />
      </RuleStep>

      <RuleStep title="¿Qué representa?">
        <KindToggle patternId={pattern.id} currentKind={pattern.kind} actions={actions} />
      </RuleStep>

      <RuleStep title="¿Qué tiene que tener la mano?">
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

        <Button variant="secondary" size="sm" icon="plus" className="justify-self-start" onClick={() => actions.addRequirement(pattern.id)}>
          Agregar condición
        </Button>
      </RuleStep>

      <RuleStep title="¿Cuándo cuenta?">
        <TurnContextToggle patternId={pattern.id} currentTurnContext={pattern.turnContext} ignoresDraw={pattern.ignoresDraw === true} actions={actions} />
      </RuleStep>


      <AdvancedSettings pattern={pattern} actions={actions} derivedMainCards={derivedMainCards} />
    </div>
  )
}

function RuleStep({
  title,
  hint,
  children,
}: {
  title: string
  hint?: string
  children: ReactNode
}) {
  return (
    <section className="grid gap-2.5">
      <header className="flex flex-wrap items-center gap-2.5">
        <h4 className="m-0 text-body font-semibold text-foreground">{title}</h4>
        {hint ? <small className="text-micro text-muted">{hint}</small> : null}
      </header>
      <div className="grid gap-2.5">{children}</div>
    </section>
  )
}
