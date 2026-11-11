// @vitest-environment jsdom
import { fireEvent, screen, within } from '@testing-library/react'
import '@testing-library/jest-dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { PassPrompt } from '../components/duel/PassPrompt'
import { Harness, hand, render, tap } from './support/practice-mat-harness'

vi.mock('../ygoprodeck', () => ({ fetchCardsByIds: vi.fn(async () => []) }))

/**
 * La frontera entre los menús de la mesa manual y los del duelo automático (Gastón, 2026-11-10: «El sistema de menús del modo manual estaba bien, solo adaptalo estéticamente»): la mesa sin `duel.auto`
 * sigue abriendo la hoja de la carta en el celular (`CardSheet`) y el menú pegado a la carta en escritorio (`CardMenu`) con sus submenús, y la pregunta de pasar de fase con sus dos botones (`PassPrompt`);
 * nada de la familia del automático (sus preguntas, `data-prompt="ask"`; su «por qué no hay jugadas»).
 */
const media = (desktop: boolean) => {
  window.matchMedia = ((query: string) => ({ matches: query.includes('reduce') || (desktop && query.includes('1101')), media: query, addEventListener: () => {}, removeEventListener: () => {}, addListener: () => {}, removeListener: () => {}, onchange: null, dispatchEvent: () => false })) as typeof window.matchMedia
}
const noAutoFamily = () => expect(document.querySelector('[data-prompt="ask"], [data-testid="no-plays"]')).toBeNull()

beforeEach(() => {
  localStorage.clear()
  HTMLElement.prototype.setPointerCapture = () => {}
  media(false)
})

afterEach(() => vi.useRealTimers())

describe('los menús de la mesa manual no cambian', () => {
  it('celular: tocar una carta de la mano abre la hoja de la carta, con las jugadas a la vista y «Al deck» con su flecha', () => {
    render(<Harness />)
    tap(within(hand()).getByRole('listitem', { name: 'Ash Blossom' }))
    const sheet = screen.getByRole('region', { name: 'Ash Blossom' })

    expect(sheet).toHaveClass('mat-square')
    expect(within(sheet).getAllByRole('menuitem').map((item) => item.textContent)).toEqual(['Invocación Normal', 'Colocar', 'Invocación Especial', 'Activar efecto', 'Revelar', 'Target', 'Descartar', 'Desterrar', 'Al deck'])
    expect(within(sheet).getByRole('menuitem', { name: 'Al deck' }).querySelector('svg')).toHaveAttribute('aria-hidden', 'true')
    noAutoFamily()
  })

  it('escritorio: tocar una carta de la mano abre el menú pegado a la carta y «Al deck» abre su submenú al costado', () => {
    media(true)
    render(<Harness />)
    tap(within(hand()).getByRole('listitem', { name: 'Ash Blossom' }))
    const menu = screen.getByRole('menu', { name: 'Ash Blossom' })

    expect(screen.queryByRole('region', { name: 'Ash Blossom' })).not.toBeInTheDocument()
    expect(within(menu).getAllByRole('menuitem').map((item) => item.textContent)).toEqual(['Revelar', 'Target', 'Al deck', 'Descartar', 'Desterrar', 'Activar efecto', 'Invocación Especial', 'Colocar', 'Invocación Normal', 'Ver carta'])
    fireEvent.click(within(menu).getByRole('menuitem', { name: 'Al deck' }))
    expect(screen.getByRole('menu', { name: 'Al deck' })).toBeInTheDocument()
    noAutoFamily()
  })

  it('la pregunta del rival de pasar de fase lleva sus dos botones: «Jugar antes» y «Dejar pasar»', () => {
    const [allow, deny] = [vi.fn(), vi.fn()]

    render(<PassPrompt name="Ana" phase="battle" endsTurn={false} responders={[]} onAllow={allow} onDeny={deny} />)
    const prompt = document.querySelector('[data-prompt="passAsked"]') as HTMLElement

    expect(within(prompt).getAllByRole('button', { name: /Jugar antes|Dejar pasar/ }).map((button) => button.textContent)).toEqual(['Jugar antes', 'Dejar pasar'])
    fireEvent.click(within(prompt).getByRole('button', { name: 'Dejar pasar' }))
    fireEvent.click(within(prompt).getByRole('button', { name: 'Jugar antes' }))
    expect([allow, deny].map((fn) => fn.mock.calls.length)).toEqual([1, 1])
    noAutoFamily()
  })
})
