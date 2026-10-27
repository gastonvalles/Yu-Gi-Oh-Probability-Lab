import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore, type ReactNode } from 'react'

import { createDataLoader, httpSource } from '../../app/auto/auto-data'
import { autoSaveStore, type AutoSaveStore } from '../../app/auto/auto-save'
import { undoPoint, workerTransport, type AutoSession, type AutoSnapshot } from '../../app/auto/auto-session'
import type { DeckList } from '../../app/auto/deck-map'
import { REASON_DECK, REASON_LP, SCRIPT_REASON } from '../../app/auto/end-reasons'
import { manualHandover, type ManualGame } from '../../app/auto/manual-handover'
import { createGuestLink, createHostLink, underControl, type HostLinkOptions, type OnlineLink, type OnlineSnapshot, type OnlineTransport, type RoomAutoState } from '../../app/auto/online'
import type { Seat } from '../../app/auto/protocol'
import { setAutoPref, useAutoPrefs } from '../../app/auto-prefs'
import { parseDerivedCardId } from '../../app/calculator-state'
import { duelResult, type DuelResult } from '../../app/duel-games'
import { duelTurnNumber } from '../../app/duel-turn'
import type { Duel, DuelRole, DuelSnapshot } from '../../app/duel-session'
import { isEmojiSignal } from '../../app/duel-signals'
import type { SocketStatus } from '../../app/duel-socket'
import { LifeHold } from '../../app/life-effects'
import { DESKTOP_DECK_BUILDER_MEDIA_QUERY, useMediaQuery } from '../../app/use-media-query'
import { showToastMessage } from '../../app/use-toast-message'
import { t } from '../../i18n'
import { TurnOrderBanner } from '../duel/DuelBanner'
import { DuelBar, DuelChatToggle, DuelLife, DuelLogTicker, RivalLife, type LaneNotice } from '../duel/DuelBar'
import { DuelChatPanel } from '../duel/DuelChat'
import { DuelPause } from '../duel/DuelPause'
import { ResultCard } from '../duel/DuelResult'
import type { FeedEntry } from '../duel/use-duel-feed'
import { RivalEmoji, useAutoStartClock, useClockPause, useGameToasts, useSignals } from '../duel/use-duel-table'
import { cardIdOfDrawId } from '../probability/practice'
import { PracticeMat, type DuelMatLink, type MatCard } from '../probability/PracticeMat'
import { Button } from '../ui/Button'
import { Segmented } from '../ui/Segmented'
import { AskPrompt } from './AskPrompt'
import { chainModeHint, chainModeOptions, Setting } from './AutoBar'
import { FaultCover, LoadingCover } from './AutoCovers'
import { deckListOf } from './deck-list'
import { sentinel, useAutoAsks } from './use-auto-asks'

/**
 * El duelo automático por enlace (diseño: `docs/duelo-automatico-enlace.md`): la sala de siempre (`createDuel`: listos, tirada, chat, señales, vidas, rendirse, revancha) y
 * la mesa de «Jugar solo automático» (`PracticeMat` con la composición del duelo y las preguntas del núcleo contestadas en la mesa: `useAutoAsks`), unidas por el enlace del núcleo
 * (`OnlineLink`): el anfitrión corre el núcleo con los dos asientos y el invitado proyecta lo que le llega. Mientras no hay sesión, la sala la dibuja `DuelRoom` (`room`) con lo que el
 * enlace sabe (`RoomAutoState`: si se puede estar listo y qué decir). La mesa no cambia en nada: recibe lo mismo que en solo, con la barra del duelo (`DuelBar`), el chat, las
 * señales, la pausa y el resultado. Deshacer, con el acuerdo del rival (`useLinkUndo`); sin reloj de turnos. Las vidas del núcleo se vuelcan en las de la sala (cada uno declara las suyas) y al final el que pierde
 * pone las suyas en 0: así el resultado, la revancha y el cierre de la sala andan como siempre.
 */

/**
 * Lo que `DuelScreen` le pasa a la mesa del duelo automático por enlace: la sala de siempre (`duel`, `snapshot`, `status`), el transporte del relay para el enlace del núcleo y el
 * deck de esta persona. La sala (listos, tirada) la dibuja `DuelRoom` mientras no hay sesión: llega como `room`.
 */
