import createCore, { OcgCoreInternal, OcgDuelMode, OcgLocation, OcgMessageType, OcgQueryFlags, OcgResponseType, type OcgCardData } from 'ocgcore-wasm'
import { canonical, clip, createAutoHost, seenCodes, send, toResponse, type AutoHost } from '../app/auto/core-host'
import { deckOrder, needsScript, teamOrder } from '../app/auto/deck-map'
import { coreSeedOf } from '../app/auto/duel-key'
import { passivePolicy, randomLegalPolicy } from '../app/auto/policies'
import { parseAutoEvent, type AutoEvent, type CoreAnswer, type Seat, type WireEvent } from '../app/auto/protocol'
import { eventFor } from '../app/auto/referee'
import { hasCoreData, loadCards, runDuel, scriptStore, wasmBinary } from './support/core-data'

const MR5 = String(OcgDuelMode.MODE_MR5)
const PLAYERS = [
  { lp: 8000, hand: 5, draw: 1 },
  { lp: 8000, hand: 5, draw: 1 },
]

describe('el anfitrión del núcleo', () => {
  // Los cuatro codificadores que el fuzz de F0 nunca vio, contra el formato de `playerop.cpp`: SORT_CHAIN (i8 por posición, o -1),
  // SELECT_COUNTER (i16 por carta), SELECT_DISFIELD (jugador, lugar, secuencia: un byte cada uno) y ROCK_PAPER_SCISSORS (i32).
  it('escribe las respuestas como las lee el núcleo', async () => {
    const lib = await createCore({ sync: true, wasmBinary: wasmBinary() })
    const handle = lib.createDuel({ flags: OcgDuelMode.MODE_MR5, seed: [1n, 2n, 3n, 4n], team1: { startingLP: 8000, startingDrawCount: 5, drawCountPerTurn: 1 }, team2: { startingLP: 8000, startingDrawCount: 5, drawCountPerTurn: 1 }, cardReader: () => null, scriptReader: () => null })!
    const mod = lib[OcgCoreInternal].module as unknown as { HEAPU8: Uint8Array; _ocgapiDuelSetResponse: (duel: number, ptr: number, length: number) => void }
    const written: number[][] = []
    const original = mod._ocgapiDuelSetResponse

    mod._ocgapiDuelSetResponse = (_duel, ptr, length) => void written.push([...mod.HEAPU8.slice(ptr, ptr + length)])
    const bytes = (answer: CoreAnswer) => {
      send(lib, handle, toResponse(answer))

      return written.pop()
    }

    expect(bytes({ type: 'sort_chain', order: [2, 0, 1] })).toEqual([2, 0, 1])
    expect(bytes({ type: 'sort_chain', order: null })).toEqual([0xff])
    expect(bytes({ type: 'sort_card', order: [1, 0] })).toEqual([1, 0])
    expect(bytes({ type: 'select_counter', counters: [1, 0, 258] })).toEqual([1, 0, 0, 0, 2, 1])
    expect(bytes({ type: 'select_disfield', places: [{ player: 1, location: 4, sequence: 2 }, { player: 0, location: 8, sequence: 4 }] })).toEqual([1, 4, 2, 0, 8, 4])
    expect(bytes({ type: 'rock_paper_scissors', value: 2 })).toEqual([2, 0, 0, 0])
    expect(bytes({ type: 'announce_race', races: String(1n << 33n) })).toEqual([0, 0, 0, 0, 2, 0, 0, 0])
    expect(toResponse({ type: 'select_card', indices: [1] })).toEqual({ type: OcgResponseType.SELECT_CARD, indicies: [1] })
    mod._ocgapiDuelSetResponse = original
  })

  it('ordena las pistas seguidas (el núcleo no garantiza su orden entre dos corridas iguales) y deja el resto como vino', () => {
    const card = (sequence: number) => ({ type: 'card_hint' as const, controller: 0 as const, location: 2, sequence, position: 10, card_hint: 7, description: '225' })
    const player = { type: 'player_hint' as const, player: 1, player_hint: 7, description: '9' }
    const phase = { type: 'new_phase' as const, phase: 512 }

    expect(canonical([phase, player, card(1), card(0), phase, card(3), card(2)])).toEqual(canonical([phase, card(0), player, card(1), phase, card(2), card(3)]))
    expect(canonical([card(1), phase, card(0)])).toEqual([card(1), phase, card(0)])
  })

  it('lo que un asiento vio sale de los eventos que le llegaron: lo que el árbitro tapó (código 0) no cuenta', () => {
    const seen = (seat: Seat, event: WireEvent) => [...seenCodes(eventFor(seat, event), new Set())]
    const draw: WireEvent = { type: 'draw', player: 1, drawn: [{ code: 46986414, position: 10 }] }
    const chaining: WireEvent = { type: 'chaining', code: 14558127, controller: 1, location: 2, sequence: 0, position: 10, triggering_controller: 1, triggering_location: 2, triggering_sequence: 0, description: '0', chain_size: 1 }
    const toHand: WireEvent = { type: 'move', card: 89631139, from: { controller: 1, location: 1, sequence: 0, position: 10 }, to: { controller: 1, location: 2, sequence: 0, position: 10 } }

    expect(seen(0, draw)).toEqual([])
    expect(seen(1, draw)).toEqual([46986414])
    expect(seen(0, toHand)).toEqual([])
    expect(seen(0, chaining)).toEqual([14558127])
    expect(seen(0, { type: 'shuffle_hand', player: 1, cards: [46986414, 89631139] })).toEqual([])
  })

  it('no arranca sin wasmBinary ni locateFile (el paquete bajaría el wasm en base64)', () => {
    expect(() => createAutoHost({ core: {}, cardReader: () => null, scriptReader: () => null, emit: () => {} })).toThrow()
  })

  it('recorta un texto largo sin partir un par sustituto', () => {
    expect(clip('corto')).toBe('corto')
    expect(clip(`${'a'.repeat(1998)}😀b`)).toBe(`${'a'.repeat(1998)}…`)
    expect(clip('b'.repeat(5000))).toHaveLength(2000)
  })

  // Nada de lo que emite se pierde del otro lado: cada evento pasa `parseAutoEvent` tal como viaja (JSON).
  describe('con un núcleo de mentira', () => {
    const wire = (events: AutoEvent[]) => events.map((event) => parseAutoEvent(JSON.parse(JSON.stringify(event))))
    const idle = { type: OcgMessageType.SELECT_IDLECMD, player: 0, summons: [], special_summons: [], pos_changes: [], monster_sets: [], spell_sets: [], activates: [], to_bp: false, to_ep: true, shuffle: false }

    /**
     * El anfitrión sobre un núcleo que, en cada tanda, cuenta `phases` cambios de fase, avisa un error de script de `error` caracteres y pregunta al asiento 0.
     * `seeds`: la semilla con que se creó cada duelo; `more`, lo que se le suma al `create`.
     */
    async function fakeCore(phases: number, error = 0, more: { seed?: number; key?: string } = {}) {
      const seeds: unknown[] = []

      vi.resetModules()
      vi.doMock('ocgcore-wasm', async (original) => {
        const real = await original<typeof import('ocgcore-wasm')>()
        let report: (type: number, text: string) => void = () => {}
        const lib = {
          [real.OcgCoreInternal]: { callbacks: new Map() },
          createDuel(options: { errorHandler: typeof report; seed: unknown }) {
            report = options.errorHandler
            seeds.push(options.seed)
            return { [Symbol('internal')]: { handle: 1, callback: 1 } }
          },
          loadScript: () => true,
          duelNewCard() {},
          startDuel() {},
          destroyDuel() {},
          duelProcess() {
            if (error) report(0, 'x'.repeat(error))
            return real.OcgProcessResult.WAITING
          },
          duelGetMessage: () => [...Array.from({ length: phases }, () => ({ type: real.OcgMessageType.NEW_PHASE, phase: 1 })), idle],
          duelQueryLocation: () => [],
        }

        return { ...real, default: async () => lib }
      })
      const { createAutoHost: create } = await import('../app/auto/core-host')

      vi.doUnmock('ocgcore-wasm')
      const events: AutoEvent[] = []
      const auto = create({ core: { wasmBinary: new ArrayBuffer(0) }, cardReader: (code) => ({ code, type: 0x11 }) as OcgCardData, scriptReader: () => '', emit: (event) => events.push(event) })
      const deck = { main: [1, 1, 1, 1, 1], extra: [], hand: [] }

      await auto.handle({ t: 'create', seed: 1, flags: MR5, players: PLAYERS, decks: [deck, deck], ...more })
      return { auto, events, seeds }
    }

    it('parte una tanda de más de 600 eventos en varias, en orden y con el mismo n', async () => {
      const { events } = await fakeCore(700)
      const told = wire(events).filter((event): event is Extract<AutoEvent, { t: 'events' }> => event?.t === 'events')

      expect(wire(events)).not.toContain(null)
      expect(told.map((event) => [event.seat, event.n, event.events.length])).toEqual([
        [0, 0, 600],
        [0, 0, 100],
        [1, 0, 600],
        [1, 0, 101],
      ])
      expect(told.filter((event) => event.seat === 1).flatMap((event) => event.events)).toEqual([...Array<WireEvent>(700).fill({ type: 'new_phase', phase: 1 }), { type: 'waiting' }])
    })

    it('un error de script larguísimo llega recortado (no se pierde)', async () => {
      const { events } = await fakeCore(1, 5000)
      const faults = wire(events).filter((event) => event?.t === 'fault')

      expect(faults).toHaveLength(1)
      expect(faults[0]).toMatchObject({ kind: 'script', message: expect.stringMatching(/^error: x+…$/) })
    })

    it('un rewind más allá de lo jugado avisa (crash) en vez de callarse; hasta lo jugado, re-simula', async () => {
      const { auto, events } = await fakeCore(1)
      const mark = events.length

      await auto.handle({ t: 'rewind', to: 1 })
      expect(wire(events.slice(mark))).toEqual([{ t: 'fault', kind: 'crash', message: 'cannot rewind to 1: there are 0 answers' }])
      await auto.handle({ t: 'rewind', to: 0 })
      expect(events.slice(mark + 1).some((event) => event.t === 'ask')).toBe(true)
    })

    it('con la clave, el núcleo arranca de la clave (no de la semilla u32), también al re-simular; sin ella, de la semilla', async () => {
      const key = 'a1'.repeat(32)
      const keyed = await fakeCore(1, 0, { key })
      const same = await fakeCore(1, 0, { key, seed: 2 })
      const other = await fakeCore(1, 0, { key: '5c'.repeat(32) })
      const plain = [await fakeCore(1), await fakeCore(1, 0, { seed: 2 })]

      await keyed.auto.handle({ t: 'rewind', to: 0 })
      expect(keyed.seeds).toEqual([coreSeedOf(key), coreSeedOf(key)])
      expect(same.seeds).toEqual([coreSeedOf(key)])
      expect(other.seeds[0]).not.toEqual(coreSeedOf(key))
      expect(plain[0]!.seeds[0]).not.toEqual(plain[1]!.seeds[0])
      expect(plain.flatMap(({ seeds }) => seeds)).not.toContainEqual(coreSeedOf(key))
    })

    it('una clave mal formada que llega sin pasar por el protocolo no crea el duelo y el aviso no la repite', async () => {
      const key = 'A1'.repeat(32)
      const { events, seeds } = await fakeCore(1, 0, { key })

      expect(seeds).toEqual([])
      expect(events).toEqual([{ t: 'fault', kind: 'setup', message: 'invalid duel key' }])
      expect(JSON.stringify(events)).not.toContain(key)
    })
  })

  describe.skipIf(!hasCoreData)('con el núcleo y los scripts de verdad', () => {
    const { cards } = hasCoreData ? loadCards() : { cards: new Map<number, OcgCardData>() }
    const store = scriptStore()
    // Monstruos Normales y Pot of Greed: un deck chico que se queda sin cartas enseguida.
    const deck = (codes: number[]) => ({ main: codes, extra: [], hand: [] })
    const small = [46986414, 46986414, 89631139, 89631139, 55144522, 46986414, 89631139]
    const host = (events: AutoEvent[]) => createAutoHost({ core: { wasmBinary: wasmBinary() }, cardReader: (code) => cards.get(code) ?? null, scriptReader: store.read, emit: (event) => events.push(event) })
    /** Lo que el núcleo tiene de `team`, de arriba hacia abajo: lo robado (la mano, en orden) y el deck (el tope es la secuencia más alta). */
    const inCore = (auto: AutoHost, team: Seat) => {
      const { lib, handle } = auto.live!
      const codes = (location: OcgLocation) => lib.duelQueryLocation(handle, { flags: OcgQueryFlags.CODE, controller: team, location }).map((card) => card?.code)

      return [...codes(OcgLocation.HAND), ...codes(OcgLocation.DECK).reverse()]
    }

    it('crea el duelo, pregunta, juega hasta el primer WIN y ahí corta', async () => {
      const events: AutoEvent[] = []
      const auto = host(events)

      await auto.handle({ t: 'create', seed: 1, flags: MR5, players: PLAYERS, decks: [deck(small), deck(small)] })
      expect(events.find((event) => event.t === 'ask')).toMatchObject({ t: 'ask', seat: 0, ask: { type: 'select_idlecmd' } })
      const result = await runDuel(auto, events, [passivePolicy(), passivePolicy()], 200)

      expect(result.end).toBe('win')
      expect(events.filter((event) => event.t === 'end')).toHaveLength(1)
      expect(events.at(-1)).toMatchObject({ t: 'end', winner: 0 })
      expect(events.filter((event) => event.t === 'fault')).toEqual([])
      // Después del fin no se pregunta nada más (el núcleo sí seguiría).
      expect(events.slice(events.findIndex((event) => event.t === 'end')).some((event) => event.t === 'ask')).toBe(false)
    })

    it('descarta una respuesta vieja y re-simula igual con rewind', async () => {
      const events: AutoEvent[] = []
      const auto = host(events)

      await auto.handle({ t: 'create', seed: 2, flags: MR5, players: PLAYERS, decks: [deck(small), deck(small)] })
      await runDuel(auto, events, [randomLegalPolicy(1), randomLegalPolicy(2)], 6)
      const asked = events.filter((event) => event.t === 'ask').at(-1) as Extract<AutoEvent, { t: 'ask' }>
      const before = events.length

      await auto.handle({ t: 'answer', askId: asked.askId - 1, answer: passivePolicy()(asked.ask) })
      expect(events.length).toBe(before)

      const original = events.filter((event) => event.t === 'events' && event.n <= 3)
      const mark = events.length

      await auto.handle({ t: 'rewind', to: 3 })
      expect(auto.answers).toHaveLength(3)
      expect(events.slice(mark).filter((event) => event.t === 'events')).toEqual(original)
    })

    it('declarar una carta ofrece las del filtro que quien declara conoce: su deck sí, el deck del otro no; la ofrecida se acepta', async () => {
      const PROHIBITION = 43711255
      const events: AutoEvent[] = []
      const auto = host(events)

      // Yo, con Prohibition en la mano y Blue-Eyes en el deck; el rival, sólo Dark Magician (no se vio nunca).
      await auto.handle({ t: 'create', seed: 3, flags: MR5, players: PLAYERS, decks: [{ main: [PROHIBITION, ...Array(9).fill(89631139)], extra: [], hand: [PROHIBITION] }, deck(Array(10).fill(46986414))] })
      let announced: Extract<AutoEvent, { t: 'ask' }> | undefined

      for (let i = 0; i < 30 && !announced; i += 1) {
        const asked = events.filter((event) => event.t === 'ask').at(-1) as Extract<AutoEvent, { t: 'ask' }>
        const activate = asked.ask.type === 'select_idlecmd' && asked.seat === 0 ? asked.ask.activates.findIndex((card) => card.code === PROHIBITION) : -1

        if (asked.ask.type === 'announce_card') announced = asked
        else await auto.handle({ t: 'answer', askId: asked.askId, answer: activate >= 0 ? { type: 'select_idlecmd', action: 5, index: activate } : passivePolicy()(asked.ask) })
      }

      expect(announced?.seat).toBe(0)
      const offered = announced!.ask.type === 'announce_card' ? (announced!.ask.cards ?? []) : []

      expect(offered).toEqual(expect.arrayContaining([PROHIBITION, 89631139]))
      expect(offered).not.toContain(46986414)
      await auto.handle({ t: 'answer', askId: announced!.askId, answer: { type: 'announce_card', code: 89631139 } })
      expect(events.filter((event) => event.t === 'fault')).toEqual([])
      expect(auto.answers.at(-1)).toEqual({ type: 'announce_card', code: 89631139 })
    })

    it('con la clave, los decks que usa el núcleo son los de `teamOrder` con la clave (no los de la semilla); la misma clave, el mismo duelo, también con rewind', async () => {
      // Veinte Monstruos Normales distintos, así dos órdenes no coinciden por casualidad.
      const normals = [...cards.values()].filter((card) => (card.type & 0x1004011) === 0x11 && !card.alias && !needsScript(card)).slice(0, 20).map((card) => card.code)
      const create = { t: 'create' as const, seed: 1, flags: MR5, players: PLAYERS, decks: [deck(normals), { main: normals, extra: [], hand: [normals[7]!] }] }
      const [a, b] = ['a1'.repeat(32), '5c'.repeat(32)]
      const played = async (key: string, seed: number) => {
        const events: AutoEvent[] = []
        const auto = host(events)

        await auto.handle({ ...create, seed, key })
        const orders = [inCore(auto, 0), inCore(auto, 1)]

        await runDuel(auto, events, [randomLegalPolicy(1), randomLegalPolicy(2)], 6)
        return { auto, events, orders }
      }

      const first = await played(a, 1)

      expect(normals).toHaveLength(20)
      expect(first.orders).toEqual([teamOrder({ ...create, key: a }, 0), teamOrder({ ...create, key: a }, 1)])
      expect(first.orders[1]![0]).toBe(normals[7])
      expect(first.orders).not.toEqual([teamOrder(create, 0), teamOrder(create, 1)])
      expect((await played(b, 1)).orders[0]).not.toEqual(first.orders[0])
      // La semilla u32 no cuenta: con la misma clave y otra semilla, el mismo duelo.
      const again = await played(a, 2)

      expect(again.orders).toEqual(first.orders)
      expect(again.auto.answers).toEqual(first.auto.answers)
      expect(again.events).toEqual(first.events)
      expect(first.events.filter((event) => event.t === 'fault')).toEqual([])

      const original = first.events.filter((event) => event.t === 'events' && event.n <= 3)
      const mark = first.events.length

      await first.auto.handle({ t: 'rewind', to: 3 })
      expect(first.events.slice(mark).filter((event) => event.t === 'events')).toEqual(original)
    })

    it('sin la clave, los decks que usa el núcleo son los de la semilla, como siempre', async () => {
      const events: AutoEvent[] = []
      const auto = host(events)
      const create = { t: 'create' as const, seed: 5, flags: MR5, players: PLAYERS, decks: [deck(small), deck(small)] }

      await auto.handle(create)
      expect([inCore(auto, 0), inCore(auto, 1)]).toEqual([deckOrder(small, 5), deckOrder(small, 6)])
    })

    it('no crea el duelo si una carta no tiene datos o reglas', async () => {
      const events: AutoEvent[] = []

      await host(events).handle({ t: 'create', seed: 1, flags: MR5, players: PLAYERS, decks: [deck([...small, 1]), deck(small)] })
      expect(events).toEqual([expect.objectContaining({ t: 'fault', kind: 'rules', cards: [1] })])
    })
  })
})
