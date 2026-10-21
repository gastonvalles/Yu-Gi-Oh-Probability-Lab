import { useEffect, useRef, useState, type ReactNode } from 'react'

import { duelResult } from '../../app/duel-games'
import { toggleDuelFullscreen, useDuelFullscreen } from '../../app/duel-fullscreen'
import { useDuelRails } from '../../app/duel-rails'
import type { Activity } from '../../app/duel-protocol'
import type { Duel, DuelSnapshot } from '../../app/duel-session'
import type { SocketStatus } from '../../app/duel-socket'
import { setSoundsOn, useSoundsOn } from '../../app/sound-prefs'
import { useHostToasts } from '../../app/toast-box'
import { duelTurnNumber } from '../../app/duel-turn'
import { STARTING_LP, duelClockMs, formatClock } from '../../app/life-calculator'
import { DESKTOP_DECK_BUILDER_MEDIA_QUERY, useMediaQuery } from '../../app/use-media-query'
import { PHASES } from '../../app/practice-mat'
import { useSwipeAway } from '../../app/use-swipe-away'
import { sacudir } from '../probability/AttackFx'
import { MatViewToggle } from '../probability/MatViewToggle'
import { DELTA_MS, useLifeNumber, useLpDelta, useLpFlash } from '../../app/life-effects'
import { t } from '../../i18n'
import { ShellMenuButton } from '../shell/ShellMenu'
import { Button } from '../ui/Button'
import { Callout } from '../ui/Callout'
import { cx } from '../ui/cx'
import { Icon } from '../ui/Icon'
import { IconButton } from '../ui/IconButton'
import { Modal } from '../ui/Modal'
import { SideDrawer } from '../ui/SideDrawer'
import { Switch } from '../ui/Switch'
import { TONE, type Tone } from '../ui/tone'
import { ConfirmDialog } from '../probability/ConfirmDialog'
import { DuelChat, useChatUnread } from './DuelChat'
import type { FeedEntry } from './use-duel-feed'
import { DuelGames, type GameActions } from './DuelGames'
import { respondersText } from './PassPrompt'
import { ResultStrip } from './DuelResult'
import { PLAYER_COLOR, type PlayerSide } from './player-color'
import { isEmojiSignal } from '../../app/duel-signals'

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
  /** La mano del rival (sus dorsos): en el celular va abajo de los datos; en escritorio, en el medio de la misma fila. */
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
  /** La señal del rival que está a la vista (pensando, continuá): sale como un globo junto a sus vidas. */
  rivalSignal?: string | null
  /** Cambia con cada señal del rival (aunque diga lo mismo): su globo vuelve a entrar. */
  rivalSignalKey?: number
  /** Lo que se apoya sobre la línea del registro (la misma fila, sin sumar alto: el campo no se mueve): un pedido de volver atrás, o cómo terminó el tuyo. */
  lane?: LaneNotice | null
  /** Tocar las vidas del rival abre la calculadora de vidas del duelo (como tocar las propias). */
  onOpenLife?: () => void
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

/**
 * Lo de arriba de la mesa en un duelo, que es lo del rival y lo que se mira sin tocar: sus puntos de vida, el reloj de la ronda (tocarlo lo pausa),
 * el turno con la fase en que va quien juega, y cómo va la conexión. Lo propio (tus puntos de vida, el chat, los dados, deshacer) está abajo, al alcance
 * del pulgar. Salir pide confirmación y queda en la esquina de arriba, lejos de donde se toca jugando.
 */
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
  }
}

