import { afterEach, describe, expect, it } from 'vitest'

import { setCardEffectMapForTests, type CardEffectOfText } from '../app/card-effect-data'
import { EFFECT_FACT, effectFactNames, visibleFactNames } from '../app/card-effect-facts'
import { effectParts, effectSentences } from '../app/card-text'
import { EFFECT_PLACE } from '../app/card-effect-map'
import { activationFacts, cardEffects, countableEffects, effectChoices, effectDetail, effectKey, LIMIT_FACTS, usageReminder, type Activation } from '../app/mat-assistant'
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

describe('countableEffects: cuándo la mesa lleva los efectos de una carta uno por uno', () => {
  it('con varios efectos, tengan o no un límite confirmado (toda carta con varios pregunta cuál: no hay inconsistencias); con uno solo o sin datos, no (se activa directo)', () => {
    const two = effectsOf(DUSK_CROW, ONCE | EFFECT_FACT.cost, ONCE)

    expect(countableEffects(two)).toBe(two)
    expect(countableEffects(effectsOf(DUSK_CROW, 0, ONCE))).toHaveLength(2)
    // Sin ningún límite de uso: antes se activaba directo y a veces el menú preguntaba y a veces no (Gastón, 2026-10-20).
    expect(countableEffects(effectsOf(DUSK_CROW, EFFECT_FACT.cost, EFFECT_FACT.quick))).toHaveLength(2)
    expect(countableEffects(effectsOf(DUSK_CROW))).toHaveLength(2)
    expect(countableEffects(effectsOf('If this card is sent to the GY: You can draw 1 card.', ONCE))).toBeNull()
    expect(countableEffects(effectsOf('Cannot be Normal Summoned.'))).toBeNull()
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

  it('dos efectos que comparten el límite (shared) tienen la clave de la carta entera, la misma de la activación: usar uno avisa al usar el otro', () => {
    const SHARED = ONCE | EFFECT_FACT.shared
    const first = effectKey(SHARED, 10808715, 'a', 0)
    const second = effectKey(SHARED, 10808715, 'a', 1)

    expect(first).toBe('n:10808715')
    expect(second).toBe(first)
    // La activación de la carta (que comparte el límite) cuenta con la clave de la carta: es la misma.
    expect(first).toBe(effectKey(SHARED, 10808715, 'a', 7))
    expect(usageReminder(SHARED, [used('a', 5, first)], second, 5)).toBe('turnByName')
    expect(usageReminder(SHARED, [used('a', 5, first)], second, 6)).toBeNull()
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

  it('un renglón por efecto, ni uno más (son todos los de la carta: no hay un «otro»): lo que hace, textual, con arriba su número y cuándo se activa y abajo sus rasgos confirmados', () => {
    const choices = effectChoices('c1', 10808715, effects, [], 3)

    expect(choices.map((choice) => choice.lead)).toEqual(['Efecto 1 · If this card is in your hand', 'Efecto 2 · If this card is Normal or Special Summoned'])
    expect(choices.map((choice) => choice.label)).toEqual([
      'You can banish 1 "HERO" monster from your GY; Special Summon this card.',
      'You can add 1 "Masked HERO" monster from your Deck or GY to your hand.',
    ])
    expect(choices.map((choice) => choice.hint)).toEqual(['1 vez por turno, por nombre · Con costo', '1 vez por turno, por nombre'])
    expect(choices.map((choice) => choice.action)).toEqual([
      { type: 'activate', id: 'c1', effect: 0 },
      { type: 'activate', id: 'c1', effect: 1 },
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
  })

  it('un efecto sin encabezado no lleva «cuándo»: arriba sólo su número, y lo que hace es la frase entera', () => {
    const plain = effectsOf('If this card is sent to the GY: You can draw 1 card. You can discard 1 card; draw 1 card.', ONCE, ONCE)
    const choices = effectChoices('c1', 77, plain, [], 3)

    expect(choices[1]!.lead).toBe('Efecto 2')
    expect(choices[1]!.label).toBe('You can discard 1 card; draw 1 card.')
  })

  it('dice desde dónde se activa cada efecto cuando las dos fuentes lo confirman y la carta tiene efectos de lugares distintos: la mano, el Cementerio, el campo o la Zona de Péndulo', () => {
    const where = effectsAt(DUSK_CROW, [ONCE, EFFECT_PLACE.hand], [ONCE, EFFECT_PLACE.field])
    const choices = effectChoices('c1', 10808715, where, [], 3)

    expect(choices[0]!.hint).toBe('Desde la mano · 1 vez por turno, por nombre')
    expect(choices[1]!.hint).toBe('Desde el campo · 1 vez por turno, por nombre')
    expect(effectChoices('c1', 10808715, effectsAt(DUSK_CROW, [ONCE, EFFECT_PLACE.grave], [ONCE, 0]), [], 3)[0]!.hint).toBe('Desde el Cementerio · 1 vez por turno, por nombre')
    expect(effectChoices('c1', 10808715, effectsAt(DUSK_CROW, [ONCE, EFFECT_PLACE.pendulum], [ONCE, EFFECT_PLACE.field]), [], 3).map((choice) => choice.hint)).toEqual(['Desde la Zona de Péndulo · 1 vez por turno, por nombre', 'Desde el campo · 1 vez por turno, por nombre'])
    // Una Mágica o Trampa Continua con dos efectos: la zona de Mágicas y Trampas es parte del campo, y se dice igual.
    expect(effectChoices('c1', 10808715, effectsAt(DUSK_CROW, [ONCE, EFFECT_PLACE.spellTrap], [ONCE, EFFECT_PLACE.grave]), [], 3).map((choice) => choice.hint)).toEqual(['Desde el campo · 1 vez por turno, por nombre', 'Desde el Cementerio · 1 vez por turno, por nombre'])
  })

  it('si todos los efectos son del mismo lugar (el campo) no dice nada: no hay nada que distinguir', () => {
    const sameField = effectsAt(DUSK_CROW, [ONCE, EFFECT_PLACE.field], [ONCE, EFFECT_PLACE.field])

    expect(effectChoices('c1', 10808715, sameField, [], 3).map((choice) => choice.hint)).toEqual(['1 vez por turno, por nombre', '1 vez por turno, por nombre'])
  })

  it('un efecto que comparte el límite dice que lo comparte, y si se usó otro de los efectos que lo comparten, que ya se usó', () => {
    const SHARED = ONCE | EFFECT_FACT.shared
    const sharing = effectsOf(DUSK_CROW, SHARED, SHARED)

    expect(effectChoices('c1', 10808715, sharing, [], 3).map((choice) => choice.hint)).toEqual(['1 vez por turno, por nombre · Límite compartido', '1 vez por turno, por nombre · Límite compartido'])

    const past = [used('c1', 3, effectKey(SHARED, 10808715, 'c1', 0))]

    expect(effectChoices('c1', 10808715, sharing, past, 3).map((choice) => choice.hint)).toEqual([
      'Ya usaste un efecto que comparte este límite · 1 vez por turno, por nombre · Límite compartido',
      'Ya usaste un efecto que comparte este límite · 1 vez por turno, por nombre · Límite compartido',
    ])
    expect(effectChoices('c1', 10808715, sharing, past, 4).map((choice) => choice.hint)[1]).toBe('1 vez por turno, por nombre · Límite compartido')
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

describe('activationFacts: al activar una Mágica o una Trampa sólo vale el límite de la activación', () => {
  it('con el límite de la activación confirmado (activation) valen los límites de la carta; sin él, ninguno (el límite de un efecto que se usa después no frena activar otra copia)', () => {
    const limited = EFFECT_FACT.once | EFFECT_FACT.hardOnce | EFFECT_FACT.cost | EFFECT_FACT.activation

    expect(activationFacts(limited)).toBe(EFFECT_FACT.once | EFFECT_FACT.hardOnce)
    expect(activationFacts(limited) & LIMIT_FACTS).not.toBe(0)
    expect(activationFacts(EFFECT_FACT.once | EFFECT_FACT.hardOnce | EFFECT_FACT.cost)).toBe(0)
    expect(activationFacts(0)).toBe(0)
  })
})

describe('cardEffects: los efectos de una carta, alineados con su script o leídos del texto', () => {
  afterEach(() => setCardEffectMapForTests(null))

  it('sin datos del script, las oraciones del texto que son efectos (sin ningún hecho confirmado) y la lista no está verificada', () => {
    const { effects, verified } = cardEffects(10808715, DUSK_CROW)

    expect(verified).toBe(false)
    expect(effects.map((effect) => effect.sentence.text.slice(0, 22))).toEqual(['If this card is in you', 'If this card is Normal'])
    expect(effects.every((effect) => effect.facts === 0 && effect.places === 0)).toBe(true)
  })

  it('con datos alineados, la lista del script (verificada) y en el mismo lugar que la del texto: el número de efecto que viaja con la jugada vale para los dos jugadores', () => {
    const sentences = effectSentences(DUSK_CROW)

    setCardEffectMapForTests(new Map([[10808715, sentences.map((sentence) => [sentence.start, ONCE, 0] as [number, number, number])]]))
    const aligned = cardEffects(10808715, DUSK_CROW)

    expect(aligned.verified).toBe(true)
    expect(aligned.effects.map((effect) => effect.facts)).toEqual([ONCE, ONCE])
    // Sin los datos (el otro jugador todavía no los bajó) el efecto número 2 es el mismo.
    setCardEffectMapForTests(null)
    expect(cardEffects(10808715, DUSK_CROW).effects.map((effect) => effect.start)).toEqual(aligned.effects.map((effect) => effect.start))
  })
})

describe('effectDetail: el efecto elegido, textual, para quien tiene que decidir si responde', () => {
  it('cuándo se activa (con su número) y qué hace; un lugar que la carta no tiene no dice nada', () => {
    const effects = effectsOf(DUSK_CROW)
    const detail = effectDetail(effects, 1)!

    expect(detail.lead).toBe('Efecto 2 · If this card is Normal or Special Summoned')
    expect(detail.what).toBe('You can add 1 "Masked HERO" monster from your Deck or GY to your hand.')
    expect(effectDetail(effects, 5)).toBeNull()
  })
})

describe('effectChoices con una lista leída sólo del texto: una salida para el efecto que no figura', () => {
  it('la lista del script es completa (sin «Otro efecto»); la del texto puede no tenerlos a todos y lo ofrece, sin decir cuál efecto es', () => {
    const effects = effectsOf(DUSK_CROW)

    expect(effectChoices('c1', 10808715, effects, [], 3).map((choice) => choice.label)).not.toContain('Otro efecto')

    const open = effectChoices('c1', 10808715, effects, [], 3, false)
    const other = open[open.length - 1]!

    expect(open).toHaveLength(3)
    expect(other.label).toBe('Otro efecto')
    expect(other.action).toEqual({ type: 'activate', id: 'c1' })
  })
})
