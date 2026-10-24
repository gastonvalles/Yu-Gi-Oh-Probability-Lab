import { Suspense, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type ComponentType } from 'react'

import type { RoomAutoState } from '../../app/auto/online'
import { buildDuelLink, DUEL_STEP, extractRoomCode, parseDuelTarget, parseDuelView, type DuelView } from '../../app/duel-link'
import { deckFormatIssues } from '../../app/duel-format'
import { MAIN_MINIMUM, renumberDeck, type SideDeck } from '../../app/duel-siding'
import { cleanName, DEFAULT_DUEL_FORMAT, DEFAULT_LIMIT_MIN, DUEL_FORMATS, sameName, uniqueName, type MarkTarget } from '../../app/duel-protocol'
import { formatDataLoaded, loadFormatData } from '../../app/format-data'
import type { DeckFormat } from '../../types'
import { fetchCardsByIds } from '../../ygoprodeck'
import { clearDuelSave, findPausedDuel, readDuelSave, readSidingSave, savedRole, writeSidingSave, type PausedDuel, type SidingDraft } from '../../app/duel-save'
import { createParticipantId, createRoomCode, LIVE_HEARTBEAT_MS } from '../../app/duel-relay-rules'
import type { RoomsApi } from '../../app/duel-rooms'
import { validGenesysCap, validTurnBonusMin, validTurnMin, type RoomOptions } from '../../app/duel-prefs'
import type { Duel, DuelRole, DuelSnapshot } from '../../app/duel-session'
import type { SocketStatus } from '../../app/duel-socket'
import { duelFinished, duelResult } from '../../app/duel-games'
import { DESKTOP_DECK_BUILDER_MEDIA_QUERY, DUEL_DETAIL_DOCK_MEDIA_QUERY, useMediaQuery } from '../../app/use-media-query'
import { duelTurnNumber, sharedPhase, whoseTurn } from '../../app/duel-turn'
import { STARTING_LP } from '../../app/life-calculator'
import { beginDuel } from '../../app/mascot'
import { matEffects, type SpotlightKind } from '../../app/mat-effects'
import { firstFreeMonsterZone, foreignOf, opaqueOfForeign, takeOffer, type TakenKind } from '../../app/mat-control'
import { cardKindOf, createMatState, isForeignId, isToken, PHASES, randomSeed, replayMat, shuffleWithSeed, type MatPile } from '../../app/practice-mat'
import { getCardEffectMap, loadCardEffectMap } from '../../app/card-effect-data'
import { cardEffects, effectDetail } from '../../app/mat-assistant'
import type { CardTextHighlight } from '../../app/card-text'
import { respondersOf, type ChainEvent, type Responder, type ResponderCard } from '../../app/mat-responders'
import { setDuelFullscreen } from '../../app/duel-fullscreen'
import { useChatSound } from '../../app/use-chat-sound'
import { useDuelSounds } from '../../app/use-duel-sounds'
import { useDuel, type DuelConnect, type SpectatorConnect } from '../../app/use-duel'
import type { MatSession } from '../../app/use-mat-session'
import { Presence } from '../../app/use-presence'
import { showToastMessage } from '../../app/use-toast-message'
import { useWakeLock } from '../../app/use-wake-lock'
import { openBuilderFromPlay } from '../../app/play-return'
import { t } from '../../i18n'
import type { AutoDuelScreenProps } from '../auto/AutoDuelScreen'
import { CardArt } from '../CardArt'
import { Button } from '../ui/Button'
import { Callout } from '../ui/Callout'
import { cx } from '../ui/cx'
import { FieldBox, fieldInline } from '../ui/FieldBox'
import { Heading } from '../ui/Heading'
import { Icon } from '../ui/Icon'
import { TONE } from '../ui/tone'
import { Modal } from '../ui/Modal'
import { CloseButton, IconButton } from '../ui/IconButton'
import { CardSheet } from '../probability/CardSheet'
import { MatScene } from '../probability/MatArena'
import { CardMenu, PILE_TITLES, PileViewer, type PileMany } from '../probability/MatDialogs'
import { PracticeMat, type DuelMatLink, type MatCard } from '../probability/PracticeMat'
import { DuelCalculator } from './DuelCalculator'
import { DuelBar, DuelChatToggle, DuelLife, DuelLogTicker, DuelTools, type LaneNotice } from './DuelBar'
import { DuelCardDock, type CardPeek } from './DuelCardDock'
import { useDockPeek } from './use-dock-peek'
import { RivalEmoji, useAutoStartClock, useClockPause, useGameToasts, useSignals } from './use-duel-table'
import { ReactionButtons } from './ReactionButtons'
import { isEmojiSignal } from '../../app/duel-signals'
import { useDuelFeed } from './use-duel-feed'
import { DuelChat } from './DuelChat'
import { PassPrompt } from './PassPrompt'
import { DuelChatPanel } from './DuelChat'
import { DuelPause } from './DuelPause'
import { RivalCardDetail, useRivalCard } from './RivalCardDetail'
import { ResultCard } from './DuelResult'
import type { DuelDeck } from './duel-deck-type'
import { artOfDrawId, passcodeOfDrawId } from './duel-art'
import { DuelOpening, PlayerCard, VersusMark } from './DuelOpening'
import { TurnOrderBanner } from './DuelBanner'
import { InviteButtons, InviteLink } from './RoomInvite'
import { RoomDeck } from './RoomDeck'
import { STAGE_CARD, STAGE_INNER } from './room-stage'
import { RoomRules } from './RoomRules'
import { PlayHome } from './PlayHome'
import { formatName } from './room-chips'
import { DuelSiding } from './DuelSiding'
import { SpectatorScreen } from './SpectatorScreen'
import { TossOverlay } from './toss-views'
import { DUEL_AREAS, DUEL_AREAS_COMPACT, SideCells, sharedZoneCard, TheirHand, type DuelSideView } from './DuelTable'
import { TurnDial } from './TurnDial'

const NAME_KEY = 'ygo-lab:duel-name'
/** Quién creó cada sala (por pestaña): si se recarga la página, sigue siendo el anfitrión. */
const roleKey = (room: string) => `ygo-lab:duel-role:${room}`
/** Lo que eligió el anfitrión de cada sala (el reloj, el formato, si es un Match y si tiene reglas automáticas, por pestaña): si recarga la página, la sala sigue igual. */
const optionsKey = (room: string) => `ygo-lab:duel-options:${room}`
/** La sala con reglas automáticas mientras no está su pantalla (se carga a pedido) o sin ella: nadie puede estar listo. */
const AUTO_PENDING: RoomAutoState = { canReady: false, notice: null }

interface DuelScreenProps {
  handSize: number
  /** Las copias del Main y del Extra del deck armado (`card-123-2`), y cómo se llaman. */
  mainIds: string[]
  extraIds: string[]
  /** El Side Deck del builder: con él se hace el siding de un Match. */
  sideIds?: string[]
  cardsById: ReadonlyMap<string, MatCard>
  deckName: string
  connect: DuelConnect
  /** Cómo entrar a mirar un duelo (sin esto, un enlace para mirar no se puede abrir). */
  connectSpectator?: SpectatorConnect
  /** La lista de salas públicas del relay (sin esto, las salas son sólo por enlace). */
  rooms?: RoomsApi
  /** Avisa si la pantalla de ahora es una mesa (la del duelo o la del espectador), que ocupa todo el alto; el resto (el lobby, la sala, el siding, la pausa) deja la barra de abajo del celular. */
  onImmersiveChange?: (immersive: boolean) => void
  /** Avisa si la pantalla de ahora es el lobby (sin sala: crear una, unirse o mirar) o ya es la sala o el duelo. El buscador de cartas de la app está en el lobby y no en la sala ni en la mesa. */
  onLobbyChange?: (inLobby: boolean) => void
  /** La mesa de una sala con reglas automáticas (la carga a pedido quien usa la pantalla); sin esto, en una sala así nadie puede estar listo. */
  autoDuel?: ComponentType<AutoDuelScreenProps>
}

interface Intent {
  room: string
  role: DuelRole
  /** Entra a mirar, no a jugar. */
  watch?: boolean
}

function readStored(storage: () => Storage, key: string): string | null {
  try {
    return storage().getItem(key)
  } catch {
    return null
  }
}

function writeStored(storage: () => Storage, key: string, value: string) {
  try {
    storage().setItem(key, value)
  } catch {
    // Sin almacenamiento: no se recuerda.
  }
}

/** Con qué rol se entra a una sala: el que se tenía en esta pestaña o, si se volvió desde otra (o desde el inicio del duelo), el de su duelo guardado; si no, invitado. */
function roleFor(room: string): DuelRole {
  const stored = readStored(() => sessionStorage, roleKey(room))

  return stored === 'host' || stored === 'guest' ? stored : (savedRole(room) ?? 'guest')
}

function optionsFor(room: string | undefined): RoomOptions {
  let stored: Partial<RoomOptions> = {}

  try {
    stored = room ? (JSON.parse(readStored(() => sessionStorage, optionsKey(room)) ?? '{}') as Partial<RoomOptions>) : {}
  } catch {
    // Lo guardado no se entiende: valen los de siempre.
  }

  return {
    // Cualquier reloj que el protocolo acepta (una sala de antes pudo tener otro); lo que se ofrece hoy son 50 minutos o sin tiempo.
    limitMin: typeof stored.limitMin === 'number' && Number.isInteger(stored.limitMin) && stored.limitMin >= 0 && stored.limitMin <= 180 ? stored.limitMin : DEFAULT_LIMIT_MIN,
    turnLimit: stored.turnLimit !== false,
    turnMin: validTurnMin(stored.turnMin),
    turnBonusMin: validTurnBonusMin(stored.turnBonusMin),
    format: (DUEL_FORMATS as readonly unknown[]).includes(stored.format) ? (stored.format as DeckFormat) : DEFAULT_DUEL_FORMAT,
    match: stored.match === true,
    siding: stored.match === true && stored.siding === true,
    genesysCap: validGenesysCap(stored.genesysCap),
    // Con reglas automáticas la sala es privada: el relay no publica ese dato y nadie tiene que caer en una sin saberlo.
    isPublic: stored.isPublic === true && stored.auto !== true,
    auto: stored.auto === true,
  }
}

/** La sala que pide el enlace con que se abrió la página, si hay una. */
function intentOf(hash: string): Intent | null {
  const target = parseDuelTarget(hash)

  if (!target) {
    return null
  }

  return target.watch ? { room: target.room, role: 'guest', watch: true } : { room: target.room, role: roleFor(target.room) }
}

function readIntent(): Intent | null {
  return typeof window === 'undefined' ? null : intentOf(window.location.hash)
}

/** El siding de un Match de una sala: el deck que se está armando y si su pantalla está abierta. La clave dice de qué sala y de qué rol es (una sala que se mira no tiene). */
interface SidingState {
  key: string
  deck: SideDeck | null
  open: boolean
  /** Lo que se está armando en la pantalla (y cuándo se acaba el tiempo). */
  draft: SidingDraft | null
}

const sidingKeyOf = (intent: Intent | null) => (intent && !intent.watch ? `${intent.room}:${intent.role}` : '')

/** Lo guardado del siding de esa sala. La pantalla sólo vale abierta si la mesa del duelo que terminó también se guardó (si no, no hay a qué volver y se parte de cero). */
function storedSiding(intent: Intent | null): SidingState {
  const key = sidingKeyOf(intent)
  const stored = intent && key !== '' ? readSidingSave(intent.room, intent.role) : null

  const open = Boolean(stored?.open && intent && readDuelSave(intent.room, intent.role))

  return { key, deck: stored?.deck ?? null, open, draft: open ? (stored?.draft ?? null) : null }
}

/** Pone la sala en la dirección (sin sumar una entrada al historial): así se puede copiar o recargar. */
function showRoomInUrl(room: string | null, watch = false) {
  window.history.replaceState(null, '', room ? `#${DUEL_STEP}?room=${room}${watch ? '&watch=1' : ''}` : `#${DUEL_STEP}`)
}

/**
 * El duelo por enlace: sin sala, el lobby (crear una o unirse con un código); en la sala, el enlace para el rival hasta que los dos
 * reparten su mano; y después la mesa de práctica con el campo del rival arriba. No sabe de redes: `connect` (el relay) lo pone quien la usa.
 */
