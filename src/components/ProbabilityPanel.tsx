import { useMemo, useState } from 'react'

import { buildCalculatorState } from '../app/calculator-state'
import type { CalculatorMode } from '../app/model'
import { countUnclassifiedCards, isRoleStepComplete } from '../app/role-step'
import { calculateProbabilities } from '../probability'
import type {
  CalculationOutput,
  CardEntry,
  HandPattern,
} from '../types'
import { StepHero } from './StepHero'
import { Button } from './ui/Button'
import { PatternEditor } from './probability/PatternEditor'
import { PracticeSection } from './probability/PracticeSection'
import { ResultsSection } from './probability/ResultsSection'
import type { DerivedDeckGroup } from '../app/deck-groups'
import type { PatternEditorActions } from './probability/pattern-editor-actions'

interface ProbabilityPanelProps {
  handSize: number
  mode: CalculatorMode
  onModeChange: (mode: CalculatorMode) => void
  patterns: HandPattern[]
  derivedMainCards: CardEntry[]
  derivedGroups: DerivedDeckGroup[]
  patternActions: PatternEditorActions
  isEditingDeck: boolean
}

const IDLE_CALCULATION_RESULT: CalculationOutput = {
  issues: [],
  blockingIssues: [],
  summary: null,
}

export function ProbabilityPanel({
  handSize,
  mode: _mode,
  onModeChange: _onModeChange,
  patterns,
  derivedMainCards,
  derivedGroups,
  patternActions,
  isEditingDeck,
}: ProbabilityPanelProps) {
  const [mobilePatternsOpen, setMobilePatternsOpen] = useState(false)
  const mainDeckCount = useMemo(
    () => derivedMainCards.reduce((total, card) => total + card.copies, 0),
    [derivedMainCards],
  )
  const unclassifiedCardCount = useMemo(
    () => countUnclassifiedCards(derivedMainCards),
    [derivedMainCards],
  )
  const hasCompletedRoleStep = useMemo(
    () => isRoleStepComplete(derivedMainCards),
    [derivedMainCards],
  )
  const result = useMemo(() => {
    if (isEditingDeck || !hasCompletedRoleStep) {
      return IDLE_CALCULATION_RESULT
    }

    return calculateProbabilities(
      buildCalculatorState(derivedMainCards, {
        handSize,
        patterns,
      }),
    )
  }, [derivedMainCards, handSize, hasCompletedRoleStep, isEditingDeck, patterns])
  const patternEditor = (
    <PatternEditor
      patterns={patterns}
      derivedMainCards={derivedMainCards}
      derivedGroups={derivedGroups}
      actions={patternActions}
    />
  )

  return (
    <article className="surface-panel grid h-full min-h-0 gap-3 p-2.5 min-[1180px]:grid-rows-[auto_minmax(0,1fr)]">
      <StepHero
        step="Paso 3"
        pill="Probability Lab"
        title="Definí aperturas, problemas y leé estadísticas"
        description="Marcá qué manos sí querés ver al robar y qué problemas querés evitar. La app revisa todas las manos posibles y te muestra qué tan seguido pasa cada cosa."
      />

      <div className="grid min-h-0 items-start gap-3 min-[1180px]:grid-cols-[minmax(0,1.15fr)_minmax(360px,0.85fr)]">
        <section className="grid content-start gap-3 min-[1180px]:min-h-0">
          <div className="min-[1180px]:hidden">
            <Button variant="primary" size="md" fullWidth onClick={() => setMobilePatternsOpen(true)}>
              Abrir aperturas y problemas
            </Button>
          </div>
          <ResultsSection
            result={result}
            handSize={handSize}
            mainDeckCount={mainDeckCount}
            patternCount={patterns.length}
            hasCompletedRoleStep={hasCompletedRoleStep}
            unclassifiedCardCount={unclassifiedCardCount}
          />
        </section>

        <section className="surface-panel-soft grid min-h-0 gap-2 p-2.5 max-[1179px]:hidden min-[1180px]:h-full min-[1180px]:grid-rows-[minmax(0,1fr)]">
          {patternEditor}
        </section>

        <div className="min-[1180px]:col-span-2">
          <PracticeSection
            handSize={handSize}
            derivedMainCards={derivedMainCards}
            patterns={patterns}
          />
        </div>
      </div>

      {mobilePatternsOpen ? (
        <div className="fixed inset-0 z-130 grid place-items-center bg-[rgb(var(--background-rgb)/0.82)] px-3 py-6 min-[1180px]:hidden">
          <div className="surface-panel w-full max-w-180 p-2.5">
            <div className="flex items-center justify-between gap-2 border-b border-(--border-subtle) pb-2">
              <strong className="text-[0.95rem]">Aperturas y problemas</strong>
              <button
                type="button"
                className="app-icon-button text-[1.05rem]"
                onClick={() => setMobilePatternsOpen(false)}
              >
                ×
              </button>
            </div>
            <div className="mt-2 max-h-[78vh] overflow-y-auto pr-1">
              {patternEditor}
            </div>
          </div>
        </div>
      ) : null}
    </article>
  )
}
