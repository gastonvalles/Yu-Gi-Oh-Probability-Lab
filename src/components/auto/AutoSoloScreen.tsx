import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react'

import type { CardRef, ChainLink, Side } from '../../app/auto/adapter'
import { askView, namesList, openAsk, step, type AskCard, type AskGesture, type AskItem, type AskState, type AutoLink, type AutoMenuItem } from '../../app/auto/ask-ui'
import { createDataLoader, httpSource } from '../../app/auto/auto-data'
import { createAutoSession, workerTransport, type AutoSession, type AutoSnapshot } from '../../app/auto/auto-session'
import type { DeckList } from '../../app/auto/deck-map'
import { setAutoPref, useAutoPrefs } from '../../app/auto-prefs'
import { parseDerivedCardId } from '../../app/calculator-state'
import type { CardTextHighlight } from '../../app/card-text'
import { allMatIds, cardKindOf, replayMat, type MatAction, type MatState } from '../../app/practice-mat'
import { playSfx } from '../../app/sfx'
import { setSoundsOn, useSoundsOn } from '../../app/sound-prefs'
import { useChange } from '../../app/use-duel-sounds'
import type { MatSession } from '../../app/use-mat-session'
import { DUEL_DETAIL_DOCK_MEDIA_QUERY, useMediaQuery } from '../../app/use-media-query'
import { usePracticeSounds } from '../../app/use-practice-sounds'
import { Presence } from '../../app/use-presence'
import { t } from '../../i18n'
import { CardArt } from '../CardArt'
import { artOfDrawId } from '../duel/duel-art'
import type { LaneNotice } from '../duel/DuelBar'
import { DuelCardDock } from '../duel/DuelCardDock'
import { DUEL_AREAS, DUEL_AREAS_COMPACT, SideCells, sharedZoneCard, TheirHand, type DuelSideView } from '../duel/DuelTable'
import { useDockPeek } from '../duel/use-dock-peek'
import { PILE_TITLES } from '../probability/MatDialogs'
import { cardIdOfDrawId } from '../probability/practice'
import { PracticeMat, type DuelMatLink, type MatCard } from '../probability/PracticeMat'
import { Button } from '../ui/Button'
import { Callout } from '../ui/Callout'
import { CloseButton } from '../ui/IconButton'
import { Skeleton } from '../ui/Skeleton'
import { AskOptions, type AskOption } from './AskOptions'
import { AskPrompt } from './AskPrompt'
import { AutoBar } from './AutoBar'
import { CardPicker, type PickCard } from './CardPicker'
import { SortSheet } from './SortSheet'

/**
 * «Jugar solo automático (beta)»: la mesa de siempre (`PracticeMat` con la composición del duelo: el campo del rival arriba, la barra, el detalle a la izquierda) jugada contra el
 * núcleo de reglas (`createAutoSession`: `ocgcore` en un Worker, el rival pasivo). La pantalla **nunca despacha una jugada**: las jugadas las cuenta el núcleo (`mineActions`) y la
 * mesa las reproduce de a una (`STEP_MS`, tocar la mesa salta al final: así los vuelos, los destellos y los sonidos de siempre narran cada paso); lo que la pantalla hace es contestar
 * preguntas: cada `CoreAsk` pasa por `openAsk` / `askView` (`ask-ui.ts`) y se muestra con los menús, las casillas y el brillo de la mesa (`duel.auto`) o con las piezas de afuera
 * (`AskPrompt`, `AskOptions`, `CardPicker`, `SortSheet`); cada toque pasa por `step` y, con respuesta, a `session.answer`. Al rearmarse la mesa (deshacer, reiniciar, cancelar)
 * `initial` cambia de objeto: se salta al final de golpe, en un solo commit, sin animar ni sonar. Lo que no tiene pantalla todavía se contesta solo (`view.auto`); si no hay respuesta
 * segura, la línea avisa y ofrece deshacer (la sesión nunca queda colgada).
 */

