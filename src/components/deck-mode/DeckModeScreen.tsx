import { Suspense, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'

import { DESKTOP_DECK_BUILDER_MEDIA_QUERY, useMediaQuery } from '../../app/use-media-query'
import { countUnclassifiedCards, countCardsMissingOrigin, countCardsMissingRoles, countCardsPendingReview, isClassificationStepComplete } from '../../app/role-step'
import { curatePatterns } from '../../app/pattern-curation'
import { buildActiveRuleSet } from '../../app/pattern-presets'
import { deriveMainDeckCardsFromZone } from '../../app/calculator-state'
import { createMatState, randomSeed, shuffleWithSeed } from '../../app/practice-mat'
import { useMatSession } from '../../app/use-mat-session'
import type { DeckCardInstance } from '../../app/model'
import type { SavedCombo } from '../../app/saved-combos'
import { buildPracticeDeck } from '../probability/practice'
import { CardDetailModal } from '../card-detail/CardDetailModal'
import { DeckBuilderStep } from './DeckBuilderStep'
import { LifeCalculatorFab } from '../life/LifeCalculatorFab'
import { cx } from '../ui/cx'
import { DraggableFab } from '../ui/DraggableFab'
import { Icon } from '../ui/Icon'
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
  LazyMetaScreen,
  LazyPracticeSection,
  LazyProbabilityPanel,
  LazyReplaysScreen,
  preloadHeavySteps,
} from './lazy-steps'
import { useLabPrewarm } from '../probability/use-lab-prewarm'
import { useDeckModeController } from './use-deck-mode-controller'

