import { useContext, useEffect, useRef, useState, type CSSProperties, type ReactNode } from 'react'

import { duelResult } from '../../app/duel-games'
import { useDuelRails } from '../../app/duel-rails'
import type { Activity } from '../../app/duel-protocol'
import type { Duel, DuelSnapshot } from '../../app/duel-session'
import type { SocketStatus } from '../../app/duel-socket'
import { useHostToasts } from '../../app/toast-box'
import { duelTurnNumber } from '../../app/duel-turn'
import { STARTING_LP, duelClockMs, formatClock } from '../../app/life-calculator'
import { DESKTOP_DECK_BUILDER_MEDIA_QUERY, useMediaQuery } from '../../app/use-media-query'
import { useSwipeAway } from '../../app/use-swipe-away'
import { sacudir } from '../probability/AttackFx'
import { MatMoreMenu, MatUndoContext } from '../probability/MatBarActions'
import { DELTA_MS, LifeHold, useHeldValue, useLifeNumber, useLpDelta, useLpFlash } from '../../app/life-effects'
import { t } from '../../i18n'
import { ShellMenuButton } from '../shell/ShellMenu'
import { Button } from '../ui/Button'
import { Callout } from '../ui/Callout'
import { cx } from '../ui/cx'
import { Icon } from '../ui/Icon'
import { IconButton } from '../ui/IconButton'
import { Modal } from '../ui/Modal'
import type { OverflowItem } from '../ui/OverflowMenu'
import { SideDrawer } from '../ui/SideDrawer'
import { TONE, type Tone } from '../ui/tone'
import { ConfirmDialog } from '../probability/ConfirmDialog'
import { DuelChat, useChatUnread } from './DuelChat'
import type { FeedEntry } from './use-duel-feed'
import { respondersText } from './PassPrompt'
import { ResultStrip } from './DuelResult'
import { LifeScore, SIGNAL_MS } from './LifeScore'
import { PLAYER_COLOR, type PlayerSide } from './player-color'
import { isEmojiSignal } from '../../app/duel-signals'

export { SIGNAL_MS }

/** Un reloj de pared que se actualiza cada `ms` (el reloj de la ronda se calcula contra él). */
function useTick(ms: number): number {
  const [now, setNow] = useState(() => Date.now())

  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), ms)
    return () => clearInterval(id)
  }, [ms])

  return now
}

/** Con cuánto tiempo por delante el reloj del duelo se pone rojo, y cuándo además titila (igual que el número del reloj de turnos). */
const ROUND_LOW_MS = 5 * 60_000
const ROUND_URGENT_MS = 60_000

/** Cómo se ve el número del reloj del duelo: rojo con 5 minutos o menos y titilando con 1 o menos, mientras corre (con un reloj que cuenta para adelante, sin límite, nunca). */
export function roundClockClass(remainingMs: number, limited: boolean, running: boolean): string {
  const low = limited && remainingMs <= ROUND_LOW_MS
  const urgent = limited && running && remainingMs <= ROUND_URGENT_MS

  return cx('tabular-nums', low ? 'text-danger-soft' : 'text-foreground', urgent && 'motion-safe:animate-turn-blink')
}

const STATUS_TEXT: Record<Exclude<SocketStatus, 'open'>, () => string> = {
  connecting: () => t('duel.status.connecting'),
  reconnecting: () => t('duel.status.reconnecting'),
  full: () => t('duel.status.full'),
  gone: () => t('duel.status.gone'),
  closed: () => t('duel.status.closed'),
  unsupported: () => t('duel.status.unsupported'),
}

interface DuelBarProps {
  snapshot: DuelSnapshot
  status: SocketStatus
  turn: 'mine' | 'theirs'
  /** Tu nombre (el de tus vidas en el marcador; arriba dicen «Vos»). */
  myName: string
  onToggleClock: () => void
  onRematch: () => void
  onLeave: () => void
  /** Salir de un duelo en curso es abandonarlo: se rinde y se sale (se pide confirmar). Sin esto, salir sólo deja el duelo en pausa. */
  onAbandon?: () => void
  /** Rendirme: el duelo termina y gana el rival (se pide confirmar). */
  onConcede: () => void
  /** La línea del registro (sólo en el celular): lo último que pasó; tocarla abre el chat con el registro. */
  log?: ReactNode
  /** Volver a conectarme a la sala ya: lo toca cualquiera de los dos si el duelo quedó en pausa por un aviso que no llegó, y el relay vuelve a decirle a cada uno si el otro está. */
  onReconnect: () => void
  /** La tarjeta del resultado está abierta sobre la mesa: la línea de arriba no la repite. */
  resultOpen?: boolean
  /** La señal del rival que está a la vista (pensando, continuá): sale como un globo debajo de sus vidas. */
  rivalSignal?: string | null
  /** Cambia con cada señal del rival (aunque diga lo mismo): su globo vuelve a entrar. */
  rivalSignalKey?: number
  /** Lo que acabás de avisar: sale como un globo debajo de tus vidas (en el marcador, hasta 1100 px). */
  mySignal?: string | null
  mySignalKey?: number
  /** El botón del chat (hasta 1100 px: en escritorio el chat está fijo a la derecha), en la fila de los íconos. */
  chat?: ReactNode
  /** Lo que se apoya sobre la línea del registro (la misma fila, sin sumar alto: el campo no se mueve): un pedido de volver atrás, o cómo terminó el tuyo. */
  lane?: LaneNotice | null
  /** Tocar las vidas (las tuyas o las del rival) abre la calculadora de vidas del duelo. Sin esto no se tocan (el duelo automático: las lleva el núcleo). */
  onOpenLife?: () => void
  /** El turno del duelo, si no sale de las mesas de la sala (el duelo automático: lo cuenta el núcleo y `mine`/`theirs` no existen). */
  turnNumber?: number
  /** Más ajustes al final de «Más opciones» (el duelo automático: las respuestas a la cadena y la casilla). */
  extraSettings?: ReactNode
  /** Por qué terminó, si no es lo que dicen las vidas o la rendición (el duelo automático: sin cartas para robar, el efecto de una carta). */
  resultReason?: string
}

