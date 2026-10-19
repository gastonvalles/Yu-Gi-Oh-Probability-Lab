// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import '@testing-library/jest-dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { TIERLIST_STORAGE_KEY, type MakerCard } from '../app/tierlist-maker'
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
const addDeck = () => fireEvent.click(screen.getByRole('button', { name: 'Mi deck (2)' }))

describe('el creador de tier lists', () => {
  it('arranca con las filas S a F de siempre, vacías, y la bandeja de las cartas sin clasificar', () => {
    render(<TierMakerScreen deckCards={deck} />)

    for (const label of ['S', 'A', 'B', 'C', 'D', 'E', 'F']) expect(row(label)).toBeInTheDocument()

    expect(row('Sin clasificar')).toBeInTheDocument()
    expect(tiles()).toHaveLength(0)
    expect(screen.getByText(/Todavía no hay cartas/)).toBeInTheDocument()
  })

  it('las cartas del deck entran de un toque a la bandeja, sin repetirse, y se avisa cuántas', () => {
    render(<TierMakerScreen deckCards={deck} />)

    addDeck()
    expect(tiles(row('Sin clasificar'))).toHaveLength(2)
    expect(toast).toHaveBeenLastCalledWith('Agregué 2 cartas.', 'success')

    addDeck()
    expect(tiles(row('Sin clasificar'))).toHaveLength(2)
    expect(toast).toHaveBeenLastCalledWith('Esas cartas ya estaban en la lista.', 'info')
  })

  it('el buscador trae cartas por nombre y tocar una la suma a la bandeja (y queda marcada como ya agregada)', async () => {
    render(<TierMakerScreen deckCards={deck} />)

    fireEvent.change(screen.getByRole('searchbox', { name: 'Buscar una carta por nombre' }), { target: { value: 'ash' } })
    fireEvent.click(await screen.findByRole('button', { name: 'Agregar Ash Blossom & Joyous Spring' }))

    expect(tiles(row('Sin clasificar'))).toHaveLength(1)
    await waitFor(() => expect(screen.getByRole('button', { name: 'Ash Blossom & Joyous Spring ya está en la lista' })).toBeDisabled())
  })

  it('con una carta elegida, la barra tiene un botón por fila: tocar uno la manda ahí, y de ahí se la manda a la bandeja', () => {
    render(<TierMakerScreen deckCards={deck} />)
    addDeck()

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
    render(<TierMakerScreen deckCards={deck} />)
    addDeck()

    const rowA = row('A').querySelector('ul') as HTMLElement

    fireEvent.click(rowA)
    expect(tiles(row('A'))).toHaveLength(0)

    fireEvent.click(tiles(row('Sin clasificar'))[0] as HTMLElement)
    fireEvent.click(rowA)
    expect(tiles(row('A'))).toHaveLength(1)
  })

  it('se arrastra una carta a una fila y entre las de una fila (para ordenarlas)', () => {
    render(<TierMakerScreen deckCards={deck} />)
    addDeck()

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
    render(<TierMakerScreen deckCards={deck} />)
    addDeck()
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
    render(<TierMakerScreen deckCards={deck} />)

    const order = () => [...document.querySelectorAll('section[aria-label]')].map((section) => section.getAttribute('aria-label')).slice(0, 3)

    fireEvent.click(screen.getByRole('button', { name: 'Editar la fila S' }))
    expect(within(screen.getByRole('dialog')).getByRole('button', { name: 'Subir la fila' })).toBeDisabled()
    fireEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Bajar la fila' }))
    expect(order()).toEqual(['A', 'S', 'B'])

    fireEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Listo' }))
    fireEvent.click(screen.getByRole('button', { name: 'Agregar fila' }))
    expect(row('Nueva')).toBeInTheDocument()
  })

  it('varias listas: crear, nombrar, cambiar de una a otra y eliminar (con confirmación)', () => {
    render(<TierMakerScreen deckCards={deck} />)
    addDeck()

    fireEvent.click(screen.getByRole('button', { name: 'Nueva lista' }))

    const select = screen.getByRole('combobox', { name: 'Tus tier lists' })

    expect(within(select).getAllByRole('option')).toHaveLength(2)
    // La nueva está vacía y es la que se ve.
    expect(tiles()).toHaveLength(0)
    fireEvent.change(screen.getByRole('textbox', { name: 'Nombre de la tier list' }), { target: { value: 'Meta de octubre' } })
    expect(within(select).getByRole('option', { name: 'Meta de octubre' })).toBeInTheDocument()

    fireEvent.change(select, { target: { value: (within(select).getAllByRole('option')[0] as HTMLOptionElement).value } })
    expect(tiles(row('Sin clasificar'))).toHaveLength(2)

    fireEvent.click(screen.getByRole('button', { name: 'Eliminar lista' }))
    expect(screen.getByRole('alertdialog')).toHaveTextContent('Se borra la lista con sus filas y sus cartas')
    fireEvent.click(within(screen.getByRole('alertdialog')).getByRole('button', { name: 'Eliminar lista' }))
    expect(within(screen.getByRole('combobox', { name: 'Tus tier lists' })).getAllByRole('option')).toHaveLength(1)
    expect(screen.getByRole('textbox', { name: 'Nombre de la tier list' })).toHaveValue('Meta de octubre')
  })

  it('se guarda sola en el navegador: al volver, está como se dejó', () => {
    const first = render(<TierMakerScreen deckCards={deck} />)

    addDeck()
    fireEvent.click(tiles(row('Sin clasificar'))[1] as HTMLElement)
    fireEvent.click(screen.getByRole('button', { name: 'Mover Effect Veiler a B' }))
    expect(localStorage.getItem(TIERLIST_STORAGE_KEY)).toContain('Effect Veiler')
    first.unmount()

    render(<TierMakerScreen deckCards={deck} />)
    expect(tiles(row('B')).map((tile) => tile.getAttribute('aria-label'))).toEqual(['Carta Effect Veiler'])
    expect(tiles(row('Sin clasificar'))).toHaveLength(1)
  })

  it('«Volver todo a Sin clasificar» saca las cartas de las filas sin borrar las filas', () => {
    render(<TierMakerScreen deckCards={deck} />)
    addDeck()
    fireEvent.click(tiles(row('Sin clasificar'))[0] as HTMLElement)
    fireEvent.click(screen.getByRole('button', { name: 'Mover Crossout Designator a A' }))

    fireEvent.click(screen.getByRole('button', { name: /Volver todo a/ }))
    expect(tiles(row('A'))).toHaveLength(0)
    expect(tiles(row('Sin clasificar'))).toHaveLength(2)
  })

  it('copia la lista como texto, y descargar la imagen sin cartas en las filas avisa en vez de armar una imagen vacía', async () => {
    const writeText = vi.fn(async () => undefined)

    Object.defineProperty(navigator, 'clipboard', { value: { writeText }, configurable: true })
    render(<TierMakerScreen deckCards={deck} />)
    addDeck()
    fireEvent.click(tiles(row('Sin clasificar'))[0] as HTMLElement)
    fireEvent.click(screen.getByRole('button', { name: 'Mover Crossout Designator a S' }))

    fireEvent.click(screen.getByRole('button', { name: 'Copiar texto' }))
    await waitFor(() => expect(writeText).toHaveBeenCalledTimes(1))
    expect(String((writeText.mock.calls[0] as unknown[])[0])).toContain('S: Crossout Designator')
    expect(toast).toHaveBeenLastCalledWith('Copié la tier list como texto.', 'success')

    fireEvent.click(screen.getByRole('button', { name: 'Volver todo a «Sin clasificar»' }))
    fireEvent.click(screen.getByRole('button', { name: 'Descargar imagen' }))
    expect(toast).toHaveBeenLastCalledWith('Poné alguna carta en una fila para armar la imagen.', 'info')
  })
})
