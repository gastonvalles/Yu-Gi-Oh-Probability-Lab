import { useCallback, useEffect, useMemo, useRef, useState } from 'react'

import { countUnclassifiedCards, isClassificationStepComplete } from '../../app/role-step'
import { DeckRolesPanel } from '../DeckRolesPanel'
import { ExportDeckPanel } from '../ExportDeckPanel'
import { HoverPreview } from '../HoverPreview'
import { ProbabilityPanel } from '../ProbabilityPanel'
import { SearchPanel } from '../SearchPanel'
import { DeckBuilderStep } from './DeckBuilderStep'
import { DeckModeDragOverlay } from './DeckModeDragOverlay'
import {
  buildDeckWorkflowNavigationItems,
  type DeckWorkflowStepKey,
  isDeckWorkflowStepKey,
} from './deck-workflow-navigation'
import { DeckModeNavigation } from './DeckModeNavigation'
import { DeckModeShell } from './DeckModeShell'
import { MobileBottomStepNav } from './MobileBottomStepNav'
import { useDeckModeController } from './use-deck-mode-controller'

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
  const mobileBottomNav = (
    <MobileBottomStepNav
      items={navigationItems}
      activeStep={activeStep}
      onStepChange={handleStepChange}
    />
  )
  const deckBuilderRail = (
    <SearchPanel
      layoutMode="desktop"
      deckFormat={deckBuilderStep.deckFormat}
      query={deckBuilderStep.query}
      status={deckBuilderStep.status}
      results={deckBuilderStep.visibleSearchResults}
      isLoadingMore={deckBuilderStep.isLoadingMore}
      errorMessage={deckBuilderStep.errorMessage}
      hasMore={deckBuilderStep.hasMore}
      rawResultCount={deckBuilderStep.loadedSearchResultCount}
      activeDragSearchCardId={deckBuilderStep.activeDragSearchCardId}
      dragEnabled
      filters={deckBuilderStep.searchFilters}
      activeFilterCount={deckBuilderStep.activeFilterCount}
      hasSearchCriteria={deckBuilderStep.hasSearchCriteria}
      onQueryChange={deckBuilderStep.onQueryChange}
      onFilterChange={deckBuilderStep.onSearchFiltersChange}
      onClearFilters={deckBuilderStep.onClearSearchFilters}
      onLoadMore={deckBuilderStep.onLoadMoreResults}
      onResultClick={deckBuilderStep.onSearchResultClick}
      onSearchCardPointerDown={deckBuilderStep.onSearchCardPointerDown}
      onHoverStart={deckBuilderStep.onHoverStart}
      onHoverEnd={deckBuilderStep.onHoverEnd}
    />
  )
  const mainContent = isDeckBuilderStep ? (
    <div id="deck-builder" className="min-[1101px]:h-full min-[1101px]:min-h-0">
      <DeckBuilderStep {...deckBuilderStep} />
    </div>
  ) : (
    <section className="grid min-h-full content-start gap-3 min-[1101px]:h-full min-[1101px]:min-h-0">
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
        sidebar={navigation}
        mobileBottomNav={mobileBottomNav}
        main={mainContent}
        rail={isDeckBuilderStep ? deckBuilderRail : undefined}
        mainScrollable={!isDeckBuilderStep}
        mainScrollRef={contentScrollRef}
      />

      <HoverPreview preview={controller.feedback.hoverPreview} />
      <DeckModeDragOverlay
        overlay={controller.feedback.dragOverlay}
        overlayRef={controller.feedback.dragOverlayRef}
      />
    </>
  )
}
