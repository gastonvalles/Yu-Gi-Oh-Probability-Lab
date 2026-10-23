import { askFor, eventFor, knows, statsFor } from '../app/auto/referee'
import { EVENT_SHAPES, type CoreAsk, type WireEvent } from '../app/auto/protocol'

// Lugares: 1 deck, 2 mano, 4 monstruos, 8 Mágicas/Trampas, 16 cementerio, 32 destierro, 64 Extra, 0x84 material. Posiciones: 1 boca arriba en ataque, 10 boca abajo.
const at = (controller: 0 | 1, location: number, position = 10, sequence = 0) => ({ controller, location, sequence, position })
const ACE = 46986414

/** Los códigos de cartas que lleva un evento (lo que no tiene que llegar si no se ve). */
function codes(value: unknown): number[] {
  if (Array.isArray(value)) return value.flatMap(codes)
  if (!value || typeof value !== 'object') return []

  return Object.entries(value).flatMap(([key, item]) => ((key === 'code' || key === 'card') && typeof item === 'number' ? [item] : (key === 'cards' || key === 'returned_to_extra') && Array.isArray(item) && item.every((x) => typeof x === 'number') ? item : codes(item)))
}

describe('el árbitro (información oculta por asiento)', () => {
  it('sabe qué ve cada uno: lo público, lo propio menos el deck', () => {
    expect(knows(1, at(0, 16))).toBe(true)
    expect(knows(1, at(0, 0x84))).toBe(true)
    expect(knows(1, at(0, 4, 1))).toBe(true)
    expect(knows(1, at(0, 4, 10))).toBe(false)
    expect(knows(1, at(0, 2, 1))).toBe(false)
    expect(knows(0, at(0, 2))).toBe(true)
    expect(knows(0, at(0, 1))).toBe(false)
    expect(knows(1, at(0, 64, 5))).toBe(true)
    expect(knows(1, at(0, 64, 10))).toBe(false)
    expect(knows(1, at(0, 32, 10))).toBe(false)
  })

  // Un caso por cada tipo de mensaje que mueve o revela cartas: [evento, lo que ve el dueño (asiento 0), lo que ve el rival (asiento 1)].
  const cases: [WireEvent, number[], number[] | null][] = [
    [{ type: 'draw', player: 0, drawn: [{ code: ACE, position: 10 }] }, [ACE], [0]],
    [{ type: 'draw', player: 0, drawn: [{ code: ACE, position: 5 }] }, [ACE], [ACE]],
    [{ type: 'move', card: ACE, from: at(0, 1), to: at(0, 2) }, [ACE], [0]],
    [{ type: 'move', card: ACE, from: at(0, 2), to: at(0, 1) }, [0], [0]],
    [{ type: 'move', card: ACE, from: at(0, 2), to: at(0, 8, 10) }, [ACE], [0]],
    [{ type: 'move', card: ACE, from: at(0, 2), to: at(0, 16, 5) }, [ACE], [ACE]],
    [{ type: 'move', card: ACE, from: at(0, 4, 1), to: at(0, 0x84, 0) }, [ACE], [ACE]],
    [{ type: 'move', card: ACE, from: at(0, 1), to: at(0, 32, 10) }, [ACE], [0]],
    [{ type: 'move', card: ACE, from: at(0, 4, 1), to: at(1, 4, 1) }, [ACE], [ACE]],
    [{ type: 'set', code: ACE, ...at(0, 4, 8) }, [ACE], [0]],
    [{ type: 'summoning', code: ACE, ...at(0, 4, 1) }, [ACE], [ACE]],
    [{ type: 'spsummoning', code: ACE, ...at(0, 4, 8) }, [ACE], [0]],
    [{ type: 'flipsummoning', code: ACE, ...at(0, 4, 1) }, [ACE], [ACE]],
    [{ type: 'pos_change', code: ACE, controller: 0, location: 4, sequence: 0, prev_position: 1, position: 8 }, [ACE], [0]],
    [{ type: 'swap', card1: { code: ACE, ...at(1, 4, 8) }, card2: { code: 1, ...at(0, 4, 1) } }, [0, 1], [ACE, 1]],
    [{ type: 'confirm_cards', player: 1, cards: [{ code: ACE, controller: 0, location: 2, sequence: 0 }] }, [ACE], [ACE]],
    [{ type: 'confirm_cards', player: 1, cards: [{ code: ACE, controller: 0, location: 1, sequence: 0 }] }, [0], [ACE]],
    [{ type: 'confirm_decktop', player: 0, cards: [{ code: ACE, controller: 0, location: 1, sequence: 0 }] }, [ACE], [ACE]],
    [{ type: 'confirm_extratop', player: 0, cards: [{ code: ACE, controller: 0, location: 64, sequence: 0 }] }, [ACE], [ACE]],
    [{ type: 'shuffle_hand', player: 0, cards: [ACE, 1] }, [ACE, 1], [0, 0]],
    [{ type: 'shuffle_extra', player: 0, cards: [ACE] }, [ACE], [0]],
    [{ type: 'deck_top', player: 0, count: 0, code: ACE, position: 10 }, [0], [0]],
    [{ type: 'deck_top', player: 0, count: 0, code: ACE, position: 5 }, [ACE], [ACE]],
    [{ type: 'chaining', code: ACE, ...at(0, 2, 10), triggering_controller: 0, triggering_location: 2, triggering_sequence: 0, description: '0', chain_size: 1 }, [ACE], [ACE]],
    [{ type: 'missed_effect', code: ACE, ...at(0, 4, 1) }, [ACE], null],
    [{ type: 'swap_grave_deck', player: 0, deck_size: 3, returned_to_extra: [ACE] }, [ACE], [ACE]],
    [{ type: 'match_kill', card: ACE }, [ACE], [ACE]],
  ]

  it.each(cases)('%j', (event, owner, rival) => {
    expect(codes(eventFor(0, event))).toEqual(owner)
    expect(rival === null ? eventFor(1, event) : codes(eventFor(1, event))).toEqual(rival)
  })

  it('cubre con un caso cada mensaje que mueve o revela cartas', () => {
    const tested = new Set(cases.map(([event]) => event.type))
    const withCodes = Object.entries(EVENT_SHAPES)
      .filter(([, shape]) => /"(code|card)":"int"|"cards":\["int"\]|"returned_to_extra"/.test(JSON.stringify(shape)))
      .map(([type]) => type)

    expect(withCodes.filter((type) => !tested.has(type as WireEvent['type']))).toEqual([])
  })

  it('las pistas privadas van sólo a su jugador; los anuncios, a los dos', () => {
    const hint = (hint_type: number): WireEvent => ({ type: 'hint', hint_type, player: 0, hint: String(ACE) })

    for (const type of [1, 2, 3, 4, 5]) expect([eventFor(0, hint(type)), eventFor(1, hint(type))]).toEqual([hint(type), null])
    for (const type of [6, 7, 8, 9, 10, 11]) expect(eventFor(1, hint(type))).toEqual(hint(type))
  })

  it('en una pregunta, quien elige ve su deck y lo público del rival, no lo colocado del rival', () => {
    const ask: CoreAsk = {
      type: 'select_card',
      player: 0,
      can_cancel: false,
      min: 1,
      max: 1,
      selects: [
        { code: 1, controller: 0, location: 1, sequence: 0, position: 10 },
        { code: 2, controller: 1, location: 8, sequence: 1, position: 10 },
        { code: 3, controller: 1, location: 4, sequence: 0, position: 1 },
        { code: 4, controller: 1, location: 2, sequence: 0, position: 10 },
      ],
    }

    expect(codes(askFor(0, ask))).toEqual([1, 0, 3, 0])
    expect(codes(askFor(0, { type: 'select_effectyn', player: 0, code: 5, ...at(1, 4, 8), description: '0' }))).toEqual([0])
  })

  it('las consultas del campo llegan sólo de las cartas que se ven', () => {
    const stat = (controller: 0 | 1, position: number) => ({ code: ACE, controller, location: 4, sequence: 0, position, attack: 2500, defense: 2100, level: 7 })

    expect(statsFor(1, [stat(0, 1), stat(0, 8), stat(1, 8)])).toEqual([stat(0, 1), stat(1, 8)])
  })
})
