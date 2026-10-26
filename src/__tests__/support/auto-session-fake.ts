// La sesión de mentira del duelo automático para las pruebas de pantalla: cumple el contrato de `AutoSession` (`getSnapshot` / `subscribe` / `answer` / `undo` / `cancel` /
// `restart` / `destroy` y el `adapter` con `idAt` / `locationOf` / `codeOf`) sobre una mesa chica armada a mano, y deja que la prueba empuje lo que haría el núcleo:
// una pregunta (`ask`), una tanda de jugadas (`events`), el núcleo pensando (`thinking`), un rearme (`rearm`), un error (`fault`) o el fin (`end`). Cada respuesta que la pantalla
// manda se revisa con `parseAnswer` y queda en `answers`.
import type { Adapter, CardRef, CorePlace, Side } from '../../app/auto/adapter'
import type { AutoSession, AutoSnapshot, SessionFault } from '../../app/auto/auto-session'
import { LOCATION as L, parseAnswer, type CoreAnswer, type CoreAsk, type Seat } from '../../app/auto/protocol'
import { createMatState, type MatAction, type MatPile, type MatPos, type MatState } from '../../app/practice-mat'
import type { MatCard } from '../../components/probability/PracticeMat'
import { card } from './practice-mat-harness'

/** Una carta de la mesa falsa: de qué lado, dónde la tiene el núcleo y (en el campo) en qué posición. */
export interface Spot {
  side: Side
  id: string
  code: number
  location: number
  sequence: number
  pos?: MatPos
}

const PILE: Partial<Record<number, MatPile>> = { [L.DECK]: 'deck', [L.HAND]: 'hand', [L.GRAVE]: 'gy', [L.REMOVED]: 'banished', [L.EXTRA]: 'extra' }

/** Mi mano: 100 (monstruo), 900 (Mágica); mi campo: 200 en ataque (mz 0); mi cementerio: 400; mi Extra: 500; mi deck: 101 y 102. El rival: 700 en su mz 0. */
export const SPOTS: Spot[] = [
  { side: 'mine', id: 'card-100-1', code: 100, location: L.HAND, sequence: 0 },
  { side: 'mine', id: 'card-900-1', code: 900, location: L.HAND, sequence: 1 },
  { side: 'mine', id: 'card-200-1', code: 200, location: L.MZONE, sequence: 0, pos: 'atk' },
  { side: 'mine', id: 'card-400-1', code: 400, location: L.GRAVE, sequence: 0 },
  { side: 'mine', id: 'card-500-1', code: 500, location: L.EXTRA, sequence: 0 },
  { side: 'mine', id: 'card-101-1', code: 101, location: L.DECK, sequence: 1 },
  { side: 'mine', id: 'card-102-1', code: 102, location: L.DECK, sequence: 0 },
  { side: 'theirs', id: 'c1', code: 700, location: L.MZONE, sequence: 0, pos: 'atk' },
]

export const CARDS: ReadonlyMap<string, MatCard> = new Map([
  ['card-100-1', { name: 'Ash Blossom', apiCard: card(100, 'effect') }],
  ['card-900-1', { name: 'Called by the Grave', apiCard: card(900, 'spell') }],
  ['card-200-1', { name: 'Maxx C', apiCard: card(200, 'effect') }],
  ['card-400-1', { name: 'Nibiru', apiCard: card(400, 'effect') }],
  ['card-500-1', { name: 'Zeus', apiCard: card(500, 'xyz') }],
  ['card-101-1', { name: 'Droll', apiCard: card(101, 'effect') }],
  ['card-102-1', { name: 'Imperm', apiCard: card(102, 'trap') }],
])

export const loc = (code: number, location: number, sequence: number, controller: Seat = 0) => ({ code, controller, location, sequence })
export const pos = (code: number, location: number, sequence: number, position: number, controller: Seat = 0) => ({ ...loc(code, location, sequence, controller), position })
export const act = (code: number, location: number, sequence: number, description = '0') => ({ ...loc(code, location, sequence), description, client_mode: 0 })
/** El `desc` de un texto de una carta, como lo arma `aux.Stringid(code, n)` en los scripts. */
export const stringId = (code: number, n: number) => String((BigInt(code) << 20n) | BigInt(n))