/**
 * Los avisos de atención entre los dos jugadores, que nunca bloquean nada (antes el permiso para volver atrás era un diálogo que tapaba la mesa). Uno a la vez, el más urgente primero:
 * el pedido del rival de volver atrás (hay que contestar), el tuyo (esperando), cómo terminó y, lo último, lo que está haciendo el rival (mira su deck o su Extra Deck, elige cómo jugar una carta).
 */
export type LaneNotice =
  | { kind: 'looking'; what: Activity }
  | { kind: 'undoAsked'; onAllow: () => void; onDeny: () => void }
  | { kind: 'undoAsking' }
  | { kind: 'undoResult'; result: 'denied' | 'expired' }
  | { kind: 'passAsking' }
  | { kind: 'passHeld' }
  /** El rival activó una carta o un efecto y estas cartas mías podrían responder (`app/mat-responders.ts`: avisa, no decide). */
  | { kind: 'chain'; card: string; /** El lugar del efecto que activó, si eligió uno entre varios. */ effect?: number; names: readonly string[] }
  /** Un aviso ya armado (el duelo automático: la cadena, «No responder»): con botones se contesta y va enmarcado en ámbar; sin botones sólo informa. La principal va al final. */
  | { kind: 'ask'; text: string; actions: ReadonlyArray<{ label: string; onSelect: () => void; primary?: boolean }> }
  /** El otro lado está trabajando (el núcleo resuelve, el rival elige): el punto que late y, pasados `THINKING_CANCEL_MS`, «Cancelar» si se puede. */
  | { kind: 'thinking'; /** Lo que dice, si no es «El núcleo está resolviendo…». */ text?: string; onCancel?: () => void; /** Lo que dice el botón, si no es «Cancelar» («Cancelar pedido»). */ cancelLabel?: string }

/** Cuánto espera «Cancelar» para aparecer mientras el núcleo resuelve: lo rápido no parpadea. */
export const THINKING_CANCEL_MS = 1500

/**
 * Lo que va en el lateral izquierdo debajo de las vidas (los avisos): se corre de lo que el campo agrandado se mete en el lateral (`--field-overhang`, lo mide la mesa), hasta dejarle 11 rem;
 * con menos, se apoya sobre el borde del campo, por encima (`z-20` en el contenedor). Antes el aviso ocupaba todo el lateral y la mesa en perspectiva lo tapaba (Gastón, 2026-10-24).
 * La caja (todo el lateral, encima del campo agrandado) no ataja toques, sólo lo que lleva adentro (`pointer-events-none *:pointer-events-auto`): aun vacía, tapaba el Extra Deck, el Field y el Banish del rival (Gastón, 2026-10-25).
 */
export const RAIL_LANE_STYLE: CSSProperties = { paddingRight: 'min(var(--field-overhang, 0px), max(0px, 100% - 11rem))' }
/** Lo mismo para el lateral derecho (el resultado). */
export const RAIL_RESULT_STYLE: CSSProperties = { paddingLeft: 'min(var(--field-overhang, 0px), max(0px, 100% - 11rem))' }

/** Qué dice el aviso de lo que hace el rival, según lo que sea. */
const LOOK_TEXT = {
  deck: 'duel.look.deck',
  extra: 'duel.look.extra',
  gy: 'duel.look.gy',
  banished: 'duel.look.banished',
  choosing: 'duel.look.choosing',
} as const satisfies Record<Activity, string>

/** Lo que dice cada aviso de la línea (volver atrás, pasar de fase), según de quién y cómo vaya. La pregunta del rival de pasar de fase no va acá: va en el medio de la pantalla (`PassPrompt`). */
function laneText(lane: Exclude<LaneNotice, { kind: 'looking' }>, name: string): string {
  switch (lane.kind) {
    case 'undoAsked':
      return t('duel.undo.askShort', { name })
    case 'undoAsking':
      return t('duel.undo.asking', { name })
    case 'undoResult':
      return t(lane.result === 'denied' ? 'duel.undo.denied' : 'duel.undo.expired', { name })
    case 'passAsking':
      return t('duel.pass.asking', { name })
    case 'passHeld':
      return t('duel.pass.held', { name })
    case 'chain':
      return lane.effect === undefined ? t('duel.chain.hint', { name, card: lane.card, cards: respondersText(lane.names) }) : t('duel.chain.hintEffect', { name, card: lane.card, n: lane.effect + 1, cards: respondersText(lane.names) })
    case 'ask':
      return lane.text
    case 'thinking':
      return lane.text ?? t('auto.lane.thinking')
  }
}

/** «Cancelar» de lo que se está resolviendo: aparece recién a los `THINKING_CANCEL_MS` (montado de nuevo, vuelve a esperar). */
function ThinkingCancel({ onCancel, label }: { onCancel: () => void; label?: string | undefined }) {
  const [shown, setShown] = useState(false)

  useEffect(() => {
    const timer = window.setTimeout(() => setShown(true), THINKING_CANCEL_MS)

    return () => window.clearTimeout(timer)
  }, [])

  return shown ? (
    <Button variant="tertiary" size="sm" onClick={onCancel}>
      {label ?? t('common.cancel')}
    </Button>
  ) : null
}

