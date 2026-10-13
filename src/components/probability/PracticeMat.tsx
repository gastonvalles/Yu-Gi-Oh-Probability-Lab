import { useCallback, useEffect, useMemo, useRef, useState, type KeyboardEvent as ReactKeyboardEvent, type ReactNode } from 'react'
import { createPortal } from 'react-dom'

import { parseDerivedCardId } from '../../app/calculator-state'
import { matEffects, type LandingTone, type SpotlightKind } from '../../app/mat-effects'
import {
  allMatIds,
  banishItem,
  cardKindOf,
  describeMatSteps,
  freeTargets,
  isToken,
  listCardActions,
  locateCard,
  matReducer,
  monstersOnField,
  monsterZones,
  PHASES,
  placedAt,
  randomSeed,
  replayMat,
  TOKEN_KIND,
  type MatAction,
  type MatMenuItem,
  type MatPhase,
  type MatPile,
  type MatSpot,
  type MatState,
  type MatTarget,
  type Placed,
} from '../../app/practice-mat'
import { mergeHandOrder } from '../../app/practice-hand-layout'
import { createSavedCombo, readSavedCombos, writeSavedCombos, type SavedCombo } from '../../app/saved-combos'
import { UI_ANIMATION_MS } from '../../app/motion'
import { useCardFlights } from '../../app/use-card-flights'
import { DESKTOP_DECK_BUILDER_MEDIA_QUERY, useMediaQuery } from '../../app/use-media-query'
import { useEscapeKey } from '../../app/use-overlay'
import { showToastMessage } from '../../app/use-toast-message'
import { useMatDrag, type MatDragSource, type MatDropTarget } from '../../app/use-mat-drag'
import type { MatSession } from '../../app/use-mat-session'
import { t } from '../../i18n'
import type { ApiCardReference, PatternKind } from '../../types'
import { fetchCardsByIds } from '../../ygoprodeck'
import { CardArt } from '../CardArt'
import { CardDetailOverlay } from '../card-detail/CardDetailOverlay'
import { Button } from '../ui/Button'
import { cx } from '../ui/cx'
import { Icon } from '../ui/Icon'
import { IconButton } from '../ui/IconButton'
import { Modal } from '../ui/Modal'
import { CardBack, CardMenu, PILE_TITLES, PileViewer, SaveComboDialog, type MenuItem } from './MatDialogs'
import { FX_CARD, FxFrame, LandingBurst, PhaseBanner, SPOTLIGHT_TONE, Spotlight, TargetMark, fxVars } from './MatFx'
import { cardIdOfDrawId } from './practice'
import { PracticeHand, type HandCardData } from './PracticeHand'
import { PracticeMatPanel } from './PracticeMatPanel'
import { CARD_BACK, PRACTICE_PALETTE } from './practice-styles'

export interface MatCard {
  name: string
  apiCard: ApiCardReference | null
  /** Imagen propia, para lo que no es una carta del deck (la ficha). */
  art?: string
}

interface PracticeMatProps {
  session: MatSession
  state: MatState
  /** Las cartas del deck actual por id de copia ("card-123-2"). */
  cardsById: ReadonlyMap<string, MatCard>
  deckName: string
  onDispatch: (action: MatAction) => void
  onUndo: () => void
  onSeek: (step: number) => void
  onLoadCombo: (combo: SavedCombo) => void
  onNewHand: () => void
  /** Debajo de la mano: las salidas y problemas de la mano inicial (aparece cuando terminó de repartirse). */
  footer?: ReactNode
  /** Cartas (por id) que brillan: las que cumplen la salida o el problema tocado. */
  highlighted?: ReadonlySet<string>
  highlightKind?: PatternKind | null
  /** Mano sin salida: las cartas de la mano se ven grises. */
  muted?: boolean
}

/** Fuentes de arrastre que no son cartas: el tope del deck y la ficha. */
const DECK_TOP = 'deck-top'
const NEW_TOKEN = 'new-token'

/** La ficha se dibuja con la "Sheep Token" de YGOPRODeck, del mismo lugar de donde vienen las imágenes de todas las cartas. */
const TOKEN_ART = 'https://images.ygoprodeck.com/images/cards_small/73915052.jpg'
// El nombre se arma al leerlo (no al cargar el módulo): así sale en el idioma activo.
const TOKEN_CARD: MatCard = { get name() { return t('practice.token.name') }, apiCard: null, art: TOKEN_ART }
const UNKNOWN_CARD: MatCard = { get name() { return t('practice.card.unknown') }, apiCard: null }
const EMPTY_IDS: ReadonlySet<string> = new Set()

/** Pausa antes de repartir la primera carta (mientras el mazo se baraja) y entre carta y carta. */
const FIRST_DEAL_MS = 90
const NEXT_DEAL_MS = 55

/** Celda del campo o de una pila: borde punteado; se enciende con una carta arrastrada encima y respira en verde cuando se está eligiendo. */
const CELL = [
  'relative aspect-[421/614] min-w-0 border border-dashed border-tint/20 transition-[color,background-color,border-color,box-shadow] duration-150',
  // Con una carta arrastrada encima: borde parejo, relleno y resplandor violeta.
  'data-[over=true]:border-solid data-[over=true]:border-primary-hover data-[over=true]:bg-primary/25 data-[over=true]:shadow-[0_0_0_2px_rgb(var(--primary-hover-rgb)/0.55),0_0_24px_rgb(var(--primary-hover-rgb)/0.6),inset_0_0_18px_rgb(var(--primary-hover-rgb)/0.35)]',
  // Una zona que se puede elegir respira en verde y un aro se le expande desde el borde.
  'data-[pick=true]:cursor-pointer data-[pick=true]:border-solid data-[pick=true]:border-accent data-[pick=true]:bg-accent/15 data-[pick=true]:animate-fx-pick data-[pick=true]:hover:bg-accent/25',
  'data-[pick=true]:after:pointer-events-none data-[pick=true]:after:absolute data-[pick=true]:after:-inset-1 data-[pick=true]:after:animate-fx-ripple data-[pick=true]:after:border-2 data-[pick=true]:after:border-accent',
  'data-[chosen=true]:bg-accent/40',
  'motion-reduce:animate-none motion-reduce:after:hidden motion-reduce:data-[pick=true]:shadow-[0_0_0_2px_rgb(var(--accent-rgb)/0.75),0_0_16px_rgb(var(--accent-rgb)/0.45)]',
].join(' ')

/**
 * Carta en una zona del campo: arrastrable, sin menú de imagen ni selección (así el dedo no corta el arrastre).
 * El brillo (salida verde / problema rojo), la atenuación, el destello y la marca de objetivo llegan por data-attributes.
 */
const MAT_CARD = [
  'relative block aspect-[421/614] w-full cursor-grab touch-none select-none overflow-hidden bg-input outline-none',
  '[-webkit-touch-callout:none] [-webkit-user-select:none] [&>*]:pointer-events-none [&_img]:[-webkit-user-drag:none]',
  '[--card-shadow:0_6px_14px_rgba(0,0,0,0.45),0_0_0_1px_rgb(var(--foreground-rgb)/0.1)]',
  'shadow-[0_6px_14px_rgba(0,0,0,0.45),0_0_0_1px_rgb(var(--foreground-rgb)/0.1)]',
  // Al cambiar de posición la carta se acuesta (o se para) pasándose un poco y volviendo.
  '[transition:transform_var(--motion-duration)_cubic-bezier(0.3,1.35,0.5,1),filter_var(--motion-duration)_ease,box-shadow_var(--motion-duration)_ease]',
  'focus-visible:shadow-[0_6px_14px_rgba(0,0,0,0.45),0_0_0_2px_rgb(var(--primary-hover-rgb))]',
  'data-[dragging=true]:pointer-events-none data-[dragging=true]:opacity-30',
  'data-[dim=true]:brightness-[0.42] data-[dim=true]:saturate-[0.6]',
  'data-[glow=true]:animate-card-glow data-[glow=true]:[--glow-rgb:var(--accent-rgb)] data-[glow-kind=problem]:[--glow-rgb:var(--danger-rgb)]',
  'data-[glow=true]:shadow-[0_6px_14px_rgba(0,0,0,0.45),0_0_0_3px_rgb(var(--glow-rgb)),0_0_30px_5px_rgb(var(--glow-rgb)/0.7)]',
  // Activar, mostrar, declarar y marcar como objetivo: el aro de afuera (el marco de adentro y la mira son hijos de la carta).
  FX_CARD,
  'motion-reduce:animate-none motion-reduce:transition-none',
].join(' ')

