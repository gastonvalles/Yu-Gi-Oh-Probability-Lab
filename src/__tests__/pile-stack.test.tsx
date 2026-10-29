// @vitest-environment jsdom
import { render, screen } from '@testing-library/react'
import '@testing-library/jest-dom'
import { describe, expect, it } from 'vitest'

import { PileStack } from '../components/probability/PileStack'
import { pileDepth } from '../components/probability/practice-styles'
import { IconButton, TileButton } from '../components/ui/IconButton'

const layers = (container: HTMLElement) => [...container.querySelectorAll<HTMLElement>('[data-pile-edge] > span')]
const offset = (layer: HTMLElement) => Number(/translateY\((-?[\d.]+)%\)/.exec(layer.style.transform)?.[1])
const dim = (layer: HTMLElement) => Number(/brightness\(([\d.]+)\)/.exec(layer.style.filter)?.[1])

describe('el volumen de las pilas de cartas', () => {
  it('una capa por cada seis cartas, hasta 8: un deck de 40 se ve más grueso que uno de 15 y se afina al robar', () => {
    expect([1, 6, 7, 15, 35, 40, 48, 60, 80].map(pileDepth)).toEqual([1, 1, 2, 3, 6, 7, 8, 8, 8])
    expect(pileDepth(0)).toBe(0)
    expect(pileDepth(40)).toBeGreaterThan(pileDepth(15))
  })

  it('son capas de dorso apiladas, cada una más abajo y más oscura que la de arriba (la más lejana, primero)', () => {
    const { container } = render(<PileStack count={40} />)
    const stack = layers(container)

    expect(stack).toHaveLength(7)
    // Del fondo al frente: asoman cada vez menos y son cada vez más claras (la de arriba de todo es la carta de la pila).
    expect(stack.map(offset)).toEqual([14, 12, 10, 8, 6, 4, 2])
    expect(stack.map(dim)).toEqual([...stack.map(dim)].sort((a, b) => a - b))
    expect(Math.min(...stack.map(dim))).toBeGreaterThan(0.4)
    // Cada capa es un dorso de carta (la imagen), no una línea de color.
    expect(stack.every((layer) => layer.className.includes('bg-[url('))).toBe(true)
  })

  it('sin cartas no hay nada que asome', () => {
    expect(render(<PileStack count={0} />).container.querySelector('[data-pile-edge]')).toBeNull()
  })
})

describe('los botones de la botonera de la mesa', () => {
  it('«tile» es una caja oscura con un borde fino que sólo cambia de color al prenderse (nada se corre), sin relleno de color', () => {
    render(<IconButton tone="tile" aria-label="Deshacer" />)

    const button = screen.getByRole('button', { name: 'Deshacer' })

    expect(button).toHaveClass('bg-card-background', 'rounded-card', 'border', 'border-border', 'aria-pressed:border-info', 'data-[active=true]:border-info')
    expect(button.className).not.toMatch(/\bbg-(primary|info)\b/)
  })

  it('«TileButton» es la misma caja con su nombre: prendido o el de ahora, en ámbar; «Todavía no», en lila', () => {
    render(
      <>
        <TileButton label="Automático" aria-label="Automático" aria-pressed="true" />
        <TileButton label="Battle" aria-label="Battle" aria-disabled />
      </>,
    )

    const on = screen.getByRole('button', { name: 'Automático' })

    expect(on).toHaveClass('aria-pressed:text-info', 'aria-[current=true]:text-info', 'aria-disabled:text-muted')
    expect(on.firstElementChild).toHaveClass('bg-card-background', 'border-border', 'group-aria-pressed:border-info')
    expect(on).toHaveTextContent('Automático')
    expect(screen.getByRole('button', { name: 'Battle' })).toHaveAttribute('aria-disabled', 'true')
  })
})