export function DuelScreen({ handSize, mainIds, extraIds, sideIds, cardsById, deckName, connect, connectSpectator, rooms, onImmersiveChange, onLobbyChange, autoDuel: AutoDuel }: DuelScreenProps) {
  // De momento las mascotas no aparecen en los duelos (ni en el lobby, la sala o la mesa): las que andan flotando esperan afuera.
  useEffect(() => {
    // `data-duel` hace que, en celular, los avisos se dibujen arriba de la botonera (ver index.css).
    document.body.dataset.duel = ''
    const endDuel = beginDuel()

    return () => {
      delete document.body.dataset.duel
      endDuel()
    }
  }, [])
  const [name, setName] = useState(() => readStored(() => localStorage, NAME_KEY) ?? '')
  const [intent, setIntent] = useState<Intent | null>(readIntent)
  // El paso del lobby que pidió la hoja de Duelo del celular (`#duel?view=…`): se aplica una vez y se borra de la dirección.
  const [view, setView] = useState<DuelView | null>(() => (typeof window === 'undefined' ? null : parseDuelView(window.location.hash)))
  const myName = cleanName(name) || t('duel.lobby.defaultName')
  // El deck es siempre el del builder (Gastón: toda referencia al deck lleva al builder); se juega con los puntos de vida de siempre.
  // En un Match con siding, el deck de los duelos que siguen es el que quedó después de cambiar cartas (el rival no lo ve). Se guarda con la sala: recargar vuelve al siding, con las cartas como estaban.
  const [sidingState, setSidingState] = useState<SidingState>(() => storedSiding(intent))
  const sidingKey = sidingKeyOf(intent)
  const siding = sidingState.key === sidingKey ? sidingState : storedSiding(intent)
  const sidingRef = useRef(siding)

  sidingRef.current = siding

  useEffect(() => {
    if (sidingState.key !== sidingKey) setSidingState(storedSiding(intent))
  }, [sidingState.key, sidingKey, intent])

  const updateSiding = useCallback(
    (patch: Partial<Pick<SidingState, 'deck' | 'open' | 'draft'>>) => {
      const next = { ...sidingRef.current, ...patch }

      sidingRef.current = next
      setSidingState(next)

      if (intent && next.key !== '') writeSidingSave(intent.room, intent.role, next)
    },
    [intent],
  )
  const sided = siding.deck
  const sidingOpen = siding.open
  const setSided = (next: SideDeck | null) => updateSiding({ deck: next })
  const setSidingOpen = (open: boolean) => updateSiding(open ? { open } : { open, draft: null })
  const deck = useMemo<DuelDeck>(() => {
    const base = { name: deckName, mainIds, extraIds, sideIds, cardsById }

    if (!sided) return base

    // Los datos de cada carta salen del deck de partida (las copias se renumeran al cambiar de zona).
    const restored = renumberDeck(sided, base.cardsById)

    return { ...base, mainIds: restored.deck.main, extraIds: restored.deck.extra, sideIds: restored.deck.side, cardsById: restored.cardsById }
  }, [sided, deckName, mainIds, extraIds, sideIds, cardsById])
  const roomCode = intent?.room
  const options = useMemo(() => optionsFor(roomCode), [roomCode])
  // Con reglas automáticas: un solo duelo y sin reloj de turnos (el núcleo lleva la mesa: de este lado no hay turnos que contar ni cartas que cambiar entre duelos).
  const settings = useMemo(
    () => ({ lp: STARTING_LP, hand: handSize, limitMin: options.limitMin, turnMin: options.turnLimit ? options.turnMin : 0, turnBonusMin: options.turnLimit ? options.turnBonusMin : 0, format: options.format, ...(options.format === 'genesys' ? { genesysCap: options.genesysCap } : {}), match: options.match, siding: options.siding, ...(options.auto ? { auto: true, turnMin: 0, turnBonusMin: 0, match: false, siding: false } : {}) }),
    [handSize, options],
  )
  const { duel, snapshot, status, transport } = useDuel({ room: intent && !intent.watch ? intent.room : null, role: intent?.role ?? 'guest', name: myName, settings, connect })
  const deckReady = deck.mainIds.length >= handSize

  // Cuando ya se eligió quién va primero, cada uno reparte su mano solo (hace falta el deck y, del invitado, los ajustes del anfitrión).
  const ordered = snapshot?.opening.ordered ?? false
  const started = snapshot?.mine != null
  const settingsKnown = snapshot ? snapshot.role === 'host' || snapshot.peerName !== null : false
  const dealHand = snapshot?.settings.hand ?? handSize
  // Una sala con reglas automáticas nunca reparte la mesa manual (ni la guarda, ni la pausa, ni el siding de acá): la mesa la cuenta el núcleo, en la pantalla del duelo automático.
  // El invitado lo sabe con el saludo del anfitrión, que llega antes de que nadie pueda elegir quién empieza.
  const autoRoom = snapshot?.settings.auto === true

  // Una sala pública está en la lista de salas abiertas mientras espera rival (se anota al crearla). Cuando llega el rival pasa a la de los duelos en vivo y su anfitrión lo avisa cada minuto,
  // con cuántos lo miran; si el relay no lo entiende (uno de antes), se baja como siempre al llegar el rival. Se baja al salir o al cerrar la pestaña, y una sala privada nunca se anota.
  // Terminado el duelo y con el rival ya afuera, la sala no espera a nadie: no vuelve a la lista de las que esperan rival (ahí un tercero entraría a ver la mesa de quien se quedó) y se cierra sola.
  const rivalLeft = snapshot ? !snapshot.peerPresent && duelFinished(duelResult(snapshot.life.lp, snapshot.conceded), snapshot.series.match, snapshot.series.winner) : false
  const publicCode = rooms && intent && !intent.watch && intent.role === 'host' && options.isPublic && !rivalLeft ? intent.room : null
  const awaitingRival = !snapshot?.peerPresent
  const watchers = snapshot?.watchers ?? 0
  const guestName = snapshot?.peerName ?? undefined
  const listing = useRef({ name: myName, settings })

  listing.current = { name: myName, settings }

  // Lo que prueba que quien baja la sala es quien la anotó: uno por sala, no uno por cada vez que cambia de lista.
  const publicToken = useMemo(() => (publicCode ? createParticipantId() : ''), [publicCode])

  useEffect(() => {
    if (!rooms || !publicCode) {
      return
    }

    const unlist = () => rooms.unlist(publicCode, publicToken)

    window.addEventListener('pagehide', unlist)

    return () => {
      window.removeEventListener('pagehide', unlist)
      unlist()
    }
  }, [rooms, publicCode, publicToken])

  useEffect(() => {
    if (!rooms || !publicCode || !awaitingRival) {
      return
    }

    const { name: host, settings: current } = listing.current

    void rooms.register(publicCode, { host, match: current.match, siding: current.siding, format: current.format, limitMin: current.limitMin, ...(current.genesysCap !== undefined ? { genesysCap: current.genesysCap } : {}) }, publicToken)
  }, [rooms, publicCode, publicToken, awaitingRival])

  useEffect(() => {
    if (!rooms || !publicCode || awaitingRival) {
      return
    }

    const { name: host, settings: current } = listing.current
    const info = { host, match: current.match, siding: current.siding, format: current.format, limitMin: current.limitMin, ...(current.genesysCap !== undefined ? { genesysCap: current.genesysCap } : {}) }
    let alive = true

    const beat = () => {
      void rooms.live(publicCode, info, watchers, publicToken, guestName).then((registered) => {
        // El relay no lo registró (uno de antes, o sin red): no queda anotada como si esperara; se baja y no se insiste.
        if (!registered && alive) {
          alive = false
          window.clearInterval(timer)
          rooms.unlist(publicCode, publicToken)
        }
      })
    }

    beat()
    const timer = window.setInterval(beat, LIVE_HEARTBEAT_MS)

    return () => {
      alive = false
      window.clearInterval(timer)
    }
  }, [rooms, publicCode, publicToken, awaitingRival, watchers, guestName])

  // Sólo la mesa es a pantalla completa; antes de ella y entre un duelo y el siguiente (lobby, sala, siding, pausa) la app lleva su barra de abajo en el celular.
  // En una sala con reglas automáticas la mesa (la del núcleo) va desde que se eligió quién empieza hasta la revancha, como la manual.
  const inSiding = sidingOpen && Boolean(snapshot?.mine && snapshot.series.winner === null)
  const onTable = intent !== null && (intent.watch === true || Boolean(duel && snapshot?.mine && snapshot.theirs && !inSiding) || Boolean(duel && autoRoom && ordered))

  useEffect(() => {
    onImmersiveChange?.(onTable)
  }, [onTable, onImmersiveChange])
  useEffect(() => () => onImmersiveChange?.(false), [onImmersiveChange])

  // La ventana grande es de la mesa: al salir de ella (a la sala, al lobby, a otra pantalla) se apaga.
  useEffect(() => {
    if (!onTable) setDuelFullscreen(false)
  }, [onTable])
  useEffect(() => () => setDuelFullscreen(false), [])

  // Sin sala es el lobby; con sala (también mirando, en pausa o entre dos duelos de un Match) ya es un duelo. En un layout effect: el menú no muestra el buscador ni un cuadro de más.
  useLayoutEffect(() => {
    onLobbyChange?.(intent === null)
  }, [intent, onLobbyChange])
  useEffect(() => () => onLobbyChange?.(false), [onLobbyChange])

  // Con sala (la sala, la mesa, mirando, el siding, la pausa) la pantalla no se apaga: se espera al rival sin tocar nada. En el lobby sí puede apagarse.
  useWakeLock(intent !== null)

  // Cada mensaje de los jugadores, tuyo o del rival, hace un sonido sutil (quien mira no lo escucha).
  useChatSound(intent?.watch ? undefined : snapshot?.chat, snapshot?.me)
  // Y cada jugada de la mesa (tuya y del rival), los puntos de vida, la moneda, el dado y el resultado (con la mesa abierta; los sonidos se apagan en «Más opciones»).
  // La mesa del núcleo pone sus propios sonidos (sonarían dos veces).
  useDuelSounds(onTable && !intent?.watch && !autoRoom ? snapshot : null)

  // El siding se cierra solo cuando los dos aceptaron y la mesa se limpió para el duelo que sigue (no antes: al recargar, la mesa tarda en volver y no por eso se sale).
  const hadTable = useRef(false)

  useEffect(() => {
    if (snapshot?.mine) {
      hadTable.current = true
    } else if (hadTable.current) {
      hadTable.current = false
      if (sidingRef.current.open) updateSiding({ open: false, draft: null })
    }
  }, [snapshot?.mine, updateSiding])

  useEffect(() => {
    if (duel && ordered && !started && settingsKnown && deckReady && !autoRoom) {
      duel.start(createMatState(shuffleWithSeed(deck.mainIds, randomSeed()), deck.extraIds, dealHand))
    }
  }, [duel, ordered, started, settingsKnown, deckReady, deck, dealHand, autoRoom])

  // Pegar un enlace de duelo en la barra de direcciones (o abrirlo en esta misma pestaña) lleva a esa sala.
  useEffect(() => {
    const onHashChange = () => {
      setView(parseDuelView(window.location.hash))
      const next = intentOf(window.location.hash)

      // Si la dirección ya no tiene sala (atrás del navegador, un enlace pegado sin sala), se sale de la que había: si no, la sala sigue
      // viva para la app (su conexión, el aviso a la lista de salas abiertas) aunque la dirección diga que no hay ninguna.
      setIntent((current) => {
        if (!next) return current === null ? current : null

        return current?.room === next.room && Boolean(current.watch) === Boolean(next.watch) ? current : next
      })
    }

    window.addEventListener('hashchange', onHashChange)
    return () => window.removeEventListener('hashchange', onHashChange)
  }, [])

  const enter = useCallback(
    (room: string, role: DuelRole, watch = false, options?: RoomOptions) => {
      writeStored(() => localStorage, NAME_KEY, cleanName(name))

      if (options) {
        writeStored(() => sessionStorage, optionsKey(room), JSON.stringify(options))
      }

      if (!watch) {
        writeStored(() => sessionStorage, roleKey(room), role)
      }

      showRoomInUrl(room, watch)
      setIntent({ room, role, ...(watch ? { watch: true } : {}) })
    },
    [name],
  )

  // Quien entra por un enlace no pasó por el lobby: el nombre se cambia (y se le avisa al rival) desde la sala.
  const peerName = snapshot?.peerName ?? null
  const isGuest = snapshot?.role === 'guest'
  const rename = useCallback(
    (value: string) => {
      const clean = cleanName(value) || t('duel.lobby.defaultName')

      // Los dos jugadores no pueden llamarse igual: el nombre del rival no se acepta (y el campo vuelve al que estaba).
      if (sameName(clean, peerName)) {
        showToastMessage(t('duel.room.nameTaken'), 'error')
        return false
      }

      setName(value)
      writeStored(() => localStorage, NAME_KEY, cleanName(value))
      duel?.rename(clean)
      return true
    },
    [duel, peerName],
  )

  // Quien llega a una sala y se llama igual que el anfitrión pasa a llamarse con un número al final (sin tocar el nombre que tiene guardado en el navegador).
  useEffect(() => {
    if (!duel || !isGuest || peerName === null || !sameName(myName, peerName)) {
      return
    }

    const next = uniqueName(myName, peerName)

    setName(next)
    duel.rename(next)
  }, [duel, isGuest, myName, peerName])

  // Salir deja el duelo en pausa: lo guardado (la mesa, las vidas, el reloj) sigue ahí para volver. Sólo si ya terminó (alguien se rindió o se quedó sin vidas) no hay nada que retomar.
  const finished = snapshot ? duelResult(snapshot.life.lp, snapshot.conceded) !== null : false
  const leave = useCallback(() => {
    if (intent && finished) clearDuelSave(intent.room)

    showRoomInUrl(null)
    setIntent(null)
  }, [intent, finished])

  // Salir de un duelo en curso es abandonarlo: se rinde (el rival gana) y no queda nada en pausa para volver.
  const abandon = useCallback(() => {
    duel?.concede()

    if (intent) clearDuelSave(intent.room)

    showRoomInUrl(null)
    setIntent(null)
  }, [duel, intent])

  const leaveToCreate = () => {
    setCreateNext(true)
    leave()
  }

  // El duelo terminó y el rival se fue: a los ROOM_CLOSE_S segundos la sala se da por terminada del todo (se corta para todos y no entra nadie más) y se vuelve al inicio.
  const closeRoom = useCallback(() => {
    duel?.endRoom()
    leave()
  }, [duel, leave])
  // Sólo cuenta si la conexión de uno anda: si la que se cayó es la propia, no se puede decir que el rival se fue.
  const closingIn = useRoomClosing(rivalLeft && status === 'open', closeRoom)

  // El duelo en pausa de este navegador (si salió de uno), para volver desde el inicio del duelo.
  const [paused, setPaused] = useState<PausedDuel | null>(findPausedDuel)
  // «Crear una sala» desde la pantalla de un enlace que no funciona: vuelve al lobby ya en ese paso.
  const [createNext, setCreateNext] = useState(false)

  useEffect(() => {
    if (!intent) {
      setPaused(findPausedDuel())
    }
  }, [intent])

  if (!intent) {
    return (
      <DuelLobby
        startInCreate={createNext}
        view={view}
        onViewHandled={() => {
          setView(null)

          if (parseDuelView(window.location.hash)) window.history.replaceState(null, '', `#${DUEL_STEP}`)
        }}
        name={name}
        onName={setName}
        deckName={deckName}
        onOpenBuilder={openBuilderFromPlay}
        deckReady={deckReady}
        deckSize={deck.mainIds.length}
        minDeck={handSize}
        onCreate={(options) => enter(createRoomCode(), 'host', false, options)}
        onPlaySolo={() => {
          window.location.hash = '#practice'
        }}
        soloReady={mainIds.length >= handSize}
        rooms={rooms}
        onJoin={(room, watch) => enter(room, watch ? 'guest' : (savedRole(room) ?? 'guest'), watch)}
        paused={paused}
        onResume={() => paused && enter(paused.room, paused.role)}
        onDropPaused={() => {
          if (paused) clearDuelSave(paused.room)
          setPaused(findPausedDuel())
        }}
      />
    )
  }

  // Mirando: sin deck, sin nombre y sin jugar; la pantalla del espectador no tiene nada que tocar.
  if (intent.watch) {
    return connectSpectator ? (
      <SpectatorScreen room={intent.room} connect={connectSpectator} onLeave={leave} />
    ) : (
      <Screen>
        <Callout tone="info">{t('duel.unavailable')}</Callout>
      </Screen>
    )
  }

  // La sala ya tiene a sus dos jugadores: no es un enlace roto, se puede mirar (sin deck ni nombre).
  if (status === 'full') {
    return (
      <Screen>
        <RoomFull onWatch={() => enter(intent.room, 'guest', true)} onRetry={leave} />
      </Screen>
    )
  }

  // La sala se cerró (el duelo terminó y alguno la dio por terminada): ya no existe, y quien llega tarde no ve nada de ella.
  if (status === 'gone') {
    return (
      <Screen>
        <LinkGone onRetry={leave} onCreate={leaveToCreate} />
      </Screen>
    )
  }

  if (!duel || !snapshot || !transport) {
    return (
      <Screen>
        <p className="text-body text-muted">{t('duel.status.connecting')}</p>
      </Screen>
    )
  }

  const renderRoom = (auto?: RoomAutoState) => (
    <DuelRoom
      duel={duel}
      snapshot={snapshot}
      status={status}
      room={intent.room}
      myName={myName}
      name={name}
      onRename={rename}
      deckReady={deckReady}
      deck={{ name: deckName, mainIds: deck.mainIds, extraIds: deck.extraIds, cardsById: deck.cardsById, size: deck.mainIds.length, min: handSize, onOpenBuilder: openBuilderFromPlay }}
      isPublic={rooms && intent.role === 'host' ? options.isPublic : null}
      onLeave={leave}
      onLeaveToCreate={leaveToCreate}
      auto={auto}
    />
  )

  // Una sala con reglas automáticas: la sala de siempre y la mesa del núcleo, las dos en la pantalla del duelo automático (que se carga a pedido; mientras tanto, la sala sin poder estar listo).
  // Nunca la mesa manual, su pausa ni el siding: en una sala así no hay revancha con siding ni Match, así que la revancha es la de siempre.
  if (autoRoom) {
    return (
      <>
        {AutoDuel ? (
          <Suspense fallback={renderRoom(AUTO_PENDING)}>
            <AutoDuel duel={duel} snapshot={snapshot} status={status} transport={transport} myName={myName} deck={deck} handSize={dealHand} room={renderRoom} onLeave={leave} onAbandon={abandon} onRematch={duel.rematch} code={intent.room} />
          </Suspense>
        ) : (
          renderRoom(AUTO_PENDING)
        )}
        {closingIn === null ? null : <RoomClosing name={snapshot.peerName ?? t('duel.bar.rival')} seconds={closingIn} />}
      </>
    )
  }

  // El siding de un Match: no hay otra pantalla hasta tocar «Listo», tampoco al recargar o volver al duelo (ni la pausa, ni la sala, ni la mesa).
  if (sidingOpen && snapshot.mine && snapshot.series.winner === null) {
    return (
      <Screen wide>
        <DuelSiding
          deck={{ main: deck.mainIds, extra: deck.extraIds, side: deck.sideIds ?? [] }}
          cardsById={deck.cardsById}
          format={snapshot.settings.format}
          genesysCap={snapshot.settings.genesysCap}
          rival={snapshot.peerName ?? t('duel.bar.rival')}
          locked={snapshot.rematch.mine}
          rivalReady={snapshot.rematch.theirs}
          saved={siding.draft}
          onProgress={(draft) => updateSiding({ draft })}
          onReady={(next) => {
            updateSiding({ deck: next })
            duel.rematch()
          }}
        />
      </Screen>
    )
  }

  // Volvió a su mesa (la guardada) y el rival todavía no: el duelo está en pausa, no hay nada que preparar.
  if (snapshot.mine && !snapshot.theirs && !snapshot.peerPresent) {
    return (
      <div className="h-full">
        <DuelPause rival={snapshot.peerName ?? t('duel.bar.rival')} offline={status !== 'open'} onLeave={leave} onReconnect={duel.reconnect} />
      </div>
    )
  }

  if (!snapshot.mine || !snapshot.theirs) {
    return renderRoom()
  }

  // Terminado un duelo de un Match con siding, «Siguiente duelo» lleva a cambiar cartas antes de pedir la revancha; el Match ganado vuelve al deck de origen.
  const withSiding = snapshot.settings.siding && snapshot.series.match && snapshot.series.winner === null
  const rematch = () => {
    if (snapshot.series.winner !== null) setSided(null)

    if (withSiding && !snapshot.rematch.mine) {
      setSidingOpen(true)
    } else {
      duel.rematch()
    }
  }

  return (
    <>
      <DuelTableScreen duel={duel} snapshot={snapshot} status={status} myName={myName} cardsById={deck.cardsById} deckName={deck.name} onRematch={rematch} onLeave={leave} onAbandon={abandon} />
      {closingIn === null ? null : <RoomClosing name={snapshot.peerName ?? t('duel.bar.rival')} seconds={closingIn} />}
    </>
  )
}

