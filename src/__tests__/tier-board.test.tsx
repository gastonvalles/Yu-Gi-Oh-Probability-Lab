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
  it('cada tier es una fila como la de siempre: el recuadro de color con la letra a la izquierda y las cartas pegadas a su lado; las vacías también se dibujan', () => {
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

    // La letra va escrita en el recuadro de color; lo que pide el tier y cuántas cartas tiene, en su tooltip (la ayuda de la pantalla lo explica).
    expect(best.getByText('S')).toHaveStyle({ backgroundColor: 'rgb(255, 127, 127)' })
    expect(best.getByText('S')).toHaveAttribute('title', `${tierHint('S', TIER_FLOORS)} · 2`)
    expect(best.getByText('uno')).toBeInTheDocument()
    expect(best.getByText('dos')).toBeInTheDocument()

    const empty = within(screen.getByRole('region', { name: new RegExp(`^${tierLabel('A')}`) }))

    expect(empty.getByText('A')).toHaveAttribute('title', `${tierHint('A', TIER_FLOORS)} · 0`)
  })

  it('una carta que sube o baja lo dice con su flecha y, en el tooltip, cuántos puntos; una estable no dice nada', () => {
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

    expect(within(rising as HTMLElement).getByRole('img', { name: 'Sube' })).toBeInTheDocument()
    expect(rising).toHaveAttribute('title', expect.stringContaining(`Sube ${trendPoints(up)}`))
    expect(within(falling as HTMLElement).getByRole('img', { name: 'Baja' })).toBeInTheDocument()
    expect(falling).toHaveAttribute('title', expect.stringContaining('Baja'))
    expect(trendPoints(up)).toBe('1,4')
    expect(within(steady as HTMLElement).queryByRole('img')).not.toBeInTheDocument()
    expect(steady).toHaveAttribute('title', expect.not.stringContaining('Sube'))
  })
})
