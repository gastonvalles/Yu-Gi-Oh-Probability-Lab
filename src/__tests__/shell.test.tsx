// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import '@testing-library/jest-dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { useShellInsets } from '../app/shell-layout'
import { buildAppNavGroups, buildDeckWorkflowNavigationItems } from '../components/deck-mode/deck-workflow-navigation'
import { AppFooter } from '../components/shell/AppFooter'
import { AppShell } from '../components/shell/AppShell'
import { AppSidebar } from '../components/shell/AppSidebar'
import { MobileTopBar } from '../components/shell/MobileTopBar'
import { NavDrawer } from '../components/shell/NavDrawer'
import { SidebarNav } from '../components/shell/SidebarNav'
import { Heading } from '../components/ui/Heading'

const STEPS = buildDeckWorkflowNavigationItems({ mainDeckCount: 42, roleCardCount: 40, unclassifiedCardCount: 3, hasCompletedRoleStep: false, patternCount: 0 })
const GROUPS = buildAppNavGroups(STEPS, { practice: true })

beforeEach(() => {
  localStorage.clear()
  // Una ventana ancha: el menú lateral arranca abierto (en una angosta arranca contraído).
  Object.defineProperty(window, 'innerWidth', { value: 1600, configurable: true })
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
      ['Herramientas', ['practice', 'life', 'mascots']],
      ['Descubrir', ['meta', 'tournaments', 'replays', 'expansions', 'banlists']],
    ])
  })

  it('la mesa de práctica sólo se ofrece con cartas en el Main; la calculadora de LP y las mascotas, siempre', () => {
    expect(buildAppNavGroups(STEPS, { practice: false })[1]?.items.map((item) => item.key)).toEqual(['life', 'mascots'])
  })

  it('las mascotas son una herramienta más del menú, con su patita, y no hay un botón suelto de mascotas abajo', () => {
    const mascots = GROUPS[1]?.items.find((item) => item.key === 'mascots')

    expect(mascots).toMatchObject({ label: 'Mascotas', icon: 'paw' })
    render(<AppSidebar groups={GROUPS} activeKey="export" onSelect={() => {}} collapsed={false} onToggleCollapsed={() => {}} />)
    expect(screen.getAllByRole('button', { name: 'Mascotas' })).toHaveLength(1)
  })

  it('el destino abierto lleva aria-current, elegir otro avisa cuál, y cómo viene cada paso se dice con palabras (no con un punto de color)', () => {
    const onSelect = vi.fn()
    render(<SidebarNav groups={GROUPS} activeKey="categorization" onSelect={onSelect} />)

    const nav = screen.getByRole('navigation', { name: 'Navegación principal' })
    expect(within(nav).getByRole('button', { name: /^Categorización de roles/ })).toHaveAttribute('aria-current', 'page')
    expect(within(nav).getByRole('button', { name: /^Deck Builder/ })).not.toHaveAttribute('aria-current')
    // Cada grupo se anuncia por su nombre.
    expect(within(nav).getByRole('group', { name: 'Herramientas' })).toBeInTheDocument()

    // Listo, a medio hacer y pendiente: lo anuncian el nombre accesible y el tooltip; un punto de color en el borde del ícono parecería una notificación.
    expect(within(nav).getByRole('button', { name: /^Deck Builder. Listo/ })).toBeInTheDocument()
    expect(within(nav).getByRole('button', { name: /^Categorización de roles. En progreso/ })).toBeInTheDocument()
    expect(within(nav).getByRole('button', { name: /^Probability Lab. Pendiente/ })).toBeInTheDocument()
    expect(nav.querySelector('[data-tone]')).toBeNull()

    fireEvent.click(within(nav).getByRole('button', { name: /^Exportar deck/ }))
    expect(onSelect).toHaveBeenCalledWith('export')
  })

  it('contraído, sólo se ven los íconos: el nombre queda para los lectores de pantalla y el tooltip, y el rótulo sigue en el DOM (sólo se desvanece)', () => {
    render(<AppSidebar groups={GROUPS} activeKey="export" onSelect={() => {}} collapsed onToggleCollapsed={() => {}} />)

    const button = screen.getByRole('button', { name: /^Exportar deck/ })
    expect(button).toHaveAttribute('title', expect.stringContaining('Exportar deck'))
    // El rótulo no se quita (si no, el ancho no se podría animar sin que todo salte): se oculta a los lectores y se desvanece con el menú.
    const [label] = within(button).getAllByText('Exportar')
    expect(label.closest('[aria-hidden="true"]')).not.toBeNull()
    expect(label.closest('.grid')).toHaveClass('group-data-[collapsed=true]/sidebar:opacity-0')
  })
})