/** Cuánto falta para que la sala se cierre cuando el duelo terminó y el rival se fue. */
const ROOM_CLOSE_S = 5

/**
 * Los segundos que le quedan a la sala antes de cerrarse (`null` si no se cierra). Arranca cuando `active` (el duelo terminó y el rival se fue), se cancela si el rival vuelve y, al llegar a cero,
 * llama a `onClose` una sola vez.
 */
function useRoomClosing(active: boolean, onClose: () => void): number | null {
  const [left, setLeft] = useState<number | null>(null)
  const close = useRef(onClose)

  close.current = onClose

  useEffect(() => {
    if (!active) {
      setLeft(null)
      return
    }

    setLeft(ROOM_CLOSE_S)

    const id = window.setInterval(() => setLeft((current) => (current === null ? null : current - 1)), 1000)

    return () => window.clearInterval(id)
  }, [active])

  useEffect(() => {
    if (left !== null && left <= 0) {
      close.current()
    }
  }, [left])

  return left === null || left <= 0 ? null : left
}

/** El aviso de que la sala va a desaparecer, con la cuenta: arriba y al centro, sobre la tarjeta del resultado. */
function RoomClosing({ name, seconds }: { name: string; seconds: number }) {
  return (
    <div role="status" aria-live="polite" data-testid="room-closing" className="pointer-events-none fixed inset-x-0 top-3 z-70 grid justify-items-center px-4">
      <p className="m-0 max-w-md rounded-card border border-warning/60 bg-surface-raised px-4 py-3 text-center text-body font-semibold text-foreground shadow-overlay">{t('duel.room.closing', { name, count: seconds })}</p>
    </div>
  )
}

/** Lo que no es la mesa: una columna que scrollea, con el ancho de una pantalla de lectura. */
function Screen({ children, wide = false, tight = false, aside }: { children: React.ReactNode; /** Más ancha, para lo que lleva grillas de cartas (el siding). */ wide?: boolean; /** Menos aire y, con `aside`, más ancha: la sala tiene que entrar en la pantalla sin scroll. */ tight?: boolean; /** Una columna al costado (el chat de la sala, sólo en escritorio): las dos van lado a lado. */ aside?: React.ReactNode }) {
  return (
    <div className="h-full min-h-0 overflow-y-auto max-[1101px]:overflow-visible">
      {aside ? (
        /* Las dos columnas miden lo mismo de alto (la del costado se estira hasta donde llega la otra): si no, el chat termina a la mitad de la columna de al lado. */
        <div className={cx('mx-auto grid w-full content-start items-stretch px-8 min-[1101px]:grid-cols-[minmax(0,1fr)_20rem]', tight ? 'max-w-[90rem] gap-5 py-4 min-[1101px]:h-full min-[1101px]:grid-rows-[minmax(0,1fr)]' : 'max-w-5xl gap-6 py-6')}>
          <div className={cx('grid min-w-0 grid-cols-[minmax(0,1fr)] content-start', tight ? 'gap-3 min-[1101px]:grid-rows-[minmax(0,1fr)]' : 'gap-4')}>{children}</div>
          {aside}
        </div>
      ) : (
        /* Una sola columna que se puede achicar (`minmax(0, 1fr)`): con la pista automática, un botón que no cabe a 320 px ensancha toda la columna y se corta del lado derecho. */
        <div className={cx('mx-auto grid w-full grid-cols-[minmax(0,1fr)] content-start px-4', wide ? 'max-w-5xl' : 'max-w-xl', tight ? 'gap-3 py-3' : 'gap-4 py-6')}>{children}</div>
      )}
    </div>
  )
}

const ROOM_STEPS = ['duel.room.step.invite', 'duel.room.step.ready', 'duel.room.step.start'] as const

/** Dónde va la sala: invitar al rival, los dos listos, y quién empieza. Lo que ya pasó queda lleno; el paso en el que está, en negrita. */
function RoomSteps({ step, className }: { step: number; className?: string }) {
  return (
    <ol aria-label={t('duel.room.steps')} className={cx('m-0 grid max-w-lg list-none grid-cols-3 gap-2 p-0', className)}>
      {ROOM_STEPS.map((key, index) => (
        <li key={key} aria-current={index === step ? 'step' : undefined} className={cx('grid gap-1.5 text-micro', index === step ? 'font-semibold text-foreground' : 'text-soft')}>
          <i aria-hidden="true" className={cx('block h-1 rounded-full', index <= step ? 'bg-primary' : 'bg-surface-hover')} />
          {t(key)}
        </li>
      ))}
    </ol>
  )
}

interface DuelLobbyProps {
  /** Abre ya en el paso «Crear una sala». */
  startInCreate?: boolean
  /** El paso que pidió el menú del celular: crear una sala, mirar un duelo o entrar con un enlace (el campo del enlace recibe el foco). */
  view?: DuelView | null
  onViewHandled?: () => void
  name: string
  onName: (name: string) => void
  deckName: string
  /** Ver o armar el deck: va al builder (con «Volver a Jugar»). */
  onOpenBuilder: () => void
  deckReady: boolean
  deckSize: number
  minDeck: number
  onCreate: (options: RoomOptions) => void
  /** Jugar solo: la mesa de práctica, local y sin relay. */
  onPlaySolo: () => void
  /** Hay un deck armado en el builder (la práctica juega con ése). */
  soloReady: boolean
  /** La lista de salas públicas, si el relay la tiene. */
  rooms?: RoomsApi
  /** Entrar a una sala: a jugar, o a mirar si el enlace pegado es de espectador. */
  onJoin: (room: string, watch: boolean) => void
  /** Un duelo en pausa de este navegador, y cómo volver a él o dejarlo. */
  paused: PausedDuel | null
  onResume: () => void
  onDropPaused: () => void
}

