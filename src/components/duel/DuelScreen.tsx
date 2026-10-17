import { useCallback, useEffect, useMemo, useRef, useState } from 'react'

import { buildDuelLink, DUEL_STEP, extractRoomCode, parseDuelTarget, parseDuelView, type DuelView } from '../../app/duel-link'
import { deckFormatIssues } from '../../app/duel-format'
import { MAIN_MINIMUM } from '../../app/duel-siding'
import { cleanName, DEFAULT_DUEL_FORMAT, DEFAULT_LIMIT_MIN, DUEL_FORMATS, sameName, uniqueName, type MarkTarget } from '../../app/duel-protocol'
import { formatDataLoaded, loadFormatData } from '../../app/format-data'
import type { DeckFormat } from '../../types'
import { fetchCardsByIds } from '../../ygoprodeck'
import { clearDuelSave, findPausedDuel, savedRole, type PausedDuel } from '../../app/duel-save'
import { createParticipantId, createRoomCode, LIVE_HEARTBEAT_MS } from '../../app/duel-relay-rules'
import type { RoomsApi } from '../../app/duel-rooms'
import { validGenesysCap, type RoomOptions } from '../../app/duel-prefs'
import type { Duel, DuelRole, DuelSnapshot } from '../../app/duel-session'
import type { SocketStatus } from '../../app/duel-socket'
import { duelResult, rpsOutcome } from '../../app/duel-games'
import { DESKTOP_DECK_BUILDER_MEDIA_QUERY, useMediaQuery } from '../../app/use-media-query'
import { duelTurnNumber, sharedPhase, whoseTurn } from '../../app/duel-turn'
import { STARTING_LP } from '../../app/life-calculator'
import { beginDuel } from '../../app/mascot'
import { matEffects, type SpotlightKind } from '../../app/mat-effects'
import { createMatState, isToken, PHASES, randomSeed, replayMat, shuffleWithSeed, type MatPile } from '../../app/practice-mat'
import { useDuel, type DuelConnect, type SpectatorConnect } from '../../app/use-duel'
import type { MatSession } from '../../app/use-mat-session'
import { showToastMessage } from '../../app/use-toast-message'
import { t } from '../../i18n'
import { Button } from '../ui/Button'
import { Callout } from '../ui/Callout'
import { cx } from '../ui/cx'
import { FieldBox, fieldInline } from '../ui/FieldBox'
import { Heading } from '../ui/Heading'
import { Icon } from '../ui/Icon'
import { Modal } from '../ui/Modal'
import { CloseButton, IconButton } from '../ui/IconButton'
import { CardMenu, PILE_TITLES, PileViewer } from '../probability/MatDialogs'
import { PracticeMat, type DuelMatLink, type MatCard } from '../probability/PracticeMat'
import { DuelBar, DuelChatToggle, DuelLife, DuelLogTicker, DuelTools, type LaneNotice } from './DuelBar'
import { GOOD_MESSAGE, isHold, isRelease, isSignal } from './signals'
import { useDuelFeed } from './use-duel-feed'
import { DuelChat } from './DuelChat'
import { DuelChatPanel } from './DuelChat'
import { DuelPause } from './DuelPause'
import { RivalCardDetail } from './RivalCardDetail'
import { ResultCard } from './DuelResult'
import { DuelDeckPicker, loadDuelDeck, readStoredDeck, type DuelDeck } from './DuelDeckPicker'
import { gameText, outcomeText, rpsName } from './game-text'
import { artOfDrawId, passcodeOfDrawId } from './duel-art'
import { DuelOpening } from './DuelOpening'
import { RoomRules } from './RoomRules'
import { PlayHome } from './PlayHome'
import { formatName } from './room-chips'
import { DuelSiding } from './DuelSiding'
import { SpectatorScreen } from './SpectatorScreen'
import { TossOverlay } from './toss-views'
import { DUEL_AREAS, SideCells, sharedZoneCard, TheirHand, type DuelSideView } from './DuelTable'

const NAME_KEY = 'ygo-lab:duel-name'
/** Quién creó cada sala (por pestaña): si se recarga la página, sigue siendo el anfitrión. */
const roleKey = (room: string) => `ygo-lab:duel-role:${room}`
/** Lo que eligió el anfitrión de cada sala (el reloj, el formato y si es un Match, por pestaña): si recarga la página, la sala sigue igual. */
const optionsKey = (room: string) => `ygo-lab:duel-options:${room}`

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
    format: (DUEL_FORMATS as readonly unknown[]).includes(stored.format) ? (stored.format as DeckFormat) : DEFAULT_DUEL_FORMAT,
    match: stored.match === true,
    siding: stored.match === true && stored.siding === true,
    genesysCap: validGenesysCap(stored.genesysCap),
    isPublic: stored.isPublic === true,
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

/** Pone la sala en la dirección (sin sumar una entrada al historial): así se puede copiar o recargar. */
function showRoomInUrl(room: string | null, watch = false) {
  window.history.replaceState(null, '', room ? `#${DUEL_STEP}?room=${room}${watch ? '&watch=1' : ''}` : `#${DUEL_STEP}`)
}

/**
 * El duelo por enlace: sin sala, el lobby (crear una o unirse con un código); en la sala, el enlace para el rival hasta que los dos
 * reparten su mano; y después la mesa de práctica con el campo del rival arriba. No sabe de redes: `connect` (el relay) lo pone quien la usa.
 */
