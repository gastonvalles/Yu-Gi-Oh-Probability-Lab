import fc from 'fast-check'
import { describe, expect, it } from 'vitest'

import { effectParts, effectSentences, segmentCardText, type TextTone } from '../app/card-text'

/** Los pedazos marcados de un texto, como pares [tipo, texto]. */
function marked(text: string): [TextTone, string][] {
  return segmentCardText(text)
    .filter((segment) => segment.tone !== 'plain')
    .map((segment) => [segment.tone, segment.text])
}

describe('segmentCardText: lo que marca', () => {
  it('condición, velocidad, costo, objetivo y límite de un efecto rápido', () => {
    const text =
      'When your opponent activates a card or effect (Quick Effect): You can discard this card, then target 1 monster your opponent controls; destroy it. You can only use this effect of "Ash Blossom" once per turn.'

    expect(marked(text)).toEqual([
      ['condition', 'When your opponent activates a card or effect'],
      ['speed', '(Quick Effect)'],
      ['cost', 'discard this card'],
      ['target', 'target 1 monster your opponent controls'],
      ['limit', 'You can only use this effect of "Ash Blossom" once per turn.'],
    ])
  })

  it('«Once per turn» delante de los dos puntos es un límite, y lo que sigue puede ser la condición', () => {
    expect(marked('Once per turn: You can draw 1 card.')).toEqual([['limit', 'Once per turn']])
    expect(marked('Once per turn, during your Standby Phase: You can gain 500 LP.')).toEqual([
      ['limit', 'Once per turn'],
      ['condition', 'during your Standby Phase'],
    ])
    expect(marked('Once per turn (Quick Effect): You can negate it.')).toEqual([
      ['limit', 'Once per turn'],
      ['speed', '(Quick Effect)'],
    ])
    // Lo que sigue no abre una condición: sólo el límite.
    expect(marked('Once per turn, you can either:\n● Draw 1 card.')).toEqual([['limit', 'Once per turn']])
  })

  it('un objetivo solo, y «You can» queda sin marcar', () => {
    expect(marked('Target 1 face-up monster on the field; destroy it.')).toEqual([['target', 'Target 1 face-up monster on the field']])
    expect(marked('If this card is Special Summoned: You can target 1 monster in your GY; add it to your hand.')).toEqual([
      ['condition', 'If this card is Special Summoned'],
      ['target', 'target 1 monster in your GY'],
    ])
  })

  it('un costo con «to target»: el «to» no es parte del costo', () => {
    expect(marked('You can banish this card from your GY to target 1 monster; Special Summon it.')).toEqual([
      ['cost', 'banish this card from your GY'],
      ['target', 'target 1 monster'],
    ])
  })

  it('«FLIP:» es una condición y cada viñeta se lee por separado', () => {
    expect(marked('FLIP: You can add 1 monster from your Deck to your hand.')).toEqual([['condition', 'FLIP']])
    expect(marked('● If this card is Special Summoned from the GY: You can discard 1 card; draw 2 cards.\n● Once per turn: You can destroy 1 card.')).toEqual([
      ['condition', 'If this card is Special Summoned from the GY'],
      ['cost', 'discard 1 card'],
      ['limit', 'Once per turn'],
    ])
  })

  it('la etiqueta de velocidad sola, sin condición delante, también se marca', () => {
    expect(marked('If this card is Fusion Summoned: You can Set 1 card. (Quick Effect): You can pay 1000 LP, then target 1 monster; destroy it.')).toEqual([
      ['condition', 'If this card is Fusion Summoned'],
      ['speed', '(Quick Effect)'],
      ['cost', 'pay 1000 LP'],
      ['target', 'target 1 monster'],
    ])
  })

  it('los dos puntos o el punto y coma entre comillas o paréntesis no cortan nada', () => {
    expect(marked('If you control "Number 39: Utopia": You can destroy 1 card.')).toEqual([['condition', 'If you control "Number 39: Utopia"']])
    expect(marked('Banish 1 card (this is a cost; it is not optional): draw 1 card.')).toEqual([])
  })

  it('los dos puntos que no abren una condición (una lista, un encabezado) no marcan nada', () => {
    expect(marked('You can activate 1 of these effects:\n● Draw 1 card.\n● Destroy 1 card.')).toEqual([])
    expect(marked('Effect: Discard 1 card; draw 1 card.')).toEqual([])
  })

  it('sin comillas ni paréntesis que cierren, no interpreta nada', () => {
    expect(marked('If you control "Number 39: Utopia: You can destroy 1 card; draw 1 card.')).toEqual([])
    expect(marked('If this card (is destroyed: You can discard 1 card; draw 1 card.')).toEqual([])
  })

  it('la letra suelta, el flavor y las oraciones sin plantilla quedan sin marcar', () => {
    expect(marked('This card gains 500 ATK for each monster you control.')).toEqual([])
    expect(marked("''Imprisoned after a showdown, this master schemer escaped: and then he returned; nobody knows why.''")).toEqual([])
    expect(marked('Each time a monster is Tributed, you can Tribute 1 monster; draw 1 card.')).toEqual([])
    expect(marked('')).toEqual([])
  })

  it('los verbos de costo sólo cuentan al frente: «Draw 1 card, then discard 1 card;» no es un costo', () => {
    expect(marked('When this card is Normal Summoned: Draw 1 card, then discard 1 card; gain 500 LP.')).toEqual([['condition', 'When this card is Normal Summoned']])
  })

  it('un texto de monstruo con su ficha de materiales, línea por línea', () => {
    const text = '2 Level 4 monsters\r\nIf this card is Xyz Summoned: You can detach 1 material from this card; add 1 monster from your Deck to your hand.'

    expect(marked(text)).toEqual([
      ['condition', 'If this card is Xyz Summoned'],
      ['cost', 'detach 1 material from this card'],
    ])
  })
})

