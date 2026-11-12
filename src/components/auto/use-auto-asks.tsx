import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'

import { rivalAttacks, type CardRef, type RivalAttack, type Side } from '../../app/auto/adapter'
import { NO_FIELD_STATS, fieldStatsOf, nowStat } from '../../app/field-stats'
import { askWhy, askWhyText, type AskWhyView } from '../../app/auto/ask-why'
import { ATTACK_TARGET_HINT, askView, effectAskText, itemsInto, listOrder, openAsk, optionsTitle as optionsTitleOf, pickStatsOf, pickTitle, respondOffer, respondTitle, step, yesNoText, zoneTitle, type AskCard, type AskGesture, type AskItem, type AskState, type AutoLink, type AutoMenuItem } from '../../app/auto/ask-ui'
import { activatedCode, undoPoint, type AutoSession, type AutoSnapshot } from '../../app/auto/auto-session'
import { CHAIN_LINGER_MS, chainDwell, chainFeed, linkPhrase, stepsUpTo, type ChainRow, type ChainStep } from '../../app/auto/chain-feed'
import { frameKindOf, frameOfType, type CardFrame } from '../../app/card-frame'
import { fetchCardsByIds } from '../../ygoprodeck'
import { rivalAttackInCourse } from '../../app/attack-trail'
import { actingOf, linksOf, medalsOf } from '../../app/card-glow'
import type { PhaseView } from '../../app/auto/online'
import type { AutoCardInfo } from '../../app/auto/online-protocol'
import { turnReasons } from '../../app/auto/no-plays'
import { foldOpeningHand } from '../../app/auto/opening-hand'
import { allowTo, leaves, type Allowed } from '../../app/auto/phase-stops'
import { splitDesc, type Seat } from '../../app/auto/protocol'
import { useAutoPrefs } from '../../app/auto-prefs'
import { useEndReveal, type LethalHit } from '../../app/end-reveal'
import { useHeldValue } from '../../app/life-effects'
import { prefersReducedMotion } from '../../app/motion'
import { parseDerivedCardId } from '../../app/calculator-state'
import type { CardTextHighlight } from '../../app/card-text'
import type { Activity } from '../../app/duel-protocol'
import { allMatIds, cardKindOf, createMatState, locateCard, matReducer, replayMat, type MatAction, type MatPhase, type MatSpot, type MatState, type MatTarget } from '../../app/practice-mat'
import type { SavedCombo } from '../../app/saved-combos'
import { playSfx } from '../../app/sfx'
import { useChange } from '../../app/use-duel-sounds'
import type { MatSession } from '../../app/use-mat-session'
import { DESKTOP_DECK_BUILDER_MEDIA_QUERY, useMediaQuery } from '../../app/use-media-query'
import { usePracticeSounds } from '../../app/use-practice-sounds'
import { showToastMessage } from '../../app/use-toast-message'
import { Presence } from '../../app/use-presence'
import { t } from '../../i18n'
import { artOfDrawId } from '../duel/duel-art'
import type { LaneNotice } from '../duel/DuelBar'
import { DuelCardDock, type CardPeek } from '../duel/DuelCardDock'
import { DUEL_AREAS, SideCells, sharedZoneCard, TheirHand, type DuelSideView } from '../duel/DuelTable'
import { RivalCardDetail, useRivalCard } from '../duel/RivalCardDetail'
import { useDockPeek } from '../duel/use-dock-peek'
import { PILE_TITLES, PileViewer } from '../probability/MatDialogs'
import { cardIdOfDrawId } from '../probability/practice'
import type { DuelMatLink, MatCard } from '../probability/PracticeMat'
import { IMPACT_MS } from '../probability/AttackFx'
import { FLIGHT_MS } from '../../app/use-card-flights'
import { useUndoPlay, type UndoPlay } from '../probability/UndoChip'
import { AskOptions, type AskOption } from './AskOptions'
import { AskPrompt } from './AskPrompt'
import { AutoCardSheet, AutoPhases } from './AutoPanel'
import { BAND_MAX, CardPicker, PickBand, copyGroups, pickPlace, type PickCard, type PickFrom } from './CardPicker'
import { ChainStage, outcomeLabel } from './ChainNotice'
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

/** La mesa como la ve la pantalla: la mesa del arranque, las jugadas que ya llegaron, hasta cuál se muestra y (`rivalPhases`) cuántas del rival (`theirsActs`). */
interface Paced {
  initial: MatState
  actions: readonly MatAction[]
  cursor: number
  theirs: number
}

/** Dos mesas del arranque con las mismas cartas en el mismo orden: deshacer y cancelar re-simulan la misma (la mesa no se vuelve a repartir). */
const sameStart = (a: MatState, b: MatState) => a.deck.join() === b.deck.join() && a.extra.join() === b.extra.join()

const drawIdOf = (code: number) => `card-${code}-1`

/** Cuánto se ve el cartel de cada fase del rival, y cada cuánto sale el siguiente: lo del cartel de la mesa (`fx-banner`). */
const RIVAL_PHASE_MS = 1100

/** Dónde va cada jugada en `order`: de cada una del rival, cuántas tuyas había antes (`at`); de cada tuya, cuántas del rival (`before`, con una más al final: todas). */
function placesIn(order: readonly Side[]): { at: number[]; before: number[] } {
  const at: number[] = []
  const before: number[] = []

  for (const side of order) {
    if (side === 'mine') before.push(at.length)
    else at.push(before.length)
  }
  before.push(at.length)
  return { at, before }
}

/** El pase del turno (`phase` con `skipDraw`): el de tu mesa abre el turno del rival; el del rival te lo devuelve («Tu turno»). */
const passes = (actions: readonly MatAction[]) => actions.reduce((count, action) => count + (action.type === 'phase' && action.skipDraw ? 1 : 0), 0)

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
  /**
   * «Jugar solo»: lo del rival (que el núcleo juega de una) se cuenta en el orden en que pasó, intercalado con tu mesa (`order`): su mesa, sus fases con su cartel (`notice`), sus
   * golpes, las vidas (`lp`) y el turno del marcador (`turn`, `turnMine`) van con la misma jugada, y tu mesa espera a «Tu turno».
   */
  rivalPhases?: boolean
}

