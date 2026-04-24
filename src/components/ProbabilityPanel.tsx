import { startTransition, useEffect, useMemo, useRef, useState } from 'react'

import { buildCalculatorState } from '../app/calculator-state'
import type { DerivedDeckGroup } from '../app/deck-groups'
import { curatePatterns } from '../app/pattern-curation'
import { AUTO_BASE_PRESET_IDS, buildPatternPresets } from '../app/pattern-presets'
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
import { DeckQualityHero } from './probability/DeckQualityHero'
import { PatternEditorDrawer, formatDrawerImpactLabel } from './probability/PatternEditorDrawer'
import type { PatternEditorActions } from './probability/pattern-editor-actions'
import { PracticeSection } from './probability/PracticeSection'
import {
  buildDeterministicCheckSet,
  buildProbabilityCheckPipeline,
} from './probability/probability-lab-helpers'
import { Button } from './ui/Button'
import { CloseButton } from './ui/IconButton'
import { Skeleton } from './ui/Skeleton'

interface ProbabilityPanelProps {
  handSize: number
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

export function ProbabilityPanel({
  handSize,
  patterns,
  derivedMainCards,
  derivedGroups,
  patternActions,
  isEditingDeck,
}: ProbabilityPanelProps) {
  const [isReady, setIsReady] = useState(false)

  useEffect(() => {
    if (typeof window === 'undefined') {
      setIsReady(true)
      return
    }

    let frameA = 0
    let frameB = 0

    setIsReady(false)
    frameA = window.requestAnimationFrame(() => {
      frameB = window.requestAnimationFrame(() => {
        startTransition(() => {
          setIsReady(true)
        })
      })
    })

    return () => {
      window.cancelAnimationFrame(frameA)
      window.cancelAnimationFrame(frameB)
    }
  }, [])

  if (!isReady) {
    return <ProbabilityPanelSkeleton />
  }

  return (
    <ProbabilityPanelContent
      handSize={handSize}
      patterns={patterns}
      derivedMainCards={derivedMainCards}
      derivedGroups={derivedGroups}
      patternActions={patternActions}
      isEditingDeck={isEditingDeck}
    />
  )
}

function ProbabilityPanelContent({
  handSize,
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
  const activePatterns = useMemo(
    () => curatePatterns(patterns, derivedMainCards, { includeDefaults: false }),
    [derivedMainCards, patterns],
  )
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
  const readinessPresets = useMemo(
    () =>
      AUTO_BASE_PRESET_IDS.flatMap((presetId) => {
        const preset = presetById.get(presetId)
        return preset ? [preset] : []
      }),
    [presetById],
  )
  const readinessPatterns = useMemo(
    () => buildDeterministicCheckSet(readinessPresets.map((preset) => preset.pattern)),
    [readinessPresets],
  )
  const allChecks = useMemo(
    () => buildDeterministicCheckSet(activePatterns.length > 0 ? activePatterns : readinessPatterns),
    [activePatterns, readinessPatterns],
  )
  const isUsingActiveChecks = activePatterns.length > 0
  const result = useMemo(() => {
    if (isEditingDeck || !hasCompletedClassification || allChecks.length === 0) {
      return IDLE_CALCULATION_RESULT
    }

    return calculateProbabilities(
      buildCalculatorState(derivedMainCards, {
        handSize,
        patterns: allChecks,
      }),
    )
  }, [allChecks, derivedMainCards, handSize, hasCompletedClassification, isEditingDeck])
  const deckSummary = useMemo<DeckSummarySnapshot | null>(() => {
    const summary = result.summary

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
      basedOnActiveRules: isUsingActiveChecks,
    }
  }, [isUsingActiveChecks, result.summary])
  const checkPipeline = useMemo(
    () =>
      buildProbabilityCheckPipeline({
        allChecks,
        availablePresets,
        derivedMainCards,
        summary: result.summary,
      }),
    [allChecks, availablePresets, derivedMainCards, result.summary],
  )
  const {
    allChecks: allCheckEntries,
    detailOpeningEntries,
    detailProblemEntries,
  } = checkPipeline
  const [drawerMode, setDrawerMode] = useState<DrawerMode | null>(null)
  const [selectedPatternId, setSelectedPatternId] = useState<string | null>(null)
  const [pendingCreatedPatternId, setPendingCreatedPatternId] = useState<string | null>(null)
  const [practiceOpen, setPracticeOpen] = useState(false)
  const [isAnalysisEditMode, setIsAnalysisEditMode] = useState(false)
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
  const isEmptyDeckState = mainDeckCount === 0
  const isWaitingForRoleStep = !isEmptyDeckState && !hasCompletedClassification

  return (
    <article className="surface-panel deck-mobile-step-shell grid h-full min-h-0 gap-2.5 p-0 min-[1101px]:gap-3 min-[1101px]:p-3 min-[1240px]:grid-rows-[auto_minmax(0,1fr)]">
      <StepHero
        step="Probability Lab"
        title="Entende que tan jugable es tu deck y que lo esta causando"
        description="Mira el KPI, detecta las fortalezas y riesgos principales, y edita chequeos."
        side={(
          <Button variant="primary" size="sm" onClick={() => setPracticeOpen(true)}>
            Abrir práctica
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
            allCheckCount={allCheckEntries.length}
            deckSummary={deckSummary}
            feedback={kpiFeedback}
            isEditingEnabled={isAnalysisEditMode && isUsingActiveChecks}
            onEditPattern={handleEditPattern}
            openingEntries={detailOpeningEntries}
            problemEntries={detailProblemEntries}
          />

          {result.blockingIssues.length > 0 ? (
            <div className="grid gap-1.5">
              {result.blockingIssues.map((issue, index) => (
                <p
                  key={`${issue.level}-${index}`}
                  className={[
                    'm-0 px-3 py-2 text-[0.78rem] leading-[1.16]',
                    issue.level === 'error'
                      ? 'surface-card-danger text-destructive'
                      : 'surface-card-warning text-(--warning)',
                  ].join(' ')}
                >
                  {issue.message}
                </p>
              ))}
            </div>
          ) : null}

          <section className="surface-panel-soft grid gap-2.5 p-3">
            <div className="grid gap-0.5">
              <p className="app-kicker m-0 text-[0.68rem] uppercase tracking-widest">Acciones</p>
              <h3 className="m-0 text-[1rem] leading-none text-(--text-main)">
                {isAnalysisEditMode ? 'Modo edición activo' : 'Vista de análisis'}
              </h3>
              <p className="app-muted m-0 text-[0.78rem] leading-[1.16]">
                {isAnalysisEditMode
                  ? 'Ahora podés editar los checks directamente desde Calidad del deck o sumar nuevos sin salir del flujo principal.'
                  : 'Calidad del deck ya muestra el estado completo. Activá edición solo cuando quieras cambiar el análisis.'}
              </p>
            </div>

            <div className="flex flex-wrap gap-2">
              {isAnalysisEditMode ? (
                <>
                  <Button variant="primary" size="sm" onClick={handleOpenQuickAdd}>
                    Agregar chequeo recomendado
                  </Button>
                  <Button variant="primary" size="sm" onClick={handleOpenCustomCreate}>
                    Crear chequeo propio
                  </Button>
                  <Button variant="primary" size="sm" onClick={() => setIsAnalysisEditMode(false)}>
                    Cerrar edición
                  </Button>
                </>
              ) : (
                <Button variant="primary" size="sm" onClick={() => setIsAnalysisEditMode(true)}>
                  Editar análisis
                </Button>
              )}
            </div>
          </section>
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
            aria-label="Cerrar práctica"
            className="absolute inset-0 h-full w-full"
            onClick={() => setPracticeOpen(false)}
          />

          <div className="surface-panel relative grid h-[min(92vh,980px)] w-full max-w-312 min-w-0 grid-rows-[auto_minmax(0,1fr)] gap-0 overflow-hidden p-0">
            <div className="flex min-w-0 items-center justify-between gap-2 border-b border-(--border-subtle) px-4 py-3">
              <div className="grid min-w-0 gap-0.5">
                <strong className="text-[0.98rem] text-(--text-main)">Práctica</strong>
                <span className="app-muted text-[0.74rem]">Proba manos sin salir del analisis principal.</span>
              </div>
              <CloseButton
                size="sm"
                aria-label="Cerrar práctica"
                onClick={() => setPracticeOpen(false)}
              />
            </div>

            <div className="min-h-0 min-w-0 overflow-x-hidden overflow-y-auto p-4">
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

function ProbabilityPanelSkeleton() {
  return (
    <article className="surface-panel deck-mobile-step-shell grid h-full min-h-0 gap-2.5 p-0 min-[1101px]:gap-3 min-[1101px]:p-3 min-[1240px]:grid-rows-[auto_minmax(0,1fr)]">
      <section className="step-hero grid gap-2.5 p-2.5">
        <div className="grid items-start gap-2.5 min-[1101px]:grid-cols-[minmax(0,1fr)_auto]">
          <div className="grid gap-2">
            <Skeleton radius="none" className="h-3 w-24" />
            <Skeleton radius="none" className="h-8 max-w-full w-[20rem]" />
            <div className="grid gap-1.5">
              <Skeleton radius="none" className="h-4 max-w-full w-[95%]" />
              <Skeleton radius="none" className="h-4 max-w-full w-[72%]" />
            </div>
          </div>
          <Skeleton className="h-10 w-32 max-[1100px]:justify-self-start" />
        </div>
      </section>

      <div className="grid min-h-0 content-start gap-3">
        <section className="surface-panel-strong grid gap-3 px-4 py-4">
          <div className="grid gap-1.5">
            <Skeleton radius="none" className="h-3 w-28" />
            <Skeleton radius="none" className="h-8 max-w-full w-60" />
            <div className="grid gap-1.5">
              <Skeleton radius="none" className="h-4 max-w-full w-[96%]" />
              <Skeleton radius="none" className="h-4 max-w-full w-[68%]" />
            </div>
          </div>

          <div className="grid gap-2">
            <Skeleton radius="none" className="h-14 w-44 max-w-full" />
            <Skeleton radius="none" className="h-4 w-64 max-w-full" />
          </div>

          <div className="surface-panel-soft grid gap-1.5 px-3 py-2.5">
            <Skeleton radius="none" className="h-4 w-full" />
            <Skeleton radius="none" className="h-4 w-[82%]" />
          </div>

          <div className="grid gap-2.5 min-[980px]:grid-cols-2">
            <div className="grid gap-1.5">
              <Skeleton radius="none" className="h-4 w-28" />
              <Skeleton radius="panel" className="h-[6.4rem] w-full" />
              <Skeleton radius="panel" className="h-[6.4rem] w-full" />
            </div>
            <div className="grid gap-1.5">
              <Skeleton radius="none" className="h-4 w-24" />
              <Skeleton radius="panel" className="h-[6.4rem] w-full" />
              <Skeleton radius="panel" className="h-[6.4rem] w-full" />
            </div>
          </div>
        </section>

        <section className="surface-panel-soft grid gap-2.5 p-3">
          <div className="grid gap-2">
            <Skeleton radius="none" className="h-3 w-20" />
            <Skeleton radius="none" className="h-7 max-w-full w-52" />
            <div className="grid gap-1.5">
              <Skeleton radius="none" className="h-4 max-w-full w-[96%]" />
              <Skeleton radius="none" className="h-4 max-w-full w-[74%]" />
            </div>
          </div>
          <div className="flex flex-wrap gap-2">
            <Skeleton className="h-9 w-40 max-w-full" />
            <Skeleton className="h-9 w-36 max-w-full" />
            <Skeleton className="h-9 w-28 max-w-full" />
          </div>
        </section>
      </div>
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
