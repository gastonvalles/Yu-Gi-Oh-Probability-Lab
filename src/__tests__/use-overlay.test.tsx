// @vitest-environment jsdom
import { fireEvent, renderHook } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { useBodyScrollLock, useEscapeKey } from '../app/use-overlay'

afterEach(() => {
  document.body.style.overflow = ''
})

describe('useBodyScrollLock', () => {
  it('bloquea el scroll mientras está activo y restaura el valor original', () => {
    document.body.style.overflow = 'auto'
    const { rerender } = renderHook(({ active }) => useBodyScrollLock(active), {
      initialProps: { active: true },
    })

    expect(document.body.style.overflow).toBe('hidden')

    rerender({ active: false })
    expect(document.body.style.overflow).toBe('auto')
  })

  it('no libera el scroll si otro overlay sigue abierto aunque cierren en otro orden', () => {
    const first = renderHook(() => useBodyScrollLock(true))
    const second = renderHook(() => useBodyScrollLock(true))

    first.unmount()
    expect(document.body.style.overflow).toBe('hidden')

    second.unmount()
    expect(document.body.style.overflow).toBe('')
  })
})

describe('useEscapeKey', () => {
  it('llama al callback más reciente sólo con Escape y mientras está activo', () => {
    const firstCallback = vi.fn()
    const latestCallback = vi.fn()
    const { rerender } = renderHook(({ callback, active }) => useEscapeKey(callback, active), {
      initialProps: { callback: firstCallback, active: true },
    })

    rerender({ callback: latestCallback, active: true })
    fireEvent.keyDown(window, { key: 'Enter' })
    fireEvent.keyDown(window, { key: 'Escape' })

    expect(firstCallback).not.toHaveBeenCalled()
    expect(latestCallback).toHaveBeenCalledTimes(1)

    rerender({ callback: latestCallback, active: false })
    fireEvent.keyDown(window, { key: 'Escape' })
    expect(latestCallback).toHaveBeenCalledTimes(1)
  })
})
