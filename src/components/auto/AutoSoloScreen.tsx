import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react'

import type { ChainLink } from '../../app/auto/adapter'
import { namesList } from '../../app/auto/ask-ui'
import { createDataLoader, httpSource } from '../../app/auto/auto-data'
import { createAutoSession, workerTransport, type AutoSession, type SessionOptions } from '../../app/auto/auto-session'
import type { DeckList } from '../../app/auto/deck-map'
import { REASON_DECK, REASON_LP, SCRIPT_REASON } from '../../app/auto/end-reasons'
import { manualHandover, type ManualGame } from '../../app/auto/manual-handover'
import { foldOpeningHand } from '../../app/auto/opening-hand'
import { replayFromAuto } from '../../app/auto/auto-replay'
import type { Seat } from '../../app/auto/protocol'
import type { BotNote } from '../../app/auto/auto-session'
import { seatOf, setAutoPref, useAutoPrefs } from '../../app/auto-prefs'
import { setDuelFullscreen } from '../../app/duel-fullscreen'
import { autoRival, dealRival, poolCount, readHandtrapConfig, rivalCardOf, writeHandtrapConfig, type AutoRival, type HandtrapConfig } from '../../app/handtraps'
import { parseDerivedCardId } from '../../app/calculator-state'
import { LifeHold } from '../../app/life-effects'
import { randomSeed, type MatState, type RivalHand } from '../../app/practice-mat'
import type { ReplayView } from '../../app/duel-replay'
import { DESKTOP_DECK_BUILDER_MEDIA_QUERY, useMediaQuery } from '../../app/use-media-query'
import { t } from '../../i18n'
import { LifeScore } from '../duel/LifeScore'
import { HandtrapPicker } from '../duel/HandtrapPool'
import { PracticeMat, type DuelMatLink, type MatCard } from '../probability/PracticeMat'
import { cardIdOfDrawId } from '../probability/practice'
import { usePracticeChips, type PracticeLab } from '../probability/use-practice-chips'
import { Button } from '../ui/Button'
import { CloseButton } from '../ui/IconButton'
import { SaveReplayDialog } from '../replays/SaveReplayDialog'
import { AutoBar, AutoDock, type AutoOptions } from './AutoBar'
import { BotLogSheet, botTurns } from './BotLog'
import { FaultCover, LoadingCover } from './AutoCovers'
import { deckOf } from './deck-list'
import { ManualDialog } from './ManualDialog'
import { sentinel, useAutoAsks } from './use-auto-asks'

export { STEP_MS } from './use-auto-asks'

/**
 * «Jugar solo automático (beta)»: la mesa de siempre (`PracticeMat` con la composición del duelo: el campo del rival arriba, la barra, el detalle a la izquierda) jugada contra el
 * núcleo de reglas (`createAutoSession`: `ocgcore` en un Worker; el rival, pasivo o con las handtraps del simulador de «Jugar solo», que usa solo: su mano va boca arriba en el lugar de la
 * mano del rival, salvo «A ciegas», y lo que activa se cuenta grande en el centro). La pantalla **nunca despacha una jugada**: las jugadas las cuenta el núcleo y las preguntas se
 * contestan en la mesa, con lo que comparte con el duelo por enlace (`useAutoAsks`: el ritmo de a un paso, los menús, las casillas y el brillo, las piezas de afuera, la línea).
 * Acá queda lo de jugar solo: la barra (`AutoBar`: la de la práctica), las vidas (en escritorio, en las esquinas del campo) y la botonera de escritorio (`AutoDock`), el rival de handtraps y su hoja, deshacer, «Nueva mano», reiniciar, la ventana grande
 * y las portadas (carga, error, fin). Lo que no tiene pantalla todavía se contesta solo; si no hay respuesta segura, la línea avisa y ofrece deshacer (la sesión nunca queda colgada).
 */

