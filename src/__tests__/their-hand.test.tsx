// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react'
import '@testing-library/jest-dom'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { TheirHand } from '../components/duel/DuelTable'
import { THEIR_HAND } from '../components/duel/their-hand'
import { computeHandLayout } from '../app/practice-hand-layout'
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

  it('al entrar o salir una carta, cada dorso se reacomoda con la transición de la mesa (y con movimiento reducido, de un golpe)', () => {
    viewport(true)
    render(<TheirHand count={5} />)

    for (const card of cardsOf()) {
      expect(card.className).toContain('[transition:transform_var(--motion-duration)_var(--ease-in-out)]')
      expect(card.className).toContain('motion-reduce:transition-none')
    }
  })

  // Animar el ancho de la caja rehacía el layout y la volvía a enderezar en la vista 3D (4 medidas) en cada cuadro: centrada (encima del campo), la caja mide siempre lo mismo y el
  // abanico se corre adentro, con la `transform` de cada dorso. En pantalla quedan donde quedaban: el abanico, centrado.
  it('centrada, la caja no cambia de ancho al robar o jugar: el abanico se corre adentro y queda en el mismo lugar que antes', () => {
    viewport(false)
    const { cardWidth, maxWidth } = THEIR_HAND.mobile
    const x = (card: HTMLElement) => Number.parseFloat(/translate\((-?[\d.]+)px/.exec(card.style.transform)?.[1] ?? 'NaN')
    const { container, rerender } = render(<TheirHand count={3} pointed />)
    const box = container.firstElementChild as HTMLElement

    for (const count of [3, 6, 1]) {
      rerender(<TheirHand count={count} pointed />)
      const layout = computeHandLayout(maxWidth, count, cardWidth, 5)
      const span = layout.cardWidth + layout.step * (count - 1)

      expect(box.style.width).toBe(`${maxWidth}px`)
      expect(box.className).not.toContain('transition:width')
      cardsOf().forEach((card, index) => expect(x(card)).toBeCloseTo(layout.startX + index * layout.step))
      // El aro de lo que se señala, la mira y el botón de marcarla van del ancho del abanico, como la caja de antes.
      const ring = box.querySelector<HTMLElement>('[data-pointed="true"]')!
      expect(Number.parseFloat(ring.style.left)).toBeCloseTo(layout.startX)
      expect(Number.parseFloat(ring.style.width)).toBeCloseTo(span)
    }
  })

  it('arrimada a la izquierda (en una grilla) mide su abanico y las cartas salen de su borde', () => {
    viewport(false)
    const { cardWidth, maxWidth } = THEIR_HAND.mobile
    const { container } = render(<TheirHand count={4} align="start" />)
    const layout = computeHandLayout(maxWidth, 4, cardWidth, 5)

    expect(Number.parseFloat((container.firstElementChild as HTMLElement).style.width)).toBeCloseTo(layout.cardWidth + layout.step * 3)
    expect(cardsOf()[0]!.style.transform).toMatch(/^translate\(0px,/)
  })
})