/** El aviso sobre la línea del registro: el pedido de volver atrás (del rival, o el tuyo), tu pregunta de pasar de fase y cómo terminó. No tapa el campo ni la mano y no bloquea nada. */
function LaneBanner({ lane, rivalName, rail = false }: { lane: LaneNotice; rivalName: string; /** En un lateral: ocupa el alto que necesite, en vez de la fila de la línea del registro. */ rail?: boolean }) {
  const place = rail ? 'flex-wrap py-2' : 'absolute inset-0 max-sm:pointer-events-auto'
  const clamp = rail ? '' : 'line-clamp-2'

  if (lane.kind === 'looking') {
    return (
      <div role="status" data-lane="looking" className={cx(place, 'flex items-center gap-2 rounded-card border border-border-subtle bg-card-background px-3 text-micro font-semibold leading-tight text-muted')}>
        <Icon name="eye" size={16} className="shrink-0 text-info-soft" />
        <span className={cx(clamp, 'min-w-0 flex-1')}>{t(LOOK_TEXT[lane.what], { name: rivalName })}</span>
      </div>
    )
  }

  const asked = lane.kind === 'undoAsked'

  return (
    <div role="status" data-lane={lane.kind} className={cx(place, 'flex items-center gap-2 rounded-card border bg-card-background px-3 text-micro font-semibold leading-tight', asked ? 'border-info text-foreground' : 'border-border-subtle text-muted')}>
      <span className={cx(clamp, 'min-w-0 flex-1')} title={laneText(lane, rivalName)}>
        {laneText(lane, rivalName)}
      </span>
      {lane.kind === 'undoAsked' ? (
        <>
          <Button variant="tertiary" size="sm" className="px-2" onClick={lane.onDeny}>
            {t('duel.undo.deny')}
          </Button>
          <Button variant="primary" size="sm" className="px-3" onClick={lane.onAllow}>
            {t('duel.undo.allow')}
          </Button>
        </>
      ) : null}
    </div>
  )
}

/** Los íconos sueltos de la barra de arriba (la vista, rendirse, el engranaje y salir): 40 px cada uno (36 en un celular angosto, 32 en uno de 320 px) para que entren con la hamburguesa, las vidas y el reloj. */
const HEADER_ICON = 'size-10! max-[379px]:size-9! max-[339px]:size-8!'

/** Los avisos de la conexión y del rival se apoyan debajo de la barra (no la empujan): el campo no se mueve cuando aparecen o se van. */
const ALERT_OVERLAY = 'absolute inset-x-0.5 top-full z-20 mt-1'