/** Duración del destaque de una carta: lo que dura la carta grande en el centro de la pantalla (y el aro en su lugar). */
const ACTIVATE_MS = 950
/** Cuánto se queda el destello de una invocación (con lo que espera a que la carta aterrice) y el cartel de una fase. */
const LANDING_MS = 1300
const BANNER_MS = 1100

/** Dar vuelta una carta (boca abajo ↔ boca arriba): se angosta hasta ser una línea y se vuelve a abrir. Va por `scale` (aparte de `transform`) para no pisar la rotación ni el vuelo. */
const FLIP_FRAMES = [{ scale: '1 1' }, { scale: '0.04 1', offset: 0.5 }, { scale: '1 1' }]
const FLIP_MS = 380

const ZONE_LABELS: Record<MatSpot, string> = {
  get mz() { return t('practice.zone.mz') },
  get emz() { return t('practice.zone.emz') },
  get st() { return t('practice.zone.st') },
  get field() { return t('practice.zone.field') },
}

/** Las zonas de péndulo (las puntas de la fila de magias y trampas) llevan la gema azul y la roja, como en la mesa real. */
const PENDULUM_GEM: Record<number, string> = {
  0: 'bg-[#4aa8ff]/55 shadow-[0_0_10px_#4aa8ff80]',
  4: 'bg-[#ff4d6d]/55 shadow-[0_0_10px_#ff4d6d80]',
}

const artOf = (card: MatCard) => card.art ?? card.apiCard?.imageUrlSmall ?? card.apiCard?.imageUrl ?? null

/** Una jugada que todavía espera algo del jugador: los Sacrificios y/o la zona. */
type Picking =
  | { kind: 'zone'; label: string; action: Extract<MatAction, { type: 'place' | 'token' | 'tribute' | 'summon' }>; targets: MatTarget[] }
  | { kind: 'tributes'; label: string; required: number; chosen: string[]; action: Extract<MatAction, { type: 'tribute' }>; zone?: MatTarget }
  /** Invocación desde el Extra: se tocan los materiales en el campo (los que sean) y se confirma con un botón. */
  | { kind: 'materials'; label: string; chosen: string[]; action: Extract<MatAction, { type: 'summon' }>; zone?: MatTarget }

const toggle = (list: string[], id: string) => (list.includes(id) ? list.filter((entry) => entry !== id) : [...list, id])

/** Reproducción de un combo: cuánto espera entre jugadas, normal y con el avance rápido. */
const AUTOPLAY_MS = 1400
const FAST_AUTOPLAY_MS = 450

/** Botones redondos del replay (pausa / reproducir y avance rápido), como los de un replay de videojuego; apretado = claro. */
const REPLAY_BUTTON =
  'inline-flex size-8 shrink-0 items-center justify-center rounded-full border border-tint/30 bg-card-background text-foreground shadow-[0_2px_8px_rgba(0,0,0,0.4)] transition-[background-color,border-color,color] duration-150 hover:bg-tint/14 focus-visible:outline-none focus-visible:shadow-focus pointer-coarse:size-10 [&_svg]:block [&_svg]:size-4 aria-pressed:border-foreground aria-pressed:bg-foreground aria-pressed:text-background aria-pressed:hover:bg-foreground/90'

/** `data-drop` y nombre de una zona de la mesa. */
const dropIdOf = (spot: MatSpot, index: number) => (spot === 'field' ? 'field' : `${spot}:${index}`)
const zoneLabelOf = (spot: MatSpot, index: number) => (spot === 'field' ? ZONE_LABELS.field : t('practice.zone.numbered', { zone: ZONE_LABELS[spot], n: index + 1 }))

function prefersReducedMotion(): boolean {
  return typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches === true
}