/** El aviso sobre la línea del registro: el pedido de volver atrás (del rival, o el tuyo), tu pregunta de pasar de fase y cómo terminó. No tapa el campo ni la mano y no bloquea nada. */
export function LaneBanner({ lane, rivalName, rail = false }: { lane: LaneNotice; rivalName: string; /** En un lateral: ocupa el alto que necesite, en vez de la fila de la línea del registro. */ rail?: boolean }) {
  const place = rail ? 'flex-wrap py-2' : 'absolute inset-0 max-sm:pointer-events-auto'
  // En la fila de la línea del registro, dos renglones a lo sumo; en un lateral (angosto), los que necesite, y una palabra larga se parte en vez de salirse.
  const text = cx('min-w-0 flex-1', rail ? '[overflow-wrap:anywhere]' : 'line-clamp-2')

  if (lane.kind === 'looking') {
    return (
      <div role="status" data-lane="looking" className={cx(place, 'flex items-center gap-2 rounded-card border border-border-subtle bg-card-background px-3 text-micro font-semibold leading-tight text-muted')}>
        <Icon name="eye" size={16} className="shrink-0 text-info-soft" />
        <span className={text}>{t(LOOK_TEXT[lane.what], { name: rivalName })}</span>
      </div>
    )
  }

  // Lo que hay que contestar va enmarcado en ámbar.
  const asked = lane.kind === 'undoAsked' || (lane.kind === 'ask' && lane.actions.length > 0)

  return (
    <div role="status" data-lane={lane.kind} className={cx(place, 'flex items-center gap-2 rounded-card border bg-card-background px-3 text-micro font-semibold leading-tight', asked ? 'border-info text-foreground' : 'border-border-subtle text-muted')}>
      {lane.kind === 'thinking' ? <i aria-hidden="true" className="size-2 shrink-0 rounded-full bg-info motion-safe:animate-pulse" /> : null}
      <span className={text} title={laneText(lane, rivalName)}>
        {laneText(lane, rivalName)}
      </span>
      {/* Los botones, al lado del texto; en un lateral, en su renglón, debajo y a la derecha (al lado, el texto quedaba de una palabra por renglón y el botón encima). Sin botones (o con «Cancelar» todavía esperando) no ocupa lugar. */}
      <span className={cx('flex shrink-0 items-center gap-2 empty:hidden', rail && 'basis-full flex-wrap justify-end')}>
        {lane.kind === 'undoAsked' ? (
          <>
            <Button variant="tertiary" size="sm" onClick={lane.onDeny}>
              {t('duel.undo.deny')}
            </Button>
            <Button variant="primary" size="sm" onClick={lane.onAllow}>
              {t('duel.undo.allow')}
            </Button>
          </>
        ) : null}
        {lane.kind === 'ask'
          ? lane.actions.map((action) => (
              <Button key={action.label} variant={action.primary ? 'primary' : 'tertiary'} size="sm" onClick={action.onSelect}>
                {action.label}
              </Button>
            ))
          : null}
        {lane.kind === 'thinking' && lane.onCancel ? <ThinkingCancel onCancel={lane.onCancel} label={lane.cancelLabel} /> : null}
      </span>
    </div>
  )
}

/** Los avisos de la conexión y del rival se apoyan debajo de la barra (no la empujan): el campo no se mueve cuando aparecen o se van. */
const ALERT_OVERLAY = 'absolute inset-x-0.5 top-full z-20 mt-1'

/**
 * La barra de arriba de un duelo por enlace (manual y automático), hermana de `AutoBar` (Gastón, 2026-10-27: sin placas ni barra de abajo). Arriba, el reloj de la ronda (tocarlo lo pausa) y los
 * íconos: el chat (hasta 1100 px), deshacer (`MatUndoContext`: lo arma la mesa), el ⋯ y salir (pide confirmación). Hasta 1100 px, debajo, el marcador plano: tus vidas, el turno dicho una sola vez
 * («Turno de Ana · 3», en el color de quién es; la fase la dice sólo el botón del campo) y las del rival (`LifeScore`: en el manual se tocan y abren la calculadora), y la línea del registro. En escritorio
 * cada vida va en su esquina (las pone la pantalla: `RivalLife` en `corner` y `DuelLife` en `life`) y el turno debajo de los íconos; con laterales, las del rival en el izquierdo.
 */
