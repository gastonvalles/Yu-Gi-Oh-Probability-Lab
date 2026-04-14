import { useCallback, useEffect, useMemo, useRef, useState } from 'react'

import { countUnclassifiedCards, isClassificationStepComplete } from '../../app/role-step'
import { CardDetailDrawer } from '../card-detail/CardDetailDrawer'
import { DeckRolesPanel } from '../DeckRolesPanel'
import { ExportDeckPanel } from '../ExportDeckPanel'
import { HoverPreview } from '../HoverPreview'
import { ProbabilityPanel } from '../ProbabilityPanel'
import { DeckBuilderStep } from './DeckBuilderStep'
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
    </>
  )
}
