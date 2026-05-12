import { startTransition, useDeferredValue, useEffect, useMemo, useRef, useState } from 'react'

import { buildCalculatorState } from '../app/calculator-state'
import { getDeckModelStatus } from '../app/deck-model-status'
import type { DeckCardInstance } from '../app/model'
import { useToastMessage } from '../app/use-toast-message'
import type { DerivedDeckGroup } from '../app/deck-groups'
import { curatePatterns } from '../app/pattern-curation'
import { AUTO_BASE_PRESET_IDS, buildPatternPresets } from '../app/pattern-presets'
import {
  hasAsymmetricRules as hasAsymmetricRulesFn,
  selectPatternsForView,
} from '../app/turn-context'
import {
  countCardsMissingOrigin,
  countCardsMissingRoles,
  countCardsPendingReview,
  countUnclassifiedCards,
  isClassificationStepComplete,
} from '../app/role-step'
import { formatInteger } from '../app/utils'
import { calculateProbabilities } from '../probability'
import type {
  ApiCardReference,
  CalculationOutput,
  CalculationSummary,
  CardEntry,
  HandPattern,
  TurnView,
} from '../types'
import { KpiDetailModal } from './comparison/KpiDetailModal'
import type { KpiRole } from './comparison/kpi-detail-helpers'
import { DeckModelStatusBadge } from './DeckModelStatusBadge'
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
import type { ProbabilityCausalEntry } from './probability/probability-lab-helpers'
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

// Module-level cache for probability calculations so results survive unmount/remount
// when navigating between workflow steps.
interface CalculationCache {
  key: string
  results: Record<TurnView, CalculationOutput>
}

let _calculationCache: CalculationCache | null = null

function buildCacheKey(
  checks: HandPattern[],
  cards: CardEntry[],
  handSize: number,
  hasAsymmetric: boolean,
): string {
  // Use a lightweight fingerprint: pattern ids + condition count + card ids/copies + handSize
  const patternPart = checks.map((p) => `${p.id}:${p.conditions.length}`).join(',')
  const cardPart = cards.map((c) => `${c.id}:${c.copies}:${c.roles.join('.')}`).join(',')
  return `${patternPart}|${cardPart}|${handSize}|${hasAsymmetric}`
}

function getCachedResults(key: string): Record<TurnView, CalculationOutput> | null {
  if (_calculationCache && _calculationCache.key === key) {
    return _calculationCache.results
  }
  return null
}

function setCachedResults(key: string, results: Record<TurnView, CalculationOutput>): void {
  _calculationCache = { key, results }
}