export interface AutoSoloScreenProps {
  /** Las copias del Main y del Extra del deck armado (`card-123-2`), y cómo se llama cada una (como en la práctica). */
  mainIds: readonly string[]
  extraIds: readonly string[]
  cardsById: ReadonlyMap<string, MatCard>
  deckName: string
  /** La mano de apertura del Lab: cuántas cartas robás al empezar (el núcleo reparte 5 si no se dice). */
  handSize?: number
  /** La flecha de la barra («Volver a Jugar», como en la práctica): vuelve al lobby. */
  onExit: () => void
  /**
   * «Seguir en modo manual» (de «Más opciones», del error del núcleo o del final): la partida, para seguirla en la mesa manual (vuelta atrás las jugadas que se eligieron), o `null`
   * si no llegó a empezar (el núcleo no arrancó: una mano nueva). Sin esto, no se ofrece.
   */
  onManual?: (game: ManualGame | null) => void
  /** Las reglas del Lab: con esto, las salidas y problemas de tu mano de apertura (los chips de la práctica) debajo de los pasos o sobre tu mano. */
  lab?: PracticeLab
  /**
   * «Seguir en automático» de la práctica: el núcleo sigue desde esta mesa manual (y estas vidas) en vez de repartir; con handtraps, el rival con la mano que tenía. Reiniciar vuelve
   * a esta mesa; «Nueva mano» la suelta (un duelo nuevo). No se guarda.
   */
  resume?: { state: MatState; lp: readonly [number, number] }
  /**
   * Arma la sesión (una de mentira en las pruebas); sin esto, la de verdad: los datos por HTTP y el núcleo en un Worker. `rival`: el de handtraps del simulador (`null`, el
   * pasivo); `seed`: la del duelo de antes (cambiar las handtraps reinicia el mismo duelo, como «Reiniciar el mismo duelo»); `resume`: la mesa manual de la que sigue.
   */
  connect?: (deck: DeckList, options: { handSize?: number; rival?: AutoRival | null; seed?: number; seat?: Seat; resume?: SessionOptions['resume'] }) => AutoSession
}

/** La mano de handtraps del rival en la mesa manual (sin las que ya usó) y sus nombres: la que sigue en el automático y la que vuelve a la manual. */
type ResumedRival = { hand: string[]; names: Record<string, string> } | null
const rivalCode = (id: string) => Number(rivalCardOf(id).split('-')[1] ?? 0)

function resumedRival(rival: RivalHand | undefined, config: HandtrapConfig): ResumedRival {
  if (!rival) return null
  const hand = rival.hand.filter((id) => !rival.used.includes(id))

  return { hand, names: Object.fromEntries(hand.map((id) => [id, config.picks.find((pick) => pick.id === rivalCode(id))?.name ?? ''])) }
}

/** Lo que se deja leer lo que hizo el rival (la carta que activó, grande, y lo que se negó): lo mismo que en el duelo por enlace. */
export const RIVAL_READ_MS = 3000
const NOTHING = () => {}

const connectLive: NonNullable<AutoSoloScreenProps['connect']> = (deck, options) => createAutoSession({ loader: createDataLoader(httpSource()), deck, transport: workerTransport(), ...options })

