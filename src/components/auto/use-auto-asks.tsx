import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'

import type { CardRef, ChainLink, Side } from '../../app/auto/adapter'
import { askView, effectAskText, itemsInto, listOrder, namesList, openAsk, step, stopPhaseItems, type AskCard, type AskGesture, type AskItem, type AskState, type AutoLink, type AutoMenuItem } from '../../app/auto/ask-ui'
import type { AutoSession, AutoSnapshot } from '../../app/auto/auto-session'
import { CHAIN_LINGER_MS, chainDwell, chainFeed, stepsUpTo } from '../../app/auto/chain-feed'
import { actingOf } from '../../app/card-glow'
import type { AutoCardInfo } from '../../app/auto/online-protocol'
import { turnReasons } from '../../app/auto/no-plays'
import { foldOpeningHand } from '../../app/auto/opening-hand'
import { allowTo, leaves, stopAt, trailingStops, type Allowed } from '../../app/auto/phase-stops'
import { splitDesc, type Seat } from '../../app/auto/protocol'
import { useAutoPrefs } from '../../app/auto-prefs'
import { parseDerivedCardId } from '../../app/calculator-state'
import type { CardTextHighlight } from '../../app/card-text'
import { allMatIds, cardKindOf, createMatState, replayMat, type MatAction, type MatPhase, type MatState, type MatTarget } from '../../app/practice-mat'
import type { SavedCombo } from '../../app/saved-combos'
import { playSfx } from '../../app/sfx'
import { useChange } from '../../app/use-duel-sounds'
import type { MatSession } from '../../app/use-mat-session'
import { DUEL_DETAIL_DOCK_MEDIA_QUERY, useMediaQuery } from '../../app/use-media-query'
import { usePracticeSounds } from '../../app/use-practice-sounds'
import { Presence } from '../../app/use-presence'
import { t } from '../../i18n'
import { artOfDrawId } from '../duel/duel-art'
import type { LaneNotice } from '../duel/DuelBar'
import { DuelCardDock, type CardPeek } from '../duel/DuelCardDock'
import { DUEL_AREAS, DUEL_AREAS_COMPACT, SideCells, sharedZoneCard, TheirHand, type DuelSideView } from '../duel/DuelTable'
import { RivalCardDetail } from '../duel/RivalCardDetail'
import { useDockPeek } from '../duel/use-dock-peek'
import { PILE_TITLES, PileViewer } from '../probability/MatDialogs'
import { cardIdOfDrawId } from '../probability/practice'
import type { DuelMatLink, MatCard } from '../probability/PracticeMat'
import { AskOptions, type AskOption } from './AskOptions'
import { AskPrompt } from './AskPrompt'
import { CardPicker, type PickCard } from './CardPicker'
import { ChainNotice } from './ChainNotice'
import { LimitsChip } from './LimitsChip'
import { SortSheet } from './SortSheet'

/**
 * Lo que comparten las dos mesas del duelo automático (`AutoSoloScreen` y `AutoDuelScreen`, la del duelo por enlace): la mesa como la cuenta el núcleo (el ritmo: las jugadas de una
 * tanda se muestran de a una, `STEP_MS`, y tocar la mesa salta al final; al rearmarse, un solo commit), las preguntas contestadas en la mesa (`openAsk` / `askView` / `step` de
 * `ask-ui.ts`: los menús, las casillas y el brillo van por `duel.auto`; lo de afuera, `AskPrompt`, `AskOptions`, `CardPicker` y `SortSheet`, en `pieces`), el espejo del rival, la
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
/** El título de la pregunta de a qué monstruo atacar (`HINTMSG_ATTACKTARGET` del núcleo). */
const ATTACK_TARGET_HINT = '549'

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
}

export interface AutoAsks {
  /** Tu mesa como se ve ahora (con el ritmo) y la sesión de la mesa que la reproduce. */
  state: MatState
  matSession: MatSession
  /** La mesa terminó de contar la última tanda; `skipAhead` salta al final (tocar la mesa; los botones del aviso de la cadena, no: se toca para mirarla). */
  settled: boolean
  skipAhead: (event?: { target: EventTarget | null }) => void
  lane: LaneNotice | null
  /** Lo que la mesa recibe del núcleo (`PracticeMat.duel`): falta lo de cada pantalla (la barra, tus vidas, los botones, las portadas). */
  mat: Omit<DuelMatLink, 'header' | 'tools' | 'life' | 'rivalTurnLabel'>
  /** Las piezas de afuera de la mesa (opciones, submenú del celular, ordenar, elegir de una lista). */
  pieces: ReactNode
  nameOf: (ref: CardRef | null, code?: number) => string
  artOf: (ref: CardRef | null, code?: number) => string | null
  /** Hay una jugada tuya que deshacer (la última respuesta tuya a un `select_idlecmd` o `select_battlecmd`). */
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
}