describe('el menú lateral', () => {
  it('se contrae y se expande con su botón, que anuncia el estado', () => {
    const onToggle = vi.fn()
    const { rerender } = render(<AppSidebar groups={GROUPS} activeKey="export" onSelect={() => {}} collapsed={false} onToggleCollapsed={onToggle} />)

    const aside = document.querySelector('aside')
    expect(aside).toHaveAttribute('data-collapsed', 'false')
    // Abierto lleva el idioma.
    expect(screen.getByRole('group', { name: 'Idioma' })).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Contraer menú' }))
    expect(onToggle).toHaveBeenCalledTimes(1)

    rerender(<AppSidebar groups={GROUPS} activeKey="export" onSelect={() => {}} collapsed onToggleCollapsed={onToggle} />)
    expect(aside).toHaveAttribute('data-collapsed', 'true')
    // Contraído el idioma se desvanece y no se puede tocar ni enfocar (el renglón conserva su alto: la flecha de abajo no se mueve).
    expect(screen.getByRole('group', { name: 'Idioma' }).parentElement).toHaveClass('group-data-[collapsed=true]/sidebar:invisible', 'group-data-[collapsed=true]/sidebar:opacity-0')
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

  it('sin haber elegido, arranca contraído en una ventana angosta y abierto en una ancha', () => {
    Object.defineProperty(window, 'innerWidth', { value: 1200, configurable: true })
    const { unmount } = render(
      <AppShell groups={GROUPS} activeKey="export" onSelect={() => {}}>
        <p>Pantalla</p>
      </AppShell>,
    )
    expect(document.querySelector('aside')).toHaveAttribute('data-collapsed', 'true')
    unmount()

    Object.defineProperty(window, 'innerWidth', { value: 1600, configurable: true })
    render(
      <AppShell groups={GROUPS} activeKey="export" onSelect={() => {}}>
        <p>Pantalla</p>
      </AppShell>,
    )
    expect(document.querySelector('aside')).toHaveAttribute('data-collapsed', 'false')
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

  it('avisa cuánto espacio ocupa (menú lateral y pie) para que los botones flotantes y la mascota lo dejen libre', () => {
    // Ventana de escritorio: el corte de 1101 px de la app.
    window.matchMedia = ((query: string) => ({ matches: query === '(min-width: 1101px)', media: query, addEventListener: () => {}, removeEventListener: () => {}, addListener: () => {}, removeListener: () => {}, onchange: null, dispatchEvent: () => false })) as typeof window.matchMedia

    function Probe() {
      return <output data-testid="insets">{JSON.stringify(useShellInsets())}</output>
    }

    const { unmount } = render(
      <>
        <AppShell groups={GROUPS} activeKey="export" onSelect={() => {}}>
          <p>Pantalla</p>
        </AppShell>
        <Probe />
      </>,
    )

    expect(screen.getByTestId('insets')).toHaveTextContent('{"left":240,"bottom":64}')
    act(() => {
      fireEvent.click(screen.getByRole('button', { name: 'Contraer menú' }))
    })
    expect(screen.getByTestId('insets')).toHaveTextContent('{"left":76,"bottom":64}')
    unmount()

    // Sin armazón montado no queda nada reservado.
    render(<Probe />)
    expect(screen.getByTestId('insets')).toHaveTextContent('{"left":0,"bottom":0}')
  })
})
