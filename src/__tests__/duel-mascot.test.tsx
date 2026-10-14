// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react'
import '@testing-library/jest-dom'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import { resetMascotChoiceForTests, resetMascotForTests, restMascot, summonMascot } from '../app/mascot'
import { DuelMascot, Mascot } from '../components/mascot/Mascot'

beforeEach(() => {
  localStorage.clear()
  // La mascota saluda sola la primera vez: acá ya la saludaron.
  localStorage.setItem('ygo-lab:mascot-greeted', '1')
  resetMascotChoiceForTests()
  resetMascotForTests()
  HTMLElement.prototype.setPointerCapture = () => {}
})

afterEach(cleanup)

const mascotImages = (container: HTMLElement) => [...container.querySelectorAll('img[src*="/mascot/"]')].map((image) => image.getAttribute('src'))

describe('la mascota del duelo', () => {
  it('en un duelo hay una sola: las que andaban flotando se esconden y la de la vista es la primera de las que estaban afuera', () => {
    summonMascot('winged-kuriboh')

    const { container, rerender } = render(<Mascot />)

    expect(screen.getByRole('button', { name: 'Saludar a Cupsy' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Saludar a Winged Kuriboh' })).toBeInTheDocument()

    rerender(
      <>
        <Mascot />
        <DuelMascot />
      </>,
    )

    expect(screen.queryByRole('button', { name: /^Saludar a/ })).not.toBeInTheDocument()
    expect(mascotImages(container)).toEqual(['/mascot/cupsy/idle.webp'])
  })

  it('al salir del duelo las que estaban afuera vuelven a flotar, y siguen siendo las mismas', () => {
    summonMascot('winged-kuriboh')

    const { rerender } = render(
      <>
        <Mascot />
        <DuelMascot />
      </>,
    )

    expect(screen.queryByRole('button', { name: /^Saludar a/ })).not.toBeInTheDocument()

    rerender(<Mascot />)
    expect(screen.getAllByRole('button', { name: /^Saludar a/ })).toHaveLength(2)
  })

  it('es parte de la vista, no se agarra, y sin ninguna mascota afuera el duelo no muestra ninguna', () => {
    const { container } = render(<DuelMascot />)

    expect(container.firstElementChild).toHaveAttribute('aria-hidden', 'true')
    expect(container.firstElementChild).toHaveClass('pointer-events-none')
    expect(screen.queryByRole('button')).not.toBeInTheDocument()

    restMascot('cupsy')
    cleanup()

    const empty = render(<DuelMascot />)

    expect(mascotImages(empty.container)).toEqual([])
  })
})
