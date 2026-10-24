// @vitest-environment jsdom
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import '@testing-library/jest-dom'
import { configureStore } from '@reduxjs/toolkit'
import { Provider } from 'react-redux'
import { describe, expect, it, vi } from 'vitest'

import type { MatPile } from '../app/practice-mat'
import { PileViewer, type PileMany } from '../components/probability/MatDialogs'

// El aviso de límite de copias de la carta lee el formato del store.
const store = configureStore({ reducer: { settings: (state = { handSize: 5, deckFormat: 'unlimited' as const }) => state } })

const NAMES: Record<string, string> = {
  a: 'Ash Blossom',
  b: 'Maxx C',
  c: 'Droll',
  d: 'Lunalight Black Sheep',
  e: 'Lunalight Tiger',
  f: 'Effect Veiler',
  g: 'Lunalight Wolf',
  h: 'Called by the Grave',
  i: 'Lunalight Kaleido Chick',
}

interface Options {
  ids?: string[]
  /** null: el visor de siempre, sin «Elegir varias». */
  many?: Partial<PileMany> | null
  anonymous?: boolean
}

/** El Main se muestra en su orden (el tope primero): lo que se ve sale en el orden de `ids`. */
function open({ ids = ['a', 'b', 'c'], many = {}, anonymous = false }: Options = {}) {
  const onPick = vi.fn()
  const onPeek = vi.fn()
  const onClose = vi.fn()
  const pickMany = vi.fn()
  const viewer = (list: string[]) => (
    <Provider store={store}>
      <PileViewer
        pile="deck"
        ids={list}
        info={(id) => ({ name: anonymous ? 'Carta del rival' : (NAMES[id] ?? id), art: null })}
        targeted={new Set()}
        onPick={onPick}
        onPeek={onPeek}
        onClose={onClose}
        anonymous={anonymous}
        many={many === null ? undefined : { label: () => 'Elegir jugada', onPick: pickMany, ...many }}
      />
    </Provider>
  )
  const view = render(viewer(ids))

  return { dialog: within(screen.getByRole('dialog')), onPick, onPeek, onClose, pickMany, rerender: (list: string[]) => view.rerender(viewer(list)) }
}

type Dialog = ReturnType<typeof open>['dialog']

/** La carta por su nombre (eligiendo, el nombre suma el orden: «Droll (1.ª elegida)»). */
const card = (dialog: Dialog, name: string) => dialog.getByRole('button', { name: new RegExp(`^${name}`) })
const pressed = (dialog: Dialog) => dialog.queryAllByRole('button', { pressed: true }).map((button) => button.getAttribute('aria-label'))
const escape = () => fireEvent.keyDown(window, { key: 'Escape' })

