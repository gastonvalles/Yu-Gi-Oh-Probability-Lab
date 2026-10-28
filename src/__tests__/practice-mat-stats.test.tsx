// @vitest-environment jsdom
// La etiqueta de ATK/DEF de la mesa manual: los números impresos de cada monstruo boca arriba, siempre, abajo de su casilla y en su nombre.
import { screen } from '@testing-library/react'
import '@testing-library/jest-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { replayMat, type MatAction } from '../app/practice-mat'
import type { MatCard } from '../components/probability/PracticeMat'
import { Harness, INITIAL, card, render, zone } from './support/practice-mat-harness'

vi.mock('../ygoprodeck', () => ({ fetchCardsByIds: vi.fn(async () => []) }))

beforeEach(() => {
  window.matchMedia = ((query: string) => ({ matches: query.includes('reduce'), media: query, addEventListener: () => {}, removeEventListener: () => {}, addListener: () => {}, removeListener: () => {}, onchange: null, dispatchEvent: () => false })) as typeof window.matchMedia
})

const monster = (id: number, stats: { atk: string | null; def: string | null; linkValue?: number }) => ({ ...card(id, 'effect'), linkValue: null, ...stats })

const CARDS: ReadonlyMap<string, MatCard> = new Map([
  ['card-1-1', { name: 'Ash Blossom', apiCard: monster(1, { atk: '0', def: '1800' }) }],
  ['card-2-1', { name: 'Maxx C', apiCard: monster(2, { atk: '500', def: '200' }) }],
  ['card-3-1', { name: 'Called by the Grave', apiCard: card(3, 'spell') }],
  ['card-4-1', { name: 'Nibiru', apiCard: monster(4, { atk: '3000', def: '600' }) }],
  ['card-5-1', { name: 'Apollousa', apiCard: monster(5, { atk: '?', def: null, linkValue: 4 }) }],
  ['card-6-1', { name: 'Imperm', apiCard: card(6, 'trap') }],
  ['card-7-1', { name: 'Zeus', apiCard: monster(7, { atk: '2800', def: '2400' }) }],
])

const PLAYS: MatAction[] = [
  { type: 'place', id: 'card-1-1', zone: 'mz', index: 0, pos: 'atk' },
  { type: 'place', id: 'card-2-1', zone: 'mz', index: 1, pos: 'def' },
  { type: 'place', id: 'card-4-1', zone: 'mz', index: 2, pos: 'set' },
  { type: 'place', id: 'card-5-1', zone: 'emz', index: 0, pos: 'atk' },
  { type: 'place', id: 'card-3-1', zone: 'st', index: 0, pos: 'atk' },
]

const tags = () => [...document.querySelectorAll('[data-pick-stat]')].map((tag) => tag.textContent?.replace(/\s/g, ' '))

describe('la mesa manual · ATK/DEF de los monstruos', () => {
  it('cada monstruo boca arriba lleva sus números impresos, siempre: en defensa también, un Link sin DEF y con «?»; boca abajo y una Mágica, nada; su nombre los dice', () => {
    render(<Harness initial={replayMat(INITIAL, PLAYS)} cards={CARDS} />)

    // En el orden de la mesa: la Zona Extra, arriba de la fila de monstruos.
    expect(tags()).toEqual(['?', '0 / 1800', '500 / 200'])
    expect(screen.getByRole('button', { name: 'Ash Blossom, ATK 0, DEF 1800' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Maxx C, en defensa, ATK 500, DEF 200' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Apollousa, ATK ?' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Nibiru, boca abajo' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Called by the Grave' })).toBeInTheDocument()
    // Una sola etiqueta por casilla, dentro de ella.
    expect(zone('Zona de monstruo 1').querySelectorAll('[data-pick-stat]')).toHaveLength(1)
    expect(zone('Zona de monstruo 3').querySelector('[data-pick-stat]')).toBeNull()
  })
})