export interface AutoSoloScreenProps {
  /** Las copias del Main y del Extra del deck armado (`card-123-2`), y cómo se llama cada una (como en la práctica). */
  mainIds: readonly string[]
  extraIds: readonly string[]
  cardsById: ReadonlyMap<string, MatCard>
  deckName: string
  /** La mano de apertura del Lab: cuántas cartas robás al empezar (el núcleo reparte 5 si no se dice). */
  handSize?: number
  /** La X de la barra: vuelve al lobby. */
  onExit: () => void
  /** Arma la sesión (una de mentira en las pruebas); sin esto, la de verdad: los datos por HTTP y el núcleo en un Worker. */
  connect?: (deck: DeckList, options: { handSize?: number }) => AutoSession
}

/** Cuánto espera la mesa entre una jugada y la siguiente de una misma tanda (una cadena larga se cuenta paso a paso). */
export const STEP_MS = 220
const NOTHING = () => {}
/** Los Tipos (`RACE_*`, por bit) y los Atributos (`ATTRIBUTE_*`) del núcleo, con las palabras de las cartas (en inglés, como las muestra el catálogo). */
const RACES = ['Warrior', 'Spellcaster', 'Fairy', 'Fiend', 'Zombie', 'Machine', 'Aqua', 'Pyro', 'Rock', 'Winged Beast', 'Plant', 'Insect', 'Thunder', 'Dragon', 'Sea Serpent', 'Reptile', 'Psychic', 'Divine-Beast', 'Creator God', 'Wyrm', 'Cyberse', 'Illusion', 'Cyborg', 'Magical Knight', 'High Dragon', 'Omega Psychic', 'Celestial Warrior', 'Galaxy', 'Yokai']
const ATTRIBUTES = ['EARTH', 'WATER', 'FIRE', 'WIND', 'LIGHT', 'DARK', 'DIVINE']
/** `MSG_WIN`: por qué terminó, como lo escribe el núcleo (`Processors::Adjust`): 1 las vidas en 0, 2 sin cartas para robar (0 sólo lo manda un servidor al rendirse). */
const REASON_LP = 1
const REASON_DECK = 2
/** Desde acá, las razones las ponen los scripts (`Duel.Win`: Exodia, el Tablero del Destino…). */
const SCRIPT_REASON = 0x10
const SPELL = 0x2
const TRAP = 0x4
const MONSTER = 0x1

/** El deck como lo pide la sesión (`[passcode, copias]`), contando las copias del builder. */
function deckListOf(ids: readonly string[]): [number, number][] {
  const copies = new Map<number, number>()

  for (const id of ids) {
    const code = parseDerivedCardId(cardIdOfDrawId(id))

    if (code !== null) copies.set(code, (copies.get(code) ?? 0) + 1)
  }

  return [...copies]
}

const connectLive = (deck: DeckList, { handSize }: { handSize?: number }): AutoSession => createAutoSession({ loader: createDataLoader(httpSource()), deck, transport: workerTransport(), ...(handSize === undefined ? {} : { handSize }) })

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
const sentinel = (action: MatAction) => console.error('[auto] la mesa intentó despachar una jugada en modo automático', action)

export function AutoSoloScreen({ mainIds, extraIds, cardsById, deckName, handSize, onExit, connect = connectLive }: AutoSoloScreenProps) {
  const [session, setSession] = useState<AutoSession | null>(null)

  // En un efecto (y no en el render): con `StrictMode` el montaje se repite y la sesión de la primera pasada se destruye.
  useEffect(() => {
    const live = connect({ main: deckListOf(mainIds), extra: deckListOf(extraIds) }, handSize === undefined ? {} : { handSize })

    setSession(live)

    return () => live.destroy()
  }, [connect, mainIds, extraIds, handSize])

  return session ? <AutoDuel session={session} cardsById={cardsById} deckName={deckName} onExit={onExit} /> : <LoadingCover progress={{ done: 0, total: 0 }} />
}