describe('segmentCardText: garantías', () => {
  const PIECES = [
    'If ', 'When ', 'During ', 'Once per turn', ', ', ': ', '; ', '. ', ' ', '\r\n', '\n', '● ', '"', '(', ')', '(Quick Effect)', 'You can ', 'You can only ', 'target ', 'Target ', 'discard ', 'Tribute ',
    '1 monster', 'this card', 'then ', ' to ', ' and ', 'FLIP', 'Number 39: Utopia', 'a', 'é', "''",
  ]

  it('los pedazos, pegados, dan exactamente el texto; ninguno está vacío y dos vecinos nunca repiten tipo', () => {
    fc.assert(
      fc.property(fc.array(fc.constantFrom(...PIECES), { maxLength: 40 }), (parts) => {
        const text = parts.join('')
        const segments = segmentCardText(text)

        expect(segments.map((segment) => segment.text).join('')).toBe(text)
        expect(segments.every((segment) => segment.text !== '')).toBe(true)
        expect(segments.every((segment, index) => index === 0 || segments[index - 1]!.tone !== segment.tone)).toBe(true)
      }),
      { numRuns: 400 },
    )
  })

  it('con cualquier cadena (no sólo la gramática) cumple lo mismo', () => {
    fc.assert(
      fc.property(fc.string({ maxLength: 120 }), (text) => {
        expect(segmentCardText(text).map((segment) => segment.text).join('')).toBe(text)
      }),
      { numRuns: 300 },
    )
  })

  it('un cost, un target, una condición o una velocidad nunca llevan espacios de borde ni el signo que los cierra', () => {
    fc.assert(
      fc.property(fc.array(fc.constantFrom(...PIECES), { maxLength: 40 }), (parts) => {
        for (const segment of segmentCardText(parts.join(''))) {
          if (segment.tone === 'cost' || segment.tone === 'target' || segment.tone === 'condition') {
            expect(segment.text).toBe(segment.text.trim())
            expect(segment.text.endsWith(';') || segment.text.endsWith(':')).toBe(false)
          }
        }
      }),
      { numRuns: 400 },
    )
  })
})

