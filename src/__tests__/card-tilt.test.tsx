// @vitest-environment jsdom
import { fireEvent, render, screen } from '@testing-library/react'
import '@testing-library/jest-dom'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import { CardGlare, TILT_ART, tiltHandlers } from '../components/card-detail/card-tilt'

function Art() {
  return (
    <div data-testid="art" className={TILT_ART} {...tiltHandlers}>
      <CardGlare />
    </div>
  )
}

beforeEach(() => {
  window.matchMedia = ((query: string) => ({ matches: false, media: query, addEventListener: () => {}, removeEventListener: () => {}, addListener: () => {}, removeListener: () => {}, onchange: null, dispatchEvent: () => false })) as typeof window.matchMedia
  // jsdom no calcula el layout: la carta mide 200 × 300 en el origen.
  HTMLElement.prototype.getBoundingClientRect = () => ({ left: 0, top: 0, right: 200, bottom: 300, width: 200, height: 300, x: 0, y: 0, toJSON: () => ({}) })
})

afterEach(() => {
  window.matchMedia = undefined as unknown as typeof window.matchMedia
})

describe('la carta grande se inclina en 3D hacia el mouse', () => {
  it('con el mouse se hunde del lado del puntero, con un brillo que lo sigue, y se endereza al irse', () => {
    render(<Art />)
    const art = screen.getByTestId('art')

    fireEvent.pointerMove(art, { pointerType: 'mouse', clientX: 190, clientY: 20 })
    // Arriba a la derecha, en el borde: el eje es perpendicular al desplazamiento desde el centro, el giro es el máximo (12°) y el brillo queda de ese lado.
    expect(art.style.rotate).toMatch(/^0\.86\d* 0\.89\d* 0 12deg$/)
    expect(art.dataset.tilting).toBe('true')
    expect(art.style.getPropertyValue('--glare-x')).toBe('95%')

    fireEvent.pointerLeave(art)
    expect(art.style.rotate).toBe('')
    expect(art.dataset.tilting).toBe('false')
  })

  it('con el dedo no se inclina: sería tirar de la carta', () => {
    render(<Art />)
    const art = screen.getByTestId('art')

    fireEvent.pointerMove(art, { pointerType: 'touch', clientX: 190, clientY: 20 })
    expect(art.style.rotate).toBe('')
    expect(art.dataset.tilting).toBeUndefined()
  })

  it('con movimiento reducido tampoco', () => {
    window.matchMedia = ((query: string) => ({ matches: query.includes('reduce'), media: query, addEventListener: () => {}, removeEventListener: () => {}, addListener: () => {}, removeListener: () => {}, onchange: null, dispatchEvent: () => false })) as typeof window.matchMedia
    render(<Art />)
    const art = screen.getByTestId('art')

    fireEvent.pointerMove(art, { pointerType: 'mouse', clientX: 190, clientY: 20 })
    expect(art.style.rotate).toBe('')
  })
})
