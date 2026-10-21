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

    for (const name of ['Hand traps del meta', 'Boardbreakers del meta', /Volver todo a/, 'Descargar imagen', 'Agregar fila']) {
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

    fireEvent.click(dialog.getByRole('button', { name: 'Borrar la fila' }))
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