/** Las dos mesas a partir de los lugares. */
function statesOf(cards: readonly Spot[]): Record<Side, MatState> {
  const states: Record<Side, MatState> = { mine: createMatState([], [], 0), theirs: createMatState([], [], 0) }

  for (const spot of cards) {
    const state = states[spot.side]
    const placed = { id: spot.id, pos: spot.pos ?? 'atk', counters: 0, materials: [] }

    if (spot.location === L.MZONE) (spot.sequence < 5 ? state.mz : state.emz)[spot.sequence % 5] = placed
    else if (spot.location === L.SZONE) {
      if (spot.sequence < 5) state.st[spot.sequence] = placed
      else state.field = placed
    } else state[PILE[spot.location]!].push(spot.id)
  }
  // El deck va tope primero: la secuencia más alta del núcleo es la de arriba.
  states.mine.deck.sort((a, b) => cards.find((spot) => spot.id === b)!.sequence - cards.find((spot) => spot.id === a)!.sequence)
  states.mine.turn = 1
  states.mine.phase = 'main1'

  return states
}

export interface FakeSession extends AutoSession {
  /** Las respuestas que mandó la pantalla, en orden (ya revisadas con `parseAnswer`). */
  answers: CoreAnswer[]
  undos: number
  cancels: number
  restarts: number
  destroyed: boolean
  /** El duelo por enlace: las respuestas del asiento remoto que se aceptaron, las re-emisiones pedidas (`expectReplay`) y las re-simulaciones. */
  remoteAnswers: { askId: number; answer: CoreAnswer }[]
  replays: number[]
  resimulations: number
  /** Lo que haría el núcleo: cada una avisa a quien escucha. */
  ask(ask: CoreAsk, title?: string): void
  /** Elige el otro asiento (una persona): `waiting` y, si se pasa, su pregunta como `remoteAsk` (la del anfitrión). */
  waiting(ask?: CoreAsk | null): void
  events(actions: MatAction[]): void
  thinking(): void
  /** Re-simular: otra mesa del arranque (igual) con estas jugadas y, al final, esta pregunta; avisa una sola vez. */
  rearm(actions: MatAction[], ask: CoreAsk | null): void
  fault(fault: SessionFault, fatal?: boolean): void
  end(winner: number, reason?: number): void
  set(patch: Partial<AutoSnapshot>): void
}