export function PracticeMat({
  session,
  state,
  cardsById,
  deckName,
  onDispatch,
  onUndo,
  onSeek,
  onLoadCombo,
  onNewHand,
  footer,
  highlighted = EMPTY_IDS,
  highlightKind = null,
  muted = false,
}: PracticeMatProps) {
  const isDesktop = useMediaQuery(DESKTOP_DECK_BUILDER_MEDIA_QUERY)

  // Las cartas de un combo guardado pueden no estar más en el deck: se buscan por carta (otra copia) o se bajan.
  const byCardId = useMemo(() => {
    const map = new Map<string, MatCard>()
    for (const [drawId, card] of cardsById) {
      map.set(cardIdOfDrawId(drawId), card)
    }
    return map
  }, [cardsById])
  const [fetched, setFetched] = useState<ReadonlyMap<number, MatCard>>(new Map())
  const requestedRef = useRef(new Set<number>())

  const cardOf = useCallback(
    (id: string): MatCard => {
      if (isToken(id)) return TOKEN_CARD

      const known = cardsById.get(id) ?? byCardId.get(cardIdOfDrawId(id))
      if (known) return known

      const ygoId = parseDerivedCardId(cardIdOfDrawId(id))
      const remote = ygoId === null ? undefined : fetched.get(ygoId)
      return remote ?? { name: session.names[id] ?? UNKNOWN_CARD.name, apiCard: null }
    },
    [cardsById, byCardId, fetched, session.names],
  )

  useEffect(() => {
    const missing = [...new Set(allMatIds(state).map(cardIdOfDrawId))]
      .filter((cardId) => !byCardId.has(cardId))
      .map(parseDerivedCardId)
      .filter((ygoId): ygoId is number => ygoId !== null && !fetched.has(ygoId) && !requestedRef.current.has(ygoId))

    if (missing.length === 0) return

    missing.forEach((ygoId) => requestedRef.current.add(ygoId))
    void fetchCardsByIds(missing)
      .then((cards) => setFetched((current) => new Map([...current, ...cards.map((card) => [card.ygoprodeckId, { name: card.name, apiCard: card }] as const)])))
      .catch(() => {})
  }, [state, byCardId, fetched])

  const nameOf = useCallback((id: string) => cardOf(id).name, [cardOf])
  const kindOf = useCallback((id: string) => (isToken(id) ? TOKEN_KIND : cardKindOf(cardOf(id).apiCard)), [cardOf])
  const steps = useMemo(() => describeMatSteps(session.initial, session.actions, nameOf), [session.initial, session.actions, nameOf])
  const live = session.cursor === session.actions.length

  const [menu, setMenu] = useState<
    /** `submenu`: el segundo paso ("¿En ataque o en defensa?", "¿Boca arriba o boca abajo?") se muestra en el mismo menú. */
    | { kind: 'card'; id: string; rect: DOMRect; submenu?: { label: string; items: MatMenuItem[] } }
    | { kind: 'deck'; rect: DOMRect; submenu?: { label: string; items: MatMenuItem[] } }
    /** La ficha: sale en ataque o en defensa, en la zona donde se soltó (`zone`) o en la que se elija después. */
    | { kind: 'token'; rect: DOMRect; zone?: MatTarget }
    | null
  >(null)
  const [viewer, setViewer] = useState<MatPile | null>(null)
  const [inspected, setInspected] = useState<{ id: string; rect: DOMRect } | null>(null)
  const [saving, setSaving] = useState(false)
  const [panelOpen, setPanelOpen] = useState(false)
  const [combos, setCombos] = useState<SavedCombo[]>(() => readSavedCombos())
  const [picking, setPicking] = useState<Picking | null>(null)
  // La carta que acaba de destacarse (activada, mostrada, declarada o marcada como objetivo) destella un instante; la `key` repite el destello si pasa dos veces seguidas.
  const [flash, setFlash] = useState<{ id: string; key: number; kind: SpotlightKind } | null>(null)
  // La zona donde acaba de caer un monstruo y el cartel de la fase nueva: cada uno se va solo.
  const [landing, setLanding] = useState<{ spot: MatSpot; index: number; tone: LandingTone; flies: boolean; key: number } | null>(null)
  const [banner, setBanner] = useState<{ phase: MatPhase; turn: number | null; key: number } | null>(null)
  // Zona de la mesa bajo una carta de la mano que se está arrastrando.
  const [handOver, setHandOver] = useState<string | null>(null)

  useEscapeKey(() => setPicking(null), picking !== null)

  useEffect(() => {
    if (!flash) return
    const timer = window.setTimeout(() => setFlash(null), ACTIVATE_MS)
    return () => window.clearTimeout(timer)
  }, [flash])

  useEffect(() => {
    if (!landing) return
    const timer = window.setTimeout(() => setLanding(null), LANDING_MS)
    return () => window.clearTimeout(timer)
  }, [landing])

  useEffect(() => {
    if (!banner) return
    const timer = window.setTimeout(() => setBanner(null), BANNER_MS)
    return () => window.clearTimeout(timer)
  }, [banner])

  // Los efectos salen con cada paso que avanza (jugadas propias y replay por igual): ver `matEffects`. Deshacer o saltar de paso no los repite.
  const lastCursorRef = useRef(session.cursor)

  useEffect(() => {
    const previous = lastCursorRef.current
    lastCursorRef.current = session.cursor

    if (session.cursor !== previous + 1) return

    const action = session.actions[session.cursor - 1]

    if (!action) return

    const effects = matEffects(replayMat(session.initial, session.actions, session.cursor - 1), action)
    const key = Date.now()

    if (effects.spotlight) setFlash({ ...effects.spotlight, key })
    if (effects.landing) setLanding({ ...effects.landing, key })
    if (effects.banner) setBanner({ ...effects.banner, key })
  }, [session.cursor, session.actions, session.initial])

  // La mano: el orden que le dio el jugador, y el reparto de a una carta desde el mazo (que se baraja con cada mano nueva).
  const [handOrder, setHandOrder] = useState<string[]>([])
  const [dealt, setDealt] = useState(0)
  const [shuffleKey, setShuffleKey] = useState(0)
  const deckRef = useRef<HTMLDivElement | null>(null)
  const fieldRef = useRef<HTMLDivElement | null>(null)

  useEffect(() => {
    setHandOrder([])
    setDealt(0)
    setShuffleKey((key) => key + 1)
    setPicking(null)
  }, [session.initial])

  const handTotal = state.hand.length

  useEffect(() => {
    if (dealt >= handTotal) {
      return
    }

    if (prefersReducedMotion()) {
      setDealt(handTotal)
      return
    }

    const timer = window.setTimeout(() => setDealt((count) => count + 1), dealt === 0 ? FIRST_DEAL_MS : NEXT_DEAL_MS)
    return () => window.clearTimeout(timer)
  }, [dealt, handTotal])

  const orderedHand = useMemo(() => mergeHandOrder(handOrder, state.hand), [handOrder, state.hand])
  const handCards = useMemo<HandCardData[]>(() => orderedHand.slice(0, dealt).map((id) => ({ id, ...cardOf(id) })), [orderedHand, dealt, cardOf])
  const isDealt = dealt >= handTotal

  // Las cartas vuelan entre zonas con cada jugada (y al reproducir un combo).
  const sectionRef = useRef<HTMLElement | null>(null)
  const artById = useCallback((id: string) => artOf(cardOf(id)), [cardOf])
  // Al terminar el reparto las cartas se vuelven a medir quietas: la última medición las agarraba en pleno vuelo desde el mazo
  // (achicadas y giradas) y el siguiente vuelo arrancaba de ahí, con una carta gigante y estirada.
  const [settled, setSettled] = useState(false)

  useEffect(() => {
    if (!isDealt) {
      setSettled(false)
      return
    }

    const timer = window.setTimeout(() => setSettled(true), UI_ANIMATION_MS + 60)
    return () => window.clearTimeout(timer)
  }, [isDealt])

  const { dealsFromDeck } = useCardFlights(sectionRef, state, artById, `${isDesktop}:${dealt}:${settled}:${handOrder.join(',')}`)

  // Reproducir un combo: las jugadas avanzan solas (arranca al cargarlo; cualquier jugada propia lo pausa), más rápido con el avance rápido.
  const [autoplay, setAutoplay] = useState(false)
  const [fast, setFast] = useState(false)

  useEffect(() => {
    if (!autoplay || !isDealt) return

    if (session.cursor >= session.actions.length) {
      setAutoplay(false)
      return
    }

    const timer = window.setTimeout(() => onSeek(session.cursor + 1), fast ? FAST_AUTOPLAY_MS : AUTOPLAY_MS)
    return () => window.clearTimeout(timer)
  }, [autoplay, isDealt, session.cursor, session.actions.length, onSeek, fast])

  const closeViewer = useCallback(() => {
    // Después de mirar el deck sin sacar nada se baraja, como en la mesa real (y la jugada queda anotada).
    if (viewer === 'deck') {
      onDispatch({ type: 'shuffle', seed: randomSeed() })
      setShuffleKey((key) => key + 1)
    }

    setViewer(null)
  }, [viewer, onDispatch])

  /** Sacar una carta mirando el deck: el resto se baraja en la misma jugada (buscar = un paso, que se deshace entero). */
  const searching = useCallback(
    (action: MatAction): action is Extract<MatAction, { type: 'move' | 'place' }> =>
      viewer === 'deck' && (action.type === 'move' || action.type === 'place') && state.deck.includes(action.id),
    [viewer, state.deck],
  )

  const play = useCallback(
    (action: MatAction) => {
      const searched = searching(action)
      const played: MatAction = searched ? { ...action, shuffle: randomSeed() } : action

      onDispatch(played)
      setMenu(null)
      setPicking(null)
      setAutoplay(false)

      if (played.type === 'shuffle' || ((played.type === 'move' || played.type === 'place') && played.shuffle !== undefined)) {
        setShuffleKey((key) => key + 1)
      }

      if (searched) {
        setViewer(null)
      } else if (viewer) {
        closeViewer()
      }
    },
    [onDispatch, viewer, closeViewer, searching],
  )

  /** Una jugada del menú: con Sacrificios primero se eligen; si puede salir a varias zonas, la mesa pide elegir una (como "Choose Zones" en DuelingBook). */
  const choose = useCallback(
    (item: MatMenuItem) => {
      // Segundo paso del menú ("¿En ataque o en defensa?"): se muestran las opciones en el mismo menú.
      if (item.choices) {
        setMenu((current) => (current && current.kind !== 'token' ? { ...current, submenu: { label: item.label, items: item.choices! } } : current))
        return
      }

      const pick = (picking: Picking) => {
        setMenu(null)

        // La carta sale del deck recién al elegir la zona: la jugada ya lleva el barajado y el visor se cierra sin barajar aparte.
        if (picking.kind === 'zone' && picking.action.type === 'place' && searching(picking.action)) {
          setPicking({ ...picking, action: { ...picking.action, shuffle: randomSeed() } })
          setViewer(null)
          return
        }

        setPicking(picking)

        if (viewer) {
          closeViewer()
        }
      }

      if (item.tributes && item.action.type === 'tribute') {
        pick({ kind: 'tributes', label: item.label, required: item.tributes, chosen: [], action: item.action, zone: item.targets?.length === 1 ? item.targets[0] : undefined })
        return
      }

      if (item.materials && item.action.type === 'summon') {
        pick({ kind: 'materials', label: item.label, chosen: [], action: item.action, zone: item.targets?.length === 1 ? item.targets[0] : undefined })
        return
      }

      if (item.targets && item.targets.length > 1 && item.action.type === 'place') {
        pick({ kind: 'zone', label: item.label, action: item.action, targets: item.targets })
        return
      }

      play(item.action)
    },
    [play, viewer, closeViewer, searching],
  )

  const pickZone = (zone: MatSpot, index: number) => {
    if (picking?.kind !== 'zone') return

    if (picking.action.type === 'token' || picking.action.type === 'tribute' || picking.action.type === 'summon') {
      if (zone === 'mz' || zone === 'emz') play({ ...picking.action, zone, index })
      return
    }

    play({ ...picking.action, zone, index })
  }

  /** Con los Sacrificios o los materiales elegidos (que dejan el campo), la carta sale a la zona donde se soltó si sigue libre, a la única libre, o se elige una. */
  const summonAfter = (label: string, action: Extract<MatAction, { type: 'tribute' | 'summon' }>, removed: string[], dropped?: MatTarget) => {
    const after = removed.reduce((current, id) => matReducer(current, { type: 'move', id, to: 'gy' }), state)
    const targets = freeTargets(after, monsterZones(action.type === 'summon'))
    const zone = dropped && targets.some((target) => target.zone === dropped.zone && target.index === dropped.index) ? dropped : targets.length === 1 ? targets[0] : null

    if (zone) play({ ...action, zone: zone.zone as 'mz' | 'emz', index: zone.index })
    else if (targets.length > 0) setPicking({ kind: 'zone', label, action, targets })
  }

  /** Un monstruo del campo elegido como Sacrificio; con todos elegidos, se pasa a la zona. */
  const pickTribute = (id: string) => {
    if (picking?.kind !== 'tributes') return

    const chosen = toggle(picking.chosen, id)

    if (chosen.length < picking.required) setPicking({ ...picking, chosen })
    else summonAfter(picking.label, { ...picking.action, tributes: chosen }, chosen, picking.zone)
  }

  /** Un monstruo del campo elegido (o deselegido) como material de una Invocación desde el Extra; se confirma con el botón. */
  const pickMaterial = (id: string) => {
    if (picking?.kind === 'materials') setPicking({ ...picking, chosen: toggle(picking.chosen, id) })
  }

  const confirmMaterials = () => {
    if (picking?.kind === 'materials' && picking.chosen.length > 0) summonAfter(picking.label, { ...picking.action, materials: picking.chosen }, picking.chosen, picking.zone)
  }

  /** La ficha en esa posición: en la zona donde se soltó, en la única libre, o la mesa pide tocar una zona (de las principales: una ficha no viene del Extra). */
  const summonToken = useCallback(
    (pos: 'atk' | 'def', dropped?: MatTarget) => {
      const targets = freeTargets(state, monsterZones(false))
      const first = dropped ?? targets[0]

      if (!first) {
        setMenu(null)
        return
      }

      const action = { type: 'token' as const, zone: first.zone as 'mz' | 'emz', index: first.index, pos }

      if (dropped || targets.length === 1) {
        play(action)
      } else {
        setMenu(null)
        setPicking({ kind: 'zone', label: t('practice.token.the'), action, targets })
      }
    },
    [state, play],
  )

  const openCard = useCallback(
    (id: string, rect: DOMRect) => {
      if (picking?.kind === 'tributes' || picking?.kind === 'materials') {
        if (monstersOnField(state).includes(id)) (picking.kind === 'tributes' ? pickTribute : pickMaterial)(id)
        return
      }

      // Eligiendo la zona, tocar la carta que la ocupa (un Sacrificio o un material que se va) elige esa zona, como en el juego real.
      if (picking?.kind === 'zone') {
        const where = locateCard(state, id)

        if (where?.kind === 'spot' && picking.targets.some((target) => target.zone === where.spot && target.index === where.index)) {
          pickZone(where.spot, where.index)
          return
        }
      }

      setPicking(null)
      setMenu({ kind: 'card', id, rect })
    },
    // pickTribute y pickMaterial leen `picking` y `state` del render actual.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [picking, state],
  )

  /** Las jugadas del menú que sacan la carta justo a esa zona, con la posición ya desplegada ("Invocación Normal: en ataque"). */
  const dropChoices = useCallback(
    (id: string, zone: MatSpot, index: number): MatMenuItem[] =>
      listCardActions(state, id, kindOf, nameOf)
        .flatMap((item) => (item.choices ? item.choices.map((choice) => ({ ...choice, label: `${item.label}: ${choice.label.toLowerCase()}` })) : [item]))
        .flatMap((item): MatMenuItem[] => {
          const targets = [{ zone, index }]

          if (item.action.type === 'tribute') return zone === 'mz' ? [{ ...item, action: { ...item.action, zone, index }, targets }] : []
          if (item.action.type === 'place' && item.targets?.some((target) => target.zone === zone && target.index === index)) return [{ ...item, action: { ...item.action, zone, index }, targets }]
          return []
        }),
    [state, kindOf, nameOf],
  )

  /** Soltar una carta de una pila en una zona libre: si puede salir de varias formas, la mesa pregunta cómo (como DuelingBook); si de una sola, sale así. */
  const dropInto = useCallback(
    (id: string, zone: MatSpot, index: number) => {
      const choices = dropChoices(id, zone, index)
      const only = choices[0]
      const anchor = sectionRef.current?.querySelector(`[data-drop="${dropIdOf(zone, index)}"]`) ?? sectionRef.current

      if (choices.length > 1 && anchor) {
        setPicking(null)
        setMenu({ kind: 'card', id, rect: anchor.getBoundingClientRect(), submenu: { label: zoneLabelOf(zone, index), items: choices } })
      } else if (only) {
        choose(only)
      } else {
        onDispatch({ type: 'place', id, zone, index, pos: 'atk' })
      }
    },
    [dropChoices, choose, onDispatch],
  )

  const handleDrop = useCallback(
    (source: MatDragSource, target: MatDropTarget) => {
      // La ficha soltada en una zona de monstruo principal libre pregunta si sale en ataque o en defensa, ahí mismo.
      if (source.id === NEW_TOKEN) {
        if (target.kind === 'spot' && target.spot === 'mz' && !placedAt(state, target.spot, target.index)) {
          const anchor = sectionRef.current?.querySelector(`[data-drop="${dropIdOf(target.spot, target.index)}"]`) ?? sectionRef.current

          if (anchor) {
            setPicking(null)
            setMenu({ kind: 'token', rect: anchor.getBoundingClientRect(), zone: { zone: target.spot, index: target.index } })
          }
        }
        return
      }

      if (source.id === DECK_TOP) {
        const top = state.deck[0]
        if (!top) return
        if (target.kind === 'pile') {
          if (target.pile === 'hand') onDispatch({ type: 'draw', count: 1 })
          else if (target.pile === 'gy') onDispatch({ type: 'mill', count: 1 })
          else if (target.pile === 'banished') onDispatch({ type: 'move', id: top, to: 'banished' })
        } else if (target.spot !== 'emz' && !placedAt(state, target.spot, target.index)) {
          dropInto(top, target.spot, target.index)
        }
        return
      }

      const where = locateCard(state, source.id)
      if (!where) return

      if (target.kind === 'pile') {
        if (where.kind === 'pile' && where.pile === target.pile) return
        onDispatch({ type: 'move', id: source.id, to: target.pile })
        return
      }

      const occupant = placedAt(state, target.spot, target.index)

      if (occupant) {
        if (occupant.id !== source.id && kindOf(occupant.id).xyz && kindOf(source.id).monster) {
          onDispatch({ type: 'attach', id: source.id, to: occupant.id })
        }
        return
      }

      if (where.kind === 'pile') {
        // La Extra Monster Zone es sólo para lo que viene del Extra Deck: de la mano o de otra pila no se cae ahí ni arrastrando.
        if (target.spot === 'emz' && where.pile !== 'extra') return
        dropInto(source.id, target.spot, target.index)
        return
      }

      // Una carta que ya está en el campo cambia de zona como está.
      const pos = where.kind === 'spot' ? where.placed.pos : 'atk'
      onDispatch({ type: 'place', id: source.id, zone: target.spot, index: target.index, pos })
    },
    [state, onDispatch, kindOf, dropInto],
  )

  const handleTap = useCallback(
    (source: MatDragSource, rect: DOMRect) => {
      // La ficha: primero la posición (en ataque o en defensa); la zona se toca después si hay más de una libre.
      if (source.id === NEW_TOKEN) {
        setPicking(null)
        if (freeTargets(state, monsterZones(false)).length > 0) setMenu({ kind: 'token', rect })
        return
      }

      if (source.id === DECK_TOP) {
        setPicking(null)
        setMenu({ kind: 'deck', rect })
        return
      }

      openCard(source.id, rect)
    },
    [state, openCard],
  )

  const { drag, over, bind, setGhostElement } = useMatDrag({ onDrop: handleDrop, onTap: handleTap })

  const menuItems: MenuItem[] = useMemo(() => {
    if (!menu) return []

    if (menu.kind === 'token') {
      const dropped = menu.zone

      return [
        { label: t('practice.menu.attack'), onSelect: () => summonToken('atk', dropped) },
        { label: t('practice.menu.defense'), onSelect: () => summonToken('def', dropped) },
      ]
    }

    // Elegir en el segundo paso arma la jugada completa ("Invocación Normal: en ataque") para lo que la mesa pida después.
    const submenu = menu.submenu
    if (submenu) return submenu.items.map((item) => ({ label: item.label, onSelect: () => choose(item.label.includes(':') ? item : { ...item, label: `${submenu.label}: ${item.label.toLowerCase()}` }) }))

    if (menu.kind === 'deck') {
      const top = state.deck[0]
      const view = { label: t('practice.deckMenu.view'), onSelect: () => { setMenu(null); setViewer('deck') } }

      if (!top) return [view]

      return [
        { label: t('practice.deckMenu.draw'), onSelect: () => play({ type: 'draw', count: 1 }) },
        { label: t('practice.deckMenu.mill'), onSelect: () => play({ type: 'mill', count: 1 }) },
        { label: t('practice.deckMenu.banishTop'), onSelect: () => choose(banishItem(top, t('practice.deckMenu.banishTop'))) },
        view,
        { label: t('practice.deckMenu.shuffle'), onSelect: () => play({ type: 'shuffle', seed: randomSeed() }) },
      ]
    }

    return listCardActions(state, menu.id, kindOf, nameOf).map((item) => ({ label: item.label, onSelect: () => choose(item) }))
  }, [menu, state, kindOf, nameOf, play, choose, summonToken])

  const menuCard = menu?.kind === 'card' ? cardOf(menu.id) : menu?.kind === 'token' ? TOKEN_CARD : null
  const menuWhere = menu?.kind === 'card' ? locateCard(state, menu.id) : null
  const menuKicker =
    menu?.kind === 'token'
      ? menu.zone ? zoneLabelOf(menu.zone.zone, menu.zone.index) : t('practice.menu.specialSummon')
      : menu?.submenu
        ? menu.submenu.label
        : menuWhere
          ? menuWhere.kind === 'pile' ? PILE_TITLES[menuWhere.pile] : menuWhere.kind === 'spot' ? ZONE_LABELS[menuWhere.spot] : t('practice.mat.materialOf', { name: nameOf(menuWhere.of) })
          : PILE_TITLES.deck
  const menuTitle = menuCard?.name ?? t('practice.mat.cardCount', { count: state.deck.length })

  const saveCombo = (name: string) => {
    const combo = createSavedCombo({ name, deckName, initial: session.initial, actions: session.actions.slice(0, session.cursor), nameOf }, combos)
    const next = [...combos, combo]
    writeSavedCombos(next)
    setCombos(next)
    setSaving(false)
    showToastMessage(t('practice.combo.saved', { name: combo.name }), 'success')
  }

  const deleteCombo = (combo: SavedCombo) => {
    const next = combos.filter((entry) => entry.id !== combo.id)
    writeSavedCombos(next)
    setCombos(next)
    showToastMessage(t('practice.combo.deleted', { name: combo.name }), 'warning')
  }

  const panel = (
    <PracticeMatPanel
      steps={steps}
      cursor={session.cursor}
      onSeek={(step) => { setAutoplay(false); onSeek(step); setPanelOpen(false) }}
      combos={combos}
      deckName={deckName}
      onLoad={(combo) => { onLoadCombo(combo); setAutoplay(true); setPanelOpen(false) }}
      onDelete={deleteCombo}
      className="min-h-0 flex-1"
    />
  )

  // Eligiendo Sacrificios o materiales, los monstruos del campo se encienden y el elegido lleva su etiqueta.
  const choosingOnField = picking?.kind === 'tributes' || picking?.kind === 'materials'
  const tributeCandidates = choosingOnField ? monstersOnField(state) : []
  // Eligiendo la zona, los Sacrificios o materiales ya confirmados siguen marcados: su zona se libera y también se puede elegir.
  const leaving = picking?.kind === 'zone' ? (picking.action.type === 'tribute' ? picking.action.tributes : picking.action.type === 'summon' ? picking.action.materials : []) : []
  const chosenLabel = picking?.kind === 'materials' || (picking?.kind === 'zone' && picking.action.type === 'summon') ? t('practice.mat.chosenMaterial') : t('practice.mat.chosenTribute')
  const targetedIds = useMemo(() => new Set(state.targeted), [state.targeted])
  // La carta de la que se está viendo el menú lleva un marco celeste mientras tanto.
  const selectedId = menu?.kind === 'card' ? menu.id : null

  const cell = (spot: MatSpot, index: number, area: string) => {
    const placed = placedAt(state, spot, index)
    const drop = dropIdOf(spot, index)
    const label = zoneLabelOf(spot, index)
    const gem = spot === 'st' ? PENDULUM_GEM[index] : undefined
    const pickableZone = picking?.kind === 'zone' && picking.targets.some((target) => target.zone === spot && target.index === index)
    const pickableTribute = choosingOnField && placed !== null && tributeCandidates.includes(placed.id)
    const chosen = placed !== null && (((picking?.kind === 'tributes' || picking?.kind === 'materials') && picking.chosen.includes(placed.id)) || leaving.includes(placed.id))

    return (
      <div
        key={drop}
        role={pickableZone ? 'button' : 'group'}
        tabIndex={pickableZone ? 0 : undefined}
        aria-label={pickableZone ? t('practice.zone.pick', { zone: label }) : label}
        data-drop={drop}
        data-over={over === drop || handOver === drop ? 'true' : 'false'}
        data-pick={pickableZone || pickableTribute ? 'true' : 'false'}
        data-chosen={chosen ? 'true' : 'false'}
        className={CELL}
        style={{ gridArea: area }}
        onClick={pickableZone ? () => pickZone(spot, index) : undefined}
        onKeyDown={pickableZone ? (event) => activate(event, () => pickZone(spot, index)) : undefined}
      >
        {gem && !placed ? <span aria-hidden="true" className={cx('absolute left-1/2 top-1/2 size-3.5 -translate-x-1/2 -translate-y-1/2 rotate-45 rounded-[3px]', gem)} /> : null}
        {spot === 'field' && !placed ? <span aria-hidden="true" className="absolute inset-0 grid place-items-center text-[0.5rem] font-semibold uppercase tracking-[0.04em] text-soft min-[1101px]:text-[0.6rem]">{t('practice.zone.fieldLabel')}</span> : null}
        {placed ? (
          <PlacedCard
            placed={placed}
            spot={spot}
            card={cardOf(placed.id)}
            dragging={drag?.source.id === placed.id}
            flash={flash?.id === placed.id ? flash : null}
            glow={highlighted.has(placed.id)}
            glowKind={highlightKind}
            dim={highlighted.size > 0 && !highlighted.has(placed.id)}
            chosen={chosen ? chosenLabel : null}
            targeted={targetedIds.has(placed.id)}
            selected={selectedId === placed.id}
            bind={bind}
            onOpen={(rect) => openCard(placed.id, rect)}
          />
        ) : null}
        {landing?.spot === spot && landing.index === index ? <LandingBurst key={landing.key} tone={landing.tone} flies={landing.flies} /> : null}
      </div>
    )
  }

  const topOf = (pile: MatPile) => state[pile][state[pile].length - 1] ?? null
  const pileCell = (pile: 'extra' | 'gy' | 'banished', area: string) => {
    const top = pile === 'extra' ? null : topOf(pile)
    const count = state[pile].length
    // El Extra se ve de dorso; una carta desterrada boca abajo también (el visor de la pila la muestra igual).
    const back = pile === 'extra' ? count > 0 : top !== null && state.facedown.includes(top)

    return (
      <button
        key={pile}
        type="button"
        aria-label={`${PILE_TITLES[pile]}: ${count}`}
        title={PILE_TITLES[pile]}
        data-drop={pile}
        data-over={over === pile || handOver === pile ? 'true' : 'false'}
        className={cx(CELL, 'cursor-pointer overflow-hidden bg-transparent p-0 text-left focus-visible:outline-none focus-visible:shadow-focus')}
        style={{ gridArea: area }}
        onClick={() => setViewer(pile)}
      >
        {back ? <span className={CARD_BACK} /> : top ? <CardArt remoteUrl={artOf(cardOf(top))} name={cardOf(top).name} className="block h-full w-full object-cover" /> : null}
        <PileBadge label={PILE_TITLES[pile]} count={count} />
      </button>
    )
  }

  const getDeckRect = useCallback(() => deckRef.current?.getBoundingClientRect() ?? null, [])
  const getField = useCallback(() => {
    const field = fieldRef.current
    const zone = field?.querySelector('[data-drop="mz:0"]')

    return field && zone ? { rect: field.getBoundingClientRect(), zoneWidth: zone.getBoundingClientRect().width } : null
  }, [])
  // La ficha del menú se arrastra como una carta del tamaño de una zona del campo.
  const tokenSource = useMemo<MatDragSource>(
    () => ({
      id: NEW_TOKEN,
      name: TOKEN_CARD.name,
      art: TOKEN_ART,
      size: () => {
        const width = getField()?.zoneWidth

        return width ? { width, height: (width * 614) / 421 } : null
      },
    }),
    [getField],
  )

  const replayLabel = autoplay ? t('practice.mat.pause') : live ? t('practice.mat.watchAgain') : t('practice.mat.play')
  const pickingText =
    picking?.kind === 'tributes'
      ? t('practice.mat.pickTributes', { count: picking.required, chosen: picking.chosen.length })
      : picking?.kind === 'materials'
        ? t('practice.mat.pickMaterials', { count: picking.chosen.length })
        : picking
          ? t('practice.mat.pickZone', { label: picking.label })
          : null

  return (
    <section
      ref={sectionRef}
      aria-label={t('practice.mat.label')}
      className={cx(
        // `select-none`: un arrastre que arranca entre dos cartas no debe pintar texto seleccionado por toda la mesa.
        'grid h-full min-h-0 select-none grid-rows-[auto_minmax(0,1fr)] [background:radial-gradient(120%_60%_at_50%_0%,rgb(var(--primary-rgb)/0.16),transparent_70%),rgb(var(--background-rgb))] min-[1101px]:grid-cols-[minmax(0,1fr)_20rem]',
        PRACTICE_PALETTE,
      )}
    >
      {/* Barra: nueva mano, deshacer, guardar, ficha y (en el celu) el panel. Deja lugar a la X del modal. */}
      <div className="col-start-1 row-start-1 flex items-center gap-1 px-2 pr-14 pt-2 min-[1101px]:px-4 min-[1101px]:pt-3" role="toolbar" aria-label={t('practice.mat.name')}>
        <IconButton tone="flat" size="sm" aria-label={t('practice.mat.newHand')} title={t('practice.mat.newHand')} onClick={onNewHand}>
          <Icon name="refresh" />
        </IconButton>
        <IconButton tone="flat" size="sm" aria-label={t('practice.mat.undo')} title={t('practice.mat.undo')} disabled={session.cursor === 0} className="disabled:opacity-35" onClick={() => { setAutoplay(false); onUndo() }}>
          <Icon name="undo" />
        </IconButton>
        <IconButton tone="flat" size="sm" aria-label={t('practice.mat.saveCombo')} title={t('practice.mat.saveCombo')} disabled={session.cursor === 0} className="disabled:opacity-35" onClick={() => setSaving(true)}>
          <Icon name="save" />
        </IconButton>
        {/* Ficha: se toca para elegir la posición (y la zona) o se arrastra a una zona de monstruo. */}
        <IconButton
          tone="flat"
          size="sm"
          aria-label={t('practice.token.name')}
          title={t('practice.token.create')}
          className="touch-none select-none [-webkit-touch-callout:none]"
          {...bind(tokenSource)}
          onKeyDown={(event) => activate(event, () => handleTap(tokenSource, event.currentTarget.getBoundingClientRect()))}
          onContextMenu={(event) => event.preventDefault()}
        >
          <Icon name="plus" />
        </IconButton>
        <IconButton tone="flat" size="sm" aria-label={t('practice.mat.stepsAndCombos')} title={t('practice.mat.stepsAndCombos')} className="min-[1101px]:hidden" onClick={() => setPanelOpen(true)}>
          <Icon name="list" />
        </IconButton>
        <span className="ml-auto whitespace-nowrap rounded-full bg-tint/8 px-2.5 py-1 text-micro font-semibold tabular-nums text-muted" aria-label={t('practice.mat.turn', { turn: state.turn })}>
          {t('practice.mat.turn', { turn: state.turn })}
        </span>
      </div>

      <div className="col-start-1 row-start-2 flex min-h-0 flex-col gap-2 overflow-y-auto overflow-x-hidden px-1.5 pb-[calc(0.5rem+env(safe-area-inset-bottom,0px))] min-[1101px]:px-4 min-[1101px]:pb-4 min-[1101px]:pt-2">
        {/* El campo en todos los tamaños: a la izquierda la zona de campo y el Extra Deck; a la derecha, de arriba abajo, destierro, cementerio y deck (como pidió Gastón: el Banish arriba del GY); las fases y las zonas extra entre medio. */}
        <div
          ref={fieldRef}
          // `my-auto`: el aire que sobra se reparte arriba y abajo del campo (ni pegado a la barra ni un hueco antes de la mano).
          className="relative my-auto grid grid-cols-7 gap-1 [grid-template-areas:'._p1_emz1_p2_emz2_p3_ban'_'fld_m1_m2_m3_m4_m5_gy'_'extra_s1_s2_s3_s4_s5_deck'] min-[1101px]:justify-center min-[1101px]:gap-2 min-[1101px]:grid-cols-[repeat(7,minmax(0,5.5rem))]"
          aria-label={t('practice.mat.field')}
        >
          {cell('field', 0, 'fld')}
          {cell('emz', 0, 'emz1')}
          {cell('emz', 1, 'emz2')}
          {/* Las seis fases, de a dos entre las zonas, como en DuelingBook: la actual encendida; tocar otra cambia de fase. */}
          {[0, 2, 4].map((start, index) => (
            <div key={start} role="group" aria-label={index === 0 ? t('practice.mat.phases') : undefined} className="grid grid-cols-2 gap-0.5 self-center min-[1101px]:gap-1" style={{ gridArea: `p${index + 1}` }}>
              {PHASES.slice(start, start + 2).map((phase) => (
                <PhaseButton key={phase.id} short={phase.short} name={phase.name} active={state.phase === phase.id} onPick={() => play({ type: 'phase', phase: phase.id })} />
              ))}
            </div>
          ))}
          {state.mz.map((_, index) => cell('mz', index, `m${index + 1}`))}
          {state.st.map((_, index) => cell('st', index, `s${index + 1}`))}

          {/* Deck: se arrastra su tope (robar, mandar al cementerio, sacar al campo) o se toca para el menú. Se baraja con cada mano nueva y reparte de a una. */}
          <div
            ref={deckRef}
            role="button"
            tabIndex={0}
            aria-label={`${PILE_TITLES.deck}: ${state.deck.length}`}
            title={t('practice.mat.mainDeck')}
            data-drop="deck"
            data-over={over === 'deck' || handOver === 'deck' ? 'true' : 'false'}
            className={cx(CELL, state.deck.length > 0 && 'cursor-grab touch-none select-none [-webkit-touch-callout:none]', 'focus-visible:outline-none focus-visible:shadow-focus')}
            style={{ gridArea: 'deck' }}
            {...bind({ id: DECK_TOP, name: 'Deck', art: null, back: true })}
            onKeyDown={(event) => activate(event, () => setMenu({ kind: 'deck', rect: event.currentTarget.getBoundingClientRect() }))}
            onContextMenu={(event) => event.preventDefault()}
          >
            {state.deck.length > 0 ? (
              <span key={shuffleKey} className="absolute inset-0">
                <span className={cx(CARD_BACK, '[transform:translate(-3px,3px)]', shuffleKey > 0 && 'animate-riffle-left motion-reduce:animate-none')} />
                <span className={cx(CARD_BACK, '[transform:translate(-1.5px,1.5px)]', shuffleKey > 0 && 'animate-riffle-right motion-reduce:animate-none')} />
                {/* Cada carta repartida le da un tirón a la de arriba. */}
                <span key={dealt} className={cx(CARD_BACK, 'animate-pile-draw motion-reduce:animate-none')} />
              </span>
            ) : null}
            <PileBadge label={PILE_TITLES.deck} count={state.deck.length} />
          </div>
          {pileCell('extra', 'extra')}
          {pileCell('gy', 'gy')}
          {pileCell('banished', 'ban')}

          {/* Cambio de fase: el cartel se asoma en el medio del campo y se va agrandándose. */}
          {banner ? <PhaseBanner key={banner.key} phase={banner.phase} turn={banner.turn} className="absolute inset-0 z-30" /> : null}
        </div>

        {/* Abajo del todo, como en la mesa real: la mano en abanico. Las salidas y problemas van entre el campo y la mano en el celu, y en el panel lateral en escritorio. */}
        {footer && isDealt && !isDesktop ? <div className="px-1 animate-sheet-in motion-reduce:animate-none">{footer}</div> : null}
        <PracticeHand
          cards={handCards}
          sizeSlots={Math.max(session.initial.hand.length, 1)}
          maxCardWidth={isDesktop ? 124 : 110}
          fanDegrees={2.2}
          highlighted={highlighted}
          highlightKind={highlightKind}
          muted={muted}
          flash={flash}
          targeted={targetedIds}
          selectedId={selectedId}
          getDeckRect={getDeckRect}
          dealsFromDeck={dealsFromDeck}
          getField={getField}
          onReorder={setHandOrder}
          onTap={(card, rect) => openCard(card.id, rect)}
          onDragOver={setHandOver}
          onDrop={(card, target) => {
            setHandOver(null)
            const parsed = parseDrop(target)
            if (parsed) handleDrop({ id: card.id, name: card.name, art: artOf(card) }, parsed)
          }}
        />

        {/* Pasos: en vivo muestra la última jugada; con jugadas, se recorre con Anterior / Siguiente. Eligiendo, pide lo que falta. */}
        <div className="flex min-h-9 flex-wrap items-center gap-x-2 gap-y-1 px-1 text-micro text-muted" role="status" aria-label={t('practice.mat.currentStep')}>
          {pickingText ? (
            <>
              <span className="min-w-0 flex-1 truncate font-semibold text-accent">{pickingText}</span>
              {picking?.kind === 'materials' ? (
                <Button variant="primary" size="sm" className="min-h-8 px-3" disabled={picking.chosen.length === 0} onClick={confirmMaterials}>
                  {t('practice.mat.confirm')}
                </Button>
              ) : null}
              <Button variant="tertiary" size="sm" className="min-h-8 px-2" onClick={() => setPicking(null)}>
                {t('common.cancel')}
              </Button>
            </>
          ) : null}
          {!picking && session.actions.length > 0 ? (
            <>
              {/* Replay (sólo viendo un combo guardado): pausa / reproducir (al final, "Ver de nuevo" vuelve al principio) y avance rápido, redondos como en un replay. */}
              {session.replay ? (
                <>
                  <button
                    type="button"
                    className={REPLAY_BUTTON}
                    aria-label={replayLabel}
                    title={replayLabel}
                    onClick={() => {
                      if (autoplay) {
                        setAutoplay(false)
                      } else {
                        if (live) onSeek(0)
                        setAutoplay(true)
                      }
                    }}
                  >
                    <Icon name={autoplay ? 'pause' : 'play'} />
                  </button>
                  <button type="button" className={REPLAY_BUTTON} aria-label={t('practice.mat.fastForward')} title={t('practice.mat.fastForward')} aria-pressed={fast} onClick={() => setFast((value) => !value)}>
                    <Icon name="fast-forward" />
                  </button>
                </>
              ) : null}
              <Button variant="tertiary" size="sm" className="min-h-8 px-2" disabled={session.cursor === 0} onClick={() => { setAutoplay(false); onSeek(session.cursor - 1) }}>
                {t('practice.mat.previous')}
              </Button>
              <span className="font-semibold tabular-nums text-foreground">
                {session.cursor}/{session.actions.length}
              </span>
              <Button variant="tertiary" size="sm" className="min-h-8 px-2" disabled={live} onClick={() => { setAutoplay(false); onSeek(session.cursor + 1) }}>
                {t('practice.mat.next')}
              </Button>
            </>
          ) : null}
          {!picking ? (
            <span className="min-w-0 flex-1 truncate">{session.cursor === 0 ? (session.actions.length > 0 ? t('practice.mat.startingHand') : t('practice.mat.hint')) : steps[session.cursor - 1]}</span>
          ) : null}
        </div>
      </div>

      {/* Panel lateral (escritorio): arriba los pasos y combos (debajo de la X del modal) y abajo, a la altura de la mano, las salidas y problemas; la explicación del chip tocado crece hacia arriba sobre la lista. El detalle de una carta se abre desde su menú. */}
      <aside className="hidden min-h-0 border-l border-border-subtle px-3 pb-3 pt-18 min-[1101px]:col-start-2 min-[1101px]:row-span-2 min-[1101px]:row-start-1 min-[1101px]:flex min-[1101px]:flex-col min-[1101px]:gap-3" aria-label={t('practice.mat.stepsAndCombos')}>
        {panel}
        {footer && isDealt && isDesktop ? <div className="flex-none animate-sheet-in motion-reduce:animate-none">{footer}</div> : null}
      </aside>

      <Modal isOpen={panelOpen} onClose={() => setPanelOpen(false)} size="md" kicker={t('practice.mat.name')} title={t('practice.mat.stepsAndCombos')}>
        {panel}
      </Modal>

      <CardMenu
        anchor={menu?.rect ?? null}
        kicker={menuKicker}
        title={menuTitle}
        items={menuItems}
        onInspect={menu?.kind === 'card' && !menu.submenu && !isToken(menu.id) ? () => { setInspected({ id: menu.id, rect: menu.rect }); setMenu(null) } : undefined}
        onClose={() => setMenu(null)}
      />

      {/* Una instancia por pila: cada visor arranca sin filtro (lo buscado en el deck no se hereda al abrir el cementerio, donde con pocas cartas el buscador ni se ve). */}
      <PileViewer
        key={viewer ?? 'closed'}
        pile={viewer}
        ids={viewer ? state[viewer] : []}
        info={(id) => ({ name: cardOf(id).name, art: artOf(cardOf(id)), faceDown: state.facedown.includes(id) })}
        onPick={(id, rect) => setMenu({ kind: 'card', id, rect })}
        onClose={closeViewer}
      />

      <SaveComboDialog key={String(saving)} isOpen={saving} defaultName={t('practice.combo.defaultName', { n: combos.length + 1 })} onSave={saveCombo} onClose={() => setSaving(false)} />

      {inspected ? <CardDetailOverlay key={inspected.id} name={cardOf(inspected.id).name} card={cardOf(inspected.id).apiCard} origin={inspected.rect} onClose={() => setInspected(null)} /> : null}

      {/* Activar, mostrar o declarar: la carta aparece grande en el centro de la pantalla, con su marco de color y lo que pasó arriba, y se desvanece, como en DuelingBook. Marcar un objetivo no la agranda: ahí sólo cae la mira. */}
      {flash && flash.kind !== 'target'
        ? createPortal(<Spotlight key={flash.key} id={flash.id} kind={flash.kind} name={cardOf(flash.id).name} art={artOf(cardOf(flash.id))} caption={steps[session.cursor - 1] ?? null} />, document.body)
        : null}

      {drag
        ? createPortal(
            <div ref={setGhostElement} className="pointer-events-none fixed left-0 top-0 z-200 opacity-90 will-change-transform" style={{ width: drag.width, height: drag.height }} aria-hidden="true">
              {drag.source.back ? (
                <CardBack className="h-full" />
              ) : (
                <CardArt remoteUrl={drag.source.art} name={drag.source.name} className="block h-full w-full object-cover shadow-[0_18px_32px_rgba(0,0,0,0.55)]" />
              )}
            </div>,
            document.body,
          )
        : null}
    </section>
  )
}

