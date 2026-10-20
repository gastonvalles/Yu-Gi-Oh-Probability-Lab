import { describe, expect, it } from 'vitest'

import type { CardEffectOfText } from '../app/card-effect-data'
import { EFFECT_FACT } from '../app/card-effect-facts'
import { EFFECT_PLACE } from '../app/card-effect-map'
import { effectSentences } from '../app/card-text'
import { respondersOf, windowOpen, type ResponderCard } from '../app/mat-responders'
import { createMatState, type MatPhase, type MatState, type Placed } from '../app/practice-mat'

const kindOf = (frame: 'monster' | 'spell' | 'trap' | 'pendulum') => ({ monster: frame === 'monster' || frame === 'pendulum', spell: frame === 'spell', trap: frame === 'trap', pendulum: frame === 'pendulum' })

/** Una carta con un efecto del texto y lo confirmado de él (lo que daría `getCardEffectMap`). */
function withEffect(frame: 'monster' | 'spell' | 'trap' | 'pendulum', text: string, facts: number, places: number): ResponderCard {
  const [sentence] = effectSentences(text)

  return { kind: kindOf(frame), quickPlay: false, effects: [{ start: 0, facts, places, sentence: sentence! } satisfies CardEffectOfText] }
}

const monster = (text: string, facts: number, places: number) => withEffect('monster', text, facts, places)

const placed = (id: string, pos: Placed['pos'] = 'atk'): Placed => ({ id, pos, counters: 0, materials: [] })

/** Una mesa con lo que se pide (el resto vacío). */
function table(parts: Partial<Pick<MatState, 'hand' | 'gy' | 'field'>> & { mz?: Array<Placed | null>; st?: Array<Placed | null> }): MatState {
  const state = createMatState([], [], 0)

  return {
    ...state,
    hand: parts.hand ?? [],
    gy: parts.gy ?? [],
    mz: parts.mz ?? state.mz,
    st: parts.st ?? state.st,
    field: parts.field ?? null,
  }
}

const QUICK = EFFECT_FACT.quick
const FREE = '(Quick Effect): You can discard this card; draw 1 card.'
const OPPONENT_MAIN = "During your opponent's Main Phase (Quick Effect): You can target 1 monster; destroy it."
const WHEN = 'When a card or effect is activated (Quick Effect): You can discard this card; negate that effect.'

const cards: Record<string, ResponderCard> = {
  'hand-free': monster(FREE, QUICK, EFFECT_PLACE.hand),
  'hand-when': monster(WHEN, QUICK, EFFECT_PLACE.hand),
  'hand-only-field': monster(FREE, QUICK, EFFECT_PLACE.field),
  'hand-no-quick': monster('If this card is sent to the GY: You can draw 1 card.', 0, EFFECT_PLACE.hand),
  'field-free': monster(FREE, QUICK, EFFECT_PLACE.field),
  'field-opponent-main': monster(OPPONENT_MAIN, QUICK, EFFECT_PLACE.field),
  'grave-free': monster(FREE, QUICK, EFFECT_PLACE.grave),
  'continuous-quick': withEffect('trap', FREE, QUICK, EFFECT_PLACE.spellTrap),
  'continuous-no-quick': withEffect('spell', 'Once per turn: You can draw 1 card.', 0, EFFECT_PLACE.spellTrap),
  'field-spell-quick': withEffect('spell', FREE, QUICK, EFFECT_PLACE.spellTrap),
  'scale-quick': withEffect('pendulum', FREE, QUICK, EFFECT_PLACE.pendulum),
  'grave-trap': withEffect('trap', '(Quick Effect): You can banish this card from your GY; draw 1 card.', QUICK, EFFECT_PLACE.grave),
  trap: { kind: kindOf('trap'), quickPlay: false, effects: undefined },
  'quick-play': { kind: kindOf('spell'), quickPlay: true, effects: undefined },
  'normal-spell': { kind: kindOf('spell'), quickPlay: false, effects: undefined },
  'no-data': { kind: kindOf('monster'), quickPlay: false, effects: undefined },
}
const cardOf = (id: string): ResponderCard | null => cards[id] ?? null