function AutoDuel({ session, cardsById, deckName, onExit }: { session: AutoSession; cardsById: ReadonlyMap<string, MatCard>; deckName: string; onExit: () => void }) {
  const snap = useSyncExternalStore(session.subscribe, session.getSnapshot)
  const prefs = useAutoPrefs()
  const sounds = useSoundsOn()
  const wide = useMediaQuery(DUEL_DETAIL_DOCK_MEDIA_QUERY)
  const dock = useDockPeek()
  const [highlight, setHighlight] = useState<CardTextHighlight | null>(null)
  const rivalName = t('duel.bar.rival')

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
    if (now.some((points, seat) => points < before[seat]!)) playSfx('lpDown')
    else if (now.some((points, seat) => points > before[seat]!)) playSfx('lpUp')
  })
  useEffect(() => {
    const end = snap.status === 'ended' ? snap.overlay.end : null

    if (end) playSfx(end.winner === 2 ? 'turn' : end.winner === 0 ? 'win' : 'lose')
  }, [snap.status, snap.overlay.end])

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

      return known ?? byCode.get(at)?.name ?? snap.names[at] ?? t('practice.card.unknown')
    },
    [cardsById, byCode, codeOf, snap.names],
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
  const effectLabel = useCallback(
    (_code: number, description: string): string | null => {
      const desc = BigInt(description)

      return desc < 10000n ? null : snap.texts[Number(desc >> 4n)]?.[Number(desc & 15n)] || null
    },
    [snap.texts],
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
  /** Una pregunta sin gesto ni respuesta segura (anunciar una carta sin catálogo): la línea avisa y ofrece deshacer. */
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
  const shown = settled ? view : null
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

  // ── La línea del registro: lo que no frena (trabada, pensando, la cadena con «No responder», un error de script, la cadena que se resuelve), lo más urgente primero. ──
  const chain = snap.overlay.chain
  const linkName = (link: ChainLink) => nameOf(link.card, link.code)
  const respondNames = (ids: Iterable<string>) => namesList([...ids].map((id) => nameOf({ side: 'mine', id })))
  const newFault = snap.faults[snap.faults.length - 1]
  const lane: LaneNotice | null = stuck
    ? { kind: 'ask', text: t('auto.lane.error', { message: stuck }), actions: [{ label: t('practice.mat.undo'), onSelect: () => session.undo(), primary: true }] }
    : snap.status === 'thinking'
      ? { kind: 'thinking', onCancel: () => session.cancel() }
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
  const myTurn = shown?.type === 'select_idlecmd' || shown?.type === 'select_battlecmd'
  const turnMine = snap.overlay.turnPlayer === 0
  const undoable = snap.answers.some((item) => item.seat === 0 && (item.answer.type === 'select_idlecmd' || item.answer.type === 'select_battlecmd'))

  const cover = snap.fault ? (
    <FaultCover fault={snap.fault} nameOf={(code) => nameOf(null, code)} artOf={(code) => artOf(null, code)} onRetry={() => session.restart()} onExit={onExit} />
  ) : snap.status === 'ended' && snap.overlay.end ? (
    <EndCover end={snap.overlay.end} lp={snap.overlay.lp} rival={rivalName} onAgain={() => session.restart()} onExit={onExit} />
  ) : snap.status === 'loading' ? (
    <LoadingCover progress={snap.progress} />
  ) : undefined

  const link: DuelMatLink = {
    areas: DUEL_AREAS,
    areasCompact: DUEL_AREAS_COMPACT,
    opponent: <SideCells side={opponent} owner="theirs" />,
    sharedZone: (index) => sharedZoneCard(opponent, index),
    header: (
      <AutoBar
        rivalName={rivalName}
        life={{ mine: snap.overlay.lp[0], theirs: snap.overlay.lp[1] }}
        turn={snap.overlay.turn}
        myTurn={turnMine}
        phase={snap.overlay.turn > 0 ? state.phase : null}
        onExit={onExit}
        lane={lane}
        sounds={sounds}
        onSounds={setSoundsOn}
        chain={prefs.chain}
        onChain={(mode) => setAutoPref('chain', mode)}
        place={prefs.place}
        onPlace={(mode) => setAutoPref('place', mode)}
        onRestart={() => session.restart()}
        onManual={() => setAutoPref('duel', false)}
      />
    ),
    rivalHand: <TheirHand count={theirs.hand.length} />,
    attackTargets,
    foreignKnown,
    tools: null,
    // Las vidas de los dos van en la barra (`AutoBar`), no abajo.
    life: null,
    rivalTurnLabel: t('duel.bar.theirTurn', { name: rivalName }),
    phase: state.phase,
    myTurn,
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
    undoAvailable: undoable && snap.status !== 'thinking' && !snap.replaying,
    undoPending: snap.replaying,
    turnNumber: snap.overlay.turn,
    rivalEmz: theirs.emz.map(Boolean),
    ...(cover === undefined ? {} : { cover }),
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

  return (
    // Tocar la mesa mientras cuenta una tanda la salta al final.
    <div className="contents" onPointerDownCapture={settled ? undefined : skipAhead}>
      <PracticeMat session={matSession} state={state} cardsById={cardsById} deckName={deckName} onDispatch={sentinel} onUndo={() => session.undo()} onSeek={NOTHING} onLoadCombo={NOTHING} onNewHand={NOTHING} duel={link} />
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
    </div>
  )
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

/** La portada de carga: el progreso de las reglas y, detrás, la mesa ya repartida (sin brillo animado: el esqueleto quieto). */
function LoadingCover({ progress }: { progress: AutoSnapshot['progress'] }) {
  return (
    <div role="status" aria-busy="true" className="grid h-full place-items-center bg-background/85 p-6">
      <div className="grid w-full max-w-xs justify-items-center gap-3 text-center">
        <Callout tone="info">{progress.total === 0 ? t('auto.loading.start') : t('auto.loading.rules', progress)}</Callout>
        <Skeleton still className="h-40 w-full" />
        <p className="m-0 text-micro text-soft">{t('auto.rival.passive')}</p>
      </div>
    </div>
  )
}

/** Lo que no deja jugar: cartas sin reglas (con la lista, y «Jugar en modo manual»), o el núcleo que no arrancó o se cayó («Reintentar»). */
function FaultCover({ fault, nameOf, artOf, onRetry, onExit }: { fault: NonNullable<AutoSnapshot['fault']>; nameOf: (code: number) => string; artOf: (code: number) => string | null; onRetry: () => void; onExit: () => void }) {
  const rules = fault.kind === 'rules'
  const title = rules ? t('auto.fault.rules', { count: fault.cards.length }) : fault.kind === 'crash' ? t('auto.fault.crash') : t('auto.fault.setup')

  return (
    <div role="alertdialog" aria-modal="true" aria-label={title} className="relative grid h-full place-items-center overflow-y-auto bg-background/85 p-6">
      <CloseButton size="md" aria-label={t('duel.bar.leave')} title={t('duel.bar.leave')} className="absolute right-3 top-3" onClick={onExit} />
      <div className="grid w-full max-w-sm gap-3">
        <Callout tone="warning">{title}</Callout>
        <p className="m-0 text-body text-muted">{rules ? t('auto.fault.rulesText') : fault.message}</p>
        {rules ? (
          <ul className="m-0 grid max-h-60 list-none gap-1 overflow-y-auto p-0">
            {fault.cards.map((code) => (
              <li key={code} className="flex items-center gap-2 text-body text-foreground">
                <span aria-hidden="true" className="aspect-[421/614] w-7 shrink-0 overflow-hidden bg-input">
                  <CardArt remoteUrl={artOf(code)} name={nameOf(code)} className="block h-full w-full object-cover" />
                </span>
                <span className="min-w-0 truncate">{nameOf(code)}</span>
              </li>
            ))}
          </ul>
        ) : null}
        <div className="flex justify-end gap-2">
          <Button variant="tertiary" onClick={onExit}>
            {t('auto.fault.back')}
          </Button>
          {rules ? (
            <Button variant="primary" onClick={() => setAutoPref('duel', false)}>
              {t('auto.fault.manual')}
            </Button>
          ) : (
            <Button variant="primary" icon="refresh" onClick={onRetry}>
              {t('auto.fault.retry')}
            </Button>
          )}
        </div>
      </div>
    </div>
  )
}

/** El final: quién ganó y por qué, y «Jugar otra vez» (la misma semilla: el mismo duelo). */
function EndCover({ end, lp, rival, onAgain, onExit }: { end: { winner: number; reason: number }; lp: readonly [number, number]; rival: string; onAgain: () => void; onExit: () => void }) {
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
        <Button variant="primary" icon="refresh" onClick={onAgain}>
          {t('auto.end.again')}
        </Button>
      </div>
    </div>
  )
}