describe('effectSentences: las oraciones del texto que son efectos que se activan', () => {
  const opening = (text: string) => effectSentences(text).map((sentence) => sentence.opening)

  it('cómo abre cada una: condición, «During», «Once per turn:», «(Quick Effect)» y «You can …;» sin encabezado', () => {
    expect(opening('If this card is sent to the GY: You can draw 1 card.')).toEqual(['trigger'])
    expect(opening('During your Main Phase: You can Special Summon this card.')).toEqual(['during'])
    expect(opening('Once per turn: You can draw 1 card.')).toEqual(['once'])
    expect(opening('When a card or effect is activated (Quick Effect): You can discard this card; negate that effect.')).toEqual(['quick'])
    expect(opening('You can discard 1 card; draw 1 card.')).toEqual(['plain'])
  })

  it('las reglas, los límites y los efectos continuos no cuentan', () => {
    const text = 'Cannot be Normal Summoned/Set. This card gains 500 ATK. You can only use each effect of "X" once per turn. You can discard 1 card; draw 1 card.'

    expect(opening(text)).toEqual(['plain'])
    // «You can» sin `;` es una frase sin costo ni objetivo que separe: no se sabe que sea un efecto.
    expect(opening('You can draw 1 card.')).toEqual([])
  })

  it('dónde empieza cada una en el texto entero, también después de un salto de línea o de una viñeta', () => {
    const text = 'Cannot be Normal Summoned.\n● If this card is sent to the GY: You can draw 1 card.\n● Once per turn: You can discard 1 card; draw 1 card.'
    const [first, second] = effectSentences(text)

    expect(text.slice(first!.start, first!.start + 7)).toBe('If this')
    expect(text.slice(second!.start, second!.start + 13)).toBe('Once per turn')
  })

  it('lo que lleva: la velocidad, el costo, el objetivo y el «una vez por turno»', () => {
    const [quick] = effectSentences('During the Battle Phase (Quick Effect): You can discard this card; negate the attack.')
    const [target] = effectSentences('You can target 1 monster in your GY; Special Summon it.')
    const [once] = effectSentences('Once per turn: You can draw 1 card.')

    expect([quick?.quick, quick?.cost, quick?.target, quick?.once]).toEqual([true, true, false, false])
    expect([target?.quick, target?.cost, target?.target]).toEqual([false, false, true])
    expect(once?.once).toBe(true)
  })

  describe('la ventana de un efecto rápido: cuándo se activa sin que antes pase algo', () => {
    const windowOf = (header: string) => effectSentences(`${header}: You can discard this card; draw 1 card.`)[0]?.window

    it('sin condición: la etiqueta sola, con «Once per turn» o con «During…» de un turno o de fases', () => {
      expect(windowOf('(Quick Effect)')).toEqual({ turn: 'any', phases: null })
      expect(windowOf('Once per turn (Quick Effect)')).toEqual({ turn: 'any', phases: null })
      expect(windowOf("During your opponent's turn (Quick Effect)")).toEqual({ turn: 'opponent', phases: null })
      expect(windowOf("During your opponent's Main Phase (Quick Effect)")).toEqual({ turn: 'opponent', phases: ['main'] })
      expect(windowOf('During the Main or Battle Phase (Quick Effect)')).toEqual({ turn: 'any', phases: ['main', 'battle'] })
      expect(windowOf("Once per turn, during either player's turn (Quick Effect)")).toEqual({ turn: 'any', phases: null })
      expect(windowOf('During your Main Phase (Quick Effect)')).toEqual({ turn: 'self', phases: ['main'] })
    })

    it('con una condición, o con algo que no se sabe leer, no hay ventana', () => {
      expect(windowOf('When a card or effect is activated (Quick Effect)')).toBeNull()
      expect(windowOf('During the Battle Phase, if your monster attacked (Quick Effect)')).toBeNull()
      expect(windowOf('If you control a "Blue-Eyes" monster (Quick Effect)')).toBeNull()
      expect(windowOf('During the Damage Step (Quick Effect)')).toBeNull()
    })

    it('un efecto que no es rápido no lleva ventana', () => {
      expect(effectSentences('If this card is sent to the GY: You can draw 1 card.')[0]?.window).toBeNull()
    })
  })
})

describe('effectParts: un efecto partido en cuándo y qué hace, textual', () => {
  const parts = (text: string) => effectParts(effectSentences(text)[0]!)

  it('lo de antes de los dos puntos (tal cual, con el «Once per turn» y la etiqueta de velocidad) y lo que sigue', () => {
    expect(parts('If this card is in your hand: You can banish 1 "HERO" monster from your GY; Special Summon this card.')).toEqual({
      when: 'If this card is in your hand',
      what: 'You can banish 1 "HERO" monster from your GY; Special Summon this card.',
    })
    expect(parts("Once per turn, during your opponent's Main Phase (Quick Effect): You can target 1 monster; destroy it.")).toEqual({
      when: "Once per turn, during your opponent's Main Phase (Quick Effect)",
      what: 'You can target 1 monster; destroy it.',
    })
    expect(parts('(Quick Effect): You can discard this card; draw 1 card.')).toEqual({ when: '(Quick Effect)', what: 'You can discard this card; draw 1 card.' })
    expect(parts('Once per turn: You can draw 1 card.')).toEqual({ when: 'Once per turn', what: 'You can draw 1 card.' })
  })

  it('sin encabezado: no hay «cuándo» y lo que hace es la frase entera', () => {
    expect(parts('You can discard 1 card; draw 1 card.')).toEqual({ when: '', what: 'You can discard 1 card; draw 1 card.' })
  })

  it('no recorta ni cambia nada: cuándo y qué hace, juntos, son la frase', () => {
    for (const text of [
      'If this card is in your hand: You can banish 1 "HERO" monster from your GY; Special Summon this card.',
      "If a monster(s) you control is destroyed by battle or by an opponent's card effect while this card is in your hand: You can Special Summon this card, and if you do, draw 1 card.",
      'You can discard 1 card; draw 1 card.',
    ]) {
      const { when, what } = parts(text)

      expect(when === '' ? what : `${when}: ${what}`).toBe(text)
    }
  })

  it('un «:» dentro de comillas (el nombre de una carta) no corta el encabezado', () => {
    expect(parts('If "Number 39: Utopia" is on the field: You can draw 1 card.')).toEqual({ when: 'If "Number 39: Utopia" is on the field', what: 'You can draw 1 card.' })
  })
})