describe('windowOpen: cuándo un efecto rápido se puede activar sin que antes pase algo', () => {
  const window = (text: string) => effectSentences(text)[0]!.window

  it('«(Quick Effect)» solo: en cualquier turno y fase', () => {
    for (const phase of ['draw', 'standby', 'main1', 'battle', 'main2', 'end'] as MatPhase[]) {
      expect(windowOpen(window(FREE), phase, false)).toBe(true)
      expect(windowOpen(window(FREE), phase, true)).toBe(true)
    }
  })

  it('«During your opponent\'s Main Phase»: sólo en el turno del rival y en sus Main Phase', () => {
    expect(windowOpen(window(OPPONENT_MAIN), 'main1', false)).toBe(true)
    expect(windowOpen(window(OPPONENT_MAIN), 'main2', false)).toBe(true)
    expect(windowOpen(window(OPPONENT_MAIN), 'battle', false)).toBe(false)
    expect(windowOpen(window(OPPONENT_MAIN), 'main1', true)).toBe(false)
  })

  it('«During the Main or Battle Phase», «During your Main Phase» y «During either player\'s turn»', () => {
    const both = window('During the Main or Battle Phase (Quick Effect): You can discard this card; draw 1 card.')
    const mine = window('During your Main Phase (Quick Effect): You can discard this card; draw 1 card.')
    const either = window("During either player's turn (Quick Effect): You can discard this card; draw 1 card.")

    expect(windowOpen(both, 'battle', false)).toBe(true)
    expect(windowOpen(both, 'end', false)).toBe(false)
    expect(windowOpen(mine, 'main1', false)).toBe(false)
    expect(windowOpen(mine, 'main1', true)).toBe(true)
    expect(windowOpen(either, 'standby', false)).toBe(true)
  })

  it('con una condición («When…», «During the Battle Phase, if…», «If you control…») no hay ventana: no se sabe si se cumple', () => {
    expect(window(WHEN)).toBeNull()
    expect(window('During the Battle Phase, if your monster attacked (Quick Effect): You can discard this card; draw 1 card.')).toBeNull()
    expect(window('If you control a monster (Quick Effect): You can discard this card; draw 1 card.')).toBeNull()
    expect(windowOpen(null, 'main1', false)).toBe(false)
  })
})

describe('respondersOf: las cartas mías que pueden responder cuando el rival pregunta si hacés algo antes', () => {
  it('un monstruo con un efecto rápido confirmado que se activa desde donde está y sin condición: de la mano, del campo boca arriba y del Cementerio', () => {
    const state = table({ hand: ['hand-free'], mz: [placed('field-free'), null, null, null, null], gy: ['grave-free'] })

    expect(respondersOf(state, 'main1', false, cardOf)).toEqual([
      { id: 'hand-free', kind: 'hand' },
      { id: 'field-free', kind: 'field' },
      { id: 'grave-free', kind: 'grave' },
    ])
  })

  it('no ofrece lo que no se confirma: un efecto que espera un suceso, que se activa desde otro lugar, que no es rápido o del que no se sabe nada', () => {
    const state = table({ hand: ['hand-when', 'hand-only-field', 'hand-no-quick', 'no-data', 'desconocida'] })

    expect(respondersOf(state, 'main1', false, cardOf)).toEqual([])
  })

  it('un monstruo boca abajo (Colocado) no activa efectos', () => {
    expect(respondersOf(table({ mz: [placed('field-free', 'set'), null, null, null, null] }), 'main1', false, cardOf)).toEqual([])
  })

  it('una Trampa o una Mágica de Juego Rápido boca abajo pueden responder; una boca arriba o una Mágica Normal, no', () => {
    const state = table({ st: [placed('trap', 'set'), placed('quick-play', 'set'), placed('normal-spell', 'set'), placed('trap', 'atk'), null] })

    expect(respondersOf(state, 'battle', false, cardOf)).toEqual([
      { id: 'trap', kind: 'set' },
      { id: 'quick-play', kind: 'set' },
    ])
  })

  it('una Mágica o Trampa Continua boca arriba con un efecto rápido, la Mágica de Campo y una escala de Péndulo (zonas 0 y 4) responden desde donde están; una Continua sin efecto rápido, no', () => {
    const state = table({
      st: [placed('scale-quick'), placed('continuous-quick'), placed('continuous-no-quick'), placed('scale-quick'), placed('scale-quick')],
      field: placed('field-spell-quick'),
    })

    expect(respondersOf(state, 'main1', false, cardOf)).toEqual([
      { id: 'scale-quick', kind: 'field' },
      { id: 'continuous-quick', kind: 'field' },
      { id: 'scale-quick', kind: 'field' },
      { id: 'field-spell-quick', kind: 'field' },
    ])
  })

  it('una escala de Péndulo en una zona del medio no es una escala: no responde con su efecto de Péndulo', () => {
    expect(respondersOf(table({ st: [null, placed('scale-quick'), null, null, null] }), 'main1', false, cardOf)).toEqual([])
  })

  it('una Mágica o Trampa en el Cementerio con un efecto rápido que se activa desde ahí responde', () => {
    expect(respondersOf(table({ gy: ['grave-trap'] }), 'main1', false, cardOf)).toEqual([{ id: 'grave-trap', kind: 'grave' }])
  })

  it('la fase y el turno cuentan: un efecto «During your opponent\'s Main Phase» no responde en la Battle Phase', () => {
    const state = table({ mz: [placed('field-opponent-main'), null, null, null, null] })

    expect(respondersOf(state, 'main2', false, cardOf)).toEqual([{ id: 'field-opponent-main', kind: 'field' }])
    expect(respondersOf(state, 'battle', false, cardOf)).toEqual([])
    expect(respondersOf(state, 'main2', true, cardOf)).toEqual([])
  })

  it('una mesa sin nada que responda no ofrece nada', () => {
    expect(respondersOf(table({}), 'main1', false, cardOf)).toEqual([])
  })
})
