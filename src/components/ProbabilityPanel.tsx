import { useEffect, useMemo, useRef, useState } from 'react'

import { buildCalculatorState } from '../app/calculator-state'
import type { DerivedDeckGroup } from '../app/deck-groups'
import type { CalculatorMode } from '../app/model'
import { buildPatternPresets } from '../app/pattern-presets'
import {
  countCardsMissingOrigin,
  countCardsMissingRoles,
  countCardsPendingReview,
  countUnclassifiedCards,
  isClassificationStepComplete,
} from '../app/role-step'
import { formatInteger } from '../app/utils'
import { calculateProbabilities } from '../probability'
import type { CalculationOutput, CardEntry, HandPattern } from '../types'
import { StepHero } from './StepHero'
import { ConfirmDialog } from './probability/ConfirmDialog'
import { CausalChecksList } from './probability/CausalChecksList'
import { DeckQualityHero } from './probability/DeckQualityHero'
import { KeyInsightsSummary } from './probability/KeyInsightsSummary'
import { PatternEditorDrawer, formatDrawerImpactLabel } from './probability/PatternEditorDrawer'
import type { PatternEditorActions } from './probability/pattern-editor-actions'
import { PracticeSection } from './probability/PracticeSection'
import { ResultsDetailPanel } from './probability/ResultsDetailPanel'
import {
  buildProbabilityEntries,
  buildProbabilityInsights,
} from './probability/probability-lab-helpers'
import { Button } from './ui/Button'

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

type DrawerMode = 'custom-create' | 'edit' | 'quick-add'

interface DeckSummarySnapshot {
  cleanProbability: number
  cleanHands: number
  totalHands: number
  basedOnActiveRules: boolean
}

interface KpiFeedbackState {
  label: string
  tone: 'negative' | 'neutral' | 'positive'
}

interface PendingFeedback {
  patternId: string | null
  skip: boolean
}

const IDLE_CALCULATION_RESULT: CalculationOutput = {
  issues: [],
  blockingIssues: [],
  summary: null,
}

const DECK_SUMMARY_READINESS_PRESET_IDS = [
  'starter_opening',
  'starter_extender_opening',
  'no_starter_problem',
  'double_brick_problem',
  'triple_non_engine_problem',
] as const