export function DuelBar({ snapshot, status, turn, onToggleClock, onRematch, onLeave, onAbandon, onConcede, onReconnect, log, resultOpen = false, rivalSignal = null, rivalSignalKey, lane = null, onOpenLife }: DuelBarProps) {
  const now = useTick(1000)
  const [leaving, setLeaving] = useState(false)
  const [conceding, setConceding] = useState(false)
  // Reconectar, Rendirse y Salir se tocan poco (y los dos últimos arruinan un duelo si se aprietan sin querer): en el celular van juntos detrás de un solo botón; en escritorio, a la vista.
  const docked = useMediaQuery(DESKTOP_DECK_BUILDER_MEDIA_QUERY)
  const bigWindow = useDuelFullscreen()
  const sounds = useSoundsOn()
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
  // La fase que se ve es la de quien tiene el turno: así los dos saben en qué punto va.
  const phaseId = (turn === 'mine' ? snapshot.mine : snapshot.theirs?.state)?.phase
  const phase = PHASES.find((entry) => entry.id === phaseId)?.name

  const dialogs = (
    <>
      <Modal isOpen={moreOpen} onClose={() => setMoreOpen(false)} size="keypad" title={t('duel.bar.more')} ariaLabel={t('duel.bar.more')}>
        <div className="grid gap-4">
          {/* Los sonidos del duelo (jugadas, vidas, chat): se recuerdan en este navegador. */}
          <div className="flex items-center justify-between gap-3">
            <span className="grid min-w-0 gap-0.5">
              <span className="text-body font-semibold text-foreground">{t('duel.bar.sounds')}</span>
              <span className="text-micro text-soft">{t('duel.bar.soundsHint')}</span>
            </span>
            <Switch checked={sounds} onChange={setSoundsOn} label={t('duel.bar.sounds')} />
          </div>
          {/* Reconectar también: lo tocan los dos, y el duelo sigue en cuanto el relay le dice a cada uno que el otro está. */}
          <div className="grid gap-2">
            <Button variant="tertiary" icon="refresh" className="justify-start" fullWidth onClick={() => { setMoreOpen(false); onReconnect() }}>
              {t('duel.bar.reconnect')}
            </Button>
            <p className="m-0 px-1 text-micro text-soft">{t('duel.bar.reconnectHint')}</p>
          </div>
        </div>
      </Modal>

      <ConfirmDialog
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
  // Los íconos de la barra (la vista, la ventana grande, rendirse, el engranaje y salir): en una fila arriba a la derecha, o en el lateral derecho.
  const actions = (
    <>
      {/* Vista superior o 3D de la mesa, como en la referencia: entre el reloj y los íconos de salir. */}
      <MatViewToggle className={HEADER_ICON} />
      {/* Ventana grande: el duelo ocupa toda la pantalla (sin el menú lateral; y, si el navegador deja, en pantalla completa). Sólo en escritorio: en el celular la mesa ya ocupa todo. */}
      {docked ? (
        <IconButton tone="flat" size="sm" aria-label={bigWindow ? t('duel.bar.bigWindowOff') : t('duel.bar.bigWindowOn')} title={bigWindow ? t('duel.bar.bigWindowOff') : t('duel.bar.bigWindowOn')} aria-pressed={bigWindow} className={HEADER_ICON} onClick={toggleDuelFullscreen}>
          <Icon name={bigWindow ? 'minimize' : 'maximize'} />
        </IconButton>
      ) : null}
      {/* Rendirse queda a la vista, junto a salir (arriba, lejos de donde se juega) y pide confirmar. Terminado el duelo, o sin rival, no hay a quién rendirse. */}
      <IconButton tone="flat" size="sm" aria-label={t('duel.bar.concede')} title={t('duel.bar.concede')} className={cx(HEADER_ICON, 'disabled:opacity-35')} disabled={Boolean(result) || !peerPresent} onClick={() => setConceding(true)}>
        <Icon name="flag" />
      </IconButton>
      {/* El engranaje: lo que se toca poco (reconectar). */}
      <IconButton tone="flat" size="sm" aria-label={t('duel.bar.more')} title={t('duel.bar.more')} aria-haspopup="dialog" aria-expanded={moreOpen} className={HEADER_ICON} onClick={() => setMoreOpen(true)}>
        <Icon name="gear" />
      </IconButton>
      <IconButton tone="flat" size="sm" aria-label={t('duel.bar.leave')} title={t('duel.bar.leave')} className={HEADER_ICON} onClick={() => setLeaving(true)}>
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
  // Cuántos miran y cómo va el Match.
  const chips = (
    <>
      {snapshot.watchers > 0 ? (
        <span className="inline-flex shrink-0 items-center gap-1 whitespace-nowrap rounded-full bg-tint/8 px-2.5 py-1 text-micro font-semibold tabular-nums text-muted" title={t('duel.room.watchers', { count: snapshot.watchers })} aria-label={t('duel.room.watchers', { count: snapshot.watchers })}>
          <Icon name="eye" size={14} />
          {snapshot.watchers}
        </span>
      ) : null}
      {snapshot.series.match ? (
        <span className="shrink-0 whitespace-nowrap rounded-full bg-tint/8 px-2.5 py-1 text-micro font-semibold tabular-nums text-muted" data-testid="duel-series">
          {t('duel.series.chip', { game: snapshot.series.game, mine: snapshot.series.wins[me], theirs: snapshot.series.wins[me === 0 ? 1 : 0] })}
        </span>
      ) : null}
    </>
  )

  // Con laterales (escritorio ancho): la barra se reparte a los costados del campo. Izquierda: las vidas del rival, el reloj de la ronda y, en el medio, los avisos (lo que hace el rival, un pedido de volver atrás, la conexión) y los
  // avisos de toda la app (`useHostToasts`). Derecha: los íconos, de quién es el turno y en qué fase va, y el resultado. Sus piezas se acomodan en la grilla de la mesa (`col-start` / `row-start`).
  if (rails) {
    return (
      <>
        <div className="col-start-1 row-start-1 flex min-w-0 flex-col items-start gap-2">
          <LifeTile name={rivalName} life={life.lp[me === 0 ? 1 : 0]} bubble={rivalSignal} bubbleKey={rivalSignalKey} onClick={onOpenLife} />
          {clockButton}
          <span className="flex flex-wrap items-center gap-1.5 empty:hidden">{chips}</span>
        </div>
        <div className="col-start-3 row-start-1 flex min-w-0 flex-col items-end gap-3">
          <span className="-mr-2 flex flex-wrap items-center justify-end">{actions}</span>
          <span className="sr-only">{t('practice.mat.turn', { turn: duelTurnNumber(snapshot.mine, snapshot.theirs?.state ?? null) })}</span>
          <span className="grid justify-items-end text-right text-lead font-bold leading-tight">
            <span className={turn === 'mine' ? 'text-accent' : 'text-info-soft'}>{turn === 'mine' ? t('duel.bar.yourTurn') : t('duel.bar.theirTurn', { name: rivalName })}</span>
            {phase ? <span data-testid="duel-phase" className="text-info">{phase}</span> : null}
          </span>
        </div>
        <div ref={toastHost} data-testid="duel-rail-notices" className="relative col-start-1 row-start-2 flex min-h-0 flex-col items-stretch gap-2 pt-4">
          {lane ? <LaneBanner lane={lane} rivalName={rivalName} rail /> : null}
          {status !== 'open' ? (
            <Callout tone="warning" icon="alert">{STATUS_TEXT[status]()}</Callout>
          ) : !peerPresent ? (
            <Callout tone="info">{t('duel.peer.absent')}</Callout>
          ) : null}
        </div>
        {result && !resultOpen ? (
          <div className="col-start-3 row-start-2 flex min-h-0 flex-col items-stretch pt-4">
            <ResultStrip result={result} snapshot={snapshot} rival={rivalName} onRematch={onRematch} rail />
          </div>
        ) : null}
        {dialogs}
      </>
    )
  }

  return (
    // Celular: tres filas que no se parten (vidas + reloj + íconos; turno + señales; la mano del rival): si algo no entra, se achica en su fila en vez de caerse a otra. Escritorio: una sola fila con las vidas del rival
    // y el reloj arriba a la izquierda, su mano en el centro (el del campo) y, arriba a la derecha, el turno y salir; tus vidas van en la esquina de enfrente, abajo a la derecha.
    <div className="relative flex flex-wrap items-center gap-1.5 px-0.5 pt-1.5 min-[1101px]:flex-nowrap">
      {/* `contents` en escritorio: sus piezas se acomodan en la fila de todo el ancho (`order`). En celular la vida es la que cede lugar si no entran los íconos. */}
      <div className="flex basis-full items-center gap-1.5 max-[339px]:gap-1 min-[1101px]:contents [&>[data-lp]]:shrink min-[1101px]:[&>[data-lp]]:shrink-0">
        {/* La hamburguesa del armazón va acá: una sola barra arriba, la de la mesa. */}
        <ShellMenuButton className="-ml-2 size-10! max-[339px]:size-8!" />
        <LifeTile name={rivalName} life={life.lp[me === 0 ? 1 : 0]} bubble={rivalSignal} bubbleKey={rivalSignalKey} onClick={onOpenLife} />
        {clockButton}
        <span className="-mr-2 ml-auto flex shrink-0 items-center min-[1101px]:order-3 min-[1101px]:ml-0.5 min-[1101px]:mr-0">
          {actions}
        </span>
      </div>

      {/* Escritorio: el turno a la derecha, pegado a los íconos. Celular: el turno y las señales en su fila, sin partirse (la fase se corta con puntos suspensivos si no entra). */}
      <div className="order-2 flex min-w-0 basis-full items-center gap-1.5 min-[1101px]:order-2 min-[1101px]:ml-auto min-[1101px]:basis-auto">
        {chips}
        {/* El número del turno lo dice el lector de pantalla (y el registro, en cada separador): a la vista, el turno de quién es y la fase. */}
        <span className="sr-only">{t('practice.mat.turn', { turn: duelTurnNumber(snapshot.mine, snapshot.theirs?.state ?? null) })}</span>
        <span className="min-w-0 truncate text-lead font-bold">
          <span className={turn === 'mine' ? 'text-accent' : 'text-info-soft'}>{turn === 'mine' ? t('duel.bar.yourTurn') : t('duel.bar.theirTurn', { name: rivalName })}</span>
          {phase ? <span data-testid="duel-phase" className="text-info">{` · ${phase}`}</span> : null}
        </span>
      </div>

      {/* Lo que pasó va justo debajo del turno, como en la referencia; la mano del rival, después. Un aviso se apoya sobre esa línea (la misma fila, sin sumar alto: el campo no se mueve).
          En un celular en vertical la línea no ocupa lugar (`-mb-11`): flota sobre el borde de arriba de la mano del rival, así no queda una franja vacía cuando todavía no pasó nada (Gastón, 2026-10-20: «evita el espacio muerto»). */}
      {log ? (
        // Con el resultado puesto, en el celular la tira ocupa este mismo lugar (abajo): la mesa no se corre cuando termina el duelo.
        <div className={cx('relative order-3 basis-full max-sm:pointer-events-none max-sm:z-20 max-sm:-mb-11 min-[1101px]:hidden', Boolean(result) && !resultOpen && 'max-[1101px]:hidden')}>
          <div inert={laneOpen} className={cx(laneOpen && 'invisible')}>
            {log}
          </div>
          {lane ? <LaneBanner lane={lane} rivalName={rivalName} /> : null}
        </div>
      ) : null}
      {/* Escritorio (sin línea del registro): el mismo cartel, centrado debajo de la barra. */}
      {docked && laneOpen ? (
        <div className="absolute left-1/2 top-full z-20 mt-1 h-11 w-[min(24rem,100%)] -translate-x-1/2">
          {lane ? <LaneBanner lane={lane} rivalName={rivalName} /> : null}
        </div>
      ) : null}

      {/* Escritorio: en el centro de lo que queda libre de la fila de arriba (entre el reloj y el turno), con su ancho reservado: si la columna se angosta, el turno se corta con puntos suspensivos y no se pisan. En el celular la mano del rival va pegada arriba del campo (la pone la mesa: `rivalHand`). */}
      {docked ? (
        <div className="relative order-1 min-w-0 flex-1 self-stretch">
        </div>
      ) : null}

      {status !== 'open' ? (
        <Callout className={ALERT_OVERLAY} tone="warning" icon="alert">{STATUS_TEXT[status]()}</Callout>
      ) : !peerPresent ? (
        <Callout className={ALERT_OVERLAY} tone="info">{t('duel.peer.absent')}</Callout>
      ) : null}

      {result && !resultOpen ? (
        <div className="order-3 basis-full max-sm:relative max-sm:z-20 max-sm:-mb-11 min-[1101px]:order-2 min-[1101px]:min-w-0 min-[1101px]:basis-auto min-[1101px]:shrink">
          <ResultStrip result={result} snapshot={snapshot} rival={rivalName} onRematch={onRematch} />
        </div>
      ) : null}

      {dialogs}
    </div>
  )
}

interface DuelToolsProps {
  snapshot: DuelSnapshot
  myName: string
  /** Moneda, dado, piedra-papel-tijera, quién empieza y rendirse. */
  games: GameActions
  /** El botón del chat (sólo en el celular, donde no está a la vista): al final de la botonera, a la derecha, al alcance del pulgar. */
  chat?: ReactNode
  /** La hoja de la moneda, el dado y los juegos (la abre el + de la mesa). */
  gamesOpen: boolean
  onGamesClose: () => void
}

/**
 * Los botones propios del duelo, abajo a la derecha (el pulgar de quien juega con la derecha): el chat. Las reacciones (🤔 y 👍) van centradas debajo de la mano en el celular (`DuelMatLink.reactions`) y en el chat en escritorio.
 * En escritorio el chat está fijo a la derecha de la mesa. La moneda, el dado y los juegos están dentro del + (su hoja se arma acá).
 */
export function DuelTools({ snapshot, myName, games, chat, gamesOpen, onGamesClose }: DuelToolsProps) {
  return (
    <>
      {chat}

      <DuelGames isOpen={gamesOpen} onClose={onGamesClose} snapshot={snapshot} myName={myName} actions={games} />
    </>
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
          <span aria-hidden="true" className="pointer-events-none absolute right-0 top-0 grid min-w-4 place-items-center rounded-full bg-info px-1 text-[0.625rem] font-extrabold leading-4 text-background">
            {unread}
          </span>
        ) : null}
      </span>

      <SideDrawer isOpen={open} onClose={onClose} title={t('duel.chat.title', { name: rivalName })}>
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

/** Cuánto se queda el globo de una señal (pensando, todo bien, un 👍) junto a las vidas: el temporizador de `useSignals` (DuelScreen) lo quita a esta misma duración. */
export const SIGNAL_MS = 3500

interface DuelLifeProps {
  snapshot: DuelSnapshot
  myName: string
  /** Abre la calculadora de vidas del duelo. */
  onOpen: () => void
  /** Lo que acabás de avisar (pensando, todo bien): sale como un globo junto a tus vidas. */
  signal?: string | null
  /** Cambia con cada señal (aunque diga lo mismo): el globo vuelve a entrar. */
  signalKey?: number
}

/** Tus puntos de vida, abajo junto a las fases: se tocan para abrir la calculadora (sincronizada con el duelo, sin salir de él). */
export function DuelLife({ snapshot, myName, onOpen, signal = null, signalKey }: DuelLifeProps) {
  return <LifeTile name={myName || t('duel.bar.you')} label={t('duel.bar.you')} life={snapshot.life.lp[snapshot.me]} mine big bubble={signal} bubbleKey={signalKey} onClick={onOpen} />
}

/**
 * Las vidas de un jugador (Gastón, 2026-10-19: «la vida de ambos jugadores puede mejorarse mucho»; el anillo se probó y no le gustó): en escritorio, un **corazón** que cambia de color con la salud (verde con más
 * de la mitad, ámbar desde ahí hasta un cuarto y rojo debajo: es una estadística) y late al cambiar; el nombre arriba y el número grande que cuenta hasta el valor nuevo (se tiñe de verde o de rojo un instante al
 * subir o bajar) con la diferencia («−1000») saliendo al lado. En el celular, sin corazón: la fila no se parte. El borde de la tarjeta es de su dueño (violeta el tuyo, ámbar el del rival). Tocarla abre la calculadora.
 * Las dos miden lo mismo de alto.
 */
export function LifeTile({ name, label, life, mine = false, color, bubble = null, bubbleKey, onClick, big = false }: {
  /** El de la botonera de abajo (tus vidas): más ancho y con el número más grande. */
  big?: boolean
  name: string; /** Lo que se ve en la casilla, si no es el nombre (tus vidas dicen «Vos»; el nombre queda para el lector de pantalla). */ label?: string; life: number; mine?: boolean; /** Un aviso que sale un instante junto a las vidas, con el color de su dueño: el rival, debajo; el propio, arriba. */ bubble?: string | null; /** Cambia con cada señal (aunque diga lo mismo): el globo vuelve a entrar. */ bubbleKey?: number; /** De qué jugador es el color (por defecto, el tuyo si es "mine"): quien mira pone el suyo a cada uno. */ color?: PlayerSide; onClick?: () => void }) {
  // `data-lp`: a qué casilla va la espada de un ataque directo (ver `measureStrike`).
  const side = mine ? 'mine' : 'theirs'
  const tone = PLAYER_COLOR[color ?? side]
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
  const body = (
    <>
      <span key={change?.key ?? 'idle'} aria-hidden="true" className={cx('shrink-0 max-[1101px]:hidden', TONE[health].text, change && 'animate-pop motion-reduce:animate-none')}>
        <Icon name="heart" size={big ? 32 : 28} variant="bold" />
      </span>
      <span className="grid min-w-0 content-center gap-1 min-[1101px]:flex-1">
        <span className="flex w-full min-w-0 items-center justify-between gap-1.5">
          <span className={cx('min-w-0 truncate text-micro font-semibold uppercase leading-none tracking-[0.06em]', mine ? tone.text : 'text-foreground')}>{label ?? name}</span>
          {change ? (
            <span key={change.key} aria-hidden="true" style={{ animationDuration: `${DELTA_MS}ms` }} className={cx('shrink-0 animate-linger text-micro font-extrabold leading-none tabular-nums motion-reduce:animate-none', change.delta < 0 ? 'text-danger-soft' : 'text-success-soft')}>
              {change.delta < 0 ? '−' : '+'}
              {Math.abs(change.delta)}
            </span>
          ) : null}
        </span>
        <span className={cx('max-w-full shrink-0 truncate font-extrabold leading-none tabular-nums transition-colors duration-200', big ? 'text-stat' : 'text-title', flash === 'up' ? 'text-success' : flash === 'down' ? 'text-danger' : life === 0 ? 'text-danger-soft' : tone.text)}>{shown}</span>
      </span>
      {bubble ? (
        <span key={bubbleKey} role="status" style={{ animationDuration: `${SIGNAL_MS}ms` }} className={cx('pointer-events-none absolute z-30 w-max max-w-[16rem] animate-linger rounded-card border bg-card-background normal-case tracking-normal text-foreground shadow-[0_8px_20px_rgba(0,0,0,0.4)] motion-reduce:animate-none', isEmojiSignal(bubble) ? 'px-3 py-1 text-display leading-none' : 'truncate px-2.5 py-1 text-body font-semibold', tone.border, mine ? 'bottom-full right-0 mb-1.5' : 'left-0 top-full mt-1.5')}>
          {bubble}
        </span>
      ) : null}
    </>
  )
  // Las dos vidas miden lo mismo de alto (la del rival arriba, la tuya abajo).
  const style = cx('relative flex h-14 shrink-0 items-center gap-3 rounded-card border bg-card-background px-2 text-left min-[1101px]:h-[4.5rem] min-[1101px]:px-3', big ? 'min-w-28 min-[1101px]:min-w-44' : 'min-w-[5.25rem] min-[1101px]:min-w-36 max-[339px]:min-w-16', tone.border)

  return onClick ? (
    <button ref={setTile} type="button" data-lp={side} aria-label={`${t('duel.bar.lifeOf', { name })}: ${life}. ${t('duel.bar.openCalculator')}`} className={cx(style, 'cursor-pointer transition-colors hover:border-info/60 focus-visible:outline-none focus-visible:shadow-focus')} onClick={onClick}>
      {body}
    </button>
  ) : (
    <div ref={setTile} role="group" data-lp={side} aria-label={`${t('duel.bar.lifeOf', { name })}: ${life}`} className={style}>
      {body}
    </div>
  )
}
