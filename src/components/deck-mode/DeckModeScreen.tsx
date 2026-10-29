import { Suspense, lazy, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type ComponentProps } from 'react'

import type { ManualGame } from '../../app/auto/manual-handover'
import { canRunAuto, useAutoPrefs } from '../../app/auto-prefs'
import { comboPayloadOf, decodeComboPayload, type SharedCombo } from '../../app/combo-share'
import { showToastMessage } from '../../app/use-toast-message'
import { clearPlayReturn, readPlayReturn } from '../../app/play-return'
import { DESKTOP_DECK_BUILDER_MEDIA_QUERY, useMediaQuery } from '../../app/use-media-query'
import { countUnclassifiedCards, countCardsMissingOrigin, countCardsMissingRoles, countCardsPendingReview, isClassificationStepComplete } from '../../app/role-step'
import { curatePatterns } from '../../app/pattern-curation'
import { buildActiveRuleSet } from '../../app/pattern-presets'
import { deriveMainDeckCardsFromZone } from '../../app/calculator-state'
import { dealRival, readHandtrapConfig } from '../../app/handtraps'
import { createMatState, randomSeed, shuffleWithSeed, type MatState } from '../../app/practice-mat'
import { useMatSession } from '../../app/use-mat-session'
import { Presence } from '../../app/use-presence'
import { createRoomsApi } from '../../app/duel-rooms'
import { findPausedDuel } from '../../app/duel-save'
import { readSavedBuilds } from '../../app/saved-builds'
import { connectSpectatorToRelay, connectToRelay, duelRelayUrl } from '../../app/use-duel'
import { t } from '../../i18n'
import type { DeckCardInstance } from '../../app/model'
import type { SavedCombo } from '../../app/saved-combos'
import { buildPracticeDeck } from '../probability/practice'
import { CardDetailModal } from '../card-detail/CardDetailModal'
import { StepErrorBoundary } from '../ui/StepErrorBoundary'
import { DeckBuilderStep } from './DeckBuilderStep'
import { GlobalCardSearch } from './GlobalCardSearch'
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
  LazyLifeCalculatorScreen,
  LazyPracticeSection,
  LazyProbabilityPanel,
  LazyReplaysScreen,
  LazyTierListsScreen,
  LazyTierMakerScreen,
  LazyTournamentDecksScreen,
  preloadHeavySteps,
} from './lazy-steps'
import { useLabPrewarm } from '../probability/use-lab-prewarm'
import { useDeckModeController } from './use-deck-mode-controller'

/**
 * Los dos puntos de entrada del modo automático (y del núcleo de reglas en wasm, que viaja aparte y sólo bajo demanda: `auto-isolation.test.ts`): «Jugar solo automático (beta)» y la
 * mesa de una sala con reglas automáticas (el duelo por enlace la monta cuando la sala lo pide). No van en `lazy-steps.ts`: no se precargan.
 */
const LazyAutoSolo = lazy(() => import('../auto/AutoSoloScreen').then((m) => ({ default: m.AutoSoloScreen })))
const LazyAutoDuel = lazy(() => import('../auto/AutoDuelScreen').then((m) => ({ default: m.AutoDuelScreen })))