describe('el visor de una pila elige varias cartas', () => {
  it('sin `many` no hay pie: tocar una carta abre su menú, como siempre', () => {
    const { dialog, onPick, onPeek } = open({ many: null })

    expect(document.querySelector('footer')).toBeNull()
    expect(dialog.queryByRole('button', { name: 'Elegir varias' })).not.toBeInTheDocument()

    fireEvent.click(card(dialog, 'Maxx C'))
    expect(onPick).toHaveBeenCalledWith('b', expect.anything())
    expect(onPeek).toHaveBeenCalledWith('b')
    expect(card(dialog, 'Maxx C')).not.toHaveAttribute('aria-pressed')
  })

  it('con una sola carta (o ninguna) tampoco hay pie', () => {
    open({ ids: ['a'] })

    expect(document.querySelector('footer')).toBeNull()
    expect(screen.queryByRole('button', { name: 'Elegir varias' })).not.toBeInTheDocument()
  })

  it('«Elegir varias» lleva el foco a la primera carta; tocar elige o suelta, con aria-pressed y el orden, y «N elegidas» lo anuncia', async () => {
    const { dialog, onPick, onPeek } = open()

    // El visor pone su foco inicial (la primera carta) en el cuadro siguiente: se espera y se lo lleva a otro lado antes de entrar al modo.
    await waitFor(() => expect(card(dialog, 'Ash Blossom')).toHaveFocus())
    dialog.getByRole('button', { name: 'Cerrar' }).focus()
    fireEvent.click(dialog.getByRole('button', { name: 'Elegir varias' }))
    expect(card(dialog, 'Ash Blossom')).toHaveFocus()
    expect(card(dialog, 'Ash Blossom')).toHaveAttribute('aria-pressed', 'false')

    fireEvent.click(card(dialog, 'Droll'))
    fireEvent.click(card(dialog, 'Ash Blossom'))
    expect(pressed(dialog)).toEqual(['Ash Blossom (2.ª elegida)', 'Droll (1.ª elegida)'])
    expect(within(card(dialog, 'Droll')).getByText('1')).toBeInTheDocument()
    expect(dialog.getByRole('status')).toHaveTextContent('2 elegidas')

    // Soltar una corre el orden de las que siguen.
    fireEvent.click(card(dialog, 'Droll'))
    expect(pressed(dialog)).toEqual(['Ash Blossom (1.ª elegida)'])
    expect(dialog.getByRole('status')).toHaveTextContent('1 elegida')
    // Eligiendo, tocar no abre el menú de la carta, pero sí la muestra en el detalle.
    expect(onPick).not.toHaveBeenCalled()
    expect(onPeek.mock.calls.map(([id]) => id)).toEqual(['c', 'a', 'c'])
  })

  it('con nada elegido la principal está apagada y el pie dice por qué; el pie es el mismo pie en los dos modos', () => {
    const { dialog, pickMany } = open({ many: { start: [] } })
    const main = dialog.getByRole('button', { name: 'Elegir jugada' })

    expect(main).toBeDisabled()
    expect(dialog.getByRole('status')).toHaveTextContent('Tocá las que quieras')
    expect(main).toHaveAttribute('aria-describedby', dialog.getByRole('status').id)
    fireEvent.click(main)
    expect(pickMany).not.toHaveBeenCalled()

    fireEvent.click(card(dialog, 'Maxx C'))
    expect(main).toBeEnabled()
  })

  it('la principal le pasa las elegidas en el orden en que se eligieron (y dónde está el botón); la elección queda como estaba', () => {
    const { dialog, pickMany } = open({ many: { label: (ids) => `Jugar ${ids.length}` } })

    fireEvent.click(dialog.getByRole('button', { name: 'Elegir varias' }))
    fireEvent.click(card(dialog, 'Droll'))
    fireEvent.click(card(dialog, 'Ash Blossom'))
    fireEvent.click(dialog.getByRole('button', { name: 'Jugar 2' }))

    expect(pickMany).toHaveBeenCalledTimes(1)
    expect(pickMany.mock.calls[0]![0]).toEqual(['c', 'a'])
    expect(pickMany.mock.calls[0]![1]).toHaveProperty('top')
    // El menú del lote lo abre quien abrió el visor: cerrarlo sin elegir deja la elección intacta.
    expect(pressed(dialog)).toEqual(['Ash Blossom (2.ª elegida)', 'Droll (1.ª elegida)'])
  })

  it('Mayús+clic elige el tramo desde la última tocada, en el orden que se ve y hacia los dos lados', () => {
    const { dialog, pickMany } = open({ ids: ['a', 'b', 'c', 'd', 'e'], many: { start: [] } })

    fireEvent.click(card(dialog, 'Maxx C'))
    fireEvent.click(card(dialog, 'Lunalight Tiger'), { shiftKey: true })
    fireEvent.click(dialog.getByRole('button', { name: 'Elegir jugada' }))
    expect(pickMany.mock.calls[0]![0]).toEqual(['b', 'c', 'd', 'e'])

    // Desde la última (Lunalight Tiger) hacia atrás: suma la que falta (Ash Blossom) sin repetir las que ya estaban.
    fireEvent.click(card(dialog, 'Ash Blossom'), { shiftKey: true })
    fireEvent.click(dialog.getByRole('button', { name: 'Elegir jugada' }))
    expect(pickMany.mock.calls[1]![0]).toEqual(['b', 'c', 'd', 'e', 'a'])
  })

  it('«Elegir todas» elige sólo las que se ven con el filtro puesto y pasa a «Quitar elección», que las suelta', () => {
    const { dialog } = open({ ids: Object.keys(NAMES), many: { start: [] } })

    fireEvent.change(dialog.getByRole('searchbox', { name: 'Buscar carta' }), { target: { value: 'luna' } })
    fireEvent.click(dialog.getByRole('button', { name: 'Elegir todas' }))
    expect(dialog.getByRole('status')).toHaveTextContent('4 elegidas')
    expect(dialog.getByRole('button', { name: 'Quitar elección' })).toBeInTheDocument()

    // Sin el filtro, las otras no se eligieron.
    fireEvent.change(dialog.getByRole('searchbox', { name: 'Buscar carta' }), { target: { value: '' } })
    expect(card(dialog, 'Ash Blossom')).toHaveAttribute('aria-pressed', 'false')
    expect(dialog.getByRole('button', { name: 'Elegir todas' })).toBeInTheDocument()

    fireEvent.change(dialog.getByRole('searchbox', { name: 'Buscar carta' }), { target: { value: 'luna' } })
    fireEvent.click(dialog.getByRole('button', { name: 'Quitar elección' }))
    expect(pressed(dialog)).toEqual([])
  })

  it('fuera del modo «Elegir todas» no está, y con ocho cartas o menos tampoco (no hay buscador)', () => {
    const { dialog } = open({ ids: Object.keys(NAMES) })

    expect(dialog.getByRole('searchbox', { name: 'Buscar carta' })).toBeInTheDocument()
    expect(dialog.queryByRole('button', { name: 'Elegir todas' })).not.toBeInTheDocument()
  })

  it('Escape en dos tiempos: el primero sale del modo (sin elección y con el foco en «Elegir varias»), el segundo cierra el visor', () => {
    const { dialog, onClose } = open({ many: { start: ['b'] } })

    escape()
    expect(onClose).not.toHaveBeenCalled()
    expect(dialog.queryAllByRole('button', { pressed: true })).toEqual([])
    expect(dialog.getByRole('button', { name: 'Elegir varias' })).toHaveFocus()
    expect(card(dialog, 'Maxx C')).not.toHaveAttribute('aria-pressed')

    escape()
    expect(onClose).toHaveBeenCalledTimes(1)
  })

  it('«Cancelar» sale del modo sin cerrar el visor', () => {
    const { dialog, onClose } = open({ many: { start: ['a', 'b'] } })

    fireEvent.click(dialog.getByRole('button', { name: 'Cancelar' }))
    expect(onClose).not.toHaveBeenCalled()
    expect(dialog.getByRole('button', { name: 'Elegir varias' })).toHaveFocus()
    expect(dialog.queryByRole('button', { name: 'Elegir jugada' })).not.toBeInTheDocument()
  })

  it('si la pila cambia por debajo, la elección se recorta a las que siguen; con menos de dos cartas se sale del modo', () => {
    const { dialog, pickMany, rerender } = open({ many: { start: ['c', 'a'] } })

    rerender(['a', 'b'])
    expect(dialog.getByRole('status')).toHaveTextContent('1 elegida')
    fireEvent.click(dialog.getByRole('button', { name: 'Elegir jugada' }))
    expect(pickMany).toHaveBeenCalledWith(['a'], expect.anything())

    rerender(['a'])
    expect(document.querySelector('footer')).toBeNull()
    expect(card(dialog, 'Ash Blossom')).not.toHaveAttribute('aria-pressed')
  })

  it('el visor del rival (sin nombres) elige igual: el nombre accesible dice el orden y la principal recibe lo elegido', () => {
    const { dialog, pickMany } = open({ anonymous: true, ids: ['x', 'y'], many: { label: (ids) => (ids.length === 2 ? 'Quitar target' : 'Target') } })

    fireEvent.click(dialog.getByRole('button', { name: 'Elegir varias' }))
    const [first, second] = dialog.getAllByRole('button', { name: /^Carta del rival/ })

    fireEvent.click(second!)
    expect(second).toHaveAccessibleName('Carta del rival (1.ª elegida)')
    expect(first).toHaveAttribute('aria-pressed', 'false')
    fireEvent.click(dialog.getByRole('button', { name: 'Target' }))
    expect(pickMany).toHaveBeenCalledWith(['y'], expect.anything())

    fireEvent.click(first!)
    expect(dialog.getByRole('button', { name: 'Quitar target' })).toBeInTheDocument()
  })
})