export function useAutoAsks({ session, snap, cardsById, cards, seat = 0, canCancel, canUndo, waitingText, frozen = false, rivalName = t('duel.bar.rival'), rivalHand, onManual }: AutoAsksInput): AutoAsks {
  const prefs = useAutoPrefs()
  const wide = useMediaQuery(DUEL_DETAIL_DOCK_MEDIA_QUERY)
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
  const [chainOpen, setChainOpen] = useState(false)
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

  useEffect(() => {
    if (reviewing || paced.cursor >= Math.min(limit, chainNext)) return
    const timer = window.setTimeout(() => setPaced((current) => (current.cursor < current.actions.length ? { ...current, cursor: current.cursor + 1 } : current)), STEP_MS)

    return () => window.clearTimeout(timer)
  }, [paced, limit, reviewing, chainNext])
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
  useChange(snap.replaying ? undefined : ([...snap.overlay.lp] as const), (before, now) => {
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
  const artOf = useCallback(
    (ref: CardRef | null, code = 0): string | null => {
      const mine = ref?.side === 'mine' ? cardsById.get(ref.id) : undefined
      const at = ref ? codeOf(ref) || code : code

      return mine?.art ?? mine?.apiCard?.imageUrlSmall ?? (at ? artOfDrawId(drawIdOf(at)) : null)
    },
    [cardsById, codeOf],
  )
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
  const pickCardOf = (card: AskCard, key: string): PickCard => {
    const where = card.place === 'hand' ? PILE_TITLES.hand : card.place === 'pile' && card.pile ? PILE_TITLES[card.pile] : undefined
    const place = where && card.ref?.side === 'theirs' ? t('duel.zone.theirs', { zone: where }) : where

    return { key, name: nameOf(card.ref, card.code), art: artOf(card.ref, card.code), ...(place ? { place } : {}) }
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
  /** Una pregunta sin gesto ni respuesta segura (anunciar una carta sin catálogo): la línea avisa (y, solo, ofrece deshacer). */
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
    setStuck(null)
    setSub(null)
    // La casilla soltada contesta sólo la primera pregunta de casillas; si no se pudo usar, la carta deja de esperar ahí.
    if (held && type === 'select_place' && held.placeAsk === undefined) setDropped(state && askView(state).auto?.why === 'drop' ? { ...held, placeAsk: askId! } : null)
  }
  // Ya salió de la mano: lo que se soltó, se jugó.
  if (held && !state.hand.includes(held.id)) setDropped(null)
  const askState = opened.askId === askId ? opened.state : null

  useEffect(() => {
    askRef.current = askState
  }, [askState])

  useEffect(() => {
    const view = pending ? askView(open() ?? openAsk(pending, { queries: session.adapter!, prefs: { chainMode: 'never', placeMode: 'auto' } })) : null

    if (!view?.auto) return
    if (view.auto.answer) session.answer(view.auto.answer)
    else setStuck(pending!.ask.type)
    // Sólo cuando llega otra pregunta: la mesa y los ajustes se leen en ese momento.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [askId])

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
          setSub(null)
          faultsBase.current = session.getSnapshot().faults.length
          unmappedBase.current = session.getSnapshot().unmapped.length
          session.answer(next.answer)
          return
        }
      }
      askRef.current = current
      setOpened({ askId: current.askId, state: current })
    },
    [session],
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
  const mineIds = (indices: readonly number[]) => indices.flatMap((i) => (pick!.cards[i]!.ref?.side === 'mine' ? [pick!.cards[i]!.ref!.id] : []))
  const pickLabel = pick
    ? pick.type === 'select_card' && shown?.title === ATTACK_TARGET_HINT
      ? t('auto.pick.attackTarget')
      : pick.type === 'select_tribute'
      ? t('auto.pick.tribute', { chosen: pick.count.now, total: pick.count.need })
      : pick.type === 'select_sum'
        ? t('auto.pick.sum', { chosen: pick.count.now, total: pick.count.need })
        : `${pick.min === pick.max ? t('auto.pick.cards', { count: pick.max }) : t('auto.pick.range', { min: pick.min, max: pick.max })}${pick.max > 1 ? ` · ${t('auto.picker.status', { chosen: pick.count.now, max: pick.count.need })}` : ''}`
    : ''
  const cardPick: AutoLink['cardPick'] =
    pick && pick.surface !== 'list'
      ? {
          label: pickLabel,
          eligible: new Set(mineIds(pick.eligible)),
          chosen: mineIds(pick.chosen),
          onToggle: (id) => gesture({ kind: 'card', ref: { side: 'mine', id } }),
          done: pick.done ? { label: t('auto.pick.done'), onSelect: () => gesture({ kind: 'done' }) } : null,
          cancel: shown?.cancelable ? () => gesture({ kind: 'cancel' }) : null,
        }
      : null
  const viewerIds = pick && pick.surface === 'pile' ? mineIds([...pick.chosen, ...pick.eligible.filter((i) => !pick.chosen.includes(i))]) : []
  const auto: AutoLink = {
    itemsFor: (id, drop) => {
      const items = shown?.items.get(id)

      if (!shown || !items || !drop) return items?.map(menuItem) ?? null
      // Soltada en una casilla: lo que la saca ahí; elegirlo la deja en esa casilla (también en el segundo paso, «¿cuál efecto?»).
      const from = shown.askId
      const keep = (item: AutoMenuItem): AutoMenuItem => ({
        ...item,
        onSelect: () => {
          setDropped({ id, zone: drop.zone, index: drop.index, initial: snap.initial, from })
          item.onSelect()
        },
        ...(item.children ? { children: item.children.map(keep) } : {}),
      })

      return itemsInto(items, drop.zone === 'mz' || drop.zone === 'emz' ? 'monster' : 'spell').map((item) => keep(menuItem(item)))
    },
    phaseItems: (stopped ? stopPhaseItems(state.phase) : (shown?.phaseItems ?? [])).map(menuItem),
    endTurn: shown?.endTurn ? () => gesture({ kind: 'item', answer: shown.endTurn! }) : null,
    zonePick: shown?.zonePick
      ? {
          label: t('auto.pick.zone', { count: shown.zonePick.count }),
          targets: shown.zonePick.targets.filter((target) => target.side === 'mine').map(({ zone, index }) => ({ zone, index })),
          onPick: (zone, index) => gesture({ kind: 'zone', side: 'mine', zone, index }),
        }
      : null,
    cardPick,
    viewer:
      pick && pick.surface === 'pile' && pick.pile
        ? {
            pile: pick.pile,
            ids: viewerIds,
            // Elegir varias de una vez, salvo cuando el núcleo las pide de a una (`select_unselect_card`: cada toque contesta y vuelve a preguntar).
            ...(pick.max > 1 && pick.type !== 'select_unselect_card' ? { many: { label: (ids) => t('auto.picker.choose', { count: ids.length }), onPick: (ids) => gesture(...ids.map((id) => ({ kind: 'card' as const, ref: { side: 'mine' as const, id } })), { kind: 'done' }) } } : {}),
          }
        : null,
    asking: shown !== null,
    // Como «No responder» de la línea: en la ventana de una fase tuya (`phaseWindow`) pasar es cambiar de fase, y eso va por el botón de fases.
    cancel: shown?.cancelable && ((shown.type === 'select_chain' && !shown.phaseWindow) || cardPick) ? () => gesture({ kind: 'cancel' }) : null,
    // La carta soltada es del duelo vivo: repasando, no se dibuja sobre la mesa del repaso.
    dropped: reviewing ? null : held,
    holdFor: (id) => {
      // Como en la mesa manual, sólo donde se deshace: en el duelo por enlace un toque largo sin querer sería una jugada.
      const item = canUndo && shown?.type === 'select_idlecmd' ? shown.items.get(id)?.find((entry) => entry.answer?.type === 'select_idlecmd' && entry.answer.action === 2) : undefined

      return item?.answer ? () => gesture({ kind: 'item', answer: item.answer! }) : null
    },
    // Repasando o con el duelo terminado, el menú vacío dice lo de siempre.
    whyNot: reviewing || frozen || snap.status === 'ended' ? null : (id) => [...turnReasons({ state, id, kind: cardKindOf(cardsById.get(id)?.apiCard ?? null), turnMine, ask: shown?.type ?? null, normal: snap.overlay.normal[seat] }), ...limitTexts],
    manual: onManual ?? null,
  }
  const respond = useMemo(() => new Set(shown?.respond.flatMap((ref) => (ref.side === 'mine' ? [ref.id] : [])) ?? []), [shown])
  const feed = useMemo(() => (snap.replaying ? null : chainFeed(steps, chainSeen)), [steps, chainSeen, snap.replaying])
  // Lo que se activa o se resuelve, de los dos lados, al ritmo del aviso de la cadena (repasando, nada).
  const acting = useMemo(() => actingOf(reviewing ? null : feed), [feed, reviewing])

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
  // Las cartas del rival que la pregunta deja elegir (a qué atacar, el objetivo de un efecto): laten y se eligen tocándolas; las elegidas llevan la mira.
  const rivalPicks = useMemo(() => {
    const refs = (indices: readonly number[]) => indices.flatMap((i) => (pick!.cards[i]!.ref?.side === 'theirs' ? [pick!.cards[i]!.ref!.id] : []))

    return pick ? { eligible: new Set(refs(pick.eligible)), chosen: refs(pick.chosen) } : null
  }, [pick])
  /** El visor de una pila del rival (información pública): su Cementerio, su Destierro o lo boca arriba de su Extra. Repasando, su lado está vacío. */
  const [rivalPileOpen, setRivalPile] = useState<'gy' | 'banished' | 'extra' | null>(null)
  const rivalPile = reviewing ? null : rivalPileOpen
  const opponent = useMemo<DuelSideView>(
    () => ({
      state: theirs,
      artOf: (id) => artOf({ side: 'theirs', id }),
      handCount: theirs.hand.length,
      ...(rivalPicks ? { pickable: rivalPicks.eligible, marks: { cards: rivalPicks.chosen, piles: [] } } : {}),
      act: acting.theirs,
      // Tocar una carta suya la elige si la pregunta la ofrece; si no, la muestra. Tocar su Cementerio, su Destierro o su Extra con cartas boca arriba abre (o cierra) su visor.
      onMark: (target, rect) => {
        if ('pile' in target) {
          const pile = target.pile === 'gy' || target.pile === 'banished' || target.pile === 'extra' ? target.pile : null

          if (pile && (pile === 'extra' ? theirs.extraUp : theirs[pile]).length > 0) setRivalPile((current) => (current === pile ? null : pile))
          return
        }
        if (rivalPicks?.eligible.has(target.card)) gesture({ kind: 'card', ref: { side: 'theirs', id: target.card } })
        else showRival(rivalPeekOf(target.card), rect)
      },
    }),
    [theirs, artOf, gesture, rivalPicks, showRival, rivalPeekOf, acting],
  )
  const foreignKnown = useMemo(() => Object.fromEntries(allMatIds(theirs).flatMap((id) => (codeOf({ side: 'theirs', id }) ? [[id, drawIdOf(codeOf({ side: 'theirs', id }))]] : []))), [theirs, codeOf])
  const attackTargets = useMemo(() => (['mz', 'emz'] as const).flatMap((zone) => theirs[zone].flatMap((placed, index) => (placed ? [{ id: placed.id, zone, index, faceDown: placed.pos === 'set' }] : []))), [theirs])

  // ── La línea del registro: lo que no frena (trabada, el rival eligiendo, pensando, la cadena con «No responder», un error de script, la cadena que se resuelve), lo más urgente primero. ──
  const chain = snap.overlay.chain
  const linkName = (link: ChainLink) => nameOf(link.card, link.code)
  const respondNames = (ids: Iterable<string>) => namesList([...ids].map((id) => nameOf({ side: 'mine', id })))
  const newFault = snap.faults[snap.faults.length - 1]
  const lane: LaneNotice | null = review
    ? // Repasando: qué se mira y la salida, en el lugar de los avisos (no corre nada).
      { kind: 'ask', text: review.name === undefined ? t('auto.review.plays') : t('auto.review.combo', { name: review.name }), actions: [{ label: t('auto.review.back'), onSelect: back, primary: true }] }
    : frozen
    ? null
    : stuck
      ? { kind: 'ask', text: t('auto.lane.error', { message: stuck }), actions: canUndo ? [{ label: t('practice.mat.undo'), onSelect: () => session.undo(), primary: true }] : [] }
      : snap.status === 'waiting' && waitingText !== null
        ? { kind: 'thinking', text: waitingText }
        : snap.status === 'thinking'
          ? { kind: 'thinking', ...(canCancel ? { onCancel: () => session.cancel() } : {}) }
          : shown?.type === 'select_chain' && !shown.phaseWindow
            ? // Una cadena obligatoria (una sola carta, a veces en una pila: brilla la pila) no tiene «No responder»: la línea dice que hay que activarla. La que se puede pasar
              // va al medio (`chainOffer`) y la línea queda libre.
              shown.cancelable
              ? null
              : { kind: 'ask', text: t('auto.lane.mustActivate', { cards: respondNames(shown.items.keys()) }), actions: [] }
            : snap.faults.length > faultsBase.current && newFault
              ? { kind: 'ask', text: newFault.kind === 'script' ? t('auto.lane.script', { card: newFault.cards.map((code) => nameOf(null, code)).join(', ') }) : t('auto.lane.error', { message: newFault.message }), actions: [] }
              : snap.unmapped.length > unmappedBase.current
                ? { kind: 'ask', text: t('auto.lane.unmapped', { what: snap.unmapped[snap.unmapped.length - 1]! }), actions: [] }
                : null
  // La cadena que se puede pasar, al medio de la mesa (como «¿Activás el efecto?»): se responde tocando la carta que brilla; sin nada más urgente en la línea (trabada, esperando, pensando).
  // El aviso de la cadena: la última que empezó, como se ve con lo que ya se mostró (`feed`, más arriba); terminada, se va a los `CHAIN_LINGER_MS` salvo que la hayas desplegado (queda hasta plegarla).
  useEffect(() => {
    if (!feed?.done || chainOpen) return
    const timer = window.setTimeout(() => setChainGone(feed.key), CHAIN_LINGER_MS)

    return () => window.clearTimeout(timer)
  }, [feed, chainOpen])
  const chainNotice =
    feed && !reviewing && !(feed.done && chainGone === feed.key) ? (
      <ChainNotice
        rows={feed.rows.map((row) => ({ number: row.number, who: row.mine ? t('duel.bar.you') : rivalName, name: row.code ? nameOf(null, row.code) : nameOf(row.card), art: artOf(row.card, row.code), state: row.state }))}
        focus={feed.focus}
        resolving={feed.resolving}
        open={chainOpen}
        onOpenChange={setChainOpen}
      />
    ) : null
  const chainOffer = shown?.type === 'select_chain' && !shown.phaseWindow && shown.cancelable && lane === null ? shown : null
  const respondedTo = chain.at(-1)

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
  const effectAsk = prompt && promptCard ? effectAskText({ ...prompt, card: promptCard }, snap.overlay.cause, (code) => nameOf(code === promptCard.code ? promptCard.ref : null, code), byCode.get(promptCard.code)?.apiCard?.description ?? null) : null
  const options = shown?.options
  // Una opción sin texto no inventa un número (el orden de la pregunta no es el de la carta): dice «Activar efecto». La carta que pregunta (la que nombran sus opciones, si
  // se la conoce) va arriba del título.
  const optionLabel = (option: { value: number; label?: string }) =>
    option.label ?? (options?.of === 'race' ? (RACES[option.value] ?? String(option.value)) : options?.of === 'attribute' ? (ATTRIBUTES[option.value] ?? String(option.value)) : t('practice.menu.activateEffect'))
  const askingCode = options?.options.map((option) => (option.description ? splitDesc(option.description).code : 0)).find((code) => Boolean(snap.names[code] ?? cards?.get(code)?.name))
  const optionsTitle = options ? (options.of === 'position' ? t('auto.options.position') : options.of === 'number' ? t('auto.options.number') : options.of === 'race' ? t('auto.options.race', { count: options.count }) : options.of === 'attribute' ? t('auto.options.attribute', { count: options.count }) : t('auto.options.option')) : ''
  const list = pick && pick.surface === 'list' ? pick : null
  // Todas las de la pregunta, en su orden (las que ahora no valen van apagadas: `eligible`; las elegidas, con su aro), salvo las del deck, que van por nombre (`listOrder`).
  const listCards = list ? listOrder(list.cards, (card) => nameOf(card.ref, card.code)).map((i) => pickCardOf(list.cards[i]!, String(i))) : []

  const mat: AutoAsks['mat'] = {
    areas: DUEL_AREAS,
    areasCompact: DUEL_AREAS_COMPACT,
    opponent: <SideCells side={opponent} owner="theirs" />,
    sharedZone: (index) => sharedZoneCard(opponent, index),
    rivalHand: (
      <TheirHand
        count={theirs.hand.length}
        {...(rivalHand
          ? {
              cards: rivalHand.map((code) => ({ name: nameOf(null, code), art: artOf(null, code) })),
              onCard: (index: number, rect: DOMRect) => showRival({ drawId: drawIdOf(rivalHand[index]!) }, rect),
              onCardHover: (index: number) => dock.hover({ drawId: drawIdOf(rivalHand[index]!) }),
            }
          : {})}
      />
    ),
    attackTargets,
    foreignKnown,
    // La fase de quien tiene el turno (como en el duelo manual): la tuya, en tu mesa; la del rival, en el espejo de la suya.
    phase: turnMine ? state.phase : theirs.phase,
    // Cambiás de fase en tus jugadas del turno, en una parada de tu DP o tu SP y en la ventana de una fase tuya.
    myTurn: stopped || shown?.type === 'select_idlecmd' || shown?.type === 'select_battlecmd' || !!shown?.phaseWindow,
    respond,
    act: acting.mine,
    prompt: prompt ? (
      <AskPrompt
        key={askId ?? 0}
        // Un sí o no a secas dice su pregunta (el texto de su `desc`) cuando la tiene; el de un efecto, qué pasó, dónde está la carta y qué hace (`effectAsk`).
        text={effectAsk?.text ?? effectLabel(0, prompt.description) ?? t('auto.ask.fallback')}
        {...(promptCard ? { card: { name: nameOf(promptCard.ref, promptCard.code), art: artOf(promptCard.ref, promptCard.code) } } : {})}
        {...(effectAsk?.kicker ? { kicker: effectAsk.kicker } : {})}
        {...(effectAsk?.place ? { place: effectAsk.place } : {})}
        {...(effectAsk?.effect ? { effect: effectAsk.effect } : {})}
        {...(promptCard && onManual ? { manual: { label: t('auto.bar.manual'), onSelect: onManual } } : {})}
        yes={{ label: promptCard ? t('practice.menu.activateEffect') : t('auto.ask.yes'), onSelect: () => gesture({ kind: 'item', answer: prompt.yes }) }}
        no={{ label: promptCard ? t('auto.ask.skipEffect') : t('auto.ask.no'), onSelect: () => gesture({ kind: 'item', answer: prompt.no }) }}
      />
    ) : chainOffer ? (
      <AskPrompt
        key={askId ?? 0}
        text={
          respondedTo
            ? t('auto.lane.respondTo', { card: linkName(respondedTo), cards: respondNames(chainOffer.items.keys()) })
            : t('auto.lane.respondNow', { cards: respondNames(chainOffer.items.keys()) })
        }
        // La carta a la que se responde (el último eslabón), chica a la izquierda: se ve qué se está por resolver sin buscarla en la mesa.
        {...(respondedTo ? { card: { name: linkName(respondedTo), art: artOf(respondedTo.card, respondedTo.code) } } : {})}
        no={{ label: t('auto.lane.pass'), onSelect: () => gesture({ kind: 'cancel' }) }}
      />
    ) : undefined,
    rivalFlights: { state: theirs, artOf: opponent.artOf },
    ...(chainNotice ? { chain: chainNotice } : {}),
    turnNumber: snap.overlay.turn,
    rivalEmz: theirs.emz.map(Boolean),
    // El ATK/DEF de ahora es del duelo vivo: repasando, el detalle muestra la carta impresa.
    ...(wide ? { detail: <DuelCardDock peek={dock.shown} highlight={highlight} stats={reviewing ? null : dockStats} /> } : {}),
    onPeek: dock.lock,
    onHover: dock.hover,
    onRivalHover: (id) => dock.hover(rivalPeekOf(id)),
    rivalViewing: rivalPile !== null,
    // Abrir una pila tuya cierra la del rival: van en el mismo lugar.
    onActivity: (activity) => {
      if (activity !== null && activity !== 'choosing') setRivalPile(null)
    },
    onHighlight: setHighlight,
    auto,
    limits: reviewing ? null : <LimitsChip texts={limitTexts} />,
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
            cards={shown.sort.cards.map((card, index) => pickCardOf(card, String(index)))}
            onSort={(keys) => (keys === null ? gesture({ kind: 'cancel' }) : gesture(...keys.map((key) => ({ kind: 'pick' as const, index: Number(key) })), { kind: 'done' }))}
          />
        ) : null}
      </Presence>
      <Presence>
        {list ? (
          // La cuenta la lleva `ask-ui` (lo elegido, lo que todavía vale, si «Listo» contesta): la hoja sólo la muestra. `select_unselect_card` va de a una (cada toque contesta).
          <CardPicker
            key={`picker-${askId}`}
            title={pickLabel}
            cards={listCards}
            min={list.min}
            max={list.type === 'select_unselect_card' ? 1 : list.max}
            chosen={list.chosen.map(String)}
            eligible={new Set(list.eligible.map(String))}
            done={list.done}
            onToggle={(key) => gesture({ kind: 'pick', index: Number(key) })}
            onPick={() => gesture({ kind: 'done' })}
            {...(shown?.cancelable ? { onCancel: () => gesture({ kind: 'cancel' }) } : {})}
          />
        ) : null}
      </Presence>
      <Presence>{rivalCard ? <RivalCardDetail key={rivalCard.drawId} drawId={rivalCard.drawId} origin={rivalCard.rect} onClose={() => setRivalCard(null)} /> : null}</Presence>
    </>
  )

  const rivalTargeted = useMemo(() => new Set(theirs.targeted), [theirs.targeted])
  const rivalViewer = (
    <PileViewer
      pile={rivalPile}
      // Eligiendo en la mesa (o con la mesa tapada por el final) se esconde sin cerrarse, como el tuyo.
      hidden={choosing || frozen || snap.status === 'ended' || Boolean(snap.fault)}
      ids={rivalPile ? (rivalPile === 'extra' ? theirs.extraUp : theirs[rivalPile]) : []}
      info={(id) => {
        const peek = rivalPeekOf(id)
        const open = 'drawId' in peek

        return { name: open ? nameOf({ side: 'theirs', id }) : t('duel.mark.rivalCard'), art: open ? artOf({ side: 'theirs', id }) : null, faceDown: !open, faceUp: rivalPile === 'extra' }
      }}
      targeted={rivalTargeted}
      glow={(id) => (acting.theirs.has(id) ? 'act' : null)}
      onPick={(id, rect) => {
        if (!wide) showRival(rivalPeekOf(id), rect)
      }}
      onPeek={(id) => lockDock(rivalPeekOf(id))}
      onHover={(id) => dock.hover(rivalPeekOf(id))}
      onClose={() => setRivalPile(null)}
    />
  )

  return {
    rivalViewer,
    state: reviewState ?? state,
    matSession: review?.session ?? matSession,
    settled,
    skipAhead,
    lane,
    mat: reviewState ? reviewMat(mat, reviewState.phase) : mat,
    pieces,
    nameOf,
    artOf,
    undoable: !reviewing && snap.answers.some((item) => item.seat === seat && (item.answer.type === 'select_idlecmd' || item.answer.type === 'select_battlecmd')),
    // Lo que se repasa es tuyo.
    turnMine: reviewing || turnMine,
    review: { active: reviewing, load, seek, back },
  }
}

/** Un lado del rival vacío: repasando, la mesa es sólo la tuya (como en la práctica), sin moverse de lugar. */
const NO_RIVAL: DuelSideView = { state: createMatState([], [], 0), artOf: () => null, handCount: 0 }

/** La mesa del repaso: el lado del rival vacío y sin sus vuelos (al volver al duelo, sus cartas siguen donde estaban) y la fase del paso que se mira. */
function reviewMat(mat: AutoAsks['mat'], phase: MatPhase): AutoAsks['mat'] {
  const { rivalFlights: _flights, ...rest } = mat

  return { ...rest, opponent: <SideCells side={NO_RIVAL} owner="theirs" />, sharedZone: () => null, rivalHand: <TheirHand count={0} />, attackTargets: [], phase }
}