export interface AutoDuelScreenProps {
  duel: Duel
  snapshot: DuelSnapshot
  status: SocketStatus
  transport: OnlineTransport
  myName: string
  deck: { name: string; mainIds: readonly string[]; extraIds: readonly string[]; cardsById: ReadonlyMap<string, MatCard> }
  handSize: number
  /** La sala de siempre (DuelRoom) mientras no empieza: la dibuja la pantalla con lo que el enlace sabe. */
  room: (auto: RoomAutoState) => ReactNode
  onLeave: () => void
  onAbandon: () => void
  onRematch: () => void
  /** El código de la sala: con él el anfitrión guarda el duelo en el navegador (si recarga la página, lo retoma); sin él no guarda nada. */
  code?: string
  /**
   * Los dos acordaron seguir en modo manual: la partida propia hasta el corte (la mesa del arranque y todo lo jugado en automático, `manualHandover`), para `duel.start` (la
   * sala sigue como manual hasta la revancha, con ese historial: Deshacer vuelve a antes del corte). Sin esto, «Más opciones» no ofrece pasar. El invitado pasa con el corte del
   * anfitrión; el anfitrión, con el pase acordado, cuando le llega la mesa manual del invitado.
   */
  onManual?: (game: ManualGame) => void
  /**
   * Y de vuelta: los dos acordaron seguir en automático un duelo que iba a mano (`online-resume.ts`, lo pide `DuelScreen` desde la mesa manual). El anfitrión arranca su enlace con
   * la mesa rearmada (se lee al montar: el enlace la consume una vez y la revancha empieza de cero); el invitado no necesita nada (arma las suyas del `autoInit`).
   */
  resume?: HostLinkOptions['resume']
  /** Pruebas: el enlace de mentira (tiene que ser estable: cambiarlo arma otro enlace). */
  connect?: (transport: OnlineTransport, role: DuelRole) => OnlineLink
}

const NOTHING = () => {}
const noSubscribe = () => () => {}
const noSnapshot = () => null

/** El enlace de verdad: el anfitrión baja los datos y corre el núcleo en un Worker; el invitado sólo baja lo de sus cartas. `features.online` del manifiesto lo apaga sin tocar código. */
function liveLink(transport: OnlineTransport, role: DuelRole, deck: DeckList, handSize: number, save: AutoSaveStore | null, resume: HostLinkOptions['resume']): OnlineLink {
  if (role === 'guest') return createGuestLink({ transport, source: httpSource(), deck })
  const loader = createDataLoader(httpSource())

  // Sin manifiesto no se sabe: se sigue y, si los datos no llegan, el enlace lo dice (`reason: 'data'`).
  return createHostLink({ transport, loader, deck, handSize, makeTransport: workerTransport(), enabled: () => loader.manifest().then((manifest) => manifest.features?.online !== false, () => true), ...(save ? { save } : {}), ...(resume ? { resume } : {}) })
}

/** Una clave por sesión (la mesa arranca de cero con cada una: revancha, o el invitado que vuelve a recibir el duelo). */
const sessionIds = new WeakMap<AutoSession, number>()
let lastSessionId = 0
const sessionKey = (session: AutoSession) => sessionIds.get(session) ?? (sessionIds.set(session, (lastSessionId += 1)), lastSessionId)

