import { useCallback, useEffect, useMemo, useRef, useState } from 'react'

import { buildDuelLink, DUEL_STEP, extractRoomCode, isWatchLink, parseDuelTarget } from '../../app/duel-link'
import { cleanName } from '../../app/duel-protocol'
import { clearDuelSave, findPausedDuel, savedRole, type PausedDuel } from '../../app/duel-save'
import { createRoomCode } from '../../app/duel-relay-rules'
import type { Duel, DuelRole, DuelSnapshot } from '../../app/duel-session'
import type { SocketStatus } from '../../app/duel-socket'
import { duelResult, rpsOutcome } from '../../app/duel-games'
import { DESKTOP_DECK_BUILDER_MEDIA_QUERY, useMediaQuery } from '../../app/use-media-query'
import { duelTurnNumber, sharedPhase, whoseTurn } from '../../app/duel-turn'
import { STARTING_LP } from '../../app/life-calculator'
import { beginDuel } from '../../app/mascot'
import { createMatState, isToken, PHASES, randomSeed, shuffleWithSeed } from '../../app/practice-mat'
import { useDuel, type DuelConnect, type SpectatorConnect } from '../../app/use-duel'
import type { MatSession } from '../../app/use-mat-session'
import { showToastMessage } from '../../app/use-toast-message'
import { t } from '../../i18n'
import { Button } from '../ui/Button'
import { Callout } from '../ui/Callout'
import { FieldBox, fieldInline } from '../ui/FieldBox'
import { Heading } from '../ui/Heading'
import { Icon } from '../ui/Icon'
import { PracticeMat, type DuelMatLink, type MatCard } from '../probability/PracticeMat'
import { DuelBar, DuelLife, DuelTools } from './DuelBar'
import { DuelChat } from './DuelChat'
import { DuelChatPanel } from './DuelChat'
import { DuelPause } from './DuelPause'
import { DuelDeckPicker, loadDuelDeck, readStoredDeck, type DuelDeck } from './DuelDeckPicker'
import { gameText, outcomeText, rpsName } from './game-text'
import { artOfDrawId } from './duel-art'
import { DuelOpening } from './DuelOpening'
import { SpectatorScreen } from './SpectatorScreen'
import { TossOverlay } from './toss-views'
import { DUEL_AREAS, SideCells, sharedZoneCard, TheirHand, type DuelSideView } from './DuelTable'

const NAME_KEY = 'ygo-lab:duel-name'
/** Quién creó cada sala (por pestaña): si se recarga la página, sigue siendo el anfitrión. */
const roleKey = (room: string) => `ygo-lab:duel-role:${room}`

