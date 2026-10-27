// @vitest-environment jsdom
import { act, cleanup, render, renderHook, screen } from '@testing-library/react'
import '@testing-library/jest-dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { LifeHold, useHeldValue } from '../app/life-effects'
import type { MatAction } from '../app/practice-mat'
import { useStrikeHold } from '../components/auto/use-auto-asks'
import { LifeTile } from '../components/duel/DuelBar'
import { IMPACT_MS } from '../components/probability/AttackFx'

// Las vidas que se ven esperan al golpe del ataque (el núcleo ya las bajó): nunca se quedan viejas.

const reveal: MatAction = { type: 'reveal', id: 'card-1-1' }
const attack: MatAction = { type: 'attack', id: 'card-1-1' }

beforeEach(() => vi.useFakeTimers())
afterEach(() => {
  cleanup()
  vi.useRealTimers()
})

describe('useHeldValue', () => {
  it('muestra el valor de antes mientras está retenido y el real en cuanto se suelta', () => {
    const { result, rerender } = renderHook(({ value, held }) => useHeldValue(value, held), { initialProps: { value: 8000, held: false } })

    rerender({ value: 7000, held: true })
    expect(result.current).toBe(8000)
    rerender({ value: 6500, held: true })
    expect(result.current).toBe(8000)
    rerender({ value: 6500, held: false })
    expect(result.current).toBe(6500)
  })
})

describe('useStrikeHold', () => {
  const hook = (actions: MatAction[], cursor: number, limit = actions.length, live = true) => renderHook((props) => useStrikeHold(props.actions, props.cursor, props.limit, props.live), { initialProps: { actions, cursor, limit, live } })

  it('retiene mientras falta mostrar un ataque y hasta su golpe, y después suelta', () => {
    const actions = [reveal, attack]
    const { result, rerender } = hook(actions, 1)

    expect(result.current).toBe(true)
    rerender({ actions, cursor: 2, limit: 2, live: true })
    expect(result.current).toBe(true)
    act(() => vi.advanceTimersByTime(IMPACT_MS - 1))
    expect(result.current).toBe(true)
    act(() => vi.advanceTimersByTime(1))
    expect(result.current).toBe(false)
  })

  it('no retiene sin ataque, al saltar al final, repasando ni con un ataque detrás de una parada', () => {
    expect(hook([reveal], 0).result.current).toBe(false)
    expect(hook([reveal, attack], 1, 1).result.current).toBe(false)
    expect(hook([reveal, attack], 1, 2, false).result.current).toBe(false)

    const actions = [reveal, reveal, attack]
    const { result, rerender } = hook(actions, 0)

    expect(result.current).toBe(true)
    // Tocar la mesa salta varias jugadas de una: la mesa no dibuja la espada, así que las vidas no esperan.
    rerender({ actions, cursor: 3, limit: 3, live: true })
    expect(result.current).toBe(false)
  })

  it('con movimiento reducido no hay espada ni espera', () => {
    vi.stubGlobal('matchMedia', (query: string) => ({ matches: query.includes('reduce'), media: query }))

    expect(hook([reveal, attack], 1).result.current).toBe(false)
    vi.unstubAllGlobals()
  })
})

describe('LifeTile con LifeHold', () => {
  it('el número, la barra y lo que oye el lector esperan a que se suelte; sin LifeHold cambian ya', () => {
    const tile = (life: number, held: boolean) => (
      <LifeHold value={held}>
        <LifeTile name="Beto" life={life} />
      </LifeHold>
    )
    const { rerender } = render(tile(8000, false))

    rerender(tile(7000, true))
    expect(screen.getByRole('group')).toHaveAccessibleName(/8000/)
    expect(screen.getByRole('meter')).toHaveAttribute('aria-valuenow', '8000')
    rerender(tile(7000, false))
    expect(screen.getByRole('group')).toHaveAccessibleName(/7000/)
    expect(screen.getByRole('meter')).toHaveAttribute('aria-valuenow', '7000')
  })
})
