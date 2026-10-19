// @vitest-environment jsdom
import { render, screen, within } from '@testing-library/react'
import '@testing-library/jest-dom'
import { describe, expect, it } from 'vitest'

import type { DuelSettings } from '../app/duel-protocol'
import { RoomRules } from '../components/duel/RoomRules'

const settings = (overrides: Partial<DuelSettings> = {}): DuelSettings => ({ lp: 8000, hand: 5, limitMin: 50, format: 'tcg', ...overrides }) as DuelSettings

describe('la ficha de reglas de la sala', () => {
  it('en TCG y OCG no dice la vida ni la mano inicial (son siempre las mismas)', () => {
    for (const format of ['tcg', 'ocg'] as const) {
      const { unmount } = render(<RoomRules settings={settings({ format })} isPublic={false} />)
      const summary = within(screen.getByTestId('room-summary'))

      expect(summary.getByText('Formato')).toBeInTheDocument()
      expect(summary.queryByText('Vida inicial')).not.toBeInTheDocument()
      expect(summary.queryByText('Mano inicial')).not.toBeInTheDocument()
      unmount()
    }
  })

  it('en cualquier otro formato sí: ahí pueden ser otras', () => {
    render(<RoomRules settings={settings({ format: 'goat', lp: 8000, hand: 5 })} isPublic={null} />)
    const summary = within(screen.getByTestId('room-summary'))

    expect(summary.getByText('Vida inicial').nextElementSibling).toHaveTextContent('8000')
    expect(summary.getByText('Mano inicial').nextElementSibling).toHaveTextContent('5')
  })
})
