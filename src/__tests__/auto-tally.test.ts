import { createAdapter, type Adapter } from '../app/auto/adapter'
import { LOCATION as L, POSITION as P, type AutoEvent, type Seat, type WireEvent } from '../app/auto/protocol'
import { TALLY_CARDS, tallyFor } from '../app/auto/tally'

// Lo que cuentan las cartas (`tally.ts`), con los eventos públicos que recibe el adaptador: los mismos para los dos asientos (`referee.ts` los manda a los dos).
const SHATRANGA = 42410161
const NIBIRU = 27204311
const ASH = 14558127
const SPELL = 500
const types: Record<number, number> = { [SHATRANGA]: 0x2001, [NIBIRU]: 0x21, [ASH]: 0x21, [SPELL]: 0x2 }
const typeOf = (code: number) => types[code] ?? 0x21
/** El asiento 0 tiene a Shatranga y a Nibiru; el 1, monstruos de relleno (111). */
const deck0 = [SPELL, NIBIRU, SHATRANGA, SHATRANGA]
const make = (seat: Seat) => createAdapter({ seat, mine: { deck: seat === 0 ? deck0 : [111, 111, 111, 111, 111, 111, 111, ASH], extra: [] }, theirs: { deck: 8, extra: 0 }, typeOf })
const at = (controller: Seat, location: number, sequence: number, position: number = P.FACEUP_ATTACK) => ({ controller, location, sequence, position })
const move = (card: number, from: ReturnType<typeof at>, to: ReturnType<typeof at>): WireEvent => ({ type: 'move', card, from, to })
const chaining = (code: number, place: ReturnType<typeof at>): WireEvent => ({ type: 'chaining', code, ...place, triggering_controller: place.controller, triggering_location: place.location, triggering_sequence: place.sequence, description: '0', chain_size: 1 })
const summon = (type: 'summoning' | 'spsummoning', code: number, to: ReturnType<typeof at>): WireEvent => ({ type, code, controller: to.controller, location: to.location, sequence: to.sequence, position: to.position })
/** Lo que el árbitro le deja ver a cada asiento: lo de la mano y el deck del otro, sin código. */
const view = (seat: Seat, event: WireEvent): WireEvent => (event.type === 'draw' && event.player !== seat ? { ...event, drawn: event.drawn.map((card) => ({ ...card, code: 0 })) } : event.type === 'move' && event.to.location === L.HAND && event.to.controller !== seat ? { ...event, card: 0 } : event)
const feed = (adapters: Adapter[], ...list: WireEvent[]) => adapters.forEach((adapter, seat) => adapter.apply({ t: 'events', seat: seat as Seat, n: 0, events: list.map((event) => view(seat as Seat, event)) } satisfies AutoEvent))

const draw = (player: Seat, ...codes: number[]): WireEvent => ({ type: 'draw', player, drawn: codes.map((code) => ({ code, position: 10 })) })
/** Shatranga del asiento 0, boca arriba en su Mágicas y Trampas 2 (como la pone Bastion). */
const shatrangaUp = (seat: Seat, adapter: Adapter) => {
  const id = (seat === 0 ? adapter.mine : adapter.theirs.state).st[2]?.id

  return id ? tallyFor(adapter.overlay.tally, seat === 0 ? 'mine' : 'theirs', id, SHATRANGA, 'st') : null
}