/** "mz:2" / "field" / "gy" → destino de la mesa (lo mismo que lee el arrastre de las zonas). */
function parseDrop(value: string): MatDropTarget | null {
  if (value === 'field') return { kind: 'spot', spot: 'field', index: 0 }
  if (value === 'deck' || value === 'extra' || value === 'hand' || value === 'gy' || value === 'banished') return { kind: 'pile', pile: value }

  const [zone, index] = value.split(':')
  const at = Number(index)

  return (zone === 'mz' || zone === 'emz' || zone === 'st') && Number.isInteger(at) ? { kind: 'spot', spot: zone, index: at } : null
}

/** Botón redondo de una fase (DP, SP, M1, BP, M2, EP): la actual encendida en verde. */
function PhaseButton({ short, name, active, onPick }: { short: string; name: string; active: boolean; onPick: () => void }) {
  return (
    <button
      type="button"
      aria-label={name}
      aria-pressed={active}
      title={name}
      className={cx(
        'grid aspect-square w-full min-w-0 place-items-center rounded-full border text-[0.55rem] font-extrabold leading-none transition-[background-color,color,box-shadow] duration-150 focus-visible:outline-none focus-visible:shadow-focus min-[1101px]:text-micro',
        active
          ? 'border-accent bg-accent text-[#06140e] shadow-[0_0_12px_rgb(var(--accent-rgb)/0.7)]'
          : 'border-tint/25 bg-transparent text-soft hover:bg-tint/10 hover:text-foreground',
      )}
      onClick={onPick}
    >
      {short}
    </button>
  )
}

