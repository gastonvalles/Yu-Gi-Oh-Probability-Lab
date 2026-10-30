import { OcgDuelMode } from 'ocgcore-wasm'
import { matReducer } from '../app/practice-mat'
import { DEFAULT_RIVAL_EXTRA } from '../app/handtraps'
import { DATA_UNAVAILABLE, DataUnavailableError, type DataLoader } from '../app/auto/auto-data'
import { activatedCode, createAutoSession, MR5, workerTransport, type AutoSession, type AutoSnapshot, type SessionOptions, type TransportFactory } from '../app/auto/auto-session'
import { LOCATION as L, type AskOf, type AutoCommand, type AutoEvent, type CoreAsk, type Seat } from '../app/auto/protocol'
import { CHAIN, END, fakeHost, IDLE, loader, mapped, PASS } from './support/auto-core-fake'

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
    const later = await until(session, (s) => s.answers.length === 4 && s.ask !== null)

    // Cada pregunta de jugada mía marca dónde empieza (la viva, la última); recortar ahí es lo mismo que deshacer («Seguir en manual» no le pide nada al núcleo).
    expect(mark.playStarts.at(-1)).toBe(mark.mineActions.length)
    expect(later.playStarts).toContain(mark.mineActions.length)
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
    expect(back.mineActions).toEqual(later.mineActions.slice(0, mark.mineActions.length))
    // Re-simulando, las marcas se rearman con la mesa: las mismas que había.
    expect(back.playStarts).toEqual(mark.playStarts)
    // Una respuesta a la pregunta de antes del deshacer ya no vale: tiene otro askId.
    expect(back.ask!.askId).not.toBe(mark.ask!.askId)
    session.destroy()
  })

  it('deshacer vuelve a antes de mi respuesta en una cadena (una activación elegida), no a mi última jugada; la obligatoria no cuenta', async () => {
    // Todo es mío: la pregunta 1 es una cadena con una carta (obligatoria según `forced`), las demás, mis jugadas.
    const run = async (forced: boolean) => {
      const respond: CoreAsk = { ...(CHAIN as AskOf<'select_chain'>), player: 0, forced, selects: [{ code: 1, controller: 0, location: L.HAND, sequence: 0, position: 10, description: '0', client_mode: 0 }] }
      const host = fakeHost(() => 0, undefined, 1, (k) => (k === 1 ? respond : IDLE))
      const session = createAutoSession({ loader: loader(), deck: { main: [[1, 5]] }, transport: host.factory, seed: 3 })

      await until(session, (s) => s.status === 'ready')
      session.answer(END)
      await until(session, (s) => s.ask?.ask.type === 'select_chain')
      session.answer({ type: 'select_chain', index: 0 })
      const after = await until(session, (s) => s.answers.length === 2 && s.ask !== null)

      expect(after.answers[1]).toEqual({ seat: 0, answer: { type: 'select_chain', index: 0 }, ...(forced ? {} : { activation: true }) })
      expect(session.undo()).toBe(true)
      await until(session, (s) => s.ask !== null && !s.replaying)
      session.destroy()
      return host.commands.at(-1)
    }

    expect(await run(false)).toEqual({ t: 'rewind', to: 1 })
    expect(await run(true)).toEqual({ t: 'rewind', to: 0 })
  })

  it('activatedCode: la carta que se activa o se invoca de forma especial; ni pasar, ni una fase, ni una obligatoria', () => {
    const card = { code: 9, controller: 0 as const, location: L.HAND, sequence: 0 }
    const chain = CHAIN as AskOf<'select_chain'>
    const idle: CoreAsk = { ...(IDLE as AskOf<'select_idlecmd'>), activates: [{ ...card, description: '0', client_mode: 0 }], special_summons: [{ ...card, code: 8 }], summons: [{ ...card, code: 7 }] }

    expect(activatedCode(idle, { type: 'select_idlecmd', action: 5, index: 0 })).toBe(9)
    expect(activatedCode(idle, { type: 'select_idlecmd', action: 1, index: 0 })).toBe(8)
    expect(activatedCode(idle, { type: 'select_idlecmd', action: 0, index: 0 })).toBeNull()
    expect(activatedCode(idle, END)).toBeNull()
    expect(activatedCode({ ...chain, selects: [{ ...card, position: 10, description: '0', client_mode: 0 }] }, { type: 'select_chain', index: 0 })).toBe(9)
    expect(activatedCode({ ...chain, forced: true, selects: [{ ...card, position: 10, description: '0', client_mode: 0 }] }, { type: 'select_chain', index: 0 })).toBeNull()
    expect(activatedCode(CHAIN, PASS)).toBeNull()
    expect(activatedCode({ type: 'select_effectyn', player: 0, ...card, position: 10, description: '0' }, { type: 'select_effectyn', yes: true })).toBe(9)
    expect(activatedCode({ type: 'select_effectyn', player: 0, ...card, position: 10, description: '0' }, { type: 'select_effectyn', yes: false })).toBeNull()
  })

  it('deshacer en carrera: lo que queda de la tanda vieja (la pregunta del rival) no se contesta ni suma una respuesta, también con dos seguidos', async () => {
    const host = fakeHost()
    const session = createAutoSession({ loader: loader(), deck: { main: [[1, 5]] }, transport: host.factory, seed: 3 })
    const sentAnswers = () => host.commands.filter((command) => command.t === 'answer').length

    await until(session, (s) => s.status === 'ready')
    session.answer(END)
    const mark = await until(session, (s) => s.answers.length === 1 && s.ask !== null)

    // Mi jugada y deshacer antes de que el anfitrión la lea: la tanda vieja trae la pregunta del rival (la 2) antes del `loading` del rewind.
    session.answer(END)
    expect(session.undo()).toBe(true)
    const back = await until(session, (s) => s.ask !== null && !s.replaying)

    expect(back.answers).toEqual(mark.answers)
    expect(back.overlay).toEqual(mark.overlay)
    expect(sentAnswers()).toBe(2)

    // Dos seguidos (dos tandas pedidas): sólo cuenta la última, y vuelve a contestarse.
    session.answer(END)
    expect(session.undo()).toBe(true)
    expect(session.undo()).toBe(true)
    const first = await until(session, (s) => s.ask !== null && !s.replaying && s.answers.length === 0)

    expect(first.overlay.lp[0]).toBe(8000)
    expect(sentAnswers()).toBe(3)
    expect(session.answer(END)).toBe(true)
    expect((await until(session, (s) => s.answers.length === 1 && s.ask !== null)).answers).toEqual([{ seat: 0, answer: END }])
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

  it('con handtraps: el deck del rival son esas cartas y el relleno hasta su tamaño (con su Extra Deck), roba su mano de la semilla y otra semilla le reparte otra', async () => {
    const host = fakeHost()
    const lists: number[][][] = []
    const extras: unknown[] = []
    // Este cargador arma cada deck con lo que se le pide (el de arriba devuelve siempre los mismos).
    const asked: DataLoader = {
      manifest: async () => ({ version: 't', tokens: [], filler: [2, 2, 2, 2, 2] }),
      load: async (decks) => {
        lists.push(decks.map((deck) => deck.main.flatMap(([code, copies]) => Array<number>(copies).fill(code))))
        extras.push(decks.map((deck) => deck.extra))
        return { decks: lists.at(-1)!.map(mapped), cards: [], scripts: {}, names: {}, version: 't' }
      },
    }
    const hand = (seed: number) => (seed % 2 === 0 ? [7] : [8, 7])
    const session = createAutoSession({ loader: asked, deck: { main: [[1, 5]] }, transport: host.factory, seed: 7, rival: { main: [[7, 1], [8, 2]], hand } })

    await until(session, (s) => s.status === 'ready')
    expect(lists).toEqual([[[1, 1, 1, 1, 1], [7, 8, 8, 2, 2]]])
    expect(extras).toEqual([[undefined, DEFAULT_RIVAL_EXTRA.map((card) => [card.id, 1])]])
    expect(host.commands[0]).toMatchObject({ seed: 7, players: [{ hand: 5 }, { lp: 8000, hand: 2, draw: 1 }], decks: [{ hand: [] }, { main: [7, 8, 8, 2, 2], hand: [8, 7] }] })
    // La pregunta del rival (una cadena sin nada que activar) la contesta solo, como antes.
    session.answer(END)
    await until(session, (s) => s.ask !== null && s.answers.length === 1)
    session.answer(END)
    expect((await until(session, (s) => s.answers.length === 3 && s.ask !== null)).answers[2]).toEqual({ seat: 1, answer: { type: 'select_chain', index: null } })

    session.restart(12)
    await until(session, (s) => s.status === 'ready' && s.seed === 12)
    expect(host.commands.at(-1)).toMatchObject({ t: 'create', seed: 12, players: [{ hand: 5 }, { hand: 1 }], decks: [{ hand: [] }, { hand: [7] }] })
    session.destroy()
  })

  it('sin los datos en el despliegue, el error lleva el código del servidor, tal cual; otro fallo de la bajada lleva el contexto, y los dos van a la consola', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const failing = (error: Error): DataLoader => ({ manifest: async () => Promise.reject(error), load: async () => Promise.reject(error) })
    const host = fakeHost()
    const session = createAutoSession({ loader: failing(new DataUnavailableError(DATA_UNAVAILABLE)), deck: { main: [[1, 5]] }, transport: host.factory })
    const other = createAutoSession({ loader: failing(new TypeError('Failed to fetch')), deck: { main: [[1, 5]] }, transport: host.factory })

    expect((await until(session, (s) => s.status === 'error')).fault).toEqual({ kind: 'setup', message: DATA_UNAVAILABLE, cards: [] })
    expect((await until(other, (s) => s.status === 'error')).fault?.message).toBe('could not load the duel data: Failed to fetch')
    expect(host.commands).toEqual([])
    expect(warn).toHaveBeenCalledWith('[auto] setup: could not load the duel data: Failed to fetch')
    warn.mockRestore()
    session.destroy()
    other.destroy()
  })

  it('si los datos no llegaron, reintentar los vuelve a pedir y el duelo arranca', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const host = fakeHost()
    const ok = loader()
    let failures = 1
    const flaky: DataLoader = { manifest: ok.manifest, load: async (decks, onProgress) => (failures-- > 0 ? Promise.reject(new TypeError('Failed to fetch')) : ok.load(decks, onProgress)) }
    const session = createAutoSession({ loader: flaky, deck: { main: [[1, 5]] }, transport: host.factory, seed: 5 })

    await until(session, (s) => s.status === 'error')
    session.restart()
    expect(session.getSnapshot()).toMatchObject({ status: 'loading', fault: null })
    const ready = await until(session, (s) => s.status === 'ready')

    expect(ready.seed).toBe(5)
    expect(host.commands).toMatchObject([{ t: 'create', seed: 5 }])
    warn.mockRestore()
    session.destroy()
  })

  it('una carta sin reglas no frena el duelo (como en Dueling Nexus): arranca igual y la sesión dice cuáles son tuyas', async () => {
    const host = fakeHost()
    const session = createAutoSession({ loader: loader({ main: [1, 1], extra: [], missing: [999], noRules: [300] }), deck: { main: [[1, 2]] }, transport: host.factory })
    const ready = await until(session, (s) => s.status === 'ready')

    expect(ready.fault).toBeNull()
    expect(ready.vanilla).toEqual([300, 999])
    expect(host.commands).toMatchObject([{ t: 'create' }])
    session.destroy()
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

    // Trabado, deshacer arma otro anfitrión y vuelve a antes de mi jugada (sin empezar de cero la sesión).
    expect(session.undo()).toBe(true)
    expect(session.getSnapshot()).toMatchObject({ status: 'thinking', fault: null, replaying: true, answers: [] })
    const back = await until(session, (s) => s.status === 'ready' && !s.replaying)

    expect(host.state.transports).toBe(2)
    expect(host.commands.at(-1)).toEqual(host.commands[0])
    expect(back.ask).toMatchObject({ seat: 0, ask: IDLE })
    session.destroy()
  })

  it('el núcleo rechaza la respuesta del rival: la repregunta va con otra (legal y la misma con la misma semilla) y el duelo sigue; sin otra, tres rechazos cortan', async () => {
    /** Tras mi jugada, el rival declara una carta; el núcleo rechaza la 11 (y, con `strict`, todas) y, aceptada otra, vuelve a mí. */
    const duel = async (cards: number[], strict = false) => {
      let id = 2000
      const ask = (emit: (event: AutoEvent) => void) => emit({ t: 'ask', seat: 1, askId: (id += 1), ask: { type: 'announce_card', player: 1, opcodes: ['1073741840'], cards } })
      const host = fakeHost(
        () => 0,
        (command, emit) => {
          if (command.t !== 'answer') return false
          if (command.answer.type === 'select_idlecmd') ask(emit)
          else if (command.answer.type === 'announce_card' && (strict || command.answer.code === 11)) {
            emit({ t: 'fault', kind: 'retry', message: 'RETRY' })
            ask(emit)
          } else emit({ t: 'ask', seat: 0, askId: (id += 1), ask: IDLE })
          return true
        },
      )
      const session = createAutoSession({ loader: loader(), deck: { main: [[1, 5]] }, transport: host.factory, seed: 5 })

      await until(session, (s) => s.status === 'ready')
      session.answer(END)
      const done = await until(session, (s) => s.status === 'error' || (s.status === 'ready' && s.answers.length === 2))

      session.destroy()
      return { done, sent: host.commands.flatMap((command) => (command.t === 'answer' && command.answer.type === 'announce_card' ? [command.answer.code] : [])) }
    }

    const first = await duel([11, 22, 33])

    // El pasivo declara la primera (11, rechazada); la de reserva, otra de las ofrecidas.
    expect(first.sent[0]).toBe(11)
    expect(first.sent).toHaveLength(2)
    expect([22, 33]).toContain(first.sent[1])
    expect(first.done.answers).toEqual([{ seat: 0, answer: END }, { seat: 1, answer: { type: 'announce_card', code: first.sent[1] } }])
    expect(first.done.faults).toEqual([{ kind: 'retry', message: 'RETRY', cards: [] }])
    expect((await duel([11, 22, 33])).sent).toEqual(first.sent)
    // Sin otra que ofrecer (o rechazadas todas), tres rechazos seguidos cortan igual.
    expect((await duel([11])).done.fault?.kind).toBe('retry')
    expect((await duel([11, 22, 33], true)).done.fault?.kind).toBe('retry')
  })

  it('el núcleo caído antes de una jugada tuya no tiene a dónde volver: deshacer no hace nada', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const host = fakeHost(() => 0, (command, emit) => (command.t === 'create' && (emit({ t: 'fault', kind: 'crash', message: 'worker error' }), true)))
    const session = createAutoSession({ loader: loader(), deck: { main: [[1, 5]] }, transport: host.factory })

    expect((await until(session, (s) => s.status === 'error')).fault?.kind).toBe('crash')
    expect(session.undo()).toBe(false)
    expect(host.state.transports).toBe(1)
    warn.mockRestore()
    session.destroy()
  })

  it('un evento del Worker que no se lee corta el duelo (crash) en vez de tirarse callado y dejarlo «pensando»', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})

    // Un Worker que, al crear, manda una tanda con un evento de otra forma.
    vi.stubGlobal(
      'Worker',
      class {
        onmessage: ((message: { data: unknown }) => void) | null = null
        postMessage(command: { t: string }) {
          if (command.t === 'create') setTimeout(() => this.onmessage?.({ data: { t: 'events', seat: 0, n: 0, events: [{ type: 'new_phase', phase: 'uno' }] } }))
        }
        terminate() {}
      },
    )
    const session = createAutoSession({ loader: loader(), deck: { main: [[1, 5]] }, transport: workerTransport() })

    expect((await until(session, (s) => s.status === 'error')).fault).toEqual({ kind: 'crash', message: 'unreadable event from the core worker', cards: [] })
    session.destroy()
    vi.unstubAllGlobals()
    warn.mockRestore()
  })
})

