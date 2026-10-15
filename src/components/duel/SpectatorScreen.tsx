import { useEffect, useMemo, useRef, useState } from 'react'

import { duelResult } from '../../app/duel-games'
import type { SpectatorSide, SpectatorSnapshot } from '../../app/duel-spectator'
import { formatClock, timerRemaining, type Duelist } from '../../app/life-calculator'
import { isToken, PHASES } from '../../app/practice-mat'
import { showToastMessage } from '../../app/use-toast-message'
import { useSpectator, type SpectatorConnect } from '../../app/use-duel'
import { t } from '../../i18n'
import { Button } from '../ui/Button'
import { Callout } from '../ui/Callout'
import { cx } from '../ui/cx'
import { Heading } from '../ui/Heading'
import { Icon } from '../ui/Icon'
import { IconButton } from '../ui/IconButton'
import { SideDrawer } from '../ui/SideDrawer'
import { LifeTile } from './DuelBar'
import { artOfDrawId } from './duel-art'
import { DuelTable, TheirHand, type DuelSideView } from './DuelTable'
import { gameText } from './game-text'

/**
 * Un duelo visto desde afuera: las dos mesas, las vidas de los dos, el reloj, de quién es el turno y en qué fase va, el chat y lo que se tira. Sólo se mira: no hay
 * ninguna jugada, ningún campo para escribir ni nada que cambie el duelo (el relay tampoco lo permitiría). Se ven las mesas como las ve cada rival: la mano y el deck
 * de nadie, y lo boca abajo de dorso. Se puede dar vuelta la mesa para mirar desde el lado del otro jugador.
 */

interface SpectatorScreenProps {
  room: string
  connect: SpectatorConnect
  onLeave: () => void
}

function Screen({ children }: { children: React.ReactNode }) {
  return (
    <div className="h-full min-h-0 overflow-y-auto">
      <div className="mx-auto grid w-full max-w-xl content-start gap-4 px-4 py-6">{children}</div>
    </div>
  )
}

/** La mesa de un jugador como la ve quien mira: sus cartas con lo que mostró; el resto no se sabe. */
function sideView(side: SpectatorSide): DuelSideView | null {
  const mirror = side.mirror

  return mirror
    ? { state: mirror.state, artOf: (id) => artOfDrawId(isToken(id) ? id : mirror.known[id]), handCount: mirror.state.hand.length }
    : null
}

export function SpectatorScreen({ room, connect, onLeave }: SpectatorScreenProps) {
  const { snapshot, status } = useSpectator({ room, connect })

  if (status === 'full') {
    return (
      <Screen>
        <Callout tone="warning" icon="alert" action={<Button variant="secondary" size="sm" onClick={onLeave}>{t('duel.room.leave')}</Button>}>
          {t('duel.watch.full')}
        </Callout>
      </Screen>
    )
  }

  if (status === 'unsupported') {
    return (
      <Screen>
        <Callout tone="warning" icon="alert" action={<Button variant="secondary" size="sm" onClick={onLeave}>{t('duel.room.leave')}</Button>}>
          {t('duel.status.unsupported')}
        </Callout>
      </Screen>
    )
  }

  if (!snapshot) {
    return (
      <Screen>
        <p className="text-body text-muted">{t('duel.status.connecting')}</p>
      </Screen>
    )
  }

  if (!snapshot.live) {
    return <WaitingToWatch snapshot={snapshot} online={status === 'open'} onLeave={onLeave} />
  }

  return <WatchTable snapshot={snapshot} online={status === 'open'} onLeave={onLeave} />
}

