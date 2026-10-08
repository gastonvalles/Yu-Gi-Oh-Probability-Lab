// @vitest-environment jsdom
import { fireEvent, render, screen } from '@testing-library/react'
import { useRef } from 'react'
import { describe, expect, it, vi } from 'vitest'

import { useFocusTrap } from '../app/use-focus-trap'

function Dialog({ active }: { active: boolean }) {
  const ref = useRef<HTMLDivElement>(null)
  useFocusTrap(ref, active)

  return (
    <div ref={ref} tabIndex={-1} role="dialog">
      <button type="button">Primero</button>
      <button type="button">Último</button>
    </div>
  )
}

describe('useFocusTrap', () => {
  it('mueve el foco adentro al abrir, lo hace girar con Tab y lo devuelve al cerrar', () => {
    vi.useFakeTimers()
    const outside = document.createElement('button')
    document.body.append(outside)
    outside.focus()

    const view = render(<Dialog active />)
    vi.runAllTimers()

    const first = screen.getByText('Primero')
    const last = screen.getByText('Último')
    expect(document.activeElement).toBe(first)

    last.focus()
    fireEvent.keyDown(document, { key: 'Tab' })
    expect(document.activeElement).toBe(first)

    fireEvent.keyDown(document, { key: 'Tab', shiftKey: true })
    expect(document.activeElement).toBe(last)

    view.unmount()
    expect(document.activeElement).toBe(outside)

    outside.remove()
    vi.useRealTimers()
  })
})
