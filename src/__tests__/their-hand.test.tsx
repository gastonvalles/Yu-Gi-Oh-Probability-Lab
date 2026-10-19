// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react'
import '@testing-library/jest-dom'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { TheirHand } from '../components/duel/DuelTable'
import { THEIR_HAND } from '../components/duel/their-hand'

function viewport(desktop: boolean) {
  vi.stubGlobal('matchMedia', (query: string) => ({ matches: desktop, media: query, addEventListener: () => undefined, removeEventListener: () => undefined, addListener: () => undefined, removeListener: () => undefined }))
}

afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
})

const cardsOf = () => [...screen.getByRole('img').querySelectorAll<HTMLElement>(':scope > span')]

describe('la mano del rival', () => {
  it('son los dorsos que tiene, en abanico y encimados, con el tamaño de la mano de escritorio', () => {
    viewport(true)
    render(<TheirHand count={5} />)

    const cards = cardsOf()

    expect(cards).toHaveLength(5)
    expect(screen.getByRole('img')).toHaveAccessibleName(/5/)
    // Cerca del tamaño de la nuestra (que mide hasta 100 px), pero más chica: 68 px de ancho, con su alto de carta.
    expect(cards[0]).toHaveStyle({ width: `${THEIR_HAND.desktop.cardWidth}px` })
    expect(Number.parseFloat(cards[0]!.style.height)).toBeGreaterThan(THEIR_HAND.desktop.cardWidth * 1.4)
    // El centro del abanico es lo más cercano al campo y los extremos suben (espejado respecto del nuestro).
    const lift = (card: HTMLElement) => Number.parseFloat(/translate\([^,]+,\s*(-?[\d.]+)px\)/.exec(card.style.transform)?.[1] ?? '0')

    expect(lift(cards[2]!)).toBeCloseTo(0)
    expect(lift(cards[0]!)).toBeLessThan(lift(cards[2]!))
    expect(lift(cards[4]!)).toBeLessThan(lift(cards[2]!))
  })

  it('en el celular es un poco más chica, y nunca se dibujan más de 12 dorsos', () => {
    viewport(false)
    render(<TheirHand count={20} />)

    const cards = cardsOf()

    expect(cards).toHaveLength(12)
    expect(cards[0]).toHaveStyle({ width: `${THEIR_HAND.mobile.cardWidth}px` })
    expect(THEIR_HAND.mobile.cardWidth).toBeLessThan(THEIR_HAND.desktop.cardWidth)
  })

  it('sin cartas no dibuja nada pero conserva su lugar (la mesa no se mueve cuando roba)', () => {
    viewport(true)
    const { container } = render(<TheirHand count={0} />)

    expect(cardsOf()).toHaveLength(0)
    expect((container.firstElementChild as HTMLElement).style.height).toBe(`${THEIR_HAND.desktop.room}px`)
  })
})
