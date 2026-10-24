import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'

import type { CardRef, ChainLink, Side } from '../../app/auto/adapter'
import { askView, namesList, openAsk, step, type AskCard, type AskGesture, type AskItem, type AskState, type AutoLink, type AutoMenuItem } from '../../app/auto/ask-ui'
import type { AutoSession, AutoSnapshot } from '../../app/auto/auto-session'
import type { AutoCardInfo } from '../../app/auto/online-protocol'
import type { Seat } from '../../app/auto/protocol'
import { useAutoPrefs } from '../../app/auto-prefs'
import { parseDerivedCardId } from '../../app/calculator-state'
import type { CardTextHighlight } from '../../app/card-text'
import { allMatIds, cardKindOf, replayMat, type MatAction, type MatState } from '../../app/practice-mat'
import { playSfx } from '../../app/sfx'
import { useChange } from '../../app/use-duel-sounds'
import type { MatSession } from '../../app/use-mat-session'
import { DUEL_DETAIL_DOCK_MEDIA_QUERY, useMediaQuery } from '../../app/use-media-query'
import { usePracticeSounds } from '../../app/use-practice-sounds'
import { Presence } from '../../app/use-presence'
import { t } from '../../i18n'
import { artOfDrawId } from '../duel/duel-art'
import type { LaneNotice } from '../duel/DuelBar'
import { DuelCardDock } from '../duel/DuelCardDock'
import { DUEL_AREAS, DUEL_AREAS_COMPACT, SideCells, sharedZoneCard, TheirHand, type DuelSideView } from '../duel/DuelTable'
import { useDockPeek } from '../duel/use-dock-peek'
import { PILE_TITLES } from '../probability/MatDialogs'
import { cardIdOfDrawId } from '../probability/practice'
import type { DuelMatLink, MatCard } from '../probability/PracticeMat'
import { AskOptions, type AskOption } from './AskOptions'
import { AskPrompt } from './AskPrompt'
import { CardPicker, type PickCard } from './CardPicker'
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
}

export interface AutoAsks {
  /** Tu mesa como se ve ahora (con el ritmo) y la sesión de la mesa que la reproduce. */
  state: MatState
  matSession: MatSession
  /** La mesa terminó de contar la última tanda; `skipAhead` salta al final (tocar la mesa). */
  settled: boolean
  skipAhead: () => void
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
}