/** Todavía no hay dos mesas: quiénes están y qué se espera. */
function WaitingToWatch({ snapshot, online, onLeave }: { snapshot: SpectatorSnapshot; online: boolean; onLeave: () => void }) {
  const names = snapshot.sides.flatMap((side) => (side.name ? [side.name] : []))

  return (
    <Screen>
      <Heading level="section">{t('duel.watch.title')}</Heading>
      {online ? null : <Callout tone="warning" icon="alert">{t('duel.status.reconnecting')}</Callout>}
      <p className="m-0 flex items-center gap-2 text-body text-foreground" role="status">
        <Icon name="user" size={16} />
        {snapshot.players === 0 ? t('duel.watch.waitingPlayers') : names.length === 1 ? t('duel.watch.waitingRival', { name: names[0] }) : names.length > 1 ? t('duel.watch.waitingStart', { names: names.join(t('duel.watch.and')) }) : t('duel.watch.waitingStartNoNames')}
      </p>
      <p className="m-0 text-micro text-soft">{t('duel.watch.readOnly')}</p>
      <div>
        <Button variant="tertiary" onClick={onLeave}>
          {t('duel.room.leave')}
        </Button>
      </div>
    </Screen>
  )
}

function useTick(ms: number): number {
  const [now, setNow] = useState(() => Date.now())

  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), ms)
    return () => clearInterval(id)
  }, [ms])

  return now
}

/** Los avisos de lo que tiran los jugadores (moneda, dado, quién empieza), para no perderlos mirando la mesa. Lo que ya estaba al abrir no se avisa. */
function useGameToasts(snapshot: SpectatorSnapshot) {
  const { games, sides } = snapshot
  const seen = useRef(games.at(-1)?.id ?? 0)

  useEffect(() => {
    const nameOf = (player: Duelist) => sides[player].name ?? (player === 0 ? t('duel.watch.host') : t('duel.watch.guest'))

    for (const entry of games) {
      if (entry.id > seen.current) {
        showToastMessage(gameText(entry, nameOf), 'info')
      }
    }

    seen.current = Math.max(seen.current, games.at(-1)?.id ?? 0)
  }, [games, sides])
}

