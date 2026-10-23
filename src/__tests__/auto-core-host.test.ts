import createCore, { OcgCoreInternal, OcgDuelMode, OcgResponseType, type OcgCardData } from 'ocgcore-wasm'
import { canonical, createAutoHost, send, toResponse } from '../app/auto/core-host'
import { passivePolicy, randomLegalPolicy } from '../app/auto/policies'
import type { AutoEvent, CoreAnswer } from '../app/auto/protocol'
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

  it('no arranca sin wasmBinary ni locateFile (el paquete bajaría el wasm en base64)', () => {
    expect(() => createAutoHost({ core: {}, cardReader: () => null, scriptReader: () => null, emit: () => {} })).toThrow()
  })

  describe.skipIf(!hasCoreData)('con el núcleo y los scripts de verdad', () => {
    const { cards } = hasCoreData ? loadCards() : { cards: new Map<number, OcgCardData>() }
    const store = scriptStore()
    // Monstruos Normales y Pot of Greed: un deck chico que se queda sin cartas enseguida.
    const deck = (codes: number[]) => ({ main: codes, extra: [], hand: [] })
    const small = [46986414, 46986414, 89631139, 89631139, 55144522, 46986414, 89631139]
    const host = (events: AutoEvent[]) => createAutoHost({ core: { wasmBinary: wasmBinary() }, cardReader: (code) => cards.get(code) ?? null, scriptReader: store.read, emit: (event) => events.push(event) })

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

    it('no crea el duelo si una carta no tiene datos o reglas', async () => {
      const events: AutoEvent[] = []

      await host(events).handle({ t: 'create', seed: 1, flags: MR5, players: PLAYERS, decks: [deck([...small, 1]), deck(small)] })
      expect(events).toEqual([expect.objectContaining({ t: 'fault', kind: 'rules', cards: [1] })])
    })
  })
})