function DuelLobby({ startInCreate = false, view = null, onViewHandled, name, onName, deckName, onOpenBuilder, deckReady, deckSize, minDeck, onCreate, onPlaySolo, soloReady, rooms, onJoin, paused, onResume, onDropPaused }: DuelLobbyProps) {
  const [watching, setWatching] = useState(view === 'watch')

  // Lo que pide el menú (Nueva sala, Mirar un duelo, Entrar con un enlace) se aplica una vez, también si el lobby ya estaba abierto. Crear y entrar los atiende el inicio de Jugar.
  useEffect(() => {
    if (view === null) {
      return
    }

    if (view === 'watch') setWatching(true)

    onViewHandled?.()
  }, [view, onViewHandled])

  if (watching) {
    return <WatchRoom onBack={() => setWatching(false)} onWatch={(room) => onJoin(room, true)} />
  }

  return (
    <Screen wide={Boolean(rooms)}>
      <PlayHome
        view={startInCreate ? 'create' : view}
        name={name}
        onName={onName}
        deckName={deckName}
        onOpenBuilder={onOpenBuilder}
        deckReady={deckReady}
        deckSize={deckSize}
        minDeck={minDeck}
        rooms={rooms}
        trainReady={soloReady}
        onTrain={onPlaySolo}
        onOpenDuel={onCreate}
        onJoin={onJoin}
        paused={paused}
        onResume={onResume}
        onDropPaused={onDropPaused}
      />
    </Screen>
  )
}

interface WatchRoomProps {
  onBack: () => void
  /** Entrar a mirar la sala del enlace (o el código) pegado. */
  onWatch: (room: string) => void
}

/** Mirar un duelo: se pega el enlace (o el código) de una sala y se entra de espectador, sin deck ni nombre. La mesa se ve en vivo y no se puede tocar nada. */
function WatchRoom({ onBack, onWatch }: WatchRoomProps) {
  const [link, setLink] = useState('')
  const [invalid, setInvalid] = useState(false)
  const canPaste = typeof navigator !== 'undefined' && typeof navigator.clipboard?.readText === 'function'

  const watch = () => {
    const room = extractRoomCode(link)

    if (room) {
      onWatch(room)
    } else {
      setInvalid(true)
    }
  }

  const paste = () => {
    void navigator.clipboard
      .readText()
      .then((text) => {
        setLink(text)
        setInvalid(false)
      })
      .catch(() => undefined)
  }

  return (
    <Screen>
      <div className="flex items-center gap-2">
        <IconButton tone="raised" size="md" aria-label={t('duel.create.back')} title={t('duel.create.back')} onClick={onBack}>
          <Icon name="chevron-left" size={18} />
        </IconButton>
        <Heading level="section">{t('duel.watchRoom.title')}</Heading>
      </div>

      <form
        className="grid gap-4"
        onSubmit={(event) => {
          event.preventDefault()
          watch()
        }}
      >
        <div className="grid gap-1.5">
          <span className="text-micro font-semibold uppercase text-soft">{t('duel.watchRoom.link')}</span>
          <div className="flex items-center gap-2">
            <FieldBox className="min-w-0 flex-1">
              <input
                aria-label={t('duel.watchRoom.link')}
                placeholder={t('duel.watchRoom.placeholder')}
                value={link}
                onChange={(event) => {
                  setLink(event.target.value)
                  setInvalid(false)
                }}
                className={fieldInline}
              />
            </FieldBox>
            {canPaste ? (
              <IconButton type="button" tone="raised" size="md" aria-label={t('duel.watchRoom.paste')} title={t('duel.watchRoom.paste')} onClick={paste}>
                <Icon name="clipboard" size={18} />
              </IconButton>
            ) : null}
          </div>
          <p className={invalid ? 'm-0 text-micro text-danger' : 'm-0 text-micro text-soft'} role={invalid ? 'alert' : undefined}>
            {invalid ? t('duel.lobby.joinInvalid') : t('duel.watchRoom.hint')}
          </p>
        </div>

        <div className="flex flex-wrap items-center justify-end gap-2">
          <Button variant="tertiary" onClick={onBack}>
            {t('duel.watchRoom.cancel')}
          </Button>
          <Button type="submit" variant="primary" icon="eye" disabled={link.trim() === ''}>
            {t('duel.watchRoom.start')}
          </Button>
        </div>
      </form>
    </Screen>
  )
}

/** La sala ya tiene a sus dos jugadores: lo dice y deja mirar el duelo (sin deck ni nombre) o probar otro enlace. */
function RoomFull({ onWatch, onRetry }: { onWatch: () => void; onRetry: () => void }) {
  return (
    <div className="grid justify-items-center gap-4 py-10 text-center">
      <Icon name="eye" size={40} className="text-muted" />
      <div className="grid gap-1.5">
        <h2 className="m-0 text-heading font-bold text-foreground">{t('duel.full.title')}</h2>
        <p className="m-0 text-body text-muted">{t('duel.full.text')}</p>
      </div>
      <div className="grid w-full gap-2">
        <Button variant="primary" icon="eye" onClick={onWatch}>
          {t('duel.full.watch')}
        </Button>
        <Button variant="tertiary" onClick={onRetry}>
          {t('duel.gone.retry')}
        </Button>
      </div>
    </div>
  )
}

/** Un enlace que ya no funciona (la sala se cerró o ya tiene a sus dos jugadores): lo dice y deja probar otro enlace o crear una sala. */
function LinkGone({ onRetry, onCreate }: { onRetry: () => void; onCreate: () => void }) {
  return (
    <div className="grid justify-items-center gap-4 py-10 text-center">
      <Icon name="link-off" size={40} className="text-muted" />
      <div className="grid gap-1.5">
        <h2 className="m-0 text-heading font-bold text-foreground">{t('duel.gone.title')}</h2>
        <p className="m-0 text-body text-muted">{t('duel.gone.text')}</p>
      </div>
      <div className="grid w-full gap-2">
        <Button variant="primary" onClick={onRetry}>
          {t('duel.gone.retry')}
        </Button>
        <Button variant="tertiary" onClick={onCreate}>
          {t('duel.gone.create')}
        </Button>
      </div>
    </div>
  )
}

/** Cuánto espera quien entra por un enlace antes de pensar que el enlace venció (el anfitrión que lo creó ya debería estar adentro). */
const EMPTY_ROOM_MS = 12_000

/** Pasó `ms` mientras `active` sigue siendo cierto; al dejar de serlo (o al salir) vuelve a empezar. */
function useWaited(ms: number, active: boolean): boolean {
  const [waited, setWaited] = useState(false)

  useEffect(() => {
    if (!active) {
      setWaited(false)
      return
    }

    const id = setTimeout(() => setWaited(true), ms)
    return () => clearTimeout(id)
  }, [ms, active])

  return waited
}

/** La sala hasta que los dos tienen su mano: el enlace para el rival, quién está listo, cómo se define quién empieza y el chat. */
interface DuelRoomProps {
  duel: Duel
  snapshot: DuelSnapshot
  status: SocketStatus
  room: string
  myName: string
  /** El nombre como se escribió (vacío si no hay) y cómo cambiarlo. */
  name: string
  onRename: (name: string) => boolean
  deckReady: boolean
  /** Con qué deck se juega: el del builder, al que se va desde la sala (quien entra por un enlace no pasó por el lobby). */
  deck: { name: string; mainIds: string[]; extraIds: string[]; cardsById: ReadonlyMap<string, MatCard>; size: number; min: number; onOpenBuilder: () => void }
  /** Si la sala está en la lista de salas abiertas (sólo lo sabe el anfitrión, y sólo si el relay tiene la lista); `null` si no se sabe o no hay lista. */
  isPublic: boolean | null
  onLeave: () => void
  /** Salir y volver al lobby directo a «Crear una sala» (desde la pantalla de un enlace que ya no funciona). */
  onLeaveToCreate: () => void
  /** Una sala con reglas automáticas: si ya se puede estar listo (se revisaron los dos decks) y lo que se le dice a quien espera, debajo del deck. */
  auto?: RoomAutoState
}

