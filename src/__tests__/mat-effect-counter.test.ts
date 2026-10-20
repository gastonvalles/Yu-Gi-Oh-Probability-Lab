import { describe, expect, it } from 'vitest'

import type { CardEffectOfText } from '../app/card-effect-data'
import { EFFECT_FACT, effectFactNames, visibleFactNames } from '../app/card-effect-facts'
import { effectParts, effectSentences } from '../app/card-text'
import { EFFECT_PLACE } from '../app/card-effect-map'
import { countableEffects, effectChoices, effectKey, usageReminder, type Activation } from '../app/mat-assistant'
import type { MatAction } from '../app/practice-mat'
import { visibleTraits } from '../components/card-detail/CardEffectTraits'

// El contador por efecto (capa 2 del motor de cartas, `docs/motor-de-cartas.md`): lo que cuenta la mesa de cada efecto de una carta con varios.

const activate = (id: string): MatAction => ({ type: 'activate', id })
const used = (id: string, turn: number, key: string): Activation => ({ action: activate(id), turn, key })

// Masked HERO Dusk Crow: dos efectos, cada uno de «una vez por turno» por nombre (el texto lo dice de «cada efecto»); el primero se activa desde la mano y paga un costo.
const DUSK_CROW =
  'If this card is in your hand: You can banish 1 "HERO" monster from your GY; Special Summon this card. If this card is Normal or Special Summoned: You can add 1 "Masked HERO" monster from your Deck or GY to your hand. You can only use each effect of "Masked HERO Dusk Crow" once per turn.'
const ONCE = EFFECT_FACT.once | EFFECT_FACT.hardOnce

/** Los efectos de un texto con lo confirmado de cada uno (lo que daría `getCardEffectMap`). */
const effectsOf = (text: string, ...facts: number[]): CardEffectOfText[] => effectSentences(text).map((sentence, index) => ({ start: sentence.start, facts: facts[index] ?? 0, places: 0, sentence }))
/** Lo mismo, con desde dónde se activa cada efecto. */
const effectsAt = (text: string, ...confirmed: Array<[facts: number, places: number]>): CardEffectOfText[] => effectSentences(text).map((sentence, index) => ({ start: sentence.start, facts: confirmed[index]?.[0] ?? 0, places: confirmed[index]?.[1] ?? 0, sentence }))

describe('countableEffects: cuándo la mesa cuenta los efectos de una carta uno por uno', () => {
  it('con varios efectos y al menos un límite confirmado; con uno solo, sin límites o sin datos, no (se activa directo, como siempre)', () => {
    const two = effectsOf(DUSK_CROW, ONCE | EFFECT_FACT.cost, ONCE)

    expect(countableEffects(two)).toBe(two)
    expect(countableEffects(effectsOf(DUSK_CROW, 0, ONCE))).toHaveLength(2)
    expect(countableEffects(effectsOf(DUSK_CROW, EFFECT_FACT.cost, EFFECT_FACT.quick))).toBeNull()
    expect(countableEffects(effectsOf('If this card is sent to the GY: You can draw 1 card.', ONCE))).toBeNull()
    expect(countableEffects(undefined)).toBeNull()
    expect(countableEffects([])).toBeNull()
  })
})

describe('effectKey: la clave del uso de un efecto', () => {
  it('la del límite del efecto (por nombre o por carta) y su lugar: dos efectos de la misma carta no comparten clave', () => {
    expect(effectKey(ONCE, 10808715, 'card-10808715-1', 0)).toBe('n:10808715#0')
    expect(effectKey(ONCE, 10808715, 'card-10808715-2', 1)).toBe('n:10808715#1')
    expect(effectKey(EFFECT_FACT.once, 10808715, 'card-10808715-1', 1)).toBe('i:card-10808715-1#1')
  })

  it('cada efecto cuenta lo suyo: usar el primero no avisa al activar el segundo, y repetir el primero sí', () => {
    const first = effectKey(ONCE, 10808715, 'a', 0)
    const second = effectKey(ONCE, 10808715, 'a', 1)
    const past = [used('a', 5, first)]

    expect(usageReminder(ONCE, past, second, 5)).toBeNull()
    expect(usageReminder(ONCE, past, first, 5)).toBe('turnByName')
    // Por nombre: otra copia comparte el límite de ese mismo efecto.
    expect(usageReminder(ONCE, past, effectKey(ONCE, 10808715, 'b', 0), 5)).toBe('turnByName')
    expect(usageReminder(ONCE, past, first, 6)).toBeNull()
  })
})