function activate(event: ReactKeyboardEvent<HTMLElement>, run: () => void) {
  if (event.key === 'Enter' || event.key === ' ') {
    event.preventDefault()
    run()
  }
}

/** Cantidad grande en el centro de la pila, como en la mesa real, y el nombre de la casilla chico debajo. */
function PileBadge({ label, count }: { label: string; count: number }) {
  return (
    <span className="pointer-events-none absolute inset-0 z-2 grid place-content-center justify-items-center text-center leading-none">
      <span className={cx('rounded-full px-1.5 py-0.5 text-body font-extrabold tabular-nums text-foreground min-[1101px]:text-lead', count > 0 && 'bg-background/70')}>{count}</span>
      <span className="mt-0.5 text-[0.5rem] font-semibold uppercase tracking-[0.04em] text-soft min-[1101px]:text-[0.6rem]">{label}</span>
    </span>
  )
}

/** La carta que se está mirando (al pasar el mouse o tocarla), como el panel de la izquierda de DuelingBook. */
interface PlacedCardProps {
  placed: Placed
  spot: MatSpot
  card: MatCard
  dragging: boolean
  /** El destaque en curso (activar, mostrar, declarar o marcar como objetivo), con su clave; null = quieta. */
  flash: { key: number; kind: SpotlightKind } | null
  glow: boolean
  glowKind: PatternKind | null
  dim: boolean
  /** Elegida como Sacrificio o como material (la etiqueta que lleva), o null. */
  chosen: string | null
  /** Marcada como objetivo. */
  targeted: boolean
  /** Es la carta de la que se está viendo el menú. */
  selected: boolean
  bind: ReturnType<typeof useMatDrag>['bind']
  onOpen: (rect: DOMRect) => void
}

