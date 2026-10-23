import { describe, expect, it } from 'vitest'

import { cleanEffectText, EFFECT_BIT, EFFECT_KEYS, EFFECT_MATCHERS, effectMaskOf, matchesEffect, type EffectKey } from '../app/card-effects'

/**
 * Cada caso es un texto real (o casi) donde el motor se equivocó en la auditoría con etiquetas a ciegas (`docs/motor-de-cartas.md`, «Apéndice · Cómo se midió y cómo repetirlo») y después se corrigió:
 * lo que tiene que marcar y lo que no. La medición de cuánto acierta en general está en el documento; esto cuida que un arreglo no se pierda.
 */
const CASES: Record<EffectKey, { yes: string[]; no: string[] }> = {
  search: {
    yes: [
      'Add 1 "Blue-Eyes" monster from your Deck to your hand.',
      'Reveal 3 "Spellbook" Spell Cards with different names from your Deck, your opponent randomly adds 1 of them to your hand, and shuffle the rest back into your Deck.',
      'Discard 1 card, then take 1 "Branded" monster from your Deck, and either add it to your hand or Special Summon it in Defense Position.',
      'Add to your hand or Special Summon 1 Level 10 monster from your hand or Deck.',
    ],
    no: ['Add 1 monster from your GY to your hand.', 'Special Summon 1 monster from your Deck.', 'Shuffle your Deck.'],
  },
  draw: {
    yes: ['Draw 2 cards.', 'Each player draws 1 card.', 'You can draw until you have 6 cards in your hand.'],
    no: [
      'During your Draw Phase, you can do this.',
      'If this card is added to your hand, except by drawing it for your normal draw: You can reveal this card; Special Summon it.',
      'During your opponent\'s Draw Phase, before their normal draw: Look at the top card of your opponent\'s Deck.',
      'When you draw a card: Gain 500 LP.',
    ],
  },
  'special-summon': {
    yes: ['You can Special Summon this card from your hand.', 'Special Summon 1 Level 4 monster from your Deck.', 'This card can only be Special Summoned by Tributing 2 monsters.'],
    no: [
      'You cannot Special Summon monsters from the Extra Deck.',
      'If this card is Special Summoned: Draw 1 card.',
      'If another "Magistus" monster(s) is Normal or Special Summoned: equip this card to it. You can only Special Summon "Artemis" once per turn.',
    ],
  },
  banish: {
    yes: ['Banish 1 monster from your GY.', 'Remove 1 monster from play.', 'Any card sent to the GY is banished instead, except Monster Cards.', 'That monster is removed from play during the End Phase.'],
    no: [
      'If this card is banished: Add 1 monster from your Deck to your hand.',
      'Select 1 of your removed from play monsters and Special Summon it.',
      'When this card is removed from play, you can draw 1 card.',
      'If a monster you control is removed from play: The ATK of all monsters becomes 0.',
    ],
  },
  graveyard: {
    yes: ['Send 1 monster from your Deck to the Graveyard.', 'Banish this card from your GY: Draw 1 card.'],
    no: ['Draw 2 cards.', 'Banish 1 monster.'],
  },
  'back-to-hand': {
    yes: [
      'Return 1 monster on the field to the hand.',
      'Select 1 face-up monster your opponent controls, and return it to it\'s owner\'s hand.',
      'When an opponent\'s monster activates its effect: The activated effect becomes "return 1 face-up monster your opponent controls to the hand".',
    ],
    no: [
      'If a face-up WIND monster(s) you control returns to your hand (except during the Damage Step): You can add 1 Spirit monster from your Deck to your hand.',
      'When a "Madolche" card(s) is returned from your side of the field to your hand by a card effect: Add 1 monster from your Deck to your hand.',
      'The ATK gained from this effect returns to 0, then you can add 1 monster from your GY to your hand.',
    ],
  },
  'back-to-deck': {
    yes: [
      'Shuffle 1 monster in your GY into the Deck.',
      'Excavate the top 3 cards, then place the rest on either the top or bottom of the Deck in any order.',
      'Add 2 LIGHT monsters from your Graveyard to your Deck and shuffle it.',
      'Shuffle 1 of your banished Fish monsters into the Main Deck.',
      'Select 1 card among them and return it to his/her Deck.',
    ],
    no: ['Add 1 monster from your Deck to your hand. Shuffle your Deck.', 'Special Summon 1 monster from your Deck.'],
  },
  'destroy-monster': {
    yes: [
      'Destroy 1 monster your opponent controls.',
      'Target 1 monster you control; destroy it.',
      'Special Summon 1 Level 4 monster from your hand. Destroy it during the End Phase.',
      'You can Special Summon 2 Tokens, but their effects are negated, also destroy them during the End Phase.',
      'You can target 3 "Igknight" cards you control; destroy them, and if you do, Special Summon this card.',
      'Target 1 card on the field; destroy it.',
      'Target 1 Wyrm monster you control and 2 cards your opponent controls; destroy them.',
      'Once per turn: You can destroy 1 other face-up card you control.',
      'Negate the effects of as many face-up cards your opponent controls as possible, and if you do, destroy them.',
    ],
    no: [
      'This card cannot be destroyed by battle.',
      'You can destroy this card.',
      'Target 1 Spell/Trap Card your opponent controls; destroy that target.',
      'If this card is destroyed by battle: Draw 1 card.',
    ],
  },
  'destroy-spell-trap': {
    yes: [
      'Destroy 1 Spell/Trap on the field.',
      'Target 1 Spell/Trap Card your opponent controls; destroy that target.',
      'Target 1 card on the field; destroy it.',
      'Target 1 other face-up card you control; destroy it, and if you do, Set 1 Spell/Trap directly from your Deck.',
      'Target 1 Set card on the field; destroy that target.',
      'Target 1 Wyrm monster you control and 2 cards your opponent controls; destroy them.',
    ],
    no: [
      'Destroy 1 monster your opponent controls.',
      'Target 1 monster you control; destroy it.',
      'You can target 3 "Igknight" cards you control; destroy them, and if you do, Special Summon this card.',
      'This card cannot be destroyed by card effects.',
    ],
  },
  negate: {
    yes: ['Negate the activation, and if you do, destroy it.', 'Negate the effects of 1 monster until the end of this turn.'],
    no: ['This card cannot be negated.', 'Your opponent cannot negate the activation of this card.'],
  },
  token: {
    yes: [
      'Special Summon 1 "Worm Token" (Insect/EARTH/Level 1/ATK 0/DEF 0).',
      'Special Summon 1 "Shiranui" (Zombie/FIRE/Level 1/ATK 0/DEF 0).',
      'Special Summon 2 Tokens.',
      'If a Tuner Synchro Monster is Synchro Summoned using this card: You can Special Summon 1 "Stardust Token" (Dragon/LIGHT/Level 1/ATK 0/DEF 0).',
    ],
    no: ['Monsters you control other than non-Token monsters cannot be destroyed.', 'Tribute 1 monster, except Tokens.', 'Special Summon 1 "Blue-Eyes White Dragon" from your hand.'],
  },
  control: {
    yes: [
      'Take control of 1 monster your opponent controls until the End Phase.',
      'Control of this card is shifted to your opponent by paying 500 Life Points at your own End Phase.',
      'Switch control of 1 monster you control with 1 monster your opponent controls.',
      'Change the control of 1 monster to your opponent.',
    ],
    no: [
      'You can change the battle position of 1 Insect monster you control.',
      'Once per turn, when the battle position of a Rock-Type monster you control is changed: You can destroy 1 card.',
      'If you control no monsters, you can Special Summon this card.',
    ],
  },
  damage: {
    yes: ['Inflict 500 damage to your opponent.', 'That player takes 500 damage.', 'You can inflict damage to your opponent equal to the ATK of that monster.'],
    no: [
      'When this card inflicts battle damage to your opponent: Draw 1 card.',
      'Increase the ATK of this monster by 1000 points during the Damage Step when this monster inflicts Direct Damage to your opponent\'s Life Points.',
      'You take no battle damage from battles involving this card.',
      'If you would take damage, you take none instead.',
    ],
  },
  recover: {
    yes: ['Gain 1000 LP.', 'You gain Life Points equal to the DEF of that monster.'],
    no: ['This card gains 500 ATK while your LP is lower than your opponent\'s.', 'When you gain LP: Draw 1 card.', 'Pay 1000 LP.'],
  },
}

