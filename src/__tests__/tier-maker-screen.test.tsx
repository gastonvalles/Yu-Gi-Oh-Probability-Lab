// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import '@testing-library/jest-dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { TIERLIST_STORAGE_KEY, TIERLIST_VERSION, addCards, newList, writeStore, type MakerCard } from '../app/tierlist-maker'
import { TierMakerScreen } from '../components/meta/TierMakerScreen'
import { TIER_LAYOUT, centerOf, mockTierLayout, mouseDrag } from './support/tier-board-layout'

const toast = vi.hoisted(() => vi.fn())

// El arte real lee el store (el aviso de la banlist) y la búsqueda sale a la red: acá sólo importa el tablero.
vi.mock('../components/CardArt', () => ({ CardArt: () => <img alt="" /> }))
vi.mock('../app/use-toast-message', () => ({ showToastMessage: toast, useToastMessage: () => ({ showToast: toast }) }))
vi.mock('../ygoprodeck', () => ({
  searchCards: vi.fn(async () => ({
    hasMore: false,
    results: [
      { ygoprodeckId: 14558127, name: 'Ash Blossom & Joyous Spring', imageUrlSmall: 'https://images.ygoprodeck.com/images/cards_small/14558127.jpg', imageUrl: null },
      { ygoprodeckId: 23434538, name: 'Maxx "C"', imageUrlSmall: 'https://images.ygoprodeck.com/images/cards_small/23434538.jpg', imageUrl: null },
    ],
  })),
}))

const deck: MakerCard[] = [
  { id: 101, name: 'Crossout Designator', image: 'https://images.ygoprodeck.com/images/cards_small/101.jpg' },
  { id: 102, name: 'Effect Veiler', image: 'https://images.ygoprodeck.com/images/cards_small/102.jpg' },
]

beforeEach(() => {
  localStorage.clear()
  toast.mockClear()
  Element.prototype.scrollIntoView = () => {}
})

afterEach(cleanup)

const tiles = (scope: HTMLElement = document.body) => within(scope).queryAllByRole('button', { name: /^Carta / })
const row = (name: string) => screen.getByRole('region', { name })
/** Toda la caja de una fila, donde se suelta una carta (con el layout de prueba de `support/tier-board-layout`). */
const zoneOf = (name: string) => row(name).closest('[data-tier-drop]') as HTMLElement
/** El orden de las filas del tablero (sin «Sin clasificar»). */
const order = () => [...document.querySelectorAll('[data-tier-row] > section[aria-label]')].map((section) => section.getAttribute('aria-label')).filter((label) => label !== 'Sin clasificar')
/** Deja guardada una lista con las dos cartas del deck de prueba en «Sin clasificar»: lo que antes sumaba el botón «Mi deck». */
const seed = () => {
  const list = addCards(newList('Mi tier list'), deck)

  writeStore({ version: TIERLIST_VERSION, activeId: list.id, lists: [list] })
}