function DuelRoom({ duel, snapshot, status, room, myName, name, onRename, deckReady, deck: deckInfo, isPublic, onLeave, onLeaveToCreate, auto }: DuelRoomProps) {
  const link = buildDuelLink(window.location.origin, window.location.pathname, room)
  const docked = useMediaQuery(DESKTOP_DECK_BUILDER_MEDIA_QUERY)
  const { peerPresent, peerName, role, incompatible, settings } = snapshot
  // El invitado se prepara con los ajustes del anfitrión: hasta que no llega su saludo, no.
  const settingsKnown = role === 'host' || peerName !== null
  // El formato de la sala se revisa en el deck de cada uno antes de dejarlo estar listo (el rival no ve el deck: es una revisión de cada lado). Edison y Genesys necesitan sus tablas: hasta que bajan no se sabe.
  const roomDeck = deckInfo
  const needsTables = settings.format === 'edison' || settings.format === 'genesys'
  const [tablesLoaded, setTablesLoaded] = useState(formatDataLoaded)

  useEffect(() => {
    if (needsTables && !tablesLoaded) {
      void loadFormatData().then(() => setTablesLoaded(true), () => undefined)
    }
  }, [needsTables, tablesLoaded])

  const issues = useMemo(() => (needsTables && !tablesLoaded ? [] : deckFormatIssues([...roomDeck.mainIds, ...roomDeck.extraIds], roomDeck.cardsById, settings.format, settings.genesysCap)), [roomDeck, settings.format, settings.genesysCap, needsTables, tablesLoaded])
  // Un duelo se juega con 40 cartas en el Main como mínimo (jugar solo, la práctica, no lo pide).
  const mainShort = roomDeck.mainIds.length < MAIN_MINIMUM
  const canReady = peerPresent && settingsKnown && !incompatible && deckReady && !mainShort && issues.length === 0 && (!needsTables || tablesLoaded) && (auto?.canReady ?? true)
  // Sin espectadores en una sala con reglas automáticas: no se ofrece el enlace para mirar.
  const watchable = !settings.auto
  const canShare = typeof navigator !== 'undefined' && typeof navigator.share === 'function'
  // Quien entra por un enlace y no encuentra a nadie, tras unos segundos, probablemente tiene un enlace vencido: se lo dice en vez de dejarlo esperando.
  const emptyRoom = useWaited(EMPTY_ROOM_MS, role === 'guest' && !peerPresent && status === 'open')

  const [chatOpen, setChatOpen] = useState(false)

  const copy = async (watch = false) => {
    const text = watch ? buildDuelLink(window.location.origin, window.location.pathname, room, true) : link

    try {
      await navigator.clipboard.writeText(text)
      showToastMessage(t('duel.room.copied'), 'success')
    } catch {
      showToastMessage(text, 'error')
    }
  }

  const share = () => {
    void navigator.share({ title: 'YGOUltraLab', /* i18n-ignore: nombre propio */ text: t('duel.room.shareText'), url: link }).catch(() => undefined)
  }

  // Quien entró por un enlace y no encuentra a nadie: probablemente el enlace venció (o la sala se cerró).
  if (emptyRoom) {
    return (
      <Screen>
        <LinkGone onRetry={onLeave} onCreate={onLeaveToCreate} />
      </Screen>
    )
  }

  const bothReady = snapshot.ready.mine && snapshot.ready.theirs
  const step = !peerPresent ? 0 : bothReady ? 2 : 1
  // En escritorio el chat va al costado, siempre a la vista (sin el rival adentro explica que se habla cuando entre); en el celular, abajo, una vez que entró.
  // En el costado ocupa todo el alto de la tarjeta: lo escrito arriba (scrollea) y los mensajes rápidos con el campo para escribir al pie.
  const chat = <DuelChat snapshot={snapshot} myName={myName} onSend={duel.sendChat} fill={docked} />

  return (
    <Screen
      tight
      aside={
        docked ? (
          // La tarjeta mide lo que la columna de al lado (no crece con lo escrito: la lista scrollea por dentro), de ahí el `absolute`.
          <div className="relative min-h-[24rem]">
            <section aria-label={t('duel.chat.open')} className="absolute inset-0 grid grid-rows-[auto_minmax(0,1fr)] gap-3 rounded-card border border-border-subtle bg-card-background p-4">
              <Heading level="card">{t('duel.chat.open')}</Heading>
              {peerPresent && !incompatible ? chat : <p className="m-0 py-8 text-center text-body text-muted">{t('duel.room.chatWaiting')}</p>}
            </section>
          </div>
        ) : undefined
      }
    >
      {/* La sala como la de otro simulador de referencia (Gastón, 2026-10-20: «no debe haber scroll en esta pantalla nunca y las cosas están mal ordenadas»): las reglas y el deck a la izquierda, el escenario en el medio —los dos jugadores y lo
          que toca hacer— y el chat a la derecha, todo en el alto de la pantalla. Las medidas `@[46rem]` son las de este contenedor: con el menú lateral abierto, o en el celular, las reglas y el deck pasan debajo del escenario. */}
      <div className="@container min-h-0 min-w-0 min-[1101px]:h-full">
        <div className="grid min-w-0 gap-3 [grid-template-areas:'head'_'stage'_'info'] @[46rem]:h-full @[46rem]:grid-cols-[19rem_minmax(0,1fr)] @[46rem]:grid-rows-[auto_minmax(0,1fr)] @[46rem]:gap-4 @[46rem]:[grid-template-areas:'head_head'_'info_stage']">
          {/* El encabezado: el titular, los pasos y, en el celular, el chat; salir es una X. */}
          <header className="flex flex-wrap items-center gap-x-5 gap-y-2 [grid-area:head]">
            <h2 className="m-0 text-title font-extrabold leading-tight text-foreground">{t('duel.room.title')}</h2>
            <RoomSteps step={step} className="order-last w-full max-[1101px]:[@media(max-height:760px)]:hidden @[46rem]:order-none @[46rem]:w-80" />
            <div className="ml-auto flex items-center gap-2">
              {docked ? null : (
                <Button variant="secondary" icon="chat" aria-haspopup="dialog" onClick={() => setChatOpen(true)}>
                  {t('duel.chat.open')}
                </Button>
              )}
              <CloseButton size="md" aria-label={t('duel.room.leave')} title={t('duel.room.leave')} onClick={onLeave} />
            </div>
            {role === 'guest' && peerName ? <p className="m-0 w-full text-lead font-semibold text-foreground">{t('duel.room.invitedBy', { name: peerName })}</p> : null}
            {status !== 'open' ? <Callout tone="warning" icon="alert" className="w-full">{status === 'connecting' ? t('duel.status.connecting') : t('duel.status.reconnecting')}</Callout> : null}
            {incompatible ? <Callout tone="danger" className="w-full">{t('duel.room.incompatible')}</Callout> : null}
          </header>

          {/* El escenario: los dos jugadores y lo que toca hacer en este paso —invitar, estar listo o definir quién empieza—, sobre la arena. */}
          <div className="grid min-h-0 min-w-0 [grid-area:stage] @[46rem]:[&>*]:h-full">
            {!peerPresent ? (
              <section aria-label={t('duel.room.title')} className={STAGE_CARD}>
                <MatScene className="absolute inset-0 -z-10" />
                <div className={STAGE_INNER}>
                  {/* Los dos jugadores desde el principio: con el rival adentro la tarjeta de cada uno es la de DuelOpening; antes, la tuya, un lugar que espera y, para el anfitrión, el enlace para mandarle. */}
                  <ul className="m-0 grid list-none grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] items-start gap-2 p-0 @[46rem]:gap-4">
                    <PlayerCard side="mine" caption={t('duel.opening.you')} name={myName || t('duel.opening.you')} ready={false} showReady={false} />
                    <VersusMark />
                    <li className="grid min-h-24 content-center justify-items-center gap-2 rounded-card border border-dashed border-border bg-card-background/40 p-3 text-center backdrop-blur-sm @[46rem]:min-h-40">
                      <p className="m-0 text-body text-muted" role="status">
                        {t('duel.room.waitingPeer')}
                      </p>
                      <span aria-hidden="true" className="flex gap-1">
                        <i className="size-2.5 rounded-full bg-border" />
                        <i className="size-2.5 rounded-full bg-border" />
                        <i className="size-2.5 rounded-full bg-border" />
                      </span>
                    </li>
                  </ul>
                  {role === 'host' ? (
                    <div className="grid justify-items-center gap-3">
                      <InviteLink link={link} room={room} peerPresent={false} watchable={watchable} />
                      <InviteButtons peerPresent={false} canShare={canShare} watchable={watchable} onShare={share} onCopy={(watch) => void copy(watch)} />
                    </div>
                  ) : null}
                </div>
              </section>
            ) : !settingsKnown ? (
              <p className="m-0 self-center text-center text-micro text-soft">{t('duel.room.guestWaits')}</p>
            ) : null}

            {peerPresent && settingsKnown && !incompatible ? <DuelOpening snapshot={snapshot} myName={myName} canReady={canReady} actions={duel} rename={{ value: name, onCommit: onRename }} /> : null}
          </div>

          {/* La columna de la izquierda: las reglas, tu deck (el del builder o el que pegaste: quien llega por un enlace no pasó por el lobby; se cambia en la hoja «Tu deck» mientras no estés listo y, si no cumple, lo que falta
              se dice acá) y, para el anfitrión con el rival adentro, los botones para invitar a quien quiera mirar. Una sola caja, con líneas finas entre una cosa y otra. */}
          <div className={cx('flex min-h-0 flex-col gap-3 rounded-card border p-3 [grid-area:info] @[46rem]:gap-4 @[46rem]:p-4', TONE.neutral.wash)}>
            <RoomRules settings={settings} isPublic={isPublic} watchers={snapshot.watchers} bare />

            <div className="mt-auto border-t border-border-subtle pt-3 @[46rem]:pt-4">
              <RoomDeck deck={deckReady ? { name: roomDeck.name, main: roomDeck.mainIds.length, extra: roomDeck.extraIds.length } : null} locked={snapshot.ready.mine} onOpenBuilder={deckInfo.onOpenBuilder}>
                {!snapshot.ready.mine && issues.length > 0 ? (
                  <Callout tone="warning" icon="alert">
                    <span className="grid gap-1">
                      <span>{t('duel.room.formatBlocked', { name: formatName(settings.format, settings.genesysCap) })}</span>
                      {issues.map((issue) => (
                        <span key={issue}>{issue}</span>
                      ))}
                    </span>
                  </Callout>
                ) : null}
                {!snapshot.ready.mine && !deckReady ? <Callout tone="warning" icon="alert">{t('duel.room.needDeck', { count: deckInfo.size, min: deckInfo.min })}</Callout> : null}
                {!snapshot.ready.mine && deckReady && mainShort ? <Callout tone="warning" icon="alert">{t('duel.room.mainShort', { count: roomDeck.mainIds.length, min: MAIN_MINIMUM })}</Callout> : null}
                {auto?.notice ? <AutoNotice notice={auto.notice} /> : null}
              </RoomDeck>
            </div>

            {role === 'host' && peerPresent ? (
              <div className="border-t border-border-subtle pt-3 @[46rem]:pt-4">
                <InviteLink link={link} room={room} peerPresent />
                <InviteButtons peerPresent stacked canShare={canShare} watchable={watchable} onShare={share} onCopy={(watch) => void copy(watch)} />
              </div>
            ) : null}
          </div>
        </div>
      </div>

      {/* El chat en el celular: siempre a un toque (también antes de que entre el rival), en una hoja. */}
      {docked ? null : (
        <Modal isOpen={chatOpen} onClose={() => setChatOpen(false)} size="md" title={t('duel.chat.open')}>
          {peerPresent && !incompatible ? chat : <p className="m-0 py-6 text-center text-body text-muted">{t('duel.room.chatWaiting')}</p>}
        </Modal>
      )}
    </Screen>
  )
}

/** Lo que la sala con reglas automáticas le dice a quien espera o no puede empezar: una línea y, si hay cartas sin reglas, cada una con su arte chico y su nombre. */
function AutoNotice({ notice }: { notice: NonNullable<RoomAutoState['notice']> }) {
  return (
    <Callout tone={notice.tone}>
      <span className="grid gap-2" role={notice.tone === 'danger' ? undefined : 'status'}>
        <span>{notice.text}</span>
        {notice.cards && notice.cards.length > 0 ? (
          <ul className="m-0 grid max-h-40 list-none gap-1 overflow-y-auto p-0">
            {notice.cards.map((card, index) => (
              <li key={`${card.code}:${index}`} className="flex min-w-0 items-center gap-2 text-body text-foreground">
                <span aria-hidden="true" className="aspect-[421/614] w-7 shrink-0 overflow-hidden bg-input">
                  <CardArt remoteUrl={artOfDrawId(`card-${card.code}-1`)} name={card.name} className="block h-full w-full object-cover" />
                </span>
                <span className="min-w-0 truncate">{card.name}</span>
              </li>
            ))}
          </ul>
        ) : null}
      </span>
    </Callout>
  )
}

const NOTHING = () => undefined

/**
 * La carta del turno se roba cuando empieza el turno propio, o sea cuando el rival llega a su End Phase: así el segundo jugador roba en su primer turno
 * y quien termina no roba de más antes de tiempo (la mesa, en un duelo, no roba sola al pasar). Llegar dos veces a lo mismo (el rival deshace y repite)
 * no roba dos veces.
 */
function useTurnDraw(duel: Duel, snapshot: DuelSnapshot, turn: 'mine' | 'theirs') {
  const number = duelTurnNumber(snapshot.mine, snapshot.theirs?.state ?? null)
  const drawnAt = useRef(number)

  useEffect(() => {
    if (number > drawnAt.current) {
      drawnAt.current = number

      if (turn === 'mine') {
        duel.play({ type: 'draw', count: 1 })
        showToastMessage(t('duel.turn.drew'), 'info')
      }
    }
  }, [number, turn, duel])
}

/** Lo que la mesa sabe de una carta mía para ver si puede responder: de qué clase es y sus efectos confirmados (sin los datos del catálogo, nada). */
function responderCard(card: MatCard | undefined): ResponderCard | null {
  const api = card?.apiCard

  if (!api) return null

  return { kind: cardKindOf(api), quickPlay: (api.race ?? '').toLowerCase() === 'quick-play', effects: getCardEffectMap(api.ygoprodeckId, api.description ?? '') }
}

/**
 * Mis cartas que pueden responder mientras el rival pregunta si hacés algo antes de pasar de fase (`app/mat-responders.ts`: avisa, no decide). Sólo con la pregunta en pie; sin ella, ninguna. Los efectos
 * confirmados de cada carta (un archivo aparte) se bajan al abrir la mesa, así ya están cuando llega la pregunta.
 */
function useResponders(snapshot: DuelSnapshot, cardsById: ReadonlyMap<string, MatCard>): Responder[] {
  const [loaded, setLoaded] = useState(false)

  useEffect(() => {
    let alive = true

    void loadCardEffectMap().then(() => {
      if (alive) setLoaded(true)
    })

    return () => {
      alive = false
    }
  }, [])

  const asked = snapshot.pass.asked !== null
  // Quien pregunta es quien tiene el turno: la fase en que va es la suya.
  const phase = snapshot.theirs?.state.phase

  return useMemo(
    () => (asked && phase !== undefined && snapshot.mine !== null ? respondersOf(snapshot.mine, phase, false, (id) => responderCard(cardsById.get(id))) : []),
    // `loaded`: cuando llegan los datos, se vuelve a mirar.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [asked, phase, snapshot.mine, cardsById, loaded],
  )
}

/** Cuánto se queda el aviso de lo que se puede responder a lo que el rival activó. */
const CHAIN_HINT_MS = 8000

/**
 * Lo que el rival acaba de **activar** (una Mágica o Trampa que dejó boca arriba, o el efecto de una carta) y mis cartas que podrían responderle (`respondersOf` con `ChainEvent`: además de lo que responde siempre, los efectos
 * rápidos cuya condición es sólo esa activación): un aviso sobre la línea del registro y el brillo en la mesa un rato. Sólo si la carta es pública (la mostró al activarla) y se sabe qué clase es; lo que ya había al abrir la
 * pantalla, o deshacer, no cuenta. El aviso se va solo, o cuando juego algo o el rival hace otra cosa. Avisa, no decide (como la pregunta de pasar de fase).
 */
function useChainHint(snapshot: DuelSnapshot, cardsById: ReadonlyMap<string, MatCard>): { card: string; effect?: number; responders: Responder[] } | null {
  const { theirs, mine, me, starter, moves } = snapshot
  const acts = theirs?.acts
  const seen = useRef(acts?.length ?? 0)
  // Cada pedido de la carta que se activó lleva su número: llega el último y los viejos se descartan.
  const request = useRef(0)
  const movesNow = useRef(moves)
  const [loaded, setLoaded] = useState(false)
  const [open, setOpen] = useState<{ name: string; event: ChainEvent; moves: number; acts: number; /** El lugar del efecto que eligió, si eligió uno entre varios. */ effect?: number } | null>(null)

  useEffect(() => {
    movesNow.current = moves
  }, [moves])

  useEffect(() => {
    let alive = true

    void loadCardEffectMap().then(() => {
      if (alive) setLoaded(true)
    })

    return () => {
      alive = false
    }
  }, [])

  useEffect(() => {
    const before = seen.current

    seen.current = acts?.length ?? 0

    if (!theirs || !acts || acts.length !== before + 1) return

    const action = acts[acts.length - 1]!
    const { spotlight } = matEffects(replayMat(theirs.initial, acts, acts.length - 1), action)
    // Sólo se sabe qué es si la mostró al activarla.
    const real = spotlight?.kind === 'activate' && !isToken(spotlight.id) ? theirs.known[spotlight.id] : undefined
    const passcode = real ? passcodeOfDrawId(real) : null
    const id = (request.current += 1)

    if (passcode === null) return

    fetchCardsByIds([passcode])
      .then((cards) => {
        const api = cards[0]

        if (id !== request.current || !api) return

        const kind = cardKindOf(api)

        setOpen({ name: api.name, event: { card: kind.monster ? 'monster' : kind.spell ? 'spell' : 'trap', via: action.type === 'activate' ? 'effect' : 'card' }, moves: movesNow.current, acts: acts.length, ...(action.type === 'activate' && action.effect !== undefined ? { effect: action.effect } : {}) })
      })
      .catch(() => {})
  }, [acts, theirs])

  useEffect(() => {
    if (!open) return

    const id = setTimeout(() => setOpen(null), CHAIN_HINT_MS)

    return () => clearTimeout(id)
  }, [open])

  // Vale mientras no jugué nada ni el rival hizo otra cosa.
  const active = open && open.moves === moves && open.acts === (acts?.length ?? 0) ? open : null

  return useMemo(() => {
    if (!active || !loaded || !mine || !theirs) return null

    const turn = whoseTurn(me, mine, theirs.state, starter)
    const phase = sharedPhase(turn, mine, theirs.state)

    if (phase === undefined) return null

    const responders = respondersOf(mine, phase, turn === 'mine', (id) => responderCard(cardsById.get(id)), active.event)

    return responders.length > 0 ? { card: active.name, ...(active.effect === undefined ? {} : { effect: active.effect }), responders } : null
  }, [active, loaded, mine, theirs, me, starter, cardsById])
}