export function ProbabilityPanel({
  handSize,
  mode: _mode,
  onModeChange: _onModeChange,
  patterns,
  derivedMainCards,
  derivedGroups: _derivedGroups,
  patternActions,
  isEditingDeck,
}: ProbabilityPanelProps) {
  const availablePresets = useMemo(
    () => buildPatternPresets(derivedMainCards),
    [derivedMainCards],
  )
  const presetById = useMemo(
    () => new Map(availablePresets.map((preset) => [preset.id, preset])),
    [availablePresets],
  )
  const activePatterns = patterns
  const mainDeckCount = useMemo(
    () => derivedMainCards.reduce((total, card) => total + card.copies, 0),
    [derivedMainCards],
  )
  const unclassifiedCardCount = useMemo(
    () => countUnclassifiedCards(derivedMainCards),
    [derivedMainCards],
  )
  const missingOriginCount = useMemo(
    () => countCardsMissingOrigin(derivedMainCards),
    [derivedMainCards],
  )
  const missingRoleCount = useMemo(
    () => countCardsMissingRoles(derivedMainCards),
    [derivedMainCards],
  )
  const pendingReviewCount = useMemo(
    () => countCardsPendingReview(derivedMainCards),
    [derivedMainCards],
  )
  const hasCompletedClassification = useMemo(
    () => isClassificationStepComplete(derivedMainCards),
    [derivedMainCards],
  )
  const reviewPendingPatternCount = useMemo(
    () => activePatterns.filter((pattern) => pattern.needsReview).length,
    [activePatterns],
  )
  const result = useMemo(() => {
    if (isEditingDeck || !hasCompletedClassification || activePatterns.length === 0) {
      return IDLE_CALCULATION_RESULT
    }

    return calculateProbabilities(
      buildCalculatorState(derivedMainCards, {
        handSize,
        patterns: activePatterns,
      }),
    )
  }, [activePatterns, derivedMainCards, handSize, hasCompletedClassification, isEditingDeck])
  const readinessPresets = useMemo(
    () =>
      DECK_SUMMARY_READINESS_PRESET_IDS.flatMap((presetId) => {
        const preset = presetById.get(presetId)
        return preset ? [preset] : []
      }),
    [presetById],
  )
  const readinessResult = useMemo(() => {
    if (isEditingDeck || !hasCompletedClassification || readinessPresets.length === 0) {
      return IDLE_CALCULATION_RESULT
    }

    return calculateProbabilities(
      buildCalculatorState(derivedMainCards, {
        handSize,
        patterns: readinessPresets.map((preset) => preset.pattern),
      }),
    )
  }, [derivedMainCards, handSize, hasCompletedClassification, isEditingDeck, readinessPresets])
  const deckSummary = useMemo<DeckSummarySnapshot | null>(() => {
    const activeSummary = result.summary
    const fallbackSummary = readinessResult.summary
    const summary = activeSummary ?? fallbackSummary

    if (!summary) {
      return null
    }

    const cleanHands = Math.max(0, summary.goodHands - summary.overlapHands)
    const cleanProbability = summary.totalHands > 0
      ? cleanHands / summary.totalHands
      : 0

    return {
      cleanProbability,
      cleanHands,
      totalHands: summary.totalHands,
      basedOnActiveRules: Boolean(activeSummary),
    }
  }, [readinessResult.summary, result.summary])
  const { openingEntries, problemEntries } = useMemo(
    () => buildProbabilityEntries(activePatterns, result.summary, derivedMainCards),
    [activePatterns, derivedMainCards, result.summary],
  )
  const { strengths, risks } = useMemo(
    () => buildProbabilityInsights({ openingEntries, problemEntries }),
    [openingEntries, problemEntries],
  )
  const [drawerMode, setDrawerMode] = useState<DrawerMode | null>(null)
  const [selectedPatternId, setSelectedPatternId] = useState<string | null>(null)
  const [pendingCreatedPatternId, setPendingCreatedPatternId] = useState<string | null>(null)
  const [practiceOpen, setPracticeOpen] = useState(false)
  const [resultsDetailOpen, setResultsDetailOpen] = useState(false)
  const [pendingDeletePatternId, setPendingDeletePatternId] = useState<string | null>(null)
  const [highlightedPatternId, setHighlightedPatternId] = useState<string | null>(null)
  const [recentlyChangedPatternId, setRecentlyChangedPatternId] = useState<string | null>(null)
  const [kpiFeedback, setKpiFeedback] = useState<KpiFeedbackState | null>(null)
  const selectedPattern = useMemo(
    () => patterns.find((pattern) => pattern.id === selectedPatternId) ?? null,
    [patterns, selectedPatternId],
  )
  const selectedPatternProbability = useMemo(
    () => result.summary?.patternResults.find((pattern) => pattern.patternId === selectedPatternId)?.probability ?? null,
    [result.summary, selectedPatternId],
  )
  const currentImpactLabel = selectedPattern
    ? formatDrawerImpactLabel(selectedPatternProbability, selectedPattern.kind)
    : null
  const previousCleanProbabilityRef = useRef<number | null>(null)
  const pendingFeedbackRef = useRef<PendingFeedback | null>(null)
  const clearHighlightTimeoutRef = useRef<number | null>(null)
  const clearFeedbackTimeoutRef = useRef<number | null>(null)

  const trackedPatternActions = useMemo<PatternEditorActions>(
    () => ({
      addPattern(category) {
        return patternActions.addPattern(category)
      },
      appendPattern(pattern) {
        pendingFeedbackRef.current = { patternId: pattern.id, skip: false }
        patternActions.appendPattern(pattern)
      },
      removePattern(patternId) {
        pendingFeedbackRef.current = { patternId, skip: false }
        patternActions.removePattern(patternId)
      },
      replacePatterns(nextPatterns) {
        pendingFeedbackRef.current = { patternId: selectedPatternId, skip: false }
        patternActions.replacePatterns(nextPatterns)
      },
      setPatternCategory(patternId, value) {
        pendingFeedbackRef.current = { patternId, skip: false }
        patternActions.setPatternCategory(patternId, value)
      },
      setPatternName(patternId, value) {
        patternActions.setPatternName(patternId, value)
      },
      setPatternMatchMode(patternId, value) {
        pendingFeedbackRef.current = { patternId, skip: false }
        patternActions.setPatternMatchMode(patternId, value)
      },
      setPatternMinimumMatches(patternId, value) {
        pendingFeedbackRef.current = { patternId, skip: false }
        patternActions.setPatternMinimumMatches(patternId, value)
      },
      setPatternAllowSharedCards(patternId, value) {
        pendingFeedbackRef.current = { patternId, skip: false }
        patternActions.setPatternAllowSharedCards(patternId, value)
      },
      addRequirement(patternId) {
        pendingFeedbackRef.current = { patternId, skip: false }
        patternActions.addRequirement(patternId)
      },
      removeRequirement(patternId, requirementId) {
        pendingFeedbackRef.current = { patternId, skip: false }
        patternActions.removeRequirement(patternId, requirementId)
      },
      addRequirementCard(patternId, requirementId, cardId) {
        pendingFeedbackRef.current = { patternId, skip: false }
        patternActions.addRequirementCard(patternId, requirementId, cardId)
      },
      removeRequirementCard(patternId, requirementId, cardId) {
        pendingFeedbackRef.current = { patternId, skip: false }
        patternActions.removeRequirementCard(patternId, requirementId, cardId)
      },
      setRequirementKind(patternId, requirementId, value) {
        pendingFeedbackRef.current = { patternId, skip: false }
        patternActions.setRequirementKind(patternId, requirementId, value)
      },
      setRequirementDistinct(patternId, requirementId, value) {
        pendingFeedbackRef.current = { patternId, skip: false }
        patternActions.setRequirementDistinct(patternId, requirementId, value)
      },
      setRequirementCount(patternId, requirementId, value) {
        pendingFeedbackRef.current = { patternId, skip: false }
        patternActions.setRequirementCount(patternId, requirementId, value)
      },
      setRequirementMatcher(patternId, requirementId, value) {
        pendingFeedbackRef.current = { patternId, skip: false }
        patternActions.setRequirementMatcher(patternId, requirementId, value)
      },
      setRequirementSource(patternId, requirementId, value) {
        pendingFeedbackRef.current = { patternId, skip: false }
        patternActions.setRequirementSource(patternId, requirementId, value)
      },
      setRequirementGroup(patternId, requirementId, value) {
        pendingFeedbackRef.current = { patternId, skip: false }
        patternActions.setRequirementGroup(patternId, requirementId, value)
      },
      setRequirementAttribute(patternId, requirementId, value) {
        pendingFeedbackRef.current = { patternId, skip: false }
        patternActions.setRequirementAttribute(patternId, requirementId, value)
      },
      setRequirementLevel(patternId, requirementId, value) {
        pendingFeedbackRef.current = { patternId, skip: false }
        patternActions.setRequirementLevel(patternId, requirementId, value)
      },
      setRequirementMonsterType(patternId, requirementId, value) {
        pendingFeedbackRef.current = { patternId, skip: false }
        patternActions.setRequirementMonsterType(patternId, requirementId, value)
      },
      setRequirementAtk(patternId, requirementId, value) {
        pendingFeedbackRef.current = { patternId, skip: false }
        patternActions.setRequirementAtk(patternId, requirementId, value)
      },
      setRequirementDef(patternId, requirementId, value) {
        pendingFeedbackRef.current = { patternId, skip: false }
        patternActions.setRequirementDef(patternId, requirementId, value)
      },
    }),
    [patternActions, selectedPatternId],
  )

  useEffect(() => {
    if (!selectedPatternId || patterns.some((pattern) => pattern.id === selectedPatternId)) {
      return
    }

    setSelectedPatternId(null)
    setDrawerMode((current) => (current === 'quick-add' ? current : null))
  }, [patterns, selectedPatternId])

  useEffect(() => {
    if (!pendingCreatedPatternId) {
      return
    }

    const pendingPattern = patterns.find((pattern) => pattern.id === pendingCreatedPatternId)

    if (!pendingPattern || pendingPattern.name.trim().length > 0) {
      setPendingCreatedPatternId(null)
    }
  }, [patterns, pendingCreatedPatternId])

  useEffect(() => {
    const currentProbability = deckSummary?.cleanProbability ?? null
    const pendingFeedback = pendingFeedbackRef.current

    if (!pendingFeedback) {
      previousCleanProbabilityRef.current = currentProbability
      return
    }

    pendingFeedbackRef.current = null

    if (pendingFeedback.skip) {
      previousCleanProbabilityRef.current = currentProbability
      return
    }

    const previousProbability = previousCleanProbabilityRef.current
    const nextFeedback = buildKpiFeedback(previousProbability, currentProbability)

    previousCleanProbabilityRef.current = currentProbability
    setKpiFeedback(nextFeedback)
    setRecentlyChangedPatternId(pendingFeedback.patternId)
    setHighlightedPatternId(pendingFeedback.patternId)

    if (clearFeedbackTimeoutRef.current !== null) {
      window.clearTimeout(clearFeedbackTimeoutRef.current)
    }

    if (clearHighlightTimeoutRef.current !== null) {
      window.clearTimeout(clearHighlightTimeoutRef.current)
    }

    clearFeedbackTimeoutRef.current = window.setTimeout(() => {
      setKpiFeedback(null)
    }, 1800)
    clearHighlightTimeoutRef.current = window.setTimeout(() => {
      setHighlightedPatternId((current) => (
        current === pendingFeedback.patternId ? null : current
      ))
      setRecentlyChangedPatternId(null)
    }, 1800)
  }, [deckSummary?.cleanProbability, patterns])

  useEffect(
    () => () => {
      if (clearFeedbackTimeoutRef.current !== null) {
        window.clearTimeout(clearFeedbackTimeoutRef.current)
      }

      if (clearHighlightTimeoutRef.current !== null) {
        window.clearTimeout(clearHighlightTimeoutRef.current)
      }
    },
    [],
  )

  const handleOpenQuickAdd = () => {
    setSelectedPatternId(null)
    setDrawerMode('quick-add')
  }

  const handleOpenCustomCreate = () => {
    pendingFeedbackRef.current = { patternId: null, skip: true }
    const patternId = patternActions.addPattern('opening')

    setPendingCreatedPatternId(patternId)
    setSelectedPatternId(patternId)
    setDrawerMode('custom-create')
  }

  const handleEditPattern = (patternId: string) => {
    setSelectedPatternId(patternId)
    setHighlightedPatternId(patternId)
    setDrawerMode('edit')
  }

  const handleSelectPreset = (presetId: string) => {
    const preset = presetById.get(presetId)

    if (!preset) {
      return
    }

    pendingFeedbackRef.current = { patternId: preset.pattern.id, skip: false }
    patternActions.appendPattern(preset.pattern)
    setDrawerMode(null)
    setSelectedPatternId(null)
  }

  const handleCloseDrawer = () => {
    if (pendingCreatedPatternId && pendingCreatedPatternId === selectedPatternId) {
      const pendingPattern = patterns.find((pattern) => pattern.id === pendingCreatedPatternId)

      if (pendingPattern && pendingPattern.name.trim().length === 0) {
        pendingFeedbackRef.current = { patternId: null, skip: true }
        patternActions.removePattern(pendingCreatedPatternId)
      }

      setPendingCreatedPatternId(null)
    }

    setSelectedPatternId(null)
    setDrawerMode(null)
  }

  const handleConfirmDelete = () => {
    if (!pendingDeletePatternId) {
      return
    }

    pendingFeedbackRef.current = { patternId: pendingDeletePatternId, skip: false }
    patternActions.removePattern(pendingDeletePatternId)
    setPendingDeletePatternId(null)

    if (selectedPatternId === pendingDeletePatternId) {
      setSelectedPatternId(null)
      setDrawerMode(null)
    }

    if (pendingCreatedPatternId === pendingDeletePatternId) {
      setPendingCreatedPatternId(null)
    }
  }

  const drawerFeedbackLabel =
    selectedPatternId && recentlyChangedPatternId === selectedPatternId && kpiFeedback
      ? kpiFeedback.label
      : null
  const activePatternCount = activePatterns.length
  const isEmptyDeckState = mainDeckCount === 0
  const isWaitingForRoleStep = !isEmptyDeckState && !hasCompletedClassification

  return (
    <article className="surface-panel grid h-full min-h-0 gap-3 p-3 min-[1240px]:grid-rows-[auto_minmax(0,1fr)]">
      <StepHero
        step="Paso 3"
        pill="Probability Lab"
        title="Entende que tan jugable es tu deck y que lo esta causando"
        description="Mira el KPI, detecta las fortalezas y riesgos principales, y edita chequeos sin perder el contexto."
        side={(
          <Button variant="secondary" size="sm" onClick={() => setPracticeOpen(true)}>
            Abrir practica
          </Button>
        )}
        sideVariant="inline"
      />

      {isEmptyDeckState ? (
        <section className="surface-panel-strong grid gap-2.5 px-4 py-4">
          <div className="grid gap-1">
            <p className="app-kicker m-0 text-[0.68rem] uppercase tracking-widest">Antes de medir</p>
            <h3 className="m-0 text-[1rem] leading-none text-(--text-main)">Carga el Main Deck primero</h3>
            <p className="app-muted m-0 text-[0.8rem] leading-[1.16]">
              Cuando tengas cartas en el Main Deck, este panel te va a mostrar el KPI principal, las causas y los chequeos activos.
            </p>
          </div>
        </section>
      ) : isWaitingForRoleStep ? (
        <section className="surface-panel-strong grid gap-2.5 px-4 py-4">
          <div className="grid gap-1">
            <p className="app-kicker m-0 text-[0.68rem] uppercase tracking-widest">Paso 2 pendiente</p>
            <h3 className="m-0 text-[1rem] leading-none text-(--text-main)">Terminá de clasificar todas las cartas</h3>
            <p className="app-muted m-0 text-[0.8rem] leading-[1.16]">
              {missingOriginCount > 0
                ? 'Hay cartas sin origen.'
                : missingRoleCount > 0
                  ? 'Hay cartas sin roles.'
                  : pendingReviewCount > 0
                    ? 'Hay cartas pendientes de revision.'
                    : `Faltan ${formatInteger(unclassifiedCardCount)} cartas por cerrar.`}
            </p>
          </div>
        </section>
      ) : (
        <div className="grid min-h-0 content-start gap-3">
          <DeckQualityHero
            activePatternCount={activePatternCount}
            deckSummary={deckSummary}
            feedback={kpiFeedback}
          />

          {result.issues.length > 0 ? (
            <div className="grid gap-1.5">
              {result.issues.map((issue, index) => (
                <p
                  key={`${issue.level}-${index}`}
                  className={[
                    'm-0 px-3 py-2 text-[0.78rem] leading-[1.16]',
                    issue.level === 'error'
                      ? 'surface-card-danger text-(--destructive)'
                      : 'surface-card-warning text-(--warning)',
                  ].join(' ')}
                >
                  {issue.message}
                </p>
              ))}
            </div>
          ) : null}

          <KeyInsightsSummary
            highlightedPatternId={highlightedPatternId}
            onHighlightPattern={setHighlightedPatternId}
            risks={risks}
            strengths={strengths}
          />

          <CausalChecksList
            highlightedPatternId={highlightedPatternId}
            onEditPattern={handleEditPattern}
            onHighlightPattern={setHighlightedPatternId}
            openingEntries={openingEntries}
            problemEntries={problemEntries}
            recentlyChangedPatternId={recentlyChangedPatternId}
          />

          <section className="surface-panel-soft grid gap-2.5 p-3">
            <div className="grid gap-0.5">
              <p className="app-kicker m-0 text-[0.68rem] uppercase tracking-widest">Ajustar analisis</p>
              <h3 className="m-0 text-[1rem] leading-none text-(--text-main)">Que queres cambiar</h3>
              <p className="app-muted m-0 text-[0.78rem] leading-[1.16]">
                Suma un chequeo recomendado o crea uno propio para ver el impacto en el KPI.
              </p>
            </div>

            <div className="flex flex-wrap gap-2">
              <Button variant="primary" size="sm" onClick={handleOpenQuickAdd}>
                Agregar chequeo recomendado
              </Button>
              <Button variant="secondary" size="sm" onClick={handleOpenCustomCreate}>
                Crear chequeo propio
              </Button>
            </div>
          </section>

          <section className="surface-panel-soft grid gap-2 p-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="grid gap-0.5">
                <p className="app-kicker m-0 text-[0.68rem] uppercase tracking-widest">Profundizar</p>
                <strong className="text-[0.92rem] text-(--text-main)">Ver detalle completo de aperturas y problemas</strong>
              </div>

              <Button
                variant="secondary"
                size="sm"
                onClick={() => setResultsDetailOpen((current) => !current)}
              >
                {resultsDetailOpen ? 'Ocultar detalle' : 'Ver detalle'}
              </Button>
            </div>
          </section>

          <ResultsDetailPanel
            isOpen={resultsDetailOpen}
            onClose={() => setResultsDetailOpen(false)}
            openingEntries={openingEntries}
            problemEntries={problemEntries}
          />
        </div>
      )}

      <PatternEditorDrawer
        actions={trackedPatternActions}
        availablePresets={availablePresets}
        currentImpactLabel={currentImpactLabel}
        derivedMainCards={derivedMainCards}
        drawerMode={drawerMode}
        feedbackLabel={drawerFeedbackLabel}
        isPendingCreation={selectedPatternId === pendingCreatedPatternId}
        onClose={handleCloseDrawer}
        onCreateCustom={handleOpenCustomCreate}
        onRequestDelete={setPendingDeletePatternId}
        onSelectPreset={(preset) => handleSelectPreset(preset.id)}
        pattern={selectedPattern}
        patterns={patterns}
      />

      {practiceOpen ? (
        <div className="fixed inset-0 z-140 grid place-items-center bg-[rgb(var(--background-rgb)/0.76)] px-3 py-4">
          <button
            type="button"
            aria-label="Cerrar practica"
            className="absolute inset-0 h-full w-full"
            onClick={() => setPracticeOpen(false)}
          />

          <div className="surface-panel relative grid h-[min(92vh,980px)] w-full max-w-[78rem] grid-rows-[auto_minmax(0,1fr)] gap-0 overflow-hidden p-0">
            <div className="flex items-center justify-between gap-2 border-b border-(--border-subtle) px-4 py-3">
              <div className="grid gap-0.5">
                <strong className="text-[0.98rem] text-(--text-main)">Practica</strong>
                <span className="app-muted text-[0.74rem]">Proba manos sin salir del analisis principal.</span>
              </div>
              <button
                type="button"
                className="app-icon-button text-[1rem] leading-none"
                aria-label="Cerrar practica"
                onClick={() => setPracticeOpen(false)}
              >
                ×
              </button>
            </div>

            <div className="min-h-0 overflow-y-auto p-4">
              <PracticeSection
                handSize={handSize}
                derivedMainCards={derivedMainCards}
                patterns={activePatterns}
                hasCompletedClassification={hasCompletedClassification}
                missingOriginCount={missingOriginCount}
                missingRoleCount={missingRoleCount}
                pendingReviewCount={pendingReviewCount}
                reviewPendingPatternCount={reviewPendingPatternCount}
              />
            </div>
          </div>
        </div>
      ) : null}

      <ConfirmDialog
        confirmLabel="Eliminar chequeo"
        description="Se va a quitar este chequeo del analisis y el resultado se recalculara en el momento."
        isOpen={pendingDeletePatternId !== null}
        onCancel={() => setPendingDeletePatternId(null)}
        onConfirm={handleConfirmDelete}
        title="Eliminar chequeo"
      />
    </article>
  )
}

function buildKpiFeedback(
  previousProbability: number | null,
  currentProbability: number | null,
): KpiFeedbackState | null {
  if (previousProbability === null || currentProbability === null) {
    return null
  }

  const delta = currentProbability - previousProbability

  if (Math.abs(delta) < 0.0005) {
    return {
      label: 'Sin impacto visible',
      tone: 'neutral',
    }
  }

  const deltaLabel = `${delta > 0 ? '+' : ''}${(delta * 100).toFixed(1)} pp`

  return {
    label: deltaLabel,
    tone: delta > 0 ? 'positive' : 'negative',
  }
}