describe('effectSentences: a qué activación responde un efecto rápido (chain)', () => {
  const chainOf = (text: string) => effectSentences(text)[0]!.chain
  const QUICK_TAIL = 'You can discard this card; negate that effect.'

  it('«When your opponent activates a card or effect» y «When a card or effect is activated»: cualquier activación (la del rival, o de cualquiera)', () => {
    expect(chainOf(`When your opponent activates a card or effect (Quick Effect): ${QUICK_TAIL}`)).toEqual({ by: 'opponent', what: 'any', via: 'any' })
    expect(chainOf(`When a card or effect is activated (Quick Effect): ${QUICK_TAIL}`)).toEqual({ by: 'any', what: 'any', via: 'any' })
  })

  it('un efecto de monstruo, una Mágica, una Trampa o una Mágica o Trampa: lo que se activa y si es la carta o su efecto', () => {
    expect(chainOf(`When your opponent activates a monster effect (Quick Effect): ${QUICK_TAIL}`)).toEqual({ by: 'opponent', what: 'monster', via: 'effect' })
    expect(chainOf(`When a monster effect is activated (Quick Effect): ${QUICK_TAIL}`)).toEqual({ by: 'any', what: 'monster', via: 'effect' })
    expect(chainOf(`When your opponent activates a Spell/Trap Card or effect (Quick Effect): ${QUICK_TAIL}`)).toEqual({ by: 'opponent', what: 'spellTrap', via: 'any' })
    expect(chainOf(`When a Spell/Trap Card or effect is activated (Quick Effect): ${QUICK_TAIL}`)).toEqual({ by: 'any', what: 'spellTrap', via: 'any' })
    expect(chainOf(`When your opponent activates a Spell Card (Quick Effect): ${QUICK_TAIL}`)).toEqual({ by: 'opponent', what: 'spell', via: 'card' })
    expect(chainOf(`When a Trap Card is activated (Quick Effect): ${QUICK_TAIL}`)).toEqual({ by: 'any', what: 'trap', via: 'card' })
    expect(chainOf(`When your opponent activates a Spell/Trap Card (Quick Effect): ${QUICK_TAIL}`)).toEqual({ by: 'opponent', what: 'spellTrap', via: 'card' })
  })

  it('con «Once per turn,» delante sigue siendo sólo esa condición', () => {
    expect(chainOf(`Once per turn, when your opponent activates a card or effect (Quick Effect): ${QUICK_TAIL}`)).toEqual({ by: 'opponent', what: 'any', via: 'any' })
  })

  it('con otra condición («that targets», «while you control», «on the field», «that includes any of these effects») no hay respuesta: no se sabe si se cumple', () => {
    expect(chainOf(`When your opponent activates a card or effect that targets this card (Quick Effect): ${QUICK_TAIL}`)).toBeNull()
    expect(chainOf(`When your opponent activates a card or effect, while you control a WIND monster (Quick Effect): ${QUICK_TAIL}`)).toBeNull()
    expect(chainOf(`When your opponent activates a monster effect on the field (Quick Effect): ${QUICK_TAIL}`)).toBeNull()
    expect(chainOf(`When a card or effect is activated that includes any of these effects (Quick Effect): ${QUICK_TAIL}`)).toBeNull()
  })

  it('sin «(Quick Effect)» (no es rápido en el texto) o con una ventana sin condición, no hay', () => {
    expect(chainOf(`When your opponent activates a card or effect: ${QUICK_TAIL}`)).toBeNull()
    expect(chainOf(`(Quick Effect): ${QUICK_TAIL}`)).toBeNull()
    expect(chainOf(`During your opponent's Main Phase (Quick Effect): ${QUICK_TAIL}`)).toBeNull()
  })
})
