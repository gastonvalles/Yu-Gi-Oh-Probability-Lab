// @vitest-environment jsdom
import { renderHook } from '@testing-library/react'
import { beforeEach, describe, expect, it } from 'vitest'

import { useDraggablePosition } from '../app/use-draggable-position'

beforeEach(() => {
  localStorage.clear()
  window.matchMedia = ((query: string) => ({ matches: query.includes('max-width'), addEventListener: () => {}, removeEventListener: () => {} })) as unknown as typeof window.matchMedia
})

describe('botones flotantes que arrancan encimados', () => {
  it('se separan al montar pero no guardan nada: depende del tamaño de pantalla de ese momento', () => {
    const first = renderHook(() => useDraggablePosition({ storageKey: 'test:a', size: 56, group: 'test-group' }))
    const second = renderHook(() => useDraggablePosition({ storageKey: 'test:b', size: 56, group: 'test-group' }))

    const a = first.result.current.position
    const b = second.result.current.position

    // Los dos pidieron el mismo rincón, pero no quedan encimados.
    expect(Math.hypot(a.x - b.x, a.y - b.y)).toBeGreaterThanOrEqual(56)
    expect(localStorage.getItem('test:a')).toBeNull()
    expect(localStorage.getItem('test:b')).toBeNull()
  })
})