export function AutoDuelScreen({ duel, snapshot, status, transport, myName, deck, handSize, room, onLeave, onAbandon, onRematch, code, onManual, resume, connect }: AutoDuelScreenProps) {
  const { role, peerPresent } = snapshot
  const list = useMemo<DeckList>(() => ({ main: deckListOf(deck.mainIds), extra: deckListOf(deck.extraIds) }), [deck.mainIds, deck.extraIds])
  const [link, setLink] = useState<OnlineLink | null>(null)
  // La mesa rearmada se lee cuando se arma el enlace (cambiarla después no arma otro).
  const resumeRef = useRef(resume)

  resumeRef.current = resume
  // El duelo guardado del anfitrión se borra al salir, abandonar o pasar a manual (el enlace no lo borra al destruirse: con `StrictMode` borraría lo guardado al volver a montar).
  const save = useMemo(() => (code ? autoSaveStore(code) : null), [code])
  const leave = useCallback(() => {
    save?.clear()
    onLeave()
  }, [save, onLeave])
  const abandon = useCallback(() => {
    save?.clear()
    onAbandon()
  }, [save, onAbandon])
  const toManual = useMemo(
    () =>
      onManual &&
      ((game: ManualGame) => {
        save?.clear()
        onManual(game)
      }),
    [save, onManual],
  )

  // En un efecto (y no en el render): con `StrictMode` el montaje se repite, y un enlace escucha el relay y manda; el de la primera pasada se destruye.
  useEffect(() => {
    const next = connect ? connect(transport, role) : liveLink(transport, role, list, handSize, save, resumeRef.current)

    setLink(next)

    return () => next.destroy()
  }, [connect, transport, role, list, handSize, save])

  const online = useSyncExternalStore(link ? link.subscribe : noSubscribe, link ? link.getSnapshot : noSnapshot)

  // La sala avanza (el rival entra, la tirada, quién empieza, la revancha): el enlace lo mira con cada snapshot.
  useEffect(() => {
    link?.observe(snapshot)
  }, [link, snapshot])

  // El invitado que vuelve a ver al anfitrión (se cortó uno de los dos) pide el duelo de nuevo; la primera vez que lo ve, no (entra a la sala).
  const presence = useRef({ ever: false, now: false })

  useEffect(() => {
    const before = presence.current

    presence.current = { ever: before.ever || peerPresent, now: peerPresent }
    if (link && role === 'guest' && before.ever && !before.now && peerPresent) link.resync()
  }, [link, role, peerPresent])

  // El anfitrión cuya conexión se cayó y volvió (cambió de wifi a datos) le repone el duelo al invitado: el relay puede no haberle avisado que se fue, y entonces no lo pide.
  const socket = useRef(status)

  useEffect(() => {
    const before = socket.current

    socket.current = status
    if (link && role === 'host' && before === 'reconnecting' && status === 'open') link.resync()
  }, [link, role, status])

  const rivalName = snapshot.peerName ?? t('duel.bar.rival')
  const codeName = useCodeName(deck.cardsById, online?.cards)

  // La sala hasta que hay duelo: también entre un duelo y su revancha (la mesa vuelve a cero y elige el que perdió).
  if (!online?.session || online.seat === null || !snapshot.opening.ordered) return <>{room(roomAutoState(online, rivalName, codeName))}</>

  return (
    <AutoDuelTable
      key={sessionKey(online.session)}
      session={online.session}
      online={online}
      seat={online.seat}
      duel={duel}
      snapshot={snapshot}
      status={status}
      myName={myName}
      deck={deck}
      onLeave={leave}
      onAbandon={abandon}
      onRematch={onRematch}
      {...(toManual && link?.manual ? { request: (yes: boolean) => link.manual?.(yes), onManual: toManual } : {})}
      {...(link?.undo ? { askUndo: (yes: boolean) => link.undo?.(yes) } : {})}
    />
  )
}

/** El nombre de una carta por código: las tuyas, del builder; las del rival que el núcleo dejó ver, de `cards`. */
function useCodeName(cardsById: ReadonlyMap<string, MatCard>, cards: OnlineSnapshot['cards'] | undefined): (code: number) => string {
  return useMemo(() => {
    const names = new Map<number, string>()

    for (const [id, card] of cardsById) {
      const code = parseDerivedCardId(cardIdOfDrawId(id))

      if (code !== null && !names.has(code)) names.set(code, card.name)
    }

    return (code: number) => names.get(code) ?? cards?.get(code)?.name ?? t('practice.card.unknown')
  }, [cardsById, cards])
}

