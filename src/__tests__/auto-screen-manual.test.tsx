// @vitest-environment jsdom
import { fireEvent, screen } from '@testing-library/react'
import '@testing-library/jest-dom'
import { describe, expect, it } from 'vitest'

import { autoPrefs, setAutoPref } from '../app/auto-prefs'
import { dispatches, renderAuto } from './support/auto-screen-harness'

describe('auto-screen · volver a la mesa manual', () => {
  it('«Más opciones → Jugar en modo manual» apaga el duelo automático: la pantalla de afuera abre la mesa manual con el mismo deck', () => {
    setAutoPref('duel', true)
    const fake = renderAuto()

    fireEvent.click(screen.getByRole('button', { name: 'Más opciones del duelo' }))
    expect(screen.getByText('Apaga las reglas automáticas y abre la mesa manual con tu mismo deck.')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Jugar en modo manual' }))

    expect(autoPrefs().duel).toBe(false)
    // No es reiniciar ni una jugada: sólo cambia de mesa.
    expect(fake.restarts).toBe(0)
    expect(dispatches).toBe(0)
  })
})