/** Los datos de un enlace de combo (`#combo=…`), o null. */
const comboHash = (hash: string) => (hash.startsWith('#combo=') ? comboPayloadOf(hash) : null)

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
  const pendingReviewCount = useMemo(() => countCardsPendingReview(roleCards), [roleCards])
  const hasCompletedRoleStep = useMemo(() => isClassificationStepComplete(roleCards), [roleCards])
  const patternCount = controller.probability.patterns.length
  const [mascotsOpen, setMascotsOpen] = useState(false)
  const [searchOpen, setSearchOpen] = useState(false)
  const recommendedStep = useMemo(
    () => getRecommendedStep(mainDeckCount, hasCompletedRoleStep, patternCount),
    [hasCompletedRoleStep, mainDeckCount, patternCount],
  )
  const [activeStep, setActiveStep] = useState<DeckWorkflowStepKey>(() => {
    if (typeof window === 'undefined') {
      return recommendedStep
    }

    // Un enlace de combo (`#combo=…`) abre la práctica, que lo repasa.
    return comboHash(window.location.hash) ? 'practice' : (getStepFromHash(window.location.hash) ?? recommendedStep)
  })
  const isDeckBuilderStep = activeStep === 'deck-builder'
  // Si se llegó al builder desde Jugar (el lobby o la sala), ofrece volver a donde se estaba; volver a Jugar borra el recuerdo.
  const [playReturn, setPlayReturn] = useState<string | null>(() => readPlayReturn())
  useEffect(() => {
    if (activeStep === 'duel') clearPlayReturn()
    setPlayReturn(activeStep === 'duel' ? null : readPlayReturn())
  }, [activeStep])
  const isCategorizationStep = activeStep === 'categorization'
  const isPracticeStep = activeStep === 'practice'
  const isDuelStep = activeStep === 'duel'
  const isLifeStep = activeStep === 'life'
  // En el celular sólo la mesa del duelo es a pantalla completa (sin pie ni barra de abajo); el lobby, la sala y el siding llevan el armazón de siempre. En escritorio no cambia: el duelo ocupa todo.
  const [duelTable, setDuelTable] = useState(false)
  // La práctica y el duelo juegan con las mismas copias del deck armado.
  const matDeck = usePracticeDeck(controller.probability.derivedMainCards, controller.exportDeck.deckBuilder.extra, controller.exportDeck.deckBuilder.side)
  // El duelo por enlace se ofrece sólo si la app sabe a qué relay conectarse (`VITE_DUEL_RELAY_URL`).
  const duelConnect = useMemo(() => {
    const url = duelRelayUrl()
    return url ? { play: connectToRelay(url), watch: connectSpectatorToRelay(url), rooms: createRoomsApi(url) } : null
  }, [])
  // El buscador de cartas está siempre, también en el lobby del duelo, salvo donde estorba o ya está: el builder (trae el suyo), la práctica y la sala o la mesa de un duelo.
  // El lobby avisa que lo es (`onLobbyChange`); hasta que lo hace —mientras baja la pantalla del duelo— cuenta como duelo, así el buscador no aparece un momento y se va.
  const [duelLobby, setDuelLobby] = useState(false)
  // En el celular el builder ya no lleva su propio botón de buscar: la lupa de la barra de arriba abre la búsqueda de cartas, como en las demás pantallas. En escritorio el builder trae el buscador a un costado.
  const searchAvailable = (!isDeckBuilderStep || !isDesktopDeckBuilder) && !isPracticeStep && (!isDuelStep || duelConnect === null || duelLobby)
  const searchActive = searchOpen && searchAvailable
  // La partida vive acá y no en la pantalla: salir de la práctica (a la calculadora, al builder) no pierde la mano ni el combo en curso.
  const { props: practice, resume: resumePractice, openShared } = usePracticeSession({
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
  // El duelo automático (beta): con el interruptor del lobby de Jugar prendido (y un navegador que pueda correr el núcleo), «Entrenar solo» abre la mesa contra el núcleo de reglas en vez de la práctica.
  const autoPrefs = useAutoPrefs()
  // «Seguir en manual» del automático es de esta partida, no del interruptor (que queda como estaba): al volver al lobby de Jugar, se olvida.
  const [manualHere, setManualHere] = useState(false)
  // Y al revés, «Seguir en automático» de la práctica: la mesa manual desde la que sigue el núcleo (no se guarda: recargar vuelve a empezar).
  const [resumeFrom, setResumeFrom] = useState<MatState | null>(null)

  if (manualHere && activeStep === 'duel') setManualHere(false)
  if (resumeFrom && activeStep === 'duel') setResumeFrom(null)
  const canAuto = autoPrefs.duel && canRunAuto()
  const autoSolo = canAuto && !manualHere
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

    // Un enlace de combo: se decodifica (es de otra persona: `combo-share.ts` lo valida) y se repasa en la práctica manual; si no sirve, se dice por qué.
    const openComboLink = () => {
      const payload = comboHash(window.location.hash)
      if (!payload) return
      void decodeComboPayload(payload).then((result) => {
        if (!result.ok) {
          showToastMessage(t(`practice.share.error.${result.error}`), 'error')
          window.history.replaceState(null, '', `#${activeStepRef.current}`)
          return
        }
        window.history.replaceState(null, '', '#practice')
        setManualHere(true)
        setActiveStep('practice')
        openShared(result.combo)
      })
    }
    const handleHashChange = () => {
      openComboLink()
      const nextStep = getStepFromHash(window.location.hash)

      if (nextStep) {
        setActiveStep(nextStep)
      }
    }

    openComboLink()
    window.addEventListener('hashchange', handleHashChange)

    return () => {
      window.removeEventListener('hashchange', handleHashChange)
    }
  }, [openShared])

  useEffect(() => {
    if (typeof window === 'undefined') {
      return
    }

    const nextHash = `#${activeStep}`

    // Sólo se toca el hash si cambió el paso: los parámetros de la vista (p. ej. el deck abierto) se respetan.
    if (getStepFromHash(window.location.hash) !== activeStep) {
      // Cada paso es una entrada del historial: "Atrás" vuelve al paso anterior en vez de salir de la app.
      // La primera vez (sin hash) se reemplaza para no duplicar la entrada inicial.
      // El enlace de un combo se reemplaza (los datos salen de la barra y «Atrás» no lo vuelve a abrir).
      if (window.location.hash && !comboHash(window.location.hash)) {
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

  // El buscador de cartas se cierra al cambiar de pantalla. Se abre desde el buscador de la app (`/` y Ctrl/Cmd+K, en el armazón) o su resultado «Buscar cartas».
  useEffect(() => {
    setSearchOpen(false)
  }, [activeStep])

  // Si el buscador deja de estar disponible estando abierto (el lobby pasó a sala), se cierra: al volver al lobby no reaparece solo.
  useEffect(() => {
    if (!searchAvailable) {
      setSearchOpen(false)
    }
  }, [searchAvailable])

  const handleStepChange = useCallback((nextStep: DeckWorkflowStepKey) => {
    if (nextStep !== activeStepRef.current) {
      setActiveStep(nextStep)
    }
  }, [])
  // Lo que dice la hoja de «Tu deck» del celular de Comparar (cuántas builds hay guardadas) y la de Duelo (si hay una sala en pausa) se lee de lo guardado al cambiar de pantalla.
  const [savedBuildCount, setSavedBuildCount] = useState(() => readSavedBuilds().length)
  const [pausedDuel, setPausedDuel] = useState(findPausedDuel)
  const refreshSheetData = useCallback(() => {
    setSavedBuildCount(readSavedBuilds().length)
    setPausedDuel(findPausedDuel())
  }, [])

  useEffect(refreshSheetData, [activeStep, refreshSheetData])
  const navigationItems = useMemo(
    () =>
      buildDeckWorkflowNavigationItems({
        mainDeckCount,
        roleCardCount: roleCards.length,
        unclassifiedCardCount,
        pendingReviewCount,
        hasCompletedRoleStep,
        patternCount,
        savedBuildCount,
      }),
    [
      hasCompletedRoleStep,
      mainDeckCount,
      patternCount,
      pendingReviewCount,
      roleCards.length,
      savedBuildCount,
      unclassifiedCardCount,
    ],
  )
  const deckBuilderStep = controller.deckBuilderStep
  const onCardQuery = deckBuilderStep.onQueryChange
  // El menú: los pasos del deck, las herramientas (la práctica es una pantalla; la calculadora y las mascotas abren un panel encima) y la referencia. La práctica necesita cartas en el Main.
  const navGroups = useMemo(() => buildAppNavGroups(navigationItems, { practice: mainDeckCount > 0, duel: duelConnect !== null, paused: pausedDuel }), [navigationItems, mainDeckCount, duelConnect, pausedDuel])
  const handleNavSelect = useCallback(
    (key: string, detail?: string) => {
      if (key === 'mascots') setMascotsOpen(true)
      // «Buscar … entre las cartas» del buscador de la app: se abre el de cartas con lo que se había escrito.
      else if (key === 'search') {
        if (detail) onCardQuery(detail)
        setSearchOpen(true)
      }
      // La hoja de Jugar del celular: el paso del lobby que pide cada entrada (el duelo lo lee de la dirección) o volver al duelo en pausa.
      else if (key === 'duel-watch' || key === 'duel-join') window.location.hash = `#duel?view=${key.slice('duel-'.length)}`
      else if (key === 'duel-resume') window.location.hash = pausedDuel ? `#duel?room=${pausedDuel.room}` : '#duel'
      else if (isDeckWorkflowStepKey(key)) handleStepChange(key)
    },
    [handleStepChange, pausedDuel, onCardQuery],
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
      <DeckBuilderStep {...deckBuilderStep} onBrowseTournaments={() => handleStepChange('tournaments')} onBackToPlay={playReturn ? () => (window.location.hash = playReturn) : undefined} />
    </div>
  ) : (
    <section
      className={cx(
        'grid content-start',
        isCategorizationStep ? 'h-full min-h-0' : isPracticeStep || isDuelStep || isLifeStep ? 'h-full min-h-0 grid-rows-[minmax(0,1fr)]' : 'min-h-full min-[1101px]:h-full min-[1101px]:min-h-0 min-[1101px]:grid-rows-[minmax(0,1fr)]',
      )}
    >
      {activeStep === 'categorization' ? (
        <div id="categorization" className="h-full min-h-0 min-w-0">
          <LazyDeckRolesPanel {...controller.roles} onOpenLab={() => handleStepChange('probability-lab')} />
        </div>
      ) : null}

      {activeStep === 'probability-lab' ? (
        <div id="probability-lab" className="min-w-0 min-[1101px]:min-h-full">
          <StepErrorBoundary title={t('lab.error.title')} backLabel={t('lab.error.back')} onBack={() => handleStepChange('deck-builder')}>
            <LazyProbabilityPanel {...controller.probability} />
          </StepErrorBoundary>
        </div>
      ) : null}

      {activeStep === 'export' ? (
        <div id="export" className="min-w-0 min-[1101px]:min-h-full">
          <LazyExportDeckPanel {...controller.exportDeck} onBack={() => handleStepChange('deck-builder')} />
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
          {autoSolo && matDeck.mainIds.length > 0 ? (
            // Con las reglas del Lab de la práctica: las salidas y problemas de la mano de apertura, también acá.
            <LazyAutoSolo mainIds={matDeck.mainIds} extraIds={matDeck.extraIds} cardsById={matDeck.cardsById} deckName={controller.exportDeck.deckName} handSize={controller.probability.handSize} onExit={() => { window.location.hash = '#duel' }} onManual={(game) => { if (game) resumePractice(game); setManualHere(true) }} {...(practice ? { lab: practice } : {})} {...(resumeFrom ? { resume: { state: resumeFrom, lp: [8000, 8000] as const } } : {})} />
          ) : practice ? (
            <LazyPracticeSection {...practice} {...(canAuto ? { onAuto: (state: MatState) => { setResumeFrom(state); setManualHere(false) } } : {})} />
          ) : (
            <Callout tone="info" className="m-4">{t('practice.section.needCards')}</Callout>
          )}
        </div>
      ) : null}

      {activeStep === 'life' ? (
        // Con el celular acostado (`PHONE_LANDSCAPE_MEDIA_QUERY`) la calculadora es un marcador y usa todo el ancho.
        <div id="life" className="mx-auto h-full min-h-0 w-full min-w-0 max-w-2xl [@media(width<1101px)_and_(orientation:landscape)_and_(height<=500px)]:max-w-none">
          <Heading level="page" className="sr-only">
            {t('shell.life.title')}
          </Heading>
          <LazyLifeCalculatorScreen />
        </div>
      ) : null}

      {activeStep === 'duel' ? (
        <div id="duel" className="h-full min-h-0 min-w-0">
          <Heading level="page" className="sr-only">
            {t('shell.nav.group.duel')}
          </Heading>
          {duelConnect ? (
            <LazyDuelScreen handSize={controller.probability.handSize} mainIds={matDeck.mainIds} extraIds={matDeck.extraIds} sideIds={matDeck.sideIds} cardsById={matDeck.cardsById} deckName={controller.exportDeck.deckName} connect={duelConnect.play} connectSpectator={duelConnect.watch} rooms={duelConnect.rooms} onImmersiveChange={setDuelTable} onLobbyChange={setDuelLobby} autoDuel={LazyAutoDuel} />
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

      {activeStep === 'tier-maker' ? (
        <div id="tier-maker" className="min-w-0 min-[1101px]:min-h-full">
          <LazyTierMakerScreen />
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
        isDeckBuilderStep || isCategorizationStep || isPracticeStep || isDuelStep || isLifeStep ? 'h-full min-h-0' : 'min-h-full min-[1101px]:h-full min-[1101px]:min-h-0',
      )}
    >
      <Suspense fallback={null}>{stepContent}</Suspense>
    </div>
  )

  return (
    <>
      <AppShell groups={navGroups} activeKey={activeStep} onSelect={handleNavSelect} onOpenCard={controller.openFoundCard} onSheetOpen={refreshSheetData} contentScrollable={!isDeckBuilderStep && !isPracticeStep && !isDuelStep && !isLifeStep} fitScreen={isLifeStep} immersive={isPracticeStep || (isDuelStep && (duelTable || isDesktopDeckBuilder))} navbar={!(isPracticeStep || (isDuelStep && duelTable))} contentScrollRef={contentScrollRef} searchAvailable={searchAvailable}>
        {mainContent}
      </AppShell>

      <DeckModeDragOverlay
        overlay={controller.feedback.dragOverlay}
        overlayRef={controller.feedback.dragOverlayRef}
      />
      {/* Al cerrarse (también al cambiar de pantalla) sale: `Presence` la deja montada mientras se funde o vuelve a la derecha. */}
      <Presence>{searchActive ? <GlobalCardSearch step={deckBuilderStep} onClose={() => setSearchOpen(false)} /> : null}</Presence>
      {/* El detalle va encima: en el celular siempre, y en escritorio cuando se abre desde el buscador global (en el builder es la vista previa de la columna). */}
      {!isDesktopDeckBuilder || searchActive || !isDeckBuilderStep ? (
        <CardDetailModal
          card={controller.deckBuilderStep.selectedDetailCard}
          deckFormat={controller.deckBuilderStep.deckFormat}
          isOpen={controller.deckBuilderStep.isCardDetailOpen}
          showActions={controller.deckBuilderStep.selectedDetailSource !== 'deck'}
          deckCopy={controller.deckBuilderStep.selectedDeckCopyActions}
          navigation={controller.deckBuilderStep.selectedDetailNavigation}
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

      {/* Calculadora de LP: es una vista (se abre desde el menú); mientras corre el reloj de la ronda, un botón flotante lleva a ella desde cualquier otra pantalla. */}
      <LifeCalculatorFab onOpen={() => handleStepChange('life')} hidden={duelTable || isLifeStep} />

      {/* Las mascotas: se abre desde el menú y deja sacar hasta tres a la vez. */}
      <MascotsModal isOpen={mascotsOpen} onClose={() => setMascotsOpen(false)} />
    </>
  )
}


// ── La práctica ──

type PracticeScreenProps = ComponentProps<typeof LazyPracticeSection>

/** Las copias del deck armado como las juega la mesa: ids de cada carta (`card-123-2`) del Main y del Extra, y cómo se llama cada una. */
function usePracticeDeck(derivedMainCards: import('../../types').CardEntry[], extraZone: DeckCardInstance[], sideZone: DeckCardInstance[]) {
  const mainIds = useMemo(() => buildPracticeDeck(derivedMainCards).map((card) => card.drawId), [derivedMainCards])
  const extraCards = useMemo(() => buildPracticeDeck(deriveMainDeckCardsFromZone(extraZone)), [extraZone])
  const extraIds = useMemo(() => extraCards.map((card) => card.drawId), [extraCards])
  const sideCards = useMemo(() => buildPracticeDeck(deriveMainDeckCardsFromZone(sideZone)), [sideZone])
  const sideIds = useMemo(() => sideCards.map((card) => card.drawId), [sideCards])
  const cardsById = useMemo(
    () => new Map([...buildPracticeDeck(derivedMainCards), ...extraCards, ...sideCards].map((card) => [card.drawId, { name: card.name, apiCard: card.apiCard }])),
    [derivedMainCards, extraCards, sideCards],
  )

  return { mainIds, extraIds, sideIds, cardsById }
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
}: PracticeSessionInput): { props: PracticeScreenProps | null; resume: (game: ManualGame) => void; openShared: (combo: SharedCombo) => void } {
  const activePatterns = useMemo(
    () => buildActiveRuleSet(derivedMainCards, curatePatterns(patterns, derivedMainCards), disabledGenericRuleIds, systemRuleNames),
    [patterns, derivedMainCards, disabledGenericRuleIds, systemRuleNames],
  )
  const missingOriginCount = useMemo(() => countCardsMissingOrigin(derivedMainCards), [derivedMainCards])
  const missingRoleCount = useMemo(() => countCardsMissingRoles(derivedMainCards), [derivedMainCards])
  const pendingReviewCount = useMemo(() => countCardsPendingReview(derivedMainCards), [derivedMainCards])
  const reviewPendingPatternCount = useMemo(() => patterns.filter((p) => p.needsReview).length, [patterns])

  const { session, state, start, dispatch, undo, seek, clear } = useMatSession()
  // El combo que llegó por enlace, mientras no se guarde ni se cierre: la mesa lo repasa con su aviso arriba.
  const [sharedCombo, setSharedCombo] = useState<SharedCombo | null>(null)
  const openShared = useCallback((combo: SharedCombo) => {
    setSharedCombo(combo)
    start(combo.initial, combo.actions, combo.names)
  }, [start])
  const shared = useMemo(
    () => (sharedCombo ? { combo: sharedCombo, onSaved: () => setSharedCombo(null), onClose: () => { setSharedCombo(null); clear() } } : undefined),
    [sharedCombo, clear],
  )
  // Con qué simulador de handtraps se repartió la mano de ahora (lo que se eligió en Jugar → Solo): si al volver a la mesa sin haber jugado nada es otro, se reparte de nuevo.
  const dealtWith = useRef<string | null>(null)
  const newHand = useCallback(() => {
    const config = readHandtrapConfig()
    const table = createMatState(shuffleWithSeed(mainIds, randomSeed()), extraIds, handSize)
    // La mano del rival también se sortea (de las handtraps elegidas): cada «Nueva mano» le reparte otra.
    const rival = dealRival(config, randomSeed())

    dealtWith.current = JSON.stringify(config)
    setSharedCombo(null)
    start(rival ? { ...table, rival: rival.rival } : table, [], rival?.names)
  }, [start, mainIds, extraIds, handSize])
  const loadCombo = useCallback((combo: SavedCombo) => { setSharedCombo(null); start(combo.initial, combo.actions, combo.names) }, [start])
  // La partida del automático («Seguir en manual»): en vivo, con todo su historial (Deshacer y los Pasos siguen), y sin repartir otra mano al entrar.
  const resume = useCallback(
    (game: ManualGame) => {
      dealtWith.current = JSON.stringify(readHandtrapConfig())
      start(game.initial, game.actions, game.names, true)
    },
    [start],
  )

  // Al entrar a la práctica ya se roban las cartas de la mano (también si la mano de antes, sin jugadas, se repartió con otras handtraps del rival).
  useEffect(() => {
    if (!active || mainIds.length < handSize) return

    const untouched = session !== null && !session.replay && session.actions.length === 0

    if (!session || (untouched && dealtWith.current !== JSON.stringify(readHandtrapConfig()))) {
      newHand()
    }
  }, [active, session, mainIds.length, handSize, newHand])

  if (!session || !state) {
    return { props: null, resume, openShared }
  }

  const props: PracticeScreenProps = {
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
    shared,
  }

  return { props, resume, openShared }
}
