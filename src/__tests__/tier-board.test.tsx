// @vitest-environment jsdom
import { cleanup, render, screen, within } from '@testing-library/react'
import '@testing-library/jest-dom'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { TIER_FLOORS, type MetaCardStat } from '../app/meta'
import { CardTile, TierBoard } from '../components/meta/TierBoard'
import { tierHint, tierLabel, trendPoints } from '../components/meta/meta-format'

// El arte real lee el store (el aviso de la banlist): acá sólo importa el tile.
vi.mock('../components/CardArt', () => ({ CardArt: () => <img alt="" /> }))

afterEach(cleanup)

const stat = (patch: Partial<MetaCardStat> = {}) =>
  ({ id: 1, name: 'Ash', image: null, decks: 4, share: 0.25, tier: 'B', main: { decks: 0, copies: 0 }, side: { decks: 0, copies: 0 }, weekly: [], projectedShare: 0.25, projectedTier: 'B', trend: 'flat', archetypes: [], ...patch }) as MetaCardStat

describe('la tier list', () => {
  it('cada tier es un bloque con su nombre, cuántas cartas tiene y qué pide a la vista (en el celular el tooltip no se ve)', () => {
    render(
      <TierBoard
        floors={TIER_FLOORS}
        rows={[
          { tier: 'S', tiles: [{ key: 'a', tile: <span>uno</span> }, { key: 'b', tile: <span>dos</span> }] },
          { tier: 'A', tiles: [] },
        ]}
      />,
    )

    const best = within(screen.getByRole('region', { name: `${tierLabel('S')}: ${tierHint('S', TIER_FLOORS)}` }))

    // El nombre, la cuenta y el piso están escritos (no sólo en un `title`), y los tiers vacíos también se dibujan.
    expect(best.getAllByText(tierLabel('S')).length).toBeGreaterThan(0)
    expect(best.getByText('2')).toBeInTheDocument()
    expect(best.getAllByText(tierHint('S', TIER_FLOORS)).length).toBeGreaterThan(0)
    expect(within(screen.getByRole('region', { name: new RegExp(`^${tierLabel('A')}`) })).getByText('0')).toBeInTheDocument()
  })

  it('una carta que sube o baja dice cuántos puntos, con ▲ / ▼, y una estable no dice nada', () => {
    const up = stat({ trend: 'up', share: 0.25, projectedShare: 0.264 })
    const down = stat({ id: 2, name: 'Maxx', trend: 'down', share: 0.3, projectedShare: 0.285 })

    render(
      <>
        <CardTile stat={up} share={up.share} onOpen={() => {}} />
        <CardTile stat={down} share={down.share} onOpen={() => {}} />
        <CardTile stat={stat({ id: 3, name: 'Veiler' })} share={0.25} onOpen={() => {}} />
      </>,
    )

    const [rising, falling, steady] = screen.getAllByRole('button')

    expect(rising).toHaveTextContent('▲')
    expect(rising).toHaveTextContent(trendPoints(up))
    expect(rising).toHaveTextContent('Sube')
    expect(falling).toHaveTextContent('▼')
    expect(falling).toHaveTextContent('Baja')
    expect(trendPoints(up)).toBe('1,4')
    expect(steady).not.toHaveTextContent(/[▲▼]/)
  })
})
