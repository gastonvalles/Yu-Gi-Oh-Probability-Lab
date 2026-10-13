// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import '@testing-library/jest-dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { buildAppNavGroups, buildDeckWorkflowNavigationItems } from '../components/deck-mode/deck-workflow-navigation'
import { AppFooter } from '../components/shell/AppFooter'
import { AppShell } from '../components/shell/AppShell'
import { AppSidebar } from '../components/shell/AppSidebar'
import { MobileTopBar } from '../components/shell/MobileTopBar'
import { NavDrawer } from '../components/shell/NavDrawer'
import { SidebarNav } from '../components/shell/SidebarNav'
import { Heading } from '../components/ui/Heading'

const GROUPS = buildAppNavGroups(
  buildDeckWorkflowNavigationItems({ mainDeckCount: 42, roleCardCount: 40, unclassifiedCardCount: 3, hasCompletedRoleStep: false, patternCount: 0 }),
)

beforeEach(() => {
  localStorage.clear()
  window.matchMedia = ((query: string) => ({ matches: false, media: query, addEventListener: () => {}, removeEventListener: () => {}, addListener: () => {}, removeListener: () => {}, onchange: null, dispatchEvent: () => false })) as typeof window.matchMedia
  window.requestAnimationFrame = (callback) => {
    callback(0)
    return 1
  }
  window.scrollTo = () => {}
})

afterEach(cleanup)

describe('el menú de la app', () => {
  it('agrupa los destinos: los pasos del deck, las herramientas y la referencia', () => {
    expect(GROUPS.map((group) => [group.label, group.items.map((item) => item.key)])).toEqual([
      ['Tu deck', ['deck-builder', 'categorization', 'probability-lab', 'workspace', 'export']],
      ['Herramientas', ['practice', 'life']],
      ['Descubrir', ['meta', 'replays']],
    ])
  })

  it('el destino abierto lleva aria-current, elegir otro avisa cuál y el punto de color dice cómo viene cada paso', () => {
    const onSelect = vi.fn()
    render(<SidebarNav groups={GROUPS} activeKey="categorization" onSelect={onSelect} />)

    const nav = screen.getByRole('navigation', { name: 'Navegación principal' })
    expect(within(nav).getByRole('button', { name: /^Categorización de roles/ })).toHaveAttribute('aria-current', 'page')
    expect(within(nav).getByRole('button', { name: /^Deck Builder/ })).not.toHaveAttribute('aria-current')
    // Cada grupo se anuncia por su nombre.
    expect(within(nav).getByRole('group', { name: 'Herramientas' })).toBeInTheDocument()

    // Listo (verde), a medio hacer (naranja) y pendiente (sin punto).
    expect(within(nav).getByRole('button', { name: /^Deck Builder/ }).querySelector('[data-tone="complete"]')).not.toBeNull()
    expect(within(nav).getByRole('button', { name: /^Categorización de roles/ }).querySelector('[data-tone="progress"]')).not.toBeNull()
    expect(within(nav).getByRole('button', { name: /^Probability Lab/ }).querySelector('[data-tone]')).toBeNull()

    fireEvent.click(within(nav).getByRole('button', { name: /^Exportar deck/ }))
    expect(onSelect).toHaveBeenCalledWith('export')
  })

  it('contraído, sólo se ven los íconos: el nombre queda para los lectores de pantalla y el tooltip', () => {
    render(<SidebarNav groups={GROUPS} activeKey="export" onSelect={() => {}} collapsed />)

    const button = screen.getByRole('button', { name: /^Exportar deck/ })
    expect(button).toHaveAttribute('title', expect.stringContaining('Exportar deck'))
    expect(within(button).queryByText('Exportar')).not.toBeInTheDocument()
  })
})

describe('el menú lateral', () => {
  it('se contrae y se expande con su botón, que anuncia el estado', () => {
    const onToggle = vi.fn()
    const { rerender } = render(<AppSidebar groups={GROUPS} activeKey="export" onSelect={() => {}} collapsed={false} onToggleCollapsed={onToggle} />)

    const aside = document.querySelector('aside')
    expect(aside).toHaveAttribute('data-collapsed', 'false')
    // Abierto lleva el idioma y las mascotas.
    expect(screen.getByRole('group', { name: 'Idioma' })).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Contraer menú' }))
    expect(onToggle).toHaveBeenCalledTimes(1)

    rerender(<AppSidebar groups={GROUPS} activeKey="export" onSelect={() => {}} collapsed onToggleCollapsed={onToggle} />)
    expect(aside).toHaveAttribute('data-collapsed', 'true')
    expect(screen.queryByRole('group', { name: 'Idioma' })).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Expandir menú' })).toHaveAttribute('aria-expanded', 'false')
  })
})