/**
 * Carta en una zona del campo: es tuya, así que boca abajo se ve su imagen atenuada (como en DuelingBook); en defensa o
 * colocada en una zona de monstruo se acuesta a su tamaño y sobresale de la casilla, como en la mesa real; contadores,
 * materiales y objetivo como etiquetas. Al darla vuelta se angosta y se abre; los contadores y los materiales rebotan al cambiar.
 */
function PlacedCard({ placed, spot, card, dragging, flash, glow, glowKind, dim, chosen, targeted, selected, bind, onOpen }: PlacedCardProps) {
  // El nombre y lo que lo acompaña (boca abajo o en defensa, etiqueta de elegida, seleccionada): cada pedazo es su mensaje.
  let label = placed.pos === 'set' ? t('practice.mat.cardFaceDown', { name: card.name }) : placed.pos === 'def' ? t('practice.mat.cardDefense', { name: card.name }) : card.name
  if (chosen) label = t('practice.mat.cardChosen', { label, chosen })
  if (targeted) label = t('practice.card.selected', { name: label })
  const sideways = spot !== 'st' && spot !== 'field' && placed.pos !== 'atk'

  const cardRef = useRef<HTMLDivElement | null>(null)
  const previousPos = useRef(placed.pos)

  useEffect(() => {
    const wasFaceDown = previousPos.current === 'set'
    previousPos.current = placed.pos

    if (wasFaceDown === (placed.pos === 'set') || prefersReducedMotion()) return

    cardRef.current?.animate(FLIP_FRAMES, { duration: FLIP_MS, easing: 'ease-in-out' })
  }, [placed.pos])

  return (
    <div
      ref={cardRef}
      role="button"
      tabIndex={0}
      aria-label={label}
      title={label}
      // Rotación en `transform` (no en `rotate`): así el vuelo entre zonas la lee y la compone bien.
      className={cx(MAT_CARD, 'absolute inset-0 h-full', sideways && 'z-1 [transform:rotate(90deg)]')}
      // El color de su aro: el del destaque, o el rojo de la mira.
      style={fxVars(flash ? SPOTLIGHT_TONE[flash.kind] : 'red')}
      data-card-id={placed.id}
      data-dragging={dragging ? 'true' : 'false'}
      data-flash={flash ? 'true' : 'false'}
      data-flash-kind={flash?.kind}
      data-targeted={targeted ? 'true' : 'false'}
      data-selected={selected ? 'true' : 'false'}
      data-glow={glow ? 'true' : 'false'}
      data-glow-kind={glow ? (glowKind ?? 'opening') : undefined}
      data-dim={dim ? 'true' : 'false'}
      {...bind({ id: placed.id, name: card.name, art: artOf(card) })}
      onKeyDown={(event) => activate(event, () => onOpen(event.currentTarget.getBoundingClientRect()))}
      onContextMenu={(event) => event.preventDefault()}
    >
      {/* El cambio de brillo (boca abajo se ve atenuada) espera a que la carta, al darse vuelta, esté de canto. */}
      <span className={cx('block h-full w-full transition-[filter] duration-150 delay-[115ms] motion-reduce:delay-0', placed.pos === 'set' && 'brightness-[0.4] saturate-[0.55]')}>
        <CardArt remoteUrl={artOf(card)} name={card.name} className="block h-full w-full object-cover" />
      </span>
      {placed.counters > 0 ? <span key={placed.counters} className="absolute left-0.5 top-0.5 z-2 animate-pop rounded-full bg-warning px-1.5 py-px text-[0.6rem] font-extrabold leading-tight text-[#1a1204] motion-reduce:animate-none">{placed.counters}</span> : null}
      {placed.materials.length > 0 ? <span key={placed.materials.length} className="absolute bottom-0.5 right-0.5 z-2 animate-pop rounded-full bg-primary px-1.5 py-px text-[0.6rem] font-extrabold leading-tight text-primary-foreground motion-reduce:animate-none">+{placed.materials.length}</span> : null}
      {chosen ? <span className="absolute inset-x-0 bottom-0 z-2 bg-accent/85 py-0.5 text-center text-[0.55rem] font-extrabold uppercase tracking-[0.06em] text-[#06140e]">{chosen}</span> : null}
      {selected ? <FxFrame tone="cyan" /> : null}
      {glow ? <FxFrame tone={glowKind === 'problem' ? 'red' : 'green'} orbit={false} /> : null}
      {flash && flash.kind !== 'target' ? <FxFrame key={flash.key} tone={SPOTLIGHT_TONE[flash.kind]} shine /> : null}
      {targeted ? <TargetMark /> : null}
    </div>
  )
}