export function AutoSoloScreen({ mainIds, extraIds, cardsById, deckName, handSize, onExit, onManual, lab, resume, connect = connectLive }: AutoSoloScreenProps) {
  // Las handtraps del rival: las del simulador de «Jugar solo» (`app/handtraps.ts`); cambiarlas arma otra sesión con la misma semilla.
  const [handtraps, setHandtraps] = useState<HandtrapConfig>(readHandtrapConfig)
  const [live, setLive] = useState<{ session: AutoSession; seat: Seat; n: number } | null>(null)
  const seed = useRef<number | undefined>(undefined)
  // Quién empieza (la hoja de reglas de Jugar): el asiento sale de la semilla al armar la sesión. Con «Al azar», «Nueva mano» arma otra sesión con una semilla nueva
  // (`fresh`: el asiento puede cambiar y el de una sesión es fijo); si no, la misma sesión reparte otra (`restart`).
  const { first } = useAutoPrefs()
  const fresh = useRef<number | undefined>(undefined)
  const [deal, setDeal] = useState(0)
  // La mesa manual de la que sigue (`resume`): cambiar las handtraps le suelta la mano del rival (reparte la semilla) y «Nueva mano», la mesa entera.
  const [from, setFrom] = useState(() => resume && { ...resume, rival: resumedRival(resume.state.rival, handtraps) })

  // Las cartas del deck (para la fila de una que no esté en ninguna base): se leen al armar la sesión; otro mapa con las mismas cartas no arma otra.
  const cardsRef = useRef(cardsById)

  useEffect(() => {
    cardsRef.current = cardsById
  }, [cardsById])
  // En un efecto (y no en el render): con `StrictMode` el montaje se repite y la sesión de la primera pasada se destruye.
  useEffect(() => {
    const resumeOf = (at: NonNullable<typeof from>): SessionOptions['resume'] => ({ mine: at.state, codeOf: (_, id) => parseDerivedCardId(cardIdOfDrawId(id)) ?? 0, lp: at.lp, ...(at.rival ? { rivalHand: at.rival.hand.map(rivalCode) } : {}) })
    const at = fresh.current ?? seed.current ?? randomSeed()

    fresh.current = undefined
    // Seguir de la mesa manual es seguir tu turno: vas en el asiento 0, el que tiene el turno.
    const seat = from ? 0 : seatOf(first, at)
    const session = connect(deckOf(mainIds, extraIds, cardsRef.current), { ...(handSize === undefined ? {} : { handSize }), rival: autoRival(handtraps), seed: at, seat, ...(from ? { resume: resumeOf(from) } : {}) })

    // Otra sesión, otra mesa: la pantalla arranca de cero (`key`).
    setLive((current) => ({ session, seat, n: (current?.n ?? 0) + 1 }))

    // La semilla con la que termina (la de la última «Nueva mano»): la que sigue, al cambiar las handtraps, es el mismo duelo.
    return () => {
      seed.current = session.getSnapshot().seed
      session.destroy()
    }
  }, [connect, mainIds, extraIds, handSize, handtraps, from, first, deal])
  // La ventana grande es de la mesa: al salir de ella se apaga (como en el duelo).
  useEffect(() => () => setDuelFullscreen(false), [])
  // Hasta 1100 px los avisos van arriba, debajo del marcador: sin la barra de abajo, abajo caían sobre tu mano (ver index.css).
  useEffect(() => {
    document.body.dataset.duel = 'solo'

    return () => {
      delete document.body.dataset.duel
    }
  }, [])

  const changeHandtraps = useCallback((next: HandtrapConfig) => {
    writeHandtrapConfig(next)
    setHandtraps(next)
    setFrom((at) => at && { ...at, rival: null })
  }, [])
  // «Nueva mano» con «Al azar»: otra sesión con otra semilla, que vuelve a sortear quién empieza.
  const redeal = useMemo(
    () =>
      first === 'random'
        ? () => {
            fresh.current = randomSeed()
            setDeal((count) => count + 1)
          }
        : undefined,
    [first],
  )

  return live ? (
    <AutoDuel key={live.n} session={live.session} seat={live.seat} {...(redeal ? { redeal } : {})} cardsById={cardsById} deckName={deckName} onExit={onExit} {...(onManual ? { onManual } : {})} handtraps={handtraps} onHandtraps={changeHandtraps} lab={lab ?? NO_LAB} {...(from ? { resumed: { rival: from.rival, onNewHand: () => setFrom(undefined) } } : {})} />
  ) : (
    <LoadingCover progress={{ done: 0, total: 0 }} rival={autoRival(handtraps) !== null} />
  )
}

interface AutoDuelProps {
  session: AutoSession
  /** Tu asiento del núcleo: el 0 empieza; con el 1 vas segundo (las vidas, el turno y el final se leen desde acá). */
  seat: Seat
  /** «Nueva mano» con «Al azar»: otra sesión (vuelve a sortear quién empieza). Sin esto, la misma sesión reparte otra. */
  redeal?: () => void
  cardsById: ReadonlyMap<string, MatCard>
  deckName: string
  onExit: () => void
  onManual?: AutoSoloScreenProps['onManual']
  /** Las handtraps del rival (encendidas, las usa) y cambiarlas desde «Más opciones» (el duelo empieza de nuevo). */
  handtraps: HandtrapConfig
  onHandtraps: (next: HandtrapConfig) => void
  lab: PracticeLab
  /** Sigue de la mesa manual: la mano del rival que tenía (la que vuelve a la manual) y «Nueva mano», que suelta esa mesa. */
  resumed?: { rival: ResumedRival; onNewHand: () => void }
}

