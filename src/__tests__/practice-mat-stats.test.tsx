// @vitest-environment jsdom
// La etiqueta de ATK/DEF de la mesa manual: los números impresos de cada monstruo boca arriba, siempre, abajo de su casilla y en su nombre.
import { screen } from '@testing-library/react'
import '@testing-library/jest-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { replayMat, type MatAction } from '../app/practice-mat'
import { StatTag } from '../components/probability/MatFx'
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
    // Sin Nivel en el catálogo, sin ficha.
    expect(document.querySelector('[data-stat-badge]')).toBeNull()
  })

  it('la ficha de arriba: ★ Nivel, R Rango (Xyz) y LINK, con su nombre; un Pendulum, sin ficha; en reposo no se ve (vuelve en la casilla que se elige) y el número va sin color', () => {
    const cards: ReadonlyMap<string, MatCard> = new Map([
      ['card-1-1', { name: 'Ponix', apiCard: { ...monster(1, { atk: '1900', def: '1000' }), level: 4 } }],
      ['card-2-1', { name: 'Zeus', apiCard: { ...monster(2, { atk: '2800', def: '2400' }), frameType: 'xyz', level: 4 } }],
      ['card-3-1', { name: 'Apollousa', apiCard: { ...monster(3, { atk: '?', def: null, linkValue: 4 }), frameType: 'link' } }],
      ['card-4-1', { name: 'Odd-Eyes', apiCard: { ...monster(4, { atk: '2500', def: '2000' }), frameType: 'effect_pendulum', level: 7 } }],
    ])
    const plays: MatAction[] = [
      { type: 'place', id: 'card-1-1', zone: 'mz', index: 0, pos: 'atk' },
      { type: 'place', id: 'card-2-1', zone: 'mz', index: 1, pos: 'def' },
      { type: 'place', id: 'card-3-1', zone: 'emz', index: 0, pos: 'atk' },
      { type: 'place', id: 'card-4-1', zone: 'mz', index: 2, pos: 'atk' },
    ]
    render(<Harness initial={replayMat(INITIAL, plays)} cards={cards} />)

    const badge = (name: string) => zone(name).querySelector('[data-stat-badge]')?.textContent?.replace(/\s/g, ' ')
    expect(badge('Zona de monstruo 1')).toBe('★ 4')
    expect(badge('Zona de monstruo 2')).toBe('R 4')
    expect(badge('Zona de monstruo 3')).toBeUndefined()
    expect(document.querySelectorAll('[data-stat-badge="link"]')).toHaveLength(1)
    expect(document.querySelector('[data-stat-badge="link"]')?.textContent?.replace(/\s/g, ' ')).toBe('LINK 4')
    expect(screen.getByRole('button', { name: 'Ponix, nivel 4, ATK 1900, DEF 1000' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Zeus, en defensa, rango 4, ATK 2800, DEF 2400' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Apollousa, LINK 4, ATK ?' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Odd-Eyes, ATK 2500, DEF 2000' })).toBeInTheDocument()
    // Decorativas: la ficha y su caja no se leen.
    expect(document.querySelector('[data-stat-badge]')!.closest('[aria-hidden="true"]')).not.toBeNull()
    // El Nivel sale de la mesa: escondido, salvo en una casilla que se elige (`data-pick`, Sacrificios y materiales).
    for (const badge of document.querySelectorAll('[data-stat-badge]')) expect(badge).toHaveClass('hidden', 'in-data-[pick=true]:block')
    // La mesa manual muestra el impreso y no lo pinta.
    expect(document.querySelector('[data-shift]')).toBeNull()
  })

  it('el de ahora (duelo automático) se pinta si cambió: menta si subió, rojo claro si bajó, un «?» sin color; la ficha de elegir se ve', () => {
    const { container } = render(
      <>
        <div data-testid="up"><StatTag stat={{ attack: 2100, defense: 1000, printed: { attack: 1600, defense: 1200 }, badge: { kind: 'level', value: 4 } }} /></div>
        <div data-testid="same"><StatTag stat={{ attack: '?', defense: 1000, printed: { attack: 1600, defense: 1000 }, resting: true }} /></div>
      </>,
    )
    const up = screen.getByTestId('up')
    const same = screen.getByTestId('same')

    expect(up.querySelector('[data-shift="up"]')).toHaveClass('text-success-soft')
    expect(up.querySelector('[data-shift="down"]')).toHaveClass('text-danger-soft')
    expect(up.querySelector('[data-stat-badge]')).toHaveClass('block')
    expect(same.querySelector('[data-shift]')).toBeNull()
    expect(container.querySelectorAll('[data-pick-stat]')).toHaveLength(2)
  })
})