/** Cuánto se queda el cartel del ataque del rival arriba de la mesa. */
const ANNOUNCE_MS = 4000

/**
 * El ataque que el rival acaba de hacer, para avisarlo: el cartel de quién ataca a qué carta tuya (o que es directo) y, para que la mesa dibuje la espada,
 * con qué monstruo suyo (su id opaco) y a cuál tuyo (tu id real). Lo que ya había jugado antes de abrir la pantalla no se avisa, y deshacer tampoco.
 */
function useRivalAttack(snapshot: DuelSnapshot, cardsById: ReadonlyMap<string, MatCard>): DuelMatLink['announcement'] {
  const { theirs, ownIds, peerName } = snapshot
  const acts = theirs?.acts
  const seen = useRef(acts?.length ?? 0)
  const [shown, setShown] = useState<DuelMatLink['announcement']>(undefined)

  useEffect(() => {
    const before = seen.current
    const last = acts?.at(-1)

    seen.current = acts?.length ?? 0

    if (!acts || acts.length <= before || last?.type !== 'attack') {
      return
    }

    const rival = peerName ?? t('duel.bar.rival')
    const mine = last.target === undefined ? undefined : ownIds[last.target]
    const target = (mine === undefined ? undefined : cardsById.get(mine)?.name) ?? t('duel.announce.yourCard')

    setShown({
      key: Date.now(),
      attackerId: last.id,
      // Un objetivo que no se reconoce no es un ataque directo: se deja su id tal cual, que no está en la mesa, y la espada no sale.
      targetId: last.target === undefined ? undefined : (mine ?? last.target),
      caption: last.target === undefined ? t('duel.announce.attackDirect', { name: rival }) : t('duel.announce.attack', { name: rival, target }),
    })
  }, [acts, ownIds, peerName, cardsById])

  useEffect(() => {
    if (!shown) return

    const id = setTimeout(() => setShown(undefined), ANNOUNCE_MS)
    return () => clearTimeout(id)
  }, [shown])

  return shown
}

/** Cuánto dura el destaque de una carta del rival (lo mismo que el de las propias). */
const RIVAL_FX_MS = 950
/** Lo que el rival activa, revela o declara y es público se queda más (la carta y su nombre se alcanzan a leer); sólo eso, el resto de lo que se anima dura lo de siempre. */
const RIVAL_READ_MS = 3000
/** Lo que se queda el cartel de un efecto con su frase escrita (lo que lleva leerla: `--animate-card-activate-read`). */
const RIVAL_DETAIL_MS = 7000
const READABLE_KINDS: ReadonlySet<string> = new Set(['activate', 'reveal', 'declare'])

/**
 * Lo que el rival hace y se anima, para verlo igual que en un combo guardado: sus cartas grandes en el centro (con lo que él mostró de ellas, o de dorso) y un cartel
 * que dice qué pasó ("Ana manda una carta al cementerio", "Ana activa una carta"), y el aro en su campo de lo que destaca (activar, mostrar, declarar, marcar). Ataques y
 * cambios de fase tienen lo suyo (la espada, el cartel de la fase) y las cartas que sólo llegan a la mano no se muestran. Cuenta sólo una jugada nueva a la vez: lo que
 * llega de golpe (la mesa repuesta al reconectar) o se deshace no se repite.
 */
function useRivalEffect(snapshot: DuelSnapshot): { effect: DuelMatLink['rivalEffect']; flash: DuelSideView['flash']; shuffles: number } {
  const { theirs, peerName } = snapshot
  const acts = theirs?.acts
  const seen = useRef(acts?.length ?? 0)
  const [shown, setShown] = useState<{ effect: NonNullable<DuelMatLink['rivalEffect']>; flashId?: string; /** El número de YGOPRODeck de la carta, si es pública: sirve para ponerle el nombre. */ passcode?: number; /** El lugar del efecto que eligió entre los de la carta (la jugada lo lleva): sirve para decir cuál es. */ effectIndex?: number } | undefined>(undefined)
  // Las veces que el rival tocó su deck o sumó una carta a su mano (se baraja a la vista).
  const [shuffles, setShuffles] = useState(0)

  useEffect(() => {
    const before = seen.current

    seen.current = acts?.length ?? 0

    if (!theirs || !acts || acts.length !== before + 1) {
      return
    }

    const action = acts[acts.length - 1]!
    const { spotlight, showcase, quiet, shuffle } = matEffects(replayMat(theirs.initial, acts, acts.length - 1), action)

    if (shuffle) {
      setShuffles((count) => count + 1)
    }

    if (action.type === 'attack' || action.type === 'phase' || action.type === 'draw') {
      return
    }
    const rival = peerName ?? t('duel.bar.rival')
    const artOf = (id: string) => artOfDrawId(isToken(id) ? id : theirs.known[id]) ?? null
    const key = Date.now()

    if (spotlight && spotlight.kind !== 'attack') {
      // Un lote destaca varias cartas (`ids`): se muestran todas y el nombre se pide sólo cuando es una.
      const ids = spotlight.ids ?? [spotlight.id]
      const cards = ids.map((id) => ({ id, art: artOf(id) }))
      // Sólo si la carta es pública para quien mira (el rival la mostró al activarla o revelarla): una boca abajo sigue de dorso y sin nombre.
      const readable = READABLE_KINDS.has(spotlight.kind) && cards[0]!.art !== null
      const real = ids.length > 1 || isToken(spotlight.id) ? undefined : theirs.known[spotlight.id]
      const passcode = readable && real ? passcodeOfDrawId(real) : null

      setShown({
        effect: { key, kind: spotlight.kind, cards, caption: t(`duel.announce.${spotlight.kind}`, { name: rival, count: ids.length }), ...(readable ? { linger: true } : {}) },
        flashId: spotlight.id,
        ...(passcode === null ? {} : { passcode }),
        ...(action.type === 'activate' && action.effect !== undefined ? { effectIndex: action.effect } : {}),
      })
    } else if (showcase) {
      const cards = showcase.ids.map((id) => ({ id, art: artOf(id) }))
      // Una carta que el rival suma a su mano y es pública (la buscó, la devolvió, la trajo del cementerio; robar no llega hasta acá) se ve entera: se queda para leerla, con su nombre, y queda fija en el detalle.
      const added = showcase.kind === 'hand' && showcase.ids.length === 1 && cards[0]!.art !== null && !isToken(showcase.ids[0]!) ? theirs.known[showcase.ids[0]!] : undefined
      const passcode = added ? passcodeOfDrawId(added) : null

      setShown({
        effect: { key, kind: showcase.kind, cards, ...(showcase.flip ? { flip: true } : {}), caption: t(`duel.announce.show.${showcase.kind}`, { name: rival, count: showcase.ids.length }), ...(added ? { linger: true, peekId: added } : {}) },
        ...(passcode === null ? {} : { passcode }),
      })
    } else if (quiet) {
      // Al cementerio o al destierro no se muestra grande: el efecto no se dibuja (`quiet`), pero su línea entra al registro como las demás.
      setShown({ effect: { key, kind: quiet.kind, quiet: true, cards: quiet.ids.map((id) => ({ id, art: artOf(id) })), caption: t(`duel.announce.show.${quiet.kind}`, { name: rival, count: quiet.ids.length }) } })
    }
  }, [acts, theirs, peerName])

  useEffect(() => {
    if (!shown) return

    const id = setTimeout(() => setShown(undefined), shown.effect.detail ? RIVAL_DETAIL_MS : shown.effect.linger ? RIVAL_READ_MS : RIVAL_FX_MS)
    return () => clearTimeout(id)
  }, [shown])

  // El nombre de lo que se activó (público): se busca por su número y, cuando llega, entra en el cartel y en el registro sin reiniciar la animación.
  const rivalLabel = peerName ?? t('duel.bar.rival')

  useEffect(() => {
    if (shown?.passcode === undefined || shown.effect.cards[0]?.name) return

    const { key } = shown.effect
    // Sólo se lee lo que se activa, se revela o se declara (ver `READABLE_KINDS`) y lo que se suma a la mano.
    const kind = shown.effect.kind as 'activate' | 'reveal' | 'declare' | 'hand'
    let alive = true

    fetchCardsByIds([shown.passcode])
      .then((cards) => {
        const api = cards[0]
        const name = api?.name

        if (!alive || !api || !name) return

        // Si eligió un efecto entre varios (la jugada lo lleva), se dice cuál: su número en el cartel y su frase, textual, debajo de la carta. El lugar vale en las dos mesas (`cardEffects`).
        const picked = kind === 'activate' ? shown.effectIndex : undefined
        const detail = picked === undefined ? null : effectDetail(cardEffects(api.ygoprodeckId, api.description ?? '').effects, picked)
        const caption = picked === undefined ? t(`duel.announce.named.${kind}`, { name: rivalLabel, card: name }) : t('duel.announce.named.activateEffect', { name: rivalLabel, card: name, n: picked + 1 })

        setShown((current) =>
          current && current.effect.key === key
            ? { ...current, effect: { ...current.effect, cards: current.effect.cards.map((card) => ({ ...card, name })), caption, ...(detail ? { detail: { lead: detail.lead, text: detail.what } } : {}) } }
            : current,
        )
      })
      .catch(() => {})

    return () => {
      alive = false
    }
  }, [shown, rivalLabel])

  const flash = useMemo(() => (shown?.flashId ? { id: shown.flashId, key: shown.effect.key, kind: shown.effect.kind as SpotlightKind } : undefined), [shown])

  return { effect: shown?.effect, flash, shuffles }
}

/** Cuánto se queda, sobre la línea del registro, cómo terminó tu pedido de volver atrás (no lo permitió, o no contestó). */
const UNDO_RESULT_MS = 4000

/** Cómo terminó tu último pedido de volver atrás, un rato (lo que ya había al abrir la pantalla no cuenta). */
function useUndoResult(snapshot: DuelSnapshot): { kind: 'denied' | 'expired'; n: number } | null {
  const { result } = snapshot.undo
  const seen = useRef(result?.n ?? 0)
  const [shown, setShown] = useState<{ kind: 'denied' | 'expired'; n: number } | null>(null)

  useEffect(() => {
    if (result && result.n > seen.current) {
      seen.current = result.n
      setShown({ kind: result.kind, n: result.n })
    }
  }, [result])

  useEffect(() => {
    if (!shown) return

    const id = setTimeout(() => setShown(null), UNDO_RESULT_MS)
    return () => clearTimeout(id)
  }, [shown])

  return shown
}

/** Cuánto se queda, sobre la línea del registro, que el rival quiere jugar antes de que pases de fase. */
const PASS_HELD_MS = 4000

/** Si el rival te pidió jugar antes de pasar de fase, un rato (lo que ya había al abrir la pantalla no cuenta; otro pedido vuelve a contar el rato). */
function usePassHeld(snapshot: DuelSnapshot): boolean {
  const count = snapshot.pass.result?.n ?? 0
  const seen = useRef(count)
  const [shown, setShown] = useState(false)

  useEffect(() => {
    if (count > seen.current) {
      seen.current = count
      setShown(true)
    }
  }, [count])

  useEffect(() => {
    if (!shown) return

    const id = setTimeout(() => setShown(false), PASS_HELD_MS)
    return () => clearTimeout(id)
  }, [shown, count])

  return shown
}

/** La última señal (pensando, todo bien) de cada jugador, que se ve un rato junto a sus vidas. Lo que ya estaba escrito al abrir la pantalla no cuenta. */
/** Cuánto late lo que se señala antes de irse solo. */
const POINT_MS = 2500

type Pointed = { card?: string; pile?: MatPile } | null

/**
 * Lo que se está señalando ahora, de cada lado de mi pantalla (el rival, o yo): late un rato y se va solo. Sólo cuenta lo que llega o se manda ahora (lo que ya había al abrir la pantalla no),
 * así que tras una reconexión no vuelve a aparecer. Señalar no es marcar un objetivo (eso queda hasta que se quita) ni una jugada: no entra en los pasos ni en Deshacer.
 */
function usePointed(snapshot: DuelSnapshot): { mine: Pointed; theirs: Pointed } {
  const { ping } = snapshot
  const seen = useRef(ping?.n ?? 0)
  const [shown, setShown] = useState<NonNullable<DuelSnapshot['ping']> | null>(null)

  useEffect(() => {
    if (ping && ping.n > seen.current) {
      seen.current = ping.n
      setShown(ping)
    }
  }, [ping])

  useEffect(() => {
    if (!shown) return

    const id = setTimeout(() => setShown(null), POINT_MS)
    return () => clearTimeout(id)
  }, [shown])

  const target: Pointed = shown ? { ...(shown.card !== undefined ? { card: shown.card } : {}), ...(shown.pile !== undefined ? { pile: shown.pile } : {}) } : null

  return { mine: shown?.side === 'mine' ? target : null, theirs: shown?.side === 'theirs' ? target : null }
}

