// @vitest-environment jsdom
import { render, screen } from '@testing-library/react'
import '@testing-library/jest-dom'
import { describe, expect, it } from 'vitest'

import { IconButton } from '../components/ui/IconButton'
import { pileEdge } from '../components/probability/practice-styles'

const layers = (count: number, up = false) => (pileEdge(count, up)?.boxShadow as string | undefined)?.split('),').length ?? 0

describe('el grosor de las pilas', () => {
  it('un canto por cada seis cartas, hasta 10: un deck de 40 se ve más grueso que uno de 15 y se afina al robar', () => {
    expect([1, 6, 7, 15, 35, 40, 60, 80].map((count) => layers(count))).toEqual([1, 1, 2, 3, 6, 7, 10, 10])
    expect(layers(0)).toBe(0)
    expect(pileEdge(0)).toBeUndefined()
    expect(layers(40)).toBeGreaterThan(layers(15))
  })

  it('los cantos asoman debajo de la pila, y arriba si es la del rival (del lado de afuera del campo)', () => {
    expect(pileEdge(12)?.boxShadow).toMatch(/^0 1px 0 .*,0 2px 0 /)
    expect(pileEdge(12, true)?.boxShadow).toMatch(/^0 -1px 0 .*,0 -2px 0 /)
  })
})

describe('los botones de la botonera de la mesa', () => {
  it('«tile» es una caja oscura sin borde', () => {
    render(<IconButton tone="tile" aria-label="Deshacer" />)

    const button = screen.getByRole('button', { name: 'Deshacer' })

    expect(button).toHaveClass('bg-card-background', 'rounded-card')
    // (`transition-[…border-color…]` no cuenta: sólo las clases de borde.)
    expect(button.className.split(/\s+/).filter((name) => /^(hover:)?border(-|$)/.test(name))).toEqual([])
  })
})