function WatchTable({ snapshot, online, onLeave }: { snapshot: SpectatorSnapshot; online: boolean; onLeave: () => void }) {
  const now = useTick(1000)
  // Desde qué lado se mira: abajo, el anfitrión (o el invitado, dando vuelta la mesa).
  const [flipped, setFlipped] = useState(false)
  const [chatOpen, setChatOpen] = useState(false)
  const [read, setRead] = useState(snapshot.chat.length)
  const bottom: Duelist = flipped ? 1 : 0
  const top: Duelist = flipped ? 0 : 1
  const bottomSide = snapshot.sides[bottom]
  const topSide = snapshot.sides[top]
  const bottomView = useMemo(() => sideView(bottomSide), [bottomSide])
  const topView = useMemo(() => sideView(topSide), [topSide])
  const nameOf = (player: Duelist) => snapshot.sides[player].name ?? (player === 0 ? t('duel.watch.host') : t('duel.watch.guest'))
  const unread = chatOpen ? 0 : Math.max(0, snapshot.chat.length - read)
  const phase = PHASES.find((entry) => entry.id === snapshot.phase)?.name
  const clock = formatClock(timerRemaining(snapshot.clock, now))
  const result = snapshot.sides[0].lp !== null && snapshot.sides[1].lp !== null ? duelResult([snapshot.sides[0].lp, snapshot.sides[1].lp], snapshot.conceded) : null

  useGameToasts(snapshot)

  useEffect(() => {
    if (chatOpen) {
      setRead(snapshot.chat.length)
    }
  }, [chatOpen, snapshot.chat.length])

  if (!bottomView || !topView) {
    return null
  }

  return (
    <div className="h-full min-h-0 overflow-y-auto">
      <div className="mx-auto grid w-full max-w-3xl content-start gap-2 px-2 py-2 min-[1101px]:px-4" data-testid="spectator-table">
        {/* Arriba, lo de quien está arriba; las vidas del de abajo en la esquina de enfrente, como en la mesa de los jugadores. */}
        <div className="flex flex-wrap items-center gap-1.5">
          <LifeTile name={nameOf(top)} life={topSide.lp ?? snapshot.settings?.lp ?? 0} />
          <span className="inline-flex h-11 shrink-0 items-center gap-1.5 rounded-card border border-border-subtle bg-card-background px-2.5 text-micro font-semibold tabular-nums text-foreground" aria-label={t('duel.bar.clock', { time: clock })}>
            <Icon name={snapshot.clock.running ? 'pause' : 'play'} size={14} />
            {clock}
          </span>
          <span className="inline-flex items-center gap-1 rounded-full bg-tint/8 px-2.5 py-1 text-micro font-semibold text-muted" title={t('duel.watch.readOnly')}>
            <Icon name="eye" size={14} />
            {t('duel.watch.badge')}
          </span>
          {snapshot.players < 2 && !result ? (
            <span className="inline-flex items-center gap-1 rounded-full bg-warning/15 px-2.5 py-1 text-micro font-semibold text-warning" role="status">
              <Icon name="pause" size={14} />
              {t('duel.watch.paused')}
            </span>
          ) : null}
          <IconButton tone="flat" size="sm" aria-label={t('duel.room.leave')} title={t('duel.room.leave')} className="ml-auto" onClick={onLeave}>
            <Icon name="x" />
          </IconButton>
        </div>

        <div className="flex flex-wrap items-center gap-1.5">
          {snapshot.turn !== null ? (
            <span className={cx('whitespace-nowrap rounded-full px-2.5 py-1 text-micro font-semibold', 'bg-accent/20 text-accent')}>
              {t('duel.watch.turnOf', { name: nameOf(snapshot.turn) })}
              {phase ? <span data-testid="duel-phase">{` · ${phase}`}</span> : null}
            </span>
          ) : null}
          {online ? null : <span className="text-micro text-warning">{t('duel.status.reconnecting')}</span>}
          {snapshot.players < 2 ? <span className="text-micro text-warning">{t('duel.watch.playerAway')}</span> : null}
        </div>

        {result ? (
          <Callout tone="info" icon="trophy">
            <span role="status">{result.kind === 'draw' ? t('duel.result.draw') : t('duel.watch.won', { name: nameOf(result.loser === 0 ? 1 : 0) })}</span>
          </Callout>
        ) : null}

        {/* En escritorio las cartas se achican hasta que entran las cinco filas, las dos manos y las barras en la pantalla (en el celular el ancho las fija). */}
        <DuelTable mine={bottomView} theirs={topView} turn={snapshot.turn === bottom ? 'mine' : 'theirs'} className="[--cell:max(3rem,min(7rem,calc((100dvh-17rem)/5.2)))]" />
        <TheirHand count={bottomView.handCount ?? 0} />

        <div className="flex items-center justify-between gap-2">
          <span className="flex items-center">
            <IconButton tone="flat" size="sm" aria-label={t('duel.watch.flip')} title={t('duel.watch.flip')} onClick={() => setFlipped((current) => !current)}>
              <Icon name="swap" />
            </IconButton>
            <span className="relative">
              <IconButton tone="flat" size="sm" aria-label={unread > 0 ? `${t('duel.watch.chat')} (${t('duel.chat.unread', { count: unread })})` : t('duel.watch.chat')} title={t('duel.watch.chat')} onClick={() => setChatOpen(true)}>
                <Icon name="chat" />
              </IconButton>
              {unread > 0 ? (
                <span aria-hidden="true" className="pointer-events-none absolute right-0 top-0 grid min-w-4 place-items-center rounded-full bg-accent px-1 text-[0.625rem] font-extrabold leading-4 text-[#06140e]">
                  {unread}
                </span>
              ) : null}
            </span>
          </span>
          <LifeTile name={nameOf(bottom)} life={bottomSide.lp ?? snapshot.settings?.lp ?? 0} mine />
        </div>
      </div>

      <SideDrawer isOpen={chatOpen} onClose={() => setChatOpen(false)} title={t('duel.watch.chat')}>
        <ol role="log" aria-label={t('duel.watch.chat')} className="m-0 grid h-full min-h-0 list-none content-start gap-1.5 overflow-y-auto p-0">
          {snapshot.chat.length === 0 ? (
            <li className="text-micro text-soft">{t('duel.watch.chatEmpty')}</li>
          ) : (
            snapshot.chat.map((line) => (
              <li key={line.id} className="break-words rounded-card bg-tint/8 px-2.5 py-1 text-body text-foreground">
                <span className="block text-micro font-semibold text-soft">{nameOf(line.from)}</span>
                {line.text}
              </li>
            ))
          )}
        </ol>
      </SideDrawer>
    </div>
  )
}
