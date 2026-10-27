// @vitest-environment jsdom
import { act, cleanup, render, renderHook, screen } from '@testing-library/react'
import '@testing-library/jest-dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { rivalAttacks, type RivalAttack } from '../app/auto/adapter'
import { LifeHold, useHeldValue } from '../app/life-effects'
import type { MatAction } from '../app/practice-mat'
import { useRivalStrike, useStrikeHold } from '../components/auto/use-auto-asks'
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

describe('rivalAttacks', () => {
  it('cada ataque del rival con su lugar en la cinta de tus jugadas', () => {
    const theirs = [{ action: { type: 'reveal', id: 'c1' }, reveal: {} }, { action: { type: 'attack', id: 'c2', target: 'card-1-1' }, reveal: {} }, { action: { type: 'attack', id: 'c3' }, reveal: {} }] as const

    expect(rivalAttacks(['mine', 'theirs', 'mine', 'theirs', 'mine', 'theirs'], theirs)).toEqual([
      { index: 1, at: 2, attackerId: 'c2', targetId: 'card-1-1' },
      { index: 2, at: 3, attackerId: 'c3' },
    ])
  })
})

describe('useRivalStrike', () => {
  const start = {}
  const direct: RivalAttack = { index: 0, at: 1, attackerId: 'c2' }
  type Props = { attacks: RivalAttack[]; total: number; start: object; cursor: number; limit: number; live: boolean }
  const hook = (props: Props) => renderHook((p: Props) => useRivalStrike(p.attacks, p.total, p.start, p.cursor, p.limit, p.live), { initialProps: props })
  const base: Props = { attacks: [], total: 0, start, cursor: 1, limit: 1, live: true }

  it('dibuja el ataque que llega donde está la mesa y retiene las vidas hasta el golpe; el cartel se va solo', () => {
    const { result, rerender } = hook(base)

    rerender({ ...base, attacks: [direct], total: 1, limit: 2 })
    expect(result.current.shown).toMatchObject({ attackerId: 'c2' })
    expect(result.current.held).toBe(true)
    const shown = result.current.shown
    rerender({ ...base, attacks: [direct], total: 1, limit: 2 })
    expect(result.current.shown).toBe(shown)
    act(() => vi.advanceTimersByTime(IMPACT_MS))
    expect(result.current.held).toBe(false)
    act(() => vi.advanceTimersByTime(4000))
    expect(result.current.shown).toBeNull()
  })

  it('espera a que la mesa llegue a su lugar y entonces lo dibuja', () => {
    const later: RivalAttack = { ...direct, at: 2, targetId: 'card-1-1' }
    const { result, rerender } = hook(base)

    rerender({ ...base, attacks: [later], total: 1, limit: 3 })
    expect(result.current.shown).toBeNull()
    expect(result.current.held).toBe(true)
    rerender({ ...base, attacks: [later], total: 1, cursor: 2, limit: 3 })
    expect(result.current.shown).toMatchObject({ attackerId: 'c2', targetId: 'card-1-1' })
  })

  it('no dibuja lo que ya estaba, lo que se salta, lo que se rearma ni lo que llega repasando', () => {
    // Al abrir (recargar, volver): ya pasó.
    expect(hook({ ...base, attacks: [direct], total: 1 }).result.current.shown).toBeNull()
    // Tocar la mesa: el cursor salta por encima.
    const far: RivalAttack = { ...direct, at: 2 }
    const skipped = hook({ ...base, cursor: 0, limit: 3 })

    skipped.rerender({ ...base, attacks: [far], total: 1, cursor: 0, limit: 3 })
    skipped.rerender({ ...base, attacks: [far], total: 1, cursor: 3, limit: 3 })
    expect(skipped.result.current.shown).toBeNull()
    expect(skipped.result.current.held).toBe(false)
    // Rearmarse (deshacer, reponer): otra mesa del arranque con el ataque adentro.
    const rearmed = hook(base)

    rearmed.rerender({ ...base, start: {}, attacks: [direct], total: 1 })
    expect(rearmed.result.current.shown).toBeNull()
    // Repasando.
    const review = hook({ ...base, live: false })

    review.rerender({ ...base, live: false, attacks: [direct], total: 1 })
    review.rerender({ ...base, attacks: [direct], total: 1 })
    expect(review.result.current.shown).toBeNull()
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
