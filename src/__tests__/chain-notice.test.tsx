// @vitest-environment jsdom
import { configureStore } from '@reduxjs/toolkit'
import { render, screen } from '@testing-library/react'
import '@testing-library/jest-dom'
import { Provider } from 'react-redux'
import { describe, expect, it } from 'vitest'

import { ChainNotice, type ChainNoticeRow } from '../components/auto/ChainNotice'
import { PLAYER_COLOR } from '../components/duel/player-color'

// La píldora de la cadena: plegada, dos renglones cortos y sin nombres de cartas (los nombres van en la pila); desplegada (como abre), el título de la pila. Cada dato, una vez.

const PONIX: ChainNoticeRow = { number: 1, who: 'Vos', mine: true, name: 'Ponix', art: null, state: 'chained' }
const ASH: ChainNoticeRow = { number: 2, who: 'Rival', mine: false, name: 'Ash Blossom', art: null, state: 'chained' }
// El arte de la pila lee el formato del store.
const store = configureStore({ reducer: { settings: (state = { handSize: 5, deckFormat: 'unlimited' as const }) => state } })
const pill = (rows: ChainNoticeRow[], props: { focus?: number; resolving?: boolean; compact?: boolean; open?: boolean } = {}) => {
  render(<Provider store={store}><ChainNotice rows={rows} focus={props.focus ?? rows.length - 1} resolving={props.resolving ?? false} open={props.open ?? false} compact={props.compact ?? true} onOpenChange={() => {}} onPick={() => {}} /></Provider>)
  return screen.getByRole('status')
}

describe('ChainNotice en el celular: «Cadena · N · Resuelve CLn» y qué pasa, sin nombres', () => {
  it('negado por un eslabón que se conoce: el estado corto con su número, y el que se resuelve en el color de su dueño', () => {
    const status = pill([{ ...PONIX, state: 'disabled', by: 2 }, { ...ASH, state: 'solving' }, { ...PONIX, number: 3 }], { focus: 0, resolving: true })

    expect(status).toHaveTextContent(/^Cadena · 3 · Resuelve CL2Sin efecto · por CL2$/)
    expect(screen.getAllByText('CL2')[0]).toHaveClass(PLAYER_COLOR.theirs.text)
  })

  it('negada la activación, con y sin `by`', () => {
    expect(pill([{ ...PONIX, state: 'negated', by: 2 }, { ...ASH, state: 'solving' }], { focus: 0, resolving: true })).toHaveTextContent(/Negada · por CL2$/)
  })

  it('mientras se arma: el último y de quién, y su estado; la cuenta no se repite (es el número del último)', () => {
    pill([PONIX])
    expect(screen.getByTestId('chain-notice')).toHaveTextContent(/^Cadena · CL1 · VosEn espera$/)
  })

  it('accesible: el estado se lee entero y la flecha dice qué hace (44 px); nada se esconde solo', () => {
    pill([PONIX, { ...ASH, state: 'solving' }], { resolving: true })
    const toggle = screen.getByRole('button', { name: 'Ver la cadena' })

    expect(toggle).toHaveAttribute('aria-expanded', 'false')
    expect(screen.getByTestId('chain-notice').outerHTML).not.toMatch(/banded|sr-only/)
  })
})

describe('ChainNotice desplegada (como abre cada cadena)', () => {
  it('la píldora es el título de la pila («Cadena · 2»): el eslabón, su dueño y su estado van sólo en su fila (el resumen, para el lector de pantalla)', () => {
    const status = pill([PONIX, ASH], { open: true })

    expect(status.firstElementChild).toHaveTextContent(/^Cadena · 2$/)
    for (const line of [...status.children].slice(1)) expect(line).toHaveClass('sr-only')
    // Sin lugar para la lista con una pregunta abierta en el celular (`data-squeezed` en la capa), se ve el resumen y no la lista.
    for (const line of [...status.children].slice(1)) expect(line).toHaveClass('group-data-squeezed/chain:not-sr-only')
    expect(status.firstElementChild).toHaveClass('group-data-squeezed/chain:hidden')
    expect(screen.getByRole('list', { name: /Eslabones de la cadena/ })).toHaveAttribute('data-chain-list')
    expect(screen.getByRole('list', { name: /Eslabones de la cadena/ })).toHaveClass('group-data-squeezed/chain:hidden')
    expect(screen.getAllByRole('listitem')).toHaveLength(2)
    expect(screen.getByRole('button', { name: 'Ocultar la cadena' })).toHaveAttribute('aria-expanded', 'true')
  })

  it('un solo cartel: el título y la pila van en la misma tarjeta (un borde, una sombra), separados por una línea fina', () => {
    const status = pill([PONIX, ASH], { open: true })
    const list = screen.getByRole('list', { name: /Eslabones de la cadena/ })
    const boxes = [...screen.getByTestId('chain-notice').querySelectorAll('[class*="shadow-overlay"]')]

    expect(boxes).toHaveLength(1)
    expect(boxes[0]).toHaveClass('border', 'rounded-card')
    expect(boxes[0]).toContainElement(status)
    expect(boxes[0]).toContainElement(list)
    expect(list).toHaveClass('border-t')
    expect(list).not.toHaveClass('border')
  })
})

describe('ChainNotice en escritorio', () => {
  it('el eslabón y de quién arriba; debajo, su estado con quién lo negó, sin el nombre; la cuenta, porque no es ese número', () => {
    expect(pill([{ ...PONIX, state: 'disabled', by: 2 }, { ...ASH, state: 'solving' }], { focus: 0, resolving: true, compact: false })).toHaveTextContent(/^Cadena · 2 · CL1 · VosSin efecto · por CL2$/)
  })
})
