// @vitest-environment jsdom
import { renderHook } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import type { DuelSnapshot } from '../app/duel-session'
import type { MatAction } from '../app/practice-mat'
import { useDuelSounds } from '../app/use-duel-sounds'

const { playSfx } = vi.hoisted(() => ({ playSfx: vi.fn() }))

vi.mock('../app/sfx', async () => ({ ...(await vi.importActual<typeof import('../app/sfx')>('../app/sfx')), playSfx }))

const normal: MatAction = { type: 'place', id: 'a', zone: 'mz', index: 0, pos: 'atk', how: 'normal' }
const gy: MatAction = { type: 'move', id: 'a', to: 'gy' }

interface Parts {
  mine?: readonly MatAction[]
  theirs?: readonly MatAction[]
  lp?: [number, number]
  conceded?: 0 | 1 | null
  games?: DuelSnapshot['games']
}

function snapshot({ mine = [], theirs = [], lp = [8000, 8000], conceded = null, games = [] }: Parts = {}): DuelSnapshot {
  return { me: 0, actions: mine, theirs: { acts: theirs }, life: { lp }, conceded, games } as unknown as DuelSnapshot
}

const sounds = () => playSfx.mock.calls.map(([kind]) => kind)

beforeEach(() => {
  playSfx.mockClear()
})

describe('los sonidos del duelo', () => {
  it('no suena lo que ya estaba jugado, y después suena cada jugada nueva, mía o del rival', () => {
    const { rerender } = renderHook(({ parts }) => useDuelSounds(snapshot(parts)), { initialProps: { parts: { mine: [normal], theirs: [gy] } as Parts } })

    expect(sounds()).toEqual([])

    rerender({ parts: { mine: [normal, gy], theirs: [gy] } })
    expect(sounds()).toEqual(['grave'])

    rerender({ parts: { mine: [normal, gy], theirs: [gy, normal] } })
    expect(sounds()).toEqual(['grave', 'summon'])
  })

  it('deshacer suena como deshacer, y un salto (la mesa repuesta al reconectar) no suena', () => {
    const { rerender } = renderHook(({ parts }) => useDuelSounds(snapshot(parts)), { initialProps: { parts: { mine: [normal, gy] } as Parts } })

    rerender({ parts: { mine: [normal] } })
    expect(sounds()).toEqual(['undo'])

    rerender({ parts: { mine: [normal, gy, gy, gy] } })
    expect(sounds()).toEqual(['undo'])
  })

  it('las vidas que bajan o suben suenan distinto, y con el duelo terminado no suenan', () => {
    const { rerender } = renderHook(({ parts }) => useDuelSounds(snapshot(parts)), { initialProps: { parts: {} as Parts } })

    rerender({ parts: { lp: [7000, 8000] } })
    rerender({ parts: { lp: [7000, 8500] } })
    expect(sounds()).toEqual(['lpDown', 'lpUp'])

    // Termina el duelo (suena la victoria) y la revancha vuelve las vidas a 8000: eso no suena como una curación.
    rerender({ parts: { lp: [0, 8500] } })
    rerender({ parts: { lp: [8000, 8000] } })
    expect(sounds()).toEqual(['lpDown', 'lpUp', 'lpDown', 'lose'])
  })

  it('suenan la moneda, el dado y cómo terminó el duelo, y no el resultado de antes de abrir', () => {
    const finished = renderHook(() => useDuelSounds(snapshot({ lp: [8000, 0] })))

    finished.unmount()
    expect(sounds()).toEqual([])

    const { rerender } = renderHook(({ parts }) => useDuelSounds(snapshot(parts)), { initialProps: { parts: {} as Parts } })

    rerender({ parts: { games: [{ id: 1, from: 1, game: { kind: 'die', value: 4 } }] } })
    rerender({ parts: { games: [{ id: 1, from: 1, game: { kind: 'die', value: 4 } }, { id: 2, from: 0, game: { kind: 'rps', pick: 'rock' } }] } })
    rerender({ parts: { conceded: 1 } })

    expect(sounds()).toEqual(['dice', 'win'])
  })

  it('sin mesa no suena nada', () => {
    const { rerender } = renderHook(({ on }) => useDuelSounds(on ? snapshot({ mine: [normal] }) : null), { initialProps: { on: false } })

    rerender({ on: true })
    expect(sounds()).toEqual([])
  })
})
