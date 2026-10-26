import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react'

import type { ChainLink } from '../../app/auto/adapter'
import { namesList } from '../../app/auto/ask-ui'
import { createDataLoader, httpSource } from '../../app/auto/auto-data'
import { createAutoSession, workerTransport, type AutoSession } from '../../app/auto/auto-session'
import type { DeckList } from '../../app/auto/deck-map'
import { REASON_DECK, REASON_LP, SCRIPT_REASON } from '../../app/auto/end-reasons'
import { manualHandover, type ManualGame } from '../../app/auto/manual-handover'
import { setAutoPref, useAutoPrefs } from '../../app/auto-prefs'
import { setDuelFullscreen } from '../../app/duel-fullscreen'
import { autoRival, dealRival, poolCount, readHandtrapConfig, writeHandtrapConfig, type AutoRival, type HandtrapConfig } from '../../app/handtraps'
import { randomSeed } from '../../app/practice-mat'
import { DESKTOP_DECK_BUILDER_MEDIA_QUERY, useMediaQuery } from '../../app/use-media-query'
import { t } from '../../i18n'
import { HandtrapPicker } from '../duel/HandtrapPool'
import { PracticeMat, type DuelMatLink, type MatCard } from '../probability/PracticeMat'
import { usePracticeChips, type PracticeLab } from '../probability/use-practice-chips'
import { Button } from '../ui/Button'
import { CloseButton } from '../ui/IconButton'
import { AutoBar, AutoLives } from './AutoBar'
import { FaultCover, LoadingCover } from './AutoCovers'
import { deckListOf } from './deck-list'
import { ManualDialog } from './ManualDialog'
import { sentinel, useAutoAsks } from './use-auto-asks'

export { STEP_MS } from './use-auto-asks'

/**
 * «Jugar solo automático (beta)»: la mesa de siempre (`PracticeMat` con la composición del duelo: el campo del rival arriba, la barra, el detalle a la izquierda) jugada contra el
 * núcleo de reglas (`createAutoSession`: `ocgcore` en un Worker; el rival, pasivo o con las handtraps del simulador de «Jugar solo», que usa solo: su mano va boca arriba en el lugar de la
 * mano del rival, salvo «A ciegas», y lo que activa se cuenta grande en el centro). La pantalla **nunca despacha una jugada**: las jugadas las cuenta el núcleo y las preguntas se
 * contestan en la mesa, con lo que comparte con el duelo por enlace (`useAutoAsks`: el ritmo de a un paso, los menús, las casillas y el brillo, las piezas de afuera, la línea).
 * Acá queda lo de jugar solo: la barra (`AutoBar`: la de la práctica, con las vidas de los dos), el rival de handtraps y su hoja, deshacer, «Nueva mano», reiniciar, la ventana grande
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
   * si no llegó a empezar (cartas sin reglas: una mano nueva). Sin esto, no se ofrece.
   */
  onManual?: (game: ManualGame | null) => void
  /** Las reglas del Lab: con esto, las salidas y problemas de tu mano de apertura (los chips de la práctica) debajo de los pasos o sobre tu mano. */
  lab?: PracticeLab
  /**
   * Arma la sesión (una de mentira en las pruebas); sin esto, la de verdad: los datos por HTTP y el núcleo en un Worker. `rival`: el de handtraps del simulador (`null`, el
   * pasivo); `seed`: la del duelo de antes (cambiar las handtraps reinicia el mismo duelo, como «Reiniciar el mismo duelo»).
   */
  connect?: (deck: DeckList, options: { handSize?: number; rival?: AutoRival | null; seed?: number }) => AutoSession
}

/** Lo que se deja leer lo que hizo el rival (la carta que activó, grande, y lo que se negó): lo mismo que en el duelo por enlace. */
export const RIVAL_READ_MS = 3000
const NOTHING = () => {}

const connectLive: NonNullable<AutoSoloScreenProps['connect']> = (deck, options) => createAutoSession({ loader: createDataLoader(httpSource()), deck, transport: workerTransport(), ...options })