export interface AutoAsks {
  /** Tu mesa como se ve ahora (con el ritmo) y la sesión de la mesa que la reproduce. */
  state: MatState
  matSession: MatSession
  /** La mesa terminó de contar la última tanda; `skipAhead` salta al final (tocar la mesa: la cadena no ataja toques). */
  settled: boolean
  /** El cartel de la fase del rival que se ve ahora (`rivalPhases`; `PracticeMat.duel.notice`). */
  notice: DuelMatLink['notice']
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
  /** El turno es tuyo, y su número: con `rivalPhases`, los de lo que la mesa muestra (el pase que todavía no contó no cuenta). */
  turnMine: boolean
  turn: number
  /** Las vidas que se ven (por asiento): con `rivalPhases`, las de lo que la mesa ya contó (`lifeSteps`); si no, las del núcleo. */
  lp: readonly [number, number]
  /** Hasta dónde de `order` muestra la mesa (con `rivalPhases`; si no, todo). */
  shownAt: number
  /**
   * El repaso (sólo «Jugar solo», desde el panel de pasos y combos): `load` repasa un combo guardado (con los controles del replay), `seek` va a un paso (en vivo, de tus jugadas)
   * y `back` vuelve al duelo donde estaba. Repasar no despacha ni le contesta nada al núcleo.
   */
  review: { active: boolean; load: (combo: SavedCombo) => void; seek: (step: number) => void; back: () => void }
  /** El visor del Cementerio, el Destierro o el Extra boca arriba del rival (`PracticeMat.rivalViewer`): va en el mismo lugar que el tuyo. */
  rivalViewer: ReactNode
  /** Las vidas que se ven esperan al golpe de un ataque, tuyo (`useStrikeHold`) o del rival (`useRivalStrike`): va en `LifeHold` alrededor de la mesa. */
  lifeHeld: boolean
  /** El duelo terminó y ya se puede decir: la mesa mostró todo y, si fue por vidas, la chapa contó hasta 0 y se vio el 0 (`useEndReveal`). */
  endShown: boolean
  /** El golpe que dejó a alguien en 0 (`side`, su asiento), en cámara lenta hasta el resultado (`LethalBlow`). */
  lethal: LethalHit | null
  /** Online: lo que el rival tiene que saber de tu mesa (`autoPhase`): tu fase como se ve, en el turno del núcleo, y si estás contestando algo que no es tu turno libre. Null rearmando. */
  told: PhaseView | null
}

