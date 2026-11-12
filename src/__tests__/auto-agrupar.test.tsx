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
 * Elegir varias en un solo cartel (M-03) y el visor de una pila (P-01): las copias de la misma carta en el mismo lugar van juntas, con «×3»; tocar el grupo suma la próxima copia, que lleva su
 * número de orden; lleno, el toque suelta la última (decisión 7). Nunca en el campo. El visor junta sólo con `PileGroupContext` (apagado: la mesa manual no cambia).
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

  it('el toque suma la próxima libre hasta el tope; lleno, suelta la última del grupo; eligiendo una, la elegida', () => {
    const open = () => true
    const group = CARDS.slice(0, 3)

    expect(copyToToggle(group, [], true, open, 3)).toBe('a1')
    expect(copyToToggle(group, ['a1', 'v'], true, open, 3)).toBe('a2')
    expect(copyToToggle(group, ['a2', 'v', 'a1'], true, open, 3)).toBe('a1')
    expect(copyToToggle(group, ['a1', 'a2', 'a3'], true, open, 3)).toBe('a3')
    expect(copyToToggle(group, ['a2'], false, open)).toBe('a2')
    expect(copyToToggle(group, ['v'], true, (card) => card.key === 'a3', 3)).toBe('a3')
    expect(copyToToggle(group, [], true, () => false, 3)).toBeNull()
  })
})

describe('M-03: elegir varias con copias', () => {
  it('una carta con «×3», los números en el orden tocado, «2 de 3» y una sola principal que se prende al completar', () => {
    const onPick = vi.fn()
    render(<CardPicker title="Elegí 3 cartas" cards={CARDS} min={3} max={3} onPick={onPick} onCancel={() => {}} />)
    const dialog = screen.getByRole('dialog', { name: 'Elegí 3 cartas' })
    const options = within(dialog).getAllByRole('option')

    // La mano propia va primero; después, el Deck.
    expect(options).toHaveLength(2)
    const ash = options[1]
    expect(ash).toHaveAccessibleName(/^Ash Blossom, 3 copias/)
    expect(ash!.querySelector('[data-pick-copies]')).toHaveTextContent('×3')

    fireEvent.click(ash!)
    fireEvent.click(options[0]!)
    fireEvent.click(ash!)
    expect(within(dialog).getByRole('status')).toHaveTextContent('3 de 3')
    expect(ash).toHaveAccessibleName(/1, 3/)
    expect(ash).toHaveTextContent('1·3')

    // Lleno: tocar el grupo suelta la última copia elegida.
    fireEvent.click(ash!)
    expect(within(dialog).getByRole('status')).toHaveTextContent('2 de 3')
    const primary = within(dialog).getAllByRole('button').at(-1)!
    expect(primary).toBeDisabled()
    fireEvent.click(ash!)
    expect(primary).toBeEnabled()
    expect(within(dialog).getAllByRole('button').filter((button) => button.className.includes('bg-primary'))).toHaveLength(1)
    fireEvent.click(primary)
    expect(onPick).toHaveBeenCalledWith(['a1', 'v', 'a2'])
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
