// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import '@testing-library/jest-dom'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { POSITION } from '../app/auto/protocol'
import { AskOptions } from '../components/auto/AskOptions'

/** La posición (M-05, `select_position`): dos dibujos, la carta parada o acostada; un toque contesta, sin botón de confirmar. */
afterEach(cleanup)

describe('M-05: la posición', () => {
  it('un dibujo por posición (ataque parada, defensa acostada, boca abajo con el dorso) y un toque contesta', () => {
    const onPick = vi.fn()
    render(
      <AskOptions
        title="Elegí la posición de «Warwolf»"
        of="position"
        mode="one"
        options={[
          { id: String(POSITION.FACEUP_ATTACK), label: 'En ataque' },
          { id: String(POSITION.FACEDOWN_DEFENSE), label: 'Boca abajo' },
        ]}
        onPick={onPick}
      />,
    )
    const menu = screen.getByRole('menu', { name: 'Elegí la posición de «Warwolf»' })
    const choices = within(menu).getAllByRole('menuitem')

    expect(choices.map((choice) => choice.textContent)).toEqual(['En ataque', 'Boca abajo'])
    expect(choices[0]!.querySelector('[data-position-drawing="attack"]')).not.toBeNull()
    expect(choices[1]!.querySelector('[data-position-drawing="defense"] .rotate-90')).not.toBeNull()
    expect(choices.every((choice) => choice.className.includes('min-h-28'))).toBe(true)
    // Sin confirmar: ni «Declarar» ni otra principal.
    expect(screen.queryByRole('button', { name: /Declarar|Confirmar/ })).toBeNull()

    fireEvent.click(choices[1]!)
    expect(onPick).toHaveBeenCalledWith([String(POSITION.FACEDOWN_DEFENSE)])
  })
})