export function DuelBar({ snapshot, status, turn, myName, onToggleClock, onRematch, onLeave, onAbandon, onConcede, onReconnect, log, resultOpen = false, rivalSignal = null, rivalSignalKey, mySignal = null, mySignalKey, chat, lane = null, onOpenLife, turnNumber = duelTurnNumber(snapshot.mine, snapshot.theirs?.state ?? null), extraSettings, resultReason }: DuelBarProps) {
  const now = useTick(1000)
  const [leaving, setLeaving] = useState(false)
  const [conceding, setConceding] = useState(false)
  // Reconectar, Rendirse y Salir se tocan poco (y los dos últimos arruinan un duelo si se aprietan sin querer): en el celular van juntos detrás de un solo botón; en escritorio, a la vista.
  const docked = useMediaQuery(DESKTOP_DECK_BUILDER_MEDIA_QUERY)
  const rails = useDuelRails()
  // Con laterales, los avisos de toda la app se apoyan en el medio del lateral izquierdo.
  const toastHost = useRef<HTMLDivElement | null>(null)

  useHostToasts(toastHost, rails)
  const [moreOpen, setMoreOpen] = useState(false)
  // Con un aviso puesto sobre la línea del registro, esa línea no se ve (la misma fila: el campo no se mueve).
  const laneOpen = lane !== null
  const { life, me, peerPresent } = snapshot
  const rivalName = snapshot.peerName ?? t('duel.bar.rival')
  const running = life.timer.running
  const roundLeft = duelClockMs(life.timer, now, snapshot.settings.limitMin)
  const clock = formatClock(roundLeft)
  const result = duelResult(life.lp, snapshot.conceded)
  // Con el rival presente y el duelo sin terminar, salir es abandonar: se pierde. Con el rival ausente (se cayó) o el duelo terminado, sólo se sale.
  const abandoning = result === null && peerPresent && onAbandon !== undefined
  const undo = useContext(MatUndoContext)
  // El turno, una sola vez (sin la píldora de la fase: la dice el botón del campo).
  const turnLine = (className: string) => (
    <span data-testid="duel-turn" className={cx('min-w-0 truncate text-lead font-bold', turn === 'mine' ? 'text-accent' : 'text-info-soft', className)}>
      {turn === 'mine' ? t('duel.bar.yourTurnN', { turn: turnNumber }) : t('duel.bar.theirTurnN', { name: rivalName, turn: turnNumber })}
    </span>
  )
  const myLife = <DuelLife snapshot={snapshot} myName={myName} onOpen={onOpenLife} signal={mySignal} signalKey={mySignalKey} />
  const rivalLife = (size: 'sm' | 'lg', align: 'start' | 'end') => <RivalLife snapshot={snapshot} onOpen={onOpenLife} signal={rivalSignal} signalKey={rivalSignalKey} size={size} align={align} />

  const dialogs = (
    <>
      {/* «Opciones del duelo» del ⋯ (el duelo automático: las respuestas a la cadena y la casilla). */}
      {extraSettings ? (
        <Modal isOpen={moreOpen} onClose={() => setMoreOpen(false)} size="keypad" veil={false} title={t('duel.bar.more')} ariaLabel={t('duel.bar.more')}>
          <div className="grid gap-4">{extraSettings}</div>
        </Modal>
      ) : null}

      <ConfirmDialog
        veil={false}
        isOpen={conceding}
        title={t('duel.bar.concedeTitle')}
        description={t('duel.bar.concedeText', { name: rivalName })}
        confirmLabel={t('duel.bar.concede')}
        cancelLabel={t('duel.bar.keepPlaying')}
        confirmColor="danger"
        onCancel={() => setConceding(false)}
        onConfirm={() => {
          setConceding(false)
          onConcede()
        }}
      />

      <ConfirmDialog
        veil={false}
        isOpen={leaving}
        title={abandoning ? t('duel.bar.abandonTitle') : t('duel.bar.leaveTitle')}
        description={abandoning ? t('duel.bar.abandonText', { name: rivalName }) : result !== null ? t('duel.bar.leaveDoneText') : t('duel.bar.leaveText')}
        confirmLabel={abandoning ? t('duel.bar.abandonConfirm') : result !== null ? t('duel.bar.leaveNow') : t('duel.bar.leaveConfirm')}
        cancelLabel={t('duel.bar.keepPlaying')}
        confirmColor="danger"
        onCancel={() => setLeaving(false)}
        onConfirm={() => {
          setLeaving(false)
          if (abandoning) onAbandon?.()
          else onLeave()
        }}
      />
    </>
  )
  // La barra (Gastón, 2026-10-26: «muchos íconos juntos»): a la vista el ⋯ y salir; en el ⋯, «La mesa» (la vista 3D, los sonidos, la ventana grande) y lo del duelo: reconectar (lo tocan los dos y el
  // duelo sigue en cuanto el relay le dice a cada uno que el otro está), rendirme (pide confirmar; terminado el duelo, o sin rival, no hay a quién) y, en el automático, sus opciones. Antes, el chat y deshacer.
  const actions = (
    <>
      <MatMoreMenu
        items={[
          { group: t('practice.mat.groupDuel'), label: t('duel.bar.reconnect'), icon: 'refresh', hint: t('duel.bar.reconnectHint'), onSelect: onReconnect },
          { label: t('duel.bar.concede'), icon: 'flag', disabled: Boolean(result) || !peerPresent, onSelect: () => setConceding(true) },
          ...(extraSettings ? [{ label: t('duel.bar.options'), icon: 'gear', opens: true, onSelect: () => setMoreOpen(true) } satisfies OverflowItem] : []),
        ]}
      />
      <IconButton tone="flat" size="sm" aria-label={t('duel.bar.leave')} title={t('duel.bar.leave')} onClick={() => setLeaving(true)}>
        <Icon name="x" />
      </IconButton>
    </>
  )
  // El reloj de la ronda: tocarlo lo pausa.
  const clockButton = (
    <button
      type="button"
      aria-label={`${t('duel.bar.clock', { time: clock })}. ${running ? t('duel.bar.clockPause') : t('duel.bar.clockStart')}`}
      title={running ? t('duel.bar.clockPause') : t('duel.bar.clockStart')}
      className="inline-flex h-11 min-w-0 shrink cursor-pointer items-center gap-1.5 rounded-card border border-border-subtle bg-card-background px-2.5 text-body font-bold focus-visible:outline-none focus-visible:shadow-focus max-[339px]:px-1.5 max-[339px]:text-micro min-[1101px]:text-lead max-[339px]:[&>svg]:hidden min-[1101px]:shrink-0 min-[1101px]:px-2.5"
      onClick={onToggleClock}
    >
      {/* El cronómetro; en pausa, la pausa (el estado se ve sin tocar). */}
      <Icon name={running ? 'timer' : 'pause'} size={18} />
      <span data-testid="round-clock" className={roundClockClass(roundLeft, snapshot.settings.limitMin > 0, running)}>
        {clock}
      </span>
    </button>
  )
  // Cuántos miran y cómo va el Match (en el marcador, debajo del turno y más bajos: el marcador no crece).
  const hasChips = snapshot.watchers > 0 || snapshot.series.match
  const chips = (pad = 'py-1') => (
    <>
      {snapshot.watchers > 0 ? (
        <span className={cx('inline-flex shrink-0 items-center gap-1 whitespace-nowrap rounded-full bg-tint/8 px-2.5 text-micro font-semibold tabular-nums text-muted', pad)} title={t('duel.room.watchers', { count: snapshot.watchers })} aria-label={t('duel.room.watchers', { count: snapshot.watchers })}>
          <Icon name="eye" size={14} />
          {snapshot.watchers}
        </span>
      ) : null}
      {snapshot.series.match ? (
        <span className={cx('shrink-0 whitespace-nowrap rounded-full bg-tint/8 px-2.5 text-micro font-semibold tabular-nums text-muted', pad)} data-testid="duel-series">
          {t('duel.series.chip', { game: snapshot.series.game, mine: snapshot.series.wins[me], theirs: snapshot.series.wins[me === 0 ? 1 : 0] })}
        </span>
      ) : null}
    </>
  )
  const alert =
    status !== 'open' ? (
      <Callout className={ALERT_OVERLAY} tone="warning" icon="alert">{STATUS_TEXT[status]()}</Callout>
    ) : !peerPresent ? (
      <Callout className={ALERT_OVERLAY} tone="info">{t('duel.peer.absent')}</Callout>
    ) : null

  // Con laterales (escritorio ancho): la barra se reparte a los costados del campo. Izquierda: las vidas del rival, el reloj de la ronda y, en el medio, los avisos (lo que hace el rival, un pedido de volver atrás, la conexión) y los
  // avisos de toda la app (`useHostToasts`). Derecha: los íconos, el turno y el resultado (tus vidas, abajo: las pone la mesa). Sus piezas se acomodan en la grilla de la mesa (`col-start` / `row-start`).
  if (rails) {
    return (
      <>
        <div className="col-start-1 row-start-1 flex min-w-0 flex-col items-start gap-2">
          {rivalLife('lg', 'start')}
          {clockButton}
          <span className="flex flex-wrap items-center gap-1.5 empty:hidden">{chips()}</span>
        </div>
        <div className="col-start-3 row-start-1 flex min-w-0 flex-col items-end gap-3">
          <span className="-mr-2 flex flex-wrap items-center justify-end">
            {undo}
            {actions}
          </span>
          {turnLine('max-w-full text-right')}
        </div>
        <div ref={toastHost} data-testid="duel-rail-notices" className="pointer-events-none relative z-20 col-start-1 row-start-2 flex min-h-0 flex-col items-stretch gap-2 pt-4 *:pointer-events-auto" style={RAIL_LANE_STYLE}>
          {lane ? <LaneBanner lane={lane} rivalName={rivalName} rail /> : null}
          {status !== 'open' ? (
            <Callout tone="warning" icon="alert">{STATUS_TEXT[status]()}</Callout>
          ) : !peerPresent ? (
            <Callout tone="info">{t('duel.peer.absent')}</Callout>
          ) : null}
        </div>
        {result && !resultOpen ? (
          <div className="pointer-events-none relative z-20 col-start-3 row-start-2 flex min-h-0 flex-col items-stretch pt-4 *:pointer-events-auto" style={RAIL_RESULT_STYLE}>
            <ResultStrip result={result} snapshot={snapshot} rival={rivalName} onRematch={onRematch} reason={resultReason} rail />
          </div>
        ) : null}
        {dialogs}
      </>
    )
  }

  // Escritorio sin laterales: una sola fila. A la izquierda el reloj (y los chips); a la derecha deshacer, el ⋯ y salir y, debajo, el turno. Las vidas van en las esquinas del campo (las pone la
  // pantalla) y el aviso, centrado debajo de la barra.
  if (docked) {
    return (
      <div className="relative flex items-center gap-1.5 px-0.5 pt-1.5">
        {clockButton}
        <span className="flex min-w-0 items-center gap-1.5 empty:hidden">{chips()}</span>
        {result && !resultOpen ? (
          <div className="min-w-0 shrink">
            <ResultStrip result={result} snapshot={snapshot} rival={rivalName} onRematch={onRematch} reason={resultReason} />
          </div>
        ) : null}
        {/* Sin aire entre los íconos y el turno (y su renglón justo): la barra no suma alto y la columna no scrollea a 1440 × 900. */}
        <div className="ml-auto flex min-w-0 flex-col items-end">
          <span className="-mr-1 flex items-center">
            {undo}
            {actions}
          </span>
          {turnLine('max-w-full leading-tight')}
        </div>
        {lane ? (
          <div className="absolute left-1/2 top-full z-20 mt-1 h-11 w-[min(24rem,100%)] -translate-x-1/2">
            <LaneBanner lane={lane} rivalName={rivalName} />
          </div>
        ) : null}
        {alert}
        {dialogs}
      </div>
    )
  }

  return (
    // Hasta 1100 px: arriba la fila de los íconos (la hamburguesa, el reloj y, a la derecha, el chat, deshacer, el ⋯ y salir: a 360 px entran 304 px), debajo el marcador y la línea del registro
    // (en el celular flota sobre el borde de arriba de la mano del rival: no ocupa lugar).
    <div className="relative flex flex-col gap-1.5 px-0.5 pt-1.5">
      <div className="flex h-11 min-w-0 items-center gap-1.5 max-[339px]:gap-1">
        {/* La hamburguesa del armazón va acá: una sola barra arriba, la de la mesa. */}
        <ShellMenuButton className="-ml-2 size-10! max-[339px]:size-8!" />
        {clockButton}
        <span className="-mr-2 ml-auto flex shrink-0 items-center">
          {chat}
          {undo}
          {actions}
        </span>
      </div>
      {/* El marcador, plano (Gastón, 2026-10-27, como en «Jugar solo automático»): «VOS 8000 · Turno de Ana · 3 · ANA 8000». Las vidas son botones de 44 px en el manual (la calculadora); los chips de
          quién mira y del Match, debajo del turno, sin agrandarlo. */}
      <div data-testid="duel-score" className="flex min-h-11 min-w-0 items-center gap-2 px-1">
        {myLife}
        <span className="grid min-w-0 flex-1 justify-items-center gap-0.5">
          {turnLine('max-w-full text-center leading-tight')}
          {hasChips ? <span className="flex max-w-full items-center justify-center gap-1.5 overflow-hidden">{chips('py-0')}</span> : null}
        </span>
        {rivalLife('sm', 'end')}
      </div>

      {/* Lo que pasó va debajo del marcador. Un aviso se apoya sobre esa línea (la misma fila, sin sumar alto: el campo no se mueve). En un celular en vertical la línea no ocupa lugar (`-mb-11`): flota
          sobre el borde de arriba de la mano del rival, así no queda una franja vacía cuando todavía no pasó nada (Gastón, 2026-10-20: «evita el espacio muerto»). Con el resultado puesto, la tira ocupa
          este mismo lugar: la mesa no se corre cuando termina el duelo. */}
      {log ? (
        <div className={cx('relative max-sm:pointer-events-none max-sm:z-20 max-sm:-mb-11', Boolean(result) && !resultOpen && 'hidden')}>
          <div inert={laneOpen} className={cx(laneOpen && 'invisible')}>
            {log}
          </div>
          {lane ? <LaneBanner lane={lane} rivalName={rivalName} /> : null}
        </div>
      ) : null}
      {result && !resultOpen ? (
        <div className="max-sm:relative max-sm:z-20 max-sm:-mb-11">
          <ResultStrip result={result} snapshot={snapshot} rival={rivalName} onRematch={onRematch} reason={resultReason} />
        </div>
      ) : null}

      {alert}
      {dialogs}
    </div>
  )
}

