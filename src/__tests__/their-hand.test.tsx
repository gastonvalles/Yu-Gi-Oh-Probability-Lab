// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react'
import '@testing-library/jest-dom'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { TheirHand } from '../components/duel/DuelTable'
import { THEIR_HAND } from '../components/duel/their-hand'
import { RivalHandStrip } from '../components/probability/RivalHandStrip'
import { readFileSync } from 'node:fs'
import { configureStore } from '@reduxjs/toolkit'
import type { ReactNode } from 'react'
import { Provider } from 'react-redux'

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
    // El abanico es ascendente, como el nuestro (Gastón, 2026-10-19): el centro es lo más alto (lo más lejos del campo) y los extremos bajan hacia él.
    const lift = (card: HTMLElement) => -Number.parseFloat(/translate\([^,]+,\s*(-?[\d.]+)px\)/.exec(card.style.transform)?.[1] ?? '0')
    const angle = (card: HTMLElement) => Number.parseFloat(/rotate\((-?[\d.]+)deg\)/.exec(card.style.transform)?.[1] ?? '0')

    expect(lift(cards[0]!)).toBeCloseTo(0)
    expect(lift(cards[4]!)).toBeCloseTo(0)
    expect(lift(cards[2]!)).toBeGreaterThan(lift(cards[0]!))
    expect(lift(cards[1]!)).toBeGreaterThan(lift(cards[0]!))
    expect(lift(cards[1]!)).toBeCloseTo(lift(cards[3]!))
    // Las puntas se abren hacia afuera: la izquierda gira a la izquierda y la derecha a la derecha, y el centro queda derecho.
    expect(angle(cards[0]!)).toBeLessThan(0)
    expect(angle(cards[4]!)).toBeGreaterThan(0)
    expect(angle(cards[2]!)).toBeCloseTo(0)
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

  // Gastón (2026-10-25): «las cartas de la mano del oponente en muchas ocasiones se ve aplastada, no debería pasar literalmente nunca». Un solo lado manda el tamaño y el otro
  // sale de la proporción de la carta (`aspect-[421/614]`): nunca un ancho y un alto fijos a la vez (la vista 3D la endereza `flatTransform`: flat-quad.test.ts).
  it('cada carta de una mano (la del rival, de dorso o boca arriba, la franja de handtraps y la tuya) tiene un solo lado fijo y el otro sale de la proporción', () => {
    viewport(true)
    render(<TheirHand count={3} />)
    // El arte de las cartas lee el formato del store.
    const store = configureStore({ reducer: { settings: (state = { handSize: 5, deckFormat: 'unlimited' as const }) => state } })
    const wrapper = ({ children }: { children: ReactNode }) => <Provider store={store}>{children}</Provider>

    render(<TheirHand count={2} cards={[{ name: 'Ash Blossom', art: null }, { name: 'Effect Veiler', art: null }]} />, { wrapper })
    render(<RivalHandStrip cards={[{ id: 'a', name: 'Ash Blossom', art: null, usedAt: null }]} onOpen={() => {}} />, { wrapper })

    const cards = [...document.querySelectorAll<HTMLElement>('[data-rival-drop="hand"] > div > span, [data-rival-strip] button')]

    expect(cards).toHaveLength(6)
    for (const card of cards) {
      expect(card.className).toContain('aspect-[421/614]')
      expect(card.style.height).toBe('')
    }
    // La tuya: el ancho por el estilo y el alto por la clase.
    const hand = readFileSync('src/components/probability/PracticeHand.tsx', 'utf8')

    expect(hand).toMatch(/const HAND_CARD = \[[^\]]*aspect-\[421\/614\]/)
    expect(hand).not.toMatch(/height: layout\.cardHeight,/)
  })

  it('al entrar o salir una carta, la caja y cada dorso se reacomodan con la transición de la mesa (y con movimiento reducido, de un golpe)', () => {
    viewport(true)
    render(<TheirHand count={5} />)

    const box = screen.getByRole('img').parentElement!
    expect(box.className).toContain('[transition:width_var(--motion-duration)_var(--ease-in-out)]')
    expect(box.className).toContain('motion-reduce:transition-none')
    for (const card of cardsOf()) {
      expect(card.className).toContain('[transition:transform_var(--motion-duration)_var(--ease-in-out)]')
      expect(card.className).toContain('motion-reduce:transition-none')
    }
  })
})