/** El paso va antes del "?": lo que sigue son parámetros de la vista (p. ej. `#meta?deck=123`). */
function getStepFromHash(hash: string): DeckWorkflowStepKey | null {
  const normalizedHash = hash.replace(/^#/, '').split('?')[0] ?? ''

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
  const isDesktopDeckBuilder = useMediaQuery(DESKTOP_DECK_BUILDER_MEDIA_QUERY)
  const mainDeckCount = controller.deckBuilderStep.deckBuilder.main.length
  const roleCards = controller.roles.cards
  const unclassifiedCardCount = useMemo(() => countUnclassifiedCards(roleCards), [roleCards])
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

    // Sólo se toca el hash si cambió el paso: los parámetros de la vista (p. ej. el deck abierto) se respetan.
    if (getStepFromHash(window.location.hash) !== activeStep) {
      // Cada paso es una entrada del historial: "Atrás" vuelve al paso anterior en vez de salir de la app.
      // La primera vez (sin hash) se reemplaza para no duplicar la entrada inicial.
      if (window.location.hash) {
        window.history.pushState(null, '', nextHash)
      } else {
        window.history.replaceState(null, '', nextHash)
      }
    }
  }, [activeStep])

  // La pantalla nueva se dibuja ya arriba de todo: antes el scroll animado la dejaba un instante donde estaba la anterior y
  // la deslizaba hacia arriba, y todo se movía. Va en un layout effect para que el primer cuadro que se pinta ya esté arriba.
  const shownStepRef = useRef(activeStep)

  useLayoutEffect(() => {
    if (shownStepRef.current === activeStep) {
      return
    }

    shownStepRef.current = activeStep
    contentScrollRef.current?.scrollTo({ top: 0, behavior: 'instant' })
    window.scrollTo({ top: 0, behavior: 'instant' })
  }, [activeStep])

  const handleStepChange = useCallback((nextStep: DeckWorkflowStepKey) => {
    if (nextStep !== activeStepRef.current) {
      setActiveStep(nextStep)
    }
  }, [])
  const navigationItems = useMemo(
    () =>
      buildDeckWorkflowNavigationItems({
        mainDeckCount,
        roleCardCount: roleCards.length,
        unclassifiedCardCount,
        hasCompletedRoleStep,
        patternCount,
      }),
    [
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
          <LazyDeckRolesPanel {...controller.roles} onOpenLab={() => handleStepChange('probability-lab')} />
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

      {activeStep === 'meta' ? (
        <div id="meta" className="min-w-0 min-[1101px]:min-h-full">
          <LazyMetaScreen />
        </div>
      ) : null}

      {activeStep === 'replays' ? (
        <div id="replays" className="min-w-0 min-[1101px]:min-h-full">
          <LazyReplaysScreen />
        </div>
      ) : null}
    </section>
  )
  const mainContent = (
    <div
      key={activeStep}
      className={cx(
        // La pantalla nueva aparece (fundido) donde va a quedar: nada se desliza ni cambia de lugar.
        'min-w-0 animate-step-in motion-reduce:animate-none',
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
          extraZone={controller.exportDeck.deckBuilder.extra}
          deckName={controller.exportDeck.deckName}
          patterns={controller.probability.patterns}
          disabledGenericRuleIds={controller.probability.disabledGenericRuleIds}
          systemRuleNames={controller.probability.systemRuleNames}
          hasCompletedClassification={hasCompletedRoleStep}
        />
      ) : null}

      {/* Calculadora de LP (sólo celular): botón flotante que la abre encima de cualquier pantalla. */}
      <LifeCalculatorFab />
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
  extraZone,
  deckName,
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
  extraZone: DeckCardInstance[]
  deckName: string
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

  // La mesa vive acá y no en el modal: cerrarlo no pierde la partida ni el combo en curso.
  const { session, state, start, dispatch, undo, seek } = useMatSession()
  const mainIds = useMemo(() => buildPracticeDeck(derivedMainCards).map((card) => card.drawId), [derivedMainCards])
  const extraCards = useMemo(() => buildPracticeDeck(deriveMainDeckCardsFromZone(extraZone)), [extraZone])
  const extraIds = useMemo(() => extraCards.map((card) => card.drawId), [extraCards])
  const cardsById = useMemo(
    () => new Map([...buildPracticeDeck(derivedMainCards), ...extraCards].map((card) => [card.drawId, { name: card.name, apiCard: card.apiCard }])),
    [derivedMainCards, extraCards],
  )

  const newHand = useCallback(() => start(createMatState(shuffleWithSeed(mainIds, randomSeed()), extraIds, handSize)), [start, mainIds, extraIds, handSize])
  const loadCombo = useCallback((combo: SavedCombo) => start(combo.initial, combo.actions, combo.names), [start])

  // Al abrir la práctica ya se roban las cartas de la mano.
  useEffect(() => {
    if (isOpen && !session && mainIds.length >= handSize) {
      newHand()
    }
  }, [isOpen, session, mainIds.length, handSize, newHand])

  return (
    <>
      <DraggableFab label="Abrir práctica" storageKey="ygo-lab:practice-fab" onClick={onOpen}>
        <Icon name="hand" size={24} strokeWidth={1.8} />
      </DraggableFab>

      <Modal
        isOpen={isOpen}
        onClose={onClose}
        size="board"
        bare
        flush
        ariaLabel="Práctica"
        closeTone="flat"
        closeClassName="right-1.5 top-3 min-[820px]:right-4 min-[820px]:top-4"
      >
        <Suspense fallback={null}>
          {session && state ? (
            <LazyPracticeSection
              handSize={handSize}
              derivedMainCards={derivedMainCards}
              patterns={activePatterns}
              hasCompletedClassification={hasCompletedClassification}
              missingOriginCount={missingOriginCount}
              missingRoleCount={missingRoleCount}
              pendingReviewCount={pendingReviewCount}
              reviewPendingPatternCount={reviewPendingPatternCount}
              session={session}
              state={state}
              cardsById={cardsById}
              deckName={deckName}
              onDispatch={dispatch}
              onUndo={undo}
              onSeek={seek}
              onLoadCombo={loadCombo}
              onNewHand={newHand}
            />
          ) : null}
        </Suspense>
      </Modal>
    </>
  )
}
