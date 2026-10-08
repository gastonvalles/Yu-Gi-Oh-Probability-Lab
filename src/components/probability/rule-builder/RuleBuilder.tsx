import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react'

import type { CardEntry, HandPattern } from '../../../types'
import { getPatternMatchMode, normalizeMinimumConditionMatches } from '../../../app/patterns'
import { buildPatternCompactSummary, buildPatternPreview } from '../pattern-helpers'
import type { PatternEditorActions } from '../pattern-editor-actions'
import { Button } from '../../ui/Button'
import { cx } from '../../ui/cx'
import { Icon } from '../../ui/Icon'
import { overline } from '../../ui/typography'

import { AdvancedSettings } from './AdvancedSettings'
import { ConditionBlock } from './ConditionBlock'
import { KindToggle } from './KindToggle'
import { getConnectorWord, LogicSelector } from './LogicSelector'
import { PatternNameInput } from './PatternNameInput'
import { DrawCountToggle, TurnContextToggle } from './TurnContextToggle'

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

  const addCondition = (mode?: 'any') => {
    actions.addRequirement(pattern.id)

    if (mode) {
      actions.setPatternMatchMode(pattern.id, mode)
    }
  }

  return (
    <div className="grid gap-4">
      <PatternNameInput
        patternId={pattern.id}
        currentName={pattern.name}
        placeholderSummary={preview.items.some((item) => item.startsWith('(')) ? 'Nombre (opcional)' : summary}
        isPendingCreation={isPendingCreation}
        actions={actions}
      />

      <div className="grid gap-3 min-[640px]:grid-cols-2">
        <RuleStep title="Tipo">
          <KindToggle patternId={pattern.id} currentKind={pattern.kind} actions={actions} />
        </RuleStep>
        <RuleStep title="Turno">
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
      </RuleStep>

      <MoreOptions pattern={pattern} actions={actions} derivedMainCards={derivedMainCards} />
    </div>
  )
}

/** Los ajustes que casi nunca se tocan, plegados (se abren solos si la regla pide revisión). */
function MoreOptions({ pattern, actions, derivedMainCards }: { pattern: HandPattern; actions: PatternEditorActions; derivedMainCards: CardEntry[] }) {
  const [isOpen, setIsOpen] = useState(pattern.needsReview === true)

  return (
    <section className="grid gap-2">
      <button
        type="button"
        className="inline-flex w-fit items-center gap-1.5 rounded-control py-1 pr-2 text-body font-semibold text-muted transition-colors hover:text-foreground focus-visible:outline-none focus-visible:shadow-focus"
        aria-expanded={isOpen}
        onClick={() => setIsOpen((current) => !current)}
      >
        <Icon name="chevron-right" size={14} className={cx('transition-transform duration-150', isOpen && 'rotate-90')} />
        Más opciones
      </button>
      {isOpen ? (
        <div className="grid gap-2">
          {pattern.turnContext !== 'first' ? <DrawCountToggle patternId={pattern.id} ignoresDraw={pattern.ignoresDraw === true} actions={actions} /> : null}
          <AdvancedSettings pattern={pattern} actions={actions} derivedMainCards={derivedMainCards} />
        </div>
      ) : null}
    </section>
  )
}

function RuleStep({
  title,
  children,
}: {
  title: string
  children: ReactNode
}) {
  return (
    <section className="grid content-start gap-2">
      <h4 className={cx('m-0', overline)}>{title}</h4>
      {children}
    </section>
  )
}
