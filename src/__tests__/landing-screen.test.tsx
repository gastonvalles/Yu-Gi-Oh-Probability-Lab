// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import '@testing-library/jest-dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { LANDING_ENTERED_KEY } from '../app/landing'
import Landing from '../components/landing/Landing'

beforeEach(() => {
  window.matchMedia = ((query: string) => ({ matches: false, media: query, addEventListener: () => {}, removeEventListener: () => {}, addListener: () => {}, removeListener: () => {}, onchange: null, dispatchEvent: () => false })) as typeof window.matchMedia
})

afterEach(() => {
  cleanup()
  sessionStorage.clear()
  window.history.pushState({}, '', '/')
})

describe('la landing', () => {
  it('tiene un solo h1 con el titular, las dos entradas y los landmarks', async () => {
    render(<Landing />)

    expect(screen.getAllByRole('heading', { level: 1 })).toHaveLength(1)
    expect(screen.getByRole('heading', { level: 1, name: '¿Cuántas veces abrís tu carta?' })).toBeInTheDocument()
    expect(screen.getByRole('banner')).toBeInTheDocument()
    expect(screen.getByRole('main')).toBeInTheDocument()
    expect(screen.getByRole('contentinfo')).toBeInTheDocument()
    expect(screen.getAllByRole('button', { name: 'Medir mi deck' }).length).toBeGreaterThan(0)
    expect(screen.getAllByRole('button', { name: 'Jugar ahora' }).length).toBeGreaterThan(0)
    // Las novedades bajan aparte: primero el esqueleto, después las tres más nuevas.
    expect(await screen.findByRole('link', { name: 'Ver todas las novedades' })).toHaveAttribute('href', '#novedades')
    expect(await screen.findAllByRole('heading', { level: 3 })).not.toHaveLength(0)
  })

  it('elegir las copias y el turno cambia el número del anillo', () => {
    render(<Landing />)

    const ring = screen.getByRole('meter')
    expect(ring).toHaveAttribute('aria-valuetext', '34 de cada 100')

    fireEvent.click(within(screen.getByRole('radiogroup', { name: 'Turno' })).getByRole('radio', { name: 'Yendo segundo' }))
    expect(ring).toHaveAttribute('aria-valuetext', '39 de cada 100')
    expect(screen.getByText(/Manos de 6 que traen/)).toBeInTheDocument()

    fireEvent.click(within(screen.getByRole('radiogroup', { name: 'Copias en 40 cartas' })).getByRole('radio', { name: '1 copia' }))
    expect(ring).toHaveAttribute('aria-valuetext', '15 de cada 100')
  })

  it('«Medir mi deck» escribe la marca de la sesión y lleva al armador', () => {
    const prefetch = vi.fn()
    render(<Landing onPrefetch={prefetch} />)

    const measure = screen.getAllByRole('button', { name: 'Medir mi deck' })[0]!
    fireEvent.pointerEnter(measure)
    expect(prefetch).toHaveBeenCalled()

    fireEvent.click(measure)
    expect(sessionStorage.getItem(LANDING_ENTERED_KEY)).toBe('1')
    expect(window.location.hash).toBe('#deck-builder')
  })

  it('«Jugar ahora» lleva al duelo', () => {
    render(<Landing />)

    fireEvent.click(screen.getAllByRole('button', { name: 'Jugar ahora' })[0]!)
    expect(sessionStorage.getItem(LANDING_ENTERED_KEY)).toBe('1')
    expect(window.location.hash).toBe('#duel')
  })
})