describe('lo que cuentan las cartas, con los eventos públicos', () => {
  it('las filas de la tabla', () => {
    expect(TALLY_CARDS[SHATRANGA]).toEqual({ counts: 'effects', where: 'st', limit: 5 })
    expect(TALLY_CARDS[NIBIRU]).toEqual({ counts: 'summons', where: 'hand', limit: 5 })
  })

  it('Shatranga: cuenta los efectos de monstruo del rival desde que llega, no los suyos ni Mágicas; las dos mesas ven el mismo número; vuelve a 0 con el turno y al irse', () => {
    const both = [make(0), make(1)]

    feed(both, { type: 'new_turn', player: 1 }, draw(0, SHATRANGA, SHATRANGA, NIBIRU, SPELL), draw(1, 111, 111, ASH))
    // Antes de llegar no cuenta: un efecto del rival desde la mano.
    feed(both, move(ASH, at(1, L.HAND, 2, 10), at(1, L.GRAVE, 0)), chaining(ASH, at(1, L.GRAVE, 0)))
    expect(shatrangaUp(0, both[0]!)).toBeNull()
    feed(both, move(SHATRANGA, at(0, L.HAND, 0, 10), at(0, L.SZONE, 2)))
    expect(shatrangaUp(0, both[0]!)).toEqual({ count: 0, limit: 5, counts: 'effects' })
    // Dos efectos de monstruo del rival (campo y cementerio), uno suyo de una Mágica y uno de Shatranga misma como Mágica, uno del dueño: cuentan los dos primeros.
    feed(both, move(111, at(1, L.HAND, 0, 10), at(1, L.MZONE, 0)), summon('summoning', 111, at(1, L.MZONE, 0)), { type: 'summoned' }, chaining(111, at(1, L.MZONE, 0)), chaining(ASH, at(1, L.GRAVE, 0)))
    feed(both, chaining(SPELL, at(1, L.SZONE, 1)), chaining(SHATRANGA, at(0, L.SZONE, 2)), chaining(111, at(0, L.MZONE, 1)))
    expect(shatrangaUp(0, both[0]!)).toEqual({ count: 2, limit: 5, counts: 'effects' })
    // La mesa del rival dice lo mismo (su espejo de mi campo).
    expect(shatrangaUp(1, both[1]!)).toEqual({ count: 2, limit: 5, counts: 'effects' })
    // Hasta el umbral.
    feed(both, chaining(111, at(1, L.MZONE, 0)), chaining(111, at(1, L.MZONE, 0)), chaining(111, at(1, L.MZONE, 0)))
    expect(shatrangaUp(0, both[0]!)?.count).toBe(5)
    expect(shatrangaUp(1, both[1]!)?.count).toBe(5)
    // El turno nuevo la vuelve a 0.
    feed(both, { type: 'new_turn', player: 0 })
    expect(shatrangaUp(0, both[0]!)?.count).toBe(0)
    feed(both, chaining(111, at(1, L.MZONE, 0)))
    expect(shatrangaUp(0, both[0]!)?.count).toBe(1)
    // Se va al cementerio: deja de contar; si vuelve, empieza de 0.
    feed(both, move(SHATRANGA, at(0, L.SZONE, 2), at(0, L.GRAVE, 0)))
    expect(shatrangaUp(0, both[0]!)).toBeNull()
    expect(both[0]!.overlay.tally.since).toEqual({})
  })

  it('Nibiru: las Invocaciones del rival del turno (también las que entran juntas), no la negada ni las propias; deshacer (otro adaptador con menos eventos) da el número de antes', () => {
    const nibiru = (adapter: Adapter) => tallyFor(adapter.overlay.tally, 'mine', `card-${NIBIRU}-1`, NIBIRU, 'hand')
    const opening: WireEvent[] = [{ type: 'new_turn', player: 1 }, draw(0, NIBIRU), draw(1, 111, 111, 111, 111, 111)]
    const steps: WireEvent[][] = [
      [move(111, at(1, L.HAND, 0, 10), at(1, L.MZONE, 0)), summon('summoning', 111, at(1, L.MZONE, 0)), { type: 'summoned' }],
      // Dos juntas (una Invocación por Péndulo): cuentan dos.
      [move(111, at(1, L.HAND, 0, 10), at(1, L.MZONE, 1)), move(111, at(1, L.HAND, 0, 10), at(1, L.MZONE, 2)), summon('spsummoning', 111, at(1, L.MZONE, 1)), summon('spsummoning', 111, at(1, L.MZONE, 2)), { type: 'spsummoned' }],
      // Negada: llega y se va sin su `summoned`.
      [move(111, at(1, L.HAND, 0, 10), at(1, L.MZONE, 3)), summon('summoning', 111, at(1, L.MZONE, 3)), move(111, at(1, L.MZONE, 3), at(1, L.GRAVE, 0))],
    ]
    const both = [make(0), make(1)]

    feed(both, ...opening)
    expect(nibiru(both[0]!)).toEqual({ count: 0, limit: 5, counts: 'summons' })
    feed(both, ...steps[0]!)
    feed(both, ...steps[1]!)
    feed(both, ...steps[2]!)
    expect(nibiru(both[0]!)?.count).toBe(3)
    // Lo mismo desde la mesa del rival: sus Invocaciones son las de su lado.
    expect(both[1]!.overlay.tally.turn.summons).toEqual({ mine: 3, theirs: 0 })
    // Lo que Invoca el dueño de Nibiru no cuenta para la suya.
    feed(both, move(SPELL, at(0, L.DECK, 2, 10), at(0, L.MZONE, 0)), summon('spsummoning', SPELL, at(0, L.MZONE, 0)), { type: 'spsummoned' })
    expect(nibiru(both[0]!)?.count).toBe(3)
    // Deshacer re-simula con un adaptador nuevo: con un paso menos, el número de antes.
    const back = make(0)

    back.apply({ t: 'events', seat: 0, n: 0, events: [...opening, ...steps[0]!].map((event) => view(0, event)) })
    expect(nibiru(back)?.count).toBe(1)
    // Con el turno, 0.
    feed(both, { type: 'new_turn', player: 0 })
    expect(nibiru(both[0]!)?.count).toBe(0)
  })

  it('una Invocación durante un eslabón es de quien lo resuelve (Monster Reborn sobre una del otro)', () => {
    const both = [make(0), make(1)]

    feed(both, { type: 'new_turn', player: 0 }, draw(0, SPELL), draw(1, 111), move(111, at(1, L.HAND, 0, 10), at(1, L.GRAVE, 0)))
    feed(both, move(SPELL, at(0, L.HAND, 0, 10), at(0, L.SZONE, 0)), chaining(SPELL, at(0, L.SZONE, 0)), { type: 'chained', chain_size: 1 }, { type: 'chain_solving', chain_size: 1 }, move(111, at(1, L.GRAVE, 0), at(0, L.MZONE, 0)), summon('spsummoning', 111, at(0, L.MZONE, 0)), { type: 'spsummoned' })
    expect(both[0]!.overlay.tally.turn.summons).toEqual({ mine: 1, theirs: 0 })
    expect(both[1]!.overlay.tally.turn.summons).toEqual({ mine: 0, theirs: 1 })
  })

  it('cada cambio sale con su lugar en la tanda (`at`, contado en `order`): la mesa muestra el de la jugada a la que llegó', () => {
    const adapter = make(0)

    adapter.apply({ t: 'events', seat: 0, n: 0, events: [{ type: 'new_turn', player: 1 }, draw(0, SHATRANGA), move(SHATRANGA, at(0, L.HAND, 0, 10), at(0, L.SZONE, 2))] })
    const out = adapter.apply({ t: 'events', seat: 0, n: 0, events: [draw(1, 111), chaining(111, at(1, L.HAND, 0, 10)), chaining(111, at(1, L.HAND, 0, 10))] })

    // El robo y cada activación son una jugada; el número sube después de la suya.
    expect(out.order).toEqual(['theirs', 'theirs', 'theirs'])
    expect(out.tally.map((step) => [step.at, step.tally.turn.effects.theirs])).toEqual([
      [2, 1],
      [3, 2],
    ])
  })

  it('sin nada que contar, el mismo objeto (la mesa no se redibuja)', () => {
    const adapter = make(0)
    const before = adapter.overlay.tally

    adapter.apply({ t: 'events', seat: 0, n: 0, events: [draw(0, SPELL), { type: 'new_phase', phase: 4 }] })
    expect(adapter.overlay.tally).toBe(before)
  })
})
