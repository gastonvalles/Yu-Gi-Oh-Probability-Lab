// @vitest-environment jsdom
import { configureStore } from '@reduxjs/toolkit'
import { cleanup, fireEvent, render as renderBare, screen, within } from '@testing-library/react'
import '@testing-library/jest-dom'
import type { ReactElement } from 'react'
import { Provider } from 'react-redux'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { buildDuelReplay } from '../app/duel-replay'
import type { SavedReplay } from '../app/duel-replay-share'
import { createMatState } from '../app/practice-mat'
import { DuelReplayScreen } from '../components/replays/DuelReplayScreen'
import { YourDuels } from '../components/replays/YourDuels'

// `CardArt` lee el formato del deck del store: uno mínimo.
const store = configureStore({ reducer: { settings: (state = { handSize: 5, deckFormat: 'unlimited' as const }) => state } })
const render = (ui: ReactElement) => renderBare(<Provider store={store}>{ui}</Provider>)

// Un duelo corto: robás, invocás Ash Blossom y colocás una carta; el rival invoca una que muestra.
const deck = Array.from({ length: 20 }, (_, i) => `card-${14558127 + (i % 4)}-${Math.floor(i / 4) + 1}`)
const mine = createMatState(deck, [], 5)
const [h0, h1] = mine.hand as [string, string]
const replayOf = (view: 'public' | 'mine') =>
  buildDuelReplay({
    mode: 'link-auto',
    view,
    players: ['Ana', 'Beto'],
    starter: 0,
    mine: { initial: mine, actions: [{ type: 'phase', phase: 'main1' }, { type: 'place', id: h0, zone: 'mz', index: 0, pos: 'atk', how: 'normal' }, { type: 'place', id: h1, zone: 'st', index: 0, pos: 'set' }] },
    theirs: { initial: createMatState(Array.from({ length: 20 }, (_, i) => `c${i + 1}`), [], 5), acts: [{ action: { type: 'place', id: 'c1', zone: 'mz', index: 1, pos: 'atk', how: 'normal' }, reveal: { c1: 'card-55144522-1' } }] },
    order: ['mine', 'mine', 'mine', 'theirs'],
    life: [{ at: 0, lp: [8000, 8000] }],
    nameOf: (code) => (code === 14558127 ? 'Ash Blossom' : code === 55144522 ? 'Pot of Greed' : `Carta ${code}`),
    result: { winner: 0, reason: 'lp' },
  })

beforeEach(() => {
  window.matchMedia = ((query: string) => ({ matches: query.includes('reduce'), media: query, addEventListener: () => {}, removeEventListener: () => {}, addListener: () => {}, removeListener: () => {}, onchange: null, dispatchEvent: () => false })) as typeof window.matchMedia
})
afterEach(cleanup)

describe('la pantalla del replay de un duelo', () => {
  it('se recorre jugada por jugada: el paso, quién la hizo y el final; la mano de quien grabó, de dorso en la vista pública', () => {
    render(<DuelReplayScreen replay={replayOf('public')} onClose={() => {}} actions={[]} />)

    const step = screen.getByTestId('replay-step')
    expect(step).toHaveTextContent('Jugada 4 de 4 · Ganó Ana · sin puntos de vida')
    expect(step).toHaveTextContent('Beto: Invocación Normal de Pot of Greed')
    fireEvent.click(screen.getByRole('button', { name: 'Volver al principio' }))
    expect(step).toHaveTextContent('La mesa al empezar')
    fireEvent.click(screen.getByRole('button', { name: 'Siguiente' }))
    fireEvent.click(screen.getByRole('button', { name: 'Siguiente' }))
    expect(step).toHaveTextContent('Ana: Invocación Normal de Ash Blossom')
    expect(screen.getByRole('slider', { name: 'Línea de tiempo del replay' })).toHaveAttribute('aria-valuenow', '2')
    // La mano de abajo (la de Ana) no dice qué cartas son.
    expect(screen.queryByRole('img', { name: /^Mano del rival: .*Ash Blossom/ })).toBeNull()
    expect(screen.getByText('Vista de espectador')).toBeInTheDocument()
  })

  it('con «mi mano», la de quien grabó se ve; compartido, ofrece guardarlo', () => {
    const onSave = vi.fn()
    render(<DuelReplayScreen replay={replayOf('mine')} onClose={() => {}} shared={{ onSave }} actions={[]} />)

    expect(screen.getByText('Con la mano de Ana')).toBeInTheDocument()
    expect(screen.getByRole('img', { name: /^Mano del rival: .*Ash Blossom/ })).toBeInTheDocument()
    fireEvent.click(within(screen.getByRole('region', { name: 'Replay compartido' })).getByRole('button', { name: 'Guardar en mis replays' }))
    expect(onSave).toHaveBeenCalled()
  })
})

describe('Tus duelos', () => {
  const items: SavedReplay[] = [
    { id: 'a', savedAt: '2026-10-29T12:00:00Z', players: ['Ana', 'Beto'], steps: 412, result: { winner: 1, reason: 'concede' }, payload: 'zCORTO' },
    { id: 'b', savedAt: '2026-10-28T12:00:00Z', players: ['', ''], steps: 1500, view: 'mine', payload: `z${'A'.repeat(9000)}` },
  ]

  it('una fila por duelo: la abre; el enlace sólo si entra; borrar pide confirmación', () => {
    const onOpen = vi.fn()
    const onDelete = vi.fn()
    render(<YourDuels items={items} onOpen={onOpen} onCopyLink={() => {}} onDownload={() => {}} onDelete={onDelete} onImport={() => {}} />)

    expect(screen.getByRole('button', { name: 'Ver el replay de Ana vs Beto' })).toHaveTextContent('412 jugadas · Ganó Beto · por rendición')
    expect(screen.getByRole('button', { name: 'Ver el replay de Duelista vs Rival' })).toHaveTextContent('Sin terminar · Con tu mano')
    fireEvent.click(screen.getByRole('button', { name: 'Ver el replay de Ana vs Beto' }))
    expect(onOpen).toHaveBeenCalledWith(items[0])

    fireEvent.click(screen.getByRole('button', { name: 'Más opciones de Duelista vs Rival' }))
    expect(screen.queryByRole('menuitem', { name: /Copiar enlace/ })).toBeNull()
    fireEvent.click(screen.getByRole('menuitem', { name: /Borrar replay/ }))
    expect(onDelete).not.toHaveBeenCalled()
    fireEvent.click(within(screen.getByRole('alertdialog')).getByRole('button', { name: 'Borrar replay' }))
    expect(onDelete).toHaveBeenCalledWith(items[1])
  })

  it('vacía, dice cómo se guarda uno', () => {
    render(<YourDuels items={[]} onOpen={() => {}} onCopyLink={() => {}} onDownload={() => {}} onDelete={() => {}} onImport={() => {}} />)
    expect(screen.getByText('Todavía no guardaste duelos')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Abrir archivo' })).toBeInTheDocument()
  })
})
