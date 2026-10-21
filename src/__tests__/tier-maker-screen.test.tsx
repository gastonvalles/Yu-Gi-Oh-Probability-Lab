// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import '@testing-library/jest-dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { TIERLIST_STORAGE_KEY, TIERLIST_VERSION, addCards, newList, writeStore, type MakerCard } from '../app/tierlist-maker'
import { TierMakerScreen } from '../components/meta/TierMakerScreen'

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

  it('se arrastra una carta a una fila y entre las de una fila (para ordenarlas)', () => {
    seed()
    render(<TierMakerScreen />)

    const dataTransfer = { setData: vi.fn(), getData: () => '', effectAllowed: '', dropEffect: '' }
    const [first, second] = tiles(row('Sin clasificar')) as [HTMLElement, HTMLElement]
    const rowS = row('S').querySelector('ul') as HTMLElement

    fireEvent.dragStart(first, { dataTransfer })
    fireEvent.dragOver(rowS, { dataTransfer })
    fireEvent.drop(rowS, { dataTransfer })
    fireEvent.dragEnd(first, { dataTransfer })
    fireEvent.dragStart(second, { dataTransfer })
    fireEvent.dragOver(rowS, { dataTransfer })
    fireEvent.drop(rowS, { dataTransfer })

    expect(tiles(row('S')).map((tile) => tile.getAttribute('aria-label'))).toEqual(['Carta Crossout Designator', 'Carta Effect Veiler'])

    // Soltar la segunda sobre la primera la pone antes.
    const [a, b] = tiles(row('S')) as [HTMLElement, HTMLElement]

    fireEvent.dragStart(b, { dataTransfer })
    fireEvent.dragOver(a.parentElement as HTMLElement, { dataTransfer })
    fireEvent.drop(a.parentElement as HTMLElement, { dataTransfer })
    expect(tiles(row('S')).map((tile) => tile.getAttribute('aria-label'))).toEqual(['Carta Effect Veiler', 'Carta Crossout Designator'])
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

  it('las filas se suben, se bajan y se agregan', () => {
    render(<TierMakerScreen />)

    const order = () => [...document.querySelectorAll('section[aria-label]')].map((section) => section.getAttribute('aria-label')).slice(0, 3)

    fireEvent.click(screen.getByRole('button', { name: 'Editar la fila S' }))
    expect(within(screen.getByRole('dialog')).getByRole('button', { name: 'Subir la fila' })).toBeDisabled()
    fireEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Bajar la fila' }))
    expect(order()).toEqual(['A', 'S', 'B'])

    fireEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Listo' }))
    fireEvent.click(screen.getByRole('button', { name: 'Agregar fila' }))
    expect(row('Nueva')).toBeInTheDocument()
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