export function fakeSession(cards: readonly Spot[] = SPOTS): FakeSession {
  const states = statesOf(cards)
  const listeners = new Set<() => void>()
  const sideOf = (controller: Seat): Side => (controller === 0 ? 'mine' : 'theirs')
  const overlay: Adapter['overlay'] = { stats: { mine: {}, theirs: {} }, chain: [], negated: [], lp: [8000, 8000], turn: 1, turnPlayer: 0, phase: 4, equips: [], disabled: 0, end: null, limits: [[], []], normal: [null, null] }
  const adapter: Adapter = {
    initial: { mine: states.mine, theirs: states.theirs },
    mine: states.mine,
    theirs: { initial: states.theirs, acts: [], state: states.theirs, known: {} },
    overlay,
    apply: () => ({ mine: [], theirs: [], overlay, unmapped: [], chain: [] }),
    idAt: (place: CorePlace) => cards.find((spot) => spot.side === sideOf(place.controller) && spot.location === place.location && spot.sequence === place.sequence)?.id ?? null,
    locationOf: (ref: CardRef) => {
      const spot = cards.find((entry) => entry.side === ref.side && entry.id === ref.id)

      return spot ? { controller: (spot.side === 'mine' ? 0 : 1) as Seat, location: spot.location, sequence: spot.sequence } : null
    },
    codeOf: (ref: CardRef) => cards.find((spot) => spot.side === ref.side && spot.id === ref.id)?.code ?? 0,
  }
  let snapshot: AutoSnapshot = {
    status: 'ready',
    seed: 1,
    initial: adapter.initial,
    mineActions: [],
    theirsActs: [],
    chainSteps: [],
    mine: states.mine,
    theirs: states.theirs,
    overlay: adapter.overlay,
    ask: null,
    remoteAsk: null,
    fault: null,
    faults: [],
    answers: [],
    progress: { done: 1, total: 1 },
    replaying: false,
    names: { 700: 'Blue-Eyes White Dragon', 100: 'Ash Blossom', 400: 'Nibiru' },
    // Los rótulos del `.cdb` por código (el `desc` de un efecto es `stringId(código, n)`; con carta 0, un texto del sistema): los de Nibiru, `stringId(400, 1)` y `stringId(400, 2)`.
    texts: { 400: ['', 'Summon a Token', 'Destroy a monster'] },
    unmapped: [],
    rivalHand: [],
    playStarts: [],
  }
  let askId = 0
  const set = (patch: Partial<AutoSnapshot>) => {
    snapshot = { ...snapshot, ...patch }
    listeners.forEach((listener) => listener())
  }

  const fake: FakeSession = {
    answers: [],
    undos: 0,
    cancels: 0,
    restarts: 0,
    destroyed: false,
    getSnapshot: () => snapshot,
    subscribe(listener) {
      listeners.add(listener)

      return () => listeners.delete(listener)
    },
    adapter,
    answer(answer) {
      const parsed = parseAnswer(answer)

      if (!parsed || !snapshot.ask || parsed.type !== snapshot.ask.ask.type) return false
      fake.answers.push(parsed)
      set({ ask: null, answers: [...snapshot.answers, { seat: 0, answer: parsed }] })

      return true
    },
    undo() {
      fake.undos += 1
      set({ ask: null, replaying: true })

      return true
    },
    cancel() {
      fake.cancels += 1
      set({ ask: null, replaying: true, status: 'thinking', fault: null })
    },
    restart() {
      fake.restarts += 1
      set({ status: 'loading', ask: null, fault: null, faults: [], answers: [], replaying: true })
    },
    remoteAnswers: [],
    replays: [],
    resimulations: 0,
    answerRemote(askId, answer) {
      const pending = snapshot.remoteAsk

      if (!pending || askId !== pending.askId || answer.type !== pending.ask.type) return false
      fake.remoteAnswers.push({ askId, answer })
      set({ remoteAsk: null })

      return true
    },
    expectReplay(skip) {
      fake.replays.push(skip)
      set({ ask: null, replaying: true })
    },
    resimulate() {
      fake.resimulations += 1
      set({ ask: null, remoteAsk: null, replaying: true })
    },
    viewOf: (seat) => (seat === 0 ? { mine: snapshot.mine, theirs: snapshot.theirs, overlay: snapshot.overlay } : null),
    destroy() {
      fake.destroyed = true
      listeners.clear()
    },
    ask: (ask, title) => set({ status: 'ready', ask: { askId: (askId += 1), seat: 0, ask, ...(title === undefined ? {} : { title }) }, replaying: false }),
    waiting: (ask = null) => set({ status: 'waiting', ask: null, remoteAsk: ask ? { askId: (askId += 1), seat: 1, ask } : null, replaying: false }),
    events: (actions) => set({ mineActions: [...snapshot.mineActions, ...actions] }),
    thinking: () => set({ status: 'thinking', ask: null }),
    rearm: (actions, ask) => set({ initial: { mine: { ...states.mine }, theirs: { ...states.theirs } }, mineActions: actions, status: 'ready', replaying: false, ask: ask ? { askId: (askId += 1), seat: 0, ask } : null }),
    fault: (fault, fatal = true) => set(fatal ? { status: 'error', fault, ask: null, replaying: false } : { faults: [...snapshot.faults, fault] }),
    end: (winner, reason = 0) => set({ status: 'ended', ask: null, replaying: false, overlay: { ...snapshot.overlay, end: { winner, reason } } }),
    set,
  }

  return fake
}
