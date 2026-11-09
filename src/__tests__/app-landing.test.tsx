// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react'
import '@testing-library/jest-dom'
import { afterEach, describe, expect, it, vi } from 'vitest'

import App from '../App'
import { LANDING_ENTERED_KEY, SAVED_DECK_KEY } from '../app/landing'

// La app entera no hace falta: lo que se prueba es adónde manda `App` antes de bajarla. La app abre el paso del hash (`#inicio` es «Inicio»).
vi.mock('../MainApp', () => ({ default: () => <p>la app en {window.location.hash || 'sin hash'}</p> }))

afterEach(() => {
  cleanup()
  localStorage.clear()
  sessionStorage.clear()
  window.history.pushState({}, '', '/')
})

describe('App en /', () => {
  it('una visita nueva (sin hash ni deck) llega a «Inicio», dentro de la app, sin sumar una entrada al historial', async () => {
    const before = window.history.length
    render(<App />)

    expect(await screen.findByText('la app en #inicio')).toBeInTheDocument()
    expect(window.history.length).toBe(before)
    expect(sessionStorage.getItem(LANDING_ENTERED_KEY)).toBe('1')
  })

  it('con un hash abre esa pantalla', async () => {
    window.history.pushState({}, '', '/#duel')
    render(<App />)

    expect(await screen.findByText('la app en #duel')).toBeInTheDocument()
  })

  it('con un deck guardado abre el paso de siempre y anota que ya entró', async () => {
    localStorage.setItem(SAVED_DECK_KEY, JSON.stringify({ deckBuilder: { main: [{ name: 'Ash Blossom' }] } }))
    render(<App />)

    expect(await screen.findByText('la app en sin hash')).toBeInTheDocument()
    expect(sessionStorage.getItem(LANDING_ENTERED_KEY)).toBe('1')
  })

  it('?landing=1 lleva a «Inicio» aunque haya deck y se saca de la dirección', async () => {
    localStorage.setItem(SAVED_DECK_KEY, JSON.stringify({ deckBuilder: { main: [{ name: 'Ash Blossom' }] } }))
    window.history.pushState({}, '', '/?landing=1')
    render(<App />)

    expect(await screen.findByText('la app en #inicio')).toBeInTheDocument()
    expect(window.location.search).toBe('')
  })
})
