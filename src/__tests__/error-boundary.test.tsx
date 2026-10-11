// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import '@testing-library/jest-dom'

import { ErrorBoundary } from '../components/ui/ErrorBoundary'

function Boom(): never {
  throw new Error('se rompió al dibujar')
}

afterEach(() => vi.restoreAllMocks())

describe('pantalla de "Algo salió mal"', () => {
  it('muestra la mascota, el aviso y un único botón que recarga', () => {
    vi.spyOn(console, 'error').mockImplementation(() => {})
    const reload = vi.fn()
    Object.defineProperty(window, 'location', { value: { ...window.location, reload }, writable: true })

    render(
      <ErrorBoundary>
        <Boom />
      </ErrorBoundary>,
    )

    expect(screen.getByRole('heading', { name: 'Algo salió mal' })).toBeInTheDocument()
    expect(screen.getAllByRole('button')).toHaveLength(1)
    screen.getByRole('button', { name: /Reintentar/ }).click()
    expect(reload).toHaveBeenCalledTimes(1)
    expect(screen.queryByText(/Empezar de cero/)).not.toBeInTheDocument()
  })
})