/** Sin las reglas del Lab (las pruebas), no hay chips: un deck vacío no alcanza para una mano. */
const NO_LAB: PracticeLab = { handSize: 5, derivedMainCards: [], patterns: [], hasCompletedClassification: true, reviewPendingPatternCount: 0 }

function AutoDuel({ session, seat, redeal, cardsById, deckName, onExit, onManual, handtraps, onHandtraps, lab, resumed }: AutoDuelProps) {
  const snap = useSyncExternalStore(session.subscribe, session.getSnapshot)
  const prefs = useAutoPrefs()
  // Hasta 1100 px las vidas van en el marcador de la barra (`AutoBar`) y la mesa no lleva fila de abajo (`scoreInHeader`); en escritorio, planas en las esquinas del campo.
  const docked = useMediaQuery(DESKTOP_DECK_BUILDER_MEDIA_QUERY)
  // Con laterales (lo sabe la barra) las vidas van en el izquierdo; sin ellos, en escritorio, en las esquinas del campo.
  const [rails, setRails] = useState(false)
  // «Pasos» de la botonera (escritorio): muestra u oculta el panel de la derecha.
  const [stepsOpen, setStepsOpen] = useState(true)
  const rivalName = t('duel.bar.rival')
  // La mesa y las preguntas del núcleo (lo mismo que en el duelo por enlace): acá se puede cortar al núcleo y deshacer.
  // El rival de handtraps (con el simulador encendido y alguna carta): su mano boca arriba, como en el simulador manual (así se sabe qué tiene), salvo «A ciegas»: de dorso, y cada carta se ve al usarla.
  const rivalOn = useMemo(() => autoRival(handtraps) !== null, [handtraps])
  // «Seguir en modo manual»: el diálogo (`opened` lo vuelve a «Nada» cada vez que se abre) y la partida que pasa, calculada sólo con él abierto. Sin una mesa todavía (el núcleo
  // que no arrancó), una mano nueva: no hay nada que elegir.
  const [switching, setSwitching] = useState(false)
  const [opened, setOpened] = useState(0)
  // Una sola función por sesión (lee la mesa y el `onManual` de ahora al tocarse, no al dibujarse: la pantalla de arriba lo arma de nuevo en cada dibujo suyo): lo que la recibe (la mesa, la
  // barra) no se vuelve a dibujar por ella.
  const manualRef = useRef(onManual)

  useEffect(() => {
    manualRef.current = onManual
  }, [onManual])
  const hasManual = onManual !== undefined
  const openManual = useMemo(
    () =>
      hasManual
        ? () => {
            if (session.getSnapshot().mineActions.length === 0) return manualRef.current?.(null)
            setOpened((count) => count + 1)
            setSwitching(true)
          }
        : undefined,
    [hasManual, session],
  )
  const asks = useAutoAsks({ session, snap, cardsById, seat, canCancel: true, canUndo: true, waitingText: null, rivalName, rivalPhases: true, ...(rivalOn && !prefs.blind ? { rivalHand: snap.rivalHand } : {}), ...(openManual ? { onManual: openManual } : {}) })
  const { nameOf, artOf } = asks
  // Las salidas y problemas de tu mano de apertura, como en la práctica (con la primera jugada se van; repasando, las de la mano del combo). Con la mesa de la práctica rearmada (`resumed`) la mano ya no es de apertura: sin chips.
  const chips = usePracticeChips(lab, asks.matSession)
  // La hoja para cambiar las handtraps del rival.
  const [choosing, setChoosing] = useState(false)
  // «Guardar replay» (el final y «Más opciones»): el duelo como está al tocar guardar, desde tu lado (sin nombres: «Jugar solo» no los tiene).
  const [saving, setSaving] = useState(false)
  const openSave = useCallback(() => setSaving(true), [])
  const buildReplay = useCallback(
    (view: ReplayView) => replayFromAuto(session.getSnapshot(), { seat, mode: 'solo-auto', view, players: ['', ''], theirCode: (id) => session.adapter?.codeOf({ side: 'theirs', id }) ?? 0 }),
    [session, seat],
  )
  const kept = resumed?.rival
  const rivalDeal = useMemo(() => (kept ? { rival: { hand: kept.hand, used: [] }, names: kept.names } : dealRival(handtraps, snap.seed)), [kept, handtraps, snap.seed])
  const handover = useMemo(
    () => (switching ? manualHandover(snap, (id) => cardsById.get(id)?.name, rivalDeal ? { hand: rivalDeal.rival, names: rivalDeal.names } : undefined) : null),
    [switching, snap, cardsById, rivalDeal],
  )
  const linkName = useCallback((link: ChainLink) => nameOf(link.card, link.code), [nameOf])
  // «Qué hizo el bot y por qué» (el final y «Opciones del duelo»): los motivos del rival, que van en sus respuestas. Tocar uno lleva tu mesa a ese momento (el repaso de tus jugadas;
  // la mano de apertura es el paso 0, así que se cuenta sin su jugada).
  const [logOpen, setLogOpen] = useState(false)
  const openLog = useCallback(() => setLogOpen(true), [])
  const botLog = useMemo(() => botTurns(snap.answers), [snap.answers])
  const skipped = foldOpeningHand(snap.initial.mine, snap.mineActions.slice(0, 1)).skip
  const { seek } = asks.review
  const pickNote = useCallback(
    (note: BotNote) => {
      setLogOpen(false)
      seek(Math.max(0, note.at - skipped))
    },
    [seek, skipped],
  )
  const codeName = useCallback((code: number) => nameOf(null, code), [nameOf])
  const codeArt = useCallback((code: number) => artOf(null, code), [artOf])

  // ── Lo que activa el rival (sus handtraps): el núcleo resuelve la cadena de una, así que se cuenta después y se deja leer (`RIVAL_READ_MS`). La carta grande en el centro,
  // con a qué responde (como en el duelo por enlace); lo que se negó lo dice su eslabón en el aviso de la cadena. Se mira la cadena (una Trampa que activa desde la mano llega a la mesa colocada, no como
  // «activar»): después de cada eslabón del rival el núcleo te pregunta, así que la mesa siempre lo ve abierto. Sale cuando la mesa llega a su eslabón (`from`, su lugar en `order`: en su
  // turno, después de lo que jugó antes). Lo que vuelve a llegar al rearmarse la mesa no se cuenta otra vez. ──
  const [told, setTold] = useState<{ effect?: NonNullable<DuelMatLink['rivalEffect']>; from: number } | null>(null)
  const heard = useRef({ initial: snap.initial, chain: snap.overlay.chain.length })

  useEffect(() => {
    const before = heard.current
    const now = snap.overlay

    heard.current = { initial: snap.initial, chain: now.chain.length }
    if (snap.replaying || before.initial !== snap.initial) return
    const at = now.chain.findLastIndex((link, i) => i >= before.chain && link.card?.side === 'theirs')
    const link = now.chain[at]
    const effect = link
      ? { key: Date.now(), kind: 'activate' as const, cards: [{ id: link.card!.id, art: artOf(link.card, link.code), name: linkName(link) }], caption: at > 0 ? t('auto.rival.responds', { name: rivalName, to: linkName(now.chain[at - 1]!) }) : t('duel.announce.activate', { name: rivalName }), linger: true }
      : undefined

    const from = snap.chainSteps.findLast((step) => step.kind === 'chain' && step.link?.card?.side === 'theirs' && step.link.card.id === link?.card?.id)?.seq ?? 0

    if (effect) setTold({ effect, from })
  }, [snap.initial, snap.overlay, snap.replaying, snap.chainSteps, artOf, linkName, rivalName])
  const toldNow = told !== null && asks.shownAt >= told.from
  useEffect(() => {
    if (!toldNow) return
    const timer = window.setTimeout(() => setTold(null), RIVAL_READ_MS)

    return () => window.clearTimeout(timer)
  }, [toldNow, told])

  // El núcleo se cayó o se trabó a mitad del duelo: además de reiniciar, volver a antes de tu última jugada (la sesión arma otro núcleo).
  const recoverable = (snap.fault?.kind === 'crash' || snap.fault?.kind === 'retry') && asks.undoable
  const { fault, status, progress } = snap
  const { end, lp } = snap.overlay
  const undo = useCallback(() => session.undo(), [session])
  const restart = useCallback(() => session.restart(), [session])
  // Cada pieza que la mesa recibe se arma de nuevo sólo cuando cambia lo que muestra: los avisos del núcleo que no la tocan no vuelven a dibujar la mesa (`PracticeMat` compara sus props).
  const cover = useMemo(
    () =>
      fault ? (
        <FaultCover fault={fault} onRetry={restart} {...(recoverable ? { onUndo: undo } : {})} {...(openManual ? { onManual: openManual } : {})} onExit={onExit} />
      ) : status === 'ended' && end ? (
        <EndCover end={end} lp={lp} seat={seat} rival={rivalName} onAgain={restart} onSave={openSave} onLog={openLog} {...(openManual ? { onManual: openManual } : {})} onExit={onExit} />
      ) : status === 'loading' ? (
        <LoadingCover progress={progress} rival={rivalOn} />
      ) : undefined,
    [fault, restart, recoverable, undo, openManual, onExit, status, end, lp, seat, rivalName, progress, rivalOn, openSave, openLog],
  )

  // Las vidas van por asiento (las tuyas son las de `seat`): las de lo que la mesa ya contó (`asks.lp`).
  const [shownMine, shownTheirs] = [asks.lp[seat]!, asks.lp[1 - seat]!]
  const life = useMemo(() => ({ mine: shownMine, theirs: shownTheirs }), [shownMine, shownTheirs])
  // Repasando un combo (o tus jugadas) la mesa es la del repaso: el turno de la barra es el del paso que se mira, y la portada (el fin, un error), la mano del rival y lo que activa
  // esperan a «Volver al duelo».
  const reviewing = asks.review.active
  // Lo que se ajusta: en «Más opciones» de la barra (celular) y en la botonera (escritorio).
  const options = useMemo<AutoOptions>(
    () => ({
      chain: prefs.chain,
      onChain: (mode) => setAutoPref('chain', mode),
      place: prefs.place,
      onPlace: (mode) => setAutoPref('place', mode),
      onRestart: restart,
      onSaveReplay: openSave,
      onBotLog: openLog,
      ...(openManual ? { onManual: openManual } : {}),
      handtraps: {
        on: rivalOn,
        summary: rivalOn ? t('auto.bar.handtrapsOn', { cards: namesList(handtraps.picks.flatMap((pick) => Array<string>(pick.copies).fill(pick.name))), hand: Math.min(handtraps.hand, poolCount(handtraps.picks)) }) : t('auto.bar.handtrapsOff'),
        onChange: () => setChoosing(true),
      },
      blind: prefs.blind,
      onBlind: (on) => setAutoPref('blind', on),
    }),
    [prefs.chain, prefs.place, prefs.blind, restart, openSave, openLog, openManual, rivalOn, handtraps],
  )
  const turn = reviewing ? asks.state.turn : asks.turn
  const canUndo = asks.undoable && status !== 'thinking' && !snap.replaying
  const { turnMine, lane } = asks
  // Otro duelo con otra semilla (otras cartas, también las del rival), sin volver a cargar el núcleo; «Reiniciar el mismo duelo» queda en «Más opciones».
  const newHand = useCallback(() => (resumed ? resumed.onNewHand() : redeal ? redeal() : session.restart(randomSeed())), [resumed, redeal, session])
  // La hoja ya guardó las handtraps nuevas: el duelo se arma de nuevo con ellas (la misma semilla, como «Cambiar handtraps» de «Más opciones»).
  const applyHandtraps = useCallback(() => onHandtraps(readHandtrapConfig()), [onHandtraps])
  const header = useMemo(
    () => <AutoBar rivalName={rivalName} life={life} onRails={setRails} turn={turn} myTurn={turnMine} onExit={onExit} onUndo={undo} canUndo={canUndo} onNewHand={newHand} onHandtraps={applyHandtraps} lane={lane} dock {...options} />,
    [rivalName, life, turn, turnMine, onExit, undo, canUndo, newHand, applyHandtraps, lane, options],
  )
  // Escritorio sin laterales (Gastón, 2026-10-27, opción D2 «esquinas sin caja»): cada vida en su esquina, plana (sin placa, chapa, barra ni cartas en la mano): la del rival junto a su mano (arriba a la
  // derecha del campo, `corner`) y la tuya abajo a la izquierda, junto a la botonera, subida 12 px sobre el borde de la mano (`-mt-3`, como la placa: la fila no crece y el campo no se corre). Con
  // laterales van en el izquierdo (`AutoBar`); hasta 1100 px, en el marcador de la barra y la mesa no lleva fila de abajo (`scoreInHeader`). La fase, sólo en el botón del campo (su sigla).
  const myLife = useMemo(
    () =>
      rails || !docked ? null : (
        <span className="-mt-3 flex" data-corner="mine">
          <LifeScore name={t('duel.bar.you')} label={t('duel.bar.you')} life={life.mine} mine size="lg" />
        </span>
      ),
    [rails, docked, life.mine],
  )
  const corner = useMemo(() => (docked ? <LifeScore name={rivalName} label={t('duel.bar.rivalTag')} life={life.theirs} size="lg" /> : undefined), [docked, rivalName, life.theirs])
  const toggleSteps = useCallback(() => setStepsOpen((open) => !open), [])
  const dock = useMemo(() => (docked ? <AutoDock {...options} steps={{ open: stepsOpen, onToggle: toggleSteps }} /> : undefined), [docked, options, stepsOpen, toggleSteps])
  const link: DuelMatLink = {
    ...asks.mat,
    header,
    tools: null,
    life: myLife,
    ...(docked ? { corner } : { scoreInHeader: true }),
    ...(docked ? { dock } : {}),
    rivalTurnLabel: t('duel.bar.theirTurn', { name: rivalName }),
    ...(asks.notice ? { notice: asks.notice } : {}),
    ...(told?.effect && toldNow && !reviewing ? { rivalEffect: told.effect } : {}),
    // Deshacer va arriba, con los íconos de la práctica.
    undoInHeader: true,
    // El panel de la práctica: los pasos (la cinta del núcleo, con la mano de apertura como paso 0) y los combos. En escritorio, «Pasos» de la botonera lo oculta.
    steps: stepsOpen || !docked,
    ...(cover === undefined || reviewing ? {} : { cover }),
  }

  return (
    // Tocar la mesa mientras cuenta una tanda la salta al final.
    <div className="contents" onPointerDownCapture={asks.settled ? undefined : asks.skipAhead}>
      {/* Los pasos del panel y los combos guardados se repasan en esta misma mesa (`asks.review`); nada se despacha. */}
      <LifeHold value={asks.lifeHeld}>
        <PracticeMat
          session={asks.matSession}
          state={asks.state}
          cardsById={cardsById}
          deckName={deckName}
          onDispatch={sentinel}
          onUndo={undo}
          onSeek={asks.review.seek}
          onLoadCombo={asks.review.load}
          onNewHand={NOTHING}
          duel={link}
          rivalViewer={asks.rivalViewer}
          {...(chips.needCards || resumed ? {} : { footer: chips.footer, footerSummary: chips.summary, highlighted: chips.highlighted, highlightKind: chips.highlightKind, muted: chips.muted })}
        />
      </LifeHold>
      {/* La hoja del simulador de handtraps: aplicar (o apagarlo) arma el duelo de nuevo, con la misma semilla. */}
      <HandtrapPicker
        isOpen={choosing}
        config={handtraps}
        auto
        onClose={() => setChoosing(false)}
        onSave={(picks, hand, extra, ownTurn) => {
          setChoosing(false)
          onHandtraps({ enabled: true, picks, hand, extra, ownTurn })
        }}
        {...(handtraps.enabled
          ? {
              onTurnOff: () => {
                setChoosing(false)
                onHandtraps({ ...handtraps, enabled: false })
              },
            }
          : {})}
      />
      {asks.pieces}
      <SaveReplayDialog isOpen={saving} onClose={() => setSaving(false)} build={buildReplay} />
      <BotLogSheet isOpen={logOpen} onClose={() => setLogOpen(false)} turns={botLog} deciding={rivalOn} loading={snap.replaying} nameOf={codeName} artOf={codeArt} onPick={pickNote} />
      <ManualDialog
        key={opened}
        isOpen={switching}
        plays={handover?.plays ?? []}
        busy={snap.replaying}
        rivalHand={rivalDeal !== null}
        onClose={() => setSwitching(false)}
        onConfirm={(back) => {
          setSwitching(false)
          if (handover) onManual?.(handover.session(back))
        }}
      />
    </div>
  )
}

