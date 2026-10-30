import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'

import { rivalAttacks, type CardRef, type RivalAttack, type Side } from '../../app/auto/adapter'
import { NO_FIELD_STATS, fieldStatsOf, nowStat } from '../../app/field-stats'
import { askView, effectAskText, itemsInto, listOrder, openAsk, pickStatsOf, pickTitle, placeLabel, respondOffer, step, stopPhaseItems, type AskCard, type AskGesture, type AskItem, type AskState, type AutoLink, type AutoMenuItem } from '../../app/auto/ask-ui'
import { activatedCode, undoPoint, type AutoSession, type AutoSnapshot } from '../../app/auto/auto-session'
import { CHAIN_LINGER_MS, chainDwell, chainFeed, linkPhrase, stepsUpTo } from '../../app/auto/chain-feed'
import { actingOf, linksOf } from '../../app/card-glow'
import type { PhaseView } from '../../app/auto/online'
import type { AutoCardInfo } from '../../app/auto/online-protocol'
import { turnReasons } from '../../app/auto/no-plays'
import { foldOpeningHand } from '../../app/auto/opening-hand'
import { allowTo, leaves, stopAt, trailingStops, type Allowed } from '../../app/auto/phase-stops'
import { splitDesc, type Seat } from '../../app/auto/protocol'
import { setAutoPref, useAutoPrefs } from '../../app/auto-prefs'
import { useHeldValue } from '../../app/life-effects'
import { prefersReducedMotion } from '../../app/motion'
import { parseDerivedCardId } from '../../app/calculator-state'
import type { CardTextHighlight } from '../../app/card-text'
import type { Activity } from '../../app/duel-protocol'
import { allMatIds, cardKindOf, createMatState, locateCard, replayMat, type MatAction, type MatPhase, type MatSpot, type MatState, type MatTarget } from '../../app/practice-mat'
import type { SavedCombo } from '../../app/saved-combos'
import { playSfx } from '../../app/sfx'
import { useChange } from '../../app/use-duel-sounds'
import type { MatSession } from '../../app/use-mat-session'
import { DESKTOP_DECK_BUILDER_MEDIA_QUERY, DUEL_DETAIL_DOCK_MEDIA_QUERY, useMediaQuery } from '../../app/use-media-query'
import { usePracticeSounds } from '../../app/use-practice-sounds'
import { showToastMessage } from '../../app/use-toast-message'
import { Presence } from '../../app/use-presence'
import { t } from '../../i18n'
import type { ApiCardReference } from '../../types'
import { artOfDrawId } from '../duel/duel-art'
import type { LaneNotice } from '../duel/DuelBar'
import { DuelCardDock, type CardPeek } from '../duel/DuelCardDock'
import { DUEL_AREAS, DUEL_AREAS_COMPACT, SideCells, sharedZoneCard, TheirHand, type DuelSideView } from '../duel/DuelTable'
import { RivalCardDetail, useRivalCard } from '../duel/RivalCardDetail'
import { useDockPeek } from '../duel/use-dock-peek'
import { PILE_TITLES, PileViewer } from '../probability/MatDialogs'
import { cardIdOfDrawId } from '../probability/practice'
import type { DuelMatLink, MatCard } from '../probability/PracticeMat'
import { IMPACT_MS } from '../probability/AttackFx'
import { useUndoPlay, type UndoPlay } from '../probability/UndoChip'
import { AskOptions, type AskOption } from './AskOptions'
import { AskPrompt } from './AskPrompt'
import { BAND_MAX, CardPicker, PickBand, pickPlace, type PickCard } from './CardPicker'
import { ChainNotice } from './ChainNotice'
import { CounterSheet } from './CounterSheet'
import { LimitsChip } from './LimitsChip'
import { RespondBand } from './RespondBand'
import { SortSheet } from './SortSheet'

/**
 * Lo que comparten las dos mesas del duelo automático (`AutoSoloScreen` y `AutoDuelScreen`, la del duelo por enlace): la mesa como la cuenta el núcleo (el ritmo: las jugadas de una
 * tanda se muestran de a una, `STEP_MS`, y tocar la mesa salta al final; al rearmarse, un solo commit), las preguntas contestadas en la mesa (`openAsk` / `askView` / `step` de
 * `ask-ui.ts`: los menús, las casillas y el brillo van por `duel.auto`; lo de afuera, `AskPrompt`, `AskOptions`, `CardPicker`, `SortSheet` y `CounterSheet`, en `pieces`), el espejo del rival, la
 * línea del registro y el detalle con el ATK/DEF de ahora. Cada pantalla le suma su barra, sus portadas y lo suyo (`mat` es la parte de `DuelMatLink` que sale de acá).
 * Online: las cartas del rival que el núcleo dejó ver llegan en `cards` (nombre y rótulos); la pregunta del otro es la línea `waitingText`; el invitado no puede cortar al núcleo.
 */

/** Cuánto espera la mesa entre una jugada y la siguiente de una misma tanda (una cadena larga se cuenta paso a paso). */
export const STEP_MS = 220
const NOTHING = () => {}
/** Los Tipos (`RACE_*`, por bit) y los Atributos (`ATTRIBUTE_*`) del núcleo, con las palabras de las cartas (en inglés, como las muestra el catálogo). */
const RACES = ['Warrior', 'Spellcaster', 'Fairy', 'Fiend', 'Zombie', 'Machine', 'Aqua', 'Pyro', 'Rock', 'Winged Beast', 'Plant', 'Insect', 'Thunder', 'Dragon', 'Sea Serpent', 'Reptile', 'Psychic', 'Divine-Beast', 'Creator God', 'Wyrm', 'Cyberse', 'Illusion', 'Cyborg', 'Magical Knight', 'High Dragon', 'Omega Psychic', 'Celestial Warrior', 'Galaxy', 'Yokai']
const ATTRIBUTES = ['EARTH', 'WATER', 'FIRE', 'WIND', 'LIGHT', 'DARK', 'DIVINE']
const SPELL = 0x2
const TRAP = 0x4
const MONSTER = 0x1

/**
 * Si las vidas que se ven esperan a tu ataque (`LifeHold`): el núcleo baja las vidas apenas declarás, pero la mesa muestra el ataque a su ritmo (`STEP_MS`, la cadena) y la espada
 * golpea `IMPACT_MS` después. Esperan mientras falte mostrar un ataque que la mesa va a contar sola (hasta `limit`) y hasta el golpe del que acaba de mostrarse. Saltar (más de una
 * jugada de una vez), volver atrás, `live` en false (repasar, rearmarse) o el movimiento reducido (no hay espada) no esperan nada.
 */
export function useStrikeHold(actions: readonly MatAction[], cursor: number, limit: number, live: boolean): boolean {
  const [counted, setCounted] = useState(cursor)
  const [until, setUntil] = useState<number | null>(null)

  if (counted !== cursor) {
    setCounted(cursor)
    if (cursor !== counted + 1) setUntil(null)
    else if (actions[cursor - 1]?.type === 'attack') setUntil(Date.now() + IMPACT_MS)
  }
  useEffect(() => {
    if (until === null) return
    const timer = window.setTimeout(() => setUntil(null), Math.max(0, until - Date.now()))

    return () => window.clearTimeout(timer)
  }, [until])

  if (!live || prefersReducedMotion()) return false
  return until !== null || actions.slice(cursor, limit).some((action) => action.type === 'attack')
}

/** Cuánto se queda el cartel del ataque del rival (el mismo que en el duelo manual). */
const RIVAL_ATTACK_MS = 4000

export interface RivalStrike {
  /** El ataque que la mesa dibuja ahora (`PracticeMat`: la espada de su monstruo a tu carta o a tus vidas); otro objeto, otra espada. */
  shown: { key: number; attackerId: string; targetId?: string } | null
  /** Las vidas esperan: falta mostrar un ataque del rival que la mesa va a contar sola, o todavía no golpeó el que se muestra. */
  held: boolean
  /** Cuándo golpea el último que se mostró (ms de `Date.now()`): tu jugada que sigue (tu monstruo que cae) espera hasta ahí. */
  impactAt: number
}

/**
 * El ataque del rival (`rivalAttacks`): el núcleo lo cuenta junto con su resultado y el espejo del rival no va al ritmo de tu mesa, así que se dibuja cuando tu mesa llega a su
 * lugar (`at`). Como `useStrikeHold`: lo que ya estaba al abrir, lo que se rearma (`start` cambia: deshacer, reponer, recargar), lo que se salta (el cursor avanza más de una) y
 * lo que llega con `live` en false (repasar, rearmarse) se da por visto sin dibujarse; el movimiento reducido no espera.
 */
export function useRivalStrike(attacks: readonly RivalAttack[], total: number, start: unknown, cursor: number, limit: number, live: boolean): RivalStrike {
  const [done, setDone] = useState(total)
  const [at, setAt] = useState({ start, cursor })
  const [shown, setShown] = useState<RivalStrike['shown']>(null)
  const [impactAt, setImpactAt] = useState(0)
  const [striking, setStriking] = useState(false)
  const moved = at.start === start && at.cursor !== cursor
  const jumped = moved && cursor !== at.cursor + 1

  if (at.start !== start || moved) setAt({ start, cursor })
  if (at.start !== start || !live) {
    if (done !== total) setDone(total)
  } else {
    const due = attacks.filter((attack) => attack.index >= done && attack.at <= cursor).at(-1)

    if (due) {
      setDone(due.index + 1)
      if (!jumped && due.at === cursor) {
        const now = Date.now()

        setShown({ key: now, attackerId: due.attackerId, ...(due.targetId === undefined ? {} : { targetId: due.targetId }) })
        if (!prefersReducedMotion()) {
          setImpactAt(now + IMPACT_MS)
          setStriking(true)
        }
      }
    }
  }
  useEffect(() => {
    if (!striking) return
    const timer = window.setTimeout(() => setStriking(false), Math.max(0, impactAt - Date.now()))

    return () => window.clearTimeout(timer)
  }, [striking, impactAt])
  useEffect(() => {
    if (!shown) return
    const timer = window.setTimeout(() => setShown(null), RIVAL_ATTACK_MS)

    return () => window.clearTimeout(timer)
  }, [shown])

  const pending = attacks.some((attack) => attack.index >= done && attack.at >= cursor && attack.at <= limit)

  return { shown, impactAt, held: live && !prefersReducedMotion() && (striking || pending) }
}

/** La mesa como la ve la pantalla: la mesa del arranque, las jugadas que ya llegaron y hasta cuál se muestra. */
interface Paced {
  initial: MatState
  actions: readonly MatAction[]
  cursor: number
}

/** Dos mesas del arranque con las mismas cartas en el mismo orden: deshacer y cancelar re-simulan la misma (la mesa no se vuelve a repartir). */
const sameStart = (a: MatState, b: MatState) => a.deck.join() === b.deck.join() && a.extra.join() === b.extra.join()