export function ProbabilityPanel({
  handSize,
  patterns,
  derivedMainCards,
  derivedGroups,
  patternActions,
  isEditingDeck,
}: ProbabilityPanelProps) {
  // Skip the skeleton entirely if we already have cached calculation results
  // (i.e. user navigated away and came back without changing the deck).
  const hasCachedData = _calculationCache !== null
  const [isReady, setIsReady] = useState(hasCachedData)

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
  const modelStatus = useMemo(
    () => getDeckModelStatus(derivedMainCards, activePatterns),
    [derivedMainCards, activePatterns],
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
    () => {
      const calculablePatterns = activePatterns.filter((pattern) =>
        pattern.conditions.some((condition) => condition.matcher !== null),
      )

      // The 3 universal rules (readinessPatterns) are ALWAYS included.
      // User patterns are merged on top. buildDeterministicCheckSet deduplicates by definition key.
      return buildDeterministicCheckSet([...readinessPatterns, ...calculablePatterns])
    },
    [activePatterns, readinessPatterns],
  )
  // Defer the heavy calculation input so the UI (RuleBuilder, conditions list)
  // updates immediately while the KPI recalculates in the background.
  const deferredAllChecks = useDeferredValue(allChecks)
  const isUsingActiveChecks = activePatterns.filter((pattern) =>
    pattern.conditions.some((condition) => condition.matcher !== null),
  ).length > 0
  const [activeTurnView, setActiveTurnView] = useState<TurnView>('average')
  const hasAsymmetricRules = useMemo(
    () => hasAsymmetricRulesFn(activePatterns),
    [activePatterns],
  )
  // Pre-compute results for all three views once when deck/patterns change.
  // Switching the toggle then just picks from cache — no recalculation.
  // Uses deferredAllChecks so the UI stays responsive during edits.
  // Module-level cache ensures results survive unmount/remount on step navigation.
  const cachedResults = useMemo<Record<TurnView, CalculationOutput>>(() => {
    if (isEditingDeck || !hasCompletedClassification || deferredAllChecks.length === 0) {
      return {
        first: IDLE_CALCULATION_RESULT,
        second: IDLE_CALCULATION_RESULT,
        average: IDLE_CALCULATION_RESULT,
      }
    }

    const cacheKey = buildCacheKey(deferredAllChecks, derivedMainCards, handSize, hasAsymmetricRules)
    const cached = getCachedResults(cacheKey)
    if (cached) {
      return cached
    }

    const deckSize = derivedMainCards.reduce((sum, card) => sum + card.copies, 0)

    // Going first: base handSize, first+either patterns
    const firstPatterns = selectPatternsForView(deferredAllChecks, 'first')
    const firstResult = calculateProbabilities(
      buildCalculatorState(derivedMainCards, { handSize, patterns: firstPatterns }),
    )

    // Going second: handSize + 1, second+either patterns
    const secondPatterns = selectPatternsForView(deferredAllChecks, 'second')
    const secondResult = calculateProbabilities(
      buildCalculatorState(derivedMainCards, { handSize: handSize + 1, patterns: secondPatterns }),
    )

    // Average: blend or short-circuit
    let averageResult: CalculationOutput
    if (!hasAsymmetricRules) {
      // All patterns are 'either' — single calculation with base handSize (backward compat)
      averageResult = calculateProbabilities(
        buildCalculatorState(derivedMainCards, { handSize, patterns: deferredAllChecks }),
      )
    } else {
      // Blend first + second sub-views
      const summaryFirst = firstResult.summary
      const summarySecond = secondResult.summary
      if (!summaryFirst || !summarySecond) {
        averageResult = IDLE_CALCULATION_RESULT
      } else {
        const cleanFirst = Math.max(0, summaryFirst.goodHands - summaryFirst.overlapHands)
        const cleanSecond = Math.max(0, summarySecond.goodHands - summarySecond.overlapHands)
        const probFirst = summaryFirst.totalHands > 0 ? cleanFirst / summaryFirst.totalHands : 0
        const probSecond = summarySecond.totalHands > 0 ? cleanSecond / summarySecond.totalHands : 0
        const cleanProbability = (probFirst + probSecond) / 2
        const totalHands = summaryFirst.totalHands
        const cleanHands = Math.round(cleanProbability * totalHands)

        // Merge patternResults
        const merged = new Map<string, typeof summaryFirst.patternResults[number]>()
        for (const r of summaryFirst.patternResults) merged.set(r.patternId, r)
        for (const r of summarySecond.patternResults) { if (!merged.has(r.patternId)) merged.set(r.patternId, r) }

        const syntheticSummary: CalculationSummary = {
          ...summaryFirst,
          goodHands: cleanHands,
          overlapHands: 0,
          overlapProbability: 0,
          totalHands,
          patternResults: Array.from(merged.values()),
        }
        averageResult = { issues: [], blockingIssues: [], summary: syntheticSummary }
      }
    }

    const results = { first: firstResult, second: secondResult, average: averageResult }
    setCachedResults(cacheKey, results)
    return results
  }, [
    deferredAllChecks,
    derivedMainCards,
    handSize,
    hasAsymmetricRules,
    hasCompletedClassification,
    isEditingDeck,
  ])

  // Switching the toggle is now instant — just picks from the pre-computed cache.
  const result = cachedResults[activeTurnView]
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
    detailOpeningEntries: rawDetailOpeningEntries,
    detailProblemEntries: rawDetailProblemEntries,
  } = checkPipeline
  // In single-view modes ('first' | 'second'), hide per-rule cards whose
  // pattern does not contribute to that turn. 'average' shows every rule
  // regardless of context so users can still inspect asymmetric rules.
  const detailOpeningEntries = useMemo(
    () => filterEntriesForView(rawDetailOpeningEntries, activeTurnView),
    [rawDetailOpeningEntries, activeTurnView],
  )
  const detailProblemEntries = useMemo(
    () => filterEntriesForView(rawDetailProblemEntries, activeTurnView),
    [rawDetailProblemEntries, activeTurnView],
  )
  const [drawerMode, setDrawerMode] = useState<DrawerMode | null>(null)
  const [selectedPatternId, setSelectedPatternId] = useState<string | null>(null)
  const [pendingCreatedPatternId, setPendingCreatedPatternId] = useState<string | null>(null)
  const [practiceOpen, setPracticeOpen] = useState(false)
  const [isAnalysisEditMode, setIsAnalysisEditMode] = useState(false)
  const [pendingDeletePatternId, setPendingDeletePatternId] = useState<string | null>(null)
  const [kpiModalRole, setKpiModalRole] = useState<KpiRole | null>(null)
  const [highlightedPatternId, setHighlightedPatternId] = useState<string | null>(null)
  const [recentlyChangedPatternId, setRecentlyChangedPatternId] = useState<string | null>(null)
  const [kpiFeedback, setKpiFeedback] = useState<KpiFeedbackState | null>(null)
  const { showToast } = useToastMessage()
  const selectedPattern = useMemo(
    () => patterns.find((pattern) => pattern.id === selectedPatternId) ?? allChecks.find((check) => check.id === selectedPatternId) ?? null,
    [patterns, allChecks, selectedPatternId],
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
  const justCreatedPatternIdRef = useRef<string | null>(null)

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
      setPatternTurnContext(patternId, value) {
        pendingFeedbackRef.current = { patternId, skip: false }
        patternActions.setPatternTurnContext(patternId, value)
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
    if (!selectedPatternId || patterns.some((pattern) => pattern.id === selectedPatternId) || allChecks.some((check) => check.id === selectedPatternId)) {
      if (justCreatedPatternIdRef.current && patterns.some((pattern) => pattern.id === justCreatedPatternIdRef.current)) {
        justCreatedPatternIdRef.current = null
      }
      return
    }

    if (pendingCreatedPatternId && selectedPatternId === pendingCreatedPatternId) {
      return
    }

    if (justCreatedPatternIdRef.current && selectedPatternId === justCreatedPatternIdRef.current) {
      return
    }

    setSelectedPatternId(null)
    setDrawerMode((current) => (current === 'quick-add' ? current : null))
  }, [patterns, pendingCreatedPatternId, selectedPatternId])

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
    if (pendingCreatedPatternId && patterns.some((pattern) => pattern.id === pendingCreatedPatternId)) {
      setSelectedPatternId(pendingCreatedPatternId)
      setDrawerMode('custom-create')
      return
    }

    pendingFeedbackRef.current = { patternId: null, skip: true }
    const patternId = patternActions.addPattern('opening')

    justCreatedPatternIdRef.current = patternId
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
  }

  const handleCloseDrawer = () => {
    if (pendingCreatedPatternId && pendingCreatedPatternId === selectedPatternId) {
      const pendingPattern = patterns.find((pattern) => pattern.id === pendingCreatedPatternId)

      if (pendingPattern && pendingPattern.name.trim().length === 0) {
        pendingFeedbackRef.current = { patternId: null, skip: true }
        patternActions.removePattern(pendingCreatedPatternId)
        showToast('Regla vacía descartada')
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
        title="Entendé qué tan jugable es tu deck y qué lo está causando"
        description="KPI, fortalezas, riesgos y práctica de manos."
        variant="compact"
        side={<DeckModelStatusBadge modelStatus={modelStatus} variant="compact" />}
        sideVariant="inline"
      />

      {isEmptyDeckState ? (
        <section className="surface-panel-strong grid gap-2.5 px-4 py-4">
          <div className="grid gap-1">
            <p className="app-kicker m-0 text-[0.68rem] uppercase tracking-widest">Antes de medir</p>
            <h3 className="m-0 text-[1rem] leading-none text-(--text-main)">Carga el Main Deck primero</h3>
            <p className="app-muted m-0 text-[0.8rem] leading-[1.16]">
              Cuando tengas cartas en el Main Deck, este panel te va a mostrar el KPI principal, las causas y las reglas activas.
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
            deckSummary={deckSummary}
            feedback={kpiFeedback}
            isEditMode={isAnalysisEditMode}
            onEditPattern={handleEditPattern}
            onToggleEditMode={() => setIsAnalysisEditMode((prev) => !prev)}
            onOpenQuickAdd={handleOpenQuickAdd}
            onOpenCustomCreate={handleOpenCustomCreate}
            openingEntries={detailOpeningEntries}
            problemEntries={detailProblemEntries}
            pieChart={
              hasCompletedClassification
                ? <KpiDonutChart derivedCards={derivedMainCards} onSegmentClick={setKpiModalRole} />
                : undefined
            }
            activeTurnView={activeTurnView}
            onChangeTurnView={setActiveTurnView}
            hasAsymmetricRules={hasAsymmetricRules}
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
        probability={selectedPatternProbability}
      />

      {practiceOpen ? (
        <div className="fixed inset-0 z-140 grid place-items-center bg-[rgb(var(--background-rgb)/0.76)] px-3 py-4">
          <button
            type="button"
            aria-label="Cerrar práctica"
            className="absolute inset-0 h-full w-full cursor-default"
            onClick={() => setPracticeOpen(false)}
          />

          <div className="surface-panel app-dialog-enter relative grid h-[min(88vh,820px)] w-full max-w-312 min-w-0 grid-rows-[auto_minmax(0,1fr)] gap-0 overflow-hidden p-0">
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
                onRedraw={() => {}}
              />
            </div>
          </div>
        </div>
      ) : null}

      <ConfirmDialog
        confirmLabel="Eliminar regla"
        description="Se va a quitar esta regla del análisis y el resultado se recalculará en el momento."
        isOpen={pendingDeletePatternId !== null}
        onCancel={() => setPendingDeletePatternId(null)}
        onConfirm={handleConfirmDelete}
        title="Eliminar regla"
      />

      {kpiModalRole !== null ? (
        <KpiDetailModal
          isOpen
          role={kpiModalRole}
          side="A"
          mainDeck={cardEntriesToDeckInstances(derivedMainCards)}
          onCardClick={() => setKpiModalRole(null)}
          onClose={() => setKpiModalRole(null)}
        />
      ) : null}
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
    return null
  }

  const deltaLabel = `${delta > 0 ? '+' : ''}${(delta * 100).toFixed(1)} pp`

  return {
    label: deltaLabel,
    tone: delta > 0 ? 'positive' : 'negative',
  }
}

/**
 * Hide per-rule cards whose source pattern does not contribute to the active
 * turn view. `'average'` passes every entry through; `'first'` and `'second'`
 * drop entries whose pattern is scoped to the opposite turn.
 */
function filterEntriesForView(
  entries: ProbabilityCausalEntry[],
  view: TurnView,
): ProbabilityCausalEntry[] {
  if (view === 'average') {
    return entries
  }

  return entries.filter((entry) => entry.turnContext === view || entry.turnContext === 'either')
}

// ── KPI Donut Chart (same style as ComparisonScreen) ──

const KPI_DONUT_COLORS: { role: KpiRole; color: string; rgb: string; label: string }[] = [
  { role: 'starter', label: 'Starters', color: 'rgb(0, 255, 163)', rgb: '0, 255, 163' },
  { role: 'extender', label: 'Extenders', color: 'rgb(168, 85, 247)', rgb: '168, 85, 247' },
  { role: 'handtrap', label: 'Handtraps', color: 'rgb(59, 130, 246)', rgb: '59, 130, 246' },
  { role: 'brick', label: 'Bricks', color: 'rgb(239, 68, 68)', rgb: '239, 68, 68' },
  { role: 'boardbreaker', label: 'Boardbreakers', color: 'rgb(245, 158, 11)', rgb: '245, 158, 11' },
]

function describeDonutRing(cx: number, cy: number, r: number, startAngle: number, endAngle: number, thickness: number): string {
  const rad = (deg: number) => (deg * Math.PI) / 180
  const rO = r, rI = r - thickness
  const x1o = cx + rO * Math.cos(rad(startAngle)), y1o = cy + rO * Math.sin(rad(startAngle))
  const x2o = cx + rO * Math.cos(rad(endAngle)), y2o = cy + rO * Math.sin(rad(endAngle))
  const x1i = cx + rI * Math.cos(rad(endAngle)), y1i = cy + rI * Math.sin(rad(endAngle))
  const x2i = cx + rI * Math.cos(rad(startAngle)), y2i = cy + rI * Math.sin(rad(startAngle))
  const la = endAngle - startAngle > 180 ? 1 : 0
  return `M ${x1o} ${y1o} A ${rO} ${rO} 0 ${la} 1 ${x2o} ${y2o} L ${x1i} ${y1i} A ${rI} ${rI} 0 ${la} 0 ${x2i} ${y2i} Z`
}

function KpiDonutChart({
  derivedCards,
  onSegmentClick,
}: {
  derivedCards: CardEntry[]
  onSegmentClick: (role: KpiRole) => void
}) {
  let starters = 0, extenders = 0, handtraps = 0, bricks = 0, boardbreakers = 0
  for (const c of derivedCards) {
    for (const r of c.roles) {
      if (r === 'starter') starters += c.copies
      if (r === 'extender') extenders += c.copies
      if (r === 'handtrap') handtraps += c.copies
      if (r === 'brick' || r === 'garnet') bricks += c.copies
      if (r === 'boardbreaker') boardbreakers += c.copies
    }
  }

  const data = KPI_DONUT_COLORS.map((seg) => ({
    ...seg,
    count: seg.role === 'starter' ? starters : seg.role === 'extender' ? extenders : seg.role === 'handtrap' ? handtraps : seg.role === 'brick' ? bricks : boardbreakers,
  })).filter((d) => d.count > 0)

  if (data.length === 0) return null

  const segmentTotal = data.reduce((s, d) => s + d.count, 0)
  const cx = 50, cy = 50, r = 46, innerR = 20
  const filterId = 'prob-pie-glow'

  let currentAngle = -90
  const segments = data.map((d) => {
    const angle = (d.count / segmentTotal) * 360
    const pct = segmentTotal > 0 ? Math.round((d.count / segmentTotal) * 100) : 0
    const seg = { ...d, startAngle: currentAngle, endAngle: currentAngle + angle, pct }
    currentAngle += angle
    return seg
  })

  return (
    <svg viewBox="0 0 100 100" className="block w-full max-w-[100px] aspect-square" role="img" aria-label="Distribución de roles">
      <defs>
        <filter id={filterId}>
          <feGaussianBlur stdDeviation="2.5" result="blur" />
          <feMerge><feMergeNode in="blur" /><feMergeNode in="SourceGraphic" /></feMerge>
        </filter>
      </defs>
      {segments.map((seg, i) => {
        const angleDiff = seg.endAngle - seg.startAngle
        const tooltip = `${seg.label}: ${formatInteger(seg.count)}`
        if (angleDiff >= 359.99) {
          return (
            <circle
              key={i}
              cx={cx}
              cy={cy}
              r={(r + innerR) / 2}
              fill="none"
              stroke={seg.color}
              strokeWidth={r - innerR}
              strokeOpacity="0.75"
              filter={`url(#${filterId})`}
              className="cursor-pointer transition-all hover:[stroke-opacity:1]"
              onClick={() => onSegmentClick(seg.role)}
            >
              <title>{tooltip}</title>
            </circle>
          )
        }
        return (
          <path
            key={i}
            d={describeDonutRing(cx, cy, r, seg.startAngle, seg.endAngle, r - innerR)}
            fill={seg.color}
            fillOpacity="0.75"
            filter={`url(#${filterId})`}
            className="cursor-pointer transition-all hover:[fill-opacity:1]"
            onClick={() => onSegmentClick(seg.role)}
          >
            <title>{tooltip}</title>
          </path>
        )
      })}
      <circle cx={cx} cy={cy} r={innerR} fill="rgb(var(--background-rgb))" fillOpacity="0.85" />
      {segments.map((seg, i) => {
        const angleDiff = seg.endAngle - seg.startAngle
        if (angleDiff < 15) return null
        const midAngle = seg.startAngle + angleDiff / 2
        const rad = (midAngle * Math.PI) / 180
        const labelR = (r + innerR) / 2
        const lx = cx + labelR * Math.cos(rad)
        const ly = cy + labelR * Math.sin(rad)
        const fontSize = angleDiff < 30 ? 5.5 : angleDiff < 60 ? 7 : 8
        return (
          <text key={`lbl-${i}`} x={lx} y={ly} textAnchor="middle" dominantBaseline="central" fill="white" fontSize={fontSize} fontWeight="700" style={{ pointerEvents: 'none', textShadow: '0 1px 3px rgba(0,0,0,0.6)' }}>
            {seg.pct}%
          </text>
        )
      })}
    </svg>
  )
}

function cardEntriesToDeckInstances(cards: CardEntry[]): DeckCardInstance[] {
  return cards.flatMap((card) => {
    const apiCard = card.apiCard ?? buildFallbackApiCard(card)

    return Array.from({ length: card.copies }, (_, index) => ({
      instanceId: `${card.id}-kpi-${index}`,
      name: card.name,
      apiCard,
      origin: card.origin,
      roles: card.roles,
      needsReview: card.needsReview,
    }))
  })
}

function buildFallbackApiCard(card: CardEntry): ApiCardReference {
  return {
    ygoprodeckId: fallbackCardId(card.id),
    cardType: '',
    frameType: '',
    description: null,
    race: null,
    attribute: null,
    level: null,
    linkValue: null,
    atk: null,
    def: null,
    archetype: null,
    ygoprodeckUrl: null,
    imageUrl: null,
    imageUrlSmall: null,
    banlist: {
      tcg: null,
      ocg: null,
      goat: null,
    },
    genesys: {
      points: null,
    },
  }
}

function fallbackCardId(id: string): number {
  let hash = 0

  for (let index = 0; index < id.length; index += 1) {
    hash = (hash * 31 + id.charCodeAt(index)) | 0
  }

  return hash < 0 ? hash : -Math.max(1, hash)
}
