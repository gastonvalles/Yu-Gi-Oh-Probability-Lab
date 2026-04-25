import { useMemo, useState } from 'react'

import type { CardEntry, HandPattern } from '../../../types'
import { getPatternMatchMode, normalizeMinimumConditionMatches } from '../../../app/patterns'
import { buildPatternCompactSummary } from '../pattern-helpers'
import type { PatternEditorActions } from '../pattern-editor-actions'
import { Button } from '../../ui/Button'

import { AdvancedSettings } from './AdvancedSettings'
import { ConditionBlock } from './ConditionBlock'
import { KindToggle } from './KindToggle'
import { getConnectorWord, LogicSelector } from './LogicSelector'
import { PatternNameInput } from './PatternNameInput'
import { QuickTemplates } from './QuickTemplates'

interface RuleBuilderProps {
  actions: PatternEditorActions
  derivedMainCards: CardEntry[]
  isPendingCreation: boolean
  onRequestDelete: (patternId: string) => void
  onSwitchPattern?: (newPatternId: string) => void
  pattern: HandPattern
  probability: number | null
}

export function RuleBuilder({
  actions,
  derivedMainCards,
  isPendingCreation,
  onRequestDelete,
  onSwitchPattern,
  pattern,
  probability: _probability,
}: RuleBuilderProps) {
  const [templateDismissed, setTemplateDismissed] = useState(false)

  const cardById = useMemo(
    () => new Map(derivedMainCards.map((card) => [card.id, card])),
    [derivedMainCards],
  )

  const placeholderSummary = useMemo(
    () => buildPatternCompactSummary(pattern, cardById),
    [pattern, cardById],
  )

  const matchMode = getPatternMatchMode(pattern)
  const minimumMatches = normalizeMinimumConditionMatches(pattern)
  const conditionCount = pattern.conditions.length
  const connector = getConnectorWord(matchMode)

  const hasDefinedMatchers = pattern.conditions.some((c) => c.matcher !== null)
  const showEmptyState = isPendingCreation && !hasDefinedMatchers && !templateDismissed

  const handleTemplateApplied = (newPatternId: string) => {
    setTemplateDismissed(true)
    onSwitchPattern?.(newPatternId)
  }

  const handleCreateFromScratch = () => {
    if (conditionCount === 0) {
      actions.addRequirement(pattern.id)
    }
    setTemplateDismissed(true)
  }

  return (
    <div className="rule-builder grid gap-4">
      {/* Header: Name + Kind */}
      <div className="grid gap-2.5">
        <PatternNameInput
          patternId={pattern.id}
          currentName={pattern.name}
          placeholderSummary={placeholderSummary}
          isPendingCreation={isPendingCreation}
          actions={actions}
        />
        <KindToggle
          patternId={pattern.id}
          currentKind={pattern.kind}
          actions={actions}
        />
      </div>

      {showEmptyState ? (
        /* Guided empty state */
        <section className="grid gap-3">
          <div className="grid gap-1">
            <h3 className="m-0 text-[0.96rem] leading-none text-(--text-main)">
              {pattern.kind === 'opening'
                ? '¿Con qué necesitás salir?'
                : '¿Qué querés evitar en tu mano?'}
            </h3>
            <p className="app-muted m-0 text-[0.76rem] leading-[1.16]">
              Elegí un punto de partida:
            </p>
          </div>

          <QuickTemplates
            derivedMainCards={derivedMainCards}
            actions={actions}
            patternId={pattern.id}
            patternKind={pattern.kind}
            onTemplateApplied={handleTemplateApplied}
          />

          <div className="flex items-center gap-3">
            <span className="h-px flex-1 bg-(--border-subtle)" />
            <span className="text-[0.72rem] text-(--text-soft)">o</span>
            <span className="h-px flex-1 bg-(--border-subtle)" />
          </div>

          <Button
            variant="secondary"
            size="sm"
            className="justify-self-center"
            onClick={handleCreateFromScratch}
          >
            Crear desde cero
          </Button>
        </section>
      ) : (
        /* Full editor */
        <div className="grid gap-3">
          {/* Logic selector (only when > 0 conditions) */}
          {conditionCount > 0 ? (
            <LogicSelector
              patternId={pattern.id}
              currentMode={matchMode}
              conditionCount={conditionCount}
              minimumConditionMatches={minimumMatches}
              actions={actions}
            />
          ) : null}

          {/* Conditions */}
          {conditionCount === 0 ? (
            <p className="surface-card m-0 px-3 py-2.5 text-[0.78rem] text-(--text-muted)">
              Esta regla todavía no tiene condiciones.
            </p>
          ) : (
            <div className="grid gap-0">
              {pattern.conditions.map((condition, index) => (
                <div key={condition.id} className="grid gap-0">
                  {index > 0 ? (
                    <div className="flex justify-center py-1">
                      <span className="text-[0.7rem] font-medium uppercase tracking-widest text-(--text-soft)">
                        {connector}
                      </span>
                    </div>
                  ) : null}
                  <ConditionBlock
                    index={index}
                    patternId={pattern.id}
                    condition={condition}
                    patternKind={pattern.kind}
                    derivedMainCards={derivedMainCards}
                    actions={actions}
                    onRemove={() => actions.removeRequirement(pattern.id, condition.id)}
                  />
                </div>
              ))}
            </div>
          )}

          {/* Add condition */}
          <Button
            variant="secondary"
            size="sm"
            className="justify-self-start"
            onClick={() => actions.addRequirement(pattern.id)}
          >
            Agregar condición
          </Button>

          {/* Advanced settings */}
          <AdvancedSettings pattern={pattern} actions={actions} />

          {/* Delete */}
          <section className="border-t border-(--border-subtle) pt-3">
            <p className="app-muted m-0 mb-2 text-[0.72rem] leading-[1.14]">
              Eliminar esta regla la saca del análisis y cambia el resultado inmediatamente.
            </p>
            <Button
              variant="tertiary"
              size="sm"
              onClick={() => onRequestDelete(pattern.id)}
            >
              Eliminar regla
            </Button>
          </section>
        </div>
      )}
    </div>
  )
}
