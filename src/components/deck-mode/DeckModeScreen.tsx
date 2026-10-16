import { Suspense, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type ComponentProps } from 'react'

import { DESKTOP_DECK_BUILDER_MEDIA_QUERY, useMediaQuery } from '../../app/use-media-query'
import { countUnclassifiedCards, countCardsMissingOrigin, countCardsMissingRoles, countCardsPendingReview, isClassificationStepComplete } from '../../app/role-step'
import { curatePatterns } from '../../app/pattern-curation'
import { buildActiveRuleSet } from '../../app/pattern-presets'
import { deriveMainDeckCardsFromZone } from '../../app/calculator-state'
import { createMatState, randomSeed, shuffleWithSeed } from '../../app/practice-mat'
import { useMatSession } from '../../app/use-mat-session'
import { connectSpectatorToRelay, connectToRelay, duelRelayUrl } from '../../app/use-duel'
import { t } from '../../i18n'
import type { DeckCardInstance } from '../../app/model'
import type { SavedCombo } from '../../app/saved-combos'
import { buildPracticeDeck } from '../probability/practice'
import { CardDetailModal } from '../card-detail/CardDetailModal'
import { DeckBuilderStep } from './DeckBuilderStep'
import { LifeCalculatorFab } from '../life/LifeCalculatorFab'
import { MascotsModal } from '../mascot/MascotsModal'
import { AppShell } from '../shell/AppShell'
import { cx } from '../ui/cx'
import { Callout } from '../ui/Callout'
import { Heading } from '../ui/Heading'
import { DeckModeDragOverlay } from './DeckModeDragOverlay'
import {
  buildAppNavGroups,
  buildDeckWorkflowNavigationItems,
  type DeckWorkflowStepKey,
  isDeckWorkflowStepKey,
} from './deck-workflow-navigation'
import {
  LazyBanlistsScreen,
  LazyComparisonScreen,
  LazyDeckRolesPanel,
  LazyDuelScreen,
  LazyExpansionsScreen,
  LazyExportDeckPanel,
  LazyPracticeSection,
  LazyProbabilityPanel,
  LazyReplaysScreen,
  LazyTierListsScreen,
  LazyTournamentDecksScreen,
  preloadHeavySteps,
} from './lazy-steps'
import { useLabPrewarm } from '../probability/use-lab-prewarm'
import { useDeckModeController } from './use-deck-mode-controller'

