// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import '@testing-library/jest-dom'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { SelectChip } from '../components/ui/SelectChip'

afterEach(cleanup)

const SORTS = [
  { value: 'code', label: 'Por código', short: 'Código' },
  { value: 'price', label: 'Por precio', short: 'Precio' },
] as const

function renderChip(props: Partial<Parameters<typeof SelectChip>[0]> = {}) {
  const onChange = vi.fn()
  render(<SelectChip label="Orden" value="code" onChange={onChange} options={SORTS} {...props} />)

  return { onChange, select: screen.getByRole('combobox') }
}

describe('SelectChip', () => {
  it('es un selector nativo que se llama «{nombre}: {valor}» y ofrece todas las opciones', () => {
    const { select } = renderChip()

    expect(select.tagName).toBe('SELECT')
    expect(select).toHaveAccessibleName('Orden: Por código')
    expect(select).toHaveValue('code')
    expect([...select.querySelectorAll('option')].map((option) => option.textContent)).toEqual(['Por código', 'Por precio'])
  })

  it('a la vista muestra el valor elegido: el corto sin el nombre, o el nombre y el valor entero con showLabel; lo de la vista no se lee dos veces', () => {
    renderChip({ value: 'price' })

    expect(screen.getByText('Precio')).toBeInTheDocument()
    expect(screen.getByText('Precio').closest('[aria-hidden="true"]')).not.toBeNull()
    expect(screen.queryByText('Orden')).not.toBeInTheDocument()

    cleanup()
    renderChip({ value: 'price', showLabel: true })
    expect(screen.getByText('Orden')).toBeInTheDocument()
    expect(screen.getByText('Orden').parentElement).toHaveTextContent('OrdenPor precio')
  })

  it('elegir otra opción llama a onChange con su valor', () => {
    const { select, onChange } = renderChip()

    fireEvent.change(select, { target: { value: 'price' } })
    expect(onChange).toHaveBeenCalledWith('price')
  })

  it('apagado no se puede elegir, se ve tenue y sin hover', () => {
    const { select } = renderChip({ disabled: true })
    const chip = select.parentElement!

    expect(select).toBeDisabled()
    expect(chip).toHaveClass('opacity-40')
    expect(chip.className).not.toMatch(/hover:/)
  })

  it('se enfoca con el teclado y el foco se ve en la pastilla (shadow-focus)', () => {
    const { select } = renderChip()

    select.focus()
    expect(select).toHaveFocus()
    expect(select.parentElement).toHaveClass('has-[:focus-visible]:shadow-focus')
  })

  it('md mide 40 px (44 con el dedo) y sm 32 px, que con el dedo se toca en 44 (crece el selector transparente, no la pastilla)', () => {
    const { select } = renderChip()

    expect(select.parentElement).toHaveClass('h-10', 'pointer-coarse:h-11')
    expect(select).toHaveClass('pointer-coarse:h-11', 'opacity-0', 'absolute')

    cleanup()
    const small = renderChip({ size: 'sm' }).select
    expect(small.parentElement).toHaveClass('h-8')
    expect(small.parentElement).not.toHaveClass('pointer-coarse:h-11')
    expect(small).toHaveClass('pointer-coarse:h-11')
  })
})