interface DuelChatToggleProps {
  snapshot: DuelSnapshot
  myName: string
  onSendChat: Duel['sendChat']
  /** El registro del duelo mezclado con lo escrito. */
  feed: readonly FeedEntry[]
  /** Abierto o cerrado lo decide la pantalla: la línea del registro también lo abre. */
  open: boolean
  onOpen: () => void
  onClose: () => void
}

/** El botón del chat del celular, con un contador de lo que no leíste, y el panel que se abre por la derecha (con el registro de jugadas). */
export function DuelChatToggle({ snapshot, myName, onSendChat, feed, open, onOpen, onClose }: DuelChatToggleProps) {
  const unread = useChatUnread(snapshot, open)
  const rivalName = snapshot.peerName ?? t('duel.bar.rival')

  return (
    <>
      <span className="relative">
        <IconButton tone="flat" size="sm" aria-label={unread > 0 ? `${t('duel.chat.open')} (${t('duel.chat.unread', { count: unread })})` : t('duel.chat.open')} title={t('duel.chat.open')} aria-expanded={open} className="hover:text-info! active:text-info! aria-expanded:text-info!" onClick={onOpen}>
          <Icon name="chat" />
        </IconButton>
        {unread > 0 ? (
          <span aria-hidden="true" className="pointer-events-none absolute right-0 top-0 grid min-w-4 place-items-center rounded-full bg-primary px-1 text-[0.625rem] font-extrabold leading-4 text-white">
            {unread}
          </span>
        ) : null}
      </span>

      <SideDrawer isOpen={open} onClose={onClose} veil={false} title={t('duel.chat.title', { name: rivalName })}>
        <DuelChat snapshot={snapshot} myName={myName} onSend={onSendChat} feed={feed} fill />
      </SideDrawer>
    </>
  )
}