export function AutoSoloScreen({ mainIds, extraIds, cardsById, deckName, handSize, onExit, onManual, lab, connect = connectLive }: AutoSoloScreenProps) {
  // Las handtraps del rival: las del simulador de «Jugar solo» (`app/handtraps.ts`); cambiarlas arma otra sesión con la misma semilla.
  const [handtraps, setHandtraps] = useState<HandtrapConfig>(readHandtrapConfig)
  const [live, setLive] = useState<{ session: AutoSession; n: number } | null>(null)
  const seed = useRef<number | undefined>(undefined)

  // En un efecto (y no en el render): con `StrictMode` el montaje se repite y la sesión de la primera pasada se destruye.
  useEffect(() => {
    const session = connect({ main: deckListOf(mainIds), extra: deckListOf(extraIds) }, { ...(handSize === undefined ? {} : { handSize }), rival: autoRival(handtraps), ...(seed.current === undefined ? {} : { seed: seed.current }) })

    // Otra sesión, otra mesa: la pantalla arranca de cero (`key`).
    setLive((current) => ({ session, n: (current?.n ?? 0) + 1 }))

    // La semilla con la que termina (la de la última «Nueva mano»): la que sigue, al cambiar las handtraps, es el mismo duelo.
    return () => {
      seed.current = session.getSnapshot().seed
      session.destroy()
    }
  }, [connect, mainIds, extraIds, handSize, handtraps])
  // La ventana grande es de la mesa: al salir de ella se apaga (como en el duelo).
  useEffect(() => () => setDuelFullscreen(false), [])

  const changeHandtraps = useCallback((next: HandtrapConfig) => {
    writeHandtrapConfig(next)
    setHandtraps(next)
  }, [])

  return live ? (
    <AutoDuel key={live.n} session={live.session} cardsById={cardsById} deckName={deckName} onExit={onExit} {...(onManual ? { onManual } : {})} handtraps={handtraps} onHandtraps={changeHandtraps} lab={lab ?? NO_LAB} />
  ) : (
    <LoadingCover progress={{ done: 0, total: 0 }} rival={autoRival(handtraps) !== null} />
  )
}

interface AutoDuelProps {
  session: AutoSession
  cardsById: ReadonlyMap<string, MatCard>
  deckName: string
  onExit: () => void
  onManual?: AutoSoloScreenProps['onManual']
  /** Las handtraps del rival (encendidas, las usa) y cambiarlas desde «Más opciones» (el duelo empieza de nuevo). */
  handtraps: HandtrapConfig
  onHandtraps: (next: HandtrapConfig) => void
  lab: PracticeLab
}

/** Sin las reglas del Lab (las pruebas), no hay chips: un deck vacío no alcanza para una mano. */
const NO_LAB: PracticeLab = { handSize: 5, derivedMainCards: [], patterns: [], hasCompletedClassification: true, reviewPendingPatternCount: 0 }

