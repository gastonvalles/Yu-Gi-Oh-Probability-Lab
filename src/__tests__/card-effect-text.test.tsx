// @vitest-environment jsdom
import { render } from '@testing-library/react'
import { describe, expect, it } from 'vitest'

import { CardEffectText } from '../components/card-detail/CardEffectText'

const TEXT = 'If this card is Special Summoned (Quick Effect): You can discard 1 card, then target 1 monster; destroy it. You can only use this effect of "X" once per turn.'

describe('CardEffectText', () => {
  it('resalta cada parte con su tipo y su nombre, y el texto entero no cambia', () => {
    const { container } = render(<CardEffectText text={TEXT} />)
    const parts = [...container.querySelectorAll('[data-tone]')].map((node) => [node.getAttribute('data-tone'), node.textContent])

    expect(parts).toEqual([
      ['condition', 'If this card is Special Summoned'],
      ['speed', '(Quick Effect)'],
      ['cost', 'discard 1 card'],
      ['target', 'target 1 monster'],
      ['limit', 'You can only use this effect of "X" once per turn.'],
    ])
    expect(container.querySelector('[data-tone="cost"]')?.getAttribute('title')).toMatch(/^Costo/)
    expect(container.textContent).toBe(TEXT)
  })

  describe('highlight: el pedazo del texto que se está señalando', () => {
    const TWO = 'If this card is in your hand: You can banish 1 "HERO" monster from your GY; Special Summon this card. If this card is Normal or Special Summoned: You can add 1 "Masked HERO" monster from your Deck or GY to your hand.'
    const second = TWO.indexOf('If this card is Normal')
    const marked = (container: HTMLElement) => [...container.querySelectorAll('mark[data-highlight]')].map((node) => node.textContent)

    it('resalta sólo ese pedazo, aunque cruce partes de colores, y el texto entero no cambia', () => {
      const { container } = render(<CardEffectText text={TWO} highlight={{ start: 0, end: second - 1 }} />)

      // El pedazo trae adentro la condición y el costo: siguen con su color, sólo ganan el fondo.
      expect(marked(container).join('')).toBe(TWO.slice(0, second - 1))
      expect(container.querySelector('[data-tone="condition"] mark')?.textContent).toBe('If this card is in your hand')
      expect(container.querySelector('[data-tone="cost"] mark')?.textContent).toMatch(/^banish 1 "HERO"/)
      expect(container.textContent).toBe(TWO)
    })

    it('el segundo efecto se resalta solo, sin tocar el primero', () => {
      const { container } = render(<CardEffectText text={TWO} highlight={{ start: second, end: TWO.length }} />)

      expect(marked(container).join('')).toBe(TWO.slice(second))
      const [firstCondition, secondCondition] = container.querySelectorAll('[data-tone="condition"]')

      expect(firstCondition?.textContent).toBe('If this card is in your hand')
      expect(firstCondition?.querySelector('mark')).toBeNull()
      expect(secondCondition?.querySelector('mark')?.textContent).toBe('If this card is Normal or Special Summoned')
      expect(container.textContent).toBe(TWO)
    })

    it('sin pedazo, o con uno vacío o fuera del texto, no resalta nada', () => {
      for (const highlight of [undefined, { start: 5, end: 5 }, { start: 900, end: 950 }, { start: 10, end: 3 }]) {
        const { container, unmount } = render(<CardEffectText text={TWO} highlight={highlight} />)

        expect(container.querySelector('mark'), JSON.stringify(highlight)).toBeNull()
        expect(container.textContent).toBe(TWO)
        unmount()
      }
    })
  })

  it('un texto sin plantilla queda como un párrafo común, sin marcas', () => {
    const { container } = render(<CardEffectText text="This card gains 500 ATK." className="text-body" />)

    expect(container.querySelector('[data-tone]')).toBeNull()
    expect(container.querySelector('p')?.className).toContain('text-body')
    expect(container.textContent).toBe('This card gains 500 ATK.')
  })
})