export function useAutoAsks({ session, snap, cardsById, cards, seat = 0, canCancel, canUndo, waitingText, frozen = false, rivalName = t('duel.bar.rival'), rivalHand, onManual, rival, rivalPhases = false }: AutoAsksInput): AutoAsks {
  const prefs = useAutoPrefs()
  const desktop = useMediaQuery(DESKTOP_DECK_BUILDER_MEDIA_QUERY)
  const dock = useDockPeek()
  const [highlight, setHighlight] = useState<CardTextHighlight | null>(null)

  // ── El ritmo: las jugadas de una tanda se agregan de una vez y el cursor avanza de a una; al rearmarse la mesa se salta al final (un solo commit: se ajusta en el render).
  // Tu Draw y tu Standby Phase pasan solas (Gastón, 2026-11-04): la mesa las cuenta a su ritmo hasta la Main Phase 1 y frena sólo en una pregunta del núcleo. ──
  // Con `rivalPhases` lo del rival también se cuenta de a una, en su lugar de `order` (`theirs`: cuántas se muestran): la jugada que sigue es la tuya o la suya, y cada una espera a las
  // de antes, así cartel, mesa, vidas y marcador no se desfasan. Sin eso (el duelo por enlace), su espejo es el del núcleo.
  const steps = snap.chainSteps
  const { at: theirsAt, before: theirsBefore } = useMemo(() => placesIn(snap.order), [snap.order])
  /** Cuántas del rival van antes de tu jugada `cursor` (con todas contadas, todas). */
  const theirsUpTo = (cursor: number, actions: readonly MatAction[]) => (rivalPhases && cursor < actions.length ? (theirsBefore[cursor] ?? snap.theirsActs.length) : snap.theirsActs.length)
  /** De un mensaje de la cadena, cuántas del rival había (`seq` de `order`; sin él, todas las de antes de tu jugada siguiente). */
  const theirsOf = (step: ChainStep) => (step.seq === undefined ? (theirsBefore[Math.min(step.at, theirsBefore.length - 1)] ?? 0) : step.seq - step.at)
  /** Los mensajes de la cadena que ya pasaron con la mesa en `cursor` (y `theirs` del rival). */
  const stepsDue = (cursor: number, theirs: number) => {
    const count = stepsUpTo(steps, cursor)
    const later = rivalPhases ? steps.findIndex((item) => theirsOf(item) > theirs) : -1

    return later < 0 ? count : Math.min(count, later)
  }
  const [allowed, setAllowed] = useState<Allowed | null>(null)
  const [paced, setPaced] = useState<Paced>(() => {
    const cursor = snap.mineActions.length

    return { initial: snap.initial.mine, actions: snap.mineActions, cursor, theirs: theirsUpTo(cursor, snap.mineActions) }
  })
  const [seen, setSeen] = useState(snap.initial)
  // La cadena (la escena en grande, `ChainStage`): sus mensajes (`snap.chainSteps`) se muestran de a uno con su tiempo (`chainDwell`), cada uno cuando la mesa contó
  // hasta donde llegó, y la mesa no pasa del próximo hasta mostrarlo: primero los eslabones que se encadenan y después cada uno resolviéndose, con sus jugadas. Al rearmarse
  // o al tocar la mesa, lo que ya pasó se da por visto. `chainGone`: la cadena terminada que ya se escondió.
  const [chainSeen, setChainSeen] = useState(() => stepsDue(paced.cursor, paced.theirs))
  const [chainGone, setChainGone] = useState(() => chainFeed(snap.chainSteps, stepsDue(paced.cursor, paced.theirs))?.key ?? -1)
  const chainShownAt = useRef(0)
  /**
   * El repaso («Jugar solo»): un combo guardado (`name`), o tus jugadas hasta un paso, en la misma mesa y con la lista de siempre. El duelo vivo espera donde estaba: ni el ritmo, ni
   * tocar la mesa lo mueven y no se muestra ninguna pregunta; la cinta (`paced`) se sigue rehaciendo sólo del núcleo. El lado del rival queda vacío.
   */
  const [review, setReview] = useState<{ name?: string; session: MatSession } | null>(null)
  const reviewing = review !== null

  // Reiniciar es otro duelo: lo pedido vuelve a cero y el repaso se cierra.
  if (snap.status === 'loading' && allowed !== null) setAllowed(null)
  if (snap.status === 'loading' && reviewing) setReview(null)
  if (!snap.replaying) {
    if (seen !== snap.initial) {
      const initial = sameStart(paced.initial, snap.initial.mine) ? paced.initial : snap.initial.mine

      const cursor = snap.mineActions.length
      const theirs = theirsUpTo(cursor, snap.mineActions)
      const count = stepsDue(cursor, theirs)

      setSeen(snap.initial)
      setPaced({ initial, actions: snap.mineActions, cursor, theirs })
      setChainSeen(count)
      setChainGone(chainFeed(snap.chainSteps, count)?.key ?? -1)
    } else if (paced.actions !== snap.mineActions) {
      setPaced({ ...paced, actions: snap.mineActions })
    }
  }
  /** Lo del rival que se muestra: con `rivalPhases`, hasta su cursor; si no, todo. */
  const theirsShown = rivalPhases ? Math.min(paced.theirs, snap.theirsActs.length) : snap.theirsActs.length

  // Hasta dónde puede contar la mesa: el final.
  const limit = paced.actions.length

  // La mesa no pasa del próximo mensaje de la cadena que falta mostrar.
  const chainNext = steps[chainSeen]?.at ?? Infinity
  const chainStep = steps[chainSeen]
  /** El próximo mensaje de la cadena ya pasó en lo que muestra la mesa: nada sigue hasta mostrarlo. */
  const chainDue = chainStep !== undefined && chainStep.at <= paced.cursor && (!rivalPhases || theirsOf(chainStep) <= theirsShown)
  // El ataque del rival, cuando la mesa llega a él; lo tuyo que sigue (tu monstruo que cae) espera a su golpe. Con `rivalPhases`, cuando su cursor lo muestra (las vidas, las de
  // `lp`, sólo esperan al golpe).
  const attacks = useMemo(() => rivalAttacks(snap.order, snap.theirsActs), [snap.order, snap.theirsActs])
  const strikes = useMemo(() => (rivalPhases ? attacks.map((attack) => ({ ...attack, at: attack.index + 1 })) : attacks), [rivalPhases, attacks])
  const rivalStrike = useRivalStrike(strikes, snap.theirsActs.length, snap.initial, rivalPhases ? theirsShown : paced.cursor, rivalPhases ? theirsShown : limit, !reviewing && !snap.replaying)
  const { impactAt } = rivalStrike
  // El turno del rival (`rivalPhases`; Gastón, 2026-10-29: «no veo en pantalla el cartel del oponente pasando de fases»): el núcleo lo juega de una y la mesa lo cuenta jugada por
  // jugada en su lugar de `order`, con un solo cursor: cada fase con su cartel (`RIVAL_PHASE_MS`, la que te devuelve el turno dice «Tu turno»; su robo va con «Turno de Rival» y una
  // Main Phase 2 vacía, sin cartel ni espera), cada jugada con su vuelo (`FLIGHT_MS`; la primera de una fase, a mitad de su cartel) y lo que sigue a un ataque, después del golpe. Tu turno
  // (tu robo, tus fases, lo que podés hacer) empieza después de «Tu turno». Lo que ya había al empezar o al rearmarse el núcleo, y lo que se salta tocando la mesa, se da por visto.
  const [notice, setNotice] = useState<DuelMatLink['notice']>(undefined)
  const theirsNext = rivalPhases && theirsShown < snap.theirsActs.length && theirsShown < theirsUpTo(paced.cursor, paced.actions)
  // Tus fases que pasan solas (la SP, la M1) no salen encima de «Tu turno»: esperan a que se vaya (tu robo, no). Un booleano y no `notice`: que un cartel se vaya no reinicia el ritmo.
  const phaseUnderNotice = notice !== undefined && paced.actions[paced.cursor]?.type === 'phase'

  // Se va solo (con menos movimiento queda quieto ese rato); sólo el que se ve: el siguiente pudo salir en el mismo instante.
  useEffect(() => {
    if (!notice) return
    const timer = window.setTimeout(() => setNotice((current) => (current === notice ? undefined : current)), RIVAL_PHASE_MS)

    return () => window.clearTimeout(timer)
  }, [notice])

  useEffect(() => {
    if (reviewing) return
    if (theirsNext) {
      if (snap.replaying || chainDue) return
      const index = theirsShown
      const action = snap.theirsActs[index]!.action
      const at = theirsAt[index]! + index
      const before = at === 0 ? undefined : snap.order[at - 1] === 'theirs' ? snap.theirsActs[index - 1]?.action : paced.actions[theirsAt[index]! - 1]
      const banner = action.type === 'phase' && !(action.phase === 'main2' && snap.theirsActs[index + 1]?.action.type === 'phase')
      const wait = action.type === 'phase' ? (banner ? RIVAL_PHASE_MS : 0) : before?.type === 'phase' ? (action.type === 'draw' ? 0 : RIVAL_PHASE_MS / 2) : Math.max(FLIGHT_MS, impactAt - Date.now())
      const timer = window.setTimeout(() => {
        setPaced((current) => (current.theirs === index ? { ...current, theirs: index + 1 } : current))
        if (banner) setNotice({ key: Date.now(), phase: action.phase, ...(action.skipDraw ? { label: t('duel.bar.yourTurn') } : { who: rivalName }) })
      }, wait)

      return () => window.clearTimeout(timer)
    }
    if (paced.cursor >= Math.min(limit, chainNext)) return
    if (phaseUnderNotice) return
    const timer = window.setTimeout(() => setPaced((current) => (current.cursor < current.actions.length ? { ...current, cursor: current.cursor + 1 } : current)), Math.max(STEP_MS, impactAt - Date.now()))

    return () => window.clearTimeout(timer)
  }, [paced, limit, reviewing, chainNext, chainDue, impactAt, theirsNext, theirsShown, theirsAt, snap.theirsActs, snap.order, snap.replaying, rivalName, phaseUnderNotice])
  // El próximo mensaje de la cadena, cuando la mesa llegó hasta él y el anterior se vio su rato (contado desde que se mostró: una tanda nueva no lo reinicia).
  useEffect(() => {
    if (reviewing || snap.replaying || !chainDue) return
    const wait = Math.max(0, chainDwell(steps, chainSeen - 1) - (Date.now() - chainShownAt.current))
    const timer = window.setTimeout(() => {
      // Los que no se dejan ver solos (uno resuelto, el final) se muestran junto con el siguiente.
      const due = stepsDue(paced.cursor, theirsShown)
      let next = chainSeen + 1

      while (next < due && chainDwell(steps, next - 1) === 0) next += 1
      chainShownAt.current = Date.now()
      setChainSeen(next)
    }, wait)

    return () => window.clearTimeout(timer)
    // eslint-disable-next-line react-hooks/exhaustive-deps -- `stepsDue` lee `steps` y `order`, que ya están
  }, [steps, chainSeen, chainDue, paced.cursor, theirsShown, reviewing, snap.replaying])

  // Tocar la mesa salta hasta el final; repasando, no. Lo del rival, también (sin carteles en ráfaga).
  const skipAhead = useCallback(() => {
    if (reviewing) return
    const to = paced.actions.length
    const theirs = rivalPhases ? Math.max(paced.theirs, theirsUpTo(to, paced.actions)) : paced.theirs

    setPaced((current) => (to > current.cursor || theirs > current.theirs ? { ...current, cursor: Math.max(to, current.cursor), theirs: Math.max(theirs, current.theirs) } : current))
    // La cadena, hasta ahí también.
    setChainSeen((count) => Math.max(count, stepsDue(to, theirs)))
    // eslint-disable-next-line react-hooks/exhaustive-deps -- `theirsUpTo` y `stepsDue` leen `order` y `steps`
  }, [reviewing, steps, paced, theirsBefore, rivalPhases])
  const settled = paced.cursor === paced.actions.length && theirsShown === snap.theirsActs.length && chainSeen >= steps.length && !snap.replaying
  // Las vidas (y el golpe letal) esperan también a la cadena: mientras falte mostrar un paso suyo, la escena puede estar a la vista (o yéndose): bajan después.
  const chainHolding = !reviewing && !snap.replaying && chainSeen < steps.length
  const lifeHeld = useStrikeHold(paced.actions, paced.cursor, limit, !reviewing && !snap.replaying) || rivalStrike.held || chainHolding
  // Lo que se ve del rival, las vidas y el turno, hasta donde contó la mesa (`rivalPhases`): su espejo de a una (como un replay), las vidas de `lifeSteps` y el turno sin los pases que
  // falta mostrar. Al día, los del núcleo (los mismos objetos: nada se vuelve a dibujar).
  const shownAt = paced.cursor + theirsShown
  const caughtUp = !rivalPhases || shownAt >= snap.order.length
  const theirsState = useMemo(
    () => (theirsShown < snap.theirsActs.length ? replayMat(snap.initial.theirs, snap.theirsActs.slice(0, theirsShown).map((wire) => wire.action)) : snap.theirs),
    [theirsShown, snap.theirsActs, snap.initial.theirs, snap.theirs],
  )
  const lp = caughtUp ? snap.overlay.lp : (snap.lifeSteps.findLast((item) => item.at <= shownAt)?.lp ?? snap.overlay.lp)
  const unshownPasses = caughtUp ? 0 : passes(paced.actions.slice(paced.cursor)) + passes(snap.theirsActs.slice(theirsShown).map((wire) => wire.action))
  const turnNumber = snap.overlay.turn - unshownPasses
  const turnMine = snap.overlay.turnPlayer === seat !== (unshownPasses % 2 === 1)
  // Lo que se ve, como en la práctica: la mano de apertura plegada en la mesa del arranque (`foldOpeningHand`), así el paso 0 es «Mano inicial». Se pliega por contenido:
  // deshacer re-simula y la jugada vuelve como otro objeto con las mismas cartas (la mano no se reparte de nuevo).
  const first = paced.actions[0]
  const openingKey = first?.type === 'draw' ? `${first.count}:${first.ids?.join() ?? ''}` : ''
  // eslint-disable-next-line react-hooks/exhaustive-deps -- por contenido (`openingKey`), no por objeto
  const opening = useMemo(() => foldOpeningHand(paced.initial, first ? [first] : []), [paced.initial, openingKey])
  // Las jugadas, hasta la que ya se contó: lo que el núcleo decidió y la mesa todavía no muestra (el ritmo) no se adelanta en la lista de pasos.
  const played = useMemo(() => paced.actions.slice(opening.skip, Math.max(opening.skip, paced.cursor)), [paced.actions, paced.cursor, opening.skip])
  const replayed = useMemo(() => replayMat(opening.initial, played, played.length), [opening.initial, played])
  // Los materiales que una Invocación Xyz ya juntó debajo de la carta del Extra (`held`, mientras el núcleo pregunta zona y posición): se ven al final de la cinta, sin ser un paso.
  const extraHeld = paced.cursor === paced.actions.length ? snap.mine.held : undefined
  const state = useMemo(() => (extraHeld ? Object.entries(extraHeld).flatMap(([to, ids]) => ids.map((id): MatAction => ({ type: 'attach', id, to, held: true }))).reduce(matReducer, replayed) : replayed), [extraHeld, replayed])
  /** Pedir pasar a una fase: las ventanas de las que deja se pasan solas (`passing`). */
  const allow = useCallback((to: MatPhase) => setAllowed(allowTo(allowed, state.turn, to)), [allowed, state.turn])
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
  // El fin se dice (el sonido y, en cada pantalla, el resultado) recién cuando la mesa lo mostró todo: el golpe letal en cámara lenta, la chapa del que perdió hasta 0 y una pausa (`useEndReveal`).
  const reveal = useEndReveal(snap.status === 'ended' && snap.overlay.end !== null && settled && !lifeHeld, useHeldValue(lp, lifeHeld))
  const endShown = reveal.shown

  useEffect(() => {
    const end = endShown ? snap.overlay.end : null

    if (end) playSfx(end.winner === 2 ? 'turn' : end.winner === seat ? 'win' : 'lose')
  }, [endShown, snap.overlay.end, seat])

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
  // La carta sin imagen, sobre el color de su tipo: el de tu carta (o de una igual a las tuyas) o, del rival, su tipo del `.cdb` si llegó (`cards`).
  const pickCardOf = (card: AskCard, key: string): PickCard => {
    const from = card.place === 'pile' ? card.pile : card.place === 'none' ? undefined : card.place
    const code = card.ref ? codeOf(card.ref) || card.code : card.code
    const api = (card.ref?.side === 'mine' ? cardsById.get(card.ref.id)?.apiCard : undefined) ?? byCode.get(code)?.apiCard
    const frame = api ? frameKindOf(api.frameType, api.cardType) : frameOfType(cards?.get(code)?.type ?? 0)

    return { key, name: nameOf(card.ref, card.code), art: artOf(card.ref, card.code), ...(frame.kind === 'neutral' ? {} : { frame }), ...(from && card.ref ? pickPlace(from, card.ref.side === 'theirs') : {}) }
  }

  // ── La pregunta pendiente: se abre con la mesa del núcleo (`session.adapter`) en el mismo render en que llega (un rearme con pregunta es un solo commit); lo que se contesta solo, se
  // contesta en un efecto; lo demás espera a que la mesa termine de contar. ──
  const pending = snap.ask
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
  /** Tu monstruo que declaraste para atacar (`select_battlecmd`, «Atacar»): el núcleo pregunta después a quién sin decir quién ataca, y la mesa le pone el aro rojo mientras elegís. */
  const [attacker, setAttacker] = useState<string | null>(null)

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

          if (current.ask.type === 'select_battlecmd' && next.answer.type === 'select_battlecmd' && next.answer.action === 1) {
            const card = next.answer.index === null ? undefined : current.ask.attacks[next.answer.index]

            setAttacker(card ? (session.adapter?.idAt(card) ?? null) : null)
          }
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
  // La carta que una pregunta nombra por su código (la que va a la casilla, la de la posición), sólo si se la conoce: si no, el título genérico.
  const knownName = (code: number | undefined) => (code ? (byCode.get(code)?.name ?? snap.names[code] ?? cards?.get(code)?.name ?? null) : null)
  const zoneLabel = shown?.zonePick ? zoneTitle(shown) : ''
  // Una lista aparte (de varios lugares, por código, lo del rival): hasta `BAND_MAX` cartas, una banda en el medio de la mesa (`PickBand`); con más, la hoja (`CardPicker`).
  const list = pick && decision.listed ? pick : null
  // De qué carta es lo que se pregunta y si es su costo, su activación o su efecto (`ask-why.ts`: sólo lo que se sabe), para la línea `AskWhy` de cada cartel. Por valor: la mesa no se vuelve a dibujar por él.
  const asked = shown ? askWhy(shown.type, snap.overlay, shown.cardPick?.cards ?? shown.counters?.cards) : null
  const askedName = asked ? nameOf(asked.ref, asked.code) : ''
  const askedLink = asked && snap.overlay.chain.length > 1 ? asked.link : 0
  const askedKey = asked ? `${asked.role}|${asked.code}|${asked.ref?.side ?? ''}|${asked.ref?.id ?? ''}|${askedLink}|${askedName}` : ''
  // eslint-disable-next-line react-hooks/exhaustive-deps -- por valor (`askedKey`)
  const why = useMemo<AskWhyView | null>(() => (asked ? { text: askWhyText(asked.role, askedName), name: askedName, art: artOf(asked.ref, asked.code), ...(askedLink ? { link: askedLink } : {}), ...(asked.ref ? { mine: asked.ref.side === 'mine' } : {}) } : null), [askedKey])
  const band = list !== null && decision.listed!.band
  const myStats = snap.overlay.stats.mine
  // La etiqueta de ATK/DEF de siempre de cada lado (`fieldStatsOf`), estable por valor: un mapa nuevo con los mismos números sería un dibujo de la mesa de más. Los de ahora llegan con
  // la tanda, antes de que la mesa la cuente: mientras la cuenta, tu monstruo que ya estaba sigue con los suyos (no cambia antes del paso que lo cambia) y se ponen al día al terminar.
  // Repasando, nada: la mesa es otra.
  const [shownStats, setShownStats] = useState(() => ({ mine: NO_FIELD_STATS, theirs: NO_FIELD_STATS }))
  // La carta del catálogo de cada monstruo, para su Nivel, Rango o LINK (`nowStat`): las tuyas por su copia; las del rival, si tenés la misma carta (si no, va sin ficha).
  const myCard = useCallback((id: string) => cardsById.get(id)?.apiCard, [cardsById])
  const theirCard = useCallback((id: string) => byCode.get(codeOf({ side: 'theirs', id }))?.apiCard, [byCode, codeOf])
  const fieldStats = {
    mine: reviewing ? NO_FIELD_STATS : fieldStatsOf(state, (id) => (!settled && shownStats.mine.get(id)) || nowStat(myStats[id], myCard(id)), shownStats.mine),
    theirs: reviewing ? NO_FIELD_STATS : fieldStatsOf(theirsState, (id) => nowStat(snap.overlay.stats.theirs[id], theirCard(id)), shownStats.theirs),
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
      stats: pickStatsOf(state, ids([...pick.eligible, ...pick.chosen]), myStats, myCard),
    }
  }, [pick, list, pickLabel, shown, gesture, state, myStats, myCard])
  // La casilla de una jugada que todavía no entró a la cadena (activar o invocar desde tu mano): `select_place` no trae `can_cancel`, así que «Cancelar» vuelve a antes de la jugada con el mismo
  // `undo` de la barra. Con un efecto resolviéndose (un eslabón `solving`) no: esa casilla es de una resolución, no de una jugada tuya.
  const placeBack = canUndo && shown?.type === 'select_place' && !reviewing && !snap.overlay.chain.some((link) => link.state === 'solving') && snap.answers.some((item) => item.seat === seat && undoPoint(item))
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
      phaseItems: (shown?.phaseItems ?? []).map(menuItem),
      endTurn: shown?.endTurn ? () => gesture({ kind: 'item', answer: shown.endTurn! }) : null,
      // Las casillas tuyas, en tu mesa (las del rival, en su campo: `rivalZones`). Una Zona Extra del rival es, vista desde acá, la tuya de enfrente (`1 - index`): se toca ahí.
      // Si todas son del rival (dar el control: Shien's Spy, Creature Swap), el texto lo dice: si no, parece trabado a quien no mira su campo.
      zonePick: shown?.zonePick
        ? {
            label: zoneLabel,
            targets: [...ownZones, ...rivalEmz.map(({ index }) => ({ zone: 'emz' as const, index: 1 - index }))],
            onPick: (zone, index) => gesture(zone === 'emz' && !ownZones.some((own) => own.zone === 'emz' && own.index === index) ? { kind: 'zone', side: 'theirs', zone, index: 1 - index } : { kind: 'zone', side: 'mine', zone, index }),
          }
        : null,
      cardPick,
      why,
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
      cancel: placeBack ? () => void session.undo() : shown?.cancelable && ((shown.type === 'select_chain' && !shown.phaseWindow) || cardPick || band) ? () => gesture({ kind: 'cancel' }) : null,
      // La carta soltada es del duelo vivo: repasando, no se dibuja sobre la mesa del repaso.
      dropped: reviewing ? null : held,
      holdFor: (id) => {
        // Como en la mesa manual, sólo donde se deshace: en el duelo por enlace un toque largo sin querer sería una jugada.
        const item = canUndo && shown?.type === 'select_idlecmd' ? shown.items.get(id)?.find((entry) => entry.answer?.type === 'select_idlecmd' && entry.answer.action === 2) : undefined

        return item?.answer ? () => gesture({ kind: 'item', answer: item.answer! }) : null
      },
      // Repasando o con el duelo terminado, el menú vacío dice lo de siempre.
      // Las restricciones activas van aparte y después: rigen, pero no tienen por qué ser la causa (una de «salvo Sincronía» no frena a una Trampa sin zona libre).
      whyNot: reviewing || frozen || ended
        ? null
        : (id) => {
            const known = [...(vanilla.has(codeOf({ side: 'mine', id })) ? [t('auto.why.noRules')] : []), ...turnReasons({ state, id, kind: cardKindOf(cardsById.get(id)?.apiCard ?? null), turnMine, ask: shown?.type ?? null, normal: myNormal })]

            return [...(known.length > 0 ? known : [t('auto.why.unknown')]), ...(limitTexts.length > 0 ? [t('auto.why.limits'), ...limitTexts] : [])]
          },
      manual: onManual ?? null,
    }
  }, [pick, list, band, shown, menuItem, gesture, state, held, reviewing, frozen, ended, myInitial, myNormal, cardsById, turnMine, limitTexts, canUndo, onManual, cardPick, why, fieldStats.mine, vanilla, codeOf, placeBack, session, zoneLabel])
  const respond = useMemo(() => new Set(shown?.respond.flatMap((ref) => (ref.side === 'mine' ? [ref.id] : [])) ?? []), [shown])
  const attack = useMemo(() => new Set(shown?.attack.flatMap((ref) => (ref.side === 'mine' ? [ref.id] : [])) ?? []), [shown])
  const feed = useMemo(() => (snap.replaying ? null : chainFeed(steps, chainSeen)), [steps, chainSeen, snap.replaying])
  // Lo que se activa o se resuelve, de los dos lados, al ritmo del aviso de la cadena (repasando, nada).
  const acting = useMemo(() => actingOf(reviewing ? null : feed), [feed, reviewing])
  // Los medallones de la cadena, donde se activó cada eslabón: los pendientes, y se van del último al primero (`linksOf`).
  // Terminado el duelo y contada la cadena hasta el final, nada de ella (ni escena ni medallones) bajo el cartel del final.
  const chainLive = feed && !reviewing && !(ended && settled) && !(feed.done && chainGone === feed.key) ? feed : null
  const links = useMemo(() => linksOf(chainLive), [chainLive])
  // Los medallones, sólo al resolver y donde se activó cada eslabón (`medalsOf`).
  const medals = useMemo(() => medalsOf(chainLive), [chainLive])

  // ── El rival: su espejo, dibujado por lo que el núcleo dejó ver (`codeOf`). ──
  const theirs = theirsState
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
      if (desktop) lockDock(peek)
      else if ('drawId' in peek) setRivalCard({ drawId: peek.drawId, rect })
    },
    [desktop, lockDock],
  )
  // Las cartas del rival que la pregunta deja elegir (a qué atacar, el objetivo de un efecto) o activar (una obligatoria de su campo): laten y se tocan; las elegidas llevan la mira.
  const rivalPlays = shown?.theirs
  const rivalPicks = useMemo(() => {
    const refs = (indices: readonly number[]) => indices.flatMap((i) => (pick!.cards[i]!.ref?.side === 'theirs' ? [pick!.cards[i]!.ref!.id] : []))

    return pick
      ? { eligible: new Set(refs(pick.eligible)), chosen: refs(pick.chosen), stats: pickStatsOf(theirs, refs([...pick.eligible, ...pick.chosen]), snap.overlay.stats.theirs, theirCard) }
      : rivalPlays?.size
        ? { eligible: new Set(rivalPlays.keys()), chosen: [], stats: null }
        : null
  }, [pick, rivalPlays, theirs, snap.overlay.stats, theirCard])
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
      medals: medals.theirs,
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
    [theirs, artOf, gesture, rivalPicks, rivalZones, rivalPlays, showRival, rivalPeekOf, acting, links, medals, fieldStats.theirs],
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
  // Su mano boca arriba (`rivalHand`, la de ahora) mientras la mesa cuenta su turno: la de lo que se muestra, carta por carta (la que sigue en su mano, por su lugar; la que ya
  // jugó, por cómo estaba la última vez que la mesa estuvo al día; la robada y jugada en el medio, por lo que mostró).
  const [openHand, setOpenHand] = useState<{ ids: readonly string[]; codes: readonly number[] }>({ ids: [], codes: [] })
  const handKnown = rivalHand !== undefined && snap.theirs.hand.length === rivalHand.length

  if (handKnown && theirs === snap.theirs && (openHand.ids !== snap.theirs.hand || openHand.codes !== rivalHand)) setOpenHand({ ids: snap.theirs.hand, codes: rivalHand })
  const shownHand = useMemo(() => {
    if (!rivalHand || theirs === snap.theirs || !handKnown) return rivalHand
    const codeIn = (ids: readonly string[], codes: readonly number[], id: string) => (ids.includes(id) ? codes[ids.indexOf(id)] : undefined)

    return theirs.hand.map((id) => codeIn(snap.theirs.hand, rivalHand, id) ?? codeIn(openHand.ids, openHand.codes, id) ?? codeOf({ side: 'theirs', id }))
  }, [rivalHand, theirs, snap.theirs, handKnown, openHand, codeOf])
  // Con su mano de dorso, lo que es de conocimiento público (`publicInHand`: se mostró o vino de una zona a la vista; barajar su mano lo borra) va boca arriba. El adaptador sabe lo de ahora y la
  // mesa va un poco atrás: una carta mostrada se da vuelta al llegar el núcleo a ese punto.
  const publicHand = useMemo(() => {
    if (shownHand) return null
    const codes = theirs.hand.map((id) => session.adapter?.publicInHand({ side: 'theirs', id }) ?? 0)

    return codes.some(Boolean) ? codes : null
    // eslint-disable-next-line react-hooks/exhaustive-deps -- el adaptador cambia en el lugar: `snap` es lo que avisa que llegó algo
  }, [shownHand, theirs.hand, session, snap])
  const rivalHandNode = useMemo(() => {
    const open = shownHand ?? publicHand

    return (
      <TheirHand
        count={rivalHandCount}
        medals={medals.theirs.get('hand') ?? null}
        {...(open
          ? {
              cards: open.map((code) => (code !== 0 || shownHand ? { name: nameOf(null, code), art: artOf(null, code), ...(shownHand ? {} : { public: true }) } : null)),
              onCard: (index: number, rect: DOMRect) => showRival({ drawId: drawIdOf(open[index]!) }, rect),
              onCardHover: (index: number) => hoverDock({ drawId: drawIdOf(open[index]!) }),
            }
          : {})}
      />
    )
  }, [rivalHandCount, medals.theirs, shownHand, publicHand, nameOf, artOf, showRival, hoverDock])
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
  // La escena de la cadena: la última que empezó, como se ve con lo que ya se mostró (`feed`, más arriba). Terminada, se va a los `CHAIN_LINGER_MS` (lo que tarda en irse la
  // última carta).
  useEffect(() => {
    if (!feed?.done) return
    const timer = window.setTimeout(() => setChainGone(feed.key), CHAIN_LINGER_MS)

    return () => window.clearTimeout(timer)
  }, [feed])
  // La cadena que se puede pasar, en la banda de responder: a qué eslabón y con qué cartas (con su lugar). Con una sola de un solo efecto, ya viene elegida; una con varios efectos
  // abre su lista (como su menú en la mesa).
  const offer = shown && lane === null ? respondOffer(shown, chain) : null
  // La elegida es de esta pregunta (`askState`, no su número: al reiniciar el duelo los números vuelven a empezar).
  const [offerPick, setOfferPick] = useState<{ of: AskState; key: string } | null>(null)
  // Las candidatas de la banda de responder (`RespondBand`). En el celular la banda va en la hoja de abajo y, con la cadena abierta, en el pie de su hoja (`SheetHost`): una sola hoja.
  const respondCards =
    offer?.candidates.map(({ ref, key, at }): PickCard => {
      // El lugar con su ícono (la mano, el Cementerio, el campo…): en las columnas angostas del celular, sólo el ícono, y el nombre accesible lo dice entero.
      const from: PickFrom | null = at === null ? null : at === 'mz' || at === 'emz' || at === 'st' ? 'field' : at

      return { key, name: nameOf(ref), art: artOf(ref), ...(from ? pickPlace(from, ref.side === 'theirs') : {}) }
    }) ?? []
  // Una sola opción (una carta, o un solo grupo de copias «×4») viene elegida de entrada: la primera copia que se puede activar.
  const respondGroups = copyGroups(respondCards)
  const only = respondGroups.length === 1 ? (offer?.candidates.find((candidate) => candidate.answer && respondGroups[0]!.some((card) => card.key === candidate.key)) ?? null) : null
  const offered = offer?.candidates.find((candidate) => offerPick !== null && offerPick.of === askState && candidate.key === offerPick.key) ?? only
  const pickOffer = (key: string) => {
    const candidate = offer?.candidates.find((item) => item.key === key)

    if (!candidate || !askState) return
    if (candidate.answer) setOfferPick({ of: askState, key })
    else setSub({ label: t('practice.menu.activateEffect'), children: candidate.items.flatMap((item) => item.children ?? [item]) })
  }

  const chainShown = feed !== null && !reviewing && !(ended && settled) && !(feed.done && chainGone === feed.key)
  // Nada grande tapa el campo cuando hay que jugar (Gastón: «si ya estoy resolviendo el efecto de esa carta la misma no debería seguir en el medio de la pantalla»): resolviendo, la
  // escena no está (quedan los medallones, `links`); armando, mientras el núcleo te pregunta algo que no es responder (elegir casilla o cartas, sí o no…), se corre y vuelve después.
  const chainAway = shown !== null && shown.type !== 'select_chain'
  /** Los datos de tu carta (o de una igual a las tuyas) por eslabón: el marco y el texto. */
  const linkApi = useCallback((row: ChainRow) => (row.card?.side === 'mine' ? cardsById.get(row.card.id)?.apiCard : undefined) ?? byCode.get(row.code)?.apiCard ?? null, [cardsById, byCode])
  // El marco de las cartas de la cadena que no son tuyas (sólo se sabe su código): el tipo del `.cdb` si llegó (`cards`, el duelo por enlace) o, si no, se pide a YGOPRODeck una vez.
  const [linkFrames, setLinkFrames] = useState<ReadonlyMap<number, CardFrame>>(() => new Map())
  const framesDue = [...new Set((feed?.rows ?? []).filter((row) => row.code && !linkApi(row) && !cards?.get(row.code)?.type && !linkFrames.has(row.code)).map((row) => row.code))].join()

  useEffect(() => {
    if (!framesDue) return
    let alive = true

    fetchCardsByIds(framesDue.split(',').map(Number))
      .then((found) => alive && setLinkFrames((now) => new Map([...now, ...found.map((card): [number, CardFrame] => [card.ygoprodeckId, frameKindOf(card.frameType, card.cardType)])])))
      .catch(() => {})

    return () => {
      alive = false
    }
  }, [framesDue])
  const chainRows = useMemo(
    () =>
      feed?.rows.map((row) => {
        const api = linkApi(row)

        return {
          number: row.number,
          mine: row.mine,
          name: row.code ? nameOf(null, row.code) : nameOf(row.card),
          art: artOf(row.card, row.code),
          frame: api ? frameKindOf(api.frameType, api.cardType) : (linkFrames.get(row.code) ?? frameOfType(cards?.get(row.code)?.type ?? 0)),
          state: row.state,
          ...(row.by ? { by: row.by } : {}),
          ...(row.outcome ? { outcome: outcomeLabel(row.outcome) } : {}),
        }
      }) ?? [],
    [feed, nameOf, artOf, linkApi, cards, linkFrames],
  )
  // Una cadena nueva es otra (sus números vuelven a empezar): sus cartas no se animan contra las de la anterior.
  // Con «¿Respondés?» abierto (la hoja o la ventana), la escena se achica hacia arriba: el número de la última carta no queda debajo del cartel.
  const answering = shown?.type === 'select_chain' && !shown.phaseWindow
  const chainNotice = useMemo(() => (chainShown && feed ? <ChainStage key={feed.key} rows={chainRows} current={feed.current} done={feed.done} away={chainAway} answering={answering} /> : null), [chainShown, feed, chainRows, chainAway, answering])
  // En escritorio el detalle de la izquierda muestra el eslabón del que habla la escena (el que se resuelve o, armando, el último), con la frase de su efecto resaltada cuando no
  // hay duda de cuál es (`linkPhrase`).
  const linkRow = desktop && chainShown && feed ? (feed.rows[feed.current >= 0 ? feed.current : feed.rows.length - 1] ?? null) : null
  const linkCard = linkRow ? linkApi(linkRow) : null
  const linkRivalCard = useRivalCard(linkRow && !linkCard && linkRow.code ? drawIdOf(linkRow.code) : undefined)

  useEffect(() => {
    if (linkRow) hoverDock(linkCard ? { name: nameOf(linkRow.card, linkRow.code), card: linkCard } : linkRow.code ? { drawId: drawIdOf(linkRow.code) } : { faceDown: true })
  }, [linkRow, linkCard, hoverDock, nameOf])
  const linkText = linkCard ?? linkRivalCard
  const linkHighlight = useMemo<CardTextHighlight | null>(() => {
    const range = linkRow && linkText?.description ? linkPhrase(linkText.description, linkRow.code, linkRow.description) : null

    return range && linkText ? { ygoprodeckId: linkText.ygoprodeckId, ...range } : null
  }, [linkRow, linkText])
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
  const effectAsk = prompt && promptCard ? effectAskText(prompt, snap.overlay.cause, nameOf(promptCard.ref, promptCard.code)) : null
  const options = shown?.options
  // Una opción sin texto no inventa un número (el orden de la pregunta no es el de la carta): dice «Activar efecto». La carta que pregunta (la que nombran sus opciones, si
  // se la conoce) va arriba del título.
  const optionLabel = (option: { value: number; label?: string }) =>
    option.label ?? (options?.of === 'race' ? (RACES[option.value] ?? String(option.value)) : options?.of === 'attribute' ? (ATTRIBUTES[option.value] ?? String(option.value)) : t('practice.menu.activateEffect'))
  const askingCode = options?.options.map((option) => (option.description ? splitDesc(option.description).code : 0)).find((code) => Boolean(snap.names[code] ?? cards?.get(code)?.name))
  const optionsTitle = options ? optionsTitleOf(options, shown?.title, knownName(options.card)) : ''
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

  // El ataque, a la vista mientras se decide: tu monstruo que ataca lleva el aro rojo mientras elegís a quién, y el ataque del rival deja su estela mientras le podés responder (se va con el daño).
  const aim = shown?.cardPick && shown.title === ATTACK_TARGET_HINT ? attacker : null
  const rivalAim = useMemo(() => (shown ? rivalAttackInCourse(attacks, snap.order, snap.mineActions, snap.theirsActs, snap.lifeSteps) : null), [shown, attacks, snap.order, snap.mineActions, snap.theirsActs, snap.lifeSteps])

  const dockHighlight = highlight ?? linkHighlight
  const detail = useMemo(() => (desktop ? <DuelCardDock peek={peeked} highlight={dockHighlight} stats={reviewing ? null : dockStats} /> : undefined), [desktop, peeked, dockHighlight, reviewing, dockStats])
  const limits = useMemo(() => (reviewing ? null : <LimitsChip texts={limitTexts} />), [reviewing, limitTexts])
  const mat: AutoAsks['mat'] = {
    undoPlay,
    ...(announcement ? { announcement } : {}),
    areas: DUEL_AREAS,
    opponent: opponentCells,
    sharedZone,
    rivalHand: rivalHandNode,
    attackTargets,
    foreignKnown,
    // La fase de quien tiene el turno (como en el duelo manual): la tuya, en tu mesa; la del rival, la que él ve (`rival`) o, si no la avisa, la del espejo de la suya.
    phase: turnMine ? state.phase : (rival?.phase ?? theirs.phase),
    // Cambiás de fase en tus jugadas del turno y en la ventana de una fase tuya.
    myTurn: shown?.type === 'select_idlecmd' || shown?.type === 'select_battlecmd' || !!shown?.phaseWindow,
    respond,
    attack,
    ...(aim ? { aim } : {}),
    ...(rivalAim ? { rivalAim } : {}),
    act: acting.mine,
    links: links.mine,
    medals: medals.mine,
    prompt: prompt ? (
      <AskPrompt
        key={askId ?? 0}
        // Un sí o no a secas dice su pregunta (el texto de su `desc`) cuando la tiene; el de un efecto, «¿Activás el efecto?» con qué pasó y su lugar (`effectAsk`): la carta, por su arte.
        text={effectAsk?.text ?? yesNoText(effectLabel(0, prompt.description), prompt.description, knownName(splitDesc(prompt.description).code))}
        {...(promptCard ? { card: { name: nameOf(promptCard.ref, promptCard.code), art: artOf(promptCard.ref, promptCard.code) } } : {})}
        // Tocar la carta la abre en grande (como la de la ficha); en escritorio ya está en el detalle de la izquierda.
        {...(promptCard?.code && !desktop ? { onInspect: () => setRivalCard({ drawId: drawIdOf(promptCard.code), rect: new DOMRect(window.innerWidth / 2, window.innerHeight / 2, 0, 0) }) } : {})}
        {...(effectAsk?.kicker ? { kicker: effectAsk.kicker } : {})}
        {...(effectAsk?.place ? { place: effectAsk.place } : {})}
        why={why}
        {...(promptCard && onManual ? { manual: { label: t('auto.bar.manual'), onSelect: onManual } } : {})}
        yes={{ label: promptCard ? t('practice.menu.activateEffect') : t('auto.ask.yes'), onSelect: () => gesture({ kind: 'item', answer: prompt.yes }) }}
        no={{ label: promptCard ? t('auto.ask.skipEffect') : t('auto.ask.no'), onSelect: () => gesture({ kind: 'item', answer: prompt.no }) }}
      />
    ) : offer ? (
      <RespondBand
        key={askId ?? 0}
        // A qué eslabón respondés (su número, su dueño, su carta y su estado) ya lo dice la pila de la cadena, arriba y desplegada: la banda dice sólo qué se decide.
        title={respondTitle(offer, offer.to ? nameOf(offer.to.link.card, offer.to.link.code) : '')}
        {...(offer.to ? { about: nameOf(offer.to.link.card, offer.to.link.code) } : {})}
        link={offer.link}
        cards={respondCards}
        chosen={offered?.key ?? null}
        onToggle={pickOffer}
        onChain={() => {
          if (offered?.answer) gesture({ kind: 'item', answer: offered.answer })
        }}
        onPass={() => gesture({ kind: 'cancel' })}
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
        action={forced.length > 1 ? t('auto.respond.start') : forcedFirst.item.label}
        {...(forced.length > 1 ? { note: t('auto.forced.hint') } : {})}
      />
    ) : band && listProps ? (
      // `select_unselect_card` va de a una (cada toque contesta y el núcleo vuelve a preguntar: la misma banda, por `decision`).
      <PickBand
        key={decision.of ?? 0}
        title={pickLabel}
        why={why}
        {...(bandPlace ? { place: t('auto.band.from', { place: bandPlace, count: listCards.length }) } : {})}
        cards={bandCards}
        multi={list.type !== 'select_unselect_card' && list.max > 1}
        onPick={() => gesture({ kind: 'done' })}
        {...listProps}
      />
    ) : undefined,
    rivalFlights,
    ...(chainNotice ? { chain: chainNotice } : {}),
    turnNumber,
    rivalEmz: rivalEmzTaken,
    // El ATK/DEF de ahora es del duelo vivo: repasando, el detalle muestra la carta impresa.
    ...(desktop ? { detail } : {}),
    onPeek: dock.lock,
    onHover: dock.hover,
    onRivalHover,
    rivalViewing: rivalPile !== null,
    onActivity,
    onHighlight: setHighlight,
    auto,
    limits,
    menus: AUTO_MENUS,
    // Un cartel de abajo con una pregunta (el de `prompt` o uno de `pieces`): en el celular la ficha y el visor de una pila le ceden el lugar.
    asking: Boolean(prompt || offer || (forced && forcedFirst && lane === null) || list || options || sub?.children || shown?.sort || shown?.counters),
  }

  const pieces = (
    <>
      <Presence>
        {options ? (
          <AskOptions
            key={`options-${askId}`}
            title={optionsTitle}
            {...(askingCode ? { kicker: nameOf(null, askingCode) } : {})}
            why={why}
            options={options.options.map((option): AskOption => ({ id: String(option.value), label: optionLabel(option) }))}
            mode={options.count > 1 || options.of === 'race' || options.of === 'attribute' ? { count: options.count } : 'one'}
            of={options.of}
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
            why={why}
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
            why={why}
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
            why={why}
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
          if (!desktop) showRival(rivalPeekOf(id), rect)
        }}
        onPeek={(id) => lockDock(rivalPeekOf(id))}
        onHover={(id) => hoverDock(rivalPeekOf(id))}
        onClose={() => setRivalPile(null)}
      />
    ),
    [rivalPile, rivalViewerHidden, theirs, rivalPeekOf, nameOf, artOf, rivalTargeted, rivalActing, desktop, showRival, lockDock, hoverDock],
  )
  return {
    rivalViewer,
    lifeHeld: lifeHeld || reveal.holding,
    endShown,
    lethal: reveal.lethal,
    state: reviewState ?? state,
    matSession: review?.session ?? matSession,
    settled,
    notice: reviewing ? undefined : notice,
    skipAhead,
    lane,
    mat: reviewState ? reviewMat(mat, reviewState.phase) : mat,
    pieces,
    nameOf,
    artOf,
    undoable: !reviewing && snap.answers.some((item) => item.seat === seat && undoPoint(item)),
    // Lo que se repasa es tuyo.
    turnMine: reviewing || turnMine,
    turn: turnNumber,
    lp,
    shownAt,
    review: { active: reviewing, load, seek, back },
    // Tu turno libre (tus jugadas o la ventana de una fase tuya) no es «estar eligiendo».
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
/** La ficha de una carta y las fases del automático (`AutoPanel`): la mesa las dibuja en lugar de las de la manual. */
const AUTO_MENUS: DuelMatLink['menus'] = { Card: AutoCardSheet, Phases: AutoPhases }

/** La mesa del repaso: el lado del rival vacío y sin sus vuelos (al volver al duelo, sus cartas siguen donde estaban) y la fase del paso que se mira. */
function reviewMat(mat: AutoAsks['mat'], phase: MatPhase): AutoAsks['mat'] {
  const { rivalFlights: _flights, ...rest } = mat

  return { ...rest, opponent: NO_RIVAL_CELLS, sharedZone: NO_SHARED_ZONE, rivalHand: NO_RIVAL_HAND, attackTargets: NO_TARGETS, phase }
}