function AutoDuel({ session, cardsById, deckName, onExit, onManual, handtraps, onHandtraps, lab }: AutoDuelProps) {
  const snap = useSyncExternalStore(session.subscribe, session.getSnapshot)
  const prefs = useAutoPrefs()
  const docked = useMediaQuery(DESKTOP_DECK_BUILDER_MEDIA_QUERY)
  // En escritorio, si las vidas entran en la barra (lo mide ella: con el panel de pasos la columna de la mesa es más angosta).
  const [livesInBar, setLivesInBar] = useState(true)
  const rivalName = t('duel.bar.rival')
  // La mesa y las preguntas del núcleo (lo mismo que en el duelo por enlace): acá se puede cortar al núcleo y deshacer.
  // El rival de handtraps (con el simulador encendido y alguna carta): su mano boca arriba, como en el simulador manual (así se sabe qué tiene), salvo «A ciegas»: de dorso, y cada carta se ve al usarla.
  const rivalOn = useMemo(() => autoRival(handtraps) !== null, [handtraps])
  const asks = useAutoAsks({ session, snap, cardsById, canCancel: true, canUndo: true, waitingText: null, rivalName, ...(rivalOn && !prefs.blind ? { rivalHand: snap.rivalHand } : {}) })
  const { nameOf, artOf } = asks
  // Las salidas y problemas de tu mano de apertura, como en la práctica (con la primera jugada se van; repasando, las de la mano del combo).
  const chips = usePracticeChips(lab, asks.matSession)
  // La hoja para cambiar las handtraps del rival.
  const [choosing, setChoosing] = useState(false)
  // «Seguir en modo manual»: el diálogo (`opened` lo vuelve a «Nada» cada vez que se abre) y la partida que pasa, calculada sólo con él abierto. Sin una mesa todavía (cartas sin
  // reglas, el núcleo que no arrancó), una mano nueva: no hay nada que elegir.
  const [switching, setSwitching] = useState(false)
  const [opened, setOpened] = useState(0)
  const rivalDeal = useMemo(() => dealRival(handtraps, snap.seed), [handtraps, snap.seed])
  const handover = useMemo(
    () => (switching ? manualHandover(snap, (id) => cardsById.get(id)?.name, rivalDeal ? { hand: rivalDeal.rival, names: rivalDeal.names } : undefined) : null),
    [switching, snap, cardsById, rivalDeal],
  )
  const openManual = onManual
    ? () => {
        if (snap.mineActions.length === 0) return onManual(null)
        setOpened((count) => count + 1)
        setSwitching(true)
      }
    : undefined
  const linkName = useCallback((link: ChainLink) => nameOf(link.card, link.code), [nameOf])

  // ── Lo que activa el rival (sus handtraps): el núcleo resuelve la cadena de una, así que se cuenta después y se deja leer (`RIVAL_READ_MS`). La carta grande en el centro,
  // con a qué responde (como en el duelo por enlace); lo que se negó lo dice su eslabón en el aviso de la cadena. Se mira la cadena (una Trampa que activa desde la mano llega a la mesa colocada, no como
  // «activar»): después de cada eslabón del rival el núcleo te pregunta, así que la mesa siempre lo ve abierto. Lo que vuelve a llegar al rearmarse la mesa no se cuenta otra vez. ──
  const [told, setTold] = useState<{ effect?: NonNullable<DuelMatLink['rivalEffect']> } | null>(null)
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

    if (effect) setTold({ effect })
  }, [snap.initial, snap.overlay, snap.replaying, artOf, linkName, rivalName])
  useEffect(() => {
    if (!told) return
    const timer = window.setTimeout(() => setTold(null), RIVAL_READ_MS)

    return () => window.clearTimeout(timer)
  }, [told])

  const cover = snap.fault ? (
    <FaultCover fault={snap.fault} nameOf={(code) => nameOf(null, code)} artOf={(code) => artOf(null, code)} onRetry={() => session.restart()} {...(openManual ? { onManual: openManual } : {})} onExit={onExit} />
  ) : snap.status === 'ended' && snap.overlay.end ? (
    <EndCover end={snap.overlay.end} lp={snap.overlay.lp} rival={rivalName} onAgain={() => session.restart()} {...(openManual ? { onManual: openManual } : {})} onExit={onExit} />
  ) : snap.status === 'loading' ? (
    <LoadingCover progress={snap.progress} rival={rivalOn} />
  ) : undefined

  const life = { mine: snap.overlay.lp[0], theirs: snap.overlay.lp[1] }
  // Repasando un combo (o tus jugadas) la mesa es la del repaso: el turno de la barra es el del paso que se mira, y la portada (el fin, un error), la mano del rival y lo que activa
  // esperan a «Volver al duelo».
  const reviewing = asks.review.active
  const link: DuelMatLink = {
    ...asks.mat,
    header: (
      <AutoBar
        rivalName={rivalName}
        life={life}
        onLivesInBar={setLivesInBar}
        turn={reviewing ? asks.state.turn : snap.overlay.turn}
        myTurn={asks.turnMine}
        phase={snap.overlay.turn > 0 ? asks.mat.phase : null}
        onExit={onExit}
        onUndo={() => session.undo()}
        canUndo={asks.undoable && snap.status !== 'thinking' && !snap.replaying}
        // Otro duelo con otra semilla (otras cartas, también las del rival), sin volver a cargar el núcleo; «Reiniciar el mismo duelo» queda en «Más opciones».
        onNewHand={() => session.restart(randomSeed())}
        // La hoja ya guardó las handtraps nuevas: el duelo se arma de nuevo con ellas (la misma semilla, como «Cambiar handtraps» de «Más opciones»).
        onHandtraps={() => onHandtraps(readHandtrapConfig())}
        lane={asks.lane}
        chain={prefs.chain}
        onChain={(mode) => setAutoPref('chain', mode)}
        place={prefs.place}
        onPlace={(mode) => setAutoPref('place', mode)}
        onRestart={() => session.restart()}
        {...(openManual ? { onManual: openManual } : {})}
        handtraps={{
          on: rivalOn,
          summary: rivalOn ? t('auto.bar.handtrapsOn', { cards: namesList(handtraps.picks.flatMap((pick) => Array<string>(pick.copies).fill(pick.name))), hand: Math.min(handtraps.hand, poolCount(handtraps.picks)) }) : t('auto.bar.handtrapsOff'),
          onChange: () => setChoosing(true),
        }}
        blind={prefs.blind}
        onBlind={(on) => setAutoPref('blind', on)}
      />
    ),
    tools: null,
    // Las vidas de los dos: en escritorio, en la barra (`AutoBar`); en el celular, con los íconos de la práctica arriba, no entran: van abajo, donde va la tuya en el duelo por enlace. En una
    // fila de escritorio angosta (el panel de pasos, el detalle y el menú abiertos) tampoco: abajo, del tamaño del celular.
    // Suben 12 px sobre el borde de la mano (`-mt-3`): la botonera mide lo que medía con Deshacer (44 px) y el campo no se corre, tampoco en una pantalla alta (ahí no hay scroll y su alto cuenta).
    life:
      docked && livesInBar ? null : (
        <span className="-mt-3 flex items-center gap-2">
          <AutoLives rivalName={rivalName} life={life} compact={docked} />
        </span>
      ),
    rivalTurnLabel: t('duel.bar.theirTurn', { name: rivalName }),
    ...(told?.effect && !reviewing ? { rivalEffect: told.effect } : {}),
    // Deshacer va arriba, con los íconos de la práctica.
    undoInHeader: true,
    // El panel de la práctica: los pasos (la cinta del núcleo, con la mano de apertura como paso 0) y los combos.
    steps: true,
    ...(cover === undefined || reviewing ? {} : { cover }),
  }

  return (
    // Tocar la mesa mientras cuenta una tanda la salta al final.
    <div className="contents" onPointerDownCapture={asks.settled ? undefined : asks.skipAhead}>
      {/* Los pasos del panel y los combos guardados se repasan en esta misma mesa (`asks.review`); nada se despacha. */}
      <PracticeMat
        session={asks.matSession}
        state={asks.state}
        cardsById={cardsById}
        deckName={deckName}
        onDispatch={sentinel}
        onUndo={() => session.undo()}
        onSeek={asks.review.seek}
        onLoadCombo={asks.review.load}
        onNewHand={NOTHING}
        duel={link}
        rivalViewer={asks.rivalViewer}
        {...(chips.needCards ? {} : { footer: chips.footer, highlighted: chips.highlighted, highlightKind: chips.highlightKind, muted: chips.muted })}
      />
      {/* La hoja del simulador de handtraps: aplicar (o apagarlo) arma el duelo de nuevo, con la misma semilla. */}
      <HandtrapPicker
        isOpen={choosing}
        config={handtraps}
        auto
        onClose={() => setChoosing(false)}
        onSave={(picks, hand) => {
          setChoosing(false)
          onHandtraps({ enabled: true, picks, hand })
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

/** El final: quién ganó y por qué, y «Jugar otra vez» (la misma semilla: el mismo duelo) o, con `onManual`, seguir la partida en la mesa manual. */
function EndCover({ end, lp, rival, onAgain, onManual, onExit }: { end: { winner: number; reason: number }; lp: readonly [number, number]; rival: string; onAgain: () => void; onManual?: () => void; onExit: () => void }) {
  const won = end.winner === 0
  const title = end.winner === 2 ? t('duel.result.title.draw') : won ? t('duel.result.title.win') : t('duel.result.title.lose')
  // Por qué: las vidas (el núcleo dice 0, o alguien quedó en 0), sin robar (con las vidas enteras y una razón del núcleo, no de un script: en un duelo solo sin reloj no hay otra) o el efecto de una carta.
  const reason =
    end.winner === 2
      ? t('duel.result.reason.draw')
      : end.reason === REASON_LP || lp[won ? 1 : 0] <= 0
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
        <p className="m-0 text-micro tabular-nums text-soft">{`${t('duel.bar.you')} ${lp[0]} · ${rival} ${lp[1]}`}</p>
        <div className="flex flex-wrap justify-center gap-2">
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
