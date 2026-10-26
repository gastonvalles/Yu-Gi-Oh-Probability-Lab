import { OcgLocation, OcgPosition } from 'ocgcore-wasm'
import { ANSWER_SHAPES, ASK_SHAPES, LOCATION, POSITION, parseAutoCommand, parseAutoEvent, splitDesc, type AutoEvent } from '../app/auto/protocol'

const create = { t: 'create', seed: 7, flags: '1', players: [{ lp: 8000, hand: 5, draw: 1 }, { lp: 8000, hand: 5, draw: 1 }], decks: [{ main: [1, 2], extra: [], hand: [] }, { main: [3], extra: [4], hand: [3] }] }

describe('el protocolo de los duelos automáticos', () => {
  it('copia las constantes del núcleo sin importarlo', () => {
    expect(LOCATION).toMatchObject({ DECK: OcgLocation.DECK, HAND: OcgLocation.HAND, MZONE: OcgLocation.MZONE, SZONE: OcgLocation.SZONE, GRAVE: OcgLocation.GRAVE, REMOVED: OcgLocation.REMOVED, EXTRA: OcgLocation.EXTRA, OVERLAY: OcgLocation.OVERLAY })
    expect(POSITION).toMatchObject({ FACEUP_ATTACK: OcgPosition.FACEUP_ATTACK, FACEDOWN_DEFENSE: OcgPosition.FACEDOWN_DEFENSE, FACEUP: OcgPosition.FACEUP, FACEDOWN: OcgPosition.FACEDOWN })
  })

  it('parte el `desc` como lo arma `aux.Stringid` (carta << 20 | n, más de 32 bits); con carta 0 es un texto del sistema', () => {
    // Lo que manda el núcleo para el `str4` de Radiant Typhoon Manifestation (94103142): «Search 1 "Mystical Space Typhoon"».
    expect(splitDesc('98674296225795')).toEqual({ code: 94103142, n: 3 })
    expect(splitDesc(String((999_999_999n << 20n) | 15n))).toEqual({ code: 999_999_999, n: 15 })
    expect(splitDesc('573')).toEqual({ code: 0, n: 573 })
    expect(splitDesc('0')).toEqual({ code: 0, n: 0 })
  })

  it('tiene una respuesta para cada una de las 21 preguntas', () => {
    expect(Object.keys(ASK_SHAPES)).toHaveLength(21)
    expect(Object.keys(ANSWER_SHAPES).sort()).toEqual(Object.keys(ASK_SHAPES).sort())
  })

  it('acepta los comandos bien formados, como objeto o como texto, y devuelve una copia', () => {
    expect(parseAutoCommand(create)).toEqual(create)
    expect(parseAutoCommand(JSON.stringify(create))).toEqual(create)
    expect(parseAutoCommand({ t: 'answer', askId: 3, answer: { type: 'select_card', indices: [0, 2], extra: 1 } })).toEqual({ t: 'answer', askId: 3, answer: { type: 'select_card', indices: [0, 2] } })
    expect(parseAutoCommand({ t: 'answer', askId: 3, answer: { type: 'select_chain', index: null } })).toEqual({ t: 'answer', askId: 3, answer: { type: 'select_chain', index: null } })
    // Crear con respuestas ya dadas: el duelo se re-simula hasta ahí (cancelar en otro Worker).
    expect(parseAutoCommand({ ...create, answers: [{ type: 'select_chain', index: null, x: 1 }] })).toEqual({ ...create, answers: [{ type: 'select_chain', index: null }] })
    expect(parseAutoCommand({ t: 'rewind', to: 0 })).toEqual({ t: 'rewind', to: 0 })
    expect(parseAutoCommand({ t: 'destroy', x: 1 })).toEqual({ t: 'destroy' })
  })

  it('el create del duelo por enlace lleva la clave (hex de 64, en minúsculas); una que no es así descarta el comando', () => {
    const key = 'a1'.repeat(32)

    expect(parseAutoCommand({ ...create, key })).toEqual({ ...create, key })
    expect(parseAutoCommand(JSON.stringify({ ...create, key }))).toEqual({ ...create, key })
    expect(parseAutoCommand(create)).not.toHaveProperty('key')
    for (const bad of [key.toUpperCase(), key.slice(1), `${key}0`, `${key.slice(1)}g`, '', null, 1234, ['a1']]) expect(parseAutoCommand({ ...create, key: bad })).toBeNull()
  })

  it('rechaza los comandos mal formados', () => {
    const bad = [
      null,
      '{',
      { t: 'nada' },
      { ...create, seed: -1 },
      { ...create, seed: 2 ** 32 },
      { ...create, flags: 16 },
      { ...create, players: [create.players[0]] },
      { ...create, decks: [create.decks[0], { main: [1], extra: [], hand: [1, 2] }] },
      { ...create, decks: [create.decks[0], { main: [0], extra: [], hand: [] }] },
      { ...create, answers: [{ type: 'select_yesno', yes: 1 }] },
      { ...create, answers: {} },
      { t: 'answer', askId: 0, answer: { type: 'select_yesno', yes: true } },
      { t: 'answer', askId: 1, answer: { type: 'select_yesno', yes: 1 } },
      { t: 'answer', askId: 1, answer: { type: 'select_nada' } },
      { t: 'answer', askId: 1, answer: { type: 'announce_race', races: 4 } },
      { t: 'rewind', to: 1.5 },
    ]

    for (const value of bad) expect(parseAutoCommand(value)).toBeNull()
  })

  it('acepta los eventos bien formados y descarta los campos de más', () => {
    const events: AutoEvent = {
      t: 'events',
      seat: 1,
      n: 2,
      events: [
        { type: 'move', card: 0, from: { controller: 0, location: 1, sequence: 0, position: 10 }, to: { controller: 0, location: 2, sequence: 1, position: 10 } },
        { type: 'chaining', code: 14558127, controller: 1, location: 2, sequence: 0, position: 10, triggering_controller: 1, triggering_location: 2, triggering_sequence: 0, description: '233009', chain_size: 1 },
        { type: 'attack', card: { controller: 0, location: 4, sequence: 2, position: 1 }, target: null },
        { type: 'waiting' },
      ],
    }
    const ask: AutoEvent = { t: 'ask', seat: 0, askId: 4, ask: { type: 'select_option', player: 0, options: ['18446744073709551615'] }, title: '500' }

    expect(parseAutoEvent(events)).toEqual(events)
    expect(parseAutoEvent(JSON.stringify(ask))).toEqual(ask)
    expect(parseAutoEvent({ ...ask, ask: { ...ask.ask, secret: 1 } })).toEqual(ask)
    expect(parseAutoEvent({ t: 'end', winner: 1, reason: 0 })).toEqual({ t: 'end', winner: 1, reason: 0 })
    expect(parseAutoEvent({ t: 'fault', kind: 'rules', message: 'x', cards: [1] })).toEqual({ t: 'fault', kind: 'rules', message: 'x', cards: [1] })
    expect(parseAutoEvent({ t: 'fault', kind: 'nada', message: 'x' })).toBeNull()
    expect(parseAutoEvent({ t: 'stats', seat: 0, cards: [{ code: 1, controller: 0, location: 4, sequence: 0, position: 1, attack: 2500, defense: 2000, level: 7 }] })).not.toBeNull()
  })

  it('rechaza los eventos mal formados', () => {
    const bad = [
      { t: 'events', seat: 2, n: 0, events: [] },
      { t: 'events', seat: 0, n: 0, events: [{ type: 'move', card: 1 }] },
      { t: 'events', seat: 0, n: 0, events: [{ type: 'nada' }] },
      { t: 'events', seat: 0, n: 0, events: [{ type: 'chaining', code: 1, controller: 0, location: 2, sequence: 0, position: 1, triggering_controller: 0, triggering_location: 2, triggering_sequence: 0, description: 5, chain_size: 1 }] },
      { t: 'ask', seat: 0, askId: 1, ask: { type: 'select_option', player: 0, options: [1n] } },
      { t: 'ask', seat: 0, askId: 1, ask: { type: 'select_yesno', player: 3, description: '1' } },
      { t: 'end', winner: 3, reason: 0 },
      { t: 'loading', done: -1, total: 2 },
    ]

    for (const value of bad) expect(parseAutoEvent(value)).toBeNull()
  })

  it('declarar una carta: `cards` es opcional (un anfitrión de antes no lo manda) y, si viene, es una lista de códigos', () => {
    const ask = (extra: object) => ({ t: 'ask', seat: 0, askId: 3, ask: { type: 'announce_card', player: 0, opcodes: ['1', '1073741840'], ...extra } })

    expect(parseAutoEvent(ask({}))).toEqual(ask({}))
    expect(parseAutoEvent(JSON.stringify(ask({ cards: [46986414, 89631139] })))).toEqual(ask({ cards: [46986414, 89631139] }))
    for (const cards of [null, [1.5], ['46986414'], 46986414]) expect(parseAutoEvent(ask({ cards }))).toBeNull()
  })
})
