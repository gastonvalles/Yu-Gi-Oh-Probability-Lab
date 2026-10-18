// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import '@testing-library/jest-dom'
import { createRef } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { TAB_BAR_PX, shellInsetsFor, useShellInsets } from '../app/shell-layout'
import { buildAppNavGroups, buildDeckWorkflowNavigationItems, isDeckWorkflowStepKey } from '../components/deck-mode/deck-workflow-navigation'
import { AppFooter } from '../components/shell/AppFooter'
import { AppShell } from '../components/shell/AppShell'
import { AppSidebar } from '../components/shell/AppSidebar'
import { GroupSheet } from '../components/shell/GroupSheet'
import { mascotsNavItem, searchNavItem } from '../components/shell/nav-model'
import { MobileTabBar } from '../components/shell/MobileTabBar'
import { MobileTopBar } from '../components/shell/MobileTopBar'
import { NavDrawer } from '../components/shell/NavDrawer'
import { ShellMenuButton } from '../components/shell/ShellMenu'
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
  it('agrupa los destinos en cuatro grupos, uno por lo que se viene a hacer: el recorrido del Lab, jugar (con la calculadora y exportar), ver lo que gana y mirar las cartas', () => {
    expect(GROUPS.map((group) => [group.label, group.items.map((item) => item.key)])).toEqual([
      ['Tu deck', ['deck-builder', 'categorization', 'probability-lab', 'workspace']],
      ['Jugar', ['practice', 'life', 'export']],
      ['Descubrir', ['meta', 'tournaments', 'replays']],
      ['Cartas', ['expansions', 'banlists']],
    ])
    // Las mascotas son una preferencia, no un destino: no están en ningún grupo.
    expect(GROUPS.flatMap((group) => group.items).some((item) => item.key === 'mascots')).toBe(false)
  })

  it('la práctica es una pantalla del flujo (#practice) y no un panel que se abre encima: elegirla en el menú cambia de paso', () => {
    expect(isDeckWorkflowStepKey('practice')).toBe(true)
    expect(isDeckWorkflowStepKey('life')).toBe(false)
  })

  it('la mesa de práctica sólo se ofrece con cartas en el Main; la calculadora de LP y exportar, siempre', () => {
    const sinPractica = buildAppNavGroups(STEPS, { practice: false })
    // Sin práctica ni relay, Jugar se queda con la calculadora y exportar.
    expect(sinPractica.map((group) => group.key)).toEqual(['deck', 'duel', 'discover', 'cards'])
    expect(sinPractica.find((group) => group.key === 'duel')?.items.map((item) => item.key)).toEqual(['life', 'export'])
  })

  it('el duelo con un amigo es una pantalla del flujo (#duel) que el menú ofrece sólo donde hay un relay', () => {
    expect(isDeckWorkflowStepKey('duel')).toBe(true)
    // Sin relay (o sin decirlo) el menú no lo ofrece: es como estaba antes.
    expect(GROUPS[1]?.items.map((item) => item.key)).toEqual(['practice', 'life', 'export'])
    expect(buildAppNavGroups(STEPS, { practice: true, duel: true })[1]?.items.map((item) => item.key)).toEqual(['practice', 'duel', 'life', 'export'])
    // Es una herramienta que se juega aunque todavía no haya un deck armado (quien llega por el enlace lo ve y se le avisa).
    expect(buildAppNavGroups(STEPS, { practice: false, duel: true })[1]?.items.map((item) => item.key)).toEqual(['duel', 'life', 'export'])
  })

  it('las mascotas son una preferencia, como el idioma: una fila con su patita abajo del menú (la misma de los destinos, no un botón suelto) que abre su panel', () => {
    const onSelect = vi.fn()

    expect(mascotsNavItem()).toMatchObject({ key: 'mascots', label: 'Mascotas', icon: 'paw' })
    render(<AppSidebar groups={GROUPS} activeKey="export" onSelect={onSelect} collapsed={false} onToggleCollapsed={() => {}} />)
    // Una sola, y fuera de la lista de grupos.
    expect(screen.getAllByRole('button', { name: /^Mascotas/ })).toHaveLength(1)
    expect(screen.getByRole('navigation', { name: 'Navegación principal' })).not.toContainElement(screen.getByRole('button', { name: /^Mascotas/ }))

    fireEvent.click(screen.getByRole('button', { name: /^Mascotas/ }))
    expect(onSelect).toHaveBeenCalledWith('mascots')
  })

  it('el buscador de cartas es una fila del menú arriba de los grupos, un botón de la barra de arriba y una fila del cajón: sólo donde la pantalla lo ofrece', () => {
    const onSelect = vi.fn()
    const onClose = vi.fn()

    expect(searchNavItem()).toMatchObject({ key: 'search', label: 'Buscar cartas', icon: 'search' })

    const { rerender } = render(<AppShell groups={GROUPS} activeKey="export" onSelect={onSelect}><p>pantalla</p></AppShell>)

    expect(screen.queryByRole('button', { name: /^Buscar cartas/ })).toBeNull()

    rerender(<AppShell groups={GROUPS} activeKey="export" onSelect={onSelect} searchAvailable><p>pantalla</p></AppShell>)

    // El menú lateral y la barra de arriba (cada una se muestra según el ancho); la fila del menú no es un destino: va fuera de la navegación.
    const entries = screen.getAllByRole('button', { name: /^Buscar cartas/ })

    expect(entries).toHaveLength(2)
    const aside = within(document.querySelector('aside') as HTMLElement)

    expect(aside.getByRole('navigation', { name: 'Navegación principal' })).not.toContainElement(aside.getByRole('button', { name: /^Buscar cartas/ }))

    for (const entry of entries) fireEvent.click(entry)

    expect(onSelect.mock.calls).toEqual([['search'], ['search']])

    // El cajón del celular: la única entrada en la mesa de práctica, que no lleva barra de arriba.
    onSelect.mockClear()
    cleanup()
    render(<NavDrawer isOpen onClose={onClose} nav={{ groups: GROUPS, activeKey: 'practice', onSelect, searchAvailable: true }} />)
    fireEvent.click(screen.getByRole('button', { name: /^Buscar cartas/ }))

    expect(onSelect).toHaveBeenCalledWith('search')
    expect(onClose).toHaveBeenCalledTimes(1)
  })

  it('el destino abierto lleva aria-current, elegir otro avisa cuál, y cómo viene cada paso se dice con palabras (no con un punto de color)', () => {
    const onSelect = vi.fn()
    render(<SidebarNav groups={GROUPS} activeKey="categorization" onSelect={onSelect} />)

    const nav = screen.getByRole('navigation', { name: 'Navegación principal' })
    expect(within(nav).getByRole('button', { name: /^Categorización de roles/ })).toHaveAttribute('aria-current', 'page')
    expect(within(nav).getByRole('button', { name: /^Deck Builder/ })).not.toHaveAttribute('aria-current')
    // Cada grupo se anuncia por su nombre.
    expect(within(nav).getByRole('group', { name: 'Cartas' })).toBeInTheDocument()

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

describe('el cajón del menú del celular', () => {
  it('cerrado no existe; abierto es un diálogo con idioma, copia de seguridad y lo legal, enfoca adentro y se cierra con Escape, con el velo y con la X', () => {
    const onClose = vi.fn()
    const { rerender } = render(<NavDrawer isOpen={false} onClose={onClose} />)
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()

    rerender(<NavDrawer isOpen onClose={onClose} />)
    const dialog = screen.getByRole('dialog', { name: 'Menú' })
    expect(dialog).toHaveAttribute('aria-modal', 'true')
    expect(within(dialog).getByRole('group', { name: 'Idioma' })).toBeInTheDocument()
    // Como en el lienzo: el idioma con los nombres completos, «Tus datos» como dos filas con ícono y, abajo, lo legal (sin un «Acerca de» aparte).
    expect(within(within(dialog).getByRole('group', { name: 'Idioma' })).getAllByRole('button').map((button) => button.textContent)).toEqual(['Español', 'English'])
    expect(within(dialog).getByText('Tus datos')).toBeInTheDocument()
    expect(within(dialog).getByRole('button', { name: 'Guardar copia de seguridad' })).toBeInTheDocument()
    expect(within(dialog).getByRole('button', { name: 'Restaurar una copia' })).toBeInTheDocument()
    expect(within(dialog).queryByText('Acerca de')).not.toBeInTheDocument()
    expect(within(dialog).getByRole('link', { name: 'Privacidad y aviso legal' })).toBeInTheDocument()
    expect(within(dialog).getAllByRole('link').map((link) => link.getAttribute('href'))).toEqual([
      'https://www.linkedin.com/in/gastonvalles/',
      'https://www.instagram.com/gaston_valles/',
      'https://github.com/gastonvalles',
      '/privacidad.html',
    ])
    // Sin destinos (no se los pasó): sólo los ajustes; con ellos, ver el armazón.
    expect(within(dialog).queryByRole('button', { name: /^Exportar deck/ })).not.toBeInTheDocument()
    expect(dialog).toContainElement(document.activeElement as HTMLElement)

    fireEvent.keyDown(window, { key: 'Escape' })
    expect(onClose).toHaveBeenCalledTimes(1)
    fireEvent.click(within(dialog).getByRole('button', { name: 'Cerrar el menú' }))
    expect(onClose).toHaveBeenCalledTimes(2)
    fireEvent.click(dialog.previousElementSibling as HTMLElement)
    expect(onClose).toHaveBeenCalledTimes(3)
  })

  it('con los destinos trae las mascotas bajo «Personalizar» (una fila, como el idioma): abre su panel y cierra el cajón', () => {
    const onClose = vi.fn()
    const onSelect = vi.fn()
    render(<NavDrawer isOpen onClose={onClose} nav={{ groups: GROUPS, activeKey: 'export', onSelect }} />)

    const dialog = screen.getByRole('dialog', { name: 'Menú' })
    const personalize = within(dialog).getByRole('heading', { name: 'Personalizar' }).closest('section')!
    expect(within(personalize).getAllByRole('button')).toHaveLength(1)

    fireEvent.click(within(personalize).getByRole('button', { name: /^Mascotas/ }))
    expect(onSelect).toHaveBeenCalledWith('mascots')
    expect(onClose).toHaveBeenCalledTimes(1)
    // Los destinos, en cuatro grupos, y las mascotas una sola vez.
    expect(within(dialog).getAllByRole('button', { name: /^Mascotas/ })).toHaveLength(1)
    expect(within(dialog).getByRole('group', { name: 'Cartas' })).toBeInTheDocument()
  })

  it('no hay barra de pasos arriba de las pantallas del deck: se llega a cada paso desde el menú', () => {
    render(
      <AppShell groups={GROUPS} activeKey="categorization" onSelect={() => {}}>
        <p>Contenido</p>
      </AppShell>,
    )

    expect(screen.queryByRole('navigation', { name: 'Pasos del deck' })).not.toBeInTheDocument()
    expect(screen.queryByText('Paso 2 de 5: Roles')).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /^2 · Roles/ })).not.toBeInTheDocument()
  })

})