const drawIdOf = (code: number) => `card-${code}-1`

/** La mesa intentó jugar sola: en automático es un bug (cada gesto se contesta, nunca se despacha). Se anota y no se hace nada. */
export const sentinel = (action: MatAction) => console.error('[auto] la mesa intentó despachar una jugada en modo automático', action)

export interface AutoAsksInput {
  session: AutoSession
  snap: AutoSnapshot
  /** Tus cartas, por id de copia (`card-123-2`), como en la práctica. */
  cardsById: ReadonlyMap<string, MatCard>
  /** Online: lo que se sabe de las cartas que no están en `cardsById` ni en `snap.names` (las del rival que el núcleo dejó ver): nombre y rótulos de efectos. */
  cards?: ReadonlyMap<number, AutoCardInfo>
  /** Tu asiento del núcleo (0 empieza): de quién es el turno y quién ganó. Solo, siempre 0. */
  seat?: Seat
  /** Si se puede cortar lo que el núcleo piensa (solo y el anfitrión: sí; el invitado no: el núcleo corre en otro navegador). */
  canCancel: boolean
  /** Si la línea de una pregunta trabada ofrece deshacer (solo). */
  canUndo: boolean
  /** La línea cuando la pregunta es del otro (online: «Beto está eligiendo…»); null, solo. */
  waitingText: string | null
  /** El duelo ya terminó para la sala (alguien se rindió): no se ofrece nada más que mirar. */
  frozen?: boolean
  /** Cómo se llama el rival en el aviso de la cadena (de quién es cada eslabón). */
  rivalName?: string
  /** «Jugar solo» con handtraps (salvo «A ciegas»): la mano del rival boca arriba, por código; cada carta se toca o se apunta para verla. */
  rivalHand?: readonly number[]
  /** «Jugar solo»: seguir en la mesa manual (`ManualDialog`), el atajo del menú de una carta sin jugadas. */
  onManual?: () => void
  /**
   * Online, con un rival que avisa su mesa (`autoPhase`): la fase que él ve en este turno (su mesa frena en su DP y su SP aunque el núcleo ya pasó) y si está contestando algo del
   * núcleo: en su turno el botón de fase dice la suya, y «X está eligiendo…» va sólo con `busy`. Sin esto, la fase del espejo y la línea con cualquier espera.
   */
  rival?: { phase: MatPhase; busy: boolean }
}

export interface AutoAsks {
  /** Tu mesa como se ve ahora (con el ritmo) y la sesión de la mesa que la reproduce. */
  state: MatState
  matSession: MatSession
  /** La mesa terminó de contar la última tanda; `skipAhead` salta al final (tocar la mesa; los botones del aviso de la cadena, no: se toca para mirarla). */
  settled: boolean
  /** Hasta qué jugada tuya contó la mesa (`snap.mineActions`, como las cuenta `snap.order`): lo del rival que pasó después espera a que llegue. */
  counted: number
  skipAhead: (event?: { target: EventTarget | null }) => void
  lane: LaneNotice | null
  /** Lo que la mesa recibe del núcleo (`PracticeMat.duel`): falta lo de cada pantalla (la barra, tus vidas, los botones, las portadas). */
  mat: Omit<DuelMatLink, 'header' | 'tools' | 'life' | 'rivalTurnLabel'>
  /** Las piezas de afuera de la mesa (opciones, submenú del celular, ordenar, elegir de una lista). */
  pieces: ReactNode
  nameOf: (ref: CardRef | null, code?: number) => string
  artOf: (ref: CardRef | null, code?: number) => string | null
  /** Hay una jugada tuya que deshacer (una respuesta tuya a un `select_idlecmd` o `select_battlecmd`, o una activación elegida: `undoPoint`). */
  undoable: boolean
  /** El turno es tuyo. */
  turnMine: boolean
  /**
   * El repaso (sólo «Jugar solo», desde el panel de pasos y combos): `load` repasa un combo guardado (con los controles del replay), `seek` va a un paso (en vivo, de tus jugadas)
   * y `back` vuelve al duelo donde estaba. Repasar no despacha ni le contesta nada al núcleo.
   */
  review: { active: boolean; load: (combo: SavedCombo) => void; seek: (step: number) => void; back: () => void }
  /** El visor del Cementerio, el Destierro o el Extra boca arriba del rival (`PracticeMat.rivalViewer`): va en el mismo lugar que el tuyo. */
  rivalViewer: ReactNode
  /** Las vidas que se ven esperan al golpe de un ataque, tuyo (`useStrikeHold`) o del rival (`useRivalStrike`): va en `LifeHold` alrededor de la mesa. */
  lifeHeld: boolean
  /** Online: lo que el rival tiene que saber de tu mesa (`autoPhase`): tu fase como se ve, en el turno del núcleo, y si estás contestando algo que no es tu turno libre. Null rearmando. */
  told: PhaseView | null
}