export function DuelScreen({ handSize, mainIds, extraIds, sideIds, cardsById, deckName, connect, connectSpectator, rooms, onImmersiveChange }: DuelScreenProps) {
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
  // El deck es el del builder o uno que se pega; se juega siempre con los puntos de vida de siempre.
  const [imported, setImported] = useState<DuelDeck | null>(null)
  // En un Match con siding, el deck de los duelos que siguen es el que quedó después de cambiar cartas (el rival no lo ve).
  const [sided, setSided] = useState<DuelDeck | null>(null)
  const [sidingOpen, setSidingOpen] = useState(false)
  const deck = useMemo<DuelDeck>(() => sided ?? imported ?? { name: deckName, mainIds, extraIds, sideIds, cardsById }, [sided, imported, deckName, mainIds, extraIds, sideIds, cardsById])
  const roomCode = intent?.room
  const options = useMemo(() => optionsFor(roomCode), [roomCode])
  const settings = useMemo(
    () => ({ lp: STARTING_LP, hand: handSize, limitMin: options.limitMin, format: options.format, ...(options.format === 'genesys' ? { genesysCap: options.genesysCap } : {}), match: options.match, siding: options.siding }),
    [handSize, options],
  )
  const { duel, snapshot, status } = useDuel({ room: intent && !intent.watch ? intent.room : null, role: intent?.role ?? 'guest', name: myName, settings, connect })
  const deckReady = deck.mainIds.length >= handSize

  // Sin deck armado (un celular que nunca abrió el builder), el último deck pegado se vuelve a usar solo: también al recargar dentro de la sala, por eso va acá y no en el lobby.
  const builderTooSmall = mainIds.length < handSize
  useEffect(() => {
    const stored = readStoredDeck()

    if (!builderTooSmall || stored === null) {
      return
    }

    let cancelled = false

    void loadDuelDeck(stored)
      .then((loaded) => {
        if (loaded && !cancelled) setImported((current) => current ?? loaded)
      })
      .catch(() => undefined)

    return () => {
      cancelled = true
    }
  }, [builderTooSmall])

  // Cuando ya se eligió quién va primero, cada uno reparte su mano solo (hace falta el deck y, del invitado, los ajustes del anfitrión).
  const ordered = snapshot?.opening.ordered ?? false
  const started = snapshot?.mine != null
  const settingsKnown = snapshot ? snapshot.role === 'host' || snapshot.peerName !== null : false
  const dealHand = snapshot?.settings.hand ?? handSize

  // Una sala pública está en la lista de salas abiertas mientras espera rival (se anota al crearla). Cuando llega el rival pasa a la de los duelos en vivo y su anfitrión lo avisa cada minuto,
  // con cuántos lo miran; si el relay no lo entiende (uno de antes), se baja como siempre al llegar el rival. Se baja al salir o al cerrar la pestaña, y una sala privada nunca se anota.
  const publicCode = rooms && intent && !intent.watch && intent.role === 'host' && options.isPublic ? intent.room : null
  const awaitingRival = !snapshot?.peerPresent
  const watchers = snapshot?.watchers ?? 0
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
      void rooms.live(publicCode, info, watchers, publicToken).then((registered) => {
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
  }, [rooms, publicCode, publicToken, awaitingRival, watchers])

  // Sólo la mesa es a pantalla completa; antes de ella y entre un duelo y el siguiente (lobby, sala, siding, pausa) la app lleva su barra de abajo en el celular.
  const inSiding = sidingOpen && Boolean(snapshot?.settings.siding && snapshot.series.match && snapshot.series.winner === null)
  const onTable = intent !== null && (intent.watch === true || Boolean(duel && snapshot?.mine && snapshot.theirs && !inSiding))

  useEffect(() => {
    onImmersiveChange?.(onTable)
  }, [onTable, onImmersiveChange])
  useEffect(() => () => onImmersiveChange?.(false), [onImmersiveChange])

  // El siding se cierra solo cuando los dos aceptaron y la mesa se limpió para el duelo que sigue.
  useEffect(() => {
    if (!snapshot?.mine) setSidingOpen(false)
  }, [snapshot?.mine])

  useEffect(() => {
    if (duel && ordered && !started && settingsKnown && deckReady) {
      duel.start(createMatState(shuffleWithSeed(deck.mainIds, randomSeed()), deck.extraIds, dealHand))
    }
  }, [duel, ordered, started, settingsKnown, deckReady, deck, dealHand])

  // Pegar un enlace de duelo en la barra de direcciones (o abrirlo en esta misma pestaña) lleva a esa sala.
  useEffect(() => {
    const onHashChange = () => {
      setView(parseDuelView(window.location.hash))
      const next = intentOf(window.location.hash)

      if (next) {
        setIntent((current) => (current?.room === next.room && Boolean(current.watch) === Boolean(next.watch) ? current : next))
      }
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

  const leaveToCreate = () => {
    setCreateNext(true)
    leave()
  }

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
        builder={{ name: deckName, mainIds, extraIds, sideIds, cardsById }}
        imported={imported}
        onImport={setImported}
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

  if (!duel || !snapshot) {
    return (
      <Screen>
        <p className="text-body text-muted">{t('duel.status.connecting')}</p>
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
    return (
      <DuelRoom
        duel={duel}
        snapshot={snapshot}
        status={status}
        room={intent.room}
        myName={myName}
        name={name}
        onRename={rename}
        deckReady={deckReady}
        deckPicker={{ builder: { name: deckName, mainIds, extraIds, sideIds, cardsById }, imported, onImport: setImported, size: deck.mainIds.length, min: handSize }}
        isPublic={rooms && intent.role === 'host' ? options.isPublic : null}
        onLeave={leave}
        onLeaveToCreate={leaveToCreate}
      />
    )
  }

  // Terminado un duelo de un Match con siding, «Siguiente duelo» lleva a cambiar cartas antes de pedir la revancha; el Match ganado vuelve al deck de origen.
  const siding = snapshot.settings.siding && snapshot.series.match && snapshot.series.winner === null
  const rematch = () => {
    if (snapshot.series.winner !== null) setSided(null)

    if (siding && !snapshot.rematch.mine) {
      setSidingOpen(true)
    } else {
      duel.rematch()
    }
  }

  if (sidingOpen && siding) {
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
          onReady={(next, nextCards) => {
            setSided({ ...deck, mainIds: next.main, extraIds: next.extra, sideIds: next.side, cardsById: nextCards })
            duel.rematch()
          }}
        />
      </Screen>
    )
  }

  return <DuelTableScreen duel={duel} snapshot={snapshot} status={status} myName={myName} cardsById={deck.cardsById} deckName={deck.name} onRematch={rematch} onLeave={leave} />
}

/** Lo que no es la mesa: una columna que scrollea, con el ancho de una pantalla de lectura. */
function Screen({ children, wide = false, aside }: { children: React.ReactNode; /** Más ancha, para lo que lleva grillas de cartas (el siding). */ wide?: boolean; /** Una columna al costado (el chat de la sala, sólo en escritorio): las dos van lado a lado. */ aside?: React.ReactNode }) {
  return (
    <div className="h-full min-h-0 overflow-y-auto max-[1100px]:overflow-visible">
      {aside ? (
        <div className="mx-auto grid w-full max-w-5xl content-start items-start gap-6 px-8 py-6 min-[1101px]:grid-cols-[minmax(0,1fr)_20rem]">
          <div className="grid min-w-0 content-start gap-4">{children}</div>
          {aside}
        </div>
      ) : (
        <div className={cx('mx-auto grid w-full content-start gap-4 px-4 py-6', wide ? 'max-w-5xl' : 'max-w-xl')}>{children}</div>
      )}
    </div>
  )
}

const ROOM_STEPS = ['duel.room.step.invite', 'duel.room.step.ready', 'duel.room.step.start'] as const

/** Dónde va la sala: invitar al rival, los dos listos, y quién empieza. Lo que ya pasó queda lleno; el paso en el que está, en negrita. */
function RoomSteps({ step }: { step: number }) {
  return (
    <ol aria-label={t('duel.room.steps')} className="m-0 grid max-w-lg list-none grid-cols-3 gap-2 p-0">
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
  builder: DuelDeck
  imported: DuelDeck | null
  onImport: (deck: DuelDeck | null) => void
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

function DuelLobby({ startInCreate = false, view = null, onViewHandled, name, onName, builder, imported, onImport, deckReady, deckSize, minDeck, onCreate, onPlaySolo, soloReady, rooms, onJoin, paused, onResume, onDropPaused }: DuelLobbyProps) {
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
    <Screen>
      <PlayHome
        view={startInCreate ? 'create' : view}
        name={name}
        onName={onName}
        builder={builder}
        imported={imported}
        onImport={onImport}
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
  /** Con qué deck se juega: se elige desde la sala porque quien entra por un enlace no pasó por el lobby. */
  deckPicker: { builder: DuelDeck; imported: DuelDeck | null; onImport: (deck: DuelDeck | null) => void; size: number; min: number }
  /** Si la sala está en la lista de salas abiertas (sólo lo sabe el anfitrión, y sólo si el relay tiene la lista); `null` si no se sabe o no hay lista. */
  isPublic: boolean | null
  onLeave: () => void
  /** Salir y volver al lobby directo a «Crear una sala» (desde la pantalla de un enlace que ya no funciona). */
  onLeaveToCreate: () => void
}

function DuelRoom({ duel, snapshot, status, room, myName, name, onRename, deckReady, deckPicker, isPublic, onLeave, onLeaveToCreate }: DuelRoomProps) {
  const link = buildDuelLink(window.location.origin, window.location.pathname, room)
  const docked = useMediaQuery(DESKTOP_DECK_BUILDER_MEDIA_QUERY)
  const { peerPresent, peerName, role, incompatible, settings } = snapshot
  // El invitado se prepara con los ajustes del anfitrión: hasta que no llega su saludo, no.
  const settingsKnown = role === 'host' || peerName !== null
  // El formato de la sala se revisa en el deck de cada uno antes de dejarlo estar listo (el rival no ve el deck: es una revisión de cada lado). Edison y Genesys necesitan sus tablas: hasta que bajan no se sabe.
  const roomDeck = deckPicker.imported ?? deckPicker.builder
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
  const canReady = peerPresent && settingsKnown && !incompatible && deckReady && !mainShort && issues.length === 0 && (!needsTables || tablesLoaded)
  const canShare = typeof navigator !== 'undefined' && typeof navigator.share === 'function'
  // Quien entra por un enlace y no encuentra a nadie, tras unos segundos, probablemente tiene un enlace vencido: se lo dice en vez de dejarlo esperando.
  const emptyRoom = useWaited(EMPTY_ROOM_MS, role === 'guest' && !peerPresent && status === 'open')

  const [chatOpen, setChatOpen] = useState(false)
  const [deckOpen, setDeckOpen] = useState(false)

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
  const chat = <DuelChat snapshot={snapshot} myName={myName} onSend={duel.sendChat} />

  return (
    <Screen
      aside={
        docked ? (
          <section aria-label={t('duel.chat.open')} className="grid min-h-[24rem] content-start gap-3 rounded-card border border-border-subtle bg-card-background p-4">
            <Heading level="card">{t('duel.chat.open')}</Heading>
            {peerPresent && !incompatible ? chat : <p className="m-0 py-8 text-center text-body text-muted">{t('duel.room.chatWaiting')}</p>}
          </section>
        ) : undefined
      }
    >
      <div className="flex items-center justify-between gap-3">
        <Heading level="section">{t('duel.room.title')}</Heading>
        <div className="flex items-center gap-2">
          {docked ? null : (
            <Button variant="secondary" icon="chat" aria-haspopup="dialog" onClick={() => setChatOpen(true)}>
              {t('duel.chat.open')}
            </Button>
          )}
          <CloseButton size="md" aria-label={t('duel.room.leave')} title={t('duel.room.leave')} onClick={onLeave} />
        </div>
      </div>

      <RoomSteps step={step} />

      {role === 'host' ? (
        <div className="grid gap-2 rounded-card border border-border-subtle bg-card-background p-4">
          <p className="m-0 text-micro font-semibold uppercase tracking-[0.04em] text-soft">{t('duel.room.link')}</p>
          <p className="m-0 break-all text-body font-semibold text-accent" data-testid="duel-link">{link}</p>
          <p className="m-0 text-micro text-soft">{t('duel.room.code', { code: room })}</p>
          <p className="m-0 text-micro text-soft">{t('duel.room.watchHint')}</p>
          {/* Lo alternativo primero y la principal al final; el enlace para mirar, sin caja, a un costado. */}
          <div className="flex flex-wrap items-center gap-2">
            {canShare ? (
              <Button variant="secondary" icon="upload" onClick={share}>
                {t('duel.room.share')}
              </Button>
            ) : null}
            <Button variant="primary" icon="link" onClick={() => void copy()}>
              {t('duel.room.copy')}
            </Button>
            <Button variant="tertiary" icon="eye" className="min-[700px]:ml-auto" onClick={() => void copy(true)}>
              {t('duel.room.copyWatch')}
            </Button>
          </div>
        </div>
      ) : null}

      {status !== 'open' ? <Callout tone="warning" icon="alert">{status === 'connecting' ? t('duel.status.connecting') : t('duel.status.reconnecting')}</Callout> : null}
      {incompatible ? <Callout tone="danger">{t('duel.room.incompatible')}</Callout> : null}

      {/* Los dos jugadores desde el principio: con el rival adentro la tarjeta de cada uno es la de DuelOpening; antes, la tuya y un lugar que espera. */}
      {!peerPresent ? (
        <>
          <ul className="m-0 grid list-none grid-cols-2 gap-2 p-0">
            <li className="grid min-w-0 content-start gap-1.5 rounded-card border border-accent/60 bg-card-background p-3">
              <span className="flex items-center gap-1.5">
                <i aria-hidden="true" className="size-2.5 rounded-full bg-accent" />
                <span className="text-micro font-semibold uppercase tracking-[0.04em] text-accent">{t('duel.opening.you')}</span>
              </span>
              <strong className="truncate text-lead font-semibold text-foreground">{myName || t('duel.opening.you')}</strong>
            </li>
            <li className="grid min-h-24 content-center justify-items-center gap-2 rounded-card border border-dashed border-border p-3 text-center">
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
        </>
      ) : !settingsKnown ? (
        <p className="m-0 text-micro text-soft">{t('duel.room.guestWaits')}</p>
      ) : null}

      {peerPresent && settingsKnown && !incompatible ? <DuelOpening snapshot={snapshot} myName={myName} canReady={canReady} actions={duel} rename={{ value: name, onCommit: onRename }} /> : null}

      {/* Tu deck: el del builder o el que pegaste (quien llega por un enlace no pasó por el lobby). Se cambia en la hoja «Tu deck» mientras no estés listo; si no cumple, lo que falta se dice acá. */}
      <section aria-label={t('duel.room.deckTitle')} className="grid gap-2 rounded-card border border-border-subtle bg-card-background p-3">
        <div className="flex items-center justify-between gap-3">
          <span className="grid min-w-0 gap-0.5">
            <span className="text-micro font-semibold uppercase text-soft">{t('duel.room.deckTitle')}</span>
            <span className="truncate text-body font-semibold text-foreground">
              {deckReady ? t('duel.room.deckLine', { name: roomDeck.name, main: roomDeck.mainIds.length, extra: roomDeck.extraIds.length }) : t('duel.play.deckNone')}
            </span>
          </span>
          {snapshot.ready.mine ? null : (
            <Button variant="secondary" size="sm" icon="cards" aria-haspopup="dialog" onClick={() => setDeckOpen(true)}>
              {t('duel.room.deckChange')}
            </Button>
          )}
        </div>
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
        {!snapshot.ready.mine && !deckReady ? <Callout tone="warning" icon="alert">{t('duel.lobby.needDeck', { count: deckPicker.size, min: deckPicker.min })}</Callout> : null}
        {!snapshot.ready.mine && deckReady && mainShort ? <Callout tone="warning" icon="alert">{t('duel.room.mainShort', { count: roomDeck.mainIds.length, min: MAIN_MINIMUM })}</Callout> : null}
      </section>

      <RoomRules settings={settings} isPublic={isPublic} watchers={snapshot.watchers} />

      <Modal isOpen={deckOpen} onClose={() => setDeckOpen(false)} size="md" title={t('duel.play.deckTitle')}>
        <DuelDeckPicker builder={deckPicker.builder} imported={deckPicker.imported} onImport={deckPicker.onImport} />
      </Modal>

      {/* El chat en el celular: siempre a un toque (también antes de que entre el rival), en una hoja. */}
      {docked ? null : (
        <Modal isOpen={chatOpen} onClose={() => setChatOpen(false)} size="md" title={t('duel.chat.open')}>
          {peerPresent && !incompatible ? chat : <p className="m-0 py-6 text-center text-body text-muted">{t('duel.room.chatWaiting')}</p>}
        </Modal>
      )}
    </Screen>
  )
}

const NOTHING = () => undefined

/**
 * El duelo en pausa detiene el reloj de la ronda: lo para quien se queda y lo retoma cuando vuelve el que faltaba. Sólo retoma si lo había parado él (un reloj que
 * ya estaba pausado a mano sigue así).
 */
function useClockPause(duel: Duel, snapshot: DuelSnapshot, paused: boolean) {
  const stopped = useRef(false)
  const running = snapshot.life.timer.running

  useEffect(() => {
    if (paused && running) {
      stopped.current = true
      duel.toggleClock()
    } else if (!paused && stopped.current) {
      stopped.current = false

      if (!running) {
        duel.toggleClock()
      }
    }
  }, [duel, paused, running])
}

/**
 * El reloj de la ronda arranca solo cuando los dos tienen su mano (lo pone en marcha el anfitrión y el invitado lo recibe): nadie tiene que acordarse de
 * apretar play. Sólo si el reloj está en cero y parado; si alguien ya lo pausó o lo reinició a mano, no se toca.
 */
function useAutoStartClock(duel: Duel, snapshot: DuelSnapshot) {
  const checked = useRef(false)
  const { role, life } = snapshot

  useEffect(() => {
    if (checked.current) {
      return
    }

    checked.current = true

    if (role === 'host' && !life.timer.running && life.timer.elapsedMs === 0) {
      duel.toggleClock()
    }
  }, [duel, role, life.timer.running, life.timer.elapsedMs])
}

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

/**
 * Avisos de lo que hace el rival fuera de las cartas (moneda, dado, su elección en piedra-papel-tijera, quién empieza, una señal) y de cómo salió la ronda,
 * para verlos aunque el panel de juegos esté cerrado. Lo que ya estaba en el registro al abrir la pantalla no se avisa.
 */
function useGameToasts(snapshot: DuelSnapshot, myName: string) {
  const { games, rps, peerName, me } = snapshot
  const seen = useRef(games.at(-1)?.id ?? 0)
  const rival = peerName ?? t('duel.bar.rival')

  useEffect(() => {
    const nameOf = (player: 0 | 1) => (player === me ? myName : rival)

    for (const entry of games) {
      if (entry.id > seen.current && entry.from !== me) {
        showToastMessage(gameText(entry, nameOf), 'info')
      }
    }

    seen.current = Math.max(seen.current, games.at(-1)?.id ?? 0)
  }, [games, me, myName, rival])

  const outcome = rpsOutcome(rps.mine, rps.theirs)

  useEffect(() => {
    if (outcome && rps.mine && rps.theirs) {
      showToastMessage(t('duel.games.log.rpsResult', { mine: rpsName(rps.mine), theirs: rpsName(rps.theirs), outcome: outcomeText(outcome) }), outcome === 'win' ? 'success' : 'info')
    }
  }, [outcome, rps.mine, rps.theirs])
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
  const [shown, setShown] = useState<{ effect: NonNullable<DuelMatLink['rivalEffect']>; flashId?: string; /** El número de YGOPRODeck de la carta, si es pública: sirve para ponerle el nombre. */ passcode?: number } | undefined>(undefined)
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
      const art = artOf(spotlight.id)
      // Sólo si la carta es pública para quien mira (el rival la mostró al activarla o revelarla): una boca abajo sigue de dorso y sin nombre.
      const readable = READABLE_KINDS.has(spotlight.kind) && art !== null
      const real = isToken(spotlight.id) ? undefined : theirs.known[spotlight.id]
      const passcode = readable && real ? passcodeOfDrawId(real) : null

      setShown({
        effect: { key, kind: spotlight.kind, cards: [{ id: spotlight.id, art }], caption: t(`duel.announce.${spotlight.kind}`, { name: rival }), ...(readable ? { linger: true } : {}) },
        flashId: spotlight.id,
        ...(passcode === null ? {} : { passcode }),
      })
    } else if (showcase) {
      setShown({ effect: { key, kind: showcase.kind, cards: showcase.ids.map((id) => ({ id, art: artOf(id) })), ...(showcase.flip ? { flip: true } : {}), caption: t(`duel.announce.show.${showcase.kind}`, { name: rival, count: showcase.ids.length }) } })
    } else if (quiet) {
      // Al cementerio o al destierro no se muestra grande: el efecto no se dibuja (`quiet`), pero su línea entra al registro como las demás.
      setShown({ effect: { key, kind: quiet.kind, quiet: true, cards: quiet.ids.map((id) => ({ id, art: artOf(id) })), caption: t(`duel.announce.show.${quiet.kind}`, { name: rival, count: quiet.ids.length }) } })
    }
  }, [acts, theirs, peerName])

  useEffect(() => {
    if (!shown) return

    const id = setTimeout(() => setShown(undefined), shown.effect.linger ? RIVAL_READ_MS : RIVAL_FX_MS)
    return () => clearTimeout(id)
  }, [shown])

  // El nombre de lo que se activó (público): se busca por su número y, cuando llega, entra en el cartel y en el registro sin reiniciar la animación.
  const rivalLabel = peerName ?? t('duel.bar.rival')

  useEffect(() => {
    if (shown?.passcode === undefined || shown.effect.cards[0]?.name) return

    const { key } = shown.effect
    // Sólo se lee lo que se activa, se revela o se declara (ver `READABLE_KINDS`).
    const kind = shown.effect.kind as 'activate' | 'reveal' | 'declare'
    let alive = true

    fetchCardsByIds([shown.passcode])
      .then((cards) => {
        const name = cards[0]?.name

        if (!alive || !name) return

        setShown((current) =>
          current && current.effect.key === key
            ? { ...current, effect: { ...current.effect, cards: current.effect.cards.map((card) => ({ ...card, name })), caption: t(`duel.announce.named.${kind}`, { name: rivalLabel, card: name }) } }
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

/** Cuánto se queda el globo de "pensando" o "todo bien" junto a las vidas. */
const SIGNAL_MS = 3500

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

/** Cuánto dura como máximo un «Esperá» si nadie lo suelta: una espera olvidada no puede dejar el cartel puesto para siempre. */
const HOLD_MAX_MS = 60_000

/**
 * Quién pidió esperar (✋) y sigue pidiéndolo. Una espera dura hasta que quien la pidió la suelta (👍, o tocando ✋ otra vez) o pasa el tope de seguridad (`HOLD_MAX_MS`): no se cancela
 * por jugar, porque quien pidió esperar es quien decide cuándo seguir. Se arma sólo con lo que llega o se manda ahora (lo que ya estaba escrito al abrir la pantalla no la resucita) y
 * se borra si el rival se va: no queda colgada hasta que vuelva.
 */
function useHolds(snapshot: DuelSnapshot): { mine: boolean; theirs: boolean } {
  const { chat, me, peerPresent } = snapshot
  const last = chat.at(-1)?.id ?? 0
  const seen = useRef(last)
  // La línea del chat que la pidió (sirve de identidad: pedirla de nuevo, o soltarla y pedirla, reinicia el tope).
  const [since, setSince] = useState<{ mine: number | null; theirs: number | null }>({ mine: null, theirs: null })

  useEffect(() => {
    const fresh = chat.filter((line) => line.id > seen.current)

    seen.current = Math.max(seen.current, last)

    if (fresh.length === 0) return

    setSince((current) => {
      let next = current

      for (const line of fresh) {
        const side = line.from === me ? 'mine' : 'theirs'

        if (isHold(line.text)) next = { ...next, [side]: line.id }
        else if (isRelease(line.text) && next[side] !== null) next = { ...next, [side]: null }
      }

      return next
    })
  }, [chat, last, me])

  useEffect(() => {
    if (!peerPresent) setSince({ mine: null, theirs: null })
  }, [peerPresent])

  useEffect(() => {
    if (since.mine === null) return

    const id = setTimeout(() => setSince((current) => (current.mine === since.mine ? { ...current, mine: null } : current)), HOLD_MAX_MS)
    return () => clearTimeout(id)
  }, [since.mine])

  useEffect(() => {
    if (since.theirs === null) return

    const id = setTimeout(() => setSince((current) => (current.theirs === since.theirs ? { ...current, theirs: null } : current)), HOLD_MAX_MS)
    return () => clearTimeout(id)
  }, [since.theirs])

  return { mine: since.mine !== null, theirs: since.theirs !== null }
}

function useSignals(snapshot: DuelSnapshot): { mine: string | null; theirs: string | null } {
  const { chat, me } = snapshot
  const last = chat.at(-1)?.id ?? 0
  const seen = useRef(last)
  const [shown, setShown] = useState<{ mine: string | null; theirs: string | null; key: number }>({ mine: null, theirs: null, key: 0 })

  useEffect(() => {
    // ✋ no sale como globo: es un pedido de atención y tiene su cartel (ver `useHolds`), no una reacción más.
    const fresh = chat.filter((line) => line.id > seen.current && isSignal(line.text) && !isHold(line.text))

    seen.current = Math.max(seen.current, last)

    if (fresh.length > 0) {
      const line = fresh[fresh.length - 1]!

      setShown((current) => ({ ...current, [line.from === me ? 'mine' : 'theirs']: line.text, key: line.id }))
    }
  }, [chat, last, me])

  useEffect(() => {
    if (shown.mine === null && shown.theirs === null) return

    const id = setTimeout(() => setShown((current) => ({ ...current, mine: null, theirs: null })), SIGNAL_MS)
    return () => clearTimeout(id)
  }, [shown])

  return shown
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
function DuelTableScreen({ duel, snapshot, status, myName, cardsById, deckName, onRematch, onLeave }: { duel: Duel; snapshot: DuelSnapshot; status: SocketStatus; myName: string; cardsById: ReadonlyMap<string, MatCard>; deckName: string; onRematch: () => void; onLeave: () => void }) {
  const { mine, initial, actions, theirs } = snapshot
  const docked = useMediaQuery(DESKTOP_DECK_BUILDER_MEDIA_QUERY)
  // Tocar una carta o una pila del rival (o su mano) abre un menú con una sola jugada: marcarla (o quitarle la marca) como objetivo, y él lo ve en lo suyo.
  const [markMenu, setMarkMenu] = useState<{ target: MarkTarget; rect: DOMRect; place: string } | null>(null)
  const openMark = useCallback((target: MarkTarget, rect: DOMRect, place: string) => setMarkMenu({ target, rect, place }), [])
  // El cementerio y el destierro del rival son públicos: se pueden desplegar para ver (y marcar) sus cartas.
  const [rivalViewer, setRivalViewer] = useState<'gy' | 'banished' | null>(null)
  // El detalle de una carta del rival que ya está a la vista (su id real, lo único que se sabe de ella).
  const [rivalInspected, setRivalInspected] = useState<{ drawId: string; rect: DOMRect } | null>(null)

  // La mesa espera una "sesión" con la mano inicial y las jugadas; acá no hay combos ni repetición, así que el cursor está siempre al final.
  const session = useMemo<MatSession>(() => ({ initial: initial!, actions: [...actions], cursor: actions.length, names: {}, replay: false }), [initial, actions])
  const { effect: rivalEffect, flash: rivalFlash, shuffles: rivalShuffle } = useRivalEffect(snapshot)
  // Lo que se está señalando de cada lado (un aro que late un rato): se arma antes del lado del rival, que lo lleva.
  const pointed = usePointed(snapshot)
  const opponent = useMemo<DuelSideView>(
    () => ({ state: theirs!.state, artOf: (id) => artOfDrawId(isToken(id) ? id : theirs!.known[id]), handCount: theirs!.state.hand.length, flash: rivalFlash, marks: snapshot.marks.theirs, point: pointed.theirs, onMark: openMark }),
    [theirs, rivalFlash, snapshot.marks.theirs, pointed.theirs, openMark],
  )
  const turn = whoseTurn(snapshot.me, mine, theirs!.state, snapshot.starter)
  useGameToasts(snapshot, myName)
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
    }
  }, [covered])
  useClockPause(duel, snapshot, paused)
  const announcement = useRivalAttack(snapshot, cardsById)
  // El registro de jugadas (con el chat): lo que hizo cada uno, el comienzo de cada turno y lo escrito. Se abre desde el botón del chat o desde la línea sobre el campo.
  const [chatOpen, setChatOpen] = useState(false)
  // La moneda, el dado y los juegos: se abren desde el + de la mesa.
  const [gamesOpen, setGamesOpen] = useState(false)
  const rivalCaptions = useMemo(() => [rivalEffect, announcement], [rivalEffect, announcement])
  const feed = useDuelFeed({ snapshot, cardsById, rivalCaptions, turn, turnNumber: duelTurnNumber(mine, theirs!.state), rivalName: snapshot.peerName ?? t('duel.bar.rival'), myName })
  const signals = useSignals(snapshot)
  const holds = useHolds(snapshot)
  useMarkNotice(snapshot)
  const notice = useRivalNotice(snapshot, turn)
  const rivalName = snapshot.peerName ?? t('duel.bar.rival')
  const undoResult = useUndoResult(snapshot)
  // El aviso de atención que se apoya sobre la línea del registro, uno a la vez y el más urgente primero: el permiso que el rival pide (sin diálogo: no tapa la mesa), el tuyo, cómo terminó, y los «Esperá».
  const lane = useMemo<LaneNotice | null>(
    () =>
      snapshot.undo.asked
        ? { kind: 'undoAsked', onAllow: () => duel.answerUndo(true), onDeny: () => duel.answerUndo(false) }
        : snapshot.undo.asking
          ? { kind: 'undoAsking' }
          : undoResult
            ? { kind: 'undoResult', result: undoResult.kind }
            : holds.theirs || holds.mine
              ? { kind: 'hold', mine: holds.mine, theirs: holds.theirs, onRelease: () => duel.sendChat(GOOD_MESSAGE) }
              : null,
    [snapshot.undo.asked, snapshot.undo.asking, undoResult, holds.mine, holds.theirs, duel],
  )
  // A quiénes se puede atacar: los monstruos del rival en el campo, con el id que él les dio.
  const attackTargets = useMemo(
    () => (['mz', 'emz'] as const).flatMap((zone) => theirs!.state[zone].flatMap((placed, index) => (placed ? [{ id: placed.id, zone, index, faceDown: placed.pos === 'set' }] : []))),
    [theirs],
  )

  const link = useMemo<DuelMatLink>(
    () => {
      const rivalHand = <TheirHand count={opponent.handCount ?? 0} marked={snapshot.marks.theirs.piles.includes('hand')} pointed={pointed.theirs?.pile === 'hand'} onMark={(rect) => openMark({ pile: 'hand' }, rect, PILE_TITLES.hand)} />

      return {
      areas: DUEL_AREAS,
      rivalHand,
      opponent: <SideCells side={opponent} owner="theirs" />,
      sharedZone: (index) => sharedZoneCard(opponent, index),
      attackTargets,
      undoPending: snapshot.undo.asking,
      rivalEmz: theirs!.state.emz.map(Boolean),
      foreignKnown: theirs!.known,
      announcement,
      rivalEffect,
      marksOnMine: snapshot.marks.mine,
      pointed: pointed.mine,
      point: (id: string) => duel.ping({ card: id }, 'mine'),
      rivalShuffle,
      rivalFlights: { state: opponent.state, artOf: opponent.artOf },
      notice,
      rivalTurnLabel: t('duel.bar.theirTurn', { name: rivalName }),
      phase: sharedPhase(turn, mine, theirs!.state) ?? 'draw',
      myTurn: turn === 'mine',
      tools: (
        <DuelTools
          snapshot={snapshot}
          myName={myName}
          games={duel}
          onSendChat={duel.sendChat}
          chatDocked={docked}
          holding={holds.mine}
          chat={docked ? undefined : <DuelChatToggle snapshot={snapshot} myName={myName} onSendChat={duel.sendChat} feed={feed} open={chatOpen} onOpen={() => setChatOpen(true)} onClose={() => setChatOpen(false)} holding={holds.mine} />}
          gamesOpen={gamesOpen}
          onGamesClose={() => setGamesOpen(false)}
        />
      ),
      plusItems: [{ label: t('duel.games.open'), onSelect: () => setGamesOpen(true) }],
      // En escritorio el chat está siempre abierto a la derecha (en el celular, un panel que se abre desde el botón de abajo).
      aside: docked ? <DuelChatPanel snapshot={snapshot} myName={myName} onSend={duel.sendChat} feed={feed} holding={holds.mine} /> : undefined,
      life: <DuelLife snapshot={snapshot} myName={myName} onChangeLife={duel.changeLife} onHalve={duel.halveLife} signal={signals.mine} />,
      cover: paused ? (
        <DuelPause rival={rivalName} offline={status !== 'open'} onLeave={onLeave} onReconnect={duel.reconnect} />
      ) : result !== null && !resultClosed ? (
        <ResultCard result={result} snapshot={snapshot} rival={rivalName} onRematch={onRematch} onLeave={onLeave} onClose={() => setResultClosed(true)} />
      ) : undefined,
      header: <DuelBar snapshot={snapshot} status={status} turn={turn} theirHand={rivalHand} onToggleClock={duel.toggleClock} onRematch={onRematch} onLeave={onLeave} onConcede={duel.concede} onReconnect={duel.reconnect} log={docked ? undefined : <DuelLogTicker snapshot={snapshot} myName={myName} feed={feed} onOpen={() => setChatOpen(true)} />} resultOpen={resultOpen} rivalSignal={signals.theirs} lane={lane} />,
      }
    },
    [opponent, snapshot, status, myName, turn, duel, onLeave, onRematch, attackTargets, theirs, announcement, rivalEffect, rivalShuffle, notice, rivalName, mine, paused, docked, result, resultOpen, resultClosed, signals, holds, lane, pointed, openMark, feed, chatOpen, gamesOpen],
  )

  const markTarget = markMenu?.target
  const marked = markTarget ? ('card' in markTarget ? snapshot.marks.theirs.cards.includes(markTarget.card) : snapshot.marks.theirs.piles.includes(markTarget.pile)) : false
  const markPile = markTarget && 'pile' in markTarget && (markTarget.pile === 'gy' || markTarget.pile === 'banished') ? markTarget.pile : null
  const markItems = markTarget
    ? [
        ...(markPile ? [{ label: t('duel.mark.view'), onSelect: () => { setRivalViewer(markPile); setMarkMenu(null) } }] : []),
        // Señalar (comunica un rato, sin dejar nada) y Target (la marca de objetivo, que se queda): son cosas distintas.
        { label: t('duel.point.label'), onSelect: () => { duel.ping(markTarget, 'theirs'); setMarkMenu(null) } },
        {
          label: t(marked ? 'practice.menu.untarget' : 'practice.menu.target'),
          onSelect: () => {
            duel.toggleMark(markTarget)
            setMarkMenu(null)
          },
        },
      ]
    : []
  // De una carta del rival que ya mostró (a la vista en su campo, en su cementerio o destierro, o revelada) se puede ver el detalle.
  const markedDrawId = markTarget && 'card' in markTarget ? theirs!.known[markTarget.card] : undefined
  const rivalCardName = t('duel.mark.rivalCard')
  const viewerTargeted = useMemo(() => new Set([...snapshot.marks.theirs.cards, ...theirs!.state.targeted]), [snapshot.marks.theirs.cards, theirs])

  return (
    <>
      <PracticeMat
        session={session}
        state={mine!}
        cardsById={cardsById}
        deckName={deckName}
        onDispatch={duel.play}
        onUndo={duel.undo}
        onSeek={NOTHING}
        onLoadCombo={NOTHING}
        onNewHand={NOTHING}
        duel={link}
      />
      <CardMenu
        anchor={covered ? null : (markMenu?.rect ?? null)}
        kicker={rivalName}
        title={markMenu?.place ?? ''}
        items={markItems}
        onInspect={markMenu && markedDrawId !== undefined ? () => { setRivalInspected({ drawId: markedDrawId, rect: markMenu.rect }); setMarkMenu(null) } : undefined}
        onClose={() => setMarkMenu(null)}
      />
      <PileViewer
        key={rivalViewer ?? 'closed'}
        pile={covered ? null : rivalViewer}
        ids={rivalViewer ? theirs!.state[rivalViewer] : []}
        info={(id) => {
          const art = opponent.artOf(id)

          return { name: rivalCardName, art, faceDown: theirs!.state.facedown.includes(id) || art === null }
        }}
        targeted={viewerTargeted}
        onPick={(id, rect) => openMark({ card: id }, rect, rivalCardName)}
        onClose={() => setRivalViewer(null)}
        anonymous
      />
      {rivalInspected && !covered ? <RivalCardDetail key={rivalInspected.drawId} drawId={rivalInspected.drawId} origin={rivalInspected.rect} onClose={() => setRivalInspected(null)} /> : null}
      {/* Lo que tira el rival (moneda, dado, piedra-papel-tijera) se ve girar acá aunque el panel de juegos esté cerrado. */}
      <TossOverlay snapshot={snapshot} myName={myName} />
    </>
  )
}
