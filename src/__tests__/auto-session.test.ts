import { OcgDuelMode } from 'ocgcore-wasm'
import { matReducer } from '../app/practice-mat'
import type { DataLoader } from '../app/auto/auto-data'
import { createAutoSession, MR5, type AutoSession, type AutoSnapshot, type TransportFactory } from '../app/auto/auto-session'
import type { MappedDeck } from '../app/auto/deck-map'
import type { AutoCommand, AutoEvent, CoreAnswer, CoreAsk, Seat } from '../app/auto/protocol'

const IDLE: CoreAsk = { type: 'select_idlecmd', player: 0, summons: [], special_summons: [], pos_changes: [], monster_sets: [], spell_sets: [], activates: [], to_bp: false, to_ep: true, shuffle: false }
const CHAIN: CoreAsk = { type: 'select_chain', player: 1, spe_count: 0, forced: false, hint_timing: 0, hint_timing_other: 0, selects: [] }
const END: CoreAnswer = { type: 'select_idlecmd', action: 7, index: null }

const mapped = (main: number[]): MappedDeck => ({ main, extra: [], missing: [], noRules: [] })
const loader = (mine = mapped([1, 1, 1, 1, 1])): DataLoader => ({
  manifest: async () => ({ version: 't', tokens: [], filler: [2, 2, 2, 2, 2] }),
  load: async () => ({ decks: [mine, mapped([2, 2, 2, 2, 2])], cards: [], scripts: {}, names: { 1: 'One' }, version: 't' }),
})

/**
 * Un anfitrión de mentira con las reglas del de verdad que la sesión usa: cada tanda empieza con `loading` 0, re-simular vuelve a mandar
 * todo desde cero, una respuesta vieja se descarta. La pregunta k es del asiento `seatOf(k)`; antes de cada una las vidas del asiento 0
 * bajan a 8000 - k (así la mesa dice cuántas respuestas lleva) y, en las tres primeras, el asiento 0 roba una carta (una jugada de la
 * mesa). `hold` deja colgada la próxima respuesta (el núcleo «pensando»).
 */
function fakeHost(seatOf: (k: number) => Seat = (k) => (k % 3 === 2 ? 1 : 0), react?: (command: AutoCommand, emit: (event: AutoEvent) => void) => boolean, firstCode = 1) {
  const commands: AutoCommand[] = []
  const state = { hold: false, transports: 0 }
  let askId = 0
  const factory: TransportFactory = (data) => {
    let listener: ((event: AutoEvent) => void) | null = null
    let alive = true
    let answers: CoreAnswer[] = []
    let pending: { askId: number; seat: Seat } | null = null
    const emit = (event: AutoEvent) => alive && listener?.(event)
    const ask = () => {
      const k = answers.length
      const seat = seatOf(k)

      pending = { askId: ++askId, seat }
      for (const viewer of [0, 1] as const) {
        emit({ t: 'events', seat: viewer, n: k, events: [{ type: 'lpupdate', player: 0, lp: 8000 - k }, ...(k < 3 ? [{ type: 'draw' as const, player: 0, drawn: [{ code: viewer === 0 ? firstCode : 0, position: 10 }] }] : [])] })
      }
      emit({ t: 'ask', seat, askId: pending.askId, ask: seat === 0 ? IDLE : CHAIN })
    }
    const run = (replay: readonly CoreAnswer[]) => {
      emit({ t: 'loading', done: 0, total: 1 })
      answers = []
      ask()
      for (const answer of replay) {
        answers.push(answer)
        ask()
      }
    }

    state.transports += 1
    return {
      send(command) {
        commands.push(command)
        void data.then(() => {
          if (!alive || react?.(command, emit)) return
          if (command.t === 'create') run(command.answers ?? [])
          if (command.t === 'rewind') run(answers.slice(0, command.to))
          if (command.t === 'answer' && pending?.askId === command.askId && !state.hold) {
            answers.push(command.answer)
            ask()
          }
        })
      },
      onEvent: (next) => void (listener = next),
      terminate: () => void (alive = false),
    }
  }

  return { factory, commands, state }
}

const tick = (ms = 0) => new Promise((resolve) => setTimeout(resolve, ms))
async function until(session: AutoSession, test: (snapshot: AutoSnapshot) => boolean) {
  for (let i = 0; i < 100 && !test(session.getSnapshot()); i += 1) await tick(5)
  expect(test(session.getSnapshot())).toBe(true)
  return session.getSnapshot()
}

