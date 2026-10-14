import { useCallback, useEffect, useMemo, useState } from 'react'

import { buildDuelLink, DUEL_STEP, extractRoomCode, parseDuelHash } from '../../app/duel-link'
import { cleanName } from '../../app/duel-protocol'
import { createRoomCode } from '../../app/duel-relay-rules'
import type { Duel, DuelRole, DuelSnapshot } from '../../app/duel-session'
import type { SocketStatus } from '../../app/duel-socket'
import { whoseTurn } from '../../app/duel-turn'
import { STARTING_LP } from '../../app/life-calculator'
import { createMatState, isToken, randomSeed, shuffleWithSeed } from '../../app/practice-mat'
import { useDuel, type DuelConnect } from '../../app/use-duel'
import type { MatSession } from '../../app/use-mat-session'
import { showToastMessage } from '../../app/use-toast-message'
import { t } from '../../i18n'
import { Button } from '../ui/Button'
import { Callout } from '../ui/Callout'
import { FieldBox, fieldInline } from '../ui/FieldBox'
import { Heading } from '../ui/Heading'
import { Icon } from '../ui/Icon'
import { PracticeMat, type DuelMatLink, type MatCard } from '../probability/PracticeMat'
import { DuelBar } from './DuelBar'
import { artOfDrawId } from './duel-art'
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
}

