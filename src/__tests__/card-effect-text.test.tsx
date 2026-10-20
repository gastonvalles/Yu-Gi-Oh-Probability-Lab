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

  it('un texto sin plantilla queda como un párrafo común, sin marcas', () => {
    const { container } = render(<CardEffectText text="This card gains 500 ATK." className="text-body" />)

    expect(container.querySelector('[data-tone]')).toBeNull()
    expect(container.querySelector('p')?.className).toContain('text-body')
    expect(container.textContent).toBe('This card gains 500 ATK.')
  })
})