export function useAutoAsks({ session, snap, cardsById, cards, seat = 0, canCancel, canUndo, waitingText, frozen = false }: AutoAsksInput): AutoAsks {
  const prefs = useAutoPrefs()
  const wide = useMediaQuery(DUEL_DETAIL_DOCK_MEDIA_QUERY)
  const dock = useDockPeek()
  const [highlight, setHighlight] = useState<CardTextHighlight | null>(null)

  // ── El ritmo: las jugadas de una tanda se agregan de una vez y el cursor avanza de a una; al rearmarse la mesa se salta al final (un solo commit: se ajusta en el render). ──
  const [paced, setPaced] = useState<Paced>(() => ({ initial: snap.initial.mine, actions: snap.mineActions, cursor: snap.mineActions.length }))
  const [seen, setSeen] = useState(snap.initial)

  if (!snap.replaying) {
    if (seen !== snap.initial) {
      setSeen(snap.initial)
      setPaced({ initial: sameStart(paced.initial, snap.initial.mine) ? paced.initial : snap.initial.mine, actions: snap.mineActions, cursor: snap.mineActions.length })
    } else if (paced.actions !== snap.mineActions) {
      setPaced({ ...paced, actions: snap.mineActions })
    }
  }

  useEffect(() => {
    if (paced.cursor >= paced.actions.length) return
    const timer = window.setTimeout(() => setPaced((current) => (current.cursor < current.actions.length ? { ...current, cursor: current.cursor + 1 } : current)), STEP_MS)

    return () => window.clearTimeout(timer)
  }, [paced])

  const skipAhead = useCallback(() => setPaced((current) => (current.cursor < current.actions.length ? { ...current, cursor: current.actions.length } : current)), [])
  const settled = paced.cursor === paced.actions.length && !snap.replaying
  const state = useMemo(() => replayMat(paced.initial, paced.actions, paced.cursor), [paced])
  // Los nombres del `.cdb` (las cartas del rival, que no están en `cardsById`): la mesa los lee por el id de su primera copia.
  const names = useMemo(() => Object.fromEntries(Object.entries(snap.names).map(([code, name]) => [drawIdOf(Number(code)), name])), [snap.names])
  const matSession = useMemo<MatSession>(() => ({ initial: paced.initial, actions: [...paced.actions], cursor: paced.cursor, names, replay: false }), [paced, names])

  usePracticeSounds(matSession)
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
  // El rótulo de un efecto o de una opción: el `strN` del `.cdb` que nombra el `desc` (carta = desc >> 4, n = desc & 15); los del sistema (< 10000) no viajan: la pantalla dice «Efecto n».
  // Online, los del rival llegan con sus cartas (`cards`).
  const effectLabel = useCallback(
    (_code: number, description: string): string | null => {
      const desc = BigInt(description)

      if (desc < 10000n) return null
      const code = Number(desc >> 4n)
      const n = Number(desc & 15n)

      return snap.texts[code]?.[n] || cards?.get(code)?.strs?.[n] || null
    },
    [snap.texts, cards],
  )
  const pickCardOf = (card: AskCard, key: string): PickCard => {
    const where = card.place === 'hand' ? PILE_TITLES.hand : card.place === 'pile' && card.pile ? PILE_TITLES[card.pile] : undefined
    const place = where && card.ref?.side === 'theirs' ? t('duel.zone.theirs', { zone: where }) : where

    return { key, name: nameOf(card.ref, card.code), art: artOf(card.ref, card.code), ...(place ? { place } : {}) }
  }

  // ── La pregunta pendiente: se abre con la mesa del núcleo (`session.adapter`) en el mismo render en que llega (un rearme con pregunta es un solo commit); lo que se contesta solo, se
  // contesta en un efecto; lo demás espera a que la mesa termine de contar. ──
  const pending = snap.ask
  const askId = pending?.askId ?? null
  const open = () => {
    const adapter = session.adapter

    return pending && adapter ? openAsk(pending, { queries: adapter, prefs: { chainMode: prefs.chain, placeMode: prefs.place }, phase: adapter.mine.phase, typeOf, effectLabel }) : null
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

    setOpened({ askId, state: state && !askView(state).auto ? state : null })
    setStuck(null)
    setSub(null)
  }
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
  const shown = settled && !frozen ? view : null
  const menuItem = useCallback(
    (item: AskItem): AutoMenuItem => ({
      label: item.label,
      ...(item.lead === undefined ? {} : { lead: item.lead }),
      ...(item.current ? { current: true } : {}),
      ...(item.disabled ? { disabled: true, hint: t('auto.phase.notYet') } : {}),
      onSelect: item.answer ? () => gesture({ kind: 'item', answer: item.answer! }) : item.children ? () => setSub(item) : NOTHING,
      ...(item.children ? { children: item.children.map(menuItem) } : {}),
    }),
    [gesture],
  )

  // ── Lo que la mesa recibe de la pregunta (`duel.auto`). ──
  const pick = shown?.cardPick ?? null
  const mineIds = (indices: readonly number[]) => indices.flatMap((i) => (pick!.cards[i]!.ref?.side === 'mine' ? [pick!.cards[i]!.ref!.id] : []))
  const pickLabel = pick
    ? pick.type === 'select_tribute'
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
    itemsFor: (id) => shown?.items.get(id)?.map(menuItem) ?? null,
    phaseItems: shown?.phaseItems.map(menuItem) ?? [],
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
  }
  const respond = useMemo(() => new Set(shown?.respond.flatMap((ref) => (ref.side === 'mine' ? [ref.id] : [])) ?? []), [shown])

  // ── El rival: su espejo, dibujado por lo que el núcleo dejó ver (`codeOf`). ──
  const theirs = snap.theirs
  const opponent = useMemo<DuelSideView>(
    () => ({
      state: theirs,
      artOf: (id) => artOf({ side: 'theirs', id }),
      handCount: theirs.hand.length,
      // Tocar una carta suya elige (cuando la pregunta la ofrece: el objetivo de un ataque, una carta de su campo).
      onMark: (target) => {
        if ('card' in target) gesture({ kind: 'card', ref: { side: 'theirs', id: target.card } })
      },
    }),
    [theirs, artOf, gesture],
  )
  const foreignKnown = useMemo(() => Object.fromEntries(allMatIds(theirs).flatMap((id) => (codeOf({ side: 'theirs', id }) ? [[id, drawIdOf(codeOf({ side: 'theirs', id }))]] : []))), [theirs, codeOf])
  const attackTargets = useMemo(() => (['mz', 'emz'] as const).flatMap((zone) => theirs[zone].flatMap((placed, index) => (placed ? [{ id: placed.id, zone, index, faceDown: placed.pos === 'set' }] : []))), [theirs])

  // ── La línea del registro: lo que no frena (trabada, el rival eligiendo, pensando, la cadena con «No responder», un error de script, la cadena que se resuelve), lo más urgente primero. ──
  const chain = snap.overlay.chain
  const linkName = (link: ChainLink) => nameOf(link.card, link.code)
  const respondNames = (ids: Iterable<string>) => namesList([...ids].map((id) => nameOf({ side: 'mine', id })))
  const newFault = snap.faults[snap.faults.length - 1]
  const lane: LaneNotice | null = frozen
    ? null
    : stuck
      ? { kind: 'ask', text: t('auto.lane.error', { message: stuck }), actions: canUndo ? [{ label: t('practice.mat.undo'), onSelect: () => session.undo(), primary: true }] : [] }
      : snap.status === 'waiting' && waitingText !== null
        ? { kind: 'thinking', text: waitingText }
        : snap.status === 'thinking'
          ? { kind: 'thinking', ...(canCancel ? { onCancel: () => session.cancel() } : {}) }
          : shown?.type === 'select_chain'
            ? {
                // Una cadena obligatoria (una sola carta, a veces en una pila: brilla la pila) no tiene «No responder»: la línea dice que hay que activarla.
                kind: 'ask',
                text: !shown.cancelable
                  ? t('auto.lane.mustActivate', { cards: respondNames(shown.items.keys()) })
                  : chain.length > 0
                    ? t('auto.lane.respondTo', { card: linkName(chain[chain.length - 1]!), cards: respondNames(shown.items.keys()) })
                    : t('auto.lane.respondNow', { cards: respondNames(shown.items.keys()) }),
                actions: shown.cancelable ? [{ label: t('auto.lane.pass'), onSelect: () => gesture({ kind: 'cancel' }) }] : [],
              }
            : snap.faults.length > faultsBase.current && newFault
              ? { kind: 'ask', text: newFault.kind === 'script' ? t('auto.lane.script', { card: newFault.cards.map((code) => nameOf(null, code)).join(', ') }) : t('auto.lane.error', { message: newFault.message }), actions: [] }
              : snap.unmapped.length > unmappedBase.current
                ? { kind: 'ask', text: t('auto.lane.unmapped', { what: snap.unmapped[snap.unmapped.length - 1]! }), actions: [] }
                : chainLane(chain, linkName)

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
  const options = shown?.options
  const optionLabel = (option: { value: number; label?: string }, index: number) =>
    option.label ?? (options?.of === 'race' ? (RACES[option.value] ?? String(option.value)) : options?.of === 'attribute' ? (ATTRIBUTES[option.value] ?? String(option.value)) : t('practice.menu.effectLead', { n: index + 1 }))
  const optionsTitle = options ? (options.of === 'position' ? t('auto.options.position') : options.of === 'number' ? t('auto.options.number') : options.of === 'race' ? t('auto.options.race', { count: options.count }) : options.of === 'attribute' ? t('auto.options.attribute', { count: options.count }) : t('auto.options.option')) : ''
  const list = pick && pick.surface === 'list' ? pick : null
  // Todas las de la pregunta, en su orden (las que ahora no valen van apagadas: `eligible`; las elegidas, con su aro).
  const listCards = list ? list.cards.map((card, i) => pickCardOf(card, String(i))) : []

  const mat: AutoAsks['mat'] = {
    areas: DUEL_AREAS,
    areasCompact: DUEL_AREAS_COMPACT,
    opponent: <SideCells side={opponent} owner="theirs" />,
    sharedZone: (index) => sharedZoneCard(opponent, index),
    rivalHand: <TheirHand count={theirs.hand.length} />,
    attackTargets,
    foreignKnown,
    phase: state.phase,
    myTurn: shown?.type === 'select_idlecmd' || shown?.type === 'select_battlecmd',
    respond,
    prompt: prompt ? (
      <AskPrompt
        key={askId ?? 0}
        text={promptCard ? t('auto.ask.effect', { card: nameOf(promptCard.ref, promptCard.code) }) : t('auto.ask.fallback')}
        {...(promptCard ? { card: { name: nameOf(promptCard.ref, promptCard.code), art: artOf(promptCard.ref, promptCard.code) } } : {})}
        yes={{ label: promptCard ? t('practice.menu.activateEffect') : t('auto.ask.yes'), onSelect: () => gesture({ kind: 'item', answer: prompt.yes }) }}
        no={{ label: promptCard ? t('auto.ask.skipEffect') : t('auto.ask.no'), onSelect: () => gesture({ kind: 'item', answer: prompt.no }) }}
      />
    ) : undefined,
    rivalFlights: { state: theirs, artOf: opponent.artOf },
    turnNumber: snap.overlay.turn,
    rivalEmz: theirs.emz.map(Boolean),
    ...(wide ? { detail: <DuelCardDock peek={dock.shown} highlight={highlight} stats={dockStats} /> } : {}),
    onPeek: dock.lock,
    onHover: dock.hover,
    onRivalHover: (id) => {
      const code = codeOf({ side: 'theirs', id })

      dock.hover(code ? { drawId: drawIdOf(code) } : { faceDown: true })
    },
    onHighlight: setHighlight,
    auto,
  }

  const pieces = (
    <>
      <Presence>
        {options ? (
          <AskOptions
            key={`options-${askId}`}
            title={optionsTitle}
            options={options.options.map((option, index): AskOption => ({ id: String(option.value), label: optionLabel(option, index) }))}
            mode={options.count > 1 || options.of === 'race' || options.of === 'attribute' ? { count: options.count } : 'one'}
            onPick={(ids) => gesture(...ids.map((id) => ({ kind: 'option' as const, value: Number(id) })))}
          />
        ) : null}
      </Presence>
      <Presence>
        {sub?.children ? (
          <AskOptions
            key={`sub-${askId}`}
            title={sub.label}
            options={sub.children.map((child, index): AskOption => ({ id: String(index), label: child.label, ...(child.lead === undefined ? {} : { lead: child.lead }) }))}
            mode="one"
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
    </>
  )

  return {
    state,
    matSession,
    settled,
    skipAhead,
    lane,
    mat,
    pieces,
    nameOf,
    artOf,
    undoable: snap.answers.some((item) => item.seat === seat && (item.answer.type === 'select_idlecmd' || item.answer.type === 'select_battlecmd')),
    turnMine: snap.overlay.turnPlayer === seat,
  }
}

/** La cadena que se está resolviendo, un eslabón por vez: el último que no terminó. */
function chainLane(chain: readonly ChainLink[], nameOf: (link: ChainLink) => string): LaneNotice | null {
  const index = chain.findLastIndex((link) => link.state !== 'solved')

  if (index < 0) return null
  const link = chain[index]!
  const card = nameOf(link)
  const text =
    link.state === 'solving'
      ? t('auto.lane.resolve', { card })
      : link.state === 'negated' || link.state === 'disabled'
        ? t('auto.lane.negated', { card })
        : index === 0
          ? t('auto.lane.chainLink', { link: index + 1, card })
          : t('auto.lane.chain', { link: index + 1, card, to: nameOf(chain[index - 1]!) })

  return { kind: 'ask', text, actions: [] }
}
