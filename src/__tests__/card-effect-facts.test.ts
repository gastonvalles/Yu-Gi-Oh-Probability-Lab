import fc from 'fast-check'
import { describe, expect, it } from 'vitest'

import { effectFactNames, EFFECT_FACT, limitCode, scriptEffectFacts, textEffectFacts, textSharedLimit, verifiedEffectFacts } from '../app/card-effect-facts'

const lua = (...lines: string[]) => ['local s,id=GetID()', 'function s.initial_effect(c)', ...lines, 'end'].join('\n')
const effect = (...setters: string[]) => [
  '\tlocal e1=Effect.CreateEffect(c)',
  ...setters.map((setter) => `\te1:${setter}`),
  '\tc:RegisterEffect(e1)',
].join('\n')
const names = (facts: number) => effectFactNames(facts)

describe('scriptEffectFacts: lo que declara el script', () => {
  it('un efecto rápido con costo y una vez por turno por nombre (Ash Blossom)', () => {
    const script = lua(effect('SetType(EFFECT_TYPE_QUICK_O)', 'SetRange(LOCATION_HAND)', 'SetCountLimit(1,id)', 'SetCost(Cost.SelfDiscard)'))

    expect(names(scriptEffectFacts(script))).toEqual(['quick', 'once', 'hardOnce', 'cost'])
  })

  it('el segundo cupo por nombre (`{id,1}`), el de la activación (`OATH`) y sin código (por efecto, no por nombre)', () => {
    expect(names(scriptEffectFacts(lua(effect('SetType(EFFECT_TYPE_IGNITION)', 'SetCountLimit(1,{id,1})'))))).toEqual(['once', 'hardOnce'])
    expect(names(scriptEffectFacts(lua(effect('SetType(EFFECT_TYPE_ACTIVATE)', 'SetCountLimit(1,id,EFFECT_COUNT_CODE_OATH)'))))).toEqual(['once', 'hardOnce', 'activation'])
    expect(names(scriptEffectFacts(lua(effect('SetType(EFFECT_TYPE_IGNITION)', 'SetCountLimit(1)'))))).toEqual(['once'])
  })

  it('el límite de la activación de una Mágica o Trampa (activation) es de su efecto de activar, no el de un efecto que se usa después', () => {
    // Activar es el efecto EFFECT_TYPE_ACTIVATE; el límite de uno de ignición (una Mágica Continua) es de ese efecto, no de la activación.
    expect(names(scriptEffectFacts(lua(effect('SetType(EFFECT_TYPE_ACTIVATE)', 'SetCode(EVENT_FREE_CHAIN)'), effect('SetType(EFFECT_TYPE_IGNITION)', 'SetCountLimit(1,id)'))))).toEqual(['once', 'hardOnce'])
    expect(names(scriptEffectFacts(lua(effect('SetType(EFFECT_TYPE_ACTIVATE)', 'SetCountLimit(1)'))))).toEqual(['once', 'activation'])
    expect(names(scriptEffectFacts(lua(effect('SetType(EFFECT_TYPE_ACTIVATE)', 'SetCountLimit(2,id)'))))).toEqual([])
  })

  it('una vez por Duelo no es una vez por turno; por cadena o mientras está boca arriba tampoco; dos veces por turno tampoco', () => {
    expect(names(scriptEffectFacts(lua(effect('SetType(EFFECT_TYPE_IGNITION)', 'SetCountLimit(1,id,EFFECT_COUNT_CODE_DUEL)'))))).toEqual(['perDuel'])
    expect(scriptEffectFacts(lua(effect('SetType(EFFECT_TYPE_IGNITION)', 'SetCountLimit(1,id,EFFECT_COUNT_CODE_CHAIN)')))).toBe(0)
    expect(scriptEffectFacts(lua(effect('SetType(EFFECT_TYPE_IGNITION)', 'SetCountLimit(1,id,EFFECT_COUNT_CODE_SINGLE)')))).toBe(0)
    expect(scriptEffectFacts(lua(effect('SetType(EFFECT_TYPE_IGNITION)', 'SetCountLimit(2,id)')))).toBe(0)
  })

  it('un efecto que apunta (`EFFECT_FLAG_CARD_TARGET`) y los que se registran fuera de `initial_effect`', () => {
    expect(names(scriptEffectFacts(lua(effect('SetType(EFFECT_TYPE_IGNITION)', 'SetProperty(EFFECT_FLAG_CARD_TARGET+EFFECT_FLAG_DELAY)'))))).toEqual(['target'])

    const later = [
      lua(effect('SetType(EFFECT_TYPE_SINGLE)')),
      'function s.eqop(e,tp)',
      '\tlocal e3=Effect.CreateEffect(c)',
      '\te3:SetType(EFFECT_TYPE_IGNITION)',
      '\te3:SetCountLimit(1,id)',
      '\tc:RegisterEffect(e3)',
      'end',
    ].join('\n')

    expect(names(scriptEffectFacts(later))).toEqual(['once', 'hardOnce'])
  })

  it('un script sin efectos propios no declara nada', () => {
    expect(scriptEffectFacts('local s,id=GetID()\nfunction s.initial_effect(c)\n\tc:EnableReviveLimit()\nend')).toBe(0)
    expect(scriptEffectFacts('')).toBe(0)
  })
})