/** Lo que la sala muestra mientras no hay duelo: «Estoy listo» sólo con los dos decks revisados (`ready`); el aviso, `info` mientras espera, `warning` si algo impide empezar y `danger` si algo se perdió. */
function roomAutoState(online: OnlineSnapshot | null, rival: string, nameOf: (code: number) => string): RoomAutoState {
  const say = (tone: 'info' | 'warning' | 'danger', text: string, cards?: { code: number; name: string }[]) => ({ tone, text, ...(cards && cards.length > 0 ? { cards } : {}) })

  switch (online?.phase ?? 'idle') {
    case 'idle':
      return { canReady: false, notice: null }
    case 'awaitingDeck':
      return { canReady: false, notice: say('info', t('auto.online.waitingDeck', { name: rival })) }
    case 'checking':
      return { canReady: false, notice: say('info', t('auto.online.checking')) }
    case 'outdated':
      return { canReady: false, notice: say('warning', t('auto.online.outdated', { name: rival })) }
    case 'blocked': {
      const { mine, theirs, reason } = online!.problems

      if (reason === 'lost') return { canReady: false, notice: say('danger', t('auto.online.lost')) }
      if (reason !== null) return { canReady: false, notice: say('warning', reason === 'off' ? t('auto.online.off') : reason === 'version' ? t('auto.online.version', { name: rival }) : t('auto.online.data')) }
      const text = [...(mine.length > 0 ? [t('auto.online.blockedMine', { count: mine.length })] : []), ...(theirs > 0 ? [t('auto.online.blockedTheirs', { count: theirs, name: rival })] : [])].join(' ')

      return { canReady: false, notice: say('warning', text || t('auto.online.data'), mine.map((code) => ({ code, name: nameOf(code) }))) }
    }
    // Entre un duelo y su revancha (`ended`) los decks ya se revisaron.
    case 'ready':
    case 'ended':
      return { canReady: true, notice: null }
    case 'starting':
    case 'playing':
      return { canReady: false, notice: say('info', t('auto.loading.start')) }
    case 'lost':
      return { canReady: false, notice: say('danger', online!.problems.reason === 'lost' ? t('auto.online.lost') : t('auto.online.broken')) }
  }
}

/** Por qué terminó según el núcleo, cuando no lo dicen las vidas (sin cartas para robar, el efecto de una carta): lo que `ResultCard` muestra en vez de «se quedó sin puntos de vida». */
function coreReason(end: { winner: number; reason: number }, lp: readonly [number, number], seat: Seat, rival: string): string | undefined {
  const won = end.winner === seat

  if (end.winner === 2 || end.reason === REASON_LP || lp[won ? 1 - seat : seat]! <= 0) return undefined

  return end.reason === REASON_DECK || end.reason < SCRIPT_REASON ? (won ? t('auto.online.deckOutWin', { name: rival }) : t('auto.end.deckOutLose')) : t(won ? 'auto.end.effectWin' : 'auto.end.effectLose')
}

/**
 * Las vidas del núcleo son las de la sala: cada uno declara las suyas (`changeLife`, el `life` del protocolo de siempre), así la barra, el resultado, la revancha y el cierre de la sala
 * andan sin cambios. Al terminar, el que pierde pone las suyas en 0 (empate: los dos). La sesión deja de hablar por la sala cuando terminó o cuando el duelo terminó de otra forma
 * (alguien se rindió): la revancha vuelve las vidas de la sala al máximo y la cuenta otra sesión, que arranca igual.
 */
function useCoreLife(duel: Duel, snapshot: DuelSnapshot, snap: AutoSnapshot, seat: Seat, result: DuelResult | null) {
  // Una sesión que ya había terminado cuando se montó su mesa (la del duelo de antes de una revancha) no habla por la sala: las vidas de ahora son de otro duelo.
  const done = useRef(snap.status === 'ended')
  const mine = snapshot.life.lp[snapshot.me]

  useEffect(() => {
    if (done.current || snap.replaying || snap.status === 'loading' || snap.status === 'error') return
    const end = snap.status === 'ended' ? snap.overlay.end : null

    if (result !== null && !end) {
      done.current = true
      return
    }
    if (end) done.current = true
    const target = end && end.winner !== seat ? 0 : snap.overlay.lp[seat]

    if (target !== mine) duel.changeLife(target - mine)
  }, [duel, snap, seat, mine, result])
}

/**
 * El pase a manual de este lado: cómo terminó mi pedido (un aviso) y cuándo la sala sigue como manual (`onManual` con la mesa del corte). El invitado pasa con el corte del
 * anfitrión (`agreed`: su mesa ya tiene todo lo que contó el núcleo hasta ahí); el anfitrión, con el pase acordado, cuando le llega la mesa manual del invitado (también si recargó
 * en el medio: su núcleo, rearmado con lo guardado, está en el mismo punto y sigue cortado). Sin acuerdo, una mesa manual del invitado no lo saca del automático. Una sola vez por mesa.
 */
