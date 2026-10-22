// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import '@testing-library/jest-dom'
import { useRef } from 'react'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import { MAT_PANELS_KEY, useMatPanels } from '../app/mat-panels'
import { ResizeHandle } from '../components/ui/ResizeHandle'

/** La sección con los dos agarres, como en la mesa (sin diseño: jsdom no mide, así que la sección no recorta nada). */
function Harness() {
  const ref = useRef<HTMLElement | null>(null)
  const panels = useMatPanels(ref, { left: true, right: true })

  return (
    <section ref={ref} aria-label="Mesa" style={panels.style}>
      <ResizeHandle panel="left" {...panels.left} label="Detalle" title="Arrastrá" />
      <ResizeHandle panel="right" {...panels.right} label="Panel" />
    </section>
  )
}

const section = () => screen.getByRole('region', { name: 'Mesa' })
const handle = (name: string) => screen.getByRole('separator', { name })
const stored = () => JSON.parse(localStorage.getItem(MAT_PANELS_KEY) ?? 'null')
const nextFrame = () => act(() => new Promise<void>((resolve) => requestAnimationFrame(() => resolve())))

beforeEach(() => {
  localStorage.clear()
  HTMLElement.prototype.setPointerCapture = () => {}
})

afterEach(cleanup)

describe('el agarre del borde de un panel', () => {
  it('es un separador vertical enfocable con su ancho y sus topes; en reposo la sección no lleva variables (20 rem, de las clases)', () => {
    render(<Harness />)

    const left = handle('Detalle')

    expect(left).toHaveAttribute('aria-orientation', 'vertical')
    expect(left).toHaveAttribute('aria-valuenow', '320')
    expect(left).toHaveAttribute('aria-valuemin', '256')
    expect(left).toHaveAttribute('aria-valuemax', '576')
    expect(left).toHaveAttribute('tabindex', '0')
    expect(left).toHaveAttribute('title', 'Arrastrá')
    expect(left).toHaveAttribute('data-panel-resizer')
    expect(left).toHaveClass('cursor-ew-resize', 'touch-none', 'absolute')
    expect(section().style.getPropertyValue('--mat-left')).toBe('')
    expect(section().style.getPropertyValue('--mat-right')).toBe('')
  })

  it('con el teclado se mueve en la dirección en que se ve: el detalle crece con →, el panel de la derecha con ←; Shift da 64 px e Inicio y Fin van a los topes', () => {
    render(<Harness />)

    fireEvent.keyDown(handle('Detalle'), { key: 'ArrowRight' })
    expect(handle('Detalle')).toHaveAttribute('aria-valuenow', '336')
    expect(section().style.getPropertyValue('--mat-left')).toBe('336px')

    fireEvent.keyDown(handle('Detalle'), { key: 'ArrowLeft', shiftKey: true })
    expect(handle('Detalle')).toHaveAttribute('aria-valuenow', '272')

    fireEvent.keyDown(handle('Panel'), { key: 'ArrowLeft' })
    expect(handle('Panel')).toHaveAttribute('aria-valuenow', '336')
    fireEvent.keyDown(handle('Panel'), { key: 'ArrowRight', shiftKey: true })
    expect(handle('Panel')).toHaveAttribute('aria-valuenow', '272')

    fireEvent.keyDown(handle('Panel'), { key: 'Home' })
    expect(handle('Panel')).toHaveAttribute('aria-valuenow', '256')
    fireEvent.keyDown(handle('Panel'), { key: 'End' })
    expect(handle('Panel')).toHaveAttribute('aria-valuenow', '576')
    expect(stored()).toEqual({ left: 272, right: 576 })
  })

  it('se arrastra con el puntero: mientras se mueve, el ancho va directo a la sección (y el cursor ↔ tapa la pantalla); al soltar queda y se guarda', async () => {
    render(<Harness />)

    const right = handle('Panel')

    fireEvent.pointerDown(right, { button: 0, pointerId: 1, clientX: 1000 })
    expect(right).toHaveAttribute('data-dragging', 'true')
    expect(document.body.querySelector('.fixed.inset-0.cursor-ew-resize')).toBeInTheDocument()

    // El de la derecha crece hacia la izquierda.
    fireEvent.pointerMove(right, { pointerId: 1, clientX: 900 })
    expect(right).toHaveAttribute('aria-valuenow', '420')
    await nextFrame()
    expect(section().style.getPropertyValue('--mat-right')).toBe('420px')
    expect(stored()).toBeNull()

    // Más allá del tope se queda en el tope.
    fireEvent.pointerMove(right, { pointerId: 1, clientX: 100 })
    fireEvent.pointerUp(right, { pointerId: 1, clientX: 100 })
    expect(right).not.toHaveAttribute('data-dragging')
    expect(right).toHaveAttribute('aria-valuenow', '576')
    expect(section().style.getPropertyValue('--mat-right')).toBe('576px')
    expect(document.body.querySelector('.fixed.inset-0.cursor-ew-resize')).not.toBeInTheDocument()
    expect(stored()).toEqual({ left: null, right: 576 })
  })

  it('un clic sin mover no elige nada (sigue el ancho de siempre) y otro puntero no lo mueve', () => {
    render(<Harness />)

    const left = handle('Detalle')

    fireEvent.pointerDown(left, { button: 0, pointerId: 1, clientX: 300 })
    fireEvent.pointerMove(left, { pointerId: 2, clientX: 500 })
    fireEvent.pointerUp(left, { pointerId: 1, clientX: 300 })
    expect(left).toHaveAttribute('aria-valuenow', '320')
    expect(section().style.getPropertyValue('--mat-left')).toBe('')
    expect(stored()).toBeNull()
  })

  it('cancelar el arrastre vuelve al ancho de antes', async () => {
    render(<Harness />)

    const left = handle('Detalle')

    fireEvent.pointerDown(left, { button: 0, pointerId: 1, clientX: 300 })
    fireEvent.pointerMove(left, { pointerId: 1, clientX: 400 })
    await nextFrame()
    expect(section().style.getPropertyValue('--mat-left')).toBe('420px')

    fireEvent.pointerCancel(left, { pointerId: 1 })
    expect(section().style.getPropertyValue('--mat-left')).toBe('')
    expect(left).toHaveAttribute('aria-valuenow', '320')
    expect(stored()).toBeNull()
  })

  it('el doble clic vuelve al ancho de siempre (la sección deja la variable)', () => {
    render(<Harness />)

    fireEvent.keyDown(handle('Detalle'), { key: 'End' })
    expect(section().style.getPropertyValue('--mat-left')).toBe('576px')

    fireEvent.doubleClick(handle('Detalle'))
    expect(handle('Detalle')).toHaveAttribute('aria-valuenow', '320')
    expect(section().style.getPropertyValue('--mat-left')).toBe('')
    expect(stored()).toEqual({ left: null, right: null })
  })

  it('lo guardado vuelve al abrir la mesa otra vez', () => {
    localStorage.setItem(MAT_PANELS_KEY, JSON.stringify({ left: 448, right: 300 }))
    render(<Harness />)

    expect(handle('Detalle')).toHaveAttribute('aria-valuenow', '448')
    expect(handle('Panel')).toHaveAttribute('aria-valuenow', '300')
    expect(section().style.getPropertyValue('--mat-left')).toBe('448px')
    expect(section().style.getPropertyValue('--mat-right')).toBe('300px')
  })
})