interface DuelLogTickerProps {
  feed: readonly FeedEntry[]
  onOpen: () => void
}

/**
 * Las dos últimas jugadas del registro (lo último que pasó, con el punto del color de quien lo hizo), sobre el campo en el celular. Lo escrito no sale acá (Gastón, 2026-10-20: «el mensaje de arriba no debe
 * aparecer, no es necesario»): al otro le llega como un mensaje entrante y en el contador del chat, y en la línea salía dos veces. Tocarla abre el chat con el registro entero. Sin nada que mostrar deja el lugar reservado.
 * **Se saca con el dedo** (Gastón, 2026-10-21: «estos carteles no los puedo swipear para eliminarlos y debería poder»): arrastrarla de costado la manda para ese lado (`useSwipeAway`; con teclado, Supr);
 * queda el lugar reservado y la próxima jugada la vuelve a mostrar, con lo nuevo solo.
 */
export function DuelLogTicker({ feed, onOpen }: DuelLogTickerProps) {
  const events = feed.filter((entry): entry is Extract<FeedEntry, { kind: 'event' }> => entry.kind === 'event')
  // Lo último que había cuando se sacó el cartel: lo que viene después es lo que se muestra.
  const [seen, setSeen] = useState<string | null>(null)
  const lines = events.slice(seen === null ? 0 : events.findIndex((entry) => entry.id === seen) + 1).slice(-2)
  const swipe = useSwipeAway(() => setSeen(events.at(-1)?.id ?? null))

  // Sin nada todavía se reserva el lugar: la primera jugada no corre el campo (regla 7 del sistema de diseño).
  if (lines.length === 0) return <div aria-hidden="true" className="min-h-11" />

  return (
    <button
      type="button"
      aria-label={`${t('duel.log.open')}: ${lines[lines.length - 1]!.text}`}
      aria-keyshortcuts="Delete"
      title={t('duel.log.dismiss')}
      className="flex min-h-11 w-full min-w-0 cursor-pointer touch-pan-y items-center gap-2 rounded-control px-1 text-left transition-[transform,opacity] duration-150 ease-out focus-visible:outline-none focus-visible:shadow-focus motion-reduce:transition-none max-sm:pointer-events-auto max-sm:bg-background/85"
      style={swipe.style}
      {...swipe.props}
      onClick={onOpen}
    >
      <span className="grid min-w-0 flex-1 gap-0.5">
        {lines.map((line) => (
          <span key={line.id} className="flex min-w-0 items-center gap-2 text-micro text-muted">
            <i aria-hidden="true" className={cx('size-1.5 shrink-0 rounded-full', line.side === 'mine' ? 'bg-accent' : 'bg-info')} />
            <span className="min-w-0 truncate">{line.text}</span>
          </span>
        ))}
      </span>
      <Icon name="chevrons-left" size={16} className="shrink-0 rotate-90 text-soft" />
    </button>
  )
}

