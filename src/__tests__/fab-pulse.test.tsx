// @vitest-environment jsdom
import { act, fireEvent, render, screen } from '@testing-library/react'
import '@testing-library/jest-dom'
import { readFileSync } from 'node:fs'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { DraggableFab } from '../components/ui/DraggableFab'

beforeEach(() => {
  localStorage.clear()
  vi.useFakeTimers()
  window.matchMedia = ((query: string) => ({ matches: query.includes('max-width'), addEventListener: () => {}, removeEventListener: () => {} })) as unknown as typeof window.matchMedia
})

afterEach(() => {
  vi.useRealTimers()
})

const mount = () => {
  const view = render(
    <DraggableFab label="Practicar" storageKey="test:fab-pulse" onClick={() => {}}>
      <span>+</span>
    </DraggableFab>,
  )

  return { ...view, button: screen.getByRole('button', { name: 'Practicar' }) }
}

describe('el aro de los botones flotantes', () => {
  it('late al montarse y otra vez cada 5 s; cada latido se apaga solo al terminar', () => {
    const { button } = mount()

    expect(button).toHaveAttribute('data-pulse')
    fireEvent.animationEnd(button)
    expect(button).not.toHaveAttribute('data-pulse')

    act(() => {
      vi.advanceTimersByTime(4999)
    })
    expect(button).not.toHaveAttribute('data-pulse')
    act(() => {
      vi.advanceTimersByTime(1)
    })
    expect(button).toHaveAttribute('data-pulse')

    fireEvent.animationEnd(button)
    act(() => {
      vi.advanceTimersByTime(5000)
    })
    expect(button).toHaveAttribute('data-pulse')
  })

  it('arrastrado no late (ni cuenta los 5 s); al soltarlo vuelve a latir de una y retoma la cuenta', () => {
    HTMLElement.prototype.setPointerCapture = () => {}
    const { button } = mount()
    const pointer = { button: 0, pointerId: 1 }

    fireEvent.animationEnd(button)
    fireEvent.pointerDown(button, { ...pointer, clientX: 10, clientY: 10 })
    fireEvent.pointerMove(button, { ...pointer, clientX: 80, clientY: 80 })
    expect(button).toHaveAttribute('data-dragging', 'true')

    act(() => {
      vi.advanceTimersByTime(12000)
    })
    expect(button).not.toHaveAttribute('data-pulse')

    fireEvent.pointerUp(button, { ...pointer, clientX: 80, clientY: 80 })
    expect(button).toHaveAttribute('data-dragging', 'false')
    expect(button).toHaveAttribute('data-pulse')

    fireEvent.animationEnd(button)
    act(() => {
      vi.advanceTimersByTime(4999)
    })
    expect(button).not.toHaveAttribute('data-pulse')
    act(() => {
      vi.advanceTimersByTime(1)
    })
    expect(button).toHaveAttribute('data-pulse')
  })

  it('volver a dibujar el botón no pisa el atributo, y al desmontarlo el reloj se va con él', () => {
    const { button, rerender, unmount } = mount()

    fireEvent.animationEnd(button)
    rerender(
      <DraggableFab label="Practicar" storageKey="test:fab-pulse" onClick={() => {}}>
        <span>-</span>
      </DraggableFab>,
    )
    expect(button).not.toHaveAttribute('data-pulse')

    const running = vi.getTimerCount()
    unmount()
    expect(vi.getTimerCount()).toBe(running - 1)
  })

  it('el latido no es una animación infinita, y sólo corre con movimiento permitido y sin arrastrar (la regla del latido es más específica que un `animate-none` suelto)', () => {
    const { button } = mount()
    const css = readFileSync('src/index.css', 'utf8')

    expect(css).toMatch(/--animate-fab-pulse:\s*fab-pulse 700ms ease-out;/)
    expect(css).not.toMatch(/--animate-fab-pulse:[^;]*infinite/)
    expect(button.className).toContain('motion-safe:data-pulse:not-data-[dragging=true]:after:animate-fab-pulse')
    expect(button.className).not.toMatch(/(?<![:\w-])after:animate-fab-pulse/)
    expect(button.className).not.toContain('after:animate-none')
  })
})
