// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import '@testing-library/jest-dom'
import { afterEach, describe, expect, it, vi } from 'vitest'

import type { MetaDeck } from '../app/meta'
import { MetaDeckTile } from '../components/meta/MetaDeckTile'
import { deckKindCounts, placementLook } from '../components/meta/meta-format'

// Sin datos de las cartas: una carta que los datos no conocen cuenta como hand trap (3 copias = 3 hand traps).
const DECK: MetaDeck = {
  id: 999001,
  region: 'tcg',
  name: 'Ars Magna Elfnote',
  date: '2026-10-11',
  tournament: 'Belen WCQ Regional',
  placement: 'Top 8',
  players: 200,
  player: 'Issac Guerrero',
  cover: null,
  url: null,
  main: [[1, 3], [2, 2]],
  side: [[3, 1]],
}

afterEach(cleanup)

describe('la tarjeta de un deck de torneo (escritorio)', () => {
  it('sigue el orden del lenguaje de tarjetas: nombre y quién lo jugó, contexto, y abajo el puesto junto al botón que abre el deck', () => {
    const onOpen = vi.fn()

    render(<MetaDeckTile deck={DECK} layout="card" onOpen={onOpen} />)

    const card = screen.getByRole('article')

    // El nombre es el título de la tarjeta (h3) y el jugador va pegado a él.
    expect(within(card).getByRole('heading', { level: 3, name: 'Ars Magna Elfnote' })).toBeInTheDocument()
    expect(within(card).getByText('Issac Guerrero')).toBeInTheDocument()
    // El contexto es un grupo: dónde y cuándo, y lo que lleva en el Main.
    expect(within(card).getByText(/Belen WCQ Regional · /)).toBeInTheDocument()
    expect(card.textContent).toContain('5 hand traps')
    // El puesto y el botón comparten la última fila, separada por una línea fina.
    const badge = within(card).getByText('Top 8')
    const button = within(card).getByRole('button', { name: 'Ver el deck Ars Magna Elfnote' })

    expect(badge.parentElement).toBe(button.parentElement)
    expect(button.parentElement).toHaveClass('border-t', 'border-border-subtle')

    fireEvent.click(button)

    expect(onOpen).toHaveBeenCalledTimes(1)
  })

  it('lo que es de la ficha no está en la tarjeta: ni la cantidad de jugadores ni el Side', () => {
    render(<MetaDeckTile deck={DECK} layout="card" onOpen={() => {}} />)

    expect(screen.queryByText(/200/)).not.toBeInTheDocument()
    expect(screen.queryByText(/jugadores/)).not.toBeInTheDocument()
    expect(screen.queryByText(/Side/)).not.toBeInTheDocument()
  })

  it('un solo botón para el teclado y los lectores de pantalla: la portada abre el deck con el mouse y queda fuera del orden de tabulación', () => {
    render(<MetaDeckTile deck={DECK} layout="card" onOpen={() => {}} />)

    const card = screen.getByRole('article')
    const cover = card.querySelector('button[aria-hidden="true"]')

    expect(within(card).getAllByRole('button')).toHaveLength(1)
    expect(cover).toHaveAttribute('tabindex', '-1')
  })

  it('sólo el campeón se destaca (ámbar y con la copa); los demás puestos van sin color', () => {
    const { rerender } = render(<MetaDeckTile deck={{ ...DECK, placement: 'Winner' }} layout="card" onOpen={() => {}} />)

    expect(screen.getByText('Winner')).toHaveClass('text-info-soft')

    rerender(<MetaDeckTile deck={{ ...DECK, placement: 'Runner-Up' }} layout="card" onOpen={() => {}} />)

    expect(screen.getByText('Runner-Up')).not.toHaveClass('text-info-soft')
  })

  it('sin puesto, sin jugador y sin hand traps, la tarjeta sigue entera: sólo lleva lo que tiene', () => {
    render(<MetaDeckTile deck={{ ...DECK, placement: null, player: null, main: [] }} layout="card" onOpen={() => {}} />)

    const card = screen.getByRole('article')

    expect(within(card).getByRole('button', { name: 'Ver el deck Ars Magna Elfnote' })).toBeInTheDocument()
    expect(card.textContent).not.toContain('hand traps')
  })
})

describe('la fila de un deck de torneo (celular)', () => {
  it('es un solo botón con el puesto primero y en claro, y el torneo y la fecha después', () => {
    const onOpen = vi.fn()

    render(<MetaDeckTile deck={DECK} layout="row" onOpen={onOpen} />)

    const row = screen.getByRole('button')

    expect(row).toHaveTextContent(/^Ars Magna ElfnoteTop 8 · Belen WCQ Regional · /)
    expect(within(row).getByText('Top 8')).toHaveClass('text-foreground')
    // La tarjeta de escritorio no está: nada de jugador ni de cuántos hand traps lleva.
    expect(screen.queryByRole('article')).not.toBeInTheDocument()
    expect(row).not.toHaveTextContent('Issac Guerrero')

    fireEvent.click(row)

    expect(onOpen).toHaveBeenCalledTimes(1)
  })
})

describe('lo que dice la tarjeta de un deck', () => {
  it('cuenta las copias del Main por tipo, sin el tipo que no lleva', () => {
    expect(deckKindCounts({ main: [[1, 3], [2, 2]] })).toEqual([{ kind: 'handtrap', count: 5 }])
    expect(deckKindCounts({ main: [] })).toEqual([])
  })

  it('el puesto: ámbar sólo para el campeón', () => {
    expect(placementLook('Winner')).toEqual({ tone: 'info', icon: 'trophy' })
    expect(placementLook(' winner ')).toEqual({ tone: 'info', icon: 'trophy' })
    expect(placementLook('Top 8')).toEqual({ tone: 'neutral' })
    expect(placementLook(null)).toEqual({ tone: 'neutral' })
  })
})