describe('la barra de abajo del celular y su hoja', () => {
  it('lleva un botón por grupo, marca en ámbar el del destino abierto y avisa cuál se abrió', () => {
    const onOpen = vi.fn()
    render(<MobileTabBar groups={GROUPS} activeKey="categorization" openKey={null} onOpen={onOpen} />)

    const bar = screen.getByRole('navigation', { name: 'Navegación principal' })
    expect(within(bar).getAllByRole('button').map((button) => button.textContent)).toEqual(['Tu deck', 'Jugar', 'Descubrir', 'Cartas'])
    expect(within(bar).getByRole('button', { name: 'Tu deck' })).toHaveClass('text-nav-active')
    expect(within(bar).getByRole('button', { name: 'Descubrir' })).toHaveClass('text-foreground')

    fireEvent.click(within(bar).getByRole('button', { name: 'Descubrir' }))
    expect(onOpen).toHaveBeenCalledWith('discover')
  })

  it('la hoja cerrada no existe; abierta es un diálogo con las opciones del grupo, elegir una avisa cuál y se cierra con Escape y con el velo', () => {
    const onSelect = vi.fn()
    const onClose = vi.fn()
    const discover = GROUPS.find((group) => group.key === 'discover') ?? null
    const { rerender } = render(<GroupSheet group={null} activeKey="export" onSelect={onSelect} onClose={onClose} />)
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()

    rerender(<GroupSheet group={discover} activeKey="replays" onSelect={onSelect} onClose={onClose} />)
    const dialog = screen.getByRole('dialog', { name: 'Descubrir' })
    // No es modal: la barra de abajo queda a la vista y a mano (el velo y la hoja terminan arriba de ella).
    expect(dialog).not.toHaveAttribute('aria-modal')
    expect(dialog.parentElement).toHaveClass('bottom-[calc(4rem+env(safe-area-inset-bottom,0px))]')
    // Sin X: se cierra con Escape, con el velo o tocando de nuevo el grupo. Cada destino lleva su nombre y una línea que explica.
    expect(within(dialog).queryByRole('button', { name: 'Cerrar' })).not.toBeInTheDocument()
    expect(dialog).toHaveTextContent('Los duelos de esos decks, en video')
    expect(within(dialog).getByRole('button', { name: /^Replays de torneo/ })).toHaveAttribute('aria-current', 'page')
    expect(within(dialog).getByRole('button', { name: /^Replays de torneo/ })).toHaveClass('text-nav-active')

    fireEvent.click(within(dialog).getByRole('button', { name: /^Tier lists/ }))
    expect(onSelect).toHaveBeenCalledWith('meta')

    fireEvent.keyDown(window, { key: 'Escape' })
    expect(onClose).toHaveBeenCalledTimes(1)
    fireEvent.click(dialog.previousElementSibling as HTMLElement)
    expect(onClose).toHaveBeenCalledTimes(2)
  })
})

