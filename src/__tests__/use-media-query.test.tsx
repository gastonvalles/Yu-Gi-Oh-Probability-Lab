// @vitest-environment jsdom
import { act, renderHook } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { useMediaQuery } from '../app/use-media-query'

function installMatchMedia(initialMatches: boolean) {
  let matches = initialMatches
  const listeners = new Set<() => void>()

  vi.stubGlobal('matchMedia', (query: string) => ({
    media: query,
    get matches() {
      return matches
    },
    addEventListener: (_type: string, listener: () => void) => listeners.add(listener),
    removeEventListener: (_type: string, listener: () => void) => listeners.delete(listener),
  }))

  return {
    listeners,
    setMatches(next: boolean) {
      matches = next
      listeners.forEach((listener) => listener())
    },
  }
}

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('useMediaQuery', () => {
  it('devuelve el valor actual desde el primer render', () => {
    installMatchMedia(true)

    const { result } = renderHook(() => useMediaQuery('(min-width: 1101px)'))

    expect(result.current).toBe(true)
  })

  it('se actualiza cuando cambia la media query y limpia el listener al desmontar', () => {
    const media = installMatchMedia(false)
    const { result, unmount } = renderHook(() => useMediaQuery('(min-width: 1101px)'))

    expect(result.current).toBe(false)

    act(() => media.setMatches(true))
    expect(result.current).toBe(true)

    unmount()
    expect(media.listeners.size).toBe(0)
  })

  it('devuelve false si el entorno no soporta matchMedia', () => {
    vi.stubGlobal('matchMedia', undefined)

    const { result } = renderHook(() => useMediaQuery('(min-width: 1101px)'))

    expect(result.current).toBe(false)
  })
})
