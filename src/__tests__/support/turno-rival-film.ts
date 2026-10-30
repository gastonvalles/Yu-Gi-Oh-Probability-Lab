// El turno del rival grabado del núcleo real (`auto-turno-rival.slow.test.ts` lo graba en `turno-rival-film.json` y revisa que siga siendo el del núcleo): desde la mesa en que
// terminás tu turno hasta tu turno nuevo, cada mesa en que el núcleo esperó una respuesta tuya (`frames`: cuántas jugadas, cadenas, vidas y respuestas había, y la pregunta), con el
// lugar y el código de cada carta según el adaptador. Sólo códigos e ids (sin nombres ni textos del `.cdb`). `filmSession` la reproduce como una sesión: cada respuesta trae la mesa que sigue.
import type { Adapter, CardRef, CorePlace } from '../../app/auto/adapter'
import type { AutoSession, AutoSnapshot } from '../../app/auto/auto-session'
import { parseAnswer, type CoreAnswer, type Seat } from '../../app/auto/protocol'
import { allMatIds, replayMat } from '../../app/practice-mat'
import type { MatCard } from '../../components/probability/PracticeMat'
import { card } from './practice-mat-harness'

type Counts = [mine: number, theirs: number, order: number, chain: number, life: number, answers: number]

export interface RivalTurnFilm {
  seed: number
  initial: AutoSnapshot['initial']
  mineActions: AutoSnapshot['mineActions']
  theirsActs: AutoSnapshot['theirsActs']
  order: AutoSnapshot['order']
  chainSteps: AutoSnapshot['chainSteps']
  lifeSteps: AutoSnapshot['lifeSteps']
  answers: AutoSnapshot['answers']
  frames: { counts: Counts; overlay: AutoSnapshot['overlay']; ask: AutoSnapshot['ask']; rivalHand: AutoSnapshot['rivalHand'] }[]
  places: [CardRef['side'], string, number, CorePlace | null][]
}

/** Lo que se graba de una sesión: desde `from` (tu última mesa del turno) hasta `to`. */
export function filmOf(history: readonly AutoSnapshot[], adapter: Adapter): RivalTurnFilm {
  const last = history.at(-1)!
  const ids = (side: CardRef['side']) => [...new Set([...allMatIds(last.initial[side]), ...allMatIds(last[side])])]

  return {
    seed: last.seed,
    initial: last.initial,
    mineActions: last.mineActions,
    theirsActs: last.theirsActs,
    order: last.order,
    chainSteps: last.chainSteps,
    lifeSteps: last.lifeSteps,
    answers: last.answers,
    frames: history.map((snap) => ({ counts: [snap.mineActions.length, snap.theirsActs.length, snap.order.length, snap.chainSteps.length, snap.lifeSteps.length, snap.answers.length], overlay: snap.overlay, ask: snap.ask, rivalHand: snap.rivalHand })),
    places: (['mine', 'theirs'] as const).flatMap((side) => ids(side).map((id): RivalTurnFilm['places'][number] => [side, id, adapter.codeOf({ side, id }), adapter.locationOf({ side, id })])),
  }
}

/** Tus cartas de la grabación, con un nombre por código («#40640057»): la mesa las dibuja y los menús las nombran. */
export const filmCards = (film: RivalTurnFilm): ReadonlyMap<string, MatCard> =>
  new Map(film.places.filter(([side]) => side === 'mine').map(([, id, code]) => [id, { name: `#${code}`, apiCard: card(code, 'effect') }]))

/** La sesión que reproduce la grabación: arranca en la primera mesa y cada respuesta aceptada trae la siguiente (con la misma mesa del arranque: no se rearma). */
export function filmSession(film: RivalTurnFilm): AutoSession & { answers: CoreAnswer[]; frame: () => number } {
  let at = 0
  const listeners = new Set<() => void>()
  const snapAt = (index: number): AutoSnapshot => {
    const { counts, overlay, ask, rivalHand } = film.frames[index]!
    const [mine, theirs, order, chain, life, answers] = counts
    const mineActions = film.mineActions.slice(0, mine)
    const theirsActs = film.theirsActs.slice(0, theirs)

    return {
      status: 'ready',
      seed: film.seed,
      initial: film.initial,
      mineActions,
      theirsActs,
      order: film.order.slice(0, order),
      chainSteps: film.chainSteps.slice(0, chain),
      lifeSteps: film.lifeSteps.slice(0, life),
      mine: replayMat(film.initial.mine, mineActions),
      theirs: replayMat(film.initial.theirs, theirsActs.map((wire) => wire.action)),
      overlay,
      ask,
      remoteAsk: null,
      fault: null,
      faults: [],
      answers: film.answers.slice(0, answers),
      progress: { done: 1, total: 1 },
      replaying: false,
      // Sin los nombres del `.cdb`: cada carta se llama por su código («#12580477»).
      names: Object.fromEntries(film.places.map(([, , code]) => [code, `#${code}`])),
      vanilla: [],
      texts: {},
      unmapped: [],
      rivalHand,
      playStarts: [],
    }
  }
  let snapshot = snapAt(0)
  const placeOf = (ref: CardRef) => film.places.find(([side, id]) => side === ref.side && id === ref.id)
  const adapter = {
    get initial() {
      return film.initial
    },
    get mine() {
      return snapshot.mine
    },
    get overlay() {
      return snapshot.overlay
    },
    idAt: (place: CorePlace) => film.places.find(([side, , , where]) => where && side === (place.controller === 0 ? 'mine' : 'theirs') && where.location === place.location && where.sequence === place.sequence)?.[1] ?? null,
    locationOf: (ref: CardRef) => placeOf(ref)?.[3] ?? null,
    codeOf: (ref: CardRef) => placeOf(ref)?.[2] ?? 0,
  } as unknown as Adapter
  const session = {
    answers: [] as CoreAnswer[],
    frame: () => at,
    getSnapshot: () => snapshot,
    subscribe(listener: () => void) {
      listeners.add(listener)

      return () => listeners.delete(listener)
    },
    adapter,
    answer(answer: CoreAnswer) {
      const parsed = parseAnswer(answer)

      if (!parsed || !snapshot.ask || parsed.type !== snapshot.ask.ask.type || at + 1 >= film.frames.length) return false
      session.answers.push(parsed)
      at += 1
      snapshot = snapAt(at)
      listeners.forEach((listener) => listener())

      return true
    },
    undo: () => false,
    cancel: () => {},
    restart: () => {},
    destroy: () => listeners.clear(),
    answerRemote: () => false,
    expectReplay: () => {},
    viewOf: (seat: Seat) => (seat === 0 ? { mine: snapshot.mine, theirs: snapshot.theirs, overlay: snapshot.overlay } : null),
  }

  return session as unknown as AutoSession & { answers: CoreAnswer[]; frame: () => number }
}