/** El final: quién ganó y por qué, «Qué hizo el bot», «Guardar replay» y «Jugar otra vez» (la misma semilla: el mismo duelo) o, con `onManual`, seguir la partida en la mesa manual. */
function EndCover({ end, lp, seat, rival, onAgain, onSave, onLog, onManual, onExit }: { end: { winner: number; reason: number }; lp: readonly [number, number]; seat: Seat; rival: string; onAgain: () => void; onSave: () => void; onLog: () => void; onManual?: () => void; onExit: () => void }) {
  const won = end.winner === seat
  const [mine, theirs] = [lp[seat], lp[1 - seat]!]
  const title = end.winner === 2 ? t('duel.result.title.draw') : won ? t('duel.result.title.win') : t('duel.result.title.lose')
  // Por qué: las vidas (el núcleo dice 0, o alguien quedó en 0), sin robar (con las vidas enteras y una razón del núcleo, no de un script: en un duelo solo sin reloj no hay otra) o el efecto de una carta.
  const reason =
    end.winner === 2
      ? t('duel.result.reason.draw')
      : end.reason === REASON_LP || (won ? theirs : mine) <= 0
        ? won
          ? t('duel.result.reason.winLife', { name: rival })
          : t('duel.result.reason.loseLife')
        : end.reason === REASON_DECK || end.reason < SCRIPT_REASON
          ? t(won ? 'auto.end.deckOutWin' : 'auto.end.deckOutLose')
          : t(won ? 'auto.end.effectWin' : 'auto.end.effectLose')

  return (
    <div role="alertdialog" aria-modal="true" aria-label={title} className="relative grid h-full place-items-center bg-background/85 p-6">
      <CloseButton size="md" aria-label={t('duel.bar.leave')} title={t('duel.bar.leave')} className="absolute right-3 top-3" onClick={onExit} />
      <div className="grid max-w-xs justify-items-center gap-3 text-center">
        <p className="m-0 text-title font-bold text-foreground">{title}</p>
        <p className="m-0 text-body text-muted" role="status">
          {reason}
        </p>
        <p className="m-0 text-micro tabular-nums text-soft">{`${t('duel.bar.you')} ${mine} · ${rival} ${theirs}`}</p>
        <Button variant="tertiary" icon="chat" aria-haspopup="dialog" onClick={onLog}>
          {t('auto.bot.log.open')}
        </Button>
        <div className="flex flex-wrap justify-center gap-2">
          <Button variant="secondary" icon="save" aria-haspopup="dialog" onClick={onSave}>
            {t('meta.duels.save.button')}
          </Button>
          {onManual ? (
            <Button variant="secondary" icon="hand" onClick={onManual}>
              {t('auto.bar.manual')}
            </Button>
          ) : null}
          <Button variant="primary" icon="refresh" onClick={onAgain}>
            {t('auto.end.again')}
          </Button>
        </div>
      </div>
    </div>
  )
}
