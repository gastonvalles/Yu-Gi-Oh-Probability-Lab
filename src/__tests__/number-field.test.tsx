/** @vitest-environment jsdom */
import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

import { NumberField } from '../components/ui/NumberField'

describe('NumberField', () => {
  it('se puede vaciar para escribir otro número sin que vuelva al 1', () => {
    const onChange = vi.fn()
    render(<NumberField value={1} min={1} onChange={onChange} aria-label="Cantidad" />)
    const input = screen.getByLabelText('Cantidad') as HTMLInputElement

    fireEvent.change(input, { target: { value: '' } })
    expect(input.value).toBe('')
    expect(onChange).not.toHaveBeenCalled()

    fireEvent.change(input, { target: { value: '2' } })
    expect(onChange).toHaveBeenCalledWith(2)
  })

  it('si lo dejás vacío o fuera de rango, al salir vuelve al último valor', () => {
    render(<NumberField value={3} min={1} max={5} onChange={() => {}} aria-label="Cantidad" />)
    const input = screen.getByLabelText('Cantidad') as HTMLInputElement

    fireEvent.change(input, { target: { value: '9' } })
    fireEvent.blur(input)
    expect(input.value).toBe('3')
  })
})
