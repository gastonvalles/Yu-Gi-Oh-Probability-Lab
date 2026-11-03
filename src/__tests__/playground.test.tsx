// @vitest-environment jsdom
import { configureStore } from '@reduxjs/toolkit'
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import '@testing-library/jest-dom'
import { Provider } from 'react-redux'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import App from '../App'
import Playground from '../components/playground/Playground'
import { ICON_NAMES } from '../components/ui/Icon'

vi.mock('virtual:public-assets', () => ({
  default: [
    { path: '/favicon.png', bytes: 2048 },
    { path: '/mascot/cupsy/idle.webp', bytes: 150000 },
    { path: '/privacidad.html', bytes: 9000 },
  ],
}))

// El catálogo muestra cartas (el límite de copias lee el formato del store).
const store = configureStore({ reducer: { settings: (state = { handSize: 5, deckFormat: 'unlimited' as const }) => state } })
const renderInStore = (ui: React.ReactElement) => render(<Provider store={store}>{ui}</Provider>)

beforeEach(() => {
  window.matchMedia = ((query: string) => ({ matches: false, media: query, addEventListener: () => {}, removeEventListener: () => {}, addListener: () => {}, removeListener: () => {}, onchange: null, dispatchEvent: () => false })) as typeof window.matchMedia
  window.scrollTo = () => {}
})

afterEach(() => {
  cleanup()
  window.history.pushState({}, '', '/')
})

describe('el catálogo /playground', () => {
  it('tiene todas las secciones, con su tabla de arriba, y no lo indexan los buscadores', () => {
    renderInStore(<Playground />)

    expect(screen.getByRole('heading', { level: 1, name: 'Playground' })).toBeInTheDocument()
    const toc = screen.getByRole('navigation', { name: 'Secciones del catálogo' })
    const names = within(toc).getAllByRole('link').map((link) => link.textContent)
    expect(names).toEqual(['Botones y controles', 'Navegación', 'Títulos', 'Tarjetas, avisos y campos', 'Listas, atajos y carrusel', 'Datos', 'El Lab', 'Reglas del Lab', 'Diálogos y avisos', 'Comparar', 'Duelo por enlace', 'Duelo automático (beta)', 'Íconos', 'Assets', 'Tokens del diseño'])

    for (const name of names) {
      expect(screen.getByRole('heading', { level: 2, name })).toBeInTheDocument()
    }

    expect(document.querySelector('meta[name="robots"]')).toHaveAttribute('content', 'noindex,nofollow')
    expect(document.title).toBe('Playground · YGOUltraLab')
  })

  it('muestra todos los íconos del set, en sus tres variantes, y un buscador', () => {
    renderInStore(<Playground />)

    const section = document.getElementById('iconos') as HTMLElement
    expect(within(section).getAllByRole('listitem')).toHaveLength(ICON_NAMES.length)

    fireEvent.change(within(section).getByRole('searchbox', { name: 'Buscar un ícono' }), { target: { value: 'chevron' } })
    expect(within(section).getAllByRole('listitem').map((item) => item.textContent)).toEqual(ICON_NAMES.filter((name) => name.includes('chevron')))
    fireEvent.click(within(section).getByRole('radio', { name: 'bold' }))
    expect(within(section).getAllByRole('radio', { checked: true }).map((radio) => radio.getAttribute('aria-label'))).toContain('bold')
  })

  it('lista los archivos de public/ por carpeta, con su tamaño', () => {
    renderInStore(<Playground />)

    const section = document.getElementById('assets') as HTMLElement
    expect(within(section).getByText('public')).toBeInTheDocument()
    expect(within(section).getByText('public/mascot/cupsy')).toBeInTheDocument()
    expect(within(section).getByText('favicon.png')).toBeInTheDocument()
    expect(within(section).getByText('2.0 kB')).toBeInTheDocument()
    expect(within(section).getByText('146 kB')).toBeInTheDocument()
  })

  it('en la navegación se puede probar el armazón completo y salir', () => {
    renderInStore(<Playground />)

    const section = document.getElementById('navegacion') as HTMLElement
    fireEvent.click(within(section).getByRole('button', { name: 'Probar el armazón' }))
    expect(screen.getByRole('heading', { name: 'Pantalla de prueba' })).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Salir de la prueba' }))
    expect(screen.queryByRole('heading', { name: 'Pantalla de prueba' })).not.toBeInTheDocument()
  })
})

describe('la ruta /playground', () => {
  // El catálogo se carga perezoso (es el módulo más pesado de la app): con toda la suite corriendo, el segundo que espera `findByRole` por defecto no alcanza.
  it('la app muestra el catálogo en vez de la pantalla del deck', async () => {
    window.history.pushState({}, '', '/playground')
    renderInStore(<App />)

    expect(await screen.findByRole('heading', { level: 1, name: 'Playground' }, { timeout: 10_000 })).toBeInTheDocument()
    expect(screen.queryByRole('navigation', { name: 'Pasos de la app' })).not.toBeInTheDocument()
  }, 15_000)
})
