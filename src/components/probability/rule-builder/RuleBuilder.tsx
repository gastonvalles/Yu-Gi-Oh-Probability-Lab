import { useEffect, useMemo, useRef, type ReactNode } from 'react'

import type { CardEntry, HandPattern } from '../../../types'
import { getPatternMatchMode, normalizeMinimumConditionMatches } from '../../../app/patterns'
import { buildPatternCompactSummary, buildPatternPreview } from '../pattern-helpers'
import type { PatternEditorActions } from '../pattern-editor-actions'
import { Button } from '../../ui/Button'
import { cx } from '../../ui/cx'
import { TONE } from '../../ui/tone'
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
      <RuleStep number={1} title="Nombre" hint="Opcional: si lo dejás vacío se usa el resumen.">
        <PatternNameInput
          patternId={pattern.id}
          currentName={pattern.name}
          placeholderSummary={preview.items.some((item) => item.startsWith('(')) ? 'Ej.: Mi combo principal' : summary}
          isPendingCreation={isPendingCreation}
          actions={actions}
        />
      </RuleStep>

      <section className={cx('grid gap-1.5 rounded-control px-4 py-3', TONE[pattern.kind === 'opening' ? 'success' : 'danger'].soft)} aria-live="polite">
        <span className={cx('text-body font-semibold', TONE[pattern.kind === 'opening' ? 'success' : 'danger'].text)}>{preview.heading}</span>
        <ul className="m-0 grid gap-0.5 pl-4 text-body text-foreground">
          {preview.items.map((item, index) => (
            <li key={`${index}-${item}`}>{item}</li>
          ))}
        </ul>
        {conditionCount > 1 ? <span className="text-micro text-muted">{preview.logic}</span> : null}
      </section>

      <RuleStep number={2} title="¿Qué representa?">
        <KindToggle patternId={pattern.id} currentKind={pattern.kind} actions={actions} />
      </RuleStep>

      <RuleStep number={3} title="¿Qué tiene que tener la mano?">
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

      <RuleStep number={4} title="¿Cuándo cuenta?">
        <TurnContextToggle patternId={pattern.id} currentTurnContext={pattern.turnContext} ignoresDraw={pattern.ignoresDraw === true} actions={actions} />
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
    <section className="grid gap-2.5">
      <header className="flex flex-wrap items-center gap-2.5">
        <span
          className="grid size-6 place-items-center rounded-full border border-primary/40 bg-primary/16 text-micro font-bold text-primary-soft"
          aria-hidden="true"
        >
          {number}
        </span>
        <h4 className="m-0 text-body font-semibold text-foreground">{title}</h4>
        {hint ? <small className="text-micro text-muted">{hint}</small> : null}
      </header>
      <div className="grid gap-2.5">{children}</div>
    </section>
  )
}
