// @vitest-environment jsdom
import { act, cleanup, render, screen } from '@testing-library/react'
import '@testing-library/jest-dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import App from '../App'
import { LANDING_ENTERED_KEY, SAVED_DECK_KEY } from '../app/landing'

// La app entera no hace falta: lo que se prueba es qué elige `App` en `/`.
vi.mock('../MainApp', () => ({ default: () => <p>la app</p> }))

beforeEach(() => {
  window.matchMedia = ((query: string) => ({ matches: false, media: query, addEventListener: () => {}, removeEventListener: () => {}, addListener: () => {}, removeListener: () => {}, onchange: null, dispatchEvent: () => false })) as typeof window.matchMedia
})

afterEach(() => {
  cleanup()
  localStorage.clear()
  sessionStorage.clear()
  window.history.pushState({}, '', '/')
})

describe('App en /', () => {
  it('sin hash ni deck muestra la landing; un toque entra a la app sin recargar', async () => {
    render(<App />)

    expect(await screen.findByRole('heading', { level: 1, name: '¿Cuántas veces abrís tu carta?' })).toBeInTheDocument()

    await act(async () => {
      screen.getAllByRole('button', { name: 'Medir mi deck' })[0]!.click()
      window.dispatchEvent(new HashChangeEvent('hashchange'))
    })

    expect(await screen.findByText('la app')).toBeInTheDocument()
    expect(sessionStorage.getItem(LANDING_ENTERED_KEY)).toBe('1')
  })

  it('con un hash muestra la app', async () => {
    window.history.pushState({}, '', '/#duel')
    render(<App />)

    expect(await screen.findByText('la app')).toBeInTheDocument()
    expect(screen.queryByRole('heading', { level: 1 })).not.toBeInTheDocument()
  })

  it('con un deck guardado muestra la app y anota que ya entró', async () => {
    localStorage.setItem(SAVED_DECK_KEY, JSON.stringify({ deckBuilder: { main: [{ name: 'Ash Blossom' }] } }))
    render(<App />)

    expect(await screen.findByText('la app')).toBeInTheDocument()
    expect(sessionStorage.getItem(LANDING_ENTERED_KEY)).toBe('1')
  })

  it('?landing=1 la muestra igual', async () => {
    localStorage.setItem(SAVED_DECK_KEY, JSON.stringify({ deckBuilder: { main: [{ name: 'Ash Blossom' }] } }))
    window.history.pushState({}, '', '/?landing=1')
    render(<App />)

    expect(await screen.findByRole('heading', { level: 1, name: '¿Cuántas veces abrís tu carta?' })).toBeInTheDocument()
  })
})
