// @vitest-environment jsdom
import { act, renderHook } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { BRIEF_LOADING_MS, useBriefLoading } from '../app/use-brief-loading'

beforeEach(() => vi.useFakeTimers())
afterEach(() => vi.useRealTimers())

describe('los lugares vacíos al cambiar de pestaña', () => {
  it('no se ven la primera vez, y al cambiar la clave se ven un segundo y se van solos', () => {
    const { result, rerender } = renderHook(({ key }) => useBriefLoading(key), { initialProps: { key: 'meta' } })

    expect(result.current).toBe(false)

    rerender({ key: 'all' })
    expect(result.current).toBe(true)

    act(() => vi.advanceTimersByTime(BRIEF_LOADING_MS - 1))
    expect(result.current).toBe(true)

    act(() => vi.advanceTimersByTime(1))
    expect(result.current).toBe(false)

    // Dibujar otra vez con la misma clave no los vuelve a mostrar.
    rerender({ key: 'all' })
    expect(result.current).toBe(false)
  })

  it('si se cambia de nuevo antes de terminar, vuelve a contar desde ahí', () => {
    const { result, rerender } = renderHook(({ key }) => useBriefLoading(key), { initialProps: { key: 'a' } })

    rerender({ key: 'b' })
    act(() => vi.advanceTimersByTime(600))
    rerender({ key: 'c' })
    act(() => vi.advanceTimersByTime(600))
    expect(result.current).toBe(true)

    act(() => vi.advanceTimersByTime(400))
    expect(result.current).toBe(false)
  })
})