function usePassToManual({ snapshot, snap, online, rivalName, onManual }: { snapshot: DuelSnapshot; snap: AutoSnapshot; online: OnlineSnapshot; rivalName: string; onManual: ((game: ManualGame) => void) | undefined }) {
  const manual = online.manual ?? 'idle'
  const shown = useRef(manual)
  const passed = useRef(false)
  const ready = snapshot.role === 'guest' ? manual === 'agreed' : snapshot.theirs !== null && (manual === 'switching' || manual === 'agreed')

  useEffect(() => {
    if (shown.current === manual) return
    shown.current = manual
    if (manual === 'declined') showToastMessage(t('auto.online.manualDeclined', { name: rivalName }), 'info')
    else if (manual === 'expired') showToastMessage(t('auto.online.manualExpired', { name: rivalName }), 'info')
    else if (manual === 'blocked') showToastMessage(t('auto.online.manualControl'), 'warning')
  }, [manual, rivalName])

  useEffect(() => {
    if (passed.current || !onManual || !ready || snap.status === 'loading' || snap.status === 'error' || snap.replaying) return
    passed.current = true
    showToastMessage(t(online.manualDropped ? 'auto.online.manualDoneDropped' : 'auto.online.manualDone'), 'info')
    // Toda la partida (sin volver atrás): la mesa manual arranca con el historial del automático.
    onManual(manualHandover(snap, () => undefined).session(0))
  }, [onManual, ready, snap, online.manualDropped])
}

/** Las preguntas cuya respuesta es una jugada (como `PLAY_ASKS` de la sesión). */
const PLAY_ASK = new Set(['select_idlecmd', 'select_battlecmd'])

/**
 * Deshacer en el enlace, con el acuerdo del otro: si tengo una jugada mía a la que volver (el anfitrión lo sabe por las respuestas; el invitado, sin el núcleo, más o menos: lo
 * revisa el anfitrión y, si no hay, se le dice), el aviso de la línea (el pedido del otro, que se contesta ahí, y el mío, que se retira), cómo terminó mi pedido (un aviso) y,
 * en el registro, cada vez que se volvió atrás una jugada.
 */
function useLinkUndo({ snap, online, seat, host, open, rivalName, lastChat, askUndo }: { snap: AutoSnapshot; online: OnlineSnapshot; seat: Seat; host: boolean; open: boolean; rivalName: string; /** El id del último mensaje del chat: el aviso va después. */ lastChat: number; askUndo: ((yes: boolean) => void) | undefined }) {
  const undo = online.undo
  const state = undo?.state ?? 'idle'
  const usable = askUndo !== undefined && undo?.peer === true && open
  const ownPlay = host ? snap.answers.some((item) => item.seat === seat && undoPoint(item)) : snap.answers.some(undoPoint) || snap.playStarts.length > (snap.ask && PLAY_ASK.has(snap.ask.ask.type) ? 1 : 0)
  const shown = useRef(state)
  const seen = useRef(undo?.done ?? 0)
  const [notes, setNotes] = useState<{ done: number; mine: boolean; after: number }[]>([])

  useEffect(() => {
    if (shown.current === state) return
    shown.current = state
    if (state === 'declined') showToastMessage(t('duel.undo.denied', { name: rivalName }), 'info')
    else if (state === 'expired') showToastMessage(t('duel.undo.expired', { name: rivalName }), 'info')
    else if (state === 'none') showToastMessage(t('auto.online.undoNone'), 'info')
  }, [state, rivalName])

  useEffect(() => {
    if (!undo || undo.done <= seen.current) return
    seen.current = undo.done
    setNotes((list) => [...list, { done: undo.done, mine: undo.mine, after: lastChat }])
  }, [undo, lastChat])

  const lane: LaneNotice | null = !usable
    ? null
    : state === 'asked'
      ? { kind: 'ask', text: t('auto.online.undoAsked', { name: rivalName }), actions: [{ label: t('duel.undo.deny'), onSelect: () => askUndo(false) }, { label: t('duel.undo.allow'), onSelect: () => askUndo(true), primary: true }] }
      : state === 'asking'
        ? { kind: 'thinking', text: t('auto.online.undoAsking', { name: rivalName }), onCancel: () => askUndo(false), cancelLabel: t('auto.online.manualCancel') }
        : null

  return {
    available: usable && ownPlay && state !== 'asked' && !snap.replaying,
    pending: state === 'asking' || state === 'agreed',
    lane,
    notes,
  }
}

interface AutoDuelTableProps {
  session: AutoSession
  online: OnlineSnapshot
  seat: Seat
  duel: Duel
  snapshot: DuelSnapshot
  status: SocketStatus
  myName: string
  deck: AutoDuelScreenProps['deck']
  onLeave: () => void
  onAbandon: () => void
  onRematch: () => void
  /** Pedir, aceptar (`true`), rechazar o retirar (`false`) seguir en modo manual (`OnlineLink.manual`). */
  request?: (yes: boolean) => void
  onManual?: (game: ManualGame) => void
  /** Pedir, aceptar (`true`), rechazar o retirar (`false`) deshacer la última jugada propia (`OnlineLink.undo`). */
  askUndo?: (yes: boolean) => void
}