describe('textEffectFacts: lo que dice el texto', () => {
  it('Ash Blossom: efecto rápido, costo, una vez por turno por nombre', () => {
    const text = 'When a card or effect is activated that includes any of these effects (Quick Effect): You can discard this card; negate that effect. You can only use this effect of "Ash Blossom & Joyous Spring" once per turn.'

    expect(names(textEffectFacts(text))).toEqual(['quick', 'once', 'hardOnce', 'cost'])
  })

  it('«Once per turn:» solo es una vez por turno (por efecto); con el nombre es por nombre', () => {
    expect(names(textEffectFacts('Once per turn: You can draw 1 card.'))).toEqual(['once'])
    expect(names(textEffectFacts('You can only use each effect of "Maxx "C"" once per turn.'))).toEqual(['once', 'hardOnce'])
  })

  it('los nombres con puntos o con comillas adentro no cortan la oración', () => {
    expect(names(textEffectFacts('You can only use this effect of "R.B. Lambda Blade" once per turn.'))).toEqual(['once', 'hardOnce'])
    expect(names(textEffectFacts('You can only use 1 "Maxx "C"" per turn.'))).toEqual(['once', 'hardOnce'])
    expect(names(textEffectFacts('You can only activate 1 "A.I. Contact" per turn.'))).toEqual(['once', 'hardOnce', 'activation'])
    expect(names(textEffectFacts('You can only use 1 of the following effects of "Salamangreat Wolvie" per turn, and only once that turn.'))).toEqual(['once', 'hardOnce'])
    expect(names(textEffectFacts('The effect of "Mystic Piper" can only be activated once per turn.'))).toEqual(['once', 'hardOnce'])
  })

  it('«1 of these effects» también es una vez por turno por nombre (igual que «1 of the following effects»)', () => {
    expect(names(textEffectFacts('You can only use 1 of these effects of "Alich, Malebranche of the Burning Abyss" per turn, and only once that turn.'))).toEqual(['once', 'hardOnce'])
  })

  it('el límite de la activación (activation): «activate 1», «can only be activated once per turn» y el límite compartido de todos los efectos; el de un efecto, no', () => {
    expect(names(textEffectFacts('"Pot of Desires" can only be activated once per turn.'))).toEqual(['once', 'hardOnce', 'activation'])
    expect(names(textEffectFacts('You can only use 1 "Altergeist Revitalization" effect per turn, and only once that turn.'))).toEqual(['once', 'hardOnce', 'activation'])
    expect(names(textEffectFacts('You can only use this effect of "Ash Blossom & Joyous Spring" once per turn.'))).toEqual(['once', 'hardOnce'])
    expect(names(textEffectFacts('You can only use 1 of the following effects of "Aileron" per turn, and only once that turn.'))).toEqual(['once', 'hardOnce'])
  })

  it('una vez por Duelo, el objetivo y lo que no dice nada', () => {
    expect(names(textEffectFacts('If this card is Special Summoned: You can target 1 monster in your GY; Special Summon it. You can only use this effect once per Duel.'))).toEqual(['perDuel', 'target'])
    expect(textEffectFacts('This card gains 500 ATK for each monster you control.')).toBe(0)
    expect(textEffectFacts("''Imprisoned after a showdown, this master schemer escaped.''")).toBe(0)
  })
})

