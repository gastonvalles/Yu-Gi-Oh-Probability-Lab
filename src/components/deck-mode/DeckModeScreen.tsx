import { useCallback, useEffect, useMemo, useRef, useState } from 'react'

import { countUnclassifiedCards, countCardsMissingOrigin, countCardsMissingRoles, countCardsPendingReview, isClassificationStepComplete } from '../../app/role-step'
import { curatePatterns } from '../../app/pattern-curation'
import { CardDetailDrawer } from '../card-detail/CardDetailDrawer'
import { DeckRolesPanel } from '../DeckRolesPanel'
import { ExportDeckPanel } from '../ExportDeckPanel'
import { HoverPreview } from '../HoverPreview'
import { ProbabilityPanel } from '../ProbabilityPanel'
import { PracticeSection } from '../probability/PracticeSection'
import { ComparisonScreen } from '../comparison/ComparisonScreen'
import { DeckBuilderStep } from './DeckBuilderStep'
import { CloseButton } from '../ui/IconButton'
import { DeckModeDragOverlay } from './DeckModeDragOverlay'
import {
  buildDeckWorkflowNavigationItems,
  type DeckWorkflowStepKey,
  isDeckWorkflowStepKey,
} from './deck-workflow-navigation'
import { DeckModeNavigation } from './DeckModeNavigation'
import { MobileBottomStepNav } from './MobileBottomStepNav'
import { DeckModeShell } from './DeckModeShell'
import { useDeckModeController } from './use-deck-mode-controller'

const DESKTOP_DECK_BUILDER_MEDIA_QUERY = '(min-width: 1101px)'

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

export function DeckModeScreen() {
  const controller = useDeckModeController()
  const [isDesktopDeckBuilder, setIsDesktopDeckBuilder] = useState(() => {
    if (typeof window === 'undefined') {
      return false
    }

    return window.matchMedia(DESKTOP_DECK_BUILDER_MEDIA_QUERY).matches
  })
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
  const contentScrollRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (typeof window === 'undefined') {
      return
    }

    const handleHashChange = () => {
      const nextStep = getStepFromHash(window.location.hash)

      if (nextStep) {
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
    contentScrollRef.current?.scrollTo({ top: 0, behavior: 'auto' })
  }, [activeStep])

  useEffect(() => {
    if (typeof window === 'undefined') {
      return
    }

    const mediaQuery = window.matchMedia(DESKTOP_DECK_BUILDER_MEDIA_QUERY)
    const handleChange = (event: MediaQueryListEvent) => {
      setIsDesktopDeckBuilder(event.matches)
    }

    setIsDesktopDeckBuilder(mediaQuery.matches)
    mediaQuery.addEventListener('change', handleChange)

    return () => {
      mediaQuery.removeEventListener('change', handleChange)
    }
  }, [])

  const handleStepChange = useCallback((nextStep: DeckWorkflowStepKey) => {
    setActiveStep(nextStep)

    if (typeof window !== 'undefined') {
      window.scrollTo({ top: 0, behavior: 'smooth' })
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
  const mainContent = isDeckBuilderStep ? (
    <div id="deck-builder" className="h-full min-h-0">
      <DeckBuilderStep {...deckBuilderStep} />
    </div>
  ) : (
    <section className="grid min-h-full content-start gap-3 min-[1101px]:h-full min-[1101px]:min-h-0 min-[1101px]:p-4">
      {activeStep === 'categorization' ? (
        <div id="categorization" className="min-w-0 min-[1101px]:h-full min-[1101px]:min-h-0">
          <DeckRolesPanel {...controller.roles} />
        </div>
      ) : null}

      {activeStep === 'probability-lab' ? (
        <div id="probability-lab" className="min-w-0 min-[1101px]:min-h-full">
          <ProbabilityPanel {...controller.probability} />
        </div>
      ) : null}

      {activeStep === 'export' ? (
        <div id="export" className="min-w-0 min-[1101px]:min-h-full">
          <ExportDeckPanel {...controller.exportDeck} />
        </div>
      ) : null}

      {activeStep === 'workspace' ? (
        <div id="workspace" className="min-w-0 min-[1101px]:min-h-full">
          <ComparisonScreen />
        </div>
      ) : null}
    </section>
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

      {!(isDesktopDeckBuilder && isDeckBuilderStep) ? (
        <HoverPreview preview={controller.feedback.hoverPreview} />
      ) : null}
      <DeckModeDragOverlay
        overlay={controller.feedback.dragOverlay}
        overlayRef={controller.feedback.dragOverlayRef}
      />
      {!isDesktopDeckBuilder ? (
        <CardDetailDrawer
          card={controller.deckBuilderStep.selectedDetailCard}
          deckFormat={controller.deckBuilderStep.deckFormat}
          isOpen={controller.deckBuilderStep.isCardDetailOpen}
          showActions={controller.deckBuilderStep.selectedDetailSource !== 'deck'}
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
  hasCompletedClassification,
}: {
  isOpen: boolean
  onOpen: () => void
  onClose: () => void
  handSize: number
  derivedMainCards: import('../../types').CardEntry[]
  patterns: import('../../types').HandPattern[]
  hasCompletedClassification: boolean
}) {
  const activePatterns = useMemo(
    () => curatePatterns(patterns, derivedMainCards, { includeDefaults: false }),
    [patterns, derivedMainCards],
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
      <button
        type="button"
        aria-label="Abrir práctica"
        title="Probar mano"
        className="fixed right-4 bottom-20 z-100 grid h-12 w-12 place-items-center rounded-full bg-[rgb(var(--primary-rgb))] text-white shadow-lg transition-transform hover:scale-110 hover:brightness-110 active:scale-95 min-[1101px]:right-5 min-[1101px]:bottom-5 min-[1101px]:h-14 min-[1101px]:w-14"
        onClick={onOpen}
      >
        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
          <rect x="8.5" y="2" width="7" height="11" rx="1.2" />
          <rect x="2.5" y="4" width="7" height="11" rx="1.2" transform="rotate(-12 6 9.5)" />
          <rect x="14.5" y="4" width="7" height="11" rx="1.2" transform="rotate(12 18 9.5)" />
        </svg>
      </button>

      {isOpen ? (
        <div className="fixed inset-0 z-140 grid place-items-center bg-[rgb(var(--background-rgb)/0.76)] px-3 py-4">
          <button
            type="button"
            aria-label="Cerrar práctica"
            className="absolute inset-0 h-full w-full cursor-default"
            onClick={onClose}
          />

          <div className="surface-panel app-dialog-enter relative grid h-[min(88vh,820px)] w-full max-w-312 min-w-0 grid-rows-[auto_minmax(0,1fr)] gap-0 overflow-hidden p-0">
            <div className="flex min-w-0 items-center justify-between gap-2 border-b border-(--border-subtle) px-4 py-3">
              <div className="grid min-w-0 gap-0.5">
                <strong className="text-[0.98rem] text-(--text-main)">Práctica</strong>
                <span className="app-muted text-[0.74rem]">Proba manos sin salir de lo que estás haciendo.</span>
              </div>
              <CloseButton
                size="sm"
                aria-label="Cerrar práctica"
                onClick={onClose}
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
    </>
  )
}