describe('el visor no es un modal: no tapa el campo', () => {
  const viewer = (pile: MatPile | null, onClose = () => {}) => (
    <Provider store={store}>
      <button type="button">GY: 3</button>
      <PileViewer pile={pile} ids={pile ? ['a', 'b', 'c'] : []} info={(id) => ({ name: NAMES[id] ?? id, art: null })} targeted={new Set()} onPick={() => {}} onClose={onClose} />
    </Provider>
  )

  it('sin aria-modal ni trampa: el foco entra a la primera carta, Tab sale a la mesa y, al cerrarse, vuelve a la pila que lo abrió', async () => {
    const view = render(viewer(null))
    const pile = screen.getByRole('button', { name: 'GY: 3' })

    pile.focus()
    view.rerender(viewer('gy'))
    const panel = screen.getByRole('dialog', { name: 'GY · 3' })

    expect(panel).not.toHaveAttribute('aria-modal')
    await waitFor(() => expect(within(panel).getByRole('button', { name: 'Droll' })).toHaveFocus())
    // El Tab no da la vuelta adentro del panel (no hay quien lo frene): lo hace el navegador.
    expect(fireEvent.keyDown(document, { key: 'Tab' })).toBe(true)

    view.rerender(viewer(null))
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    expect(pile).toHaveFocus()
  })

  it('en el celular, tocar afuera de la hoja la cierra (sin velo: el fondo es transparente); el click que sigue a un toque que la abrió, no', () => {
    const onClose = vi.fn()

    render(viewer('gy', onClose))
    const backdrop = document.querySelector<HTMLElement>('.fixed.inset-0')!

    // Un click suelto (el que el celular manda después del toque que la abrió): el toque no empezó en el fondo.
    fireEvent.click(backdrop)
    expect(onClose).not.toHaveBeenCalled()
    expect(backdrop.className).not.toMatch(/bg-/)

    fireEvent.pointerDown(backdrop)
    fireEvent.click(backdrop)
    expect(onClose).toHaveBeenCalledTimes(1)
  })

  it('pasar el mouse por una carta avisa cuál (la mesa la muestra en el detalle de la izquierda); el dedo no, porque tocar ya la fija', () => {
    const onHover = vi.fn()

    render(
      <Provider store={store}>
        <PileViewer pile="gy" ids={['a', 'b']} info={(id) => ({ name: NAMES[id] ?? id, art: null })} targeted={new Set()} onPick={() => {}} onHover={onHover} onClose={() => {}} />
      </Provider>,
    )
    const maxx = screen.getByRole('button', { name: 'Maxx C' })

    fireEvent.pointerEnter(maxx, { pointerType: 'touch' })
    expect(onHover).not.toHaveBeenCalled()
    fireEvent.pointerEnter(maxx, { pointerType: 'mouse' })
    expect(onHover).toHaveBeenCalledWith('b')
  })
})