describe('textSharedLimit y limitCode: el límite compartido entre efectos', () => {
  it('el texto lo dice con «1 of the following effects», «1 of these effects» o «1 "X" effect» (todos los efectos y la activación)', () => {
    expect(textSharedLimit('You can only use 1 of the following effects of "Aileron" per turn, and only once that turn.')).toBe(true)
    expect(textSharedLimit('You can only use 1 of these effects of "Alich, Malebranche of the Burning Abyss" per turn, and only once that turn.')).toBe(true)
    expect(textSharedLimit('You can only use 1 "Altergeist Revitalization" effect per turn, and only once that turn.')).toBe(true)
  })

  it('«cada efecto» y el límite de un solo efecto no son compartidos', () => {
    expect(textSharedLimit('You can only use each effect of "Maxx "C"" once per turn.')).toBe(false)
    expect(textSharedLimit('You can only use this effect of "Ash Blossom & Joyous Spring" once per turn.')).toBe(false)
    expect(textSharedLimit('Once per turn: You can draw 1 card.')).toBe(false)
  })

  it('el código de un límite: el mismo código es el mismo límite; sin código, por duelo, por cadena o más de una vez no hay', () => {
    expect(limitCode('1,id')).toBe('id,')
    expect(limitCode('1, id')).toBe('id,')
    expect(limitCode('1,{id,1}')).toBe('{id,1},')
    expect(limitCode('1,id,EFFECT_COUNT_CODE_OATH')).toBe('id,EFFECT_COUNT_CODE_OATH')
    expect(limitCode('1,{id,1}')).not.toBe(limitCode('1,id'))
    expect(limitCode('1')).toBeNull()
    expect(limitCode('1,0')).toBeNull()
    expect(limitCode('')).toBeNull()
    expect(limitCode('1,id,EFFECT_COUNT_CODE_DUEL')).toBeNull()
    expect(limitCode('1,id,EFFECT_COUNT_CODE_CHAIN')).toBeNull()
    expect(limitCode('2,id')).toBeNull()
  })
})

describe('verifiedEffectFacts: sólo lo que dicen los dos', () => {
  const quickScript = lua(effect('SetType(EFFECT_TYPE_QUICK_O)', 'SetCountLimit(1,id)'))

  it('lo que el script y el texto confirman queda; lo que dice uno solo no', () => {
    // El texto viejo no lleva «(Quick Effect)»: el script dice rápido, el texto no lo confirma.
    expect(names(verifiedEffectFacts(quickScript, 'During either player\'s turn: You can draw 1 card. You can only use this effect of "X" once per turn.'))).toEqual(['once', 'hardOnce'])
    // El texto dice rápido y el script no: tampoco.
    expect(names(verifiedEffectFacts(lua(effect('SetType(EFFECT_TYPE_IGNITION)')), 'When this card is Summoned (Quick Effect): You can draw 1 card.'))).toEqual([])
    // Los dos dicen lo mismo.
    expect(names(verifiedEffectFacts(quickScript, 'When a monster is Summoned (Quick Effect): You can draw 1 card. You can only use this effect of "X" once per turn.'))).toEqual(['quick', 'once', 'hardOnce'])
  })

  it('nunca confirma más de lo que dice cada fuente (es la intersección), con cualquier texto', () => {
    fc.assert(
      fc.property(fc.string({ maxLength: 200 }), (text) => {
        const verified = verifiedEffectFacts(quickScript, text)

        expect(verified & ~scriptEffectFacts(quickScript)).toBe(0)
        expect(verified & ~textEffectFacts(text)).toBe(0)
      }),
      { numRuns: 200 },
    )
  })

  it('los nombres de una máscara salen en el orden de EFFECT_FACT', () => {
    expect(names(EFFECT_FACT.target | EFFECT_FACT.quick | EFFECT_FACT.cost)).toEqual(['quick', 'cost', 'target'])
    expect(names(0)).toEqual([])
  })
})