describe('el cajón del celular', () => {
  it('cerrado no existe; abierto es un diálogo con el mismo menú, enfoca adentro y se cierra con Escape, con el velo y con la X', () => {
    const onClose = vi.fn()
    const { rerender } = render(<NavDrawer isOpen={false} onClose={onClose} onSelect={() => {}} groups={GROUPS} activeKey="export" />)
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()

    rerender(<NavDrawer isOpen onClose={onClose} onSelect={() => {}} groups={GROUPS} activeKey="export" />)
    const dialog = screen.getByRole('dialog', { name: 'Navegación principal' })
    expect(dialog).toHaveAttribute('aria-modal', 'true')
    expect(within(dialog).getByRole('button', { name: /^Exportar deck/ })).toHaveAttribute('aria-current', 'page')
    expect(dialog).toContainElement(document.activeElement as HTMLElement)

    fireEvent.keyDown(window, { key: 'Escape' })
    expect(onClose).toHaveBeenCalledTimes(1)
    fireEvent.click(within(dialog).getByRole('button', { name: 'Cerrar el menú' }))
    expect(onClose).toHaveBeenCalledTimes(2)
    fireEvent.click(dialog.previousElementSibling as HTMLElement)
    expect(onClose).toHaveBeenCalledTimes(3)
  })

  it('elegir un destino avisa cuál y cierra el cajón', () => {
    const onSelect = vi.fn()
    const onClose = vi.fn()
    render(<NavDrawer isOpen onClose={onClose} onSelect={onSelect} groups={GROUPS} activeKey="export" />)

    fireEvent.click(screen.getByRole('button', { name: /^Replays de torneo/ }))
    expect(onSelect).toHaveBeenCalledWith('replays')
    expect(onClose).toHaveBeenCalledTimes(1)
  })
})

describe('la barra de arriba, el pie y los títulos', () => {
  it('la hamburguesa anuncia si el menú está abierto', () => {
    const onMenu = vi.fn()
    const { rerender } = render(<MobileTopBar menuOpen={false} onMenu={onMenu} />)

    const button = screen.getByRole('button', { name: 'Abrir el menú' })
    expect(button).toHaveAttribute('aria-expanded', 'false')
    fireEvent.click(button)
    expect(onMenu).toHaveBeenCalledTimes(1)

    rerender(<MobileTopBar menuOpen onMenu={onMenu} />)
    expect(screen.getByRole('button', { name: 'Abrir el menú' })).toHaveAttribute('aria-expanded', 'true')
  })

  it('el pie lleva la autoría, el aviso de sitio no oficial, las redes y la privacidad', () => {
    render(<AppFooter />)

    const footer = screen.getByRole('contentinfo')
    expect(footer).toHaveTextContent(`© ${new Date().getFullYear()} Gastón Valles`)
    expect(footer).toHaveTextContent('Sitio no oficial. Yu-Gi-Oh! es una marca de Konami.')
    expect(within(footer).getAllByRole('link').map((link) => link.getAttribute('href'))).toEqual([
      'https://www.linkedin.com/in/gastonvalles/',
      'https://www.instagram.com/gaston_valles/',
      'https://github.com/gastonvalles',
      '/privacidad.html',
    ])
  })

  it('cada nivel de título es su etiqueta, con el estilo de su nivel', () => {
    render(
      <>
        <Heading level="page">Pantalla</Heading>
        <Heading level="section">Sección</Heading>
        <Heading level="card">Ítem</Heading>
        <Heading level="card" as="h4">
          Ítem más adentro
        </Heading>
        <Heading level="kicker">Sobretítulo</Heading>
      </>,
    )

    expect(screen.getByRole('heading', { level: 1, name: 'Pantalla' })).toBeInTheDocument()
    expect(screen.getByRole('heading', { level: 2, name: 'Sección' })).toBeInTheDocument()
    expect(screen.getByRole('heading', { level: 3, name: 'Ítem' })).toBeInTheDocument()
    expect(screen.getByRole('heading', { level: 4, name: 'Ítem más adentro' })).toHaveClass('text-body')
    // El sobretítulo no es un encabezado.
    expect(screen.queryByRole('heading', { name: 'Sobretítulo' })).not.toBeInTheDocument()
  })
})

describe('el armazón', () => {
  it('lleva el contenido, el pie y el menú una sola vez; la hamburguesa abre el cajón y elegir cierra', () => {
    const onSelect = vi.fn()
    render(
      <AppShell groups={GROUPS} activeKey="categorization" onSelect={onSelect} contentScrollable>
        <p>Contenido de la pantalla</p>
      </AppShell>,
    )

    expect(screen.getByText('Contenido de la pantalla')).toBeInTheDocument()
    expect(screen.getAllByRole('contentinfo')).toHaveLength(1)
    // El menú lateral y la barra de arriba están los dos en el DOM: el CSS muestra el que toca según el ancho.
    expect(screen.getAllByRole('navigation', { name: 'Navegación principal' })).toHaveLength(1)

    fireEvent.click(screen.getByRole('button', { name: 'Abrir el menú' }))
    const dialog = screen.getByRole('dialog', { name: 'Navegación principal' })
    fireEvent.click(within(dialog).getByRole('button', { name: /^Probability Lab/ }))
    expect(onSelect).toHaveBeenCalledWith('probability-lab')
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })

  it('recuerda si el menú lateral estaba contraído', () => {
    const { unmount } = render(
      <AppShell groups={GROUPS} activeKey="export" onSelect={() => {}}>
        <p>Pantalla</p>
      </AppShell>,
    )

    expect(document.querySelector('aside')).toHaveAttribute('data-collapsed', 'false')
    act(() => {
      fireEvent.click(screen.getByRole('button', { name: 'Contraer menú' }))
    })
    expect(document.querySelector('aside')).toHaveAttribute('data-collapsed', 'true')
    expect(localStorage.getItem('ygo-lab:sidebar-collapsed')).toBe('1')
    unmount()

    render(
      <AppShell groups={GROUPS} activeKey="export" onSelect={() => {}}>
        <p>Pantalla</p>
      </AppShell>,
    )
    expect(document.querySelector('aside')).toHaveAttribute('data-collapsed', 'true')
  })
})
