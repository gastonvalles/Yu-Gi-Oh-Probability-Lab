// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import '@testing-library/jest-dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { buildAppNavGroups, buildDeckWorkflowNavigationItems } from '../components/deck-mode/deck-workflow-navigation'
import { AppShell } from '../components/shell/AppShell'

const STEPS = buildDeckWorkflowNavigationItems({ mainDeckCount: 42, roleCardCount: 40, unclassifiedCardCount: 3, hasCompletedRoleStep: false, patternCount: 0 })
const GROUPS = buildAppNavGroups(STEPS, { practice: true })

/** Una ventana de escritorio (desde 1101 px): hay barra de arriba y menú lateral. */
function desktopWindow() {
  Object.defineProperty(window, 'innerWidth', { value: 1600, configurable: true })
  window.matchMedia = ((query: string) => ({ matches: query.includes('min-width: 1101px'), media: query, addEventListener: () => {}, removeEventListener: () => {}, addListener: () => {}, removeListener: () => {}, onchange: null, dispatchEvent: () => false })) as typeof window.matchMedia
}

beforeEach(() => {
  localStorage.clear()
  desktopWindow()
  window.requestAnimationFrame = (callback) => {
    callback(0)
    return 1
  }
  window.scrollTo = () => {}
  Element.prototype.scrollIntoView = () => {}
})

afterEach(cleanup)

describe('la barra de arriba de escritorio', () => {
  const shell = (props: { onSelect?: (key: string) => void; immersive?: boolean; searchAvailable?: boolean } = {}) =>
    render(
      <AppShell groups={GROUPS} activeKey="export" onSelect={props.onSelect ?? (() => {})} immersive={props.immersive} searchAvailable={props.searchAvailable}>
        <p>pantalla</p>
      </AppShell>,
    )

  it('lleva la hamburguesa, la marca, el buscador de la app, las mascotas y el idioma; el menú lateral queda con los destinos', () => {
    shell()

    const bar = within(screen.getByTestId('app-navbar'))

    expect(bar.getByRole('button', { name: 'Contraer menú' })).toBeInTheDocument()
    expect(bar.getByText('Sitio no oficial')).toBeInTheDocument()
    expect(bar.getByRole('button', { name: 'Buscar en la app' })).toBeInTheDocument()
    expect(bar.getByRole('button', { name: 'Mascotas' })).toBeInTheDocument()
    expect(bar.getByRole('group', { name: 'Idioma' })).toBeInTheDocument()

    // El menú lateral ya no repite nada de eso: sin cabecera, sin buscador, sin mascotas ni idioma.
    const aside = within(document.querySelector('aside') as HTMLElement)

    expect(aside.queryByRole('button', { name: 'Contraer menú' })).not.toBeInTheDocument()
    expect(aside.queryByText('Sitio no oficial')).not.toBeInTheDocument()
    expect(aside.queryByRole('button', { name: /^Buscar cartas/ })).not.toBeInTheDocument()
    expect(aside.queryByRole('button', { name: 'Mascotas' })).not.toBeInTheDocument()
    expect(aside.queryByRole('group', { name: 'Idioma' })).not.toBeInTheDocument()
    expect(aside.getByRole('button', { name: /^Exportar/ })).toBeInTheDocument()
  })

  it('la hamburguesa contrae el menú lateral y las mascotas abren su panel', () => {
    const onSelect = vi.fn()

    shell({ onSelect })

    const aside = document.querySelector('aside') as HTMLElement

    expect(aside).toHaveAttribute('data-collapsed', 'false')
    fireEvent.click(within(screen.getByTestId('app-navbar')).getByRole('button', { name: 'Contraer menú' }))
    expect(aside).toHaveAttribute('data-collapsed', 'true')

    fireEvent.click(within(screen.getByTestId('app-navbar')).getByRole('button', { name: 'Mascotas' }))
    expect(onSelect).toHaveBeenCalledWith('mascots')
  })

  it('el buscador de la barra abre el de la app y llevar a un resultado cambia de pantalla', () => {
    const onSelect = vi.fn()

    shell({ onSelect, searchAvailable: true })

    fireEvent.click(within(screen.getByTestId('app-navbar')).getByRole('button', { name: 'Buscar en la app' }))
    fireEvent.change(screen.getByRole('combobox'), { target: { value: 'vidas' } })
    fireEvent.keyDown(screen.getByRole('combobox'), { key: 'Enter' })

    expect(onSelect).toHaveBeenCalledWith('life')
    expect(screen.queryByRole('combobox')).not.toBeInTheDocument()
  })

  it('«/» y Ctrl+K abren el buscador (salvo escribiendo en un campo); Escape lo cierra', () => {
    shell()

    fireEvent.keyDown(window, { key: '/' })
    expect(screen.getByRole('combobox')).toBeInTheDocument()

    fireEvent.keyDown(screen.getByRole('combobox'), { key: 'Escape' })
    act(() => {
      window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }))
    })
    expect(screen.queryByRole('combobox')).not.toBeInTheDocument()

    fireEvent.keyDown(window, { key: 'k', ctrlKey: true })
    expect(screen.getByRole('combobox')).toBeInTheDocument()
  })

  it('en una pantalla a pantalla completa (la práctica, la mesa del duelo) no hay barra de arriba ni buscador: el menú lateral conserva su cabecera', () => {
    shell({ immersive: true })

    expect(screen.queryByTestId('app-navbar')).not.toBeInTheDocument()
    expect(within(document.querySelector('aside') as HTMLElement).getByRole('button', { name: 'Contraer menú' })).toBeInTheDocument()

    fireEvent.keyDown(window, { key: '/' })
    expect(screen.queryByRole('combobox')).not.toBeInTheDocument()
  })
})
