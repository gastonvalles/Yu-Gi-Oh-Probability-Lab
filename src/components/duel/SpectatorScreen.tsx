import { useCallback, useEffect, useMemo, useRef, useState, type RefObject } from 'react'

import { duelResult } from '../../app/duel-games'
import { DEFAULT_LIMIT_MIN } from '../../app/duel-protocol'
import type { SpectatorSide, SpectatorSnapshot } from '../../app/duel-spectator'
import { duelClockMs, formatClock, type Duelist } from '../../app/life-calculator'
import { duelTurnNumber } from '../../app/duel-turn'
import { isToken } from '../../app/practice-mat'
import { showToastMessage } from '../../app/use-toast-message'
import { DESKTOP_DECK_BUILDER_MEDIA_QUERY, useMediaQuery } from '../../app/use-media-query'
import { useSpectator, type SpectatorConnect } from '../../app/use-duel'
import { useCardFlights } from '../../app/use-card-flights'
import { t } from '../../i18n'
import { ShellMenuButton } from '../shell/ShellMenu'
import { Callout } from '../ui/Callout'
import { cx } from '../ui/cx'
import { Heading } from '../ui/Heading'
import { Icon } from '../ui/Icon'
import { CloseButton, IconButton } from '../ui/IconButton'
import { SideDrawer } from '../ui/SideDrawer'
import { WatchResultBanner } from './DuelBanner'
import { roundClockClass } from './DuelBar'
import { LifeScore } from './LifeScore'
import { PLAYER_COLOR } from './player-color'
import { artOfDrawId } from './duel-art'
import { TURN_WARNING_MS, formatTurnTime, turnTimeLeft } from '../../app/duel-clock'
import { DuelTable, TheirHand, type DuelSideView } from './DuelTable'
import { gameText } from './game-text'
import { RoomRules } from './RoomRules'

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
  // Una sala con reglas automáticas todavía no se puede mirar: al enterarse (con el saludo del anfitrión) se corta la conexión y queda el aviso (de esa sala: otro enlace se mira).
  const [autoRoom, setAutoRoom] = useState<string | null>(null)
  const blocked = autoRoom === room
  const { snapshot, status } = useSpectator({ room: blocked ? null : room, connect })
  const auto = snapshot?.settings?.auto === true

  useEffect(() => {
    if (auto) setAutoRoom(room)
  }, [auto, room])

  if (blocked || auto) {
    return (
      <Screen>
        <Callout tone="warning" icon="alert" action={<CloseButton size="sm" aria-label={t('duel.room.leave')} title={t('duel.room.leave')} onClick={onLeave} />}>
          {t('duel.auto.noWatch')}
        </Callout>
      </Screen>
    )
  }

  if (status === 'full') {
    return (
      <Screen>
        <Callout tone="warning" icon="alert" action={<CloseButton size="sm" aria-label={t('duel.room.leave')} title={t('duel.room.leave')} onClick={onLeave} />}>
          {t('duel.watch.full')}
        </Callout>
      </Screen>
    )
  }

  if (status === 'gone') {
    return (
      <Screen>
        <Callout tone="warning" icon="alert" action={<CloseButton size="sm" aria-label={t('duel.room.leave')} title={t('duel.room.leave')} onClick={onLeave} />}>
          {t('duel.status.gone')}
        </Callout>
      </Screen>
    )
  }

  if (status === 'unsupported') {
    return (
      <Screen>
        <Callout tone="warning" icon="alert" action={<CloseButton size="sm" aria-label={t('duel.room.leave')} title={t('duel.room.leave')} onClick={onLeave} />}>
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

/** Todavía no hay dos mesas (están en la sala): quiénes son y si ya están listos, las reglas, lo que tiran para definir quién empieza y lo que escriben, todo de sólo lectura. */
function WaitingToWatch({ snapshot, online, onLeave }: { snapshot: SpectatorSnapshot; online: boolean; onLeave: () => void }) {
  const names = snapshot.sides.flatMap((side) => (side.name ? [side.name] : []))
  const nameOf = (player: Duelist) => snapshot.sides[player].name ?? (player === 0 ? t('duel.watch.host') : t('duel.watch.guest'))

  return (
    <Screen>
      <div className="flex items-center justify-between gap-3">
        <Heading level="section">{t('duel.watch.title')}</Heading>
        <CloseButton size="md" aria-label={t('duel.room.leave')} title={t('duel.room.leave')} onClick={onLeave} />
      </div>
      {online ? null : <Callout tone="warning" icon="alert">{t('duel.status.reconnecting')}</Callout>}
      <p className="m-0 flex items-center gap-2 text-body text-foreground" role="status">
        <Icon name="user" size={16} />
        {snapshot.players === 0 ? t('duel.watch.waitingPlayers') : names.length === 1 ? t('duel.watch.waitingRival', { name: names[0] }) : names.length > 1 ? t('duel.watch.waitingStart', { names: names.join(t('duel.watch.and')) }) : t('duel.watch.waitingStartNoNames')}
      </p>

      <ul className="m-0 grid list-none grid-cols-2 gap-2 p-0">
        {snapshot.sides.map((side, index) => (
          <li key={index} data-ready={side.ready} className={cx('grid min-w-0 justify-items-center gap-1 rounded-card border px-2 py-3 text-center', side.ready ? 'border-success/60 bg-success/10' : 'border-border-subtle bg-card-background')}>
            <span className="text-micro font-semibold uppercase text-soft">{index === 0 ? t('duel.watch.host') : t('duel.watch.guest')}</span>
            <span className="max-w-full truncate text-body font-bold text-foreground">{side.name ?? t('duel.watch.playerAway')}</span>
            {side.name ? (
              <span className={cx('inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-micro font-semibold', side.ready ? 'bg-success/20 text-success-soft' : 'bg-tint/8 text-muted')}>
                {side.ready ? <Icon name="check" size={12} /> : null}
                {side.ready ? t('duel.opening.ready') : t('duel.opening.notReady')}
              </span>
            ) : null}
          </li>
        ))}
      </ul>

      {snapshot.settings ? <RoomRules settings={snapshot.settings} isPublic={null} /> : null}

      <section aria-label={t('duel.watch.chat')} className="grid gap-2 rounded-card border border-border-subtle bg-card-background p-3">
        <div className="flex items-baseline justify-between gap-2">
          <Heading level="card">{t('duel.watch.chat')}</Heading>
          <span className="text-micro text-muted">{t('duel.watch.readOnlyShort')}</span>
        </div>
        <div className="h-56">
          <WatchChat snapshot={snapshot} nameOf={nameOf} />
        </div>
      </section>
      <p className="m-0 text-micro text-soft">{t('duel.watch.readOnly')}</p>
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

/** Lo que escribieron los jugadores, de sólo lectura: en la hoja del celular y en la columna del costado de escritorio. */
function WatchChat({ snapshot, nameOf }: { snapshot: SpectatorSnapshot; nameOf: (player: Duelist) => string }) {
  return (
    <ol role="log" aria-label={t('duel.watch.chat')} className="m-0 grid h-full min-h-0 list-none content-start gap-1.5 overflow-y-auto p-0">
      {snapshot.feed.length === 0 ? (
        <li className="text-micro text-soft">{t('duel.watch.chatEmpty')}</li>
      ) : (
        snapshot.feed.map((item) =>
          item.kind === 'game' ? (
            // Lo que tiraron (moneda, dado, piedra-papel-tijera, quién empieza): una línea de aviso, no un mensaje de nadie.
            <li key={`g${item.entry.id}`} data-event="game" className="px-1 text-center text-micro text-soft">
              {gameText(item.entry, nameOf)}
            </li>
          ) : (
            <li key={`c${item.line.id}`} data-from={item.line.from === 0 ? 'host' : 'guest'} className={cx('break-words rounded-card px-2.5 py-1 text-body text-foreground', PLAYER_COLOR[item.line.from === 0 ? 'mine' : 'theirs'].bubble)}>
              <span className={cx('block text-micro font-semibold', PLAYER_COLOR[item.line.from === 0 ? 'mine' : 'theirs'].text)}>{nameOf(item.line.from)}</span>
              {item.line.text}
            </li>
          ),
        )
      )}
    </ol>
  )
}

/**
 * Las cartas vuelan también para quien mira, como para los que juegan: las del de abajo con las marcas propias de la mesa y las del de arriba con las del rival. Se
 * monta de nuevo al dar vuelta la mesa (`key`): ahí no vuela nada, sólo se mide de nuevo. La mano del de abajo es de dorsos sin marca: lo que entra o sale de ella no vuela.
 */
function WatchFlights({ containerRef, bottom, top }: { containerRef: RefObject<HTMLElement | null>; bottom: DuelSideView; top: DuelSideView }) {
  useCardFlights(containerRef, bottom.state, bottom.artOf, 'watch')
  useCardFlights(containerRef, top.state, top.artOf, 'watch', 'theirs')

  return null
}

function WatchTable({ snapshot, online, onLeave }: { snapshot: SpectatorSnapshot; online: boolean; onLeave: () => void }) {
  const now = useTick(1000)
  // En escritorio el chat va fijo al costado (como el de los jugadores); en el celular, en una hoja que se abre con el ícono.
  const docked = useMediaQuery(DESKTOP_DECK_BUILDER_MEDIA_QUERY)
  // Desde qué lado se mira: abajo, el anfitrión (o el invitado, dando vuelta la mesa).
  const [flipped, setFlipped] = useState(false)
  const tableRef = useRef<HTMLDivElement | null>(null)
  const [chatOpen, setChatOpen] = useState(false)
  const [read, setRead] = useState(snapshot.feed.length)
  const bottom: Duelist = flipped ? 1 : 0
  const top: Duelist = flipped ? 0 : 1
  const bottomSide = snapshot.sides[bottom]
  const topSide = snapshot.sides[top]
  const bottomView = useMemo(() => sideView(bottomSide), [bottomSide])
  const topView = useMemo(() => sideView(topSide), [topSide])
  const nameOf = (player: Duelist) => snapshot.sides[player].name ?? (player === 0 ? t('duel.watch.host') : t('duel.watch.guest'))
  const unread = chatOpen ? 0 : Math.max(0, snapshot.feed.length - read)
  // El turno del duelo, contado con las dos mesas (la fase la dice la fila de fases del campo).
  const turnNumber = duelTurnNumber(bottomSide.mirror?.state ?? null, topSide.mirror?.state ?? null)
  const roundLimit = snapshot.settings?.limitMin ?? DEFAULT_LIMIT_MIN
  const roundLeft = duelClockMs(snapshot.clock, now, roundLimit)
  const clock = formatClock(roundLeft)
  const result = snapshot.sides[0].lp !== null && snapshot.sides[1].lp !== null ? duelResult([snapshot.sides[0].lp, snapshot.sides[1].lp], snapshot.conceded) : null

  useGameToasts(snapshot)

  // El cartel del final: una vez por cada final (con la revancha, el siguiente vuelve a salir).
  const [endSeen, setEndSeen] = useState(false)
  const closeEnd = useCallback(() => setEndSeen(true), [])
  const hasEnd = snapshot.end !== null

  useEffect(() => {
    if (!hasEnd) setEndSeen(false)
  }, [hasEnd])

  useEffect(() => {
    if (chatOpen) {
      setRead(snapshot.feed.length)
    }
  }, [chatOpen, snapshot.feed.length])

  if (!bottomView || !topView) {
    return null
  }

  return (
    <div className={cx("h-full min-h-0", docked ? "flex" : "overflow-y-auto")}>
      {snapshot.end && !endSeen ? <WatchResultBanner end={snapshot.end} nameOf={nameOf} onLeave={onLeave} onClose={closeEnd} /> : null}
      <div className={cx(docked && "min-w-0 flex-1 overflow-y-auto")}>
        {/* `isolate`: las cartas que vuelan quedan dentro de la mesa, debajo del cartel del final. */}
        <div ref={tableRef} className="isolate mx-auto grid w-full max-w-3xl content-start gap-2 px-2 py-2 min-[1101px]:px-4" data-testid="spectator-table">
          {/* Arriba la fila de los íconos (el reloj, que se mira, «Mirando», dar vuelta la mesa, el chat hasta 1100 px y salir) y el marcador plano, como en los duelos (Gastón, 2026-10-27): las vidas
              del de abajo a la izquierda y las del de arriba a la derecha, con su nombre en su color, y el turno una vez en el medio. Nada de esto se toca para cambiar el duelo. */}
          <div className="flex h-11 min-w-0 items-center gap-1.5">
            <ShellMenuButton className="-ml-2" />
            <span className="inline-flex h-11 shrink-0 items-center gap-1.5 rounded-card border border-border-subtle bg-card-background px-2.5 text-body font-bold" aria-label={t('duel.bar.clock', { time: clock })}>
              <Icon name={snapshot.clock.running ? 'pause' : 'play'} size={16} />
              <span data-testid="round-clock" className={roundClockClass(roundLeft, roundLimit > 0, snapshot.clock.running)}>
                {clock}
              </span>
            </span>
            <span className="inline-flex min-w-0 shrink items-center gap-1 rounded-full bg-tint/8 px-2.5 py-1 text-micro font-semibold text-muted" title={t('duel.watch.readOnly')}>
              <Icon name="eye" size={14} className="shrink-0" />
              <span className="truncate max-[419px]:sr-only">{t('duel.watch.badge')}</span>
            </span>
            <span className="-mr-2 ml-auto flex shrink-0 items-center">
              <IconButton tone="flat" size="sm" aria-label={t('duel.watch.flip')} title={t('duel.watch.flip')} onClick={() => setFlipped((current) => !current)}>
                <Icon name="swap" />
              </IconButton>
              {docked ? null : (
                <span className="relative">
                  <IconButton tone="flat" size="sm" aria-label={unread > 0 ? `${t('duel.watch.chat')} (${t('duel.chat.unread', { count: unread })})` : t('duel.watch.chat')} title={t('duel.watch.chat')} onClick={() => setChatOpen(true)}>
                    <Icon name="chat" />
                  </IconButton>
                  {unread > 0 ? (
                    <span aria-hidden="true" className="pointer-events-none absolute right-0 top-0 grid min-w-4 place-items-center rounded-full bg-primary px-1 text-[0.625rem] font-extrabold leading-4 text-white">
                      {unread}
                    </span>
                  ) : null}
                </span>
              )}
              <IconButton tone="flat" size="sm" aria-label={t('duel.room.leave')} title={t('duel.room.leave')} onClick={onLeave}>
                <Icon name="x" />
              </IconButton>
            </span>
          </div>

          <div data-testid="watch-score" className="flex min-h-11 min-w-0 items-center gap-2 px-1">
            <LifeScore name={nameOf(bottom)} life={bottomSide.lp ?? snapshot.settings?.lp ?? 0} mine color={bottom === 0 ? 'mine' : 'theirs'} />
            <span data-testid="duel-turn" className={cx('min-w-0 flex-1 truncate text-center text-lead font-bold', snapshot.turn === null ? 'text-muted' : PLAYER_COLOR[snapshot.turn === 0 ? 'mine' : 'theirs'].text)}>
              {snapshot.turn !== null ? t('duel.bar.theirTurnN', { name: nameOf(snapshot.turn), turn: turnNumber }) : null}
            </span>
            <LifeScore name={nameOf(top)} life={topSide.lp ?? snapshot.settings?.lp ?? 0} color={top === 0 ? 'mine' : 'theirs'} />
          </div>

          <div className="flex min-w-0 items-center gap-1.5 empty:hidden">
            {/* El reloj de turnos es público: lo que le queda a cada jugador; el que corre, resaltado (y en rojo cuando falta poco). */}
            {snapshot.turn !== null && (snapshot.settings?.turnMin ?? 0) > 0 ? (
              <span role="timer" aria-label={t('duel.turnClock.label', { turn: nameOf(snapshot.turn), left: formatTurnTime(turnTimeLeft(snapshot.turnClock, snapshot.turn, now)), other: nameOf(snapshot.turn === 0 ? 1 : 0), otherLeft: formatTurnTime(turnTimeLeft(snapshot.turnClock, snapshot.turn === 0 ? 1 : 0, now)) })} data-testid="turn-times" className="inline-flex min-w-0 items-center gap-1 text-micro font-semibold tabular-nums">
                {([0, 1] as const).map((side) => {
                  const left = turnTimeLeft(snapshot.turnClock, side, now)
                  const active = snapshot.turn === side && snapshot.turnClock.running === side

                  return (
                    <span key={side} data-active={active ? 'true' : undefined} className={cx('min-w-0 truncate rounded-full px-2 py-1', active ? (left <= TURN_WARNING_MS ? 'bg-danger/20 text-danger-soft' : 'bg-tint/12 text-foreground') : 'text-muted')}>
                      {`${nameOf(side)} ${formatTurnTime(left)}`}
                    </span>
                  )
                })}
              </span>
            ) : null}
          </div>

          {snapshot.players < 2 || !online ? (
            <div className="flex min-w-0 items-center gap-1.5">
              {snapshot.players < 2 && !result ? (
                <span className="inline-flex shrink-0 items-center gap-1 rounded-full bg-warning/15 px-2.5 py-1 text-micro font-semibold text-warning" role="status">
                  <Icon name="pause" size={14} />
                  {t('duel.watch.paused')}
                </span>
              ) : null}
              {online ? null : <span className="min-w-0 truncate text-micro text-warning">{t('duel.status.reconnecting')}</span>}
              {snapshot.players < 2 ? <span className="min-w-0 truncate text-micro text-warning">{t('duel.watch.playerAway')}</span> : null}
            </div>
          ) : null}

          {result ? (
            <Callout tone="info" icon="trophy">
              <span role="status">{result.kind === 'draw' ? t('duel.result.draw') : t('duel.watch.won', { name: nameOf(result.loser === 0 ? 1 : 0) })}</span>
            </Callout>
          ) : null}

          {/* En escritorio (y de 640 a 1100 px, angostando la mesa) las cartas se achican hasta que entran las cinco filas, las dos manos y las barras en la pantalla. En un celular en vertical (menos de 640 px) son siete filas de cinco columnas: la casilla es la que deja ver las dos manos y tus vidas sin scrollear
              (el alto de la pantalla menos 26,9 rem —la barra, el marcador y las dos manos—, en siete; nunca menos de 3 rem) y, si el ancho no alcanza, la del ancho. */}
          <DuelTable mine={bottomView} theirs={topView} turn={snapshot.turn === bottom ? 'mine' : 'theirs'} className="[--cell:max(3rem,min(7rem,calc((100dvh-25.75rem)/5.2)))] max-sm:mx-auto max-sm:w-[min(100%,calc(5*max(3rem,(100dvh_-_26.9rem)/7)_+_1rem))] sm:max-[1101px]:mx-auto sm:max-[1101px]:w-[min(100%,calc(6.3714*max(3rem,(100dvh_-_25.75rem)/5.2)_+_1.5rem))]" />
          <TheirHand count={bottomView.handCount ?? 0} align="start" />

        </div>
      </div>
      {/* Después de la mesa: al montarse ya la encuentra (`tableRef`). */}
      <WatchFlights key={String(flipped)} containerRef={tableRef} bottom={bottomView} top={topView} />

      {docked ? (
        <aside aria-label={t("duel.watch.chat")} className="flex w-80 shrink-0 flex-col border-l border-border-subtle bg-card-background">
          <div className="flex items-baseline justify-between gap-2 border-b border-border-subtle px-4 py-3">
            <Heading level="card">{t("duel.watch.chat")}</Heading>
            <span className="text-micro text-muted">{t("duel.watch.readOnlyShort")}</span>
          </div>
          <div className="min-h-0 flex-1 overflow-hidden px-4 py-3">
            <WatchChat snapshot={snapshot} nameOf={nameOf} />
          </div>
          <p className="m-0 border-t border-border-subtle px-4 py-3 text-micro text-muted">{t("duel.watch.noWrite")}</p>
        </aside>
      ) : (
        <SideDrawer isOpen={chatOpen} onClose={() => setChatOpen(false)} veil={false} title={t("duel.watch.chat")}>
          <WatchChat snapshot={snapshot} nameOf={nameOf} />
        </SideDrawer>
      )}
    </div>
  )
}
