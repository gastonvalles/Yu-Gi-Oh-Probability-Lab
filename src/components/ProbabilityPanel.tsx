import { useDeferredValue, useMemo, useState } from 'react'

import { buildCalculatorState } from '../app/deck-utils'
import type { CalculatorMode } from '../app/model'
import { calculateProbabilities } from '../probability'
import type {
  CardEntry,
  CardGroupKey,
  HandPattern,
  HandPatternCategory,
  PatternMatchMode,
  RequirementKind,
  RequirementSource,
} from '../types'
import { ModeTabs } from './ModeTabs'
import { PatternEditor } from './probability/PatternEditor'
import { PracticeSection } from './probability/PracticeSection'
import { ResultsSection } from './probability/ResultsSection'
import type { DerivedDeckGroup } from '../app/deck-groups'

interface ProbabilityPanelProps {
  mode: CalculatorMode
  onModeChange: (mode: CalculatorMode) => void
  patterns: HandPattern[]
  derivedMainCards: CardEntry[]
  derivedGroups: DerivedDeckGroup[]
  onAddPattern: (category: HandPatternCategory) => string
  onRemovePattern: (patternId: string) => void
  onPatternCategoryChange: (patternId: string, value: HandPatternCategory) => void
  onPatternNameChange: (patternId: string, value: string) => void
  onPatternMatchModeChange: (patternId: string, value: PatternMatchMode) => void
  onPatternMinimumMatchesChange: (patternId: string, value: string) => void
  onPatternAllowSharedCardsChange: (patternId: string, value: boolean) => void
  onAddRequirement: (patternId: string) => void
  onRemoveRequirement: (patternId: string, requirementId: string) => void
  onAddRequirementCard: (patternId: string, requirementId: string, cardId: string) => void
  onRemoveRequirementCard: (patternId: string, requirementId: string, cardId: string) => void
  onRequirementKindChange: (patternId: string, requirementId: string, value: RequirementKind) => void
  onRequirementDistinctChange: (patternId: string, requirementId: string, value: boolean) => void
  onRequirementCountChange: (patternId: string, requirementId: string, value: string) => void
  onRequirementSourceChange: (patternId: string, requirementId: string, value: RequirementSource) => void
  onRequirementGroupChange: (patternId: string, requirementId: string, value: CardGroupKey | null) => void
}