/** Cuando el rival marca algo de tu lado (una carta, tu mano, el cementerio…), un aviso: sobre una pila o la mano la mira se ve poco y puede pasar desapercibida. */
function useMarkNotice(snapshot: DuelSnapshot) {
  const { mine } = snapshot.marks
  const previous = useRef(mine)
  const rival = snapshot.peerName ?? t('duel.bar.rival')

  useEffect(() => {
    const before = previous.current

    previous.current = mine

    for (const pile of mine.piles.filter((entry) => !before.piles.includes(entry))) {
      showToastMessage(t('duel.mark.notice.pile', { name: rival, pile: PILE_TITLES[pile] }), 'info')
    }

    if (mine.cards.some((id) => !before.cards.includes(id))) {
      showToastMessage(t('duel.mark.notice.card', { name: rival }), 'info')
    }
  }, [mine, rival])
}

/** Cuánto se queda el cartel de la fase o del turno del rival. */
const NOTICE_MS = 1400

/**
 * Lo que el rival avanza en su turno, para verlo sin mirar su campo: cada fase que pasa (con su nombre) y, cuando llega a su End Phase y empieza el tuyo, el cartel
 * "Tu turno". Lo que ya había cuando se abrió la pantalla no se avisa, ni lo que se deshace sin cambiar de fase.
 */
function useRivalNotice(snapshot: DuelSnapshot, turn: 'mine' | 'theirs'): DuelMatLink['notice'] {
  const phase = snapshot.theirs?.state.phase
  const seen = useRef({ phase, turn })
  const [shown, setShown] = useState<DuelMatLink['notice']>(undefined)
  const rival = snapshot.peerName ?? t('duel.bar.rival')

  useEffect(() => {
    const before = seen.current

    seen.current = { phase, turn }

    if (phase === undefined || before.phase === undefined || before.phase === phase) {
      return
    }

    const name = PHASES.find((entry) => entry.id === phase)?.name ?? phase

    // Llegó a su End Phase y ahora te toca a vos; si no, una fase más de su turno.
    if (before.turn === 'theirs' && turn === 'mine') {
      setShown({ key: Date.now(), phase, who: `${rival} · ${name}`, label: t('duel.bar.yourTurn') })
    } else {
      setShown({ key: Date.now(), phase, who: rival })
    }
  }, [phase, turn, rival])

  useEffect(() => {
    if (!shown) return

    const id = setTimeout(() => setShown(undefined), NOTICE_MS)
    return () => clearTimeout(id)
  }, [shown])

  return shown
}

