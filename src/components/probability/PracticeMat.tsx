import { useCallback, useEffect, useMemo, useRef, useState, type KeyboardEvent as ReactKeyboardEvent, type ReactNode } from 'react'
import { createPortal } from 'react-dom'

import { parseDerivedCardId } from '../../app/calculator-state'
import {
  allMatIds,
  cardKindOf,
  describeMatSteps,
  freeTargets,
  isToken,
  listCardActions,
  locateCard,
  matReducer,
  monstersOnField,
  PHASES,
  placedAt,
  randomSeed,
  TOKEN_KIND,
  type MatAction,
  type MatMenuItem,
  type MatPile,
  type MatSpot,
  type MatState,
  type MatTarget,
  type Placed,
} from '../../app/practice-mat'
import { mergeHandOrder } from '../../app/practice-hand-layout'
import { createSavedCombo, readSavedCombos, writeSavedCombos, type SavedCombo } from '../../app/saved-combos'
import { useCardFlights } from '../../app/use-card-flights'
import { DESKTOP_DECK_BUILDER_MEDIA_QUERY, useMediaQuery } from '../../app/use-media-query'
import { useEscapeKey } from '../../app/use-overlay'
import { showToastMessage } from '../../app/use-toast-message'
import { useMatDrag, type MatDragSource, type MatDropTarget } from '../../app/use-mat-drag'
import type { MatSession } from '../../app/use-mat-session'
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
import { cardIdOfDrawId } from './practice'
import { PracticeHand, TargetMark, type HandCardData } from './PracticeHand'
import { PracticeMatPanel } from './PracticeMatPanel'
import { CARD_BACK, PRACTICE_PALETTE } from './practice-styles'

export interface MatCard {
  name: string
  apiCard: ApiCardReference | null
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

const TOKEN_CARD: MatCard = { name: 'Ficha', apiCard: null }
const UNKNOWN_CARD: MatCard = { name: 'Carta', apiCard: null }
const EMPTY_IDS: ReadonlySet<string> = new Set()

/** Pausa antes de repartir la primera carta (mientras el mazo se baraja) y entre carta y carta. */
const FIRST_DEAL_MS = 90
const NEXT_DEAL_MS = 55

/** Celda del campo o de una pila: borde punteado; se enciende con una carta encima y en verde cuando se está eligiendo. */
const CELL =
  'relative aspect-[421/614] min-w-0 rounded-tag border border-dashed border-tint/20 transition-colors duration-150 data-[over=true]:border-primary data-[over=true]:bg-primary/15 data-[pick=true]:cursor-pointer data-[pick=true]:border-solid data-[pick=true]:border-accent data-[pick=true]:bg-accent/15 data-[pick=true]:shadow-[0_0_0_2px_rgb(var(--accent-rgb)/0.45),0_0_16px_rgb(var(--accent-rgb)/0.35)] data-[pick=true]:hover:bg-accent/25 data-[chosen=true]:bg-accent/40'

/**
 * Carta en una zona del campo: arrastrable, sin menú de imagen ni selección (así el dedo no corta el arrastre).
 * El brillo (salida verde / problema rojo), la atenuación y el destello llegan por data-attributes.
 */
const MAT_CARD = [
  'relative block aspect-[421/614] w-full cursor-grab touch-none select-none overflow-hidden rounded-tag bg-input outline-none',
  '[-webkit-touch-callout:none] [-webkit-user-select:none] [&>*]:pointer-events-none [&_img]:[-webkit-user-drag:none]',
  'shadow-[0_6px_14px_rgba(0,0,0,0.45),0_0_0_1px_rgb(var(--foreground-rgb)/0.1)]',
  '[transition:transform_var(--motion-duration)_ease,filter_var(--motion-duration)_ease,box-shadow_var(--motion-duration)_ease]',
  'focus-visible:shadow-[0_6px_14px_rgba(0,0,0,0.45),0_0_0_2px_rgb(var(--primary-hover-rgb))]',
  'data-[dragging=true]:pointer-events-none data-[dragging=true]:opacity-30',
  'data-[dim=true]:brightness-[0.42] data-[dim=true]:saturate-[0.6]',
  'data-[glow=true]:animate-card-glow data-[glow=true]:[--glow-rgb:var(--accent-rgb)] data-[glow-kind=problem]:[--glow-rgb:var(--danger-rgb)]',
  'data-[glow=true]:shadow-[0_6px_14px_rgba(0,0,0,0.45),0_0_0_2px_rgb(var(--glow-rgb)),0_0_22px_rgb(var(--glow-rgb)/0.6)]',
  // Activación: aro amarillo en la carta (la carta grande aparece aparte, en el centro de la pantalla).
  'data-[flash=true]:z-10 data-[flash=true]:shadow-[0_0_0_2px_#facc15,0_0_22px_#facc15b3]',
  'motion-reduce:animate-none motion-reduce:transition-none',
].join(' ')

/** Duración de la activación: lo que dura la carta en el centro de la pantalla (y el aro en su lugar). */
const ACTIVATE_MS = 950

const ZONE_LABELS: Record<MatSpot, string> = { mz: 'Zona de monstruo', emz: 'Zona extra de monstruo', st: 'Zona de magia y trampa', field: 'Zona de campo' }

/** Las zonas de péndulo (las puntas de la fila de magias y trampas) llevan la gema azul y la roja, como en la mesa real. */
const PENDULUM_GEM: Record<number, string> = {
  0: 'bg-[#4aa8ff]/55 shadow-[0_0_10px_#4aa8ff80]',
  4: 'bg-[#ff4d6d]/55 shadow-[0_0_10px_#ff4d6d80]',
}

const artOf = (card: MatCard) => card.apiCard?.imageUrlSmall ?? card.apiCard?.imageUrl ?? null

/** Jugadas que se ven como "activar": el efecto de una carta, o una Mágica/Trampa que pasa boca arriba. */
function activatedCard(state: MatState, action: MatAction): string | null {
  if (action.type === 'activate') return action.id
  if (action.type === 'place' && (action.zone === 'st' || action.zone === 'field') && action.pos === 'atk') return action.id

  if (action.type === 'position' && action.pos === 'atk') {
    const where = locateCard(state, action.id)
    if (where?.kind === 'spot' && (where.spot === 'st' || where.spot === 'field')) return action.id
  }

  return null
}

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
const zoneLabelOf = (spot: MatSpot, index: number) => (spot === 'field' ? ZONE_LABELS.field : `${ZONE_LABELS[spot]} ${index + 1}`)

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