interface Intent {
  room: string
  role: DuelRole
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

/** La sala que pide el enlace con que se abrió la página, si hay una. */
function readIntent(): Intent | null {
  const room = typeof window === 'undefined' ? null : parseDuelHash(window.location.hash)

  return room ? { room, role: readStored(() => sessionStorage, roleKey(room)) === 'host' ? 'host' : 'guest' } : null
}

/** Pone la sala en la dirección (sin sumar una entrada al historial): así se puede copiar o recargar. */
function showRoomInUrl(room: string | null) {
  window.history.replaceState(null, '', room ? `#${DUEL_STEP}?room=${room}` : `#${DUEL_STEP}`)
}

/**
 * El duelo por enlace: sin sala, el lobby (crear una o unirse con un código); en la sala, el enlace para el rival hasta que los dos
 * reparten su mano; y después la mesa de práctica con el campo del rival arriba. No sabe de redes: `connect` (el relay) lo pone quien la usa.
 */
export function DuelScreen({ handSize, mainIds, extraIds, cardsById, deckName, connect }: DuelScreenProps) {
  const [name, setName] = useState(() => readStored(() => localStorage, NAME_KEY) ?? '')
  const [intent, setIntent] = useState<Intent | null>(readIntent)
  const myName = cleanName(name) || t('duel.lobby.defaultName')
  const settings = useMemo(() => ({ lp: STARTING_LP, hand: handSize }), [handSize])
  const { duel, snapshot, status } = useDuel({ room: intent?.room ?? null, role: intent?.role ?? 'guest', name: myName, settings, connect })
  const deckReady = mainIds.length >= handSize

  // Pegar un enlace de duelo en la barra de direcciones (o abrirlo en esta misma pestaña) lleva a esa sala.
  useEffect(() => {
    const onHashChange = () => {
      const room = parseDuelHash(window.location.hash)

      if (room) {
        setIntent((current) => (current?.room === room ? current : { room, role: readStored(() => sessionStorage, roleKey(room)) === 'host' ? 'host' : 'guest' }))
      }
    }

    window.addEventListener('hashchange', onHashChange)
    return () => window.removeEventListener('hashchange', onHashChange)
  }, [])

  const enter = useCallback(
    (room: string, role: DuelRole) => {
      writeStored(() => localStorage, NAME_KEY, cleanName(name))
      writeStored(() => sessionStorage, roleKey(room), role)
      showRoomInUrl(room)
      setIntent({ room, role })
    },
    [name],
  )

  const leave = useCallback(() => {
    showRoomInUrl(null)
    setIntent(null)
  }, [])

  if (!intent) {
    return <DuelLobby name={name} onName={setName} deckReady={deckReady} deckSize={mainIds.length} minDeck={handSize} onCreate={() => enter(createRoomCode(), 'host')} onJoin={(room) => enter(room, 'guest')} />
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

  if (!snapshot.mine || !snapshot.theirs) {
    return (
      <DuelRoom
        snapshot={snapshot}
        status={status}
        room={intent.room}
        deckReady={deckReady}
        onStart={() => duel.start(createMatState(shuffleWithSeed(mainIds, randomSeed()), extraIds, snapshot.settings.hand))}
        onLeave={leave}
      />
    )
  }

  return <DuelTableScreen duel={duel} snapshot={snapshot} status={status} myName={myName} cardsById={cardsById} deckName={deckName} onLeave={leave} />
}

/** Lo que no es la mesa: una columna que scrollea, con el ancho de una pantalla de lectura. */
function Screen({ children }: { children: React.ReactNode }) {
  return (
    <div className="h-full min-h-0 overflow-y-auto">
      <div className="mx-auto grid w-full max-w-xl content-start gap-4 px-4 py-6">{children}</div>
    </div>
  )
}

function DuelLobby({ name, onName, deckReady, deckSize, minDeck, onCreate, onJoin }: { name: string; onName: (name: string) => void; deckReady: boolean; deckSize: number; minDeck: number; onCreate: () => void; onJoin: (room: string) => void }) {
  const [code, setCode] = useState('')
  const [invalid, setInvalid] = useState(false)

  const join = () => {
    const room = extractRoomCode(code)

    if (room) {
      onJoin(room)
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

      {deckReady ? null : <Callout tone="warning" icon="alert">{t('duel.lobby.needDeck', { count: deckSize, min: minDeck })}</Callout>}

      <FieldBox>
        <input aria-label={t('duel.lobby.name')} placeholder={t('duel.lobby.namePlaceholder')} maxLength={40} value={name} onChange={(event) => onName(event.target.value)} className={fieldInline} />
      </FieldBox>

      <div className="grid gap-1.5">
        <Button variant="primary" icon="link" disabled={!deckReady} onClick={onCreate}>
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
          <Button type="submit" variant="secondary" disabled={!deckReady || code.trim() === ''}>
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

/** La sala hasta que los dos tienen su mano: el enlace para el rival, quién está y el botón de repartir. */
function DuelRoom({ snapshot, status, room, deckReady, onStart, onLeave }: { snapshot: DuelSnapshot; status: SocketStatus; room: string; deckReady: boolean; onStart: () => void; onLeave: () => void }) {
  const link = buildDuelLink(window.location.origin, window.location.pathname, room)
  const { peerPresent, peerName, role, incompatible, settings } = snapshot
  const started = snapshot.mine !== null
  // El invitado reparte con los ajustes del anfitrión: hasta que no llega su saludo, no.
  const settingsKnown = role === 'host' || peerName !== null
  const canStart = peerPresent && settingsKnown && !incompatible && deckReady && !started
  const canShare = typeof navigator !== 'undefined' && typeof navigator.share === 'function'

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(link)
      showToastMessage(t('duel.room.copied'), 'success')
    } catch {
      showToastMessage(link, 'error')
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
          <div className="flex flex-wrap gap-2">
            <Button variant="primary" size="sm" icon="link" onClick={() => void copy()}>
              {t('duel.room.copy')}
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
      {incompatible ? <Callout tone="danger">{t('duel.room.incompatible')}</Callout> : null}

      <p className="m-0 flex items-center gap-2 text-body text-foreground" role="status">
        <Icon name="user" size={16} />
        {!peerPresent ? t('duel.room.waitingPeer') : peerName ? t('duel.room.peerHere', { name: peerName }) : t('duel.room.peerHereNoName')}
      </p>

      {peerPresent && !settingsKnown ? <p className="m-0 text-micro text-soft">{t('duel.room.guestWaits')}</p> : <p className="m-0 text-micro text-soft">{t('duel.room.settings', { lp: settings.lp, hand: settings.hand })}</p>}

      <div className="flex flex-wrap items-center gap-2">
        {started ? (
          <p className="m-0 text-body text-muted" role="status">{t('duel.room.waitingTable')}</p>
        ) : (
          <Button variant="primary" icon="hand" disabled={!canStart} onClick={onStart}>
            {t('duel.room.start')}
          </Button>
        )}
        <Button variant="tertiary" onClick={onLeave}>
          {t('duel.room.leave')}
        </Button>
      </div>
    </Screen>
  )
}

const NOTHING = () => undefined

/** La mesa de práctica con el campo del rival arriba: tus jugadas van al relay y las suyas llegan solas. */
function DuelTableScreen({ duel, snapshot, status, myName, cardsById, deckName, onLeave }: { duel: Duel; snapshot: DuelSnapshot; status: SocketStatus; myName: string; cardsById: ReadonlyMap<string, MatCard>; deckName: string; onLeave: () => void }) {
  const { mine, initial, actions, theirs } = snapshot

  // La mesa espera una "sesión" con la mano inicial y las jugadas; acá no hay combos ni repetición, así que el cursor está siempre al final.
  const session = useMemo<MatSession>(() => ({ initial: initial!, actions: [...actions], cursor: actions.length, names: {}, replay: false }), [initial, actions])
  const opponent = useMemo<DuelSideView>(
    () => ({ state: theirs!.state, artOf: (id) => artOfDrawId(isToken(id) ? id : theirs!.known[id]), handCount: theirs!.state.hand.length }),
    [theirs],
  )
  const turn = whoseTurn(snapshot.me, mine, theirs!.state)

  const link = useMemo<DuelMatLink>(
    () => ({
      areas: DUEL_AREAS,
      opponent: <SideCells side={opponent} owner="theirs" />,
      sharedZone: (index) => sharedZoneCard(opponent, index),
      header: (
        <>
          <DuelBar
            snapshot={snapshot}
            status={status}
            myName={myName}
            turn={turn}
            onChangeLife={duel.changeLife}
            onHalve={duel.halveLife}
            onToggleClock={duel.toggleClock}
            onResetClock={duel.resetClock}
            onLeave={onLeave}
          />
          <TheirHand count={opponent.handCount ?? 0} />
        </>
      ),
    }),
    [opponent, snapshot, status, myName, turn, duel, onLeave],
  )

  return (
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
  )
}
