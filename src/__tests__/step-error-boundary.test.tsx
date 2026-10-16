// @vitest-environment jsdom
import { fireEvent, render, screen } from '@testing-library/react'
import '@testing-library/jest-dom'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { StepErrorBoundary } from '../components/ui/StepErrorBoundary'

let broken = true

function Maybe() {
  if (broken) throw new Error('se rompió al dibujar')
  return <p>Todo bien</p>
}

afterEach(() => {
  vi.restoreAllMocks()
  broken = true
})

describe('la red de seguridad de una pantalla', () => {
  it('dice qué se conserva, deja volver a otro paso y reintentar sin recargar la página', () => {
    vi.spyOn(console, 'error').mockImplementation(() => {})
    const onBack = vi.fn()

    render(
      <StepErrorBoundary title="Algo salió mal en el Lab" backLabel="Ir al builder" onBack={onBack}>
        <Maybe />
      </StepErrorBoundary>,
    )

    expect(screen.getByRole('alert')).toHaveTextContent('Algo salió mal en el Lab')
    expect(screen.getByText('Tu deck y tus reglas siguen guardados en este navegador.')).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'Ir al builder' }))
    expect(onBack).toHaveBeenCalledTimes(1)

    broken = false
    fireEvent.click(screen.getByRole('button', { name: /Reintentar/ }))
    expect(screen.getByText('Todo bien')).toBeInTheDocument()
  })
})
