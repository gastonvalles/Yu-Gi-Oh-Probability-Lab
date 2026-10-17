// @vitest-environment jsdom
import { render, screen } from '@testing-library/react'
import '@testing-library/jest-dom'
import { toast } from 'react-hot-toast'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { showRivalToast } from '../app/use-toast-message'
import { AppToast } from '../components/ui/AppToast'

afterEach(() => {
  vi.restoreAllMocks()
})

describe('el mensaje del rival como aviso', () => {
  it('lleva su nombre y su color (el del rival), más grande que un aviso común', () => {
    const { rerender } = render(<AppToast id="a" visible message="¿Respondés?" tone="info" rival="Beto" />)
    const toastEl = screen.getByRole('status')

    expect(screen.getByText('Beto')).toHaveClass('text-info-soft')
    expect(screen.getByText('¿Respondés?')).toBeInTheDocument()
    expect(toastEl).toHaveClass('border-info/70', 'text-lead')

    // Un aviso común no cambia.
    rerender(<AppToast id="a" visible message="Guardado" tone="success" />)
    expect(screen.getByRole('status')).not.toHaveClass('border-info/70')
    expect(screen.getByRole('status')).toHaveClass('text-body')
  })

  it('una reacción (sólo emojis) se ve todavía más grande', () => {
    render(<AppToast id="a" visible message="👍" tone="info" rival="Beto" />)

    expect(screen.getByText('👍')).toHaveClass('text-display')
  })

  it('sale en la esquina de abajo a la derecha', () => {
    const custom = vi.spyOn(toast, 'custom').mockReturnValue('x')

    showRivalToast('Beto', 'Hola')

    expect(custom).toHaveBeenCalledWith(expect.any(Function), expect.objectContaining({ position: 'bottom-right' }))
  })
})
