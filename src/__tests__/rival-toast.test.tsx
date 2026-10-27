// @vitest-environment jsdom
import { act, fireEvent, render, screen } from '@testing-library/react'
import '@testing-library/jest-dom'
import { toast } from 'react-hot-toast'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { showRivalToast } from '../app/use-toast-message'
import { AppToast } from '../components/ui/AppToast'

afterEach(() => {
  vi.restoreAllMocks()
  vi.useRealTimers()
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

  it('una reacción (sólo emojis) es el emoji y el nombre en una sola fila baja, para no tapar el campo', () => {
    render(<AppToast id="a" visible message="👍" tone="info" rival="Beto" />)

    expect(screen.getByText('👍')).toHaveClass('text-stat')
    expect(screen.getByRole('status')).toHaveClass('py-1.5')
    expect(screen.getByText('Beto')).toHaveClass('text-info-soft')
  })

  it('sale en la esquina de abajo a la derecha', () => {
    const custom = vi.spyOn(toast, 'custom').mockReturnValue('x')

    showRivalToast('Beto', 'Hola')

    expect(custom).toHaveBeenCalledWith(expect.any(Function), expect.objectContaining({ position: 'bottom-right' }))
  })
})

describe('descartar un aviso (también la reacción del rival, en el celular)', () => {
  // jsdom no trae la captura del puntero: se la finge para que el aviso reciba el movimiento.
  const press = (element: HTMLElement, from: number, to: number) => {
    element.setPointerCapture = vi.fn()
    fireEvent.pointerDown(element, { clientX: from, pointerId: 1 })
    fireEvent.pointerMove(element, { clientX: to, pointerId: 1 })
    fireEvent.pointerUp(element, { clientX: to, pointerId: 1 })
  }

  it('un solo toque lo hace desaparecer, como el clic sobre el emoji grande del rival en escritorio', () => {
    vi.useFakeTimers()
    const remove = vi.spyOn(toast, 'remove').mockImplementation(() => undefined)
    render(<AppToast id="a" visible message="👍" tone="info" rival="Beto" />)

    press(screen.getByRole('status'), 100, 100)

    expect(screen.getByRole('status')).toHaveAttribute('data-visible', 'false')
    act(() => {
      vi.advanceTimersByTime(200)
    })
    expect(remove).toHaveBeenCalledWith('a')
  })

  it('deslizarlo lo descarta como antes, y un arrastre corto que no llega no lo descarta', () => {
    vi.useFakeTimers()
    const remove = vi.spyOn(toast, 'remove').mockImplementation(() => undefined)
    const { unmount } = render(<AppToast id="a" visible message="Guardado" tone="success" />)

    press(screen.getByRole('status'), 100, 40)
    expect(screen.getByRole('status')).toHaveAttribute('data-visible', 'true')
    act(() => {
      vi.advanceTimersByTime(200)
    })
    expect(remove).not.toHaveBeenCalled()

    unmount()
    render(<AppToast id="b" visible message="Guardado" tone="success" />)

    press(screen.getByRole('status'), 200, 100)
    act(() => {
      vi.advanceTimersByTime(200)
    })
    expect(remove).toHaveBeenCalledWith('b')
  })
})