interface DuelScreenProps {
  handSize: number
  /** Las copias del Main y del Extra del deck armado (`card-123-2`), y cómo se llaman. */
  mainIds: string[]
  extraIds: string[]
  cardsById: ReadonlyMap<string, MatCard>
  deckName: string
  connect: DuelConnect
  /** Cómo entrar a mirar un duelo (sin esto, un enlace para mirar no se puede abrir). */
  connectSpectator?: SpectatorConnect
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
export function DuelScreen({ handSize, mainIds, extraIds, cardsById, deckName, connect, connectSpectator }: DuelScreenProps) {
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
  const myName = cleanName(name) || t('duel.lobby.defaultName')
  // El deck es el del builder o uno que se pega; se juega siempre con los puntos de vida de siempre.
  const [imported, setImported] = useState<DuelDeck | null>(null)
  const deck = useMemo<DuelDeck>(() => imported ?? { name: deckName, mainIds, extraIds, cardsById }, [imported, deckName, mainIds, extraIds, cardsById])
  const settings = useMemo(() => ({ lp: STARTING_LP, hand: handSize }), [handSize])
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

  useEffect(() => {
    if (duel && ordered && !started && settingsKnown && deckReady) {
      duel.start(createMatState(shuffleWithSeed(deck.mainIds, randomSeed()), deck.extraIds, dealHand))
    }
  }, [duel, ordered, started, settingsKnown, deckReady, deck, dealHand])

  // Pegar un enlace de duelo en la barra de direcciones (o abrirlo en esta misma pestaña) lleva a esa sala.
  useEffect(() => {
    const onHashChange = () => {
      const next = intentOf(window.location.hash)

      if (next) {
        setIntent((current) => (current?.room === next.room && Boolean(current.watch) === Boolean(next.watch) ? current : next))
      }
    }

    window.addEventListener('hashchange', onHashChange)
    return () => window.removeEventListener('hashchange', onHashChange)
  }, [])

  const enter = useCallback(
    (room: string, role: DuelRole, watch = false) => {
      writeStored(() => localStorage, NAME_KEY, cleanName(name))

      if (!watch) {
        writeStored(() => sessionStorage, roleKey(room), role)
      }

      showRoomInUrl(room, watch)
      setIntent({ room, role, ...(watch ? { watch: true } : {}) })
    },
    [name],
  )

  // Quien entra por un enlace no pasó por el lobby: el nombre se cambia (y se le avisa al rival) desde la sala.
  const rename = useCallback(
    (value: string) => {
      setName(value)
      writeStored(() => localStorage, NAME_KEY, cleanName(value))
      duel?.rename(cleanName(value) || t('duel.lobby.defaultName'))
    },
    [duel],
  )

  // Salir deja el duelo en pausa: lo guardado (la mesa, las vidas, el reloj) sigue ahí para volver. Sólo si ya terminó (alguien se rindió o se quedó sin vidas) no hay nada que retomar.
  const finished = snapshot ? duelResult(snapshot.life.lp, snapshot.conceded) !== null : false
  const leave = useCallback(() => {
    if (intent && finished) clearDuelSave(intent.room)

    showRoomInUrl(null)
    setIntent(null)
  }, [intent, finished])

  // El duelo en pausa de este navegador (si salió de uno), para volver desde el inicio del duelo.
  const [paused, setPaused] = useState<PausedDuel | null>(findPausedDuel)

  useEffect(() => {
    if (!intent) {
      setPaused(findPausedDuel())
    }
  }, [intent])

  if (!intent) {
    return (
      <DuelLobby
        name={name}
        onName={setName}
        builder={{ name: deckName, mainIds, extraIds, cardsById }}
        imported={imported}
        onImport={setImported}
        deckReady={deckReady}
        deckSize={deck.mainIds.length}
        minDeck={handSize}
        onCreate={() => enter(createRoomCode(), 'host')}
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

  if (status === 'full') {
    return (
      <Screen>
        <Callout tone="warning" icon="alert" action={<Button variant="secondary" size="sm" onClick={leave}>{t('duel.room.leave')}</Button>}>
          {t('duel.status.full')}
        </Callout>
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
        <DuelPause rival={snapshot.peerName ?? t('duel.bar.rival')} offline={status !== 'open'} onLeave={leave} />
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
        deckPicker={{ builder: { name: deckName, mainIds, extraIds, cardsById }, imported, onImport: setImported, size: deck.mainIds.length, min: handSize }}
        onLeave={leave}
      />
    )
  }

  return <DuelTableScreen duel={duel} snapshot={snapshot} status={status} myName={myName} cardsById={deck.cardsById} deckName={deck.name} onLeave={leave} />
}

/** Lo que no es la mesa: una columna que scrollea, con el ancho de una pantalla de lectura. */
function Screen({ children }: { children: React.ReactNode }) {
  return (
    <div className="h-full min-h-0 overflow-y-auto">
      <div className="mx-auto grid w-full max-w-xl content-start gap-4 px-4 py-6">{children}</div>
    </div>
  )
}

interface DuelLobbyProps {
  name: string
  onName: (name: string) => void
  builder: DuelDeck
  imported: DuelDeck | null
  onImport: (deck: DuelDeck | null) => void
  deckReady: boolean
  deckSize: number
  minDeck: number
  onCreate: () => void
  /** Entrar a una sala: a jugar, o a mirar si el enlace pegado es de espectador. */
  onJoin: (room: string, watch: boolean) => void
  /** Un duelo en pausa de este navegador, y cómo volver a él o dejarlo. */
  paused: PausedDuel | null
  onResume: () => void
  onDropPaused: () => void
}

function DuelLobby({ name, onName, builder, imported, onImport, deckReady, deckSize, minDeck, onCreate, onJoin, paused, onResume, onDropPaused }: DuelLobbyProps) {
  const [code, setCode] = useState('')
  const [invalid, setInvalid] = useState(false)

  const join = () => {
    const room = extractRoomCode(code)

    if (room) {
      onJoin(room, isWatchLink(code))
    } else {
      setInvalid(true)
    }
  }

  return (
    <Screen>
      <div className="grid gap-1">
        <Heading level="section">{t('duel.lobby.title')}</Heading>
        <p className="m-0 text-body text-muted">{t('duel.lobby.intro')}</p>
      </div>

      {paused ? (
        <div className="grid gap-2 rounded-card border border-primary/40 bg-card-background p-3">
          <p className="m-0 flex items-center gap-2 text-body font-semibold text-foreground" role="status">
            <Icon name="pause" size={16} />
            {paused.rival ? t('duel.lobby.paused', { name: paused.rival }) : t('duel.lobby.pausedNoName')}
          </p>
          <div className="flex flex-wrap gap-2">
            <Button variant="tertiary" size="sm" onClick={onDropPaused}>
              {t('duel.lobby.dropPaused')}
            </Button>
            <Button variant="primary" size="sm" onClick={onResume}>
              {t('duel.lobby.resume')}
            </Button>
          </div>
        </div>
      ) : null}

      {deckReady ? null : <Callout tone="warning" icon="alert">{t('duel.lobby.needDeck', { count: deckSize, min: minDeck })}</Callout>}

      <FieldBox>
        <input aria-label={t('duel.lobby.name')} placeholder={t('duel.lobby.namePlaceholder')} maxLength={40} value={name} onChange={(event) => onName(event.target.value)} className={fieldInline} />
      </FieldBox>

      <DuelDeckPicker builder={builder} imported={imported} onImport={onImport} />

      <div className="grid gap-1.5">
        {/* Con un duelo en pausa, lo principal es volver a él: crear otro pasa a un segundo plano (una principal por vista). */}
        <Button variant={paused ? 'secondary' : 'primary'} icon="link" disabled={!deckReady} onClick={onCreate}>
          {t('duel.lobby.create')}
        </Button>
        <p className="m-0 text-micro text-soft">{t('duel.lobby.createHint')}</p>
      </div>

      <div className="grid gap-1.5">
        <Heading level="card">{t('duel.lobby.join')}</Heading>
        <form
          className="flex items-center gap-2"
          onSubmit={(event) => {
            event.preventDefault()
            join()
          }}
        >
          <FieldBox className="min-w-0 flex-1">
            <input
              aria-label={t('duel.lobby.joinPlaceholder')}
              placeholder={t('duel.lobby.joinPlaceholder')}
              value={code}
              onChange={(event) => {
                setCode(event.target.value)
                setInvalid(false)
              }}
              className={fieldInline}
            />
          </FieldBox>
          <Button type="submit" variant="secondary" disabled={(!deckReady && !isWatchLink(code)) || code.trim() === ''}>
            {t('duel.lobby.joinAction')}
          </Button>
        </form>
        <p className={invalid ? 'm-0 text-micro text-danger' : 'm-0 text-micro text-soft'} role={invalid ? 'alert' : undefined}>
          {invalid ? t('duel.lobby.joinInvalid') : t('duel.lobby.joinHint')}
        </p>
      </div>
    </Screen>
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
  onRename: (name: string) => void
  deckReady: boolean
  /** Con qué deck se juega: se elige desde la sala porque quien entra por un enlace no pasó por el lobby. */
  deckPicker: { builder: DuelDeck; imported: DuelDeck | null; onImport: (deck: DuelDeck | null) => void; size: number; min: number }
  onLeave: () => void
}

function DuelRoom({ duel, snapshot, status, room, myName, name, onRename, deckReady, deckPicker, onLeave }: DuelRoomProps) {
  const link = buildDuelLink(window.location.origin, window.location.pathname, room)
  const { peerPresent, peerName, role, incompatible, settings } = snapshot
  // El invitado se prepara con los ajustes del anfitrión: hasta que no llega su saludo, no.
  const settingsKnown = role === 'host' || peerName !== null
  const canReady = peerPresent && settingsKnown && !incompatible && deckReady
  const canShare = typeof navigator !== 'undefined' && typeof navigator.share === 'function'
  // Quien entra por un enlace y no encuentra a nadie, tras unos segundos, probablemente tiene un enlace vencido: se lo dice en vez de dejarlo esperando.
  const emptyRoom = useWaited(EMPTY_ROOM_MS, role === 'guest' && !peerPresent && status === 'open')

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
    void navigator.share({ title: t('duel.nav.title'), text: t('duel.room.shareText'), url: link }).catch(() => undefined)
  }

  return (
    <Screen>
      <Heading level="section">{t('duel.room.title')}</Heading>

      {role === 'host' ? (
        <div className="grid gap-2 rounded-card border border-border-subtle bg-card-background p-3">
          <p className="m-0 text-micro font-semibold uppercase tracking-[0.04em] text-soft">{t('duel.room.link')}</p>
          <p className="m-0 break-all text-body font-semibold text-foreground" data-testid="duel-link">{link}</p>
          <p className="m-0 text-micro text-soft">{t('duel.room.code', { code: room })}</p>
          <p className="m-0 text-micro text-soft">{t('duel.room.watchHint')}</p>
          <div className="flex flex-wrap gap-2">
            <Button variant="primary" size="sm" icon="link" onClick={() => void copy()}>
              {t('duel.room.copy')}
            </Button>
            <Button variant="secondary" size="sm" icon="eye" onClick={() => void copy(true)}>
              {t('duel.room.copyWatch')}
            </Button>
            {canShare ? (
              <Button variant="secondary" size="sm" onClick={share}>
                {t('duel.room.share')}
              </Button>
            ) : null}
          </div>
        </div>
      ) : null}

      {status !== 'open' ? <Callout tone="warning" icon="alert">{status === 'connecting' ? t('duel.status.connecting') : t('duel.status.reconnecting')}</Callout> : null}
      {snapshot.watchers > 0 ? (
        <p className="m-0 flex items-center gap-2 text-micro text-soft" role="status">
          <Icon name="eye" size={14} />
          {t('duel.room.watchers', { count: snapshot.watchers })}
        </p>
      ) : null}
      {incompatible ? <Callout tone="danger">{t('duel.room.incompatible')}</Callout> : null}
      {emptyRoom ? <Callout tone="warning" icon="alert">{t('duel.room.expired')}</Callout> : null}

      {/* Con el rival adentro ya se ven los dos nombres en la tarjeta de cada uno: no hace falta decirlo otra vez. */}
      {!peerPresent ? (
        <>
          <p className="m-0 flex items-center gap-2 text-body text-foreground" role="status">
            <Icon name="user" size={16} />
            {t('duel.room.waitingPeer')}
          </p>
          <p className="m-0 text-micro text-soft">{t('duel.room.settings', { lp: settings.lp, hand: settings.hand })}</p>
        </>
      ) : !settingsKnown ? (
        <p className="m-0 text-micro text-soft">{t('duel.room.guestWaits')}</p>
      ) : null}

      {peerPresent && settingsKnown && !incompatible ? <DuelOpening snapshot={snapshot} myName={myName} canReady={canReady} actions={duel} rename={{ value: name, onCommit: onRename }} /> : null}

      {/* El anfitrión ya eligió su deck en el lobby; quien llega por un enlace lo elige acá (y sin deck armado, es lo que lo deja estar listo). */}
      {!snapshot.ready.mine && (role === 'guest' || !deckReady) ? (
        <div className="grid gap-2 rounded-card border border-border-subtle bg-card-background p-3">
          {deckReady ? null : <Callout tone="warning" icon="alert">{t('duel.lobby.needDeck', { count: deckPicker.size, min: deckPicker.min })}</Callout>}
          <DuelDeckPicker builder={deckPicker.builder} imported={deckPicker.imported} onImport={deckPicker.onImport} />
        </div>
      ) : null}

      {peerPresent && !incompatible ? (
        <section className="grid gap-2 rounded-card border border-border-subtle bg-card-background p-3" aria-label={t('duel.chat.open')}>
          <Heading level="card">{t('duel.chat.open')}</Heading>
          <DuelChat snapshot={snapshot} myName={myName} onSend={duel.sendChat} />
        </section>
      ) : null}

      <div className="flex flex-wrap items-center gap-2">
        <Button variant="tertiary" onClick={onLeave}>
          {t('duel.room.leave')}
        </Button>
      </div>
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
function DuelTableScreen({ duel, snapshot, status, myName, cardsById, deckName, onLeave }: { duel: Duel; snapshot: DuelSnapshot; status: SocketStatus; myName: string; cardsById: ReadonlyMap<string, MatCard>; deckName: string; onLeave: () => void }) {
  const { mine, initial, actions, theirs } = snapshot
  const docked = useMediaQuery(DESKTOP_DECK_BUILDER_MEDIA_QUERY)

  // La mesa espera una "sesión" con la mano inicial y las jugadas; acá no hay combos ni repetición, así que el cursor está siempre al final.
  const session = useMemo<MatSession>(() => ({ initial: initial!, actions: [...actions], cursor: actions.length, names: {}, replay: false }), [initial, actions])
  const opponent = useMemo<DuelSideView>(
    () => ({ state: theirs!.state, artOf: (id) => artOfDrawId(isToken(id) ? id : theirs!.known[id]), handCount: theirs!.state.hand.length }),
    [theirs],
  )
  const turn = whoseTurn(snapshot.me, mine, theirs!.state, snapshot.starter)
  useGameToasts(snapshot, myName)
  useTurnDraw(duel, snapshot, turn)
  useAutoStartClock(duel, snapshot)
  // Mientras falta uno de los dos el duelo está en pausa (el reloj también); terminado ya no hay nada que esperar.
  const paused = !snapshot.peerPresent && duelResult(snapshot.life.lp, snapshot.conceded) === null
  useClockPause(duel, snapshot, paused)
  const announcement = useRivalAttack(snapshot, cardsById)
  const notice = useRivalNotice(snapshot, turn)
  const rivalName = snapshot.peerName ?? t('duel.bar.rival')
  // A quiénes se puede atacar: los monstruos del rival en el campo, con el id que él les dio.
  const attackTargets = useMemo(
    () => (['mz', 'emz'] as const).flatMap((zone) => theirs!.state[zone].flatMap((placed, index) => (placed ? [{ id: placed.id, zone, index, faceDown: placed.pos === 'set' }] : []))),
    [theirs],
  )

  const link = useMemo<DuelMatLink>(
    () => ({
      areas: DUEL_AREAS,
      opponent: <SideCells side={opponent} owner="theirs" />,
      sharedZone: (index) => sharedZoneCard(opponent, index),
      attackTargets,
      foreignKnown: theirs!.known,
      announcement,
      notice,
      rivalTurnLabel: t('duel.bar.theirTurn', { name: rivalName }),
      phase: sharedPhase(turn, mine, theirs!.state) ?? 'draw',
      myTurn: turn === 'mine',
      tools: <DuelTools snapshot={snapshot} myName={myName} games={duel} onSendChat={duel.sendChat} chatDocked={docked} />,
      // En escritorio el chat está siempre abierto a la derecha (en el celular, un panel que se abre desde el botón de abajo).
      aside: docked ? <DuelChatPanel snapshot={snapshot} myName={myName} onSend={duel.sendChat} /> : undefined,
      life: <DuelLife snapshot={snapshot} myName={myName} onChangeLife={duel.changeLife} onHalve={duel.halveLife} />,
      cover: paused ? <DuelPause rival={rivalName} offline={status !== 'open'} onLeave={onLeave} /> : undefined,
      header: <DuelBar snapshot={snapshot} status={status} turn={turn} theirHand={<TheirHand count={opponent.handCount ?? 0} />} onToggleClock={duel.toggleClock} onRematch={duel.rematch} onLeave={onLeave} onConcede={duel.concede} />,
    }),
    [opponent, snapshot, status, myName, turn, duel, onLeave, attackTargets, theirs, announcement, notice, rivalName, mine, paused, docked],
  )

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
      {/* Lo que tira el rival (moneda, dado, piedra-papel-tijera) se ve girar acá aunque el panel de juegos esté cerrado. */}
      <TossOverlay snapshot={snapshot} myName={myName} />
    </>
  )
}