export function ProbabilityPanel({
  mode,
  onModeChange,
  patterns,
  derivedMainCards,
  derivedGroups,
  onAddPattern,
  onRemovePattern,
  onPatternCategoryChange,
  onPatternNameChange,
  onPatternMatchModeChange,
  onPatternMinimumMatchesChange,
  onPatternAllowSharedCardsChange,
  onAddRequirement,
  onRemoveRequirement,
  onAddRequirementCard,
  onRemoveRequirementCard,
  onRequirementKindChange,
  onRequirementDistinctChange,
  onRequirementCountChange,
  onRequirementSourceChange,
  onRequirementGroupChange,
}: ProbabilityPanelProps) {
  const handSize = 5
  const [mobilePatternsOpen, setMobilePatternsOpen] = useState(false)
  const deferredDerivedMainCards = useDeferredValue(derivedMainCards)
  const deferredPatterns = useDeferredValue(patterns)
  const result = useMemo(
    () =>
      calculateProbabilities(
        buildCalculatorState(deferredDerivedMainCards, {
          handSize,
          patterns: deferredPatterns,
        }),
      ),
    [deferredDerivedMainCards, handSize, deferredPatterns],
  )

  return (
    <article className="surface-panel mx-auto w-full max-w-[1240px] p-2.5 min-[1180px]:grid min-[1180px]:grid-rows-[auto_minmax(0,1fr)]">
      <div className="surface-card mb-2.5 grid gap-1 px-2 py-1.5">
        <div className="flex items-start justify-between gap-3 max-[860px]:flex-col max-[860px]:items-stretch">
          <div className="min-w-0">
            <p className="app-kicker m-0 text-[0.68rem] uppercase tracking-widest">Paso 3</p>
            <h2 className="m-0 text-[1rem] leading-none">Definí aperturas, problemas y leé estadísticas</h2>
            <p className="app-muted m-[0.28rem_0_0] max-w-[74ch] text-[0.78rem] leading-[1.18]">
              Acá marcás qué manos sí querés ver al robar y qué problemas querés evitar. Después la app revisa todas las manos posibles y te muestra qué tan seguido pasa cada cosa.
            </p>
          </div>
        <ModeTabs mode={mode} onChange={onModeChange} />
        </div>
      </div>

      <div className="grid min-h-0 items-start gap-3 min-[1180px]:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
        <section className="grid content-start gap-3 min-[1180px]:min-h-0">
          <div className="min-[1180px]:hidden">
            <button
              type="button"
              className="app-button app-button-primary w-full px-2 py-1 text-[0.86rem]"
              onClick={() => setMobilePatternsOpen(true)}
            >
              Abrir aperturas y problemas
            </button>
          </div>
          <ResultsSection result={result} handSize={handSize} />

          <PracticeSection
            handSize={handSize}
            derivedMainCards={derivedMainCards}
            patterns={patterns}
          />
        </section>

        <section className="grid min-h-0 gap-2 max-[1179px]:hidden min-[1180px]:h-full min-[1180px]:grid-rows-[minmax(0,1fr)]">
          <PatternEditor
            patterns={patterns}
            derivedMainCards={derivedMainCards}
            derivedGroups={derivedGroups}
            onAddPattern={onAddPattern}
            onRemovePattern={onRemovePattern}
            onPatternCategoryChange={onPatternCategoryChange}
            onPatternNameChange={onPatternNameChange}
            onPatternMatchModeChange={onPatternMatchModeChange}
            onPatternMinimumMatchesChange={onPatternMinimumMatchesChange}
            onPatternAllowSharedCardsChange={onPatternAllowSharedCardsChange}
            onAddRequirement={onAddRequirement}
            onRemoveRequirement={onRemoveRequirement}
            onAddRequirementCard={onAddRequirementCard}
            onRemoveRequirementCard={onRemoveRequirementCard}
            onRequirementKindChange={onRequirementKindChange}
            onRequirementDistinctChange={onRequirementDistinctChange}
            onRequirementCountChange={onRequirementCountChange}
            onRequirementSourceChange={onRequirementSourceChange}
            onRequirementGroupChange={onRequirementGroupChange}
          />
        </section>
      </div>

      {mobilePatternsOpen ? (
        <div className="fixed inset-0 z-[130] grid place-items-center bg-black/80 px-3 py-6 min-[1180px]:hidden">
          <div className="surface-panel w-full max-w-[720px] p-2.5">
            <div className="flex items-center justify-between gap-2 border-b border-[var(--border-subtle)] pb-2">
              <strong className="text-[0.95rem]">Aperturas y problemas</strong>
              <button
                type="button"
                className="border-0 bg-transparent p-0 text-[1.05rem] text-[var(--text-soft)] hover:text-[#d04a57]"
                onClick={() => setMobilePatternsOpen(false)}
              >
                ×
              </button>
            </div>
            <div className="mt-2 max-h-[78vh] overflow-y-auto pr-1">
              <PatternEditor
                patterns={patterns}
                derivedMainCards={derivedMainCards}
                derivedGroups={derivedGroups}
                onAddPattern={onAddPattern}
                onRemovePattern={onRemovePattern}
                onPatternCategoryChange={onPatternCategoryChange}
                onPatternNameChange={onPatternNameChange}
                onPatternMatchModeChange={onPatternMatchModeChange}
                onPatternMinimumMatchesChange={onPatternMinimumMatchesChange}
                onPatternAllowSharedCardsChange={onPatternAllowSharedCardsChange}
                onAddRequirement={onAddRequirement}
                onRemoveRequirement={onRemoveRequirement}
                onAddRequirementCard={onAddRequirementCard}
                onRemoveRequirementCard={onRemoveRequirementCard}
                onRequirementKindChange={onRequirementKindChange}
                onRequirementDistinctChange={onRequirementDistinctChange}
                onRequirementCountChange={onRequirementCountChange}
                onRequirementSourceChange={onRequirementSourceChange}
                onRequirementGroupChange={onRequirementGroupChange}
              />
            </div>
          </div>
        </div>
      ) : null}
    </article>
  )
}