/** El paso va antes del "?": lo que sigue son parámetros de la vista (p. ej. `#tournaments?deck=123`). */
function getStepFromHash(hash: string): DeckWorkflowStepKey | null {
  const [step = '', query = ''] = hash.replace(/^#/, '').split('?')

  // `#meta?deck=123` es el link de antes de separar los decks de torneo de las tier lists: sigue llevando al deck.
  if (step === 'meta' && new URLSearchParams(query).has('deck')) {
    return 'tournaments'
  }

  return isDeckWorkflowStepKey(step) ? step : null
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
  const [lifeOpen, setLifeOpen] = useState(false)
  const [mascotsOpen, setMascotsOpen] = useState(false)
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
  const isPracticeStep = activeStep === 'practice'
  const isDuelStep = activeStep === 'duel'
  // La práctica y el duelo juegan con las mismas copias del deck armado.
  const matDeck = usePracticeDeck(controller.probability.derivedMainCards, controller.exportDeck.deckBuilder.extra)
  // El duelo por enlace se ofrece sólo si la app sabe a qué relay conectarse (`VITE_DUEL_RELAY_URL`).
  const duelConnect = useMemo(() => {
    const url = duelRelayUrl()
    return url ? { play: connectToRelay(url), watch: connectSpectatorToRelay(url) } : null
  }, [])
  // La partida vive acá y no en la pantalla: salir de la práctica (a la calculadora, al builder) no pierde la mano ni el combo en curso.
  const practice = usePracticeSession({
    active: isPracticeStep,
    handSize: controller.probability.handSize,
    derivedMainCards: controller.probability.derivedMainCards,
    deck: matDeck,
    deckName: controller.exportDeck.deckName,
    patterns: controller.probability.patterns,
    disabledGenericRuleIds: controller.probability.disabledGenericRuleIds,
    systemRuleNames: controller.probability.systemRuleNames,
    hasCompletedClassification: hasCompletedRoleStep,
  })
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

  // El detalle de carta del celular vive afuera de los pasos: si se cambia de pantalla (el menú, "Atrás", un link a Expansiones) no se queda abierto encima de la nueva.
  const closeCardDetail = controller.deckBuilderStep.onCloseCardDetail

  useEffect(() => {
    if (activeStep !== 'deck-builder') {
      closeCardDetail()
    }
  }, [activeStep, closeCardDetail])

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
  // El menú: los pasos del deck, las herramientas (la práctica es una pantalla; la calculadora y las mascotas abren un panel encima) y la referencia. La práctica necesita cartas en el Main.
  const navGroups = useMemo(() => buildAppNavGroups(navigationItems, { practice: mainDeckCount > 0, duel: duelConnect !== null }), [navigationItems, mainDeckCount, duelConnect])
  const handleNavSelect = useCallback(
    (key: string) => {
      if (key === 'life') setLifeOpen(true)
      else if (key === 'mascots') setMascotsOpen(true)
      else if (isDeckWorkflowStepKey(key)) handleStepChange(key)
    },
    [handleStepChange],
  )
  useEffect(() => {
    preloadHeavySteps()
  }, [])

  const stepContent = isDeckBuilderStep ? (
    <div id="deck-builder" className="h-full min-h-0">
      {/* En escritorio el builder no lleva encabezado a la vista (las zonas del deck son el título), pero la pantalla tiene su h1 como todas.
          En el celular el encabezado es el de la propia vista (`StepHero`). */}
      {isDesktopDeckBuilder ? (
        <Heading level="page" className="sr-only">
          {t('deck.builder.title')}
        </Heading>
      ) : null}
      <DeckBuilderStep {...deckBuilderStep} />
    </div>
  ) : (
    <section
      className={cx(
        'grid content-start',
        isCategorizationStep ? 'h-full min-h-0' : isPracticeStep || isDuelStep ? 'h-full min-h-0 grid-rows-[minmax(0,1fr)]' : 'min-h-full min-[1101px]:h-full min-[1101px]:min-h-0 min-[1101px]:grid-rows-[minmax(0,1fr)]',
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

      {activeStep === 'practice' ? (
        <div id="practice" className="h-full min-h-0 min-w-0">
          <Heading level="page" className="sr-only">
            {t('shell.practice.title')}
          </Heading>
          {practice ? <LazyPracticeSection {...practice} /> : <Callout tone="info" className="m-4">{t('practice.section.needCards')}</Callout>}
        </div>
      ) : null}

      {activeStep === 'duel' ? (
        <div id="duel" className="h-full min-h-0 min-w-0">
          <Heading level="page" className="sr-only">
            {t('shell.nav.group.duel')}
          </Heading>
          {duelConnect ? (
            <LazyDuelScreen handSize={controller.probability.handSize} mainIds={matDeck.mainIds} extraIds={matDeck.extraIds} cardsById={matDeck.cardsById} deckName={controller.exportDeck.deckName} connect={duelConnect.play} connectSpectator={duelConnect.watch} />
          ) : (
            <Callout tone="info" className="m-4">{t('duel.unavailable')}</Callout>
          )}
        </div>
      ) : null}

      {activeStep === 'meta' ? (
        <div id="meta" className="min-w-0 min-[1101px]:min-h-full">
          <LazyTierListsScreen />
        </div>
      ) : null}

      {activeStep === 'tournaments' ? (
        <div id="tournaments" className="min-w-0 min-[1101px]:min-h-full">
          <LazyTournamentDecksScreen />
        </div>
      ) : null}

      {activeStep === 'replays' ? (
        <div id="replays" className="min-w-0 min-[1101px]:min-h-full">
          <LazyReplaysScreen />
        </div>
      ) : null}

      {activeStep === 'expansions' ? (
        <div id="expansions" className="min-w-0 min-[1101px]:h-full min-[1101px]:min-h-0">
          <LazyExpansionsScreen />
        </div>
      ) : null}

      {activeStep === 'banlists' ? (
        <div id="banlists" className="min-w-0 min-[1101px]:min-h-full">
          <LazyBanlistsScreen />
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
        // En escritorio toda pantalla mide el recuadro del armazón (sin pie): una más alta lo desborda y scrollea; una que reparte el alto entre columnas (Expansiones) lo usa justo.
        isDeckBuilderStep || isCategorizationStep || isPracticeStep || isDuelStep ? 'h-full min-h-0' : 'min-h-full min-[1101px]:h-full min-[1101px]:min-h-0',
      )}
    >
      <Suspense fallback={null}>{stepContent}</Suspense>
    </div>
  )

  return (
    <>
      <AppShell groups={navGroups} activeKey={activeStep} onSelect={handleNavSelect} contentScrollable={!isDeckBuilderStep && !isPracticeStep && !isDuelStep} immersive={isPracticeStep || isDuelStep} contentScrollRef={contentScrollRef}>
        {mainContent}
      </AppShell>

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

      {/* Calculadora de LP: se abre desde el menú; mientras corre el reloj de la ronda, un botón flotante vuelve a ella desde cualquier otra pantalla. */}
      <LifeCalculatorFab open={lifeOpen} onOpen={() => setLifeOpen(true)} onClose={() => setLifeOpen(false)} />

      {/* Las mascotas: se abre desde el menú y deja sacar hasta tres a la vez. */}
      <MascotsModal isOpen={mascotsOpen} onClose={() => setMascotsOpen(false)} />
    </>
  )
}


// ── La práctica ──

type PracticeScreenProps = ComponentProps<typeof LazyPracticeSection>

/** Las copias del deck armado como las juega la mesa: ids de cada carta (`card-123-2`) del Main y del Extra, y cómo se llama cada una. */
function usePracticeDeck(derivedMainCards: import('../../types').CardEntry[], extraZone: DeckCardInstance[]) {
  const mainIds = useMemo(() => buildPracticeDeck(derivedMainCards).map((card) => card.drawId), [derivedMainCards])
  const extraCards = useMemo(() => buildPracticeDeck(deriveMainDeckCardsFromZone(extraZone)), [extraZone])
  const extraIds = useMemo(() => extraCards.map((card) => card.drawId), [extraCards])
  const cardsById = useMemo(
    () => new Map([...buildPracticeDeck(derivedMainCards), ...extraCards].map((card) => [card.drawId, { name: card.name, apiCard: card.apiCard }])),
    [derivedMainCards, extraCards],
  )

  return { mainIds, extraIds, cardsById }
}

interface PracticeSessionInput {
  /** La pantalla de práctica está abierta: al entrar sin partida, ya se reparte la mano. */
  active: boolean
  handSize: number
  derivedMainCards: import('../../types').CardEntry[]
  deck: ReturnType<typeof usePracticeDeck>
  deckName: string
  patterns: import('../../types').HandPattern[]
  disabledGenericRuleIds: string[]
  systemRuleNames: Record<string, string>
  hasCompletedClassification: boolean
}

/** Lo que necesita la pantalla de práctica, o null mientras no hay partida (faltan cartas para la mano). */
function usePracticeSession({
  active,
  handSize,
  derivedMainCards,
  deck: { mainIds, extraIds, cardsById },
  deckName,
  patterns,
  disabledGenericRuleIds,
  systemRuleNames,
  hasCompletedClassification,
}: PracticeSessionInput): PracticeScreenProps | null {
  const activePatterns = useMemo(
    () => buildActiveRuleSet(derivedMainCards, curatePatterns(patterns, derivedMainCards), disabledGenericRuleIds, systemRuleNames),
    [patterns, derivedMainCards, disabledGenericRuleIds, systemRuleNames],
  )
  const missingOriginCount = useMemo(() => countCardsMissingOrigin(derivedMainCards), [derivedMainCards])
  const missingRoleCount = useMemo(() => countCardsMissingRoles(derivedMainCards), [derivedMainCards])
  const pendingReviewCount = useMemo(() => countCardsPendingReview(derivedMainCards), [derivedMainCards])
  const reviewPendingPatternCount = useMemo(() => patterns.filter((p) => p.needsReview).length, [patterns])

  const { session, state, start, dispatch, undo, seek } = useMatSession()
  const newHand = useCallback(() => start(createMatState(shuffleWithSeed(mainIds, randomSeed()), extraIds, handSize)), [start, mainIds, extraIds, handSize])
  const loadCombo = useCallback((combo: SavedCombo) => start(combo.initial, combo.actions, combo.names), [start])

  // Al entrar a la práctica ya se roban las cartas de la mano.
  useEffect(() => {
    if (active && !session && mainIds.length >= handSize) {
      newHand()
    }
  }, [active, session, mainIds.length, handSize, newHand])

  if (!session || !state) {
    return null
  }

  return {
    handSize,
    derivedMainCards,
    patterns: activePatterns,
    hasCompletedClassification,
    missingOriginCount,
    missingRoleCount,
    pendingReviewCount,
    reviewPendingPatternCount,
    session,
    state,
    cardsById,
    deckName,
    onDispatch: dispatch,
    onUndo: undo,
    onSeek: seek,
    onLoadCombo: loadCombo,
    onNewHand: newHand,
  }
}
