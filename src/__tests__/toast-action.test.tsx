// @vitest-environment jsdom
import { act, fireEvent, render, screen } from '@testing-library/react'
import '@testing-library/jest-dom'
import { toast } from 'react-hot-toast'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { showToastMessage } from '../app/use-toast-message'
import { AppToast } from '../components/ui/AppToast'

afterEach(() => {
  vi.restoreAllMocks()
  vi.useRealTimers()
})

describe('un aviso con una acción («Deshacer»)', () => {
  it('lleva el botón al final; tocarlo hace la acción y cierra el aviso', () => {
    vi.useFakeTimers()
    const remove = vi.spyOn(toast, 'remove').mockImplementation(() => undefined)
    const onAction = vi.fn()
    render(<AppToast id="a" visible message="Cargaste B en el builder." tone="success" action={{ label: 'Deshacer', onAction }} />)
    const button = screen.getByRole('button', { name: 'Deshacer' })

    expect(screen.getByRole('status')).toContainElement(button)
    fireEvent.click(button)

    expect(onAction).toHaveBeenCalledTimes(1)
    expect(screen.getByRole('status')).toHaveAttribute('data-visible', 'false')
    act(() => {
      vi.advanceTimersByTime(200)
    })
    expect(remove).toHaveBeenCalledWith('a')
  })

  it('el toque del botón no es el del aviso: no lo arrastra ni lo descarta por su cuenta (no captura el puntero)', () => {
    const onAction = vi.fn()
    render(<AppToast id="a" visible message="Cargaste B en el builder." tone="success" action={{ label: 'Deshacer', onAction }} />)
    const box = screen.getByRole('status')
    box.setPointerCapture = vi.fn()

    fireEvent.pointerDown(screen.getByRole('button', { name: 'Deshacer' }), { clientX: 100, pointerId: 1 })
    fireEvent.pointerUp(screen.getByRole('button', { name: 'Deshacer' }), { clientX: 100, pointerId: 1 })

    expect(box.setPointerCapture).not.toHaveBeenCalled()
    expect(box).toHaveAttribute('data-visible', 'true')
    expect(onAction).not.toHaveBeenCalled()
  })

  it('sin acción, el aviso es el de siempre; con acción, dura más (hay que llegar a tocarla)', () => {
    const custom = vi.spyOn(toast, 'custom').mockReturnValue('x')
    vi.spyOn(toast, 'dismiss').mockImplementation(() => undefined)

    showToastMessage('Guardado', 'success')
    showToastMessage('Cargaste B', 'success', { action: { label: 'Deshacer', onAction: () => {} } })

    const [plain, withAction] = custom.mock.calls.map(([, options]) => options?.duration)
    expect(withAction).toBeGreaterThan(plain!)

    render(<AppToast id="b" visible message="Guardado" tone="success" />)
    expect(screen.queryByRole('button')).toBeNull()
  })
})
