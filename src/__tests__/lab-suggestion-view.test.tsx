// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react'
import '@testing-library/jest-dom'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { computeLabOdds } from '../app/lab-odds'
import { requestLabOdds } from '../app/lab-odds-client'
import { createMatcherPattern } from '../app/pattern-factory'
import { computeLabResults } from '../app/probability-lab'
import { LabSuggestion } from '../components/probability/LabSuggestion'
import type { CardEntry, CardRole } from '../types'

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

describe('LabSuggestion', () => {
  const cards = [card('starter', 1, ['starter']), ...Array.from({ length: 39 }, (_, index) => card(`f${index}`, 1, ['recovery'], 'non_engine'))]
  const checks = [createMatcherPattern('Starter', 'opening', [{ matcher: { type: 'role', value: 'starter' }, quantity: 1, kind: 'include' }])]
  const computation = computeLabResults(cards, checks, 5)

  it('muestra la métrica del problema principal y una sugerencia concreta', async () => {
    if (computation.status !== 'ok') throw new Error('no calculable')

    render(<LabSuggestion deckFormat="tcg" cards={cards} checks={checks} handSize={5} view="average" result={computation.results.average} first={computation.results.first} second={computation.results.second} />)

    expect(screen.getByText('Lo que más te frena')).toBeInTheDocument()
    expect(screen.getByText(/Pasan en/)).toBeInTheDocument()
    // El cambio se lee en los chips (qué sacar y meter) y el texto sólo suma el ejemplo y el efecto.
    expect(await screen.findByText(/Sacar 1 carta de relleno/)).toBeInTheDocument()
    expect(screen.getByText(/Meter 1 starter/)).toBeInTheDocument()
  })

  it('prueba las variantes con prioridad baja: no le quitan el turno al resultado que la persona espera', async () => {
    if (computation.status !== 'ok') throw new Error('no calculable')

    vi.mocked(requestLabOdds).mockClear()
    render(<LabSuggestion deckFormat="tcg" cards={cards} checks={checks} handSize={5} view="average" result={computation.results.average} first={computation.results.first} second={computation.results.second} />)
    await screen.findByText(/Sacar 1 carta de relleno/)

    const priorities = vi.mocked(requestLabOdds).mock.calls.map(([, , priority]) => priority)

    expect(priorities.length).toBeGreaterThan(0)
    expect(priorities.every((priority) => priority === 'low')).toBe(true)
  })
})
