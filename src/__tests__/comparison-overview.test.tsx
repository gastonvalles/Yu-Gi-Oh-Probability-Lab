// @vitest-environment jsdom
import { render, screen, within } from '@testing-library/react'
import '@testing-library/jest-dom'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import { compareBuilds } from '../app/build-comparison'
import { ComparisonOverview } from '../components/comparison/ComparisonOverview'
import { applyLocale } from '../i18n'
import { DECK_A, DECK_B, RULES } from './support/comparison-fixtures'

const compare = () => compareBuilds({ name: 'Alpha deck', cards: DECK_A }, { name: 'Beta deck', cards: DECK_B }, { ...RULES, patterns: [] })

beforeEach(() => applyLocale('es'))
afterEach(() => applyLocale('es'))

describe('el resumen de la comparación (celular)', () => {
  it('muestra los dos mazos con su anillo de «de cada 100» y, debajo, sólo lo que cambia con un chip ▲/▼ de B contra A', () => {
    const comparison = compare()

    render(<ComparisonOverview comparison={comparison} />)
    const summary = screen.getByRole('region', { name: 'Resumen de la comparación' })

    for (const side of ['A', 'B'] as const) {
      const value = Math.round(comparison.clean!.average[side === 'A' ? 'a' : 'b'] * 100)

      expect(within(summary).getByRole('meter', { name: `Build ${side}: ${value} de cada 100 manos son buenas` })).toHaveAttribute('aria-valuenow', String(value))
    }

    expect(within(summary).getByText('Lo que cambia · de cada 100 manos')).toBeInTheDocument()
    expect(within(summary).getByText(/Lo que no cambia no se muestra/)).toBeInTheDocument()
    expect(within(summary).getAllByText(/^[▲▼] \d+$/).length).toBeGreaterThan(0)
  })

  it('no dibuja nada mientras el cálculo no está listo', () => {
    const comparison = { ...compare(), clean: null }

    const { container } = render(<ComparisonOverview comparison={comparison} />)

    expect(container).toBeEmptyDOMElement()
  })
})
