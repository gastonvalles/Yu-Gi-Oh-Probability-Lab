// @vitest-environment jsdom
import { renderHook } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { createMatState, type MatAction } from '../app/practice-mat'
import { usePracticeSounds } from '../app/use-practice-sounds'
import type { MatSession } from '../app/use-mat-session'

const { playSfx } = vi.hoisted(() => ({ playSfx: vi.fn() }))

vi.mock('../app/sfx', async () => ({ ...(await vi.importActual<typeof import('../app/sfx')>('../app/sfx')), playSfx }))

const initial = createMatState(['a', 'b', 'c'], [], 2)
const normal: MatAction = { type: 'place', id: 'a', zone: 'mz', index: 0, pos: 'atk', how: 'normal' }
const gy: MatAction = { type: 'move', id: 'a', to: 'gy' }
const phase: MatAction = { type: 'phase', phase: 'battle' }

const session = (actions: MatAction[], cursor = actions.length, from = initial): Pick<MatSession, 'initial' | 'actions' | 'cursor'> => ({ initial: from, actions, cursor })
const sounds = () => playSfx.mock.calls.map(([kind]) => kind)

beforeEach(() => {
  playSfx.mockClear()
})

describe('los sonidos de la práctica', () => {
  it('cada jugada nueva suena como en un duelo, y lo que ya estaba al abrir la mesa no', () => {
    const { rerender } = renderHook(({ current }) => usePracticeSounds(current), { initialProps: { current: session([normal]) } })

    expect(sounds()).toEqual([])

    rerender({ current: session([normal, gy]) })
    rerender({ current: session([normal, gy, phase]) })
    expect(sounds()).toEqual(['grave', 'phase'])
  })

  it('deshacer, o volver un paso de un combo, suena el deshacer; avanzar un paso suena la jugada', () => {
    const actions = [normal, gy, phase]
    const { rerender } = renderHook(({ current }) => usePracticeSounds(current), { initialProps: { current: session(actions) } })

    // En vivo, deshacer borra la última jugada y baja el cursor.
    rerender({ current: session(actions.slice(0, 2)) })
    // Reproduciendo un combo, volver un paso baja el cursor sin borrar nada, y avanzar vuelve a sonar la jugada.
    rerender({ current: session(actions.slice(0, 2), 1) })
    rerender({ current: session(actions.slice(0, 2), 2) })

    expect(sounds()).toEqual(['undo', 'undo', 'grave'])
  })

  it('un salto de pasos, una mano nueva o un combo cargado no suenan', () => {
    const actions = [normal, gy, phase, gy]
    const { rerender } = renderHook(({ current }) => usePracticeSounds(current), { initialProps: { current: session(actions, 0) } })

    rerender({ current: session(actions, 3) })
    rerender({ current: session(actions, 0) })
    expect(sounds()).toEqual([])

    // Una mano nueva (otra mesa inicial) arranca de cero: tampoco es una jugada, aunque el cursor suba de a uno.
    const other = createMatState(['a', 'b', 'c'], [], 2)

    rerender({ current: session([], 0, other) })
    rerender({ current: session([normal], 1, other) })
    expect(sounds()).toEqual(['summon'])
  })

  it('la respuesta automática de una jugada no suena aparte, y sin mesa (o en un duelo, que pasa null) no suena nada', () => {
    const auto: MatAction = { type: 'take', id: 'a', zone: 'mz', index: 0, auto: true } as unknown as MatAction
    const { rerender } = renderHook(({ current }) => usePracticeSounds(current), { initialProps: { current: null as ReturnType<typeof session> | null } })

    rerender({ current: session([normal]) })
    expect(sounds()).toEqual([])

    rerender({ current: session([normal, auto]) })
    expect(sounds()).toEqual([])

    rerender({ current: null })
    rerender({ current: session([normal, auto, gy]) })
    expect(sounds()).toEqual([])
  })
})