  const [menu, setMenu] = useState<{ kind: 'card'; id: string; rect: DOMRect; submenu?: { label: string; items: MatMenuItem[] } } | { kind: 'deck'; rect: DOMRect } | null>(null)
  const [viewer, setViewer] = useState<MatPile | null>(null)
  const [inspected, setInspected] = useState<{ id: string; rect: DOMRect } | null>(null)
  const [saving, setSaving] = useState(false)
  const [panelOpen, setPanelOpen] = useState(false)
  const [combos, setCombos] = useState<SavedCombo[]>(() => readSavedCombos())
  const [picking, setPicking] = useState<Picking | null>(null)
  // La carta que acaba de activarse destella un instante (la `key` repite el destello si se activa dos veces seguidas).
  const [flash, setFlash] = useState<{ id: string; key: number } | null>(null)
  // Zona de la mesa bajo una carta de la mano que se está arrastrando.
  const [handOver, setHandOver] = useState<string | null>(null)

  useEscapeKey(() => setPicking(null), picking !== null)

  useEffect(() => {
    if (!flash) return
    const timer = window.setTimeout(() => setFlash(null), ACTIVATE_MS)
    return () => window.clearTimeout(timer)
  }, [flash])

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
  const { dealsFromDeck } = useCardFlights(sectionRef, state, artById, `${isDesktop}:${dealt}:${handOrder.join(',')}`)

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
    // Después de mirar el deck se baraja, como en la mesa real (y la jugada queda anotada).
    if (viewer === 'deck') {
      onDispatch({ type: 'shuffle', seed: randomSeed() })
      setShuffleKey((key) => key + 1)
    }