/** La mesa de práctica con el campo del rival arriba: tus jugadas van al relay y las suyas llegan solas. */
function DuelTableScreen({ duel, snapshot, status, myName, cardsById, deckName, onRematch, onLeave, onAbandon }: { duel: Duel; snapshot: DuelSnapshot; status: SocketStatus; myName: string; cardsById: ReadonlyMap<string, MatCard>; deckName: string; onRematch: () => void; onLeave: () => void; onAbandon: () => void }) {
  const { mine, initial, actions, theirs } = snapshot
  const docked = useMediaQuery(DESKTOP_DECK_BUILDER_MEDIA_QUERY)
  const wide = useMediaQuery(DUEL_DETAIL_DOCK_MEDIA_QUERY)
  // Tocar una carta o una pila del rival (o su mano) abre un menú con una sola jugada: marcarla (o quitarle la marca) como objetivo, y él lo ve en lo suyo.
  const [markMenu, setMarkMenu] = useState<{ target: MarkTarget; rect: DOMRect; place: string } | null>(null)
  const openMark = useCallback((target: MarkTarget, rect: DOMRect, place: string) => setMarkMenu({ target, rect, place }), [])
  // El cementerio y el destierro del rival son públicos: se pueden desplegar para ver (y marcar) sus cartas.
  const [rivalViewer, setRivalViewer] = useState<'gy' | 'banished' | 'extra' | null>(null)
  // Lo que hago se le cuenta al rival (`duel.look`) y, si abrí una pila mía, el visor del rival se cierra: los dos van en el mismo lugar de la mesa (y al revés, `rivalViewing`).
  const lookAt = useCallback(
    (activity: Parameters<Duel['look']>[0]) => {
      duel.look(activity)
      if (activity !== null && activity !== 'choosing') setRivalViewer(null)
    },
    [duel],
  )
  // El detalle fijo de la izquierda (escritorio): la carta a la que se le pasa el mouse, o la que se tocó (queda fija hasta un click afuera o en otra), tuya o del rival.
  const { shown: dockShown, hover: dockHover, lock: dockLock } = useDockPeek()
  // El pedazo del texto de esa carta que se resalta mientras se elige uno de sus efectos en el menú.
  const [highlight, setHighlight] = useState<CardTextHighlight | null>(null)
  // El detalle de una carta del rival que ya está a la vista (su id real, lo único que se sabe de ella).
  const [rivalInspected, setRivalInspected] = useState<{ drawId: string; rect: DOMRect } | null>(null)

  // La mesa espera una "sesión" con la mano inicial y las jugadas; acá no hay combos ni repetición, así que el cursor está siempre al final.
  const session = useMemo<MatSession>(() => ({ initial: initial!, actions: [...actions], cursor: actions.length, names: {}, replay: false }), [initial, actions])
  const { effect: rivalEffect, flash: rivalFlash, shuffles: rivalShuffle } = useRivalEffect(snapshot)
  // Lo que el rival suma a su mano sin robar (Gastón, 2026-10-20: «la carta añadida debe aparecer en el detalle hasta que se haga click en otra carta»): queda fija en el detalle de la izquierda, como una carta tocada.
  const addedToHand = rivalEffect?.peekId
  const addedKey = rivalEffect?.key

  useEffect(() => {
    if (addedToHand) dockLock({ drawId: addedToHand })
  }, [addedToHand, addedKey, dockLock])
  // Lo que se está señalando de cada lado (un aro que late un rato): se arma antes del lado del rival, que lo lleva.
  const pointed = usePointed(snapshot)
  const opponent = useMemo<DuelSideView>(
    // Una carta mía que el rival controla (`f.c12`) se ve con mi arte: el id que llega es el mío.
    () => ({ state: theirs!.state, artOf: (id) => artOfDrawId(isToken(id) ? id : isForeignId(id) ? snapshot.ownIds[opaqueOfForeign(id)] : theirs!.known[id]), handCount: theirs!.state.hand.length, flash: rivalFlash, marks: snapshot.marks.theirs, point: pointed.theirs, onMark: openMark }),
    [theirs, rivalFlash, snapshot.marks.theirs, snapshot.ownIds, pointed.theirs, openMark],
  )
  const turn = whoseTurn(snapshot.me, mine, theirs!.state, snapshot.starter)
  useGameToasts(snapshot, myName)
  // El cartel del comienzo: cuando se reparte la mesa de un duelo nuevo (no al volver a una con jugadas hechas), los dos ven si van primero o segundo.
  const [firstBanner, setFirstBanner] = useState<boolean | null>(null)
  const bannerFor = useRef<typeof initial>(null)

  useEffect(() => {
    if (initial && bannerFor.current !== initial) {
      bannerFor.current = initial

      if (actions.length === 0) setFirstBanner(snapshot.starter === snapshot.me)
    }
  }, [initial, actions.length, snapshot.starter, snapshot.me])
  const hideBanner = useCallback(() => setFirstBanner(null), [])
  useTurnDraw(duel, snapshot, turn)
  useAutoStartClock(duel, snapshot)
  // Mientras falta uno de los dos el duelo está en pausa (el reloj también); terminado ya no hay nada que esperar.
  const result = duelResult(snapshot.life.lp, snapshot.conceded)
  const paused = !snapshot.peerPresent && result === null
  // Al terminar el duelo, la tarjeta del resultado tapa la mesa hasta que se la cierra para mirarla; con otra partida (la revancha) vuelve a salir.
  const [resultClosed, setResultClosed] = useState(false)
  const resultOpen = result !== null && !resultClosed

  useEffect(() => {
    if (result === null) setResultClosed(false)
  }, [result])
  // Con la pausa o la tarjeta del final encima, un menú o un detalle que estaba abierto se cierra (y el visor de pila se esconde mientras).
  const covered = paused || resultOpen

  useEffect(() => {
    if (covered) {
      setMarkMenu(null)
      setRivalInspected(null)
      setLifeOpen(false)
    }
  }, [covered])
  useClockPause(duel, snapshot, paused)
  const announcement = useRivalAttack(snapshot, cardsById)
  // El registro de jugadas (con el chat): lo que hizo cada uno, el comienzo de cada turno y lo escrito. Se abre desde el botón del chat o desde la línea sobre el campo.
  const [chatOpen, setChatOpen] = useState(false)
  // La moneda, el dado y los juegos: se abren desde el + de la mesa.
  const [gamesOpen, setGamesOpen] = useState(false)
  // La calculadora de vidas (sincronizada con el duelo): se abre al tocar las vidas de cualquiera de los dos; con la pausa o el resultado encima se cierra.
  const [lifeOpen, setLifeOpen] = useState(false)
  const rivalCaptions = useMemo(() => [rivalEffect, announcement], [rivalEffect, announcement])
  const feed = useDuelFeed({ snapshot, cardsById, rivalCaptions, turn, turnNumber: duelTurnNumber(mine, theirs!.state), rivalName: snapshot.peerName ?? t('duel.bar.rival'), myName })
  const signals = useSignals(snapshot)
  useMarkNotice(snapshot)
  const notice = useRivalNotice(snapshot, turn)
  const rivalName = snapshot.peerName ?? t('duel.bar.rival')
  const undoResult = useUndoResult(snapshot)
  const passHeld = usePassHeld(snapshot)
  // Las cartas mías que pueden responder cuando el rival pregunta si hacés algo antes: brillan en la mesa y el aviso las nombra.
  const responders = useResponders(snapshot, cardsById)
  // Y las que pueden responder a lo que el rival acaba de activar: el aviso sobre la línea del registro las nombra, y brillan igual.
  const chain = useChainHint(snapshot, cardsById)
  const respondIds = useMemo(() => new Set([...responders, ...(chain?.responders ?? [])].map((responder) => responder.id)), [responders, chain])
  const respondNames = useMemo(() => responders.flatMap((responder) => cardsById.get(responder.id)?.name ?? []), [responders, cardsById])
  const chainNames = useMemo(() => chain?.responders.flatMap((responder) => cardsById.get(responder.id)?.name ?? []) ?? [], [chain, cardsById])
  // Pasar de fase le pregunta al rival si no va a hacer nada más: lo que se juega en el medio de la mesa va por `askPhase`; el resto, directo.
  const dispatch = useCallback((action: Parameters<Duel['play']>[0]) => (action.type === 'phase' ? duel.askPhase(action) : duel.play(action)), [duel])
  // El aviso de atención que se apoya sobre la línea del registro, uno a la vez y el más urgente primero: el pedido del rival de volver atrás (sin diálogo: no tapa la mesa), el tuyo, cómo terminó y, lo último, lo que está haciendo el rival (mira una pila, elige cómo jugar).
  const lane = useMemo<LaneNotice | null>(
    () =>
      snapshot.undo.asked
        ? { kind: 'undoAsked', onAllow: () => duel.answerUndo(true), onDeny: () => duel.answerUndo(false) }
        : snapshot.undo.asking
          ? { kind: 'undoAsking' }
          : snapshot.pass.asking
            ? { kind: 'passAsking' }
            : undoResult
              ? { kind: 'undoResult', result: undoResult.kind }
              : passHeld
                ? { kind: 'passHeld' }
                : chain
                  ? { kind: 'chain', card: chain.card, ...(chain.effect === undefined ? {} : { effect: chain.effect }), names: chainNames }
                  : snapshot.peerLook !== null
                    ? { kind: 'looking', what: snapshot.peerLook }
                    : null,
    [snapshot.undo.asked, snapshot.undo.asking, snapshot.pass.asking, undoResult, passHeld, chain, chainNames, snapshot.peerLook, duel],
  )
  // La pregunta del rival de pasar de fase va en el medio de la pantalla (`PassPrompt`, que la pone la mesa encima del campo): es lo único que hay que contestar, así que no va arriba con los demás avisos.
  const passAsked = snapshot.pass.asked
  const prompt = useMemo(
    () => (passAsked ? <PassPrompt name={rivalName} phase={passAsked.phase} endsTurn={passAsked.endsTurn} responders={respondNames} onAllow={() => duel.answerPhase(true)} onDeny={() => duel.answerPhase(false)} /> : undefined),
    [passAsked, rivalName, respondNames, duel],
  )
  // A quiénes se puede atacar: los monstruos del rival en el campo, con el id que él les dio.
  const attackTargets = useMemo(
    () => (['mz', 'emz'] as const).flatMap((zone) => theirs!.state[zone].flatMap((placed, index) => (placed ? [{ id: placed.id, zone, index, faceDown: placed.pos === 'set' }] : []))),
    [theirs],
  )

  // Lo que se ve de una carta del rival en el detalle fijo: la que mostró (o una mía que él controla), por su número; una boca abajo, sólo como tal.
  const rivalPeekOf = useCallback(
    (id: string): CardPeek => {
      const own = isForeignId(id) ? snapshot.ownIds[opaqueOfForeign(id)] : undefined
      const drawId = own ?? theirs!.known[id]

      return drawId === undefined ? { faceDown: true } : { drawId }
    },
    [snapshot.ownIds, theirs],
  )
  const link = useMemo<DuelMatLink>(
    () => {
      const rivalHand = <TheirHand count={opponent.handCount ?? 0} marked={snapshot.marks.theirs.piles.includes('hand')} pointed={pointed.theirs?.pile === 'hand'} onMark={(rect) => openMark({ pile: 'hand' }, rect, PILE_TITLES.hand)} />

      return {
      areas: DUEL_AREAS,
      areasCompact: DUEL_AREAS_COMPACT,
      rivalHand,
      opponent: <SideCells side={opponent} owner="theirs" />,
      sharedZone: (index) => sharedZoneCard(opponent, index),
      attackTargets,
      detail: wide ? <DuelCardDock peek={dockShown} highlight={highlight} /> : undefined,
      onPeek: dockLock,
      onHover: dockHover,
      onRivalHover: (id) => dockHover(rivalPeekOf(id)),
      onHighlight: setHighlight,
      undoPending: snapshot.undo.asking,
      undoAvailable: snapshot.undo.available,
      undoBlocked: snapshot.undo.blocked,
      control: { rival: rivalName, rivalHasRoom: firstFreeMonsterZone(theirs!.state) !== null },
      turnNumber: duelTurnNumber(mine, theirs!.state),
      rivalEmz: theirs!.state.emz.map(Boolean),
      foreignKnown: theirs!.known,
      announcement,
      rivalEffect,
      marksOnMine: snapshot.marks.mine,
      respond: respondIds,
      prompt,
      pointed: pointed.mine,
      point: (id: string) => duel.ping({ card: id }, 'mine'),
      rivalShuffle,
      rivalFlights: { state: opponent.state, artOf: opponent.artOf },
      notice,
      rivalTurnLabel: t('duel.bar.theirTurn', { name: rivalName }),
      onActivity: lookAt,
      rivalViewing: rivalViewer !== null,
      clock: (snapshot.settings.turnMin ?? 0) > 0 ? <TurnDial clock={snapshot.turnClock} owner={turn === 'mine' ? snapshot.me : snapshot.me === 0 ? 1 : 0} me={snapshot.me} names={snapshot.me === 0 ? [myName, rivalName] : [rivalName, myName]} /> : undefined,
      phase: sharedPhase(turn, mine, theirs!.state) ?? 'draw',
      myTurn: turn === 'mine',
      tools: (
        <DuelTools
          snapshot={snapshot}
          myName={myName}
          games={duel}
          chat={docked ? undefined : <DuelChatToggle snapshot={snapshot} myName={myName} onSendChat={duel.sendChat} feed={feed} open={chatOpen} onOpen={() => setChatOpen(true)} onClose={() => setChatOpen(false)} />}
          gamesOpen={gamesOpen}
          onGamesClose={() => setGamesOpen(false)}
        />
      ),
      plusItems: [{ label: t('duel.games.open'), onSelect: () => setGamesOpen(true) }],
      // Celular: las dos reacciones, centradas debajo de la mano (en escritorio están en el chat).
      reactions: docked ? undefined : <ReactionButtons set="dock" onSend={duel.sendChat} disabled={!snapshot.peerPresent} readyAt={snapshot.emoteReadyAt} />,
      // En escritorio el chat está siempre abierto a la derecha (en el celular, un panel que se abre desde el botón de abajo).
      aside: docked ? <DuelChatPanel snapshot={snapshot} myName={myName} onSend={duel.sendChat} feed={feed} /> : undefined,
      life: <DuelLife snapshot={snapshot} myName={myName} onOpen={() => setLifeOpen(true)} signal={signals.mine} signalKey={signals.mineKey} />,
      cover: paused ? (
        <DuelPause rival={rivalName} offline={status !== 'open'} onLeave={onLeave} onReconnect={duel.reconnect} />
      ) : result !== null && !resultClosed ? (
        <ResultCard result={result} snapshot={snapshot} rival={rivalName} onRematch={onRematch} onLeave={onLeave} onClose={() => setResultClosed(true)} />
      ) : undefined,
      header: <DuelBar snapshot={snapshot} status={status} turn={turn} onToggleClock={duel.toggleClock} onRematch={onRematch} onLeave={onLeave} onAbandon={onAbandon} onConcede={duel.concede} onReconnect={duel.reconnect} log={docked ? undefined : <DuelLogTicker feed={feed} onOpen={() => setChatOpen(true)} />} resultOpen={resultOpen} onOpenLife={() => setLifeOpen(true)} rivalSignal={signals.theirs !== null && isEmojiSignal(signals.theirs) ? null : signals.theirs} rivalSignalKey={signals.theirsKey} lane={lane} />,
      }
    },
    [opponent, snapshot, status, myName, turn, duel, onLeave, onAbandon, onRematch, attackTargets, theirs, announcement, rivalEffect, rivalShuffle, notice, rivalName, mine, paused, docked, result, resultOpen, resultClosed, signals, lane, pointed, openMark, feed, chatOpen, gamesOpen, dockShown, dockHover, dockLock, rivalPeekOf, highlight, wide, respondIds, prompt, lookAt, rivalViewer],
  )

  const markTarget = markMenu?.target
  const marked = markTarget ? ('card' in markTarget ? snapshot.marks.theirs.cards.includes(markTarget.card) : snapshot.marks.theirs.piles.includes(markTarget.pile)) : false
  // Del cementerio y del destierro se ve todo; del Extra, sólo las cartas boca arriba (los Monstruos de Péndulo), si hay.
  const markPile = markTarget && 'pile' in markTarget && (markTarget.pile === 'gy' || markTarget.pile === 'banished' || (markTarget.pile === 'extra' && theirs!.state.extraUp.length > 0)) ? markTarget.pile : null
  const markedId = markTarget && 'card' in markTarget ? markTarget.card : undefined
  const ownCard = markedId !== undefined && isForeignId(markedId) ? snapshot.ownIds[opaqueOfForeign(markedId)] : undefined
  // De una carta del rival que ya mostró (a la vista en su campo, en su cementerio o destierro, o revelada) se puede ver el detalle.
  const markedDrawId = markedId !== undefined ? (ownCard ?? theirs!.known[markedId]) : undefined
  const markedCard = useRivalCard(markedDrawId)
  // Una carta del rival a la vista —en su campo, su cementerio o su destierro— se puede tomar (o, si es mía, recuperar) si tengo un lugar libre de su tipo: pasa a mi campo y el rival la ve irse.
  const takeKind: TakenKind | null = markedCard ? (markedCard.cardType.toLowerCase().includes('monster') ? 'monster' : 'spellTrap') : null
  const offer = markedId !== undefined ? takeOffer(theirs!.state, mine!, markedId, takeKind) : null
  const controlItems =
    markedId !== undefined && offer
      ? [
          ownCard !== undefined
            ? { label: t('duel.mark.regainControl'), onSelect: () => { duel.play({ type: 'regain', id: ownCard, to: offer.zone, index: offer.index, pos: offer.pos }); setMarkMenu(null); setRivalViewer(null) } }
            : { label: t('duel.mark.takeControl'), onSelect: () => { duel.play({ type: 'take', id: foreignOf(markedId), zone: offer.zone, index: offer.index, pos: offer.pos }); setMarkMenu(null); setRivalViewer(null) } },
        ]
      : []
  const markItems = markTarget
    ? [
        ...(markPile ? [{ label: t('duel.mark.view'), onSelect: () => { setRivalViewer(markPile); setMarkMenu(null) }, utility: true }] : []),
        // Señalar (comunica un rato, sin dejar nada) y Target (la marca de objetivo, que dura unos segundos): son cosas parecidas pero no iguales.
        { label: t('duel.point.label'), onSelect: () => { duel.ping(markTarget, 'theirs'); setMarkMenu(null) }, utility: true },
        {
          label: t(marked ? 'practice.menu.untarget' : 'practice.menu.target'),
          onSelect: () => {
            duel.toggleMark(markTarget)
            setMarkMenu(null)
          },
          utility: true,
        },
        ...controlItems,
      ]
    : []
  const rivalCardName = t('duel.mark.rivalCard')
  const markedIsCard = Boolean(markTarget && 'card' in markTarget)

  // Tocar una carta del rival la muestra, fija, en el detalle de la izquierda: la que mostró, por su número; una boca abajo, sólo como tal.
  useEffect(() => {
    if (markedDrawId !== undefined) dockLock({ drawId: markedDrawId })
    else if (markedIsCard) dockLock({ faceDown: true })
  }, [markedDrawId, markedIsCard, dockLock])
  const viewerTargeted = useMemo(() => new Set([...snapshot.marks.theirs.cards, ...theirs!.state.targeted]), [snapshot.marks.theirs.cards, theirs])
  // Lo que el detalle muestra de una carta del visor del rival: lo mismo que el visor dibuja (boca abajo, el dorso, aunque se la conozca).
  const viewerPeekOf = (id: string): CardPeek => (theirs!.state.facedown.includes(id) ? { faceDown: true } : rivalPeekOf(id))
  // Varias del visor del rival a la vez («Elegir varias», con dos cartas o más): la principal sólo marca (o quita, si ya estaban todas) las elegidas y cierra el visor.
  const rivalMany: PileMany = {
    label: (ids) => t(ids.length > 0 && ids.every((id) => snapshot.marks.theirs.cards.includes(id)) ? 'practice.menu.untarget' : 'practice.menu.target'),
    onPick: (ids) => {
      duel.markMany(ids)
      setRivalViewer(null)
    },
  }

  return (
    <>
      <PracticeMat
        session={session}
        state={mine!}
        cardsById={cardsById}
        deckName={deckName}
        onDispatch={dispatch}
        onUndo={duel.undo}
        onSeek={NOTHING}
        onLoadCombo={NOTHING}
        onNewHand={NOTHING}
        duel={link}
        // En el mismo lugar que el visor de mis pilas (sin tapar el campo): la mesa lo pone.
        rivalViewer={
          <PileViewer
            pile={rivalViewer}
            hidden={covered}
            ids={rivalViewer ? (rivalViewer === 'extra' ? theirs!.state.extraUp : theirs!.state[rivalViewer]) : []}
            info={(id) => {
              const art = opponent.artOf(id)

              return { name: rivalCardName, art, faceDown: theirs!.state.facedown.includes(id) || art === null, faceUp: theirs!.state.extraUp.includes(id) }
            }}
            targeted={viewerTargeted}
            onPick={(id, rect) => openMark({ card: id }, rect, rivalCardName)}
            // Tocar o apuntar una carta suya la muestra en el detalle de la izquierda: la que se ve, por su número; una boca abajo (como la dibuja el visor), sólo como tal.
            onPeek={(id) => dockLock(viewerPeekOf(id))}
            onHover={(id) => dockHover(viewerPeekOf(id))}
            many={rivalMany}
            onClose={() => setRivalViewer(null)}
            anonymous
          />
        }
      />
      {/* Celular: la hoja de abajo (baja al cerrarse: `Presence` la deja montada mientras sale); escritorio: el menú pegado a la carta. */}
      <Presence>{!docked && markMenu && !covered ? (
        <CardSheet
          name={markMenu.place}
          kicker={rivalName}
          art={markedDrawId !== undefined ? artOfDrawId(markedDrawId) : null}
          apiCard={markedCard}
          back={markedDrawId === undefined || artOfDrawId(markedDrawId) === null}
          items={markItems}
          onInspect={markedDrawId !== undefined ? () => { setRivalInspected({ drawId: markedDrawId, rect: markMenu.rect }); setMarkMenu(null) } : undefined}
          onClose={() => setMarkMenu(null)}
        />
      ) : null}</Presence>
      <CardMenu
        anchor={covered || !docked ? null : (markMenu?.rect ?? null)}
        kicker={rivalName}
        title={markMenu?.place ?? ''}
        items={markItems}
        onInspect={markMenu && markedDrawId !== undefined ? () => { setRivalInspected({ drawId: markedDrawId, rect: markMenu.rect }); setMarkMenu(null) } : undefined}
        onClose={() => setMarkMenu(null)}
      />
      <Presence>{rivalInspected && !covered ? <RivalCardDetail key={rivalInspected.drawId} drawId={rivalInspected.drawId} origin={rivalInspected.rect} onClose={() => setRivalInspected(null)} /> : null}</Presence>
      <DuelCalculator isOpen={lifeOpen} snapshot={snapshot} myName={myName} duel={duel} onClose={() => setLifeOpen(false)} />
      {/* Lo que tira el rival (moneda, dado, piedra-papel-tijera) se ve girar acá aunque el panel de juegos esté cerrado. */}
      <TossOverlay snapshot={snapshot} myName={myName} />
      {firstBanner !== null ? <TurnOrderBanner key={snapshot.starter + '-' + snapshot.series.game} first={firstBanner} rival={rivalName} onDone={hideBanner} /> : null}
      {docked ? <RivalEmoji burst={signals.burst} name={rivalName} onDismiss={signals.dismissBurst} /> : null}
    </>
  )
}
