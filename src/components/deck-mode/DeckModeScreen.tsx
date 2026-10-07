import { Suspense, useCallback, useEffect, useMemo, useRef, useState } from 'react'

import { DESKTOP_DECK_BUILDER_MEDIA_QUERY, useMediaQuery } from '../../app/use-media-query'
import { countUnclassifiedCards, countCardsMissingOrigin, countCardsMissingRoles, countCardsPendingReview, isClassificationStepComplete } from '../../app/role-step'
import { curatePatterns } from '../../app/pattern-curation'
import { buildActiveRuleSet } from '../../app/pattern-presets'
import { CardDetailModal } from '../card-detail/CardDetailModal'
import { DeckBuilderStep } from './DeckBuilderStep'
import { cx } from '../ui/cx'
import { DraggableFab } from '../ui/DraggableFab'
import { Modal } from '../ui/Modal'
import { DeckModeDragOverlay } from './DeckModeDragOverlay'
import {
  buildDeckWorkflowNavigationItems,
  type DeckWorkflowStepKey,
  isDeckWorkflowStepKey,
} from './deck-workflow-navigation'
import { DeckModeNavigation } from './DeckModeNavigation'
import { MobileBottomStepNav } from './MobileBottomStepNav'
import { DeckModeShell } from './DeckModeShell'
import {
  LazyComparisonScreen,
  LazyDeckRolesPanel,
  LazyExportDeckPanel,
  LazyPracticeSection,
  LazyProbabilityPanel,
  preloadHeavySteps,
} from './lazy-steps'
import { useLabPrewarm } from '../probability/use-lab-prewarm'
import { useDeckModeController } from './use-deck-mode-controller'

const REDUCED_MOTION_MEDIA_QUERY = '(prefers-reduced-motion: reduce)'
const WORKFLOW_STEP_ORDER: DeckWorkflowStepKey[] = [
  'deck-builder',
  'categorization',
  'probability-lab',
  'workspace',
  'export',
]

type StepNavigationDirection = 'forward' | 'back'