describe('el creador de tier lists', () => {
  it('arranca con las filas S a F de siempre, vacías, y la bandeja de las cartas sin clasificar', () => {
    render(<TierMakerScreen />)

    for (const label of ['S', 'A', 'B', 'C', 'D', 'E', 'F']) expect(row(label)).toBeInTheDocument()

    expect(row('Sin clasificar')).toBeInTheDocument()
    expect(tiles()).toHaveLength(0)
    expect(screen.getByText(/Todavía no hay cartas/)).toBeInTheDocument()
  })

  it('solo ofrece lo que hace falta: sin título, sin lista desplegable, sin duplicar, borrar ni crear listas, sin copiar texto ni «Mi deck»', () => {
    render(<TierMakerScreen />)

    expect(screen.queryByRole('textbox', { name: 'Nombre de la tier list' })).not.toBeInTheDocument()
    expect(screen.queryByRole('combobox', { name: 'Tus tier lists' })).not.toBeInTheDocument()

    for (const name of ['Duplicar', 'Eliminar lista', 'Nueva lista', 'Copiar texto', /Mi deck/]) {
      expect(screen.queryByRole('button', { name })).not.toBeInTheDocument()
    }

    expect(screen.getByRole('region', { name: 'Buscar' })).toBeInTheDocument()
    expect(screen.getByRole('searchbox', { name: 'Buscar una carta por nombre' })).toBeInTheDocument()

    for (const name of ['Hand traps del meta', 'Boardbreakers del meta', /Volver todo a/, 'Descargar imagen', 'Agregar fila', 'Quitar fila']) {
      expect(screen.getByRole('button', { name })).toBeInTheDocument()
    }
  })

  it('el buscador trae cartas por nombre y tocar una la suma a la bandeja (y queda marcada como ya agregada)', async () => {
    render(<TierMakerScreen />)

    fireEvent.change(screen.getByRole('searchbox', { name: 'Buscar una carta por nombre' }), { target: { value: 'ash' } })
    fireEvent.click(await screen.findByRole('button', { name: 'Agregar Ash Blossom & Joyous Spring' }))

    expect(tiles(row('Sin clasificar'))).toHaveLength(1)
    await waitFor(() => expect(screen.getByRole('button', { name: 'Ash Blossom & Joyous Spring ya está en la lista' })).toBeDisabled())
  })

  it('con una carta elegida, la barra tiene un botón por fila: tocar uno la manda ahí, y de ahí se la manda a la bandeja', () => {
    seed()
    render(<TierMakerScreen />)

    const card = tiles(row('Sin clasificar'))[0] as HTMLElement

    fireEvent.click(card)
    expect(card).toHaveAttribute('aria-pressed', 'true')
    fireEvent.click(screen.getByRole('button', { name: 'Mover Crossout Designator a S' }))

    expect(tiles(row('S'))).toHaveLength(1)
    expect(tiles(row('Sin clasificar'))).toHaveLength(1)
    // Mover deja de tener una carta elegida: la barra se va.
    expect(screen.queryByRole('group', { name: /Mover «/ })).not.toBeInTheDocument()

    fireEvent.click(tiles(row('S'))[0] as HTMLElement)
    fireEvent.click(screen.getByRole('button', { name: /^Mover Crossout Designator a Sin clasificar/ }))
    expect(tiles(row('S'))).toHaveLength(0)
    expect(tiles(row('Sin clasificar'))).toHaveLength(2)
  })

  it('tocar un hueco de una fila con una carta elegida la manda ahí; sin carta elegida no pasa nada', () => {
    seed()
    render(<TierMakerScreen />)

    const rowA = row('A').querySelector('ul') as HTMLElement

    fireEvent.click(rowA)
    expect(tiles(row('A'))).toHaveLength(0)

    fireEvent.click(tiles(row('Sin clasificar'))[0] as HTMLElement)
    fireEvent.click(rowA)
    expect(tiles(row('A'))).toHaveLength(1)
  })

  it('se arrastra una carta (con el mouse, como en el builder) a una fila, entre las de una fila para ordenarlas y de vuelta a la bandeja; el arrastre no la deja elegida', () => {
    seed()

    const layout = mockTierLayout()

    try {
      render(<TierMakerScreen />)

      const [first, second] = tiles(row('Sin clasificar')) as [HTMLElement, HTMLElement]

      mouseDrag(first, centerOf(zoneOf('S')))
      mouseDrag(second, centerOf(zoneOf('S')))
      expect(tiles(row('S')).map((tile) => tile.getAttribute('aria-label'))).toEqual(['Carta Crossout Designator', 'Carta Effect Veiler'])
      expect(screen.queryByRole('group', { name: /Mover «/ })).not.toBeInTheDocument()

      // Soltar la segunda sobre la mitad izquierda de la primera la pone antes.
      const [a, b] = tiles(row('S')) as [HTMLElement, HTMLElement]

      mouseDrag(b, { x: a.getBoundingClientRect().left + 5, y: centerOf(a).y })
      expect(tiles(row('S')).map((tile) => tile.getAttribute('aria-label'))).toEqual(['Carta Effect Veiler', 'Carta Crossout Designator'])

      // Y de S a «Sin clasificar», al final.
      mouseDrag(tiles(row('S'))[0] as HTMLElement, { x: TIER_LAYOUT.width - 10, y: centerOf(zoneOf('Sin clasificar')).y })
      expect(names(row('S'))).toEqual(['Carta Crossout Designator'])
      expect(names(row('Sin clasificar'))).toEqual(['Carta Effect Veiler'])
      expect(localStorage.getItem(TIERLIST_STORAGE_KEY)).toContain('Effect Veiler')
    } finally {
      layout.restore()
    }
  })

  it('la letra de una fila abre su editor: nombre, color, y borrarla devuelve sus cartas a la bandeja', () => {
    seed()
    render(<TierMakerScreen />)
    fireEvent.click(tiles(row('Sin clasificar'))[0] as HTMLElement)
    fireEvent.click(screen.getByRole('button', { name: 'Mover Crossout Designator a S' }))

    fireEvent.click(screen.getByRole('button', { name: 'Editar la fila S' }))

    const dialog = within(screen.getByRole('dialog', { name: 'Editar fila' }))

    fireEvent.change(dialog.getByRole('textbox', { name: 'Nombre de la fila' }), { target: { value: 'Dios' } })
    fireEvent.click(dialog.getByRole('button', { name: 'Color #7fbfff' }))
    expect(row('Dios')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Editar la fila Dios' })).toHaveStyle({ backgroundColor: 'rgb(127, 191, 255)' })

    fireEvent.click(dialog.getByRole('button', { name: 'Quitar la fila' }))
    expect(screen.queryByRole('region', { name: 'Dios' })).not.toBeInTheDocument()
    expect(tiles(row('Sin clasificar'))).toHaveLength(2)
  })

  it('las filas se agregan al final con «Agregar fila»', () => {
    render(<TierMakerScreen />)

    fireEvent.click(screen.getByRole('button', { name: 'Agregar fila' }))
    expect(order().at(-1)).toBe('Nueva')
  })

  it('se guarda sola en el navegador: al volver, está como se dejó', () => {
    seed()
    const first = render(<TierMakerScreen />)
    fireEvent.click(tiles(row('Sin clasificar'))[1] as HTMLElement)
    fireEvent.click(screen.getByRole('button', { name: 'Mover Effect Veiler a B' }))
    expect(localStorage.getItem(TIERLIST_STORAGE_KEY)).toContain('Effect Veiler')
    first.unmount()

    render(<TierMakerScreen />)
    expect(tiles(row('B')).map((tile) => tile.getAttribute('aria-label'))).toEqual(['Carta Effect Veiler'])
    expect(tiles(row('Sin clasificar'))).toHaveLength(1)
  })

  it('«Volver todo a Sin clasificar» saca las cartas de las filas sin borrar las filas', () => {
    seed()
    render(<TierMakerScreen />)
    fireEvent.click(tiles(row('Sin clasificar'))[0] as HTMLElement)
    fireEvent.click(screen.getByRole('button', { name: 'Mover Crossout Designator a A' }))

    fireEvent.click(screen.getByRole('button', { name: /Volver todo a/ }))
    expect(tiles(row('A'))).toHaveLength(0)
    expect(tiles(row('Sin clasificar'))).toHaveLength(2)
  })

  it('descargar la imagen sin cartas en las filas avisa en vez de armar una imagen vacía', () => {
    seed()
    render(<TierMakerScreen />)
    fireEvent.click(tiles(row('Sin clasificar'))[0] as HTMLElement)
    fireEvent.click(screen.getByRole('button', { name: 'Mover Crossout Designator a S' }))

    fireEvent.click(screen.getByRole('button', { name: 'Volver todo a «Sin clasificar»' }))
    fireEvent.click(screen.getByRole('button', { name: 'Descargar imagen' }))
    expect(toast).toHaveBeenLastCalledWith('Poné alguna carta en una fila para armar la imagen.', 'info')
  })
})

const names = (scope: HTMLElement) => tiles(scope).map((tile) => tile.getAttribute('aria-label'))
/** Lleva una carta de «Sin clasificar» a una fila con la barra, como con un toque. */
const moveTo = (card: string, tier: string) => {
  fireEvent.click(tiles(row('Sin clasificar')).find((tile) => tile.getAttribute('aria-label') === `Carta ${card}`) as HTMLElement)
  fireEvent.click(screen.getByRole('button', { name: `Mover ${card} a ${tier}` }))
}

describe('sacar cartas de a un paso (Gastón, 2026-10-21: «si hago click derecho sobre las cartas deben salirse»)', () => {
  it('el clic derecho en una fila la devuelve al final de «Sin clasificar», y ahí la saca de la lista; el menú del navegador no sale', () => {
    seed()
    render(<TierMakerScreen />)
    moveTo('Crossout Designator', 'S')

    const inRow = tiles(row('S'))[0] as HTMLElement

    fireEvent.pointerDown(inRow, { pointerType: 'mouse', button: 2 })
    // `fireEvent` devuelve `false` cuando el evento se canceló (`preventDefault`): así no sale el menú del navegador.
    expect(fireEvent.contextMenu(inRow)).toBe(false)
    expect(tiles(row('S'))).toHaveLength(0)
    expect(names(row('Sin clasificar'))).toEqual(['Carta Effect Veiler', 'Carta Crossout Designator'])

    const inPool = tiles(row('Sin clasificar'))[1] as HTMLElement

    fireEvent.pointerDown(inPool, { pointerType: 'mouse', button: 2 })
    expect(fireEvent.contextMenu(inPool)).toBe(false)
    expect(names(row('Sin clasificar'))).toEqual(['Carta Effect Veiler'])
    expect(screen.getByText('1 de 300 cartas')).toBeInTheDocument()
  })

  it('si la carta era la elegida, el clic derecho también la deja de elegir (la barra se va)', () => {
    seed()
    render(<TierMakerScreen />)

    const card = tiles(row('Sin clasificar'))[0] as HTMLElement

    fireEvent.click(card)
    expect(screen.getByRole('group', { name: 'Mover «Crossout Designator» a…' })).toBeInTheDocument()
    fireEvent.contextMenu(card)
    expect(screen.queryByRole('group', { name: /Mover «/ })).not.toBeInTheDocument()
    expect(names(row('Sin clasificar'))).toEqual(['Carta Effect Veiler'])
  })

  it('con el dedo, el toque largo (que en Android dispara el mismo evento) no saca nada: sólo se bloquea el menú; con un lápiz, sí', () => {
    seed()
    render(<TierMakerScreen />)

    const [first, second] = tiles(row('Sin clasificar')) as [HTMLElement, HTMLElement]

    fireEvent.pointerDown(first, { pointerType: 'touch' })
    expect(fireEvent.contextMenu(first)).toBe(false)
    expect(tiles(row('Sin clasificar'))).toHaveLength(2)
    fireEvent.pointerUp(first, { pointerType: 'touch' })

    fireEvent.pointerDown(second, { pointerType: 'pen' })
    fireEvent.contextMenu(second)
    expect(names(row('Sin clasificar'))).toEqual(['Carta Crossout Designator'])
  })

  it('Supr y Retroceso hacen lo mismo con el teclado, sin perder el foco; Enter sigue eligiendo', async () => {
    seed()
    render(<TierMakerScreen />)
    moveTo('Crossout Designator', 'S')
    moveTo('Effect Veiler', 'S')

    const first = tiles(row('S'))[0] as HTMLElement

    first.focus()
    fireEvent.keyDown(first, { key: 'Delete' })
    expect(names(row('S'))).toEqual(['Carta Effect Veiler'])
    expect(names(row('Sin clasificar'))).toEqual(['Carta Crossout Designator'])
    // El foco pasa a la que quedó en su lugar.
    await waitFor(() => expect(tiles(row('S'))[0]).toHaveFocus())

    fireEvent.keyDown(tiles(row('S'))[0] as HTMLElement, { key: 'Backspace' })
    expect(tiles(row('S'))).toHaveLength(0)
    // La fila quedó vacía: el foco va a su letra, lo que está justo antes.
    await waitFor(() => expect(screen.getByRole('button', { name: 'Editar la fila S' })).toHaveFocus())

    const pooled = tiles(row('Sin clasificar'))[0] as HTMLElement

    fireEvent.keyDown(pooled, { key: 'Enter' })
    expect(pooled).toHaveAttribute('aria-pressed', 'true')

    pooled.focus()
    fireEvent.keyDown(pooled, { key: 'Delete' })
    expect(names(row('Sin clasificar'))).toEqual(['Carta Effect Veiler'])
    await waitFor(() => expect(tiles(row('Sin clasificar'))[0]).toHaveFocus())

    // La última de «Sin clasificar»: el foco pasa a «Quitar fila», lo último que se puede tocar antes.
    fireEvent.keyDown(tiles(row('Sin clasificar'))[0] as HTMLElement, { key: 'Delete' })
    expect(tiles()).toHaveLength(0)
    await waitFor(() => expect(screen.getByRole('button', { name: 'Quitar fila' })).toHaveFocus())
  })
})

describe('los botones de las filas (Gastón: «deben estar antes de la sección unranked»)', () => {
  it('van entre la última fila y «Sin clasificar», uno al lado del otro', () => {
    render(<TierMakerScreen />)

    const after = (a: Node, b: Node) => Boolean(a.compareDocumentPosition(b) & Node.DOCUMENT_POSITION_FOLLOWING)
    const add = screen.getByRole('button', { name: 'Agregar fila' })
    const remove = screen.getByRole('button', { name: 'Quitar fila' })

    expect(after(row('F'), add)).toBe(true)
    expect(after(add, remove)).toBe(true)
    expect(after(remove, row('Sin clasificar'))).toBe(true)
    expect(add.parentElement).toBe(remove.parentElement)
  })

  it('quitar saca la última fila (sus cartas vuelven a «Sin clasificar») hasta que no queda ninguna; agregar suma al final hasta el tope', () => {
    seed()
    render(<TierMakerScreen />)
    moveTo('Crossout Designator', 'F')

    const add = screen.getByRole('button', { name: 'Agregar fila' })
    const remove = screen.getByRole('button', { name: 'Quitar fila' })

    fireEvent.click(remove)
    expect(screen.queryByRole('region', { name: 'F' })).not.toBeInTheDocument()
    expect(row('E')).toBeInTheDocument()
    expect(names(row('Sin clasificar'))).toEqual(['Carta Effect Veiler', 'Carta Crossout Designator'])

    for (const label of ['E', 'D', 'C', 'B', 'A', 'S']) {
      expect(remove).toBeEnabled()
      fireEvent.click(remove)
      expect(screen.queryByRole('region', { name: label })).not.toBeInTheDocument()
    }

    expect(remove).toBeDisabled()
    expect(tiles(row('Sin clasificar'))).toHaveLength(2)

    for (let count = 0; count < 12; count += 1) fireEvent.click(add)

    expect(screen.getAllByRole('region', { name: 'Nueva' })).toHaveLength(12)
    expect(add).toBeDisabled()
    expect(remove).toBeEnabled()
  })
})

const dialog = () => within(screen.getByRole('dialog', { name: 'Editar fila' }))

describe('al final de cada fila, el engranaje y el agarre (Gastón, 2026-10-21: «en las tierlists nos faltan esas opciones al final»)', () => {
  it('cada fila lleva, después de sus cartas, el engranaje y el agarre con el nombre de la fila; «Sin clasificar» no lleva ninguno', () => {
    seed()
    render(<TierMakerScreen />)
    moveTo('Crossout Designator', 'S')

    const gear = within(row('S')).getByRole('button', { name: 'Ajustes de la fila S' })
    const grip = within(row('S')).getByRole('button', { name: 'Mover la fila S' })
    const after = (a: Node, b: Node) => Boolean(a.compareDocumentPosition(b) & Node.DOCUMENT_POSITION_FOLLOWING)

    expect(after(tiles(row('S'))[0] as HTMLElement, gear)).toBe(true)
    expect(after(gear, grip)).toBe(true)
    expect(grip).toHaveAccessibleDescription('Arrastrala para cambiarla de lugar, o usá ↑ y ↓.')
    // Sólo el agarre deja de desplazar la página con el dedo: el resto de la fila no.
    expect(grip).toHaveClass('touch-none')
    expect(row('S').querySelector('.touch-none')).toBe(grip)

    for (const label of ['A', 'B', 'C', 'D', 'E', 'F']) expect(within(row(label)).getByRole('button', { name: `Ajustes de la fila ${label}` })).toBeInTheDocument()

    expect(within(row('Sin clasificar')).queryByRole('button', { name: /^Ajustes|^Mover la fila/ })).not.toBeInTheDocument()
  })

  it('el engranaje abre el mismo menú que la letra de la fila', () => {
    render(<TierMakerScreen />)

    fireEvent.click(screen.getByRole('button', { name: 'Ajustes de la fila B' }))
    expect(dialog().getByRole('textbox', { name: 'Nombre de la fila' })).toHaveValue('B')
    fireEvent.click(dialog().getByRole('button', { name: 'Listo' }))

    fireEvent.click(screen.getByRole('button', { name: 'Editar la fila B' }))
    expect(dialog().getByRole('textbox', { name: 'Nombre de la fila' })).toHaveValue('B')
  })

  it('el menú: catorce colores (el elegido marcado), y agregar arriba o abajo, vaciar y quitar la fila; ya no tiene las flechas de subir y bajar', () => {
    render(<TierMakerScreen />)
    fireEvent.click(screen.getByRole('button', { name: 'Ajustes de la fila S' }))

    const colors = within(dialog().getByRole('group', { name: 'Color' })).getAllByRole('button')

    expect(colors).toHaveLength(14)
    expect(colors.filter((color) => color.getAttribute('aria-pressed') === 'true').map((color) => color.getAttribute('aria-label'))).toEqual(['Color #ff7f7f'])

    // Uno de los nuevos: el gris oscuro, con la letra clara.
    fireEvent.click(dialog().getByRole('button', { name: 'Color #3b3b3b' }))
    expect(dialog().getByRole('button', { name: 'Color #3b3b3b' })).toHaveAttribute('aria-pressed', 'true')
    expect(screen.getByRole('button', { name: 'Editar la fila S' })).toHaveClass('text-foreground')

    for (const name of ['Agregar una fila arriba', 'Agregar una fila abajo', 'Vaciar la fila', 'Quitar la fila']) expect(dialog().getByRole('button', { name })).toBeInTheDocument()
    for (const name of ['Subir la fila', 'Bajar la fila']) expect(dialog().queryByRole('button', { name })).not.toBeInTheDocument()
  })

  it('«Agregar una fila arriba» y «abajo» la ponen ahí y cierran el menú', async () => {
    render(<TierMakerScreen />)

    fireEvent.click(screen.getByRole('button', { name: 'Ajustes de la fila B' }))
    fireEvent.click(dialog().getByRole('button', { name: 'Agregar una fila arriba' }))
    expect(order()).toEqual(['S', 'A', 'Nueva', 'B', 'C', 'D', 'E', 'F'])
    // El menú puede animar su salida: se espera a que se vaya.
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())

    fireEvent.click(screen.getByRole('button', { name: 'Ajustes de la fila F' }))
    fireEvent.click(dialog().getByRole('button', { name: 'Agregar una fila abajo' }))
    expect(order()).toEqual(['S', 'A', 'Nueva', 'B', 'C', 'D', 'E', 'F', 'Nueva'])
  })

  it('con 12 filas, agregar se apaga y el menú dice por qué', () => {
    render(<TierMakerScreen />)

    for (let count = 0; count < 5; count += 1) fireEvent.click(screen.getByRole('button', { name: 'Agregar fila' }))

    fireEvent.click(screen.getByRole('button', { name: 'Ajustes de la fila S' }))
    expect(dialog().getByRole('button', { name: 'Agregar una fila arriba' })).toBeDisabled()
    expect(dialog().getByRole('button', { name: 'Agregar una fila abajo' })).toBeDisabled()
    expect(dialog().getByText('Ya hay 12 filas, el tope: quitá una para agregar otra.')).toBeInTheDocument()
  })

  it('«Vaciar la fila» manda sus cartas a «Sin clasificar» y la fila queda; vacía, el botón se apaga', () => {
    seed()
    render(<TierMakerScreen />)
    moveTo('Crossout Designator', 'A')
    moveTo('Effect Veiler', 'A')

    fireEvent.click(screen.getByRole('button', { name: 'Ajustes de la fila A' }))
    fireEvent.click(dialog().getByRole('button', { name: 'Vaciar la fila' }))
    expect(tiles(row('A'))).toHaveLength(0)
    expect(names(row('Sin clasificar'))).toEqual(['Carta Crossout Designator', 'Carta Effect Veiler'])
    expect(order()).toEqual(['S', 'A', 'B', 'C', 'D', 'E', 'F'])

    fireEvent.click(screen.getByRole('button', { name: 'Ajustes de la fila A' }))
    expect(dialog().getByRole('button', { name: 'Vaciar la fila' })).toBeDisabled()
  })

  it('«Quitar la fila» la saca (sus cartas vuelven a «Sin clasificar») y el foco pasa a la fila que quedó en su lugar, no a la página', async () => {
    seed()
    render(<TierMakerScreen />)
    moveTo('Crossout Designator', 'A')

    const gear = screen.getByRole('button', { name: 'Ajustes de la fila A' })

    gear.focus()
    fireEvent.click(gear)
    fireEvent.click(dialog().getByRole('button', { name: 'Quitar la fila' }))

    expect(order()).toEqual(['S', 'B', 'C', 'D', 'E', 'F'])
    expect(names(row('Sin clasificar'))).toEqual(['Carta Effect Veiler', 'Carta Crossout Designator'])
    await waitFor(() => expect(screen.getByRole('button', { name: 'Editar la fila B' })).toHaveFocus())
  })

  it('con el teclado, ↑ y ↓ en el agarre mueven la fila de a un lugar, el foco se queda en el agarre y se anuncia dónde quedó; en las puntas no pasa nada', () => {
    render(<TierMakerScreen />)

    const grip = screen.getByRole('button', { name: 'Mover la fila S' })

    grip.focus()
    fireEvent.keyDown(grip, { key: 'ArrowUp' })
    expect(order()[0]).toBe('S')

    fireEvent.keyDown(grip, { key: 'ArrowDown' })
    expect(order().slice(0, 3)).toEqual(['A', 'S', 'B'])
    expect(screen.getByRole('button', { name: 'Mover la fila S' })).toHaveFocus()
    expect(screen.getByText('Fila S: lugar 2 de 7.')).toHaveAttribute('aria-live', 'polite')

    fireEvent.keyDown(screen.getByRole('button', { name: 'Mover la fila S' }), { key: 'ArrowDown' })
    fireEvent.keyDown(screen.getByRole('button', { name: 'Mover la fila S' }), { key: 'ArrowUp' })
    expect(order().slice(0, 3)).toEqual(['A', 'S', 'B'])
    expect(screen.getByRole('button', { name: 'Mover la fila S' })).toHaveFocus()
  })

  it('el orden nuevo se guarda: al volver, las filas están como se dejaron', () => {
    const first = render(<TierMakerScreen />)

    fireEvent.keyDown(screen.getByRole('button', { name: 'Mover la fila F' }), { key: 'ArrowUp' })
    first.unmount()

    render(<TierMakerScreen />)
    expect(order()).toEqual(['S', 'A', 'B', 'C', 'D', 'F', 'E'])
  })

  describe('el arrastre de las filas y el de las cartas no se mezclan', () => {
    const originals = {
      offsetTop: Object.getOwnPropertyDescriptor(HTMLElement.prototype, 'offsetTop'),
      offsetHeight: Object.getOwnPropertyDescriptor(HTMLElement.prototype, 'offsetHeight'),
    }

    beforeEach(() => {
      // jsdom no hace layout: cada caja de fila mide 98 px con 2 de aire, una abajo de la otra.
      const index = (element: HTMLElement) => [...(element.parentElement?.querySelectorAll(':scope > [data-tier-row]') ?? [])].indexOf(element)

      Object.defineProperty(HTMLElement.prototype, 'offsetTop', { configurable: true, get(this: HTMLElement) { return this.dataset.tierRow ? index(this) * 100 : 0 } })
      Object.defineProperty(HTMLElement.prototype, 'offsetHeight', { configurable: true, get(this: HTMLElement) { return this.dataset.tierRow ? 98 : 0 } })
      HTMLElement.prototype.setPointerCapture = () => {}
    })

    afterEach(() => {
      for (const [name, descriptor] of Object.entries(originals)) {
        if (descriptor) Object.defineProperty(HTMLElement.prototype, name, descriptor)
        else Reflect.deleteProperty(HTMLElement.prototype, name)
      }
    })

    it('arrastrar una fila con el mouse la cambia de lugar con sus cartas, y ninguna carta cambia de fila', () => {
      seed()
      render(<TierMakerScreen />)
      moveTo('Crossout Designator', 'S')

      const grip = screen.getByRole('button', { name: 'Mover la fila S' })

      // De la mitad de S (49 px) a 260: su centro pasa los de A (149) y B (249).
      fireEvent.pointerDown(grip, { pointerId: 7, pointerType: 'mouse', button: 0, clientY: 49 })
      fireEvent.pointerMove(grip, { pointerId: 7, pointerType: 'mouse', clientY: 160 })
      fireEvent.pointerMove(grip, { pointerId: 7, pointerType: 'mouse', clientY: 260 })
      fireEvent.pointerUp(grip, { pointerId: 7, pointerType: 'mouse', clientY: 260 })

      expect(order()).toEqual(['A', 'B', 'S', 'C', 'D', 'E', 'F'])
      expect(names(row('S'))).toEqual(['Carta Crossout Designator'])
      expect(names(row('Sin clasificar'))).toEqual(['Carta Effect Veiler'])
    })

    it('un clic en el agarre sin mover no mueve nada, y el botón derecho no arrastra', () => {
      render(<TierMakerScreen />)

      const grip = screen.getByRole('button', { name: 'Mover la fila S' })

      fireEvent.pointerDown(grip, { pointerId: 8, pointerType: 'mouse', button: 0, clientY: 49 })
      fireEvent.pointerMove(grip, { pointerId: 8, pointerType: 'mouse', clientY: 51 })
      fireEvent.pointerUp(grip, { pointerId: 8, pointerType: 'mouse', clientY: 51 })
      fireEvent.pointerDown(grip, { pointerId: 9, pointerType: 'mouse', button: 2, clientY: 49 })
      fireEvent.pointerMove(grip, { pointerId: 9, pointerType: 'mouse', clientY: 400 })
      fireEvent.pointerUp(grip, { pointerId: 9, pointerType: 'mouse', clientY: 400 })

      expect(order()).toEqual(['S', 'A', 'B', 'C', 'D', 'E', 'F'])
    })

    it('soltar una carta sobre una fila (o sobre su agarre, que es parte de la fila) mueve la carta y no reordena las filas', () => {
      seed()

      const layout = mockTierLayout()

      try {
        render(<TierMakerScreen />)

        mouseDrag(tiles(row('Sin clasificar'))[0] as HTMLElement, centerOf(zoneOf('C')))
        expect(names(row('C'))).toEqual(['Carta Crossout Designator'])

        // El agarre va en la columna del final de la fila, a la derecha de todo: la carta queda al final de A y las filas, como estaban.
        const grip = screen.getByRole('button', { name: 'Mover la fila A' })

        mouseDrag(tiles(row('Sin clasificar'))[0] as HTMLElement, { x: TIER_LAYOUT.width - 5, y: centerOf(zoneOf('A')).y })

        expect(order()).toEqual(['S', 'A', 'B', 'C', 'D', 'E', 'F'])
        expect(names(row('A'))).toEqual(['Carta Effect Veiler'])
        expect(tiles(row('Sin clasificar'))).toHaveLength(0)
        expect(grip).not.toHaveAttribute('data-active')
      } finally {
        layout.restore()
      }
    })
  })
})