describe('el visor queda montado (así sale al cerrarse): arranca de cero al abrirse, no al cerrarse ni al esconderse', () => {
  const ALL = Object.keys(NAMES)
  const viewer = (pile: MatPile | null, { hidden = false, start }: { hidden?: boolean; start?: string[] } = {}) => (
    <Provider store={store}>
      <PileViewer pile={pile} hidden={hidden} ids={pile ? ALL : []} info={(id) => ({ name: NAMES[id] ?? id, art: null })} targeted={new Set()} onPick={() => {}} onClose={() => {}} many={{ label: () => 'Elegir jugada', onPick: () => {}, start }} />
    </Provider>
  )
  const dialog = () => within(screen.getByRole('dialog'))
  const search = () => dialog().getByRole('searchbox', { name: 'Buscar carta' })

  it('escondido (la pausa del duelo) no se ve ni atiende Escape, y al destaparse sigue como estaba: lo buscado y lo elegido', () => {
    const view = render(viewer('deck'))

    fireEvent.change(search(), { target: { value: 'luna' } })
    fireEvent.click(dialog().getByRole('button', { name: 'Elegir varias' }))
    fireEvent.click(card(dialog(), 'Lunalight Tiger'))

    view.rerender(viewer('deck', { hidden: true }))
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    escape()

    view.rerender(viewer('deck'))
    expect(search()).toHaveValue('luna')
    expect(pressed(dialog())).toEqual(['Lunalight Tiger (1.ª elegida)'])
  })

  it('cerrado y abierto otra vez (la misma pila u otra) arranca sin lo buscado ni lo elegido y, con `many.start`, eligiendo ésas', () => {
    const view = render(viewer('deck'))

    fireEvent.change(search(), { target: { value: 'luna' } })
    fireEvent.click(dialog().getByRole('button', { name: 'Elegir varias' }))
    fireEvent.click(card(dialog(), 'Lunalight Tiger'))
    view.rerender(viewer(null))
    view.rerender(viewer('deck'))
    expect(search()).toHaveValue('')
    expect(dialog().queryByRole('button', { name: 'Elegir jugada' })).not.toBeInTheDocument()

    fireEvent.change(search(), { target: { value: 'luna' } })
    view.rerender(viewer(null))
    view.rerender(viewer('gy', { start: ['b', 'a'] }))
    expect(search()).toHaveValue('')
    // El cementerio, la más reciente primero: Maxx C se ve antes que Ash Blossom.
    expect(pressed(dialog())).toEqual(['Maxx C (1.ª elegida)', 'Ash Blossom (2.ª elegida)'])
  })
})