/** Tus puntos de vida, planos (`LifeScore`): en el marcador de la barra hasta 1100 px y en tu esquina (o tu lateral) en escritorio. Se tocan para abrir la calculadora (sincronizada con el duelo, sin salir de él). */
export function DuelLife({ snapshot, myName, onOpen, signal = null, signalKey, size = 'sm' }: { snapshot: DuelSnapshot; myName: string; /** Sin esto no se tocan (el duelo automático: las lleva el núcleo). */ onOpen?: (() => void) | undefined; /** Lo que acabás de avisar (pensando, todo bien): un globo junto a tus vidas. */ signal?: string | null; signalKey?: number | undefined; size?: 'sm' | 'lg' }) {
  return <LifeScore name={myName || t('duel.bar.you')} label={t('duel.bar.you')} life={snapshot.life.lp[snapshot.me]} mine size={size} onClick={onOpen} bubble={signal} bubbleKey={signalKey} />
}

/** Los puntos de vida del rival, planos: en el marcador (a la derecha), en la esquina de arriba a la derecha del campo (escritorio) o en el lateral izquierdo. Se tocan igual que los tuyos. */
export function RivalLife({ snapshot, onOpen, signal = null, signalKey, size = 'sm', align = 'end' }: { snapshot: DuelSnapshot; onOpen?: (() => void) | undefined; /** Su señal (pensando, continuá): un globo debajo de sus vidas. */ signal?: string | null; signalKey?: number | undefined; size?: 'sm' | 'lg'; align?: 'start' | 'end' }) {
  return <LifeScore name={snapshot.peerName ?? t('duel.bar.rival')} life={snapshot.life.lp[snapshot.me === 0 ? 1 : 0]} size={size} align={align} onClick={onOpen} bubble={signal} bubbleKey={signalKey} />
}

/**
 * Las vidas de un jugador, una placa (Gastón, 2026-10-26: «la vida de ambos jugadores junta y con estética plana»; el anillo se probó en 2026-10-19 y no le gustó): la chapa del dueño rellena y honda con el
 * texto blanco (violeta la tuya y la del rival, con su aro), las cartas de la mano a su lado (`hand`, «▯ 5»), el número blanco y grande que cuenta hasta el valor nuevo (se tiñe de verde o de rojo un instante al
 * subir o bajar; en 0, rojo) con la diferencia («−1000») al lado, y debajo la **barra de 8000** en el color del dueño (en rojo con un cuarto o menos): la excepción escrita a «los porcentajes son anillos», sólo
 * para las vidas (`role="meter"`). En escritorio, además, el **corazón** que cambia de color con la salud (verde con más de la mitad, ámbar hasta un cuarto, rojo debajo) y late al cambiar. Flota sobre la mesa
 * (`life-plate`: relieve tonal, la mesa es la excepción a «sin brillos»). Al bajar se sacude como en el impacto. Tocarla abre la calculadora (`onClick`).
 * - Tamaños: en escritorio, el número a 33 px, con el corazón y 72 px de alto (`compact`: 56, sin corazón y del ancho justo, para no tapar la mano del rival en una mesa angosta); en el
 *   celular, 56 px, el número a 24 y sin corazón (`compact` debajo de 380 px: a 19 y 64 de mínimo, para que la del rival no roce su último dorso a 360). Miden lo que medían las de antes: nada se corre.
 * - Usos: ninguno en la app desde el marcador plano (2026-10-27: `LifeScore` en todos los duelos y en quien mira); queda en el catálogo (`/playground`).
 */