/** La mesa de un duelo (una sesión): la de «Jugar solo automático» con la barra, el chat, las señales, la pausa y el resultado del duelo por enlace. */
function AutoDuelTable({ session, online, seat, duel, snapshot, status, myName, deck, onLeave, onAbandon, onRematch, request, onManual, askUndo }: AutoDuelTableProps) {
  const snap = useSyncExternalStore(session.subscribe, session.getSnapshot)
  const prefs = useAutoPrefs()
  const docked = useMediaQuery(DESKTOP_DECK_BUILDER_MEDIA_QUERY)
  const rivalName = snapshot.peerName ?? t('duel.bar.rival')
  const result = duelResult(snapshot.life.lp, snapshot.conceded)
  const manual = online.manual ?? 'idle'
  // Acordado el pase a manual, la mesa queda quieta (nada más se contesta) hasta que llega la mesa manual.
  const switching = manual === 'switching' || manual === 'agreed'
  // El anfitrión corre el núcleo: puede cortar lo que piensa. El invitado, no (el núcleo está en otro navegador).
  const asks = useAutoAsks({ session, snap, cardsById: deck.cardsById, cards: online.cards, seat, canCancel: snapshot.role === 'host', canUndo: false, waitingText: t('auto.online.rivalChoosing', { name: rivalName }), frozen: result !== null || switching, rivalName })
  const paused = !snapshot.peerPresent && result === null
  usePassToManual({ snapshot, snap, online, rivalName, onManual })
  // Al terminar, la tarjeta del resultado tapa la mesa hasta que se la cierra para mirarla.
  const [resultClosed, setResultClosed] = useState(false)
  const resultOpen = result !== null && !resultClosed
  const [chatOpen, setChatOpen] = useState(false)

  useEffect(() => {
    if (result === null) setResultClosed(false)
  }, [result])
  useGameToasts(snapshot, myName)
  useAutoStartClock(duel, snapshot)
  useClockPause(duel, snapshot, paused)
  useCoreLife(duel, snapshot, snap, seat, result)
  const signals = useSignals(snapshot)
  // La señal del rival junto a sus vidas; sus emojis, en escritorio, grandes en el medio (`RivalEmoji`).
  const rivalSignal = signals.theirs !== null && isEmojiSignal(signals.theirs) ? null : signals.theirs

  // El cartel del comienzo (vas primero o segundo), una vez, cuando el duelo nuevo termina de cargar.
  const [banner, setBanner] = useState(false)
  const bannerSeen = useRef(false)
  const hideBanner = useCallback(() => setBanner(false), [])

  useEffect(() => {
    if (bannerSeen.current || snap.status === 'loading') return
    bannerSeen.current = true
    if (snap.overlay.turn <= 1 && snap.answers.length === 0) setBanner(true)
  }, [snap.status, snap.overlay.turn, snap.answers.length])

  const undo = useLinkUndo({ snap, online, seat, host: snapshot.role === 'host', open: online.phase === 'playing' && result === null && snapshot.peerPresent && !switching && snap.status !== 'loading', rivalName, lastChat: snapshot.chat.at(-1)?.id ?? 0, askUndo })

  // El registro es el chat y, en su lugar, cada vez que se volvió atrás una jugada (las jugadas del núcleo en el registro, después).
  const feed = useMemo(() => {
    const out: FeedEntry[] = []
    const note = ({ done, mine }: { done: number; mine: boolean }): FeedEntry => ({ id: `u${done}`, kind: 'event', side: mine ? 'mine' : 'theirs', text: mine ? t('auto.online.undoneMine') : t('auto.online.undoneTheirs', { name: rivalName }) })
    let next = 0

    for (const line of snapshot.chat) {
      while (next < undo.notes.length && undo.notes[next]!.after < line.id) out.push(note(undo.notes[next++]!))
      out.push({ id: `c${line.id}`, kind: 'chat', line })
    }
    while (next < undo.notes.length) out.push(note(undo.notes[next++]!))
    return out
  }, [snapshot.chat, undo.notes, rivalName])
  const end = snap.overlay.end
  const reason = snapshot.conceded === null && end ? coreReason(end, snap.overlay.lp, seat, rivalName) : undefined
  // Lo que corta el duelo: el enlace se perdió (el anfitrión recargó), el núcleo se cayó o rechazó jugadas inválidas.
  const fault = snap.fault ?? (online.phase === 'lost' ? { kind: 'crash' as const, message: '', cards: [] } : null)
  const faultTitle = snap.fault?.kind === 'retry' ? t('auto.online.cut', { name: rivalName }) : online.phase === 'lost' && !snap.fault ? (online.problems.reason === 'lost' ? t('auto.online.lost') : t('auto.online.broken')) : undefined

  const cover = fault ? (
    <FaultCover fault={fault} {...(faultTitle ? { title: faultTitle } : {})} nameOf={(code) => asks.nameOf(null, code)} artOf={(code) => asks.artOf(null, code)} rematch={{ snapshot, rival: rivalName, onRematch }} onExit={onLeave} />
  ) : paused ? (
    <DuelPause rival={rivalName} offline={status !== 'open'} onLeave={onLeave} onReconnect={duel.reconnect} />
  ) : resultOpen ? (
    <ResultCard result={result} snapshot={snapshot} rival={rivalName} onRematch={onRematch} onLeave={onLeave} onClose={() => setResultClosed(true)} {...(reason ? { reason } : {})} />
  ) : snap.status === 'loading' || online.phase === 'starting' ? (
    <LoadingCover progress={snap.progress} note={null} />
  ) : undefined

  // Pasar a manual: con el duelo en juego y el rival en la sala. Una carta bajo el control del otro no se puede seguir en la mesa manual (ver `underControl`).
  const want = request ?? NOTHING
  const canSwitch = request !== undefined && online.phase === 'playing' && result === null && snapshot.peerPresent && snap.status !== 'loading'
  const control = underControl(snap.mine) || underControl(snap.theirs)
  const manualHint = switching ? t('auto.online.manualSwitching') : manual === 'asking' ? t('auto.online.manualAsking', { name: rivalName }) : control ? t('auto.online.manualControlHint') : t('auto.online.manualHint', { name: rivalName })

  // «Más opciones» de la barra: lo mismo que en solo (las respuestas a la cadena y la casilla) y pasar a manual; los sonidos y reconectar ya están.
  const settings = (
    <>
      <Setting title={t('auto.bar.chain')} hint={chainModeHint(prefs.chain)}>
        <Segmented label={t('auto.bar.chain')} value={prefs.chain} onChange={(mode) => setAutoPref('chain', mode)} fullWidth options={chainModeOptions()} />
      </Setting>
      <Setting title={t('auto.bar.place')} hint={t('auto.bar.placeHint')}>
        <Segmented label={t('auto.bar.place')} value={prefs.place} onChange={(mode) => setAutoPref('place', mode)} fullWidth options={[{ value: 'ask', label: t('auto.bar.ask') }, { value: 'auto', label: t('auto.bar.auto') }]} />
      </Setting>
      {canSwitch ? (
        <Setting title={t('auto.online.manualTitle')} hint={manualHint}>
          {manual === 'asking' ? (
            <Button variant="tertiary" className="justify-self-start" onClick={() => want(false)}>
              {t('auto.online.manualCancel')}
            </Button>
          ) : (
            <Button variant="secondary" icon="hand" className="justify-self-start" disabled={switching || control} onClick={() => want(true)}>
              {t('auto.online.manualAsk')}
            </Button>
          )}
        </Setting>
      ) : null}
    </>
  )
  // Lo del pase a manual en la línea: la espera (con «Cancelar pedido») y el corte. Lo que hay que contestar del núcleo va antes.
  const manualLane: LaneNotice | null = switching
    ? { kind: 'thinking', text: t('auto.online.manualSwitching') }
    : manual === 'asking' && canSwitch
      ? { kind: 'thinking', text: t('auto.online.manualAsking', { name: rivalName }), onCancel: () => want(false), cancelLabel: t('auto.online.manualCancel') }
      : null
  // El pedido del rival de deshacer va primero (se contesta ahí y no tapa la pregunta del núcleo, que vuelve después); el mío, como la espera del pase a manual.
  const lane = undo.lane?.kind === 'ask' ? undo.lane : asks.lane?.kind === 'ask' && asks.lane.actions.length > 0 ? asks.lane : (manualLane ?? undo.lane ?? asks.lane)

  const link: DuelMatLink = {
    ...asks.mat,
    // El pedido del rival va en el medio, como una pregunta del núcleo (`AskPrompt`): es lo que hay que contestar.
    prompt:
      manual === 'asked' && canSwitch ? (
        <AskPrompt key="manual" text={t('auto.online.manualAsked', { name: rivalName })} yes={{ label: t('auto.online.manualAsk'), onSelect: () => want(true) }} no={{ label: t('auto.online.manualKeep'), onSelect: () => want(false) }} />
      ) : (
        asks.mat.prompt
      ),
    header: (
      <DuelBar
        snapshot={snapshot}
        status={status}
        turn={asks.turnMine ? 'mine' : 'theirs'}
        myName={myName}
        mySignal={signals.mine}
        mySignalKey={signals.mineKey}
        chat={docked ? undefined : <DuelChatToggle snapshot={snapshot} myName={myName} onSendChat={duel.sendChat} feed={feed} open={chatOpen} onOpen={() => setChatOpen(true)} onClose={() => setChatOpen(false)} />}
        onToggleClock={duel.toggleClock}
        onRematch={onRematch}
        onLeave={onLeave}
        onAbandon={onAbandon}
        onConcede={duel.concede}
        onReconnect={duel.reconnect}
        log={docked ? undefined : <DuelLogTicker feed={feed} onOpen={() => setChatOpen(true)} />}
        resultOpen={resultOpen}
        rivalSignal={rivalSignal}
        rivalSignalKey={signals.theirsKey}
        lane={lane}
        // Un duelo que sigue a uno manual arranca en el turno 1 del núcleo: se le suma lo que llevaban las mesas de arranque (en uno de cero, nada).
        turnNumber={Math.max(1, snap.overlay.turn) + duelTurnNumber(snap.initial.mine, snap.initial.theirs) - 1}
        extraSettings={settings}
        {...(reason ? { resultReason: reason } : {})}
      />
    ),
    // Como en el duelo manual (sin calculadora: las vidas las lleva el núcleo): hasta 1100 px en el marcador de la barra, sin fila de abajo; en escritorio, planas y cada una en su esquina (D2).
    life: docked ? (
      <span className="-mt-3 flex" data-corner="mine">
        <DuelLife snapshot={snapshot} myName={myName} signal={signals.mine} signalKey={signals.mineKey} size="lg" />
      </span>
    ) : null,
    ...(docked ? { corner: <RivalLife snapshot={snapshot} signal={rivalSignal} signalKey={signals.theirsKey} size="lg" /> } : { scoreInHeader: true, scoreTall: true }),
    tools: null,
    // El chat: en escritorio, fijo a la derecha (con las reacciones); hasta 1100 px, en su panel (lo abre su botón de la barra), con las reacciones.
    aside: docked ? <DuelChatPanel snapshot={snapshot} myName={myName} onSend={duel.sendChat} feed={feed} /> : undefined,
    // Deshacer (le pide permiso al rival: `useLinkUndo`) va en la barra de arriba (`MatUndoContext`).
    undoInHeader: true,
    rivalTurnLabel: t('duel.bar.theirTurn', { name: rivalName }),
    // Deshacer le pide permiso al rival (`useLinkUndo`); el chip de la solitaria no va: acá el pedido es explícito.
    undoAvailable: undo.available,
    undoPending: undo.pending,
    ...(cover === undefined ? {} : { cover }),
  }

  return (
    // Tocar la mesa mientras cuenta una tanda la salta al final.
    <div className="contents" onPointerDownCapture={asks.settled ? undefined : asks.skipAhead}>
      <LifeHold value={asks.lifeHeld}>
        <PracticeMat session={asks.matSession} state={asks.state} cardsById={deck.cardsById} deckName={deck.name} onDispatch={sentinel} onUndo={askUndo ? () => askUndo(true) : NOTHING} onSeek={NOTHING} onLoadCombo={NOTHING} onNewHand={NOTHING} duel={link} rivalViewer={asks.rivalViewer} />
      </LifeHold>
      {asks.pieces}
      {banner ? <TurnOrderBanner first={seat === 0} rival={rivalName} onDone={hideBanner} /> : null}
      {docked ? <RivalEmoji burst={signals.burst} name={rivalName} onDismiss={signals.dismissBurst} /> : null}
    </div>
  )
}
