// @vitest-environment jsdom
import { configureStore } from '@reduxjs/toolkit'
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import '@testing-library/jest-dom'
import { Provider } from 'react-redux'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import { InicioScreen } from '../components/landing/InicioScreen'

// Las cifras del build (`landing-stats.json`, que no se versiona): se pasan a mano, y sin ellas «Lo más jugado del meta» no sale.
const STATS = { tcgDecks: 564, weeks: 8, banlist: '2026-10-19', prices: '2026-11-08', topCards: [{ id: 14558127, name: 'Ash Blossom & Joyous Spring', decks: 492 }] }

// El arte de las cartas lee el formato del store (el límite de copias).
const EMPTY_DECK = { deckName: '', main: [] as unknown[], extra: [] as unknown[], side: [] as unknown[] }
const storeWith = (deckBuilder: typeof EMPTY_DECK) =>
  configureStore({ reducer: { settings: (state = { handSize: 5, deckFormat: 'unlimited' as const }) => state, deckBuilder: (state = deckBuilder) => state } })
const renderInicio = (deckBuilder = EMPTY_DECK) => render(<Provider store={storeWith(deckBuilder)}><InicioScreen stats={STATS} /></Provider>)
// Lo que lee «Seguir con tu deck» de cada copia del Main: su carta, su origen y sus roles.
const copies = (count: number, classified: boolean) =>
  Array.from({ length: count }, (_, index) => ({ apiCard: { ygoprodeckId: index % 14 }, name: `Carta ${index % 14}`, origin: classified ? 'engine' : null, roles: classified ? ['starter'] : [], needsReview: false }))

beforeEach(() => {
  window.matchMedia = ((query: string) => ({ matches: false, media: query, addEventListener: () => {}, removeEventListener: () => {}, addListener: () => {}, removeListener: () => {}, onchange: null, dispatchEvent: () => false })) as typeof window.matchMedia
})

afterEach(() => {
  cleanup()
  window.history.pushState({}, '', '/')
})

describe('«Inicio»', () => {
  it('tiene un solo h1 con el titular, las dos entradas, lo más jugado y las novedades', async () => {
    renderInicio()

    expect(screen.getAllByRole('heading', { level: 1 })).toHaveLength(1)
    expect(screen.getByRole('heading', { level: 1, name: '¿Cuántas veces abrís tu carta?' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Medir mi deck' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Jugar ahora' })).toBeInTheDocument()
    expect(screen.queryByRole('heading', { name: 'Lo que hay en la app' })).not.toBeInTheDocument()

    // Lo más jugado: la carta real con su cifra, el arte por el proxy (nunca guardado en el repo).
    const top = screen.getByRole('region', { name: 'Lo más jugado del meta' })
    expect(within(top).getByText('en 492 decks')).toBeInTheDocument()
    expect(within(top).getByRole('img', { name: 'Ash Blossom & Joyous Spring' })).toHaveAttribute('src', '/api/card-image/cards_small/14558127.jpg')

    // Las novedades bajan aparte: primero el esqueleto, después las tres más nuevas.
    expect(screen.getByRole('status', { name: 'Cargando las novedades' })).toBeInTheDocument()
    expect(await screen.findAllByRole('heading', { level: 3 })).toHaveLength(3)
    expect(screen.getByRole('link', { name: 'Ver todas las novedades' })).toHaveAttribute('href', '#novedades')
    expect(screen.getByRole('link', { name: 'Reportar un problema' })).toHaveAttribute('href', '#reportar')
  })

  it('elegir las copias y el turno cambia el número del anillo', () => {
    renderInicio()

    const ring = screen.getByRole('meter')
    expect(ring).toHaveAttribute('aria-valuetext', '34 de cada 100')

    fireEvent.click(within(screen.getByRole('radiogroup', { name: 'Turno' })).getByRole('radio', { name: 'Yendo segundo' }))
    expect(ring).toHaveAttribute('aria-valuetext', '39 de cada 100')
    expect(screen.getByText(/Manos de 6 que traen/)).toBeInTheDocument()

    fireEvent.click(within(screen.getByRole('radiogroup', { name: 'Copias en 40 cartas' })).getByRole('radio', { name: '1 copia' }))
    expect(ring).toHaveAttribute('aria-valuetext', '15 de cada 100')
  })

  it('«Medir mi deck» lleva al armador y «Jugar ahora», al duelo', () => {
    renderInicio()

    fireEvent.click(screen.getByRole('button', { name: 'Medir mi deck' }))
    expect(window.location.hash).toBe('#deck-builder')

    fireEvent.click(screen.getByRole('button', { name: 'Jugar ahora' }))
    expect(window.location.hash).toBe('#duel')
  })

  it('sin deck con cartas no hay «Seguir con tu deck»', () => {
    renderInicio()

    expect(screen.queryByRole('button', { name: 'Seguir con tu deck' })).not.toBeInTheDocument()
  })

  it.each([
    ['incompleto: al armador, con cuánto falta', copies(32, false), '#deck-builder', 'Faltan 8 cartas en el Main'],
    ['de 40 sin clasificar: a Clasificar', copies(40, false), '#categorization', null],
    ['completo y clasificado: al Lab, nunca a Exportar', copies(40, true), '#probability-lab', null],
  ])('«Seguir con tu deck», %s', (_, main, hash, missing) => {
    renderInicio({ deckName: 'BLITZCLIQUE', main, extra: copies(3, false), side: copies(15, false) })

    const resume = screen.getByRole('region', { name: 'BLITZCLIQUE' })
    expect(within(resume).getByText(`Main ${main.length}, Extra 3 y Side 15`)).toBeInTheDocument()
    if (missing) expect(within(resume).getByText(missing)).toBeInTheDocument()
    else expect(within(resume).queryByText(/en el Main$/)).not.toBeInTheDocument()

    fireEvent.click(within(resume).getByRole('button', { name: 'Seguir con tu deck' }))
    expect(window.location.hash).toBe(hash)
  })
})