describe('effectChoices: el segundo paso de «Activar efecto»', () => {
  const effects = effectsOf(DUSK_CROW, ONCE | EFFECT_FACT.cost, ONCE)

  it('un renglón por efecto: lo que hace, textual (arriba su número y cuándo se activa, abajo sus rasgos confirmados), y «Otro efecto» al final, sin efecto elegido', () => {
    const choices = effectChoices('c1', 10808715, effects, [], 3)

    expect(choices.map((choice) => choice.lead)).toEqual(['Efecto 1 · If this card is in your hand', 'Efecto 2 · If this card is Normal or Special Summoned', undefined])
    expect(choices.map((choice) => choice.label)).toEqual([
      'You can banish 1 "HERO" monster from your GY; Special Summon this card.',
      'You can add 1 "Masked HERO" monster from your Deck or GY to your hand.',
      'Otro efecto',
    ])
    expect(choices.map((choice) => choice.hint)).toEqual(['1 vez por turno, por nombre · Con costo', '1 vez por turno, por nombre', undefined])
    expect(choices.map((choice) => choice.action)).toEqual([
      { type: 'activate', id: 'c1', effect: 0 },
      { type: 'activate', id: 'c1', effect: 1 },
      { type: 'activate', id: 'c1' },
    ])
  })

  it('no pierde nada de la frase: el cuándo y lo que hace, juntos, son el texto del efecto; y cada renglón sabe qué pedazo del texto de la carta es', () => {
    const choices = effectChoices('c1', 10808715, effects, [], 3)

    effects.forEach((effect, index) => {
      const { when, what } = effectParts(effect.sentence)
      const choice = choices[index]!

      expect(`${when}: ${what}`).toBe(effect.sentence.text)
      expect(choice.label).toBe(what)
      expect(choice.lead).toBe(`Efecto ${index + 1} · ${when}`)
      expect(choice.preview).toEqual({ start: effect.start, end: effect.start + effect.sentence.text.length })
      expect(DUSK_CROW.slice(choice.preview!.start, choice.preview!.end)).toBe(effect.sentence.text)
    })

    expect(choices[2]!.preview).toBeUndefined()
  })

  it('un efecto sin encabezado no lleva «cuándo»: arriba sólo su número, y lo que hace es la frase entera', () => {
    const plain = effectsOf('If this card is sent to the GY: You can draw 1 card. You can discard 1 card; draw 1 card.', ONCE, ONCE)
    const choices = effectChoices('c1', 77, plain, [], 3)

    expect(choices[1]!.lead).toBe('Efecto 2')
    expect(choices[1]!.label).toBe('You can discard 1 card; draw 1 card.')
  })

  it('dice desde dónde se activa cuando las dos fuentes lo confirman (la mano o el Cementerio): el campo no se dice', () => {
    const where = effectsAt(DUSK_CROW, [ONCE, EFFECT_PLACE.hand], [ONCE, EFFECT_PLACE.field])
    const choices = effectChoices('c1', 10808715, where, [], 3)

    expect(choices[0]!.hint).toBe('Desde la mano · 1 vez por turno, por nombre')
    expect(choices[1]!.hint).toBe('1 vez por turno, por nombre')
    expect(effectChoices('c1', 10808715, effectsAt(DUSK_CROW, [ONCE, EFFECT_PLACE.grave], [ONCE, 0]), [], 3)[0]!.hint).toBe('Desde el Cementerio · 1 vez por turno, por nombre')
  })

  it('dice si ya se usó este turno (sólo ese efecto) y sigue ofreciéndolo: avisa, no frena', () => {
    const past = [used('c1', 3, effectKey(ONCE | EFFECT_FACT.cost, 10808715, 'c1', 0))]
    const choices = effectChoices('c1', 10808715, effects, past, 3)

    expect(choices[0]!.hint).toBe('Ya lo usaste este turno · 1 vez por turno, por nombre · Con costo')
    expect(choices[1]!.hint).toBe('1 vez por turno, por nombre')
    // Otro turno: ya no.
    expect(effectChoices('c1', 10808715, effects, past, 4)[0]!.hint).toBe('1 vez por turno, por nombre · Con costo')
  })

  it('un efecto de una vez por duelo ya usado lo dice en cualquier turno posterior', () => {
    const duel = effectsOf('If this card is sent to the GY: You can draw 1 card. When this card is Normal Summoned: You can discard 1 card; draw 1 card. You can only use the second effect once per Duel.', ONCE, EFFECT_FACT.perDuel)
    const past = [used('c1', 1, effectKey(EFFECT_FACT.perDuel, 77, 'c1', 1))]

    expect(effectChoices('c1', 77, duel, past, 6)[1]!.hint).toBe('Ya lo usaste en este duelo · 1 vez por duelo')
    expect(effectChoices('c1', 77, duel, past, 6)[0]!.hint).toBe('1 vez por turno, por nombre')
  })
})

describe('visibleFactNames: los rasgos que se muestran, los mismos en el detalle de la carta y en la lista de efectos', () => {
  it('coincide con lo que dibuja CardEffectTraits para cualquier combinación de hechos', () => {
    const all = Object.values(EFFECT_FACT).reduce((mask, bit) => mask | bit, 0)

    for (let facts = 0; facts <= all; facts += 1) {
      const names = effectFactNames(facts)

      expect(visibleTraits(names).map((trait) => trait.fact), String(facts)).toEqual(visibleFactNames(names))
    }
  })

  it('«por nombre» ya dice «una vez por turno»: no se repite', () => {
    expect(visibleFactNames(['once', 'hardOnce', 'cost'])).toEqual(['hardOnce', 'cost'])
    expect(visibleFactNames(['once'])).toEqual(['once'])
  })
})
