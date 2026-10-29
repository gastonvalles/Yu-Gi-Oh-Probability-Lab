// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react'
import '@testing-library/jest-dom'
import { afterEach, describe, expect, it } from 'vitest'

import { ShineFrame } from '../components/ui/ShineFrame'

afterEach(cleanup)

describe('ShineFrame', () => {
  it('activo: el hilo que gira y el brillo son capas decorativas (sin toques ni lector) que sólo mueven transform y se esconden con movimiento reducido; el botón sigue a mano', () => {
    const { container } = render(
      <ShineFrame>
        <button type="button">Jugar ahora</button>
      </ShineFrame>,
    )
    const layers = [...container.querySelectorAll('[aria-hidden="true"]')]

    expect(screen.getByRole('button', { name: 'Jugar ahora' })).toBeEnabled()
    expect(layers).toHaveLength(2)
    for (const layer of layers) {
      expect(layer).toHaveClass('pointer-events-none', 'motion-reduce:hidden')
      expect(layer.className).not.toContain('animate-')
    }
    expect(container.querySelector('.animate-spin')).not.toBeNull()
    expect(container.querySelector('.animate-shine')).not.toBeNull()
    // El marco no recorta el foco del botón: lo recortan sus capas.
    expect(container.firstElementChild?.className).not.toContain('overflow-hidden')
  })

  it('quieto: el mismo marco y el mismo botón, sin ninguna capa que se mueva', () => {
    const { container } = render(
      <ShineFrame active={false} className="ml-auto">
        <button type="button">Jugar ahora</button>
      </ShineFrame>,
    )

    expect(container.querySelector('[aria-hidden="true"]')).toBeNull()
    expect(container.querySelector('[class*="animate-"]')).toBeNull()
    expect(container.firstElementChild).toHaveClass('p-0.5', 'ml-auto')
    expect(screen.getByRole('button', { name: 'Jugar ahora' })).toBeInTheDocument()
  })
})