describe('la sesión del duelo automático', () => {
  it('copia bien la regla MR5 del paquete', () => {
    expect(MR5).toBe(String(OcgDuelMode.MODE_MR5))
  })

  it('carga, pregunta, contesta y el rival pasivo contesta solo; las respuestas quedan en orden', async () => {
    const host = fakeHost()
    const session = createAutoSession({ loader: loader(), deck: { main: [[1, 5]] }, transport: host.factory, seed: 7, handSize: 6 })

    expect(session.getSnapshot().status).toBe('loading')
    await until(session, (s) => s.status === 'ready')
    // La mano de apertura del Lab es la mía; el rival roba 5.
    expect(host.commands[0]).toMatchObject({ t: 'create', seed: 7, flags: MR5, players: [{ lp: 8000, hand: 6, draw: 1 }, { lp: 8000, hand: 5, draw: 1 }], decks: [{ main: [1, 1, 1, 1, 1], hand: [] }, { main: [2, 2, 2, 2, 2] }] })
    expect(session.getSnapshot().names).toEqual({ 1: 'One' })

    expect(session.answer({ type: 'select_chain', index: null })).toBe(false)
    expect(session.answer(END)).toBe(true)
    expect(session.answer(END)).toBe(false)
    await until(session, (s) => s.ask !== null)
    session.answer(END)
    // La pregunta 2 es del rival: la contesta solo y la siguiente vuelve a ser mía.
    const after = await until(session, (s) => s.answers.length === 3 && s.ask !== null)

    expect(after.answers).toEqual([
      { seat: 0, answer: END },
      { seat: 0, answer: END },
      { seat: 1, answer: { type: 'select_chain', index: null } },
    ])
    expect(after.overlay.lp[0]).toBe(8000 - 3)
    expect(after.ask).toMatchObject({ seat: 0, ask: { type: 'select_idlecmd' } })
    // Las jugadas: desde la mesa del arranque, todas las de mi mesa dan la mesa de ahora (lo que la pantalla reproduce de a una).
    expect(after.mineActions.map((action) => action.type)).toEqual(['draw', 'draw', 'draw'])
    expect(after.mineActions.reduce(matReducer, after.initial.mine)).toEqual(after.mine)
    expect(after.mine.hand).toHaveLength(3)
    expect(after.theirsActs).toEqual([])
    expect(session.adapter?.idAt({ controller: 0, location: 2, sequence: 0 })).toBe('card-1-1')
    session.destroy()
  })

  it('va segundo con `seat: 1` (el rival pasivo juega el asiento 0) y con `control: both` pregunta los dos asientos', async () => {
    const host = fakeHost((k) => (k % 2) as Seat, undefined, 2)
    const second = createAutoSession({ loader: loader(), deck: { main: [[1, 5]] }, transport: host.factory, seat: 1 })
    const asked = await until(second, (s) => s.status === 'ready')

    expect(host.commands[0]).toMatchObject({ t: 'create', decks: [{ main: [2, 2, 2, 2, 2] }, { main: [1, 1, 1, 1, 1] }] })
    expect(asked.answers).toEqual([{ seat: 0, answer: END }])
    expect(asked.ask).toMatchObject({ seat: 1, ask: { type: 'select_chain' } })
    // Mi mesa es la del asiento 1: lo que roba el 0 lo veo en el espejo del rival.
    expect(asked.theirs.hand).toHaveLength(2)
    second.destroy()

    const both = createAutoSession({ loader: loader(), deck: { main: [[1, 5]] }, transport: fakeHost((k) => (k % 2) as Seat).factory, control: 'both' })

    expect((await until(both, (s) => s.status === 'ready')).ask?.seat).toBe(0)
    both.answer(END)
    expect((await until(both, (s) => s.ask?.seat === 1)).answers).toEqual([{ seat: 0, answer: END }])
    both.destroy()
  })

  it('dice que piensa si tarda y cancelar deja la respuesta en vuelo y re-simula en otro anfitrión', async () => {
    const host = fakeHost(() => 0)
    const session = createAutoSession({ loader: loader(), deck: { main: [[1, 5]] }, transport: host.factory, seed: 1, thinkingMs: 10 })

    await until(session, (s) => s.status === 'ready')
    session.answer(END)
    const before = await until(session, (s) => s.status === 'ready' && s.answers.length === 1)

    host.state.hold = true
    session.answer(END)
    await until(session, (s) => s.status === 'thinking')
    host.state.hold = false
    session.cancel()
    expect(session.getSnapshot().replaying).toBe(true)
    const back = await until(session, (s) => s.status === 'ready')

    expect(host.state.transports).toBe(2)
    expect(host.commands.at(-1)).toMatchObject({ t: 'create', answers: [END] })
    expect(back.answers).toEqual(before.answers)
    expect(back.overlay).toEqual(before.overlay)
    expect(back.replaying).toBe(false)
    session.destroy()
  })

  it('deshacer vuelve a antes de mi última jugada, re-simulando, con la misma mesa que había', async () => {
    const host = fakeHost()
    const session = createAutoSession({ loader: loader(), deck: { main: [[1, 5]] }, transport: host.factory, seed: 3 })

    await until(session, (s) => s.status === 'ready')
    session.answer(END)
    await until(session, (s) => s.answers.length === 1 && s.ask !== null)
    session.answer(END)
    // Mi pregunta 3 (después de la del rival): lo que tiene que volver al deshacer.
    const mark = await until(session, (s) => s.answers.length === 3 && s.ask !== null)

    session.answer(END)
    await until(session, (s) => s.answers.length === 4 && s.ask !== null)
    expect(session.undo()).toBe(true)
    expect(session.getSnapshot().replaying).toBe(true)
    const back = await until(session, (s) => s.ask !== null && !s.replaying)

    expect(host.commands.at(-1)).toEqual({ t: 'rewind', to: 3 })
    expect(back.answers).toEqual(mark.answers)
    expect(back.overlay).toEqual(mark.overlay)
    expect(back.mine).toEqual(mark.mine)
    // La mesa se rearmó: otro `initial` (la pantalla salta sin animar) con las mismas jugadas.
    expect(back.initial).not.toBe(mark.initial)
    expect(back.initial).toEqual(mark.initial)
    expect(back.mineActions).toEqual(mark.mineActions)
    // Una respuesta a la pregunta de antes del deshacer ya no vale: tiene otro askId.
    expect(back.ask!.askId).not.toBe(mark.ask!.askId)
    session.destroy()
  })

  it('reiniciar con la misma semilla arma el mismo duelo; con otra, otro', async () => {
    const host = fakeHost(() => 0)
    const session = createAutoSession({ loader: loader(), deck: { main: [[1, 5]] }, transport: host.factory, seed: 11 })

    await until(session, (s) => s.status === 'ready')
    session.answer(END)
    await until(session, (s) => s.answers.length === 1 && s.ask !== null)
    session.restart()
    await until(session, (s) => s.status === 'ready' && s.answers.length === 0)
    session.restart(12)
    await until(session, (s) => s.status === 'ready' && s.seed === 12)
    const creates = host.commands.filter((command) => command.t === 'create') as Extract<AutoCommand, { t: 'create' }>[]

    expect(creates.map((command) => command.seed)).toEqual([11, 11, 12])
    expect(creates[1]).toEqual(creates[0])
    session.destroy()
  })

  it('una carta sin reglas no deja arrancar: error con la lista y sin crear el duelo', async () => {
    const host = fakeHost()
    const session = createAutoSession({ loader: loader({ main: [1, 1], extra: [], missing: [999], noRules: [300] }), deck: { main: [[1, 2]] }, transport: host.factory })
    const failed = await until(session, (s) => s.status === 'error')

    expect(failed.fault).toMatchObject({ kind: 'rules', cards: [999, 300] })
    expect(host.commands).toEqual([])
  })

  it('los errores de un script se juntan sin cortar; tres RETRY seguidos del rival cortan la sesión', async () => {
    let retryId = 1000
    const host = fakeHost(
      (k) => (k === 0 ? 0 : 1),
      (command, emit) => {
        // Mi jugada dispara un error de Lua (el duelo sigue)…
        if (command.t === 'answer' && command.answer.type === 'select_idlecmd') emit({ t: 'fault', kind: 'script', message: 'lua: oops', cards: [1] })
        // …y el rival siempre contesta algo que el núcleo rechaza: RETRY y la misma pregunta.
        if (command.t !== 'answer' || command.answer.type !== 'select_chain') return false
        emit({ t: 'fault', kind: 'retry', message: 'RETRY' })
        emit({ t: 'ask', seat: 1, askId: (retryId += 1), ask: CHAIN })
        return true
      },
    )
    const session = createAutoSession({ loader: loader(), deck: { main: [[1, 5]] }, transport: host.factory })

    await until(session, (s) => s.status === 'ready')
    session.answer(END)
    const failed = await until(session, (s) => s.status === 'error')

    expect(failed.fault?.kind).toBe('retry')
    expect(failed.faults).toEqual([{ kind: 'script', message: 'lua: oops', cards: [1] }, ...Array(2).fill({ kind: 'retry', message: 'RETRY', cards: [] })])
    session.destroy()
  })
})
