// @vitest-environment jsdom
import { configureStore } from '@reduxjs/toolkit'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import '@testing-library/jest-dom'
import type { ReactNode } from 'react'
import { Provider } from 'react-redux'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { computeLabOdds } from '../app/lab-odds'
import { requestLabOdds } from '../app/lab-odds-client'
import { createMatcherPattern } from '../app/pattern-factory'
import { computeLabResults } from '../app/probability-lab'
import { LabSuggestion } from '../components/probability/LabSuggestion'
import type { RoleDistribution } from '../app/role-distribution'
import type { CardEntry, CardRole } from '../types'
import { copies } from './support/deck-fixtures'

// El worker no existe en jsdom: se calcula directo.
vi.mock('../app/lab-odds-client', () => ({
  requestLabOdds: vi.fn((_key: string, input: Parameters<typeof computeLabOdds>[0], _priority?: 'high' | 'low') => Promise.resolve(computeLabOdds(input))),
}))

const card = (id: string, copies: number, roles: CardRole[], origin: CardEntry['origin'] = 'engine'): CardEntry => ({
  id,
  name: `Card ${id}`,
  copies,
  source: 'manual',
  apiCard: null,
  origin,
  roles,
  needsReview: false,
})

afterEach(cleanup)

/** Las cartas del cambio llevan su arte, que lee el formato del deck del store. */
const store = configureStore({ reducer: { settings: (state = { deckFormat: 'tcg' as const }) => state } })
const wrapper = ({ children }: { children: ReactNode }) => <Provider store={store}>{children}</Provider>

describe('LabSuggestion', () => {
  const cards = [card('starter', 1, ['starter']), ...Array.from({ length: 39 }, (_, index) => card(`f${index}`, 1, ['recovery'], 'non_engine'))]
  const checks = [createMatcherPattern('Starter', 'opening', [{ matcher: { type: 'role', value: 'starter' }, quantity: 1, kind: 'include' }])]
  const computation = computeLabResults(cards, checks, 5)

  it('muestra la métrica del problema principal y una sugerencia concreta', async () => {
    if (computation.status !== 'ok') throw new Error('no calculable')

    render(<LabSuggestion deckFormat="tcg" cards={cards} checks={checks} handSize={5} view="average" result={computation.results.average} first={computation.results.first} second={computation.results.second} />, { wrapper })

    expect(screen.getByText('Lo que más te frena')).toBeInTheDocument()
    // Por qué frena, sin repetir el número (ya está en el veredicto).
    expect(screen.getByText(/^Les falta un Starter para arrancar\./)).toBeInTheDocument()
    // El cambio nombra las dos cartas, con cuántas copias quedan.
    expect(await screen.findByText('Sacar 1')).toBeInTheDocument()
    expect(screen.getByText('Meter 1')).toBeInTheDocument()
    expect(screen.getByText(/Card starter/)).toBeInTheDocument()
    expect(screen.getByText('Starter · de 1 pasa a 2')).toBeInTheDocument()
    // Y lo que mejora cada turno, con un anillo por turno.
    expect(screen.getByRole('meter', { name: /^Promedio con el cambio/ })).toBeInTheDocument()
    expect(screen.getByRole('meter', { name: /^Yendo 1º con el cambio/ })).toBeInTheDocument()
    expect(screen.getByRole('meter', { name: /^Yendo 2º con el cambio/ })).toBeInTheDocument()
  })

  it('sin «Probar el cambio» conectado, la acción abre las cartas del rol que gana la copia; con él, la principal es «Probar el cambio»', async () => {
    if (computation.status !== 'ok') throw new Error('no calculable')

    const starters = { key: 'starter', label: 'Starters', roles: ['starter'], copies: 1, atLeastOne: 0.12, buckets: [] } as unknown as RoleDistribution
    const onOpenRole = vi.fn()
    const props = { deckFormat: 'tcg', cards, checks, handSize: 5, view: 'average', result: computation.results.average, first: computation.results.first, second: computation.results.second } as const
    const { rerender } = render(<LabSuggestion {...props} roles={[starters]} onOpenRole={onOpenRole} />, { wrapper })

    fireEvent.click(await screen.findByRole('button', { name: 'Ver starters' }))
    expect(onOpenRole).toHaveBeenCalledWith(starters)

    const onTry = vi.fn()
    rerender(<LabSuggestion {...props} roles={[starters]} onOpenRole={onOpenRole} onTry={onTry} />)
    expect(screen.queryByRole('button', { name: 'Ver starters' })).not.toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Probar el cambio' }))
    expect(onTry.mock.calls[0]?.[0].changes.map((change: { action: string }) => change.action)).toEqual(['remove', 'add'])
  })

  it('«Comparar con mi deck» lleva el cambio a Comparar; en el celular sólo queda la principal (entra en la primera pantalla)', async () => {
    if (computation.status !== 'ok') throw new Error('no calculable')

    const onTry = vi.fn()
    const onCompare = vi.fn()

    render(<LabSuggestion deckFormat="tcg" cards={cards} checks={checks} handSize={5} view="average" result={computation.results.average} first={computation.results.first} second={computation.results.second} onTry={onTry} onCompare={onCompare} />, { wrapper })

    const compare = await screen.findByRole('button', { name: 'Comparar con mi deck' })
    expect(compare).toHaveClass('max-md:hidden')
    fireEvent.click(compare)
    expect(onCompare.mock.calls[0]?.[0].changes.map((change: { action: string }) => change.action)).toEqual(['remove', 'add'])
    expect(onTry).not.toHaveBeenCalled()
  })

  it('el límite de copias cuenta el Side y el Extra: no sugiere una copia que el builder no deja meter', async () => {
    if (computation.status !== 'ok') throw new Error('no calculable')

    const props = { deckFormat: 'tcg', cards, checks, handSize: 5, view: 'average', result: computation.results.average, first: computation.results.first, second: computation.results.second } as const
    // Con dos copias más en el Side, la única que abre ya está en su límite de 3: ningún cambio de una carta suma.
    render(<LabSuggestion {...props} deck={{ extra: [], side: copies(1, 'Card starter', 2, ['starter']) }} />, { wrapper })

    expect(await screen.findByText(/^Ningún cambio de una carta suma manos buenas/)).toBeInTheDocument()
    expect(screen.queryByText('Sacar 1')).not.toBeInTheDocument()
  })

  it('prueba las variantes con prioridad baja: no le quitan el turno al resultado que la persona espera', async () => {
    if (computation.status !== 'ok') throw new Error('no calculable')

    vi.mocked(requestLabOdds).mockClear()
    render(<LabSuggestion deckFormat="tcg" cards={cards} checks={checks} handSize={5} view="average" result={computation.results.average} first={computation.results.first} second={computation.results.second} />, { wrapper })
    await screen.findByText('Sacar 1')

    const priorities = vi.mocked(requestLabOdds).mock.calls.map(([, , priority]) => priority)

    expect(priorities.length).toBeGreaterThan(0)
    expect(priorities.every((priority) => priority === 'low')).toBe(true)
  })
})