    setViewer(null)
  }, [viewer, onDispatch])

  const play = useCallback(
    (action: MatAction) => {
      const activated = activatedCard(state, action)

      onDispatch(action)
      setMenu(null)
      setPicking(null)
      setAutoplay(false)

      if (activated) {
        setFlash({ id: activated, key: Date.now() })
      }

      if (action.type === 'shuffle') {
        setShuffleKey((key) => key + 1)
      }

      if (viewer) {
        closeViewer()
      }
    },
    [state, onDispatch, viewer, closeViewer],
  )

  /** Una jugada del menú: con Sacrificios primero se eligen; si puede salir a varias zonas, la mesa pide elegir una (como "Choose Zones" en DuelingBook). */
  const choose = useCallback(
    (item: MatMenuItem) => {
      // Segundo paso del menú ("¿En ataque o en defensa?"): se muestran las opciones en el mismo menú.
      if (item.choices) {
        setMenu((current) => (current?.kind === 'card' ? { ...current, submenu: { label: item.label, items: item.choices! } } : current))
        return
      }

      const pick = (picking: Picking) => {
        setMenu(null)
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
    [play, viewer, closeViewer],
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
    const targets = freeTargets(after, ['mz', 'emz'])
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

  const openCard = useCallback(
    (id: string, rect: DOMRect) => {
      if (picking?.kind === 'tributes' || picking?.kind === 'materials') {
        if (monstersOnField(state).includes(id)) (picking.kind === 'tributes' ? pickTribute : pickMaterial)(id)
        return
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

          if (item.action.type === 'tribute') return zone === 'mz' || zone === 'emz' ? [{ ...item, action: { ...item.action, zone, index }, targets }] : []
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
      if (source.id === NEW_TOKEN) {
        if (target.kind === 'spot' && target.spot !== 'st' && target.spot !== 'field' && !placedAt(state, target.spot, target.index)) {
          onDispatch({ type: 'token', zone: target.spot, index: target.index })
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
        } else if (!placedAt(state, target.spot, target.index)) {
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
      if (source.id === NEW_TOKEN) {
        setPicking(null)
        const targets = freeTargets(state, ['mz', 'emz'])
        const first = targets[0]

        if (!first) return
        if (targets.length > 1) setPicking({ kind: 'zone', label: 'la ficha', action: { type: 'token', zone: 'mz', index: first.index }, targets })
        else onDispatch({ type: 'token', zone: first.zone as 'mz' | 'emz', index: first.index })
        return
      }

      if (source.id === DECK_TOP) {
        setPicking(null)
        setMenu({ kind: 'deck', rect })
        return
      }

      openCard(source.id, rect)
    },
    [state, onDispatch, openCard],
  )

  const { drag, over, bind, setGhostElement } = useMatDrag({ onDrop: handleDrop, onTap: handleTap })

  const menuItems: MenuItem[] = useMemo(() => {
    if (!menu) return []

    if (menu.kind === 'deck') {
      const top = state.deck[0]
      const items: MenuItem[] = [
        { label: 'Robar', onSelect: () => play({ type: 'draw', count: 1 }) },
        { label: 'Mandar al cementerio', onSelect: () => play({ type: 'mill', count: 1 }) },
        { label: 'Desterrar el tope', onSelect: () => top && play({ type: 'move', id: top, to: 'banished' }) },
        { label: 'Desterrar el tope boca abajo', onSelect: () => top && play({ type: 'move', id: top, to: 'banished', faceDown: true }) },
        { label: 'Ver el deck', onSelect: () => { setMenu(null); setViewer('deck') } },
        { label: 'Barajar', onSelect: () => play({ type: 'shuffle', seed: randomSeed() }) },
      ]
      return top ? items : items.slice(4, 5)
    }

    // Elegir en el segundo paso arma la jugada completa ("Invocación Normal: en ataque") para lo que la mesa pida después.
    const submenu = menu.submenu
    if (submenu) return submenu.items.map((item) => ({ label: item.label, onSelect: () => choose(item.label.includes(':') ? item : { ...item, label: `${submenu.label}: ${item.label.toLowerCase()}` }) }))

    return listCardActions(state, menu.id, kindOf, nameOf).map((item) => ({ label: item.label, onSelect: () => choose(item) }))
  }, [menu, state, kindOf, nameOf, play, choose])

  const menuCard = menu?.kind === 'card' ? cardOf(menu.id) : null
  const menuWhere = menu?.kind === 'card' ? locateCard(state, menu.id) : null
  const menuKicker =
    menu?.kind === 'card' && menu.submenu
      ? menu.submenu.label
      : menuWhere
        ? menuWhere.kind === 'pile' ? PILE_TITLES[menuWhere.pile] : menuWhere.kind === 'spot' ? ZONE_LABELS[menuWhere.spot] : `Material de ${nameOf(menuWhere.of)}`
        : 'Main'
  const menuTitle = menuCard?.name ?? `${state.deck.length} ${state.deck.length === 1 ? 'carta' : 'cartas'}`

  const saveCombo = (name: string) => {
    const combo = createSavedCombo({ name, deckName, initial: session.initial, actions: session.actions.slice(0, session.cursor), nameOf }, combos)
    const next = [...combos, combo]
    writeSavedCombos(next)
    setCombos(next)
    setSaving(false)
    showToastMessage(`Combo “${combo.name}” guardado.`, 'success')
  }

  const deleteCombo = (combo: SavedCombo) => {
    const next = combos.filter((entry) => entry.id !== combo.id)
    writeSavedCombos(next)
    setCombos(next)
    showToastMessage(`Borraste “${combo.name}”.`, 'warning')
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
  const chosenLabel = picking?.kind === 'materials' ? 'Material' : 'Sacrificio'
  const targetedIds = useMemo(() => new Set(state.targeted), [state.targeted])

  const cell = (spot: MatSpot, index: number, area: string) => {
    const placed = placedAt(state, spot, index)
    const drop = dropIdOf(spot, index)
    const label = zoneLabelOf(spot, index)
    const gem = spot === 'st' ? PENDULUM_GEM[index] : undefined
    const pickableZone = picking?.kind === 'zone' && picking.targets.some((target) => target.zone === spot && target.index === index)
    const pickableTribute = choosingOnField && placed !== null && tributeCandidates.includes(placed.id)
    const chosen = (picking?.kind === 'tributes' || picking?.kind === 'materials') && placed !== null && picking.chosen.includes(placed.id)

    return (
      <div
        key={drop}
        role={pickableZone ? 'button' : 'group'}
        tabIndex={pickableZone ? 0 : undefined}
        aria-label={pickableZone ? `${label}: elegir` : label}
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
        {spot === 'field' && !placed ? <span aria-hidden="true" className="absolute inset-0 grid place-items-center text-[0.5rem] font-semibold uppercase tracking-[0.04em] text-soft min-[1101px]:text-[0.6rem]">Field</span> : null}
        {placed ? (
          <PlacedCard
            placed={placed}
            spot={spot}
            card={cardOf(placed.id)}
            dragging={drag?.source.id === placed.id}
            flash={flash?.id === placed.id ? flash.key : null}
            glow={highlighted.has(placed.id)}
            glowKind={highlightKind}
            dim={highlighted.size > 0 && !highlighted.has(placed.id)}
            chosen={chosen ? chosenLabel : null}
            targeted={targetedIds.has(placed.id)}
            bind={bind}
            onOpen={(rect) => openCard(placed.id, rect)}
          />
        ) : null}
      </div>
    )
  }

  const topOf = (pile: MatPile) => state[pile][state[pile].length - 1] ?? null
  const pileCell = (pile: 'extra' | 'gy' | 'banished', area: string) => {
    const top = pile === 'extra' ? null : topOf(pile)
    const count = state[pile].length

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
        {pile === 'extra' && count > 0 ? <span className={CARD_BACK} /> : null}
        {top ? <CardArt remoteUrl={artOf(cardOf(top))} name={cardOf(top).name} className="block h-full w-full object-cover" /> : null}
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

  const replayLabel = autoplay ? 'Pausar' : live ? 'Ver de nuevo' : 'Reproducir'
  const pickingText =
    picking?.kind === 'tributes'
      ? `Tocá ${picking.required === 1 ? 'el monstruo' : `${picking.required} monstruos`} para sacrificar (${picking.chosen.length}/${picking.required})`
      : picking?.kind === 'materials'
        ? `Tocá los materiales en el campo (${picking.chosen.length}) y confirmá`
        : picking
          ? `Tocá la zona para ${picking.label}`
          : null

  return (
    <section
      ref={sectionRef}
      aria-label="Mesa de práctica"
      className={cx(
        // `select-none`: un arrastre que arranca entre dos cartas no debe pintar texto seleccionado por toda la mesa.
        'grid h-full min-h-0 select-none grid-rows-[auto_minmax(0,1fr)] [background:radial-gradient(120%_60%_at_50%_0%,rgb(var(--primary-rgb)/0.16),transparent_70%),rgb(var(--background-rgb))] min-[1101px]:grid-cols-[minmax(0,1fr)_20rem]',
        PRACTICE_PALETTE,
      )}
    >
      {/* Barra: nueva mano, deshacer, guardar, ficha y (en el celu) el panel. Deja lugar a la X del modal. */}
      <div className="col-start-1 row-start-1 flex items-center gap-1 px-2 pr-14 pt-2 min-[1101px]:px-4 min-[1101px]:pt-3" role="toolbar" aria-label="Mesa">
        <IconButton tone="flat" size="sm" aria-label="Nueva mano" title="Nueva mano" onClick={onNewHand}>
          <Icon name="refresh" />
        </IconButton>
        <IconButton tone="flat" size="sm" aria-label="Deshacer" title="Deshacer" disabled={session.cursor === 0} className="disabled:opacity-35" onClick={() => { setAutoplay(false); onUndo() }}>
          <Icon name="undo" />
        </IconButton>
        <IconButton tone="flat" size="sm" aria-label="Guardar combo" title="Guardar combo" disabled={session.cursor === 0} className="disabled:opacity-35" onClick={() => setSaving(true)}>
          <Icon name="save" />
        </IconButton>
        {/* Ficha: se toca para elegir la zona o se arrastra a una zona de monstruo. */}
        <IconButton
          tone="flat"
          size="sm"
          aria-label="Ficha"
          title="Crear una ficha"
          className="touch-none select-none [-webkit-touch-callout:none]"
          {...bind({ id: NEW_TOKEN, name: 'Ficha', art: null })}
          onKeyDown={(event) => activate(event, () => handleTap({ id: NEW_TOKEN, name: 'Ficha', art: null }, event.currentTarget.getBoundingClientRect()))}
          onContextMenu={(event) => event.preventDefault()}
        >
          <Icon name="plus" />
        </IconButton>
        <IconButton tone="flat" size="sm" aria-label="Pasos y combos" title="Pasos y combos" className="min-[1101px]:hidden" onClick={() => setPanelOpen(true)}>
          <Icon name="list" />
        </IconButton>
        <span className="ml-auto whitespace-nowrap rounded-full bg-tint/8 px-2.5 py-1 text-micro font-semibold tabular-nums text-muted" aria-label={`Turno ${state.turn}`}>
          Turno {state.turn}
        </span>
      </div>

      <div className="col-start-1 row-start-2 flex min-h-0 flex-col gap-2 overflow-y-auto overflow-x-hidden px-1.5 pb-[calc(0.5rem+env(safe-area-inset-bottom,0px))] min-[1101px]:px-4 min-[1101px]:pb-4 min-[1101px]:pt-2">
        {/* El campo en todos los tamaños: a la izquierda la zona de campo y el Extra Deck; a la derecha, de arriba abajo, destierro, cementerio y deck (como pidió Gastón: el Banish arriba del GY); las fases y las zonas extra entre medio. */}
        <div
          ref={fieldRef}
          // `my-auto`: el aire que sobra se reparte arriba y abajo del campo (ni pegado a la barra ni un hueco antes de la mano).
          className="my-auto grid grid-cols-7 gap-1 [grid-template-areas:'._p1_emz1_p2_emz2_p3_ban'_'fld_m1_m2_m3_m4_m5_gy'_'extra_s1_s2_s3_s4_s5_deck'] min-[1101px]:justify-center min-[1101px]:gap-2 min-[1101px]:grid-cols-[repeat(7,minmax(0,5.5rem))]"
          aria-label="Campo"
        >
          {cell('field', 0, 'fld')}
          {cell('emz', 0, 'emz1')}
          {cell('emz', 1, 'emz2')}
          {/* Las seis fases, de a dos entre las zonas, como en DuelingBook: la actual encendida; tocar otra cambia de fase. */}
          {[0, 2, 4].map((start, index) => (
            <div key={start} role="group" aria-label={index === 0 ? 'Fases' : undefined} className="grid grid-cols-2 gap-0.5 self-center min-[1101px]:gap-1" style={{ gridArea: `p${index + 1}` }}>
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
            aria-label={`Main: ${state.deck.length}`}
            title="Main Deck"
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
            <PileBadge label="Main" count={state.deck.length} />
          </div>
          {pileCell('extra', 'extra')}
          {pileCell('gy', 'gy')}
          {pileCell('banished', 'ban')}
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
        <div className="flex min-h-9 flex-wrap items-center gap-x-2 gap-y-1 px-1 text-micro text-muted" role="status" aria-label="Paso actual">
          {pickingText ? (
            <>
              <span className="min-w-0 flex-1 truncate font-semibold text-accent">{pickingText}</span>
              {picking?.kind === 'materials' ? (
                <Button variant="primary" size="sm" className="min-h-8 px-3" disabled={picking.chosen.length === 0} onClick={confirmMaterials}>
                  Confirmar
                </Button>
              ) : null}
              <Button variant="tertiary" size="sm" className="min-h-8 px-2" onClick={() => setPicking(null)}>
                Cancelar
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
                  <button type="button" className={REPLAY_BUTTON} aria-label="Avance rápido" title="Avance rápido" aria-pressed={fast} onClick={() => setFast((value) => !value)}>
                    <Icon name="fast-forward" />
                  </button>
                </>
              ) : null}
              <Button variant="tertiary" size="sm" className="min-h-8 px-2" disabled={session.cursor === 0} onClick={() => { setAutoplay(false); onSeek(session.cursor - 1) }}>
                Anterior
              </Button>
              <span className="font-semibold tabular-nums text-foreground">
                {session.cursor}/{session.actions.length}
              </span>
              <Button variant="tertiary" size="sm" className="min-h-8 px-2" disabled={live} onClick={() => { setAutoplay(false); onSeek(session.cursor + 1) }}>
                Siguiente
              </Button>
            </>
          ) : null}
          {!picking ? (
            <span className="min-w-0 flex-1 truncate">{session.cursor === 0 ? (session.actions.length > 0 ? 'Mano inicial' : 'Arrastrá una carta a una zona o tocala para ver qué podés hacer.') : steps[session.cursor - 1]}</span>
          ) : null}
        </div>
      </div>

      {/* Panel lateral (escritorio): arriba los pasos y combos (debajo de la X del modal) y abajo, a la altura de la mano, las salidas y problemas; la explicación del chip tocado crece hacia arriba sobre la lista. El detalle de una carta se abre desde su menú. */}
      <aside className="hidden min-h-0 border-l border-border-subtle px-3 pb-3 pt-18 min-[1101px]:col-start-2 min-[1101px]:row-span-2 min-[1101px]:row-start-1 min-[1101px]:flex min-[1101px]:flex-col min-[1101px]:gap-3" aria-label="Pasos y combos">
        {panel}
        {footer && isDealt && isDesktop ? <div className="flex-none animate-sheet-in motion-reduce:animate-none">{footer}</div> : null}
      </aside>

      <Modal isOpen={panelOpen} onClose={() => setPanelOpen(false)} size="md" kicker="Mesa" title="Pasos y combos">
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

      <PileViewer
        pile={viewer}
        ids={viewer ? state[viewer] : []}
        info={(id) => ({ name: cardOf(id).name, art: artOf(cardOf(id)), faceDown: state.facedown.includes(id) })}
        onPick={(id, rect) => setMenu({ kind: 'card', id, rect })}
        onClose={closeViewer}
      />

      <SaveComboDialog key={String(saving)} isOpen={saving} defaultName={`Combo ${combos.length + 1}`} onSave={saveCombo} onClose={() => setSaving(false)} />

      {inspected ? <CardDetailOverlay key={inspected.id} name={cardOf(inspected.id).name} card={cardOf(inspected.id).apiCard} origin={inspected.rect} onClose={() => setInspected(null)} /> : null}

      {/* Activación: la carta aparece grande en el centro de la pantalla con brillo amarillo y se desvanece, como en DuelingBook. */}
      {flash
        ? createPortal(
            <div key={flash.key} className="pointer-events-none fixed inset-0 z-205 grid place-items-center" aria-hidden="true" data-activation={flash.id}>
              <div className="aspect-[421/614] w-[min(42vw,13rem)] overflow-hidden rounded-tag bg-input shadow-[0_0_0_3px_#facc15,0_0_60px_#facc15cc,0_24px_48px_rgba(0,0,0,0.6)] animate-card-activate-center motion-reduce:animate-none">
                <CardArt remoteUrl={artOf(cardOf(flash.id))} name={cardOf(flash.id).name} className="block h-full w-full object-cover" />
              </div>
            </div>,
            document.body,
          )
        : null}

      {drag
        ? createPortal(
            <div ref={setGhostElement} className="pointer-events-none fixed left-0 top-0 z-200 opacity-90 will-change-transform" style={{ width: drag.width, height: drag.height }} aria-hidden="true">
              {drag.source.back ? (
                <CardBack className="h-full" />
              ) : drag.source.id === NEW_TOKEN ? (
                <span className="grid h-full w-full place-items-center rounded-tag border border-primary bg-card-background text-micro font-semibold text-foreground">Ficha</span>
              ) : (
                <CardArt remoteUrl={drag.source.art} name={drag.source.name} className="block h-full w-full rounded-tag object-cover shadow-[0_18px_32px_rgba(0,0,0,0.55)]" />
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
  /** Clave del destello de activación (null = quieta). */
  flash: number | null
  glow: boolean
  glowKind: PatternKind | null
  dim: boolean
  /** Elegida como Sacrificio o como material (la etiqueta que lleva), o null. */
  chosen: string | null
  /** Marcada como objetivo. */
  targeted: boolean
  bind: ReturnType<typeof useMatDrag>['bind']
  onOpen: (rect: DOMRect) => void
}

/**
 * Carta en una zona del campo: es tuya, así que boca abajo se ve su imagen atenuada (como en DuelingBook); en defensa o
 * colocada en una zona de monstruo se acuesta a su tamaño y sobresale de la casilla, como en la mesa real; contadores,
 * materiales y objetivo como etiquetas.
 */
function PlacedCard({ placed, spot, card, dragging, flash, glow, glowKind, dim, chosen, targeted, bind, onOpen }: PlacedCardProps) {
  const label = `${card.name}${placed.pos === 'set' ? ', boca abajo' : placed.pos === 'def' ? ', en defensa' : ''}${chosen ? ` (${chosen})` : ''}${targeted ? ' (objetivo)' : ''}`
  const sideways = spot !== 'st' && spot !== 'field' && placed.pos !== 'atk'

  return (
    <div
      key={flash ?? undefined}
      role="button"
      tabIndex={0}
      aria-label={label}
      title={label}
      // Rotación en `transform` (no en `rotate`): así el vuelo entre zonas la lee y la compone bien.
      className={cx(MAT_CARD, 'absolute inset-0 h-full', sideways && 'z-1 [transform:rotate(90deg)]')}
      data-card-id={placed.id}
      data-dragging={dragging ? 'true' : 'false'}
      data-flash={flash !== null ? 'true' : 'false'}
      data-glow={glow ? 'true' : 'false'}
      data-glow-kind={glow ? (glowKind ?? 'opening') : undefined}
      data-dim={dim ? 'true' : 'false'}
      {...bind({ id: placed.id, name: card.name, art: artOf(card) })}
      onKeyDown={(event) => activate(event, () => onOpen(event.currentTarget.getBoundingClientRect()))}
      onContextMenu={(event) => event.preventDefault()}
    >
      <span className={cx('block h-full w-full transition-[filter] duration-150', placed.pos === 'set' && 'brightness-[0.4] saturate-[0.55]')}>
        <CardArt remoteUrl={artOf(card)} name={card.name} className="block h-full w-full object-cover" />
      </span>
      {placed.counters > 0 ? <span className="absolute left-0.5 top-0.5 z-2 rounded-full bg-warning px-1.5 py-px text-[0.6rem] font-extrabold leading-tight text-[#1a1204]">{placed.counters}</span> : null}
      {placed.materials.length > 0 ? <span className="absolute bottom-0.5 right-0.5 z-2 rounded-full bg-primary px-1.5 py-px text-[0.6rem] font-extrabold leading-tight text-primary-foreground">+{placed.materials.length}</span> : null}
      {chosen ? <span className="absolute inset-x-0 bottom-0 z-2 bg-accent/85 py-0.5 text-center text-[0.55rem] font-extrabold uppercase tracking-[0.06em] text-[#06140e]">{chosen}</span> : null}
      {targeted ? <TargetMark /> : null}
    </div>
  )
}