describe('el motor de efectos: lo que se equivocó en la auditoría y se corrigió', () => {
  for (const key of EFFECT_KEYS) {
    it(`${key}: marca lo que hace y no lo que sólo lo menciona`, () => {
      for (const text of CASES[key].yes) {
        expect(matchesEffect(key, text), `debía marcar «${text}»`).toBe(true)
      }

      for (const text of CASES[key].no) {
        expect(matchesEffect(key, text), `no debía marcar «${text}»`).toBe(false)
      }
    })
  }

  it('hay casos para todas las categorías', () => {
    expect(Object.keys(CASES).sort()).toEqual([...EFFECT_KEYS].sort())
  })
})

describe('el texto que lee el motor', () => {
  it('los nombres entre comillas se vacían (traen puntos y palabras de efecto), salvo las Fichas, que siguen diciendo «Token»', () => {
    expect(cleanEffectText('Special Summon "D.D. Warrior Lady" from your hand.')).toBe('Special Summon "" from your hand.')
    expect(cleanEffectText('Special Summon 1 "Wyrm Token".')).toContain('Token')
    expect(cleanEffectText('Special Summon 1 "Foo" (Wyrm/FIRE/Level 1/ATK 0/DEF 0).')).toContain('Token')
  })

  it('una frase larga entre comillas es un efecto y se lee; un nombre largo no', () => {
    expect(cleanEffectText('The effect becomes "return 1 face-up monster your opponent controls to the hand".')).toContain('return 1 face-up monster')
    expect(cleanEffectText('Dark Magician the Dragon Knight, "Dark Magician the Dragon Knight"')).toContain('""')
  })

  it('los rótulos del Péndulo no hablan de monstruos', () => {
    expect(cleanEffectText('[ Pendulum Effect ] You can add 1 card. [ Monster Effect ] Draw 1 card.')).not.toMatch(/Pendulum Effect|Monster Effect/)
  })
})