function getStepFromHash(hash: string): DeckWorkflowStepKey | null {
  const normalizedHash = hash.replace(/^#/, '')

  return isDeckWorkflowStepKey(normalizedHash) ? normalizedHash : null
}

function getRecommendedStep(
  mainDeckCount: number,
  hasCompletedRoleStep: boolean,
  patternCount: number,
): DeckWorkflowStepKey {
  if (mainDeckCount < 40) {
    return 'deck-builder'
  }

  if (!hasCompletedRoleStep) {
    return 'categorization'
  }

  if (patternCount === 0) {
    return 'probability-lab'
  }

  return 'export'
}

function getStepDirection(
  currentStep: DeckWorkflowStepKey,
  nextStep: DeckWorkflowStepKey,
): StepNavigationDirection {
  const currentIndex = WORKFLOW_STEP_ORDER.indexOf(currentStep)
  const nextIndex = WORKFLOW_STEP_ORDER.indexOf(nextStep)

  return nextIndex >= currentIndex ? 'forward' : 'back'
}

function shouldReduceMotion(): boolean {
  return (
    typeof window !== 'undefined' &&
    typeof window.matchMedia === 'function' &&
    window.matchMedia(REDUCED_MOTION_MEDIA_QUERY).matches
  )
}

export function DeckModeScreen() {
  const controller = useDeckModeController()
  const isDesktopDeckBuilder = useMediaQuery(DESKTOP_DECK_BUILDER_MEDIA_QUERY)
  const mainDeckCount = controller.deckBuilderStep.deckBuilder.main.length
  const roleCards = controller.roles.cards
  const unclassifiedCardCount = useMemo(() => countUnclassifiedCards(roleCards), [roleCards])
  const classifiedCardCount = roleCards.length - unclassifiedCardCount
  const hasCompletedRoleStep = useMemo(() => isClassificationStepComplete(roleCards), [roleCards])
  const patternCount = controller.probability.patterns.length
  const [globalPracticeOpen, setGlobalPracticeOpen] = useState(false)
  const recommendedStep = useMemo(
    () => getRecommendedStep(mainDeckCount, hasCompletedRoleStep, patternCount),
    [hasCompletedRoleStep, mainDeckCount, patternCount],
  )
  const [activeStep, setActiveStep] = useState<DeckWorkflowStepKey>(() => {
    if (typeof window === 'undefined') {
      return recommendedStep
    }

    return getStepFromHash(window.location.hash) ?? recommendedStep
  })
  const isDeckBuilderStep = activeStep === 'deck-builder'
  const isCategorizationStep = activeStep === 'categorization'
  // Con el deck quieto se deja calculado el Lab de fondo: al abrirlo el resultado ya está.
  useLabPrewarm({ ...controller.probability, enabled: activeStep !== 'probability-lab' })
  const contentScrollRef = useRef<HTMLDivElement>(null)
  const activeStepRef = useRef(activeStep)
  const [stepDirection, setStepDirection] = useState<StepNavigationDirection>('forward')

  useEffect(() => {
    activeStepRef.current = activeStep
  }, [activeStep])

  useEffect(() => {
    if (typeof window === 'undefined') {
      return
    }

    const handleHashChange = () => {
      const nextStep = getStepFromHash(window.location.hash)

      if (nextStep) {
        const currentStep = activeStepRef.current

        if (nextStep !== currentStep) {
          setStepDirection(getStepDirection(currentStep, nextStep))
        }

        setActiveStep(nextStep)
      }
    }

    window.addEventListener('hashchange', handleHashChange)

    return () => {
      window.removeEventListener('hashchange', handleHashChange)
    }
  }, [])

  useEffect(() => {
    if (typeof window === 'undefined') {
      return
    }

    const nextHash = `#${activeStep}`

    if (window.location.hash !== nextHash) {
      window.history.replaceState(null, '', nextHash)
    }
  }, [activeStep])

  useEffect(() => {
    contentScrollRef.current?.scrollTo({
      top: 0,
      behavior: shouldReduceMotion() ? 'auto' : 'smooth',
    })
  }, [activeStep])

  const handleStepChange = useCallback((nextStep: DeckWorkflowStepKey) => {
    const currentStep = activeStepRef.current

    if (nextStep === currentStep) {
      return
    }

    setStepDirection(getStepDirection(currentStep, nextStep))
    setActiveStep(nextStep)

    if (typeof window !== 'undefined') {
      window.scrollTo({ top: 0, behavior: shouldReduceMotion() ? 'auto' : 'smooth' })
    }
  }, [])
  const navigationItems = useMemo(
    () =>
      buildDeckWorkflowNavigationItems({
        mainDeckCount,
        roleCardCount: roleCards.length,
        classifiedCardCount,
        unclassifiedCardCount,
        hasCompletedRoleStep,
        patternCount,
      }),
    [
      classifiedCardCount,
      hasCompletedRoleStep,
      mainDeckCount,
      patternCount,
      roleCards.length,
      unclassifiedCardCount,
    ],
  )
  const deckBuilderStep = controller.deckBuilderStep
  const navigation = (
    <DeckModeNavigation
      items={navigationItems}
      activeStep={activeStep}
      onStepChange={handleStepChange}
    />
  )
  const mobileNavigation = (
    <MobileBottomStepNav
      items={navigationItems}
      activeStep={activeStep}
      onStepChange={handleStepChange}
    />
  )
  useEffect(() => {
    preloadHeavySteps()
  }, [])

  const stepContent = isDeckBuilderStep ? (
    <div id="deck-builder" className="h-full min-h-0">
      <DeckBuilderStep {...deckBuilderStep} />
    </div>
  ) : (
    <section
      className={cx(
        'grid content-start',
        isCategorizationStep ? 'h-full min-h-0' : 'min-h-full min-[1101px]:h-full min-[1101px]:min-h-0',
      )}
    >
      {activeStep === 'categorization' ? (
        <div id="categorization" className="h-full min-h-0 min-w-0">
          <LazyDeckRolesPanel {...controller.roles} />
        </div>
      ) : null}

      {activeStep === 'probability-lab' ? (
        <div id="probability-lab" className="min-w-0 min-[1101px]:min-h-full">
          <LazyProbabilityPanel {...controller.probability} />
        </div>
      ) : null}

      {activeStep === 'export' ? (
        <div id="export" className="min-w-0 min-[1101px]:min-h-full">
          <LazyExportDeckPanel {...controller.exportDeck} />
        </div>
      ) : null}

      {activeStep === 'workspace' ? (
        <div id="workspace" className="min-w-0 min-[1101px]:min-h-full">
          <LazyComparisonScreen />
        </div>
      ) : null}
    </section>
  )
  const mainContent = (
    <div
      key={activeStep}
      className={cx(
        'min-w-0 motion-reduce:animate-none',
        stepDirection === 'back' ? 'animate-step-back' : 'animate-step-forward',
        isDeckBuilderStep || isCategorizationStep ? 'h-full min-h-0' : 'min-h-full',
      )}
    >
      <Suspense fallback={null}>{stepContent}</Suspense>
    </div>
  )

  return (
    <>
      <DeckModeShell
        navigation={navigation}
        mobileNavigation={mobileNavigation}
        content={mainContent}
        contentScrollable={!isDeckBuilderStep}
        contentScrollRef={contentScrollRef}
      />

      <DeckModeDragOverlay
        overlay={controller.feedback.dragOverlay}
        overlayRef={controller.feedback.dragOverlayRef}
      />
      {!isDesktopDeckBuilder ? (
        <CardDetailModal
          card={controller.deckBuilderStep.selectedDetailCard}
          deckFormat={controller.deckBuilderStep.deckFormat}
          isOpen={controller.deckBuilderStep.isCardDetailOpen}
          showActions={controller.deckBuilderStep.selectedDetailSource !== 'deck'}
          deckCopy={controller.deckBuilderStep.selectedDeckCopyActions}
          onAddToZone={(zone) =>
            controller.deckBuilderStep.selectedDetailCard
              ? controller.deckBuilderStep.onAddSearchResultToZone(
                  controller.deckBuilderStep.selectedDetailCard.ygoprodeckId,
                  zone,
                )
              : false
          }
          onClose={controller.deckBuilderStep.onCloseCardDetail}
        />
      ) : null}

      {/* Global Practice FAB */}
      {mainDeckCount > 0 ? (
        <PracticeFab
          isOpen={globalPracticeOpen}
          onOpen={() => setGlobalPracticeOpen(true)}
          onClose={() => setGlobalPracticeOpen(false)}
          handSize={controller.probability.handSize}
          derivedMainCards={controller.probability.derivedMainCards}
          patterns={controller.probability.patterns}
          disabledGenericRuleIds={controller.probability.disabledGenericRuleIds}
          systemRuleNames={controller.probability.systemRuleNames}
          hasCompletedClassification={hasCompletedRoleStep}
        />
      ) : null}
    </>
  )
}


// ── Global Practice FAB ──

function PracticeFab({
  isOpen,
  onOpen,
  onClose,
  handSize,
  derivedMainCards,
  patterns,
  disabledGenericRuleIds,
  systemRuleNames,
  hasCompletedClassification,
}: {
  isOpen: boolean
  onOpen: () => void
  onClose: () => void
  handSize: number
  derivedMainCards: import('../../types').CardEntry[]
  patterns: import('../../types').HandPattern[]
  disabledGenericRuleIds: string[]
  systemRuleNames: Record<string, string>
  hasCompletedClassification: boolean
}) {
  const activePatterns = useMemo(
    () => buildActiveRuleSet(derivedMainCards, curatePatterns(patterns, derivedMainCards), disabledGenericRuleIds, systemRuleNames),
    [patterns, derivedMainCards, disabledGenericRuleIds, systemRuleNames],
  )
  const missingOriginCount = useMemo(() => countCardsMissingOrigin(derivedMainCards), [derivedMainCards])
  const missingRoleCount = useMemo(() => countCardsMissingRoles(derivedMainCards), [derivedMainCards])
  const pendingReviewCount = useMemo(() => countCardsPendingReview(derivedMainCards), [derivedMainCards])
  const reviewPendingPatternCount = useMemo(
    () => patterns.filter((p) => p.needsReview).length,
    [patterns],
  )

  return (
    <>
      <DraggableFab label="Abrir práctica" storageKey="ygo-lab:practice-fab" onClick={onOpen}>
        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <rect x="8.5" y="2" width="7" height="11" rx="1.2" />
          <rect x="2.5" y="4" width="7" height="11" rx="1.2" transform="rotate(-12 6 9.5)" />
          <rect x="14.5" y="4" width="7" height="11" rx="1.2" transform="rotate(12 18 9.5)" />
        </svg>
      </DraggableFab>

      <Modal
        isOpen={isOpen}
        onClose={onClose}
        size="table"
        bare
        flush
        ariaLabel="Práctica"
        closeTone="flat"
        closeClassName="right-1.5 top-3 min-[820px]:right-4 min-[820px]:top-4"
      >
        <Suspense fallback={null}>
        <LazyPracticeSection
          handSize={handSize}
          derivedMainCards={derivedMainCards}
          patterns={activePatterns}
          hasCompletedClassification={hasCompletedClassification}
          missingOriginCount={missingOriginCount}
          missingRoleCount={missingRoleCount}
          pendingReviewCount={pendingReviewCount}
          reviewPendingPatternCount={reviewPendingPatternCount}
        />
        </Suspense>
      </Modal>
    </>
  )
}
