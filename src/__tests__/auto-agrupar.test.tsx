// @vitest-environment jsdom
import { configureStore } from '@reduxjs/toolkit'
import { cleanup, fireEvent, render as renderBare, screen, within } from '@testing-library/react'
import '@testing-library/jest-dom'
import type { ReactElement } from 'react'
import { Provider } from 'react-redux'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { CardPicker, copyGroups, copyToToggle, pickPlace, type PickCard } from '../components/auto/CardPicker'
import { PileGroupContext, PileViewer } from '../components/probability/MatDialogs'

/**
 * Elegir varias en un solo cartel (M-03) y el visor de una pila (P-01): eligiendo una, las copias de la misma carta en el mismo lugar van juntas, con «×3»; eligiendo varias, cada copia es una
 * carta aparte, con su número de orden. Nunca en el campo. El visor junta sólo con `PileGroupContext` (apagado: la mesa manual no cambia).
 */
const store = configureStore({ reducer: { settings: (state = { handSize: 5, deckFormat: 'unlimited' as const }) => state } })
const render = (ui: ReactElement) => renderBare(ui, { wrapper: ({ children }) => <Provider store={store}>{children}</Provider> })

afterEach(cleanup)

const ash = (key: string): PickCard => ({ key, name: 'Ash Blossom', art: null, ...pickPlace('deck', false) })
const CARDS: PickCard[] = [ash('a1'), ash('a2'), ash('a3'), { key: 'v', name: 'Effect Veiler', art: null, ...pickPlace('hand', false) }]

describe('las copias juntas (puro)', () => {
  it('la misma carta en el mismo lugar es un grupo; en el campo o debajo de un Xyz, cada una va sola', () => {
    expect(copyGroups(CARDS).map((group) => group.map((card) => card.key))).toEqual([['a1', 'a2', 'a3'], ['v']])
    const field = (key: string): PickCard => ({ key, name: 'Ash Blossom', art: null, ...pickPlace('field', false) })
    expect(copyGroups([field('f1'), field('f2')])).toHaveLength(2)
    expect(copyGroups([ash('a1'), { ...ash('g1'), ...pickPlace('gy', false) }])).toHaveLength(2)
  })

  it('eligiendo una, el toque sobre el grupo suelta la elegida o toma la primera que se puede elegir', () => {
    const group = CARDS.slice(0, 3)

    expect(copyToToggle(group, [], () => true)).toBe('a1')
    expect(copyToToggle(group, ['a2'], () => true)).toBe('a2')
    expect(copyToToggle(group, ['v'], (card) => card.key === 'a3')).toBe('a3')
    expect(copyToToggle(group, [], () => false)).toBeNull()
  })
})

describe('M-03: elegir varias con copias', () => {
  it('cada copia es una carta: se eligen dos de la misma, con su número, «3 de 3» y una sola principal', () => {
    const onPick = vi.fn()
    render(<CardPicker title="Elegí 3 cartas" cards={CARDS} min={3} max={3} onPick={onPick} onCancel={() => {}} />)
    const dialog = screen.getByRole('dialog', { name: 'Elegí 3 cartas' })
    const options = within(dialog).getAllByRole('option')

    // La mano propia va primero; después, el Deck, una por copia y sin «×3».
    expect(options).toHaveLength(4)
    expect(dialog.querySelector('[data-pick-copies]')).toBeNull()
    expect(options[1]).not.toHaveAccessibleName(/copias/)

    fireEvent.click(options[1]!)
    fireEvent.click(options[0]!)
    fireEvent.click(options[3]!)
    expect(within(dialog).getByRole('status')).toHaveTextContent('3 de 3')
    expect(options[3]).toHaveTextContent('3')

    // Tocar una copia elegida la suelta a ella sola.
    fireEvent.click(options[1]!)
    expect(within(dialog).getByRole('status')).toHaveTextContent('2 de 3')
    const primary = within(dialog).getAllByRole('button').at(-1)!
    expect(primary).toBeDisabled()
    fireEvent.click(options[2]!)
    expect(primary).toBeEnabled()
    expect(within(dialog).getAllByRole('button').filter((button) => button.className.includes('bg-primary'))).toHaveLength(1)
    fireEvent.click(primary)
    expect(onPick).toHaveBeenCalledWith(['v', 'a3', 'a2'])
  })

  it('un `select_unselect_card` de 2 (cada toque contesta: `apart`): tres copias, y cada toque manda una copia distinta', () => {
    const onToggle = vi.fn()
    const ashes = CARDS.slice(0, 3)
    const picker = (chosen: string[]) => <CardPicker title="Elegí 2 cartas" cards={ashes} min={2} max={1} apart chosen={chosen} onToggle={onToggle} onPick={() => {}} />
    const { rerender } = render(picker([]))
    const options = () => within(screen.getByRole('dialog')).getAllByRole('option')

    expect(options()).toHaveLength(3)
    fireEvent.click(options()[0]!)
    rerender(picker(['a1']))
    fireEvent.click(options()[1]!)
    expect(onToggle.mock.calls.map(([key]) => key)).toEqual(['a1', 'a2'])
  })

  it('eligiendo una sola, las copias siguen juntas con «×3»', () => {
    const onPick = vi.fn()
    render(<CardPicker title="Elegí 1 carta" cards={CARDS} min={1} max={1} onPick={onPick} />)
    const ash = within(screen.getByRole('dialog')).getAllByRole('option')[1]!

    expect(ash).toHaveAccessibleName(/^Ash Blossom, 3 copias/)
    expect(ash.querySelector('[data-pick-copies]')).toHaveTextContent('×3')
    fireEvent.click(ash)
    expect(onPick).toHaveBeenCalledWith(['a1'])
  })
})

describe('P-01: el visor de una pila', () => {
  const ids = ['g1', 'g2', 'g3']
  const info = (id: string) => ({ name: id === 'g3' ? 'Nibiru' : 'Ash Blossom', art: null })
  const viewer = (onPick = () => {}) => <PileViewer pile="gy" ids={ids} info={info} targeted={new Set()} onPick={onPick} onClose={() => {}} />

  it('sin el contexto (la mesa manual), una por copia; con él, las copias juntas con «×2» y tocarlas abre la primera', () => {
    render(viewer())
    expect(screen.getAllByRole('button', { name: /Ash Blossom/ })).toHaveLength(2)
    expect(document.querySelector('[data-pile-copies]')).toBeNull()
    cleanup()

    const onPick = vi.fn()
    render(<PileGroupContext value>{viewer(onPick)}</PileGroupContext>)
    const group = screen.getByRole('button', { name: 'Ash Blossom, 2 copias' })

    expect(group.querySelector('[data-pile-copies]')).toHaveTextContent('×2')
    expect(screen.getByRole('button', { name: 'Nibiru' })).toBeInTheDocument()
    fireEvent.click(group)
    expect(onPick).toHaveBeenCalledWith('g2', expect.anything())
  })
})