export function useAutoAsks({ session, snap, cardsById, cards, seat = 0, canCancel, canUndo, waitingText, frozen = false, rivalName = t('duel.bar.rival'), rivalHand, onManual, rival }: AutoAsksInput): AutoAsks {
  const prefs = useAutoPrefs()
  const wide = useMediaQuery(DUEL_DETAIL_DOCK_MEDIA_QUERY)
  const desktop = useMediaQuery(DESKTOP_DECK_BUILDER_MEDIA_QUERY)
  const dock = useDockPeek()
  const [highlight, setHighlight] = useState<CardTextHighlight | null>(null)

  // ── El ritmo: las jugadas de una tanda se agregan de una vez y el cursor avanza de a una; al rearmarse la mesa se salta al final (un solo commit: se ajusta en el render).
  // Las fases las cambiás vos, como en la mesa manual (`phase-stops.ts`): la mesa frena en tu Draw y tu Standby Phase hasta que pidas dejarlas con el botón de fases (`allowed`);
  // al rearmarse frena sólo si las jugadas terminan en esas paradas (el duelo nuevo, el turno recién llegado), no a mitad de un turno. ──
  const [allowed, setAllowed] = useState<Allowed | null>(null)
  const rearmAt = (initial: MatState, actions: readonly MatAction[], upTo: Allowed | null) => stopAt(initial, actions, trailingStops(initial, actions), upTo)
  const [paced, setPaced] = useState<Paced>(() => ({ initial: snap.initial.mine, actions: snap.mineActions, cursor: rearmAt(snap.initial.mine, snap.mineActions, null) }))
  const [seen, setSeen] = useState(snap.initial)
  // La cadena (el aviso de arriba de la mesa, `ChainNotice`): sus mensajes (`snap.chainSteps`) se muestran de a uno con su tiempo (`chainDwell`), cada uno cuando la mesa contó
  // hasta donde llegó, y la mesa no pasa del próximo hasta mostrarlo: primero los eslabones que se encadenan y después cada uno resolviéndose, con sus jugadas. Al rearmarse
  // o al tocar la mesa, lo que ya pasó se da por visto. `chainGone`: la cadena terminada que ya se escondió.
  const steps = snap.chainSteps
  const [chainSeen, setChainSeen] = useState(() => stepsUpTo(snap.chainSteps, paced.cursor))
  const [chainGone, setChainGone] = useState(() => chainFeed(snap.chainSteps, stepsUpTo(snap.chainSteps, paced.cursor))?.key ?? -1)
  /** Lo que la persona hizo con la pila de esta cadena (`key`): la plegó o la desplegó, o tocó un eslabón. Cada cadena abre desplegada. */
  const [chainTouch, setChainTouch] = useState<{ key: number; open: boolean } | null>(null)
  const chainShownAt = useRef(0)
  /**
   * El repaso («Jugar solo»): un combo guardado (`name`), o tus jugadas hasta un paso, en la misma mesa y con la lista de siempre. El duelo vivo espera donde estaba: ni el ritmo, ni
   * tocar la mesa, ni las paradas de fase lo mueven y no se muestra ninguna pregunta; la cinta (`paced`) se sigue rehaciendo sólo del núcleo. El lado del rival queda vacío.
   */
  const [review, setReview] = useState<{ name?: string; session: MatSession } | null>(null)
  const reviewing = review !== null

  // Reiniciar es otro duelo: lo pedido vuelve a cero y el repaso se cierra.
  if (snap.status === 'loading' && allowed !== null) setAllowed(null)
  if (snap.status === 'loading' && reviewing) setReview(null)
  if (!snap.replaying) {
    if (seen !== snap.initial) {
      const initial = sameStart(paced.initial, snap.initial.mine) ? paced.initial : snap.initial.mine

      const cursor = rearmAt(initial, snap.mineActions, allowed)
      const count = stepsUpTo(snap.chainSteps, cursor)

      setSeen(snap.initial)
      setPaced({ initial, actions: snap.mineActions, cursor })
      setChainSeen(count)
      setChainGone(chainFeed(snap.chainSteps, count)?.key ?? -1)
    } else if (paced.actions !== snap.mineActions) {
      setPaced({ ...paced, actions: snap.mineActions })
    }
  }

  // Hasta dónde puede contar la mesa: la próxima parada que no pediste dejar, o el final.
  const limit = useMemo(() => stopAt(paced.initial, paced.actions, paced.cursor, allowed), [paced, allowed])

  // La mesa no pasa del próximo mensaje de la cadena que falta mostrar.
  const chainNext = steps[chainSeen]?.at ?? Infinity
  // El ataque del rival, cuando la mesa llega a él; lo tuyo que sigue (tu monstruo que cae) espera a su golpe.
  const attacks = useMemo(() => rivalAttacks(snap.order, snap.theirsActs), [snap.order, snap.theirsActs])
  const rivalStrike = useRivalStrike(attacks, snap.theirsActs.length, snap.initial, paced.cursor, limit, !reviewing && !snap.replaying)
  const { impactAt } = rivalStrike

  useEffect(() => {
    if (reviewing || paced.cursor >= Math.min(limit, chainNext)) return
    const timer = window.setTimeout(() => setPaced((current) => (current.cursor < current.actions.length ? { ...current, cursor: current.cursor + 1 } : current)), Math.max(STEP_MS, impactAt - Date.now()))

    return () => window.clearTimeout(timer)
  }, [paced, limit, reviewing, chainNext, impactAt])
  // El próximo mensaje de la cadena, cuando la mesa llegó hasta él y el anterior se vio su rato (contado desde que se mostró: una tanda nueva no lo reinicia).
  useEffect(() => {
    if (reviewing || snap.replaying || chainNext > paced.cursor) return
    const wait = Math.max(0, chainDwell(steps, chainSeen - 1) - (Date.now() - chainShownAt.current))
    const timer = window.setTimeout(() => {
      // Los que no se dejan ver solos (uno resuelto, el final) se muestran junto con el siguiente.
      let next = chainSeen + 1

      while (next < steps.length && chainDwell(steps, next - 1) === 0 && steps[next]!.at <= paced.cursor) next += 1
      chainShownAt.current = Date.now()
      setChainSeen(next)
    }, wait)

    return () => window.clearTimeout(timer)
  }, [steps, chainSeen, chainNext, paced.cursor, reviewing, snap.replaying])

  // Tocar la mesa salta hasta la próxima parada (no la cruza); repasando, no.
  const skipAhead = useCallback((event?: { target: EventTarget | null }) => {
    if (reviewing || (event?.target instanceof Element && event.target.closest('[data-testid="chain-notice"]'))) return
    setPaced((current) => {
      const to = stopAt(current.initial, current.actions, current.cursor, allowed)

      return to > current.cursor ? { ...current, cursor: to } : current
    })
    // La cadena, hasta ahí también (lo que llegó después de la parada espera).
    setChainSeen((count) => Math.max(count, stepsUpTo(steps, stopAt(paced.initial, paced.actions, paced.cursor, allowed))))
  }, [allowed, reviewing, steps, paced])
  const settled = paced.cursor === paced.actions.length && chainSeen >= steps.length && !snap.replaying
  const lifeHeld = useStrikeHold(paced.actions, paced.cursor, limit, !reviewing && !snap.replaying) || rivalStrike.held
  // Lo que se ve, como en la práctica: la mano de apertura plegada en la mesa del arranque (`foldOpeningHand`), así el paso 0 es «Mano inicial». Se pliega por contenido:
  // deshacer re-simula y la jugada vuelve como otro objeto con las mismas cartas (la mano no se reparte de nuevo).
  const first = paced.actions[0]
  const openingKey = first?.type === 'draw' ? `${first.count}:${first.ids?.join() ?? ''}` : ''
  // eslint-disable-next-line react-hooks/exhaustive-deps -- por contenido (`openingKey`), no por objeto
  const opening = useMemo(() => foldOpeningHand(paced.initial, first ? [first] : []), [paced.initial, openingKey])
  // Las jugadas, hasta la que ya se contó: lo que el núcleo decidió y la mesa todavía no muestra (el ritmo, una parada de fase) no se adelanta en la lista de pasos.
  const played = useMemo(() => paced.actions.slice(opening.skip, Math.max(opening.skip, paced.cursor)), [paced.actions, paced.cursor, opening.skip])
  const state = useMemo(() => replayMat(opening.initial, played, played.length), [opening.initial, played])
  /** La mesa espera en tu DP o tu SP (una parada): el botón de fases la pasa. */
  const stopped = !reviewing && !frozen && !snap.replaying && paced.cursor === limit && limit < paced.actions.length
  /** Pedir pasar a una fase: la parada que deja se cruza ya (lo que sigue, a su ritmo). */
  const allow = useCallback(
    (to: MatPhase) => {
      const next = allowTo(allowed, state.turn, to)

      setAllowed(next)
      setPaced((current) => (stopAt(current.initial, current.actions, current.cursor, next) > current.cursor ? { ...current, cursor: current.cursor + 1 } : current))
    },
    [allowed, state.turn],
  )
  // Los nombres del `.cdb` (las cartas del rival, que no están en `cardsById`): la mesa los lee por el id de su primera copia.
  const names = useMemo(() => Object.fromEntries(Object.entries(snap.names).map(([code, name]) => [drawIdOf(Number(code)), name])), [snap.names])
  const matSession = useMemo<MatSession>(() => ({ initial: opening.initial, actions: played, cursor: played.length, names, replay: false }), [opening.initial, played, names])
  // Lo que se repasa se ve en la misma mesa; la del duelo (`state`, `matSession`) queda como estaba.
  const reviewState = useMemo(() => (review ? replayMat(review.session.initial, review.session.actions, review.session.cursor) : null), [review])
  const load = useCallback((combo: SavedCombo) => setReview({ name: combo.name, session: { initial: combo.initial, actions: combo.actions, cursor: 0, names: combo.names, replay: true } }), [])
  const back = useCallback(() => setReview(null), [])
  // Un paso: repasando, el de lo que se repasa (el último de tus jugadas es ahora: vuelve al duelo); en vivo, uno de tus jugadas (como en la práctica, sin los controles del replay).
  const seek = useCallback(
    (step: number) => {
      const to = Math.max(0, Math.trunc(step))

      if (review && review.name === undefined && to >= review.session.actions.length) setReview(null)
      else if (review) setReview({ ...review, session: { ...review.session, cursor: Math.min(to, review.session.actions.length) } })
      else if (to < matSession.actions.length) setReview({ session: { ...matSession, cursor: to } })
    },
    [review, matSession],
  )

  usePracticeSounds(review?.session ?? matSession)
  // Las vidas que bajan o suben y el fin (las jugadas ya suenan con la mesa); rearmando no suena nada.
  // Suenan cuando se ven: al golpe de tu ataque (`lifeHeld`).
  const heardLp = useHeldValue(snap.overlay.lp, lifeHeld)

  useChange(snap.replaying ? undefined : ([...heardLp] as const), (before, now) => {
    if (before.some((points) => points <= 0)) return
    if (now.some((points, at) => points < before[at]!)) playSfx('lpDown')
    else if (now.some((points, at) => points > before[at]!)) playSfx('lpUp')
  })
  useEffect(() => {
    const end = snap.status === 'ended' ? snap.overlay.end : null

    if (end) playSfx(end.winner === 2 ? 'turn' : end.winner === seat ? 'win' : 'lose')
  }, [snap.status, snap.overlay.end, seat])

  // ── Las cartas: el nombre, el arte y el tipo por código (lo que el núcleo nombra y la mesa no tiene). ──
  const byCode = useMemo(() => {
    const map = new Map<number, MatCard>()

    for (const [id, card] of cardsById) {
      const code = parseDerivedCardId(cardIdOfDrawId(id))

      if (code !== null && !map.has(code)) map.set(code, card)
    }

    return map
  }, [cardsById])
  const typeOf = useCallback(
    (code: number) => {
      const kind = cardKindOf(byCode.get(code)?.apiCard ?? null)

      return kind.spell ? SPELL : kind.trap ? TRAP : MONSTER
    },
    [byCode],
  )
  const codeOf = useCallback((ref: CardRef) => session.adapter?.codeOf(ref) ?? 0, [session])
  const nameOf = useCallback(
    (ref: CardRef | null, code = 0): string => {
      const known = ref?.side === 'mine' ? cardsById.get(ref.id)?.name : undefined
      const at = ref ? codeOf(ref) || code : code

      return known ?? byCode.get(at)?.name ?? snap.names[at] ?? cards?.get(at)?.name ?? t('practice.card.unknown')
    },
    [cardsById, byCode, codeOf, snap.names, cards],
  )
  // Tus cartas sin reglas automáticas juegan sin efectos (como en Dueling Nexus): se avisa una vez al empezar, con sus nombres, y su «sin jugadas» dice por qué.
  const vanilla = useMemo(() => new Set(snap.vanilla), [snap.vanilla])
  const warned = useRef(false)

  useEffect(() => {
    if (warned.current || snap.vanilla.length === 0 || snap.status === 'loading') return
    warned.current = true
    showToastMessage(t('auto.vanilla', { count: snap.vanilla.length, names: snap.vanilla.map((code) => nameOf(null, code)).join(', ') }), 'warning')
  }, [snap.vanilla, snap.status, nameOf])
  const artOf = useCallback(
    (ref: CardRef | null, code = 0): string | null => {
      const mine = ref?.side === 'mine' ? cardsById.get(ref.id) : undefined
      const at = ref ? codeOf(ref) || code : code

      return mine?.art ?? mine?.apiCard?.imageUrlSmall ?? (at ? artOfDrawId(drawIdOf(at)) : null)
    },
    [cardsById, codeOf],
  )
  /** El arte por código, el de tu carta si es tuya (el de la mesa: el de afuera puede no cargar). */
  const artOfCode = useCallback((code: number) => {
    const mine = byCode.get(code)

    return mine?.art ?? mine?.apiCard?.imageUrlSmall ?? artOf(null, code)
  }, [byCode, artOf])
  // El rótulo de un efecto o de una opción: el `strN` del `.cdb` que nombra el `desc` (`splitDesc`). Los del sistema (carta 0) no viajan: los nombra `ask-ui` o la
  // pantalla dice «Activar efecto». Online, los del rival llegan con sus cartas (`cards`).
  const effectLabel = useCallback(
    (_code: number, description: string): string | null => {
      const { code, n } = splitDesc(description)

      return snap.texts[code]?.[n] || cards?.get(code)?.strs?.[n] || null
    },
    [snap.texts, cards],
  )
  // Las restricciones que rigen sobre vos: el texto de su carta, tal cual (`effectLabel`); sin texto, de qué carta es.
  const limitTexts = useMemo(
    () => snap.overlay.limits[seat].map((description) => effectLabel(0, description) ?? t('auto.why.limitOf', { card: nameOf(null, splitDesc(description).code) })),
    [snap.overlay.limits, seat, effectLabel, nameOf],
  )
  // De dónde es (el chip y el grupo de `CardPicker`): lo que sólo se nombra por código, de ningún lado.
  const pickCardOf = (card: AskCard, key: string): PickCard => {
    const from = card.place === 'pile' ? card.pile : card.place === 'none' ? undefined : card.place

    return { key, name: nameOf(card.ref, card.code), art: artOf(card.ref, card.code), ...(from && card.ref ? pickPlace(from, card.ref.side === 'theirs') : {}) }
  }

  // ── La pregunta pendiente: se abre con la mesa del núcleo (`session.adapter`) en el mismo render en que llega (un rearme con pregunta es un solo commit); lo que se contesta solo, se
  // contesta en un efecto; lo demás espera a que la mesa termine de contar. ──
  const pending = snap.ask
  const turnMine = snap.overlay.turnPlayer === seat
  const askId = pending?.askId ?? null
  /**
   * La carta de la mano que soltaste en una casilla y elegiste cómo sale (`itemsFor` con `drop`, en la pregunta `from`): la casilla contesta la primera pregunta de casillas que sigue
   * (`prefer`; `placeAsk` es esa pregunta) y la carta se dibuja ahí mientras el núcleo la cuenta. Se olvida cuando sale de la mano, cuando la mesa ya contó todo y muestra otra vez tus
   * jugadas del turno (la jugada no se hizo) y al rearmarse la mesa (`initial`: deshacer, reiniciar, cortar al núcleo).
   */
  const [dropped, setDropped] = useState<({ id: string; initial: AutoSnapshot['initial']; from: number; placeAsk?: number } & MatTarget) | null>(null)
  const held = dropped && dropped.initial === snap.initial ? dropped : null
  const open = () => {
    const adapter = session.adapter
    const prefer = held && (held.placeAsk === undefined || held.placeAsk === askId) ? { prefer: { side: 'mine' as const, zone: held.zone, index: held.index } } : {}

    return pending && adapter ? openAsk(pending, { queries: adapter, prefs: { chainMode: prefs.chain, placeMode: prefs.place }, phase: adapter.mine.phase, typeOf, effectLabel, ...prefer }) : null
  }
  const [opened, setOpened] = useState<{ askId: number | null; state: AskState | null }>({ askId: null, state: null })
  /**
   * La decisión de la pregunta (`of`: el número de su primera pregunta; es la `key` de su banda o su hoja). Un `select_unselect_card` se contesta de a una carta y el núcleo vuelve
   * a preguntar con la elegida: con la misma cuenta (`sig`) es la misma decisión, así que su banda no sale ni se vuelve a montar (se actualiza en el lugar, con el foco y minimizada
   * si lo estaba). Mientras el núcleo vuelve a preguntar, se sigue viendo la que se contestó (`hold`, quieta: los toques no van a ningún lado), salvo que lleguen jugadas (terminó).
   * Dónde se elige lo decide su primera pregunta (`listed`: una lista aparte, en la banda o en la hoja): elegida una, las que quedan pueden estar todas en el deck, y no se pasa al visor.
   */
  const [decision, setDecision] = useState<{ of: number | null; sig: string; hold: AskState | null; actions: readonly MatAction[] | null; listed: { band: boolean } | null }>({ of: null, sig: '', hold: null, actions: null, listed: null })
  /** Una pregunta sin gesto ni respuesta segura (declarar una carta sin ninguna que ofrecer): la línea avisa (y, solo, ofrece deshacer). */
  const [stuck, setStuck] = useState<string | null>(null)
  /** El segundo paso de «Activar efecto» en el celular (en escritorio es el submenú del menú): el ítem padre, con sus efectos. */
  const [sub, setSub] = useState<AskItem | null>(null)
  /** Cuántos errores (y cuántas cosas que la mesa no pudo mostrar) había al contestar la última pregunta: los nuevos se muestran en la línea. */
  const faultsBase = useRef(0)
  const unmappedBase = useRef(0)
  const askRef = useRef<AskState | null>(null)

  if (opened.askId !== askId) {
    const state = open()
    const type = pending?.ask.type

    setOpened({ askId, state: state && !askView(state).auto ? state : null })
    if (pending) {
      const sig = pending.ask.type === 'select_unselect_card' ? `${pending.seat}:${pending.ask.min}:${pending.ask.max}` : ''

      const same = sig !== '' && decision.hold !== null && sig === decision.sig
      const first = state ? askView(state).cardPick : null

      setDecision({ of: same ? decision.of : askId, sig, hold: null, actions: null, listed: same ? decision.listed : first?.surface === 'list' ? { band: first.cards.length <= BAND_MAX } : null })
    }
    setStuck(null)
    setSub(null)
    // La casilla soltada contesta sólo la primera pregunta de casillas; si no se pudo usar, la carta deja de esperar ahí.
    if (held && type === 'select_place' && held.placeAsk === undefined) setDropped(state && askView(state).auto?.why === 'drop' ? { ...held, placeAsk: askId! } : null)
  }
  // Ya salió de la mano: lo que se soltó, se jugó.
  if (held && !state.hand.includes(held.id)) setDropped(null)
  const live = opened.askId === askId ? opened.state : null
  const askState = live ?? (askId === null && decision.actions === snap.mineActions ? decision.hold : null)

  useEffect(() => {
    askRef.current = live
  }, [live])

  useEffect(() => {
    const view = pending ? askView(open() ?? openAsk(pending, { queries: session.adapter!, prefs: { chainMode: 'never', placeMode: 'auto' } })) : null

    if (!view?.auto) return
    if (view.auto.answer) session.answer(view.auto.answer)
    else {
      // La línea lo dice con palabras de la mesa; el tipo de la pregunta, en la consola.
      console.warn('[auto] una pregunta sin respuesta segura:', pending!.ask.type)
      setStuck(pending!.ask.type)
    }
    // Sólo cuando llega otra pregunta: la mesa y los ajustes se leen en ese momento.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [askId])

  /**
   * Tu última activación (o Invocación Especial de una que brilla), para su aviso de «Deshacer» (`UndoChip`): con la mesa en la que se hizo (deshacer, reiniciar o cortar al núcleo la
   * rearman y el aviso se va). Otra jugada tuya lo saca: Deshacer volvería a antes de ésa, no de la activación.
   */
  const [lastPlay, setLastPlay] = useState<(UndoPlay & { initial: AutoSnapshot['initial'] }) | null>(null)

  /** Los toques, en orden; el que completa la pregunta la contesta y los demás se descartan. */
  const gesture = useCallback(
    (...gestures: AskGesture[]) => {
      let current = askRef.current

      if (!current) return
      for (const item of gestures) {
        const next = step(current, item)

        current = next.state
        if (next.answer) {
          askRef.current = null
          setOpened({ askId: current.askId, state: null })
          // Elegir una carta de un `select_unselect_card` deja la decisión abierta: el núcleo vuelve a preguntar con la elegida.
          const hold = next.answer.type === 'select_unselect_card' && next.answer.index !== null ? current : null
          const actions = hold ? session.getSnapshot().mineActions : null

          setDecision((now) => ({ ...now, hold, actions }))
          setSub(null)
          faultsBase.current = session.getSnapshot().faults.length
          unmappedBase.current = session.getSnapshot().unmapped.length
          const { initial } = session.getSnapshot()
          const code = activatedCode(current.ask, next.answer)

          if (session.answer(next.answer) && canUndo && (code !== null || undoPoint({ seat, answer: next.answer }))) setLastPlay(code === null ? null : { key: Date.now(), art: artOfCode(code), initial })
          return
        }
      }
      askRef.current = current
      setOpened({ askId: current.askId, state: current })
    },
    [session, canUndo, seat, artOfCode],
  )

  const view = useMemo(() => (askState ? askView(askState) : null), [askState])
  // La ventana de una fase que ya pediste dejar (la SP, si desde la DP pediste la Main Phase 1) no se muestra: se pasa sola.
  const passing = view?.phaseWindow ? leaves(allowed, snap.mine.turn, view.phaseWindow) : false
  // Repasando no se pregunta nada: la pregunta espera y vuelve con «Volver al duelo».
  const shown = settled && !frozen && !passing && !reviewing ? view : null

  if (reviewing && sub !== null) setSub(null)

  // Otra vez tus jugadas del turno, con la mesa ya quieta y la carta soltada todavía en la mano: la jugada no se hizo (se cancelaron los Sacrificios), la carta deja de esperar.
  // Se mira lo que se muestra y no la pregunta que llega: esa llega junto con las jugadas que la mesa todavía cuenta de a una (la carta volvería a la mano antes de caer).
  if (held && shown && shown.askId !== held.from && (shown.type === 'select_idlecmd' || shown.type === 'select_battlecmd')) setDropped(null)

  useEffect(() => {
    if (passing) session.answer({ type: 'select_chain', index: null })
  }, [passing, askId, session])

  const menuItem = useCallback(
    (item: AskItem): AutoMenuItem => ({
      label: item.label,
      ...(item.current ? { current: true } : {}),
      ...(item.disabled ? { disabled: true, hint: t('auto.phase.notYet') } : {}),
      // Una fase: pedirla y, si contesta algo (pasar una ventana, ir a la batalla), contestar.
      onSelect: item.to
        ? () => {
            allow(item.to!)
            if (item.answer) gesture({ kind: 'item', answer: item.answer })
          }
        : item.answer
          ? () => gesture({ kind: 'item', answer: item.answer! })
          : item.children
            ? () => setSub(item)
            : NOTHING,
      // Los hijos son siempre los efectos de «Activar efecto»: como en la mesa manual, filas anchas y a la izquierda.
      ...(item.children ? { children: item.children.map(menuItem), wide: true } : {}),
    }),
    [gesture, allow],
  )

  // ── Lo que la mesa recibe de la pregunta (`duel.auto`). ──
  const pick = shown?.cardPick ?? null
  // Cuántas, para qué (el código de pista del núcleo, si está comprobado) y cuántas van: el mismo título en la mesa, en la banda y en la hoja.
  const pickLabel = pick ? pickTitle(pick, shown?.title) : ''
  // Una lista aparte (de varios lugares, por código, lo del rival): hasta `BAND_MAX` cartas, una banda en el medio de la mesa (`PickBand`); con más, la hoja (`CardPicker`).
  const list = pick && decision.listed ? pick : null
  const band = list !== null && decision.listed!.band
  const myStats = snap.overlay.stats.mine
  // La etiqueta de ATK/DEF de siempre de cada lado (`fieldStatsOf`), estable por valor: un mapa nuevo con los mismos números sería un dibujo de la mesa de más. Los de ahora llegan con
  // la tanda, antes de que la mesa la cuente: mientras la cuenta, tu monstruo que ya estaba sigue con los suyos (no cambia antes del paso que lo cambia) y se ponen al día al terminar.
  // Repasando, nada: la mesa es otra.
  const [shownStats, setShownStats] = useState(() => ({ mine: NO_FIELD_STATS, theirs: NO_FIELD_STATS }))
  const fieldStats = {
    mine: reviewing ? NO_FIELD_STATS : fieldStatsOf(state, (id) => (!settled && shownStats.mine.get(id)) || nowStat(myStats[id]), shownStats.mine),
    theirs: reviewing ? NO_FIELD_STATS : fieldStatsOf(snap.theirs, (id) => nowStat(snap.overlay.stats.theirs[id]), shownStats.theirs),
  }
  if (fieldStats.mine !== shownStats.mine || fieldStats.theirs !== shownStats.theirs) setShownStats(fieldStats)
  const myInitial = snap.initial
  const myNormal = snap.overlay.normal[seat]
  const ended = snap.status === 'ended'
  // Lo que la mesa recibe se arma de nuevo sólo cuando cambia lo que lo decide (`useMemo`): cada aviso del núcleo que no cambia nada de esto deja a la mesa con el mismo `duel.auto`
  // y no la vuelve a dibujar (`PracticeMat` compara sus props campo por campo). Lo que cada función lee está en las dependencias: nunca ve una pregunta vieja.
  const cardPick = useMemo<AutoLink['cardPick']>(() => {
    if (!pick || list) return null
    const ids = (indices: readonly number[]) => indices.flatMap((i) => (pick.cards[i]!.ref?.side === 'mine' ? [pick.cards[i]!.ref!.id] : []))

    return {
      label: pickLabel,
      eligible: new Set(ids(pick.eligible)),
      chosen: ids(pick.chosen),
      onToggle: (id) => gesture({ kind: 'card', ref: { side: 'mine', id } }),
      done: pick.done ? { label: t('auto.pick.done'), onSelect: () => gesture({ kind: 'done' }) } : null,
      cancel: shown?.cancelable ? () => gesture({ kind: 'cancel' }) : null,
      stats: pickStatsOf(state, ids([...pick.eligible, ...pick.chosen]), myStats),
    }
  }, [pick, list, pickLabel, shown, gesture, state, myStats])
  const auto = useMemo<AutoLink>(() => {
    const mineIds = (indices: readonly number[]) => indices.flatMap((i) => (pick!.cards[i]!.ref?.side === 'mine' ? [pick!.cards[i]!.ref!.id] : []))
    const viewerIds = pick && !list && pick.surface === 'pile' ? mineIds([...pick.chosen, ...pick.eligible.filter((i) => !pick.chosen.includes(i))]) : []
    const zoneTargets = shown?.zonePick?.targets ?? []
    const ownZones = zoneTargets.flatMap(({ side, zone, index }) => (side === 'mine' ? [{ zone, index }] : []))
    const rivalEmz = zoneTargets.filter((target) => target.side === 'theirs' && target.zone === 'emz' && !ownZones.some((own) => own.zone === 'emz' && own.index === 1 - target.index))

    return {
      itemsFor: (id, drop) => {
        const items = shown?.items.get(id)

        if (!shown || !items || !drop) return items?.map(menuItem) ?? null
        // Soltada en una casilla: lo que la saca ahí; elegirlo la deja en esa casilla (también en el segundo paso, «¿cuál efecto?»).
        const from = shown.askId
        const keep = (item: AutoMenuItem): AutoMenuItem => ({
          ...item,
          onSelect: () => {
            setDropped({ id, zone: drop.zone, index: drop.index, initial: myInitial, from })
            item.onSelect()
          },
          ...(item.children ? { children: item.children.map(keep) } : {}),
        })

        return itemsInto(items, drop.zone === 'mz' || drop.zone === 'emz' ? 'monster' : 'spell').map((item) => keep(menuItem(item)))
      },
      phaseItems: (stopped ? stopPhaseItems(state.phase) : (shown?.phaseItems ?? [])).map(menuItem),
      endTurn: shown?.endTurn ? () => gesture({ kind: 'item', answer: shown.endTurn! }) : null,
      // Las casillas tuyas, en tu mesa (las del rival, en su campo: `rivalZones`). Una Zona Extra del rival es, vista desde acá, la tuya de enfrente (`1 - index`): se toca ahí.
      zonePick: shown?.zonePick
        ? {
            label: t(shown.type === 'select_disfield' ? 'auto.pick.disfield' : 'auto.pick.zone', { count: shown.zonePick.count }),
            targets: [...ownZones, ...rivalEmz.map(({ index }) => ({ zone: 'emz' as const, index: 1 - index }))],
            onPick: (zone, index) => gesture(zone === 'emz' && !ownZones.some((own) => own.zone === 'emz' && own.index === index) ? { kind: 'zone', side: 'theirs', zone, index: 1 - index } : { kind: 'zone', side: 'mine', zone, index }),
          }
        : null,
      cardPick,
      stats: fieldStats.mine,
      viewer:
        pick && !list && pick.surface === 'pile' && pick.pile
          ? {
              pile: pick.pile,
              ids: viewerIds,
              // Elegir varias de una vez, salvo cuando el núcleo las pide de a una (`select_unselect_card`: cada toque contesta y vuelve a preguntar).
              ...(pick.max > 1 && pick.type !== 'select_unselect_card' ? { many: { label: (ids) => t('auto.picker.choose', { count: ids.length }), onPick: (ids) => gesture(...ids.map((id) => ({ kind: 'card' as const, ref: { side: 'mine' as const, id } })), { kind: 'done' }) } } : {}),
            }
          : null,
      asking: shown !== null,
      // Como «No responder» de la línea: en la ventana de una fase tuya (`phaseWindow`) pasar es cambiar de fase, y eso va por el botón de fases.
      cancel: shown?.cancelable && ((shown.type === 'select_chain' && !shown.phaseWindow) || cardPick || band) ? () => gesture({ kind: 'cancel' }) : null,
      // La carta soltada es del duelo vivo: repasando, no se dibuja sobre la mesa del repaso.
      dropped: reviewing ? null : held,
      holdFor: (id) => {
        // Como en la mesa manual, sólo donde se deshace: en el duelo por enlace un toque largo sin querer sería una jugada.
        const item = canUndo && shown?.type === 'select_idlecmd' ? shown.items.get(id)?.find((entry) => entry.answer?.type === 'select_idlecmd' && entry.answer.action === 2) : undefined

        return item?.answer ? () => gesture({ kind: 'item', answer: item.answer! }) : null
      },
      // Repasando o con el duelo terminado, el menú vacío dice lo de siempre.
      whyNot: reviewing || frozen || ended ? null : (id) => [...(vanilla.has(codeOf({ side: 'mine', id })) ? [t('auto.why.noRules')] : []), ...turnReasons({ state, id, kind: cardKindOf(cardsById.get(id)?.apiCard ?? null), turnMine, ask: shown?.type ?? null, normal: myNormal }), ...limitTexts],
      manual: onManual ?? null,
    }
  }, [pick, list, band, shown, menuItem, gesture, stopped, state, held, reviewing, frozen, ended, myInitial, myNormal, cardsById, turnMine, limitTexts, canUndo, onManual, cardPick, fieldStats.mine, vanilla, codeOf])
  const respond = useMemo(() => new Set(shown?.respond.flatMap((ref) => (ref.side === 'mine' ? [ref.id] : [])) ?? []), [shown])
  const feed = useMemo(() => (snap.replaying ? null : chainFeed(steps, chainSeen)), [steps, chainSeen, snap.replaying])
  // Lo que se activa o se resuelve, de los dos lados, al ritmo del aviso de la cadena (repasando, nada).
  const acting = useMemo(() => actingOf(reviewing ? null : feed), [feed, reviewing])
  // La insignia «CL1», «CL2»… de cada carta de la cadena: mientras se ve su aviso (se va con él, a los `CHAIN_LINGER_MS` de terminar).
  const links = useMemo(() => linksOf(feed && !reviewing && !(feed.done && chainGone === feed.key) ? feed : null), [feed, reviewing, chainGone])

  // ── El rival: su espejo, dibujado por lo que el núcleo dejó ver (`codeOf`). ──
  const theirs = snap.theirs
  /** La carta del rival que se tocó, grande (como «Ver carta»), donde no está el detalle fijo de la izquierda. */
  const [rivalCard, setRivalCard] = useState<{ drawId: string; rect: DOMRect } | null>(null)
  const choosing = Boolean(shown?.cardPick || shown?.zonePick)
  const lockDock = dock.lock
  /**
   * Lo que se muestra de una carta del rival: sólo lo que está a la vista (boca arriba en su campo, en su Cementerio, su Destierro boca arriba o su Extra boca arriba); lo demás, de dorso,
   * aunque el adaptador sepa su código (una carta que volvió a la mano o se colocó después de mostrarse). Nunca su Deck, su mano ni su Extra boca abajo.
   */
  const rivalPeekOf = useCallback(
    (id: string): CardPeek => {
      const placed = [...theirs.mz, ...theirs.emz, ...theirs.st, theirs.field].find((card) => card?.id === id)
      const open = placed ? placed.pos !== 'set' : theirs.extraUp.includes(id) || ((theirs.gy.includes(id) || theirs.banished.includes(id)) && !theirs.facedown.includes(id))
      const code = open ? codeOf({ side: 'theirs', id }) : 0

      return code ? { drawId: drawIdOf(code) } : { faceDown: true }
    },
    [theirs, codeOf],
  )
  /** Mostrar una carta del rival: en el detalle de la izquierda o, sin él, grande (como «Ver carta»); una de dorso, sólo en el detalle. */
  const showRival = useCallback(
    (peek: CardPeek, rect: DOMRect) => {
      if (wide) lockDock(peek)
      else if ('drawId' in peek) setRivalCard({ drawId: peek.drawId, rect })
    },
    [wide, lockDock],
  )
  // Las cartas del rival que la pregunta deja elegir (a qué atacar, el objetivo de un efecto) o activar (una obligatoria de su campo): laten y se tocan; las elegidas llevan la mira.
  const rivalPlays = shown?.theirs
  const rivalPicks = useMemo(() => {
    const refs = (indices: readonly number[]) => indices.flatMap((i) => (pick!.cards[i]!.ref?.side === 'theirs' ? [pick!.cards[i]!.ref!.id] : []))

    return pick
      ? { eligible: new Set(refs(pick.eligible)), chosen: refs(pick.chosen), stats: pickStatsOf(theirs, refs([...pick.eligible, ...pick.chosen]), snap.overlay.stats.theirs) }
      : rivalPlays?.size
        ? { eligible: new Set(rivalPlays.keys()), chosen: [], stats: null }
        : null
  }, [pick, rivalPlays, theirs, snap.overlay.stats])
  // Las casillas del rival que la pregunta deja elegir (donde va un Kaiju, las que se inutilizan): se encienden en su campo y se tocan. Sus Zonas Extra, en las tuyas (`zonePick`).
  const rivalZones = useMemo(() => {
    const targets = shown?.zonePick?.targets.flatMap(({ side, zone, index }) => (side === 'theirs' && zone !== 'emz' ? [{ zone, index }] : [])) ?? []

    return targets.length > 0 ? { targets, onPick: (zone: MatSpot, index: number) => gesture({ kind: 'zone', side: 'theirs', zone, index }) } : null
  }, [shown, gesture])
  /** El visor de una pila del rival (información pública): su Cementerio, su Destierro o lo boca arriba de su Extra. Repasando, su lado está vacío. */
  const [rivalPileOpen, setRivalPile] = useState<'gy' | 'banished' | 'extra' | null>(null)
  const rivalPile = reviewing ? null : rivalPileOpen
  const opponent = useMemo<DuelSideView>(
    () => ({
      state: theirs,
      artOf: (id) => artOf({ side: 'theirs', id }),
      handCount: theirs.hand.length,
      ...(rivalPicks ? { pickable: rivalPicks.eligible, marks: { cards: rivalPicks.chosen, piles: [] }, ...(rivalPicks.stats ? { pickStats: rivalPicks.stats } : {}) } : {}),
      stats: fieldStats.theirs,
      ...(rivalZones ? { zones: rivalZones } : {}),
      act: acting.theirs,
      links: links.theirs,
      // Tocar una carta suya la elige (o la activa: con varios efectos, pregunta cuál) si la pregunta la ofrece; si no, la muestra. Tocar su Cementerio, su Destierro o su Extra con
      // cartas boca arriba abre (o cierra) su visor.
      onMark: (target, rect) => {
        if ('pile' in target) {
          const pile = target.pile === 'gy' || target.pile === 'banished' || target.pile === 'extra' ? target.pile : null

          if (pile && (pile === 'extra' ? theirs.extraUp : theirs[pile]).length > 0) setRivalPile((current) => (current === pile ? null : pile))
          return
        }
        const plays = rivalPlays?.get(target.card)?.flatMap((item) => item.children ?? [item])

        if (plays?.length === 1) gesture({ kind: 'item', answer: plays[0]!.answer! })
        else if (plays) setSub({ label: t('practice.menu.activateEffect'), children: plays })
        else if (rivalPicks?.eligible.has(target.card)) gesture({ kind: 'card', ref: { side: 'theirs', id: target.card } })
        else showRival(rivalPeekOf(target.card), rect)
      },
    }),
    [theirs, artOf, gesture, rivalPicks, rivalZones, rivalPlays, showRival, rivalPeekOf, acting, links, fieldStats.theirs],
  )
  const foreignKnown = useMemo(() => Object.fromEntries(allMatIds(theirs).flatMap((id) => (codeOf({ side: 'theirs', id }) ? [[id, drawIdOf(codeOf({ side: 'theirs', id }))]] : []))), [theirs, codeOf])
  const attackTargets = useMemo(() => (['mz', 'emz'] as const).flatMap((zone) => theirs[zone].flatMap((placed, index) => (placed ? [{ id: placed.id, zone, index, faceDown: placed.pos === 'set' }] : []))), [theirs])
  // Lo del rival que la mesa recibe, armado una vez por mesa del rival (y no por aviso del núcleo): su campo, su mano, sus vuelos y sus Zonas Extra.
  const opponentCells = useMemo(() => <SideCells side={opponent} owner="theirs" />, [opponent])
  const sharedZone = useCallback((index: number) => sharedZoneCard(opponent, index), [opponent])
  const rivalFlights = useMemo(() => ({ state: theirs, artOf: opponent.artOf }), [theirs, opponent.artOf])
  const rivalEmzTaken = useMemo(() => theirs.emz.map(Boolean), [theirs.emz])
  const hoverDock = dock.hover
  const rivalHandCount = theirs.hand.length
  const rivalHandNode = useMemo(
    () => (
      <TheirHand
        count={rivalHandCount}
        {...(rivalHand
          ? {
              cards: rivalHand.map((code) => ({ name: nameOf(null, code), art: artOf(null, code) })),
              onCard: (index: number, rect: DOMRect) => showRival({ drawId: drawIdOf(rivalHand[index]!) }, rect),
              onCardHover: (index: number) => hoverDock({ drawId: drawIdOf(rivalHand[index]!) }),
            }
          : {})}
      />
    ),
    [rivalHandCount, rivalHand, nameOf, artOf, showRival, hoverDock],
  )
  const onRivalHover = useCallback((id: string) => hoverDock(rivalPeekOf(id)), [hoverDock, rivalPeekOf])
  // Abrir una pila tuya cierra la del rival: van en el mismo lugar.
  const onActivity = useCallback((activity: Activity | null) => {
    if (activity !== null && activity !== 'choosing') setRivalPile(null)
  }, [])

  // ── La línea del registro: lo que no frena (trabada, el rival eligiendo, pensando, la cadena con «No responder», un error de script, la cadena que se resuelve), lo más urgente primero. ──
  const chain = snap.overlay.chain
  // Lo que se activa en la cadena, de los dos lados: tus cartas y las del rival que la pregunta te deja activar (una obligatoria de su campo).
  const activatable = shown?.type === 'select_chain' ? [...[...shown.items].map(([id, items]) => ({ ref: { side: 'mine' as const, id }, items })), ...[...shown.theirs].map(([id, items]) => ({ ref: { side: 'theirs' as const, id }, items }))] : []
  // «Tenés que activar…», sin nombres: la carta (o la pila) que hay que activar brilla.
  const mustActivate = (count: number) => t('auto.lane.mustActivate', { count })
  const newFault = snap.faults[snap.faults.length - 1]
  const lastUnmapped = snap.unmapped[snap.unmapped.length - 1]

  // La línea lo dice con palabras de la mesa; el detalle técnico (el mensaje del núcleo, la nota del adaptador), en la consola.
  useEffect(() => {
    if (newFault) console.warn('[auto] el núcleo avisó un error:', newFault.kind, newFault.message)
  }, [newFault])
  useEffect(() => {
    if (lastUnmapped) console.warn('[auto] la mesa no pudo mostrar:', lastUnmapped)
  }, [lastUnmapped])
  // Varias obligatorias a la vez (una cadena forzada con dos a `BAND_MAX` cartas, cada una con un solo efecto) o una del rival: se elige cuál entra primero en la banda del medio, con la
  // elegida en «Activar X primero» (también se activa tocando la que brilla en la mesa). Con una sola tuya, o si alguna tiene varios efectos (su menú pregunta cuál), la línea de siempre.
  const forcedItems =
    shown?.type === 'select_chain' && !shown.phaseWindow && !shown.cancelable && activatable.length <= BAND_MAX && (activatable.length >= 2 || activatable.some(({ ref }) => ref.side === 'theirs')) ? activatable : []
  const forced = forcedItems.length > 0 && forcedItems.every(({ items }) => items.length === 1 && items[0]!.answer) ? forcedItems.map(({ ref, items }) => ({ ref, key: `${ref.side}:${ref.id}`, item: items[0]! })) : null
  const [forcedPick, setForcedPick] = useState<string | null>(null)
  const forcedFirst = forced ? (forced.find((card) => card.key === forcedPick) ?? forced[0]!) : null
  const forcedOn = forced !== null
  const activatableCount = activatable.length
  const rivalBusy = rival?.busy ?? true
  const status = snap.status
  const faults = snap.faults
  const unmappedCount = snap.unmapped.length
  // Un objeto por lo que dice (la barra lo recibe): lo que llega del núcleo sin cambiar nada de esto no la vuelve a dibujar.
  const lane = useMemo<LaneNotice | null>(
    () =>
      review
        ? // Repasando: qué se mira y la salida, en el lugar de los avisos (no corre nada). Un combo dice sólo su nombre: el paso va en el segundo renglón (la mesa) y los botones del replay, abajo;
          // «Volver al duelo» es secundario (lavanda) para no competir con el botón grande del replay.
          { kind: 'ask', text: review.name === undefined ? t('auto.review.plays') : t('auto.review.comboShort', { name: review.name }), actions: [{ label: t('auto.review.back'), onSelect: back, secondary: true }] }
        : frozen
          ? null
          : stuck
            ? { kind: 'ask', text: t('auto.lane.stuck'), actions: canUndo ? [{ label: t('practice.mat.undo'), onSelect: () => session.undo(), primary: true }] : [] }
            : status === 'waiting' && waitingText !== null && rivalBusy
              ? { kind: 'thinking', text: waitingText }
              : status === 'thinking'
                ? { kind: 'thinking', ...(canCancel ? { onCancel: () => session.cancel() } : {}) }
                : shown?.type === 'select_chain' && !shown.phaseWindow
                  ? // Una cadena obligatoria (una sola carta, a veces en una pila: brilla la pila) no tiene «No responder»: la línea dice que hay que activarla. La que se puede pasar
                    // va al medio (la banda de responder, `offer`) y la línea queda libre; varias obligatorias, también (`forced`).
                    shown.cancelable || forcedOn
                    ? null
                    : { kind: 'ask', text: mustActivate(activatableCount), actions: [] }
                  : faults.length > faultsBase.current && newFault
                    ? {
                        kind: 'ask',
                        text:
                          newFault.kind === 'script'
                            ? t('auto.lane.script', { card: newFault.cards.map((code) => nameOf(null, code)).join(', ') })
                            : t(newFault.kind === 'retry' || newFault.kind === 'answer' ? 'auto.lane.rejected' : 'auto.lane.error'),
                        actions: [],
                      }
                    : unmappedCount > unmappedBase.current
                      ? { kind: 'ask', text: t('auto.lane.unmapped'), actions: [] }
                      : null,
    [review, back, frozen, stuck, canUndo, session, status, waitingText, rivalBusy, canCancel, shown, forcedOn, activatableCount, faults, newFault, unmappedCount, nameOf],
  )
  // La cadena que se puede pasar, al medio de la mesa (como «¿Activás el efecto?»): se responde tocando la carta que brilla; sin nada más urgente en la línea (trabada, esperando, pensando).
  // El aviso de la cadena: la última que empezó, como se ve con lo que ya se mostró (`feed`, más arriba). Abre desplegada y sólo la pliega la persona; terminada, se va a los
  // `CHAIN_LINGER_MS` salvo que la estés mirando (la desplegaste o tocaste un eslabón: queda hasta plegarla).
  const touched = feed !== null && chainTouch?.key === feed.key
  const chainOpen = touched ? chainTouch.open : true
  const chainKept = touched && chainOpen

  useEffect(() => {
    if (!feed?.done || chainKept) return
    const timer = window.setTimeout(() => setChainGone(feed.key), CHAIN_LINGER_MS)

    return () => window.clearTimeout(timer)
  }, [feed, chainKept])
  // Tocar un eslabón de la pila lo muestra para leerlo: en el detalle fijo (la tuya, con tu carta; la del rival, por su número: un eslabón está a la vista) o, sin detalle, grande
  // como una carta del rival. Con la frase de su efecto resaltada en el detalle cuando no hay duda de cuál es (`linkPhrase`); se resalta mientras la pila está a la vista.
  const [linkRead, setLinkRead] = useState<{ code: number; description?: string; card: ApiCardReference | null } | null>(null)
  const linkRivalCard = useRivalCard(linkRead && !linkRead.card && linkRead.code ? drawIdOf(linkRead.code) : undefined)
  const readLink = useCallback(
    (index: number, rect: DOMRect) => {
      const row = feed?.rows[index]

      if (!row) return
      const card = row.mine ? ((row.card?.side === 'mine' ? cardsById.get(row.card.id)?.apiCard : undefined) ?? byCode.get(row.code)?.apiCard ?? null) : null

      setLinkRead({ code: row.code, card, ...(row.description ? { description: row.description } : {}) })
      setChainTouch({ key: feed.key, open: true })
      if (wide && card) lockDock({ name: nameOf(row.card, row.code), card })
      else showRival(row.code ? { drawId: drawIdOf(row.code) } : { faceDown: true }, rect)
    },
    [feed, cardsById, byCode, wide, lockDock, nameOf, showRival],
  )
  const chainShown = feed !== null && !reviewing && !(feed.done && chainGone === feed.key)
  // El visor de pilas de una búsqueda flota sobre el centro de la mesa (escritorio): mientras se elige ahí, la cadena va plegada a su píldora para no pisarlo (después vuelve a como estaba).
  const viewerOpen = desktop && pick !== null && list === null && pick.surface === 'pile'
  const chainNotice = useMemo(
    () =>
      chainShown && feed ? (
        <ChainNotice
          rows={feed.rows.map((row) => ({ number: row.number, who: row.mine ? t('duel.bar.you') : rivalName, mine: row.mine, name: row.code ? nameOf(null, row.code) : nameOf(row.card), art: artOf(row.card, row.code), state: row.state, ...(row.by ? { by: row.by } : {}) }))}
          focus={feed.focus}
          resolving={feed.resolving}
          open={chainOpen && !viewerOpen}
          compact={!desktop}
          onOpenChange={(open) => setChainTouch({ key: feed.key, open })}
          onPick={readLink}
        />
      ) : null,
    [chainShown, feed, rivalName, nameOf, artOf, chainOpen, viewerOpen, desktop, readLink],
  )
  const linkText = linkRead?.card ?? linkRivalCard
  const linkHighlight = useMemo<CardTextHighlight | null>(() => {
    const range = chainNotice && linkRead && linkText?.description ? linkPhrase(linkText.description, linkRead.code, linkRead.description) : null

    return range && linkText ? { ygoprodeckId: linkText.ygoprodeckId, ...range } : null
  }, [chainNotice, linkRead, linkText])
  // La cadena que se puede pasar, en la banda de responder: a qué eslabón y con qué cartas (con su lugar). Con una sola de un solo efecto, ya viene elegida; una con varios efectos
  // abre su lista (como su menú en la mesa).
  const offer = shown && lane === null ? respondOffer(shown, chain) : null
  // La elegida es de esta pregunta (`askState`, no su número: al reiniciar el duelo los números vuelven a empezar).
  const [offerPick, setOfferPick] = useState<{ of: AskState; key: string } | null>(null)
  const only = offer?.candidates.length === 1 && offer.candidates[0]!.answer ? offer.candidates[0]! : null
  const offered = offer?.candidates.find((candidate) => offerPick !== null && offerPick.of === askState && candidate.key === offerPick.key) ?? only
  const pickOffer = (key: string) => {
    const candidate = offer?.candidates.find((item) => item.key === key)

    if (!candidate || !askState) return
    if (candidate.answer) setOfferPick({ of: askState, key })
    else setSub({ label: t('practice.menu.activateEffect'), children: candidate.items.flatMap((item) => item.children ?? [item]) })
  }

  // ── ATK/DEF de ahora de la carta del detalle (sólo las del campo los tienen): se busca por código entre las del campo de ese lado. ──
  const peeked = dock.shown
  const dockStats = useMemo(() => {
    const side: Side = peeked && 'drawId' in peeked ? 'theirs' : 'mine'
    const code = peeked && 'card' in peeked ? peeked.card?.ygoprodeckId : peeked && 'drawId' in peeked ? parseDerivedCardId(cardIdOfDrawId(peeked.drawId)) : null
    const mat = side === 'mine' ? state : theirs
    const codeAt = (id: string) => (side === 'mine' ? cardsById.get(id)?.apiCard?.ygoprodeckId : codeOf({ side, id }))
    const id = code ? [...mat.mz, ...mat.emz, ...mat.st, mat.field].find((placed) => placed !== null && codeAt(placed.id) === code)?.id : undefined

    return id ? (snap.overlay.stats[side][id] ?? null) : null
  }, [peeked, state, theirs, cardsById, codeOf, snap.overlay.stats])

  // ── Lo que se muestra fuera del campo. ──
  const prompt = shown?.prompt
  const promptCard = prompt?.card
  const effectAsk = prompt && promptCard ? effectAskText(prompt, snap.overlay.cause) : null
  const options = shown?.options
  // Una opción sin texto no inventa un número (el orden de la pregunta no es el de la carta): dice «Activar efecto». La carta que pregunta (la que nombran sus opciones, si
  // se la conoce) va arriba del título.
  const optionLabel = (option: { value: number; label?: string }) =>
    option.label ?? (options?.of === 'race' ? (RACES[option.value] ?? String(option.value)) : options?.of === 'attribute' ? (ATTRIBUTES[option.value] ?? String(option.value)) : t('practice.menu.activateEffect'))
  const askingCode = options?.options.map((option) => (option.description ? splitDesc(option.description).code : 0)).find((code) => Boolean(snap.names[code] ?? cards?.get(code)?.name))
  const optionsTitle = options ? (options.of === 'position' ? t('auto.options.position') : options.of === 'number' ? t('auto.options.number') : options.of === 'race' ? t('auto.options.race', { count: options.count }) : options.of === 'attribute' ? t('auto.options.attribute', { count: options.count }) : options.of === 'rps' ? t('duel.games.rps.title') : t('auto.options.option')) : ''
  // Todas las de la pregunta, en su orden (las que ahora no valen van apagadas: `eligible`; las elegidas, con su aro), salvo las del deck, que van por nombre (`listOrder`).
  // Cada carta, por quién es (no por su índice: un `select_unselect_card` vuelve a preguntar con la elegida al final de la lista) y, en ese caso, siempre en el mismo orden (por
  // lugar y nombre): mientras dura la decisión, ninguna se corre de lugar.
  const listKeys = list ? list.cards.map((card, i) => (card.ref ? `${card.ref.side}:${card.ref.id}` : String(i))) : []
  const listSort = (card: AskCard) => `${card.ref?.side ?? ''}|${card.place}|${card.pile ?? ''}|${nameOf(card.ref, card.code)}|${card.ref?.id ?? ''}`
  const listShown = !list ? [] : list.type === 'select_unselect_card' ? list.cards.map((_, i) => i).sort((a, b) => listSort(list.cards[a]!).localeCompare(listSort(list.cards[b]!))) : listOrder(list.cards, (card) => nameOf(card.ref, card.code))
  const listCards = listShown.map((i) => pickCardOf(list!.cards[i]!, listKeys[i]!))
  // En la banda, si todas salen del mismo lugar, el lugar va una vez, en la pestaña («Cementerio · 3»), y no debajo de cada carta.
  const sourceOf = (card: AskCard) => (card.place === 'hand' ? 'hand' : card.place === 'pile' ? card.pile : undefined)
  const lead = list?.cards[0]
  const from = band && list && lead?.ref && sourceOf(lead) && list.cards.every((card) => card.ref?.side === lead.ref!.side && sourceOf(card) === sourceOf(lead)) ? sourceOf(lead)! : null
  const bandPlace = from ? pickPlace(from, lead!.ref!.side === 'theirs').place : null
  const bandCards = bandPlace ? listCards.map(({ place: _place, from: _from, theirs: _theirs, ...card }) => card) : listCards
  const listProps = list
    ? {
        chosen: list.chosen.map((i) => listKeys[i]!),
        eligible: new Set(list.eligible.map((i) => listKeys[i]!)),
        done: list.done,
        onToggle: (key: string) => gesture({ kind: 'pick', index: listKeys.indexOf(key) }),
        ...(shown?.cancelable ? { onCancel: () => gesture({ kind: 'cancel' }) } : {}),
      }
    : null

  // El aviso de «Deshacer» de tu última activación: mientras dura, con la mesa de entonces y el duelo esperándote (pensando, rearmando o repasando, no).
  const timedPlay = useUndoPlay(lastPlay)
  const undoShown = timedPlay !== null && timedPlay.initial === snap.initial && snap.status === 'ready' && !snap.replaying && !reviewing && !frozen
  const undoPlay = useMemo(() => (undoShown && timedPlay ? { key: timedPlay.key, art: timedPlay.art } : null), [undoShown, timedPlay])

  // El cartel del ataque del rival, como en el duelo manual; se arma una vez por ataque (la mesa dibuja la espada cuando cambia el objeto).
  const strikeShown = rivalStrike.shown
  // eslint-disable-next-line react-hooks/exhaustive-deps -- un objeto por ataque: un nombre que llega después no vuelve a dibujar la espada
  const announcement = useMemo(() => strikeShown && { ...strikeShown, caption: strikeShown.targetId === undefined ? t('duel.announce.attackDirect', { name: rivalName }) : t('duel.announce.attack', { name: rivalName, target: nameOf({ side: 'mine', id: strikeShown.targetId }) }) }, [strikeShown])

  const dockHighlight = highlight ?? linkHighlight
  const detail = useMemo(() => (wide ? <DuelCardDock peek={peeked} highlight={dockHighlight} stats={reviewing ? null : dockStats} /> : undefined), [wide, peeked, dockHighlight, reviewing, dockStats])
  const limits = useMemo(() => (reviewing ? null : <LimitsChip texts={limitTexts} />), [reviewing, limitTexts])
  const mat: AutoAsks['mat'] = {
    undoPlay,
    ...(announcement ? { announcement } : {}),
    areas: DUEL_AREAS,
    areasCompact: DUEL_AREAS_COMPACT,
    opponent: opponentCells,
    sharedZone,
    rivalHand: rivalHandNode,
    attackTargets,
    foreignKnown,
    // La fase de quien tiene el turno (como en el duelo manual): la tuya, en tu mesa; la del rival, la que él ve (`rival`) o, si no la avisa, la del espejo de la suya.
    phase: turnMine ? state.phase : (rival?.phase ?? theirs.phase),
    // Cambiás de fase en tus jugadas del turno, en una parada de tu DP o tu SP y en la ventana de una fase tuya.
    myTurn: stopped || shown?.type === 'select_idlecmd' || shown?.type === 'select_battlecmd' || !!shown?.phaseWindow,
    respond,
    act: acting.mine,
    links: links.mine,
    prompt: prompt ? (
      <AskPrompt
        key={askId ?? 0}
        // Un sí o no a secas dice su pregunta (el texto de su `desc`) cuando la tiene; el de un efecto, «¿Activás el efecto?» con qué pasó y su lugar (`effectAsk`): la carta, por su arte.
        text={effectAsk?.text ?? effectLabel(0, prompt.description) ?? t('auto.ask.fallback')}
        {...(promptCard ? { card: { name: nameOf(promptCard.ref, promptCard.code), art: artOf(promptCard.ref, promptCard.code) } } : {})}
        {...(effectAsk?.kicker ? { kicker: effectAsk.kicker } : {})}
        {...(effectAsk?.place ? { place: effectAsk.place } : {})}
        {...(promptCard && onManual ? { manual: { label: t('auto.bar.manual'), onSelect: onManual } } : {})}
        yes={{ label: promptCard ? t('practice.menu.activateEffect') : t('auto.ask.yes'), onSelect: () => gesture({ kind: 'item', answer: prompt.yes }) }}
        no={{ label: promptCard ? t('auto.ask.skipEffect') : t('auto.ask.no'), onSelect: () => gesture({ kind: 'item', answer: prompt.no }) }}
      />
    ) : offer ? (
      <RespondBand
        key={askId ?? 0}
        // A qué eslabón respondés (su número, su dueño, su carta y su estado) ya lo dice la pila de la cadena, arriba y desplegada: la banda dice sólo qué se decide.
        title={offer.to ? t('auto.respond.title') : t('auto.respond.now')}
        link={offer.link}
        cards={offer.candidates.map(({ ref, key, at }): PickCard => {
          const place = placeLabel(at)
          const where = place && ref.side === 'theirs' ? t('duel.zone.theirs', { zone: place }) : place

          return { key, name: nameOf(ref), art: artOf(ref), ...(where ? { place: where } : {}) }
        })}
        chosen={offered?.key ?? null}
        onToggle={pickOffer}
        onChain={() => {
          if (offered?.answer) gesture({ kind: 'item', answer: offered.answer })
        }}
        onPass={() => gesture({ kind: 'cancel' })}
        mode={{ value: prefs.chain, onChange: (mode) => setAutoPref('chain', mode) }}
      />
    ) : forced && forcedFirst && lane === null ? (
      // Varias obligatorias: tocar elige cuál va primero (la primera, de entrada) y la principal la activa; sin «No responder». Una del rival dice de dónde es.
      <PickBand
        key={askId ?? 0}
        title={forced.length > 1 ? t('auto.forced.title', { count: forced.length }) : mustActivate(1)}
        cards={forced.map(({ ref, key }): PickCard => {
          const at = locateCard(ref.side === 'mine' ? state : theirs, ref.id)
          const pile = at?.kind === 'pile' ? PILE_TITLES[at.pile] : undefined
          const place = ref.side === 'theirs' ? t('duel.zone.theirs', { zone: pile ?? t('practice.mat.field') }) : pile

          return { key, name: nameOf(ref), art: artOf(ref), ...(place ? { place } : {}) }
        })}
        chosen={[forcedFirst.key]}
        eligible={new Set(forced.map((card) => card.key))}
        multi={false}
        done
        onToggle={setForcedPick}
        onPick={() => gesture({ kind: 'item', answer: forcedFirst.item.answer! })}
        action={forced.length > 1 ? (chain.length === 0 ? t('auto.respond.start') : t('auto.respond.chain', { link: chain.length + 1 })) : forcedFirst.item.label}
        {...(forced.length > 1 ? { note: t('auto.forced.hint') } : {})}
      />
    ) : band && listProps ? (
      // `select_unselect_card` va de a una (cada toque contesta y el núcleo vuelve a preguntar: la misma banda, por `decision`).
      <PickBand
        key={decision.of ?? 0}
        title={pickLabel}
        {...(bandPlace ? { place: t('auto.band.from', { place: bandPlace, count: listCards.length }) } : {})}
        cards={bandCards}
        multi={list.type !== 'select_unselect_card' && list.max > 1}
        onPick={() => gesture({ kind: 'done' })}
        {...listProps}
      />
    ) : undefined,
    rivalFlights,
    ...(chainNotice ? { chain: chainNotice } : {}),
    turnNumber: snap.overlay.turn,
    rivalEmz: rivalEmzTaken,
    // El ATK/DEF de ahora es del duelo vivo: repasando, el detalle muestra la carta impresa.
    ...(wide ? { detail } : {}),
    onPeek: dock.lock,
    onHover: dock.hover,
    onRivalHover,
    rivalViewing: rivalPile !== null,
    onActivity,
    onHighlight: setHighlight,
    auto,
    limits,
  }

  const pieces = (
    <>
      <Presence>
        {options ? (
          <AskOptions
            key={`options-${askId}`}
            title={optionsTitle}
            {...(askingCode ? { kicker: nameOf(null, askingCode) } : {})}
            options={options.options.map((option): AskOption => ({ id: String(option.value), label: optionLabel(option) }))}
            mode={options.count > 1 || options.of === 'race' || options.of === 'attribute' ? { count: options.count } : 'one'}
            onPick={(ids) => gesture(...ids.map((id) => ({ kind: 'option' as const, value: Number(id) })))}
          />
        ) : null}
      </Presence>
      <Presence>
        {sub?.children ? (
          // Como la lista de efectos de la mesa manual: la carta arriba y un efecto por fila, a la izquierda.
          <AskOptions
            key={`sub-${askId}`}
            title={sub.label}
            {...(sub.children[0]?.effect ? { kicker: nameOf(null, sub.children[0].effect.code) } : {})}
            options={sub.children.map((child, index): AskOption => ({ id: String(index), label: child.label }))}
            mode="one"
            stacked
            // Todavía no se contestó nada: elegir el efecto es parte de tocar la carta, así que se cierra como su menú.
            onCancel={() => setSub(null)}
            onPick={([id]) => {
              const child = sub.children![Number(id)]

              if (child?.answer) gesture({ kind: 'item', answer: child.answer })
            }}
          />
        ) : null}
      </Presence>
      <Presence>
        {shown?.sort ? (
          <SortSheet
            key={`sort-${askId}`}
            {...(shown.type === 'sort_chain' ? { title: t('auto.sort.chain'), hint: t('auto.sort.chainHint'), done: t('auto.sort.chainDone') } : {})}
            cards={shown.sort.cards.map((card, index) => pickCardOf(card, String(index)))}
            onSort={(keys) => (keys === null ? gesture({ kind: 'cancel' }) : gesture(...keys.map((key) => ({ kind: 'pick' as const, index: Number(key) })), { kind: 'done' }))}
          />
        ) : null}
      </Presence>
      <Presence>
        {shown?.counters ? (
          // Cuántos de cada carta: un toque por contador y «Listo» (la cuenta y los topes, otra vez en `ask-ui`).
          <CounterSheet
            key={`counters-${askId}`}
            cards={shown.counters.cards.map((card, index) => ({ ...pickCardOf(card, String(index)), has: card.value ?? 0 }))}
            need={shown.counters.need}
            onPick={(counts) => gesture(...counts.flatMap((count, index) => Array.from({ length: count }, () => ({ kind: 'pick' as const, index }))), { kind: 'done' })}
          />
        ) : null}
      </Presence>
      <Presence>
        {list && listProps && !band ? (
          // La cuenta la lleva `ask-ui` (lo elegido, lo que todavía vale, si «Listo» contesta): la hoja sólo la muestra. `select_unselect_card` va de a una (cada toque contesta).
          <CardPicker
            key={`picker-${decision.of}`}
            title={pickLabel}
            cards={listCards}
            min={list.min}
            max={list.type === 'select_unselect_card' ? 1 : list.max}
            onPick={() => gesture({ kind: 'done' })}
            {...listProps}
          />
        ) : null}
      </Presence>
      <Presence>{rivalCard ? <RivalCardDetail key={rivalCard.drawId} drawId={rivalCard.drawId} origin={rivalCard.rect} onClose={() => setRivalCard(null)} /> : null}</Presence>
    </>
  )

  const rivalTargeted = useMemo(() => new Set(theirs.targeted), [theirs.targeted])
  const rivalViewerHidden = choosing || frozen || ended || Boolean(snap.fault)
  const rivalActing = acting.theirs
  const rivalViewer = useMemo(
    () => (
      <PileViewer
        pile={rivalPile}
        // Eligiendo en la mesa (o con la mesa tapada por el final) se esconde sin cerrarse, como el tuyo.
        hidden={rivalViewerHidden}
        ids={rivalPile ? (rivalPile === 'extra' ? theirs.extraUp : theirs[rivalPile]) : []}
        info={(id) => {
          const peek = rivalPeekOf(id)
          const open = 'drawId' in peek

          return { name: open ? nameOf({ side: 'theirs', id }) : t('duel.mark.rivalCard'), art: open ? artOf({ side: 'theirs', id }) : null, faceDown: !open, faceUp: rivalPile === 'extra' }
        }}
        targeted={rivalTargeted}
        glow={(id) => (rivalActing.has(id) ? 'act' : null)}
        onPick={(id, rect) => {
          if (!wide) showRival(rivalPeekOf(id), rect)
        }}
        onPeek={(id) => lockDock(rivalPeekOf(id))}
        onHover={(id) => hoverDock(rivalPeekOf(id))}
        onClose={() => setRivalPile(null)}
      />
    ),
    [rivalPile, rivalViewerHidden, theirs, rivalPeekOf, nameOf, artOf, rivalTargeted, rivalActing, wide, showRival, lockDock, hoverDock],
  )
  return {
    rivalViewer,
    lifeHeld,
    state: reviewState ?? state,
    matSession: review?.session ?? matSession,
    settled,
    counted: paced.cursor,
    skipAhead,
    lane,
    mat: reviewState ? reviewMat(mat, reviewState.phase) : mat,
    pieces,
    nameOf,
    artOf,
    undoable: !reviewing && snap.answers.some((item) => item.seat === seat && undoPoint(item)),
    // Lo que se repasa es tuyo.
    turnMine: reviewing || turnMine,
    review: { active: reviewing, load, seek, back },
    // Tu turno libre (tus jugadas, una parada o la ventana de una fase tuya) no es «estar eligiendo».
    told:
      snap.status === 'loading' || snap.replaying
        ? null
        : { turn: snap.overlay.turn, phase: state.phase, busy: shown !== null && shown.type !== 'select_idlecmd' && shown.type !== 'select_battlecmd' && !shown.phaseWindow },
  }
}

/** Un lado del rival vacío: repasando, la mesa es sólo la tuya (como en la práctica), sin moverse de lugar. Siempre los mismos objetos: la mesa no se vuelve a dibujar por ellos. */
const NO_RIVAL: DuelSideView = { state: createMatState([], [], 0), artOf: () => null, handCount: 0 }
const NO_RIVAL_CELLS = <SideCells side={NO_RIVAL} owner="theirs" />
const NO_RIVAL_HAND = <TheirHand count={0} />
const NO_SHARED_ZONE = () => null
const NO_TARGETS: DuelMatLink['attackTargets'] = []

/** La mesa del repaso: el lado del rival vacío y sin sus vuelos (al volver al duelo, sus cartas siguen donde estaban) y la fase del paso que se mira. */
function reviewMat(mat: AutoAsks['mat'], phase: MatPhase): AutoAsks['mat'] {
  const { rivalFlights: _flights, ...rest } = mat

  return { ...rest, opponent: NO_RIVAL_CELLS, sharedZone: NO_SHARED_ZONE, rivalHand: NO_RIVAL_HAND, attackTargets: NO_TARGETS, phase }
}