/** Un anfitrión del núcleo que no hace nada solo: la prueba le pone los eventos (como el enlace del invitado, que los recibe por la red). */
function manualHost() {
  let listener: ((event: AutoEvent) => void) | null = null
  const sent: AutoCommand[] = []
  const factory: TransportFactory = () => ({ send: (command) => void sent.push(command), onEvent: (next) => void (listener = next), terminate: () => {} })

  return { factory, sent, emit: (event: AutoEvent) => listener?.(event) }
}

describe('la sesión del duelo por enlace', () => {
  it('con un asiento remoto: su deck va entero, los dos roban la mano de la sala, su pregunta espera a la persona y sólo vale la respuesta a la pendiente', async () => {
    const host = fakeHost()
    const lists: number[][] = []
    const recording: DataLoader = { ...loader(), load: async (decks) => (lists.push(...decks.map((deck) => deck.main.map(([code]) => code))), loader().load(decks)) }
    const session = createAutoSession({ loader: recording, deck: { main: [[1, 5]] }, transport: host.factory, seed: 7, handSize: 6, remote: { deck: { main: [[3, 5]] } } })

    await until(session, (s) => s.status === 'ready')
    // Sin relleno: el deck del otro tal cual; y la mano de la sala para los dos.
    expect(lists).toEqual([[1], [3]])
    expect(host.commands[0]).toMatchObject({ t: 'create', players: [{ hand: 6 }, { hand: 6 }] })
    session.answer(END)
    await until(session, (s) => s.answers.length === 1 && s.ask !== null)
    session.answer(END)
    const waiting = await until(session, (s) => s.status === 'waiting' && s.remoteAsk !== null)
    const { askId } = waiting.remoteAsk!

    expect(waiting).toMatchObject({ ask: null, remoteAsk: { seat: 1, ask: CHAIN }, answers: [{ seat: 0 }, { seat: 0 }] })
    // Nadie de este lado la contesta: ni la política del rival, ni `answer`.
    await tick(20)
    expect(host.commands.filter((command) => command.t === 'answer')).toHaveLength(2)
    expect(session.answer(PASS)).toBe(false)
    expect(session.answerRemote(askId + 1, PASS)).toBe(false)
    expect(session.answerRemote(askId, END)).toBe(false)
    expect(session.answerRemote(askId, PASS)).toBe(true)
    expect(session.answerRemote(askId, PASS)).toBe(false)
    const after = await until(session, (s) => s.answers.length === 3 && s.status === 'ready')

    expect(after.answers[2]).toEqual({ seat: 1, answer: PASS })
    expect(after.remoteAsk).toBeNull()
    // La vista que la sesión calcula para cada asiento (la del invitado la compara la prueba del enlace).
    expect(session.viewOf!(0)).toEqual({ mine: after.mine, theirs: after.theirs, overlay: after.overlay })
    expect(session.viewOf!(1)?.theirs.hand).toHaveLength(3)
    session.destroy()
  })

  it('con un asiento remoto, deshacer ese asiento vuelve a antes de su activación elegida (marcada como la propia); sin una suya, no hace nada', async () => {
    const respond: CoreAsk = { ...(CHAIN as AskOf<'select_chain'>), selects: [{ code: 3, controller: 1, location: L.HAND, sequence: 0, position: 10, description: '48', client_mode: 0 }] }
    const host = fakeHost(undefined, undefined, 1, (_k, seat) => (seat === 0 ? IDLE : respond))
    const session = createAutoSession({ loader: loader(), deck: { main: [[1, 5]] }, transport: host.factory, seed: 7, remote: { deck: { main: [[3, 5]] } } })

    await until(session, (s) => s.status === 'ready')
    // Todavía no eligió nada: no hay a dónde volver.
    expect(session.undo(1)).toBe(false)
    session.answer(END)
    await until(session, (s) => s.answers.length === 1 && s.ask !== null)
    session.answer(END)
    const { askId } = (await until(session, (s) => s.status === 'waiting' && s.remoteAsk !== null)).remoteAsk!

    session.answerRemote(askId, { type: 'select_chain', index: 0 })
    const after = await until(session, (s) => s.answers.length === 3 && s.status === 'ready')

    expect(after.answers[2]).toEqual({ seat: 1, answer: { type: 'select_chain', index: 0 }, activation: true })
    expect(session.undo(1)).toBe(true)
    // La pregunta del remoto queda limpia mientras se re-simula: una respuesta suya tarde no cuenta.
    expect(session.getSnapshot()).toMatchObject({ replaying: true, remoteAsk: null })
    const back = await until(session, (s) => !s.replaying && s.remoteAsk !== null)

    expect(back.answers).toHaveLength(2)
    expect(host.commands.at(-1)).toEqual({ t: 'rewind', to: 2 })
    session.destroy()
  })

  it('el deck del asiento del invitado es bolsa desde el arranque (la semilla no viaja): el anfitrión lo proyecta por código, y el invitado igual, venga en el orden que venga', async () => {
    const withDecks = (a: number[], b: number[]): DataLoader => ({ ...loader(), load: async () => ({ ...(await loader().load([])), decks: [mapped(a), mapped(b)] }) })
    const sorted = ['card-1-1', 'card-1-2', 'card-2-1', 'card-2-2', 'card-3-1', 'card-4-1']
    // El anfitrión (asiento 0) con el remoto en el 1, los dos con las mismas cartas: el suyo en el orden de la semilla, el del remoto por código.
    const host = fakeHost()
    const hosted = createAutoSession({ loader: withDecks([3, 1, 2, 1, 2, 4], [3, 1, 2, 1, 2, 4]), deck: { main: [[1, 5]] }, transport: host.factory, seed: 7, remote: { deck: { main: [[3, 5]] } } })

    await until(hosted, (s) => s.status === 'ready')
    expect(hosted.getSnapshot().initial.mine.deck).not.toEqual(sorted)
    expect(hosted.viewOf!(1)!.mine.deck).toEqual(sorted)
    hosted.destroy()

    // El invitado (asiento 1, `typeOf`): su deck llega en cualquier orden y la mesa es la misma: por código, y robar saca la carta que dice el núcleo, esté donde esté.
    const guests = [[5, 4, 4, 6, 4], [4, 6, 5, 4, 4]].map((mine) => {
      const remote = manualHost()
      const session = createAutoSession({ loader: withDecks(mine, [2, 2, 2, 2, 2]), deck: { main: [[4, 5]] }, transport: remote.factory, seat: 1, typeOf: () => 0 })

      return { remote, session }
    })

    for (const { remote, session } of guests) {
      for (let i = 0; i < 100 && remote.sent.length === 0; i += 1) await tick(1)
      remote.emit({ t: 'loading', done: 0, total: 1 })
      remote.emit({ t: 'events', seat: 1, n: 0, events: [{ type: 'draw', player: 1, drawn: [{ code: 6, position: 10 }, { code: 4, position: 10 }] }] })
      expect(session.getSnapshot().initial.mine.deck).toEqual(['card-4-1', 'card-4-2', 'card-4-3', 'card-5-1', 'card-6-1'])
      expect(session.getSnapshot().mine.hand).toEqual(['card-6-1', 'card-4-1'])
      session.destroy()
    }
  })

  it('antes de cada re-emisión dice cuántas respuestas del remoto vienen dadas; cancelar (re-simular) vuelve a la pregunta remota que esperaba', async () => {
    const host = fakeHost()
    const replays: number[] = []
    const session = createAutoSession({ loader: loader(), deck: { main: [[1, 5]] }, transport: host.factory, seed: 7, remote: { deck: { main: [[2, 5]] }, onReplay: (skip) => replays.push(skip) } })

    await until(session, (s) => s.status === 'ready')
    session.answer(END)
    await until(session, (s) => s.answers.length === 1 && s.ask !== null)
    session.answer(END)
    const first = await until(session, (s) => s.status === 'waiting' && s.remoteAsk !== null)

    session.answerRemote(first.remoteAsk!.askId, PASS)
    await until(session, (s) => s.answers.length === 3 && s.status === 'ready')
    session.answer(END)
    await until(session, (s) => s.answers.length === 4 && s.ask !== null)
    session.answer(END)
    const waiting = await until(session, (s) => s.status === 'waiting' && s.remoteAsk !== null && s.answers.length === 5)

    expect(replays).toEqual([])
    session.cancel()
    expect(session.getSnapshot()).toMatchObject({ replaying: true })
    expect(replays).toEqual([1])
    const back = await until(session, (s) => s.status === 'waiting' && s.remoteAsk !== null && !s.replaying)

    expect(host.state.transports).toBe(2)
    expect(host.commands.at(-1)).toMatchObject({ t: 'create', answers: [END, END, PASS, END, END] })
    expect(back.answers).toEqual(waiting.answers)
    expect(back.mine).toEqual(waiting.mine)
    expect(back.remoteAsk?.ask).toEqual(CHAIN)
    // Deshacer (re-simula en el mismo anfitrión) también avisa.
    expect(session.undo()).toBe(true)
    expect(replays).toEqual([1, 1])
    session.destroy()
  })

  it('con la clave del duelo: cada `create` la lleva (al arrancar, al cancelar, al deshacer con el núcleo caído y al reiniciar) con la semilla en 0, y el snapshot no la tiene', async () => {
    const key = '0123456789abcdef'.repeat(4)
    let emit: (event: AutoEvent) => void = () => {}
    const host = fakeHost(() => 0, (_command, next) => ((emit = next), false))
    const session = createAutoSession({ loader: loader(), deck: { main: [[1, 5]] }, transport: host.factory, seed: 7, key, thinkingMs: 10, remote: { deck: { main: [[2, 5]] } } })

    await until(session, (s) => s.status === 'ready')
    session.answer(END)
    await until(session, (s) => s.status === 'ready' && s.answers.length === 1)
    // Cancelar: otro anfitrión con el mismo `create`.
    host.state.hold = true
    session.answer(END)
    await until(session, (s) => s.status === 'thinking')
    host.state.hold = false
    session.cancel()
    await until(session, (s) => s.status === 'ready' && !s.replaying)
    // Deshacer con el núcleo caído: otro anfitrión más, que re-simula hasta antes de esa jugada.
    host.state.hold = true
    session.answer(END)
    await until(session, (s) => s.status === 'thinking')
    emit({ t: 'fault', kind: 'crash', message: 'boom' })
    await until(session, (s) => s.status === 'error')
    host.state.hold = false
    expect(session.undo()).toBe(true)
    await until(session, (s) => s.status === 'ready' && !s.replaying)
    session.restart()
    await until(session, (s) => s.status === 'ready' && s.answers.length === 0 && !s.replaying)
    const creates = host.commands.filter((command) => command.t === 'create') as Extract<AutoCommand, { t: 'create' }>[]

    expect(creates).toHaveLength(4)
    expect(creates.every((command) => command.key === key && command.seed === 0)).toBe(true)
    expect(JSON.stringify(session.getSnapshot())).not.toContain(key)
    expect(session.getSnapshot().seed).toBe(0)
    session.destroy()
  })

  it('rearmar un duelo guardado: el núcleo re-simula las respuestas y la sesión sigue desde la pregunta viva; el aviso de re-emisión va después del create', async () => {
    const host = fakeHost()
    const order: string[] = []
    const factory: TransportFactory = (data) => {
      const inner = host.factory(data)

      return { ...inner, send: (command) => (order.push(command.t), inner.send(command)) }
    }
    const answers = [
      { seat: 0 as Seat, answer: END },
      { seat: 0 as Seat, answer: END },
      { seat: 1 as Seat, answer: PASS },
    ]
    const session = createAutoSession({ loader: loader(), deck: { main: [[1, 5]] }, transport: factory, seed: 7, remote: { deck: { main: [[2, 5]] }, onReplay: (skip) => order.push(`replay ${skip}`) }, restore: { answers } })
    const live = await until(session, (s) => s.status === 'ready' && !s.replaying)

    expect(order).toEqual(['create', 'replay 1'])
    expect(host.commands[0]).toMatchObject({ t: 'create', answers: [END, END, PASS] })
    expect(live.answers).toEqual(answers)
    expect(live.overlay.lp[0]).toBe(8000 - 3)
    expect(live.ask).toMatchObject({ seat: 0, ask: IDLE })
    session.destroy()
  })

  it('tres respuestas del remoto rechazadas seguidas cortan el duelo y lo dicen', async () => {
    const host = fakeHost(
      (k) => (k === 0 ? 1 : 0),
      (command, emit) => {
        if (command.t !== 'answer' || command.answer.type !== 'select_chain') return false
        emit({ t: 'fault', kind: 'retry', message: 'RETRY' })
        emit({ t: 'ask', seat: 1, askId: command.askId, ask: CHAIN })
        return true
      },
    )
    const session = createAutoSession({ loader: loader(), deck: { main: [[1, 5]] }, transport: host.factory, remote: { deck: { main: [[2, 5]] } } })

    for (let i = 0; i < 3; i += 1) {
      const waiting = await until(session, (s) => (s.status === 'waiting' && s.remoteAsk !== null) || s.status === 'error')

      if (waiting.remoteAsk) session.answerRemote(waiting.remoteAsk.askId, PASS)
      await tick(5)
    }
    const failed = await until(session, (s) => s.status === 'error')

    expect(failed.fault).toMatchObject({ kind: 'retry', message: expect.stringContaining('from the remote seat') })
    session.destroy()
  })

  it('el invitado (sin núcleo): espera mientras elige el otro, y una re-emisión pedida antes de que arranque salta sus preguntas ya contestadas', async () => {
    const remote = manualHost()
    const session = createAutoSession({ loader: loader(), deck: { main: [[2, 5]] }, transport: remote.factory, seed: 7, seat: 1, typeOf: () => 0 })

    session.expectReplay(1)
    expect(session.getSnapshot()).toMatchObject({ status: 'loading', replaying: true })
    for (let i = 0; i < 100 && remote.sent.length === 0; i += 1) await tick(1)
    expect(remote.sent[0]).toMatchObject({ t: 'create', seed: 7 })
    remote.emit({ t: 'loading', done: 0, total: 1 })
    // La primera pregunta mía ya estaba contestada: se salta.
    remote.emit({ t: 'ask', seat: 1, askId: 5, ask: CHAIN })
    expect(session.getSnapshot().ask).toBeNull()
    // Elige el otro: el invitado espera (sin quedarse «re-simulando»).
    remote.emit({ t: 'events', seat: 1, n: 1, events: [{ type: 'lpupdate', player: 0, lp: 7000 }, { type: 'waiting' }] })
    expect(session.getSnapshot()).toMatchObject({ status: 'waiting', replaying: false, ask: null })
    expect(session.getSnapshot().overlay.lp[0]).toBe(7000)
    remote.emit({ t: 'ask', seat: 1, askId: 6, ask: CHAIN })
    expect(session.getSnapshot()).toMatchObject({ status: 'ready', ask: { askId: 6, seat: 1 } })
    expect(session.answer(PASS)).toBe(true)
    expect(remote.sent.at(-1)).toEqual({ t: 'answer', askId: 6, answer: PASS })
    session.destroy()

    // Jugar solo no conoce `waiting`: lo que cuente el núcleo sobre el rival no cambia el estado.
    const solo = manualHost()
    const alone = createAutoSession({ loader: loader(), deck: { main: [[1, 5]] }, transport: solo.factory, seed: 7 })

    for (let i = 0; i < 100 && solo.sent.length === 0; i += 1) await tick(1)
    solo.emit({ t: 'loading', done: 0, total: 1 })
    solo.emit({ t: 'events', seat: 0, n: 0, events: [{ type: 'waiting' }] })
    expect(alone.getSnapshot().status).toBe('loading')
    alone.destroy()
  })
})

