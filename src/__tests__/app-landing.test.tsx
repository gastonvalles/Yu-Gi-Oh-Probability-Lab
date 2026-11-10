// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react'
import '@testing-library/jest-dom'
import { afterEach, describe, expect, it, vi } from 'vitest'

import App from '../App'
import { LANDING_ENTERED_KEY } from '../app/landing'
import { STORAGE_KEY } from '../app/model'

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

  it('con un deck guardado también llega a «Inicio» (ahí lo retoma)', async () => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ deckBuilder: { main: [{ name: 'Ash Blossom' }] } }))
    render(<App />)

    expect(await screen.findByText('la app en #inicio')).toBeInTheDocument()
  })

  it('la app instalada (display-mode: standalone) también llega a «Inicio»', async () => {
    const matchMedia = window.matchMedia
    window.matchMedia = ((query: string) => ({ matches: query.includes('standalone'), media: query })) as unknown as typeof window.matchMedia
    render(<App />)

    expect(await screen.findByText('la app en #inicio')).toBeInTheDocument()
    window.matchMedia = matchMedia
  })

  it('ya entró en esta pestaña: `/` sin hash abre el paso de siempre', async () => {
    sessionStorage.setItem(LANDING_ENTERED_KEY, '1')
    render(<App />)

    expect(await screen.findByText('la app en sin hash')).toBeInTheDocument()
  })

  it('?landing=1 lleva a «Inicio» aunque ya haya entrado y se saca de la dirección', async () => {
    sessionStorage.setItem(LANDING_ENTERED_KEY, '1')
    window.history.pushState({}, '', '/?landing=1')
    render(<App />)

    expect(await screen.findByText('la app en #inicio')).toBeInTheDocument()
    expect(window.location.search).toBe('')
  })
})