export function LifeTile({ name, label, life: real, mine = false, color, bubble = null, bubbleKey, onClick, compact = false, hand, handOnDesktop = false }: {
  /** Cuántas cartas tiene en la mano: junto a la chapa («▯ 5») y en lo que oye el lector de pantalla («5 cartas en la mano»). */
  hand?: number
  /** Las cartas de la mano a la vista sólo en escritorio (lo oye igual el lector de pantalla): la del rival en el celular va pegada a sus dorsos, que ya se cuentan, y así no los tapa. */
  handOnDesktop?: boolean
  /** 56 px de alto y sin corazón también en escritorio (las esquinas de «Jugar solo automático»: la tuya sube sobre tu mano sin taparla y la del rival no tapa la suya). */
  compact?: boolean
  name: string; /** Lo que dice la chapa, si no es el nombre (tus vidas dicen «Vos»; el nombre queda para el lector de pantalla). */ label?: string; life: number; mine?: boolean; /** Un aviso que sale un instante junto a las vidas, con el color de su dueño: el rival, debajo; el propio, arriba. */ bubble?: string | null; /** Cambia con cada señal (aunque diga lo mismo): el globo vuelve a entrar. */ bubbleKey?: number; /** De qué jugador es el color (por defecto, el tuyo si es "mine"): quien mira pone el suyo a cada uno. */ color?: PlayerSide; onClick?: () => void }) {
  // `data-lp`: a qué casilla va la espada de un ataque directo (ver `measureStrike`).
  const side = mine ? 'mine' : 'theirs'
  const tone = PLAYER_COLOR[color ?? side]
  // Las que se ven: las de verdad, salvo mientras un ataque todavía no golpeó (`LifeHold`).
  const life = useHeldValue(real, useContext(LifeHold))
  const shown = useLifeNumber(life)
  const flash = useLpFlash(life)
  const change = useLpDelta(life)
  // Al bajar, la casilla se sacude como en el impacto (`sacudir`: no se suma a la de un ataque que ya la sacude).
  const tile = useRef<HTMLElement | null>(null)
  const setTile = (node: HTMLElement | null) => {
    tile.current = node
  }

  useEffect(() => {
    const shake = change && change.delta < 0 && tile.current ? sacudir(tile.current, 'life') : null

    return () => shake?.cancel()
  }, [change])
  const ratio = Math.min(1, Math.max(0, life / STARTING_LP))
  const health: Tone = ratio > 0.5 ? 'success' : ratio > 0.25 ? 'warning' : 'danger'
  // En escritorio, 72 px de alto (`compact`: 56, lo que medían las esquinas del automático: la tuya sube sólo 12 px sobre la mano y no la tapa).
  const tall = !compact
  const lifeOf = t('duel.bar.lifeOf', { name })
  const body = (
    <>
      <span key={change?.key ?? 'idle'} aria-hidden="true" className={cx('shrink-0', compact ? 'hidden' : 'max-[1101px]:hidden', TONE[health].text, change && 'animate-pop motion-reduce:animate-none')}>
        <Icon name="heart" size={28} variant="bold" />
      </span>
      <span className={cx('grid min-w-0 flex-1 content-center gap-0.5', tall && 'min-[1101px]:gap-1')}>
        <span className="flex min-w-0 items-center justify-between gap-1.5">
          {/* La chapa no ensancha la placa: el rival por defecto lleva su forma corta («Opp.») y en `compact` del celular un nombre largo se corta con «…» (la placa del rival no tapa su mano). */}
          <span className={cx('min-w-0 truncate rounded-full px-2 text-micro font-bold uppercase leading-4 tracking-wider shadow-card max-[379px]:px-1.5', tall && 'min-[1101px]:leading-5', compact && 'max-[1101px]:max-w-15', tone.fill)}>{label ?? (name === t('duel.bar.rival') ? t('duel.bar.rivalTag') : name)}</span>
          {hand === undefined ? null : (
            <span aria-hidden="true" className={cx('inline-flex shrink-0 items-center gap-0.5 text-micro font-semibold leading-none tabular-nums text-muted', handOnDesktop && 'max-[1101px]:hidden')}>
              <Icon name="card" size={14} strokeWidth={1.8} />
              {hand}
            </span>
          )}
        </span>
        <span className="flex min-w-0 items-baseline justify-between gap-1.5">
          {/* A 33 px el renglón recorta 2 px arriba y abajo (los números no tienen ni rasgos que suban ni que bajen): entra en 56 px con la chapa y la barra. */}
          <span className={cx('min-w-0 truncate text-title font-extrabold leading-none tabular-nums transition-colors duration-200 min-[1101px]:-my-0.5 min-[1101px]:text-stat', compact && 'max-[379px]:text-lead', flash === 'up' ? 'text-success' : flash === 'down' ? 'text-danger' : life === 0 ? 'text-danger-soft' : 'text-foreground')}>{shown}</span>
          {change ? (
            <span key={change.key} aria-hidden="true" style={{ animationDuration: `${DELTA_MS}ms` }} className={cx('shrink-0 animate-linger text-micro font-extrabold leading-none tabular-nums motion-reduce:animate-none', change.delta < 0 ? 'text-danger-soft' : 'text-success-soft')}>
              {change.delta < 0 ? '−' : '+'}
              {Math.abs(change.delta)}
            </span>
          ) : null}
        </span>
        {/* La barra de 8000 (con más, llena): la excepción a los anillos, sólo para las vidas. La lee el lector de pantalla como un medidor; el número ya lo dice la placa. */}
        <span role="meter" aria-label={lifeOf} aria-valuemin={0} aria-valuemax={STARTING_LP} aria-valuenow={Math.min(life, STARTING_LP)} aria-valuetext={String(life)} className={cx('block h-1 overflow-hidden rounded-full bg-tint/16', tall && 'min-[1101px]:h-1.5')}>
          <span className={cx('block h-full rounded-full transition-[width] duration-300 motion-reduce:transition-none', health === 'danger' ? 'bg-danger-soft' : tone.bar)} style={{ width: `${ratio * 100}%` }} />
        </span>
      </span>
      {bubble ? (
        <span key={bubbleKey} role="status" style={{ animationDuration: `${SIGNAL_MS}ms` }} className={cx('pointer-events-none absolute z-30 w-max max-w-[16rem] animate-linger rounded-card border bg-card-background normal-case tracking-normal text-foreground shadow-[0_8px_20px_rgba(0,0,0,0.4)] motion-reduce:animate-none', isEmojiSignal(bubble) ? 'px-3 py-1 text-display leading-none' : 'truncate px-2.5 py-1 text-body font-semibold', tone.border, mine ? 'bottom-full right-0 mb-1.5' : 'left-0 top-full mt-1.5')}>
          {bubble}
        </span>
      ) : null}
    </>
  )
  const handNote = hand === undefined ? '' : `. ${t('duel.bar.handCount', { count: hand })}`
  // Las dos vidas miden lo mismo de alto (la del rival arriba, la tuya abajo).
  const style = cx('life-plate relative flex h-14 min-w-21 shrink-0 items-center gap-2.5 rounded-card border px-2.5 text-left max-[379px]:px-1.5 min-[1101px]:px-3', compact ? 'max-[379px]:min-w-16' : 'max-[379px]:min-w-18 max-[339px]:min-w-16', tall && 'min-[1101px]:h-18 min-[1101px]:min-w-52', tone.border)

  return onClick ? (
    <button ref={setTile} type="button" data-lp={side} aria-label={`${lifeOf}: ${life}${handNote}. ${t('duel.bar.openCalculator')}`} className={cx(style, 'cursor-pointer transition-colors hover:border-info/60 focus-visible:outline-none focus-visible:shadow-focus')} onClick={onClick}>
      {body}
    </button>
  ) : (
    <div ref={setTile} role="group" data-lp={side} aria-label={`${lifeOf}: ${life}${handNote}`} className={style}>
      {body}
    </div>
  )
}