describe('la máscara de efectos', () => {
  it('es lo mismo que correr cada expresión sobre el texto limpio (el atajo de palabras no cambia ningún resultado)', () => {
    const texts = Object.values(CASES).flatMap(({ yes, no }) => [...yes, ...no])

    for (const text of texts) {
      const clean = cleanEffectText(text)
      const expected = EFFECT_KEYS.reduce((mask, key) => mask | (EFFECT_MATCHERS[key].test(clean) ? EFFECT_BIT[key] : 0), 0)

      expect(effectMaskOf(text), text).toBe(expected)
    }
  })

  it('un texto vacío, nulo o sin ningún efecto no marca nada', () => {
    expect(effectMaskOf('')).toBe(0)
    expect(effectMaskOf(null)).toBe(0)
    expect(effectMaskOf('A legendary dragon with a body of white.')).toBe(0)
  })

  it('cada categoría ocupa un bit propio y caben en 16', () => {
    expect(EFFECT_KEYS.length).toBeLessThanOrEqual(16)
    expect(new Set(EFFECT_KEYS.map((key) => EFFECT_BIT[key])).size).toBe(EFFECT_KEYS.length)
  })

  it('un texto de 2000 caracteres hecho para trabar las expresiones se lee rápido', () => {
    const started = performance.now()

    for (const piece of ['if ', 'when ', 'return ', 'add ', 'destroy ', 'target 1 card ', 'draw ', 'inflict ', 'banish ', 'card ', 'from your deck ', '"a b c d e f g the ']) {
      effectMaskOf(piece.repeat(Math.ceil(2000 / piece.length)).slice(0, 2000))
    }

    expect(performance.now() - started).toBeLessThan(500)
  })
})