describe('la sesión avisa sólo lo que cambia (cada aviso es un render)', () => {
  /** Mis `stats`: la carta 1 en la mano con ese ataque. */
  const stat = (attack: number): AutoEvent => ({ t: 'stats', seat: 0, cards: [{ code: 1, controller: 0, location: L.HAND, sequence: 0, position: 10, attack, defense: 0, level: 4 }] })

  /** Una sesión con el anfitrión a mano, en mi primera pregunta y con una carta robada; cuenta los avisos desde ahí. */
  async function live(options: Partial<SessionOptions> = {}) {
    const remote = manualHost()
    const session = createAutoSession({ loader: loader(), deck: { main: [[1, 5]] }, transport: remote.factory, seed: 7, ...options })
    let calls = 0

    for (let i = 0; i < 100 && remote.sent.length === 0; i += 1) await tick(1)
    remote.emit({ t: 'loading', done: 0, total: 1 })
    remote.emit({ t: 'events', seat: 0, n: 0, events: [{ type: 'draw', player: 0, drawn: [{ code: 1, position: 10 }] }] })
    remote.emit({ t: 'ask', seat: 0, askId: 1, ask: IDLE })
    expect(session.getSnapshot().status).toBe('ready')
    session.subscribe(() => (calls += 1))

    return { remote, session, calls: () => calls }
  }

  it('el avance de la carga (uno por script) avisa a lo sumo una vez por cuadro, con el último número', async () => {
    let finish = () => {}
    const slow: DataLoader = {
      ...loader(),
      load: (_lists, onProgress) =>
        new Promise((resolve) => {
          for (let done = 0; done <= 60; done += 1) onProgress?.(done, 60)
          finish = () => void loader().load([]).then(resolve)
        }),
    }
    const session = createAutoSession({ loader: slow, deck: { main: [[1, 5]] }, transport: fakeHost().factory })
    let calls = 0

    session.subscribe(() => (calls += 1))
    await tick(1)
    expect(calls).toBe(0)
    await tick(40)
    expect(calls).toBe(1)
    expect(session.getSnapshot().progress).toEqual({ done: 60, total: 60 })
    finish()
    await until(session, (s) => s.status === 'ready')
    session.destroy()
  })

  it('lo del rival que no cambia nada (sus `events` y sus `stats`) no avisa y el snapshot es el mismo objeto; con handtraps, que robe sí', async () => {
    const passive = await live()
    const before = passive.session.getSnapshot()

    passive.remote.emit({ t: 'events', seat: 1, n: 1, events: [{ type: 'draw', player: 1, drawn: [{ code: 0, position: 10 }] }] })
    passive.remote.emit({ t: 'stats', seat: 1, cards: [] })
    expect(passive.calls()).toBe(0)
    expect(passive.session.getSnapshot()).toBe(before)
    passive.session.destroy()

    // Con handtraps su mano está en el snapshot (`rivalHand`): sus `stats` no la cambian, su robo sí.
    const handtraps = await live({ rival: { main: [[7, 1]], hand: () => [] } })

    handtraps.remote.emit({ t: 'stats', seat: 1, cards: [] })
    expect(handtraps.calls()).toBe(0)
    handtraps.remote.emit({ t: 'events', seat: 1, n: 1, events: [{ type: 'draw', player: 1, drawn: [{ code: 2, position: 10 }] }] })
    const drawn = handtraps.session.getSnapshot()

    expect(handtraps.calls()).toBe(1)
    expect(drawn.rivalHand).toEqual([2])
    handtraps.remote.emit({ t: 'stats', seat: 1, cards: [] })
    expect(handtraps.calls()).toBe(1)
    expect(handtraps.session.getSnapshot()).toBe(drawn)
    handtraps.session.destroy()
  })

  it('mis `stats`: con los mismos números no avisan (el snapshot es el mismo objeto); con otros, sí', async () => {
    const { remote, session, calls } = await live()

    remote.emit(stat(1000))
    const first = session.getSnapshot()

    expect(calls()).toBe(1)
    expect(Object.values(first.overlay.stats.mine)).toEqual([{ attack: 1000, defense: 0, level: 4 }])
    remote.emit(stat(1000))
    expect(calls()).toBe(1)
    expect(session.getSnapshot()).toBe(first)
    remote.emit(stat(1500))
    expect(calls()).toBe(2)
    expect(Object.values(session.getSnapshot().overlay.stats.mine)).toEqual([{ attack: 1500, defense: 0, level: 4 }])
    session.destroy()
  })

  it('un duelo con deshacer, cancelar y reiniciar: cada aviso trae algo distinto y, fuera de una re-simulación, nada cambia sin avisar', async () => {
    const host = fakeHost()
    let session: AutoSession | null = null
    let seen: AutoSnapshot | null = null
    const contents: string[] = []
    const lag: string[] = []
    // Tras cada evento (menos el `loading`, que rearma la mesa callado hasta la primera tanda), lo que avisó es lo vigente y lo vigente es lo que proyecta el adaptador.
    const check = (event: AutoEvent) => {
      const snap = session?.getSnapshot()

      if (!snap || snap.replaying || event.t === 'loading' || !session?.adapter) return
      if (snap !== seen || snap.mine !== session.adapter.mine || snap.overlay !== session.adapter.overlay) lag.push(`${event.t} ${contents.length}`)
    }
    // Como el anfitrión de verdad, los `stats` de cada asiento después de cada tanda: los míos cambian cada dos preguntas; los del rival, nunca.
    const factory: TransportFactory = (data) => {
      const inner = host.factory(data)

      return {
        ...inner,
        onEvent: (listener) =>
          inner.onEvent((event) => {
            listener(event)
            check(event)
            if (event.t !== 'events') return
            const stats: AutoEvent = event.seat === 0 ? stat(1000 + 100 * Math.floor(event.n / 2)) : { t: 'stats', seat: 1, cards: [] }

            listener(stats)
            check(stats)
          }),
      }
    }

    session = createAutoSession({ loader: loader(), deck: { main: [[1, 5]] }, transport: factory, seed: 3 })
    session.subscribe(() => {
      seen = session!.getSnapshot()
      contents.push(JSON.stringify(seen))
    })
    await until(session, (s) => s.status === 'ready')
    for (let n = 1; n <= 4; n += 1) {
      session.answer(END)
      await until(session, (s) => s.status === 'ready' && s.ask !== null && s.answers.length >= n)
    }
    expect(session.undo()).toBe(true)
    await until(session, (s) => s.status === 'ready' && !s.replaying)
    host.state.hold = true
    session.answer(END)
    host.state.hold = false
    session.cancel()
    await until(session, (s) => s.status === 'ready' && !s.replaying)
    session.restart()
    await until(session, (s) => s.status === 'ready' && !s.replaying && s.answers.length === 0)
    session.answer(END)
    const last = await until(session, (s) => s.status === 'ready' && s.answers.length === 1)

    expect(lag).toEqual([])
    expect(contents.filter((content, i) => content === contents[i - 1])).toEqual([])
    expect(seen).toBe(last)
    expect(Object.values(last.overlay.stats.mine)).toEqual([{ attack: 1000, defense: 0, level: 4 }])
    session.destroy()
  })
})