describe('las hojas del celular, como en el lienzo', () => {
  const sheet = (groups: typeof GROUPS, key: string, activeKey: string, onSelect = vi.fn()) => {
    render(<GroupSheet group={groups.find((group) => group.key === key) ?? null} activeKey={activeKey} onSelect={onSelect} onClose={() => {}} />)

    return { dialog: screen.getByRole('dialog'), onSelect }
  }

  it('«Tu deck»: cada paso con su ícono y su estado a la derecha («Listo · 42» en verde, «3 sin clasificar», «Estás acá»), y el destino abierto en ámbar', () => {
    const { dialog } = sheet(GROUPS, 'deck', 'probability-lab')
    const row = (name: RegExp) => within(dialog).getByRole('button', { name })

    expect(row(/^Deck Builder/)).toHaveTextContent('Listo · 42')
    expect(within(row(/^Deck Builder/)).getByText('Listo · 42')).toHaveClass('bg-success')
    expect(row(/^Categorización de roles/)).toHaveTextContent('3 sin clasificar')
    expect(within(row(/^Categorización de roles/)).getByText('3 sin clasificar')).not.toHaveClass('bg-success')
    expect(row(/^Probability Lab/)).toHaveTextContent('Estás acá')
    expect(row(/^Probability Lab/)).toHaveClass('text-nav-active')
    expect(row(/^Comparar/)).toHaveTextContent('0 builds')
    // Exportar no es parte del recorrido del Lab: no está en esta hoja (está en Jugar).
    expect(within(dialog).queryByRole('button', { name: /^Exportar/ })).not.toBeInTheDocument()
  })

  it('el estado de los pasos sale de lo guardado: las builds para comparar, las sugerencias sin confirmar y las reglas propias', () => {
    const steps = buildDeckWorkflowNavigationItems({ mainDeckCount: 40, roleCardCount: 40, unclassifiedCardCount: 0, pendingReviewCount: 23, hasCompletedRoleStep: true, patternCount: 2, savedBuildCount: 2 })
    const { dialog } = sheet(buildAppNavGroups(steps, { practice: true }), 'deck', 'workspace')

    expect(within(dialog).getByRole('button', { name: /^Categorización de roles/ })).toHaveTextContent('23 sin confirmar')
    expect(within(dialog).getByRole('button', { name: /^Probability Lab/ })).toHaveTextContent('2 reglas tuyas')
    expect(within(dialog).getByRole('button', { name: /^Comparar/ })).toHaveTextContent('Estás acá')
  })

  it('«Jugar»: jugar online, mirar un duelo, entrar con un enlace (Entrenar solo está en el inicio de Jugar), la calculadora de LP y exportar el deck, cada uno con su línea; con una sala en pausa, el aviso con «Volver»', () => {
    const groups = buildAppNavGroups(STEPS, { practice: true, duel: true, paused: { room: 'ABCDEFGH', rival: 'Ana' } })
    const { dialog, onSelect } = sheet(groups, 'duel', 'duel')

    expect(within(dialog).getAllByRole('listitem').map((item) => item.textContent)).toEqual([
      'Jugar onlineEntrá a una sala, retá a un amigo o mirá un duelo',
      'Mirar un dueloPegá el enlace para mirar',
      'Entrar con un enlacePegá el enlace que te mandaron',
      'Calculadora de LPVidas, reloj de ronda, moneda y dado',
      'ExportarImagen, PDF y YDK, para el torneo o el simulador',
    ])
    expect(within(dialog).getByRole('status')).toHaveTextContent('Sala en pausa con Ana')
    expect(within(dialog).getByRole('status')).toHaveTextContent('Seguís desde donde quedó.')

    fireEvent.click(within(dialog).getByRole('button', { name: 'Volver' }))
    expect(onSelect).toHaveBeenCalledWith('duel-resume')
    fireEvent.click(within(dialog).getByRole('button', { name: /^Mirar un duelo/ }))
    expect(onSelect).toHaveBeenCalledWith('duel-watch')
    fireEvent.click(within(dialog).getByRole('button', { name: /^Entrar con un enlace/ }))
    expect(onSelect).toHaveBeenCalledWith('duel-join')
    fireEvent.click(within(dialog).getByRole('button', { name: /^Jugar online/ }))
    expect(onSelect).toHaveBeenCalledWith('duel')
    fireEvent.click(within(dialog).getByRole('button', { name: /^Calculadora de LP/ }))
    expect(onSelect).toHaveBeenCalledWith('life')
    fireEvent.click(within(dialog).getByRole('button', { name: /^Exportar deck/ }))
    expect(onSelect).toHaveBeenCalledWith('export')
  })

  it('sin una sala en pausa no hay aviso, y sin relay Jugar ofrece entrenar solo, la calculadora y exportar', () => {
    const withRelay = buildAppNavGroups(STEPS, { practice: true, duel: true })
    const { dialog } = sheet(withRelay, 'duel', 'duel')

    expect(within(dialog).queryByRole('status')).not.toBeInTheDocument()
    cleanup()

    const solo = sheet(buildAppNavGroups(STEPS, { practice: true }), 'duel', 'practice')

    expect(within(solo.dialog).getAllByRole('listitem')).toHaveLength(3)
  })

  it('Descubrir y Cartas llevan su rótulo y, de cada destino, el nombre con una línea que explica', () => {
    const discover = sheet(GROUPS, 'discover', 'practice')

    expect(discover.dialog).toHaveTextContent('Descubrir')
    expect(discover.dialog).toHaveTextContent('Hand traps y boardbreakers de los torneos')
    expect(discover.dialog).toHaveTextContent('Los duelos de esos decks, en video')
    expect(discover.dialog).not.toHaveTextContent('Banlists')
    cleanup()

    const cards = sheet(GROUPS, 'cards', 'practice')

    expect(cards.dialog).toHaveTextContent('Cartas')
    expect(cards.dialog).toHaveTextContent('Sus cartas con rareza y precio')
    expect(cards.dialog).toHaveTextContent('Prohibidas y limitadas, lista por lista')
  })

  it('la barra de abajo: con una hoja abierta sólo el grupo de esa hoja va en ámbar, y la de arriba dice en qué pantalla estás', () => {
    const { rerender } = render(<MobileTabBar groups={GROUPS} activeKey="probability-lab" openKey={null} onOpen={() => {}} />)
    const tab = (name: string) => screen.getByRole('button', { name })

    expect(tab('Tu deck')).toHaveClass('text-nav-active')
    expect(tab('Descubrir')).toHaveClass('text-foreground')

    rerender(<MobileTabBar groups={GROUPS} activeKey="probability-lab" openKey="discover" onOpen={() => {}} />)
    expect(tab('Descubrir')).toHaveClass('text-nav-active')
    expect(tab('Tu deck')).toHaveClass('text-foreground')
    // La pantalla sigue siendo de «Tu deck»: se sigue anunciando.
    expect(tab('Tu deck')).toHaveAttribute('aria-current', 'true')
  })

  it('la barra de arriba lleva el nombre de la pantalla (y la marca sólo si no hay)', () => {
    const { rerender } = render(<MobileTopBar menuOpen={false} onMenu={() => {}} title="Lab" />)

    expect(screen.getByText('Lab')).toBeInTheDocument()
    expect(screen.queryByText('Sitio no oficial')).not.toBeInTheDocument()

    rerender(<MobileTopBar menuOpen={false} onMenu={() => {}} />)
    expect(screen.getByText('Sitio no oficial')).toBeInTheDocument()
  })

  it('tocar el mismo grupo de la barra de abajo cierra su hoja, y tocar otro la cambia', () => {
    render(
      <AppShell groups={GROUPS} activeKey="categorization" onSelect={() => {}}>
        <p>Contenido</p>
      </AppShell>,
    )
    const bar = screen.getAllByRole('navigation', { name: 'Navegación principal' })[1]!

    fireEvent.click(within(bar).getByRole('button', { name: 'Tu deck' }))
    expect(screen.getByRole('dialog', { name: 'Tu deck' })).toBeInTheDocument()
    fireEvent.click(within(bar).getByRole('button', { name: 'Descubrir' }))
    expect(screen.getByRole('dialog', { name: 'Descubrir' })).toBeInTheDocument()
    fireEvent.click(within(bar).getByRole('button', { name: 'Descubrir' }))
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    // La barra de arriba dice la pantalla de ahora.
    expect(within(screen.getByRole('banner')).getByText('Roles')).toBeInTheDocument()
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
  it('lleva el contenido, el pie y el menú una sola vez; la hamburguesa abre el menú y la barra de abajo abre la hoja de un grupo: elegir cierra', () => {
    const onSelect = vi.fn()
    render(
      <AppShell groups={GROUPS} activeKey="categorization" onSelect={onSelect} contentScrollable>
        <p>Contenido de la pantalla</p>
      </AppShell>,
    )

    expect(screen.getByText('Contenido de la pantalla')).toBeInTheDocument()
    expect(screen.getAllByRole('contentinfo')).toHaveLength(1)
    // El menú lateral y la barra de abajo están los dos en el DOM: el CSS muestra el que toca según el ancho.
    expect(screen.getAllByRole('navigation', { name: 'Navegación principal' })).toHaveLength(2)

    fireEvent.click(screen.getByRole('button', { name: 'Abrir el menú' }))
    expect(screen.getByRole('dialog', { name: 'Menú' })).toBeInTheDocument()
    fireEvent.keyDown(window, { key: 'Escape' })
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()

    const bar = screen.getAllByRole('navigation', { name: 'Navegación principal' })[1]!
    fireEvent.click(within(bar).getByRole('button', { name: 'Tu deck' }))
    const dialog = screen.getByRole('dialog', { name: 'Tu deck' })
    fireEvent.click(within(dialog).getByRole('button', { name: /^Probability Lab/ }))
    expect(onSelect).toHaveBeenCalledWith('probability-lab')
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })

  it('el pie queda afuera del recuadro que scrollea, y el envoltorio de la pantalla no crece con el contenido: la pantalla scrollea y el pie queda fijo', () => {
    const scrollRef = createRef<HTMLDivElement>()

    render(
      <AppShell groups={GROUPS} activeKey="export" onSelect={() => {}} contentScrollable contentScrollRef={scrollRef}>
        <p>Pantalla</p>
      </AppShell>,
    )

    const scroller = scrollRef.current!

    expect(scroller).toHaveClass('min-[1101px]:overflow-y-auto')
    expect(scroller).toContainElement(screen.getByText('Pantalla'))
    expect(scroller).not.toContainElement(screen.getByRole('contentinfo'))
    // El envoltorio de la pantalla mide lo que el recuadro en escritorio, así una pantalla puede ocupar justo ese alto (`h-full`).
    expect(screen.getByText('Pantalla').parentElement).toHaveClass('min-[1101px]:min-h-0')
  })

  it('una vista completa (la práctica) no lleva pie y, en el celular, mide justo el alto de la ventana: no hay scroll de página', () => {
    const { container } = render(
      <AppShell groups={GROUPS} activeKey="practice" onSelect={() => {}} immersive>
        <p>Pantalla</p>
      </AppShell>,
    )

    expect(screen.getByText('Pantalla')).toBeInTheDocument()
    expect(screen.queryByRole('contentinfo')).not.toBeInTheDocument()
    expect(container.firstElementChild).toHaveClass('max-[1100px]:h-dvh', 'max-[1100px]:overflow-hidden')
  })

  it('la hamburguesa abre el menú con los destinos de los cuatro grupos (aunque la barra de abajo esté), y elegir uno cierra el cajón', () => {
    const onSelect = vi.fn()
    render(
      <AppShell groups={GROUPS} activeKey="categorization" onSelect={onSelect} contentScrollable>
        <p>Pantalla</p>
      </AppShell>,
    )

    fireEvent.click(screen.getByRole('button', { name: 'Abrir el menú' }))
    const dialog = screen.getByRole('dialog', { name: 'Menú' })

    // Los destinos arriba y los ajustes debajo, en el mismo cajón.
    expect(within(dialog).getByRole('button', { name: /^Exportar deck/ })).toBeInTheDocument()
    expect(within(dialog).getByRole('group', { name: 'Idioma' })).toBeInTheDocument()

    fireEvent.click(within(dialog).getByRole('button', { name: /^Exportar deck/ }))
    expect(onSelect).toHaveBeenCalledWith('export')
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })

  it('la mesa a pantalla completa no lleva la barra de abajo: la hamburguesa abre el menú con los destinos para poder irse', () => {
    const onSelect = vi.fn()
    render(
      <AppShell groups={GROUPS} activeKey="practice" onSelect={onSelect} immersive>
        <p>Mesa</p>
      </AppShell>,
    )

    // Sólo queda el menú lateral (el CSS lo esconde en el celular): la barra de abajo no está.
    expect(screen.getAllByRole('navigation', { name: 'Navegación principal' })).toHaveLength(1)
    fireEvent.click(screen.getByRole('button', { name: 'Abrir el menú' }))
    const dialog = screen.getByRole('dialog', { name: 'Menú' })
    fireEvent.click(within(dialog).getByRole('button', { name: /^Probability Lab/ }))
    expect(onSelect).toHaveBeenCalledWith('probability-lab')
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })

  it('la mesa a pantalla completa que trae su propia hamburguesa reemplaza la barra de arriba: una sola barra, y el botón abre el mismo menú', () => {
    const onSelect = vi.fn()
    const { rerender } = render(
      <AppShell groups={GROUPS} activeKey="practice" onSelect={onSelect} immersive>
        <p>Mesa</p>
      </AppShell>,
    )

    // Sin hamburguesa propia, la barra del armazón sigue ahí (no se pierde la forma de abrir el menú).
    expect(screen.getByRole('banner')).toBeInTheDocument()

    rerender(
      <AppShell groups={GROUPS} activeKey="practice" onSelect={onSelect} immersive>
        <ShellMenuButton />
      </AppShell>,
    )

    expect(screen.queryByRole('banner')).not.toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Abrir el menú' }))
    expect(screen.getByRole('dialog', { name: 'Menú' })).toBeInTheDocument()
  })

  it('una pantalla común (sin vista completa) mantiene su barra de arriba aunque tenga el botón del menú', () => {
    render(
      <AppShell groups={GROUPS} activeKey="categorization" onSelect={() => {}} contentScrollable>
        <ShellMenuButton />
      </AppShell>,
    )

    expect(screen.getByRole('banner')).toBeInTheDocument()
  })

  it('al cambiar de pantalla (también con el botón Atrás) la hoja y el cajón que estaban abiertos se cierran', () => {
    const { rerender } = render(
      <AppShell groups={GROUPS} activeKey="export" onSelect={() => {}} contentScrollable>
        <p>Pantalla</p>
      </AppShell>,
    )

    fireEvent.click(within(screen.getAllByRole('navigation', { name: 'Navegación principal' })[1]!).getByRole('button', { name: 'Descubrir' }))
    expect(screen.getByRole('dialog', { name: 'Descubrir' })).toBeInTheDocument()

    rerender(
      <AppShell groups={GROUPS} activeKey="meta" onSelect={() => {}} contentScrollable>
        <p>Pantalla</p>
      </AppShell>,
    )
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })

  it('lo flotante (botones, mascotas, avisos) deja libre la barra de abajo en el celular, y nada en la mesa a pantalla completa', () => {
    expect(shellInsetsFor(false, false)).toEqual({ left: 0, bottom: TAB_BAR_PX })

    // Con la letra del navegador agrandada, la barra (4 rem) crece y lo reservado con ella.
    document.documentElement.style.fontSize = '20px'
    expect(shellInsetsFor(false, false)).toEqual({ left: 0, bottom: 80 })
    document.documentElement.style.fontSize = ''
    expect(shellInsetsFor(false, false, false)).toEqual({ left: 0, bottom: 0 })
    // En escritorio manda el menú lateral y el pie, con barra o sin ella.
    expect(shellInsetsFor(false, true)).toEqual(shellInsetsFor(false, true, false))
    expect(shellInsetsFor(false, true).left).toBeGreaterThan(0)
  })

  it('en escritorio la hoja y el cajón no existen: abiertos y escondidos atraparían el foco y bloquearían el scroll sin que se vea nada', () => {
    window.matchMedia = ((query: string) => ({ matches: true, media: query, addEventListener: () => {}, removeEventListener: () => {}, addListener: () => {}, removeListener: () => {}, onchange: null, dispatchEvent: () => false })) as typeof window.matchMedia
    const discover = GROUPS.find((group) => group.key === 'discover') ?? null
    const { rerender } = render(<GroupSheet group={discover} activeKey="meta" onSelect={() => {}} onClose={() => {}} />)

    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    rerender(<NavDrawer isOpen onClose={() => {}} />)
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
