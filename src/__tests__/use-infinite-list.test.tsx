// @vitest-environment jsdom
import { act, renderHook } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { useInfiniteList } from '../app/use-infinite-list'

type Callback = (entries: Array<{ isIntersecting: boolean }>) => void

/** Un IntersectionObserver de mentira: cada uno que se arma queda a la vista de la prueba, que decide cuándo «se ve» el final. */
const observers: Array<{ callback: Callback; options: IntersectionObserverInit | undefined; observe: ReturnType<typeof vi.fn>; disconnect: ReturnType<typeof vi.fn> }> = []

class FakeObserver {
  observe = vi.fn()
  disconnect = vi.fn()

  constructor(callback: Callback, options?: IntersectionObserverInit) {
    observers.push({ callback, options, observe: this.observe, disconnect: this.disconnect })
  }
}

beforeEach(() => {
  observers.length = 0
  vi.stubGlobal('IntersectionObserver', FakeObserver)
})

afterEach(() => vi.unstubAllGlobals())

/** El final de la lista, ya puesto en la pantalla (en la pantalla de verdad lo pone el elemento de abajo). */
function mount(total: number, key = 'a') {
  return renderHook(
    ({ total: size, key: resetKey }) => {
      const list = useInfiniteList(size, 12, resetKey)

      list.sentinel.current = document.createElement('div')

      return list
    },
    { initialProps: { total, key } },
  )
}

const lastObserver = () => observers.at(-1)!

describe('el scroll infinito', () => {
  it('muestra la primera página y suma otra cada vez que el final se acerca a la pantalla (con 600 px de adelanto)', () => {
    const view = mount(30)

    expect(view.result.current.limit).toBe(12)
    expect(view.result.current.hasMore).toBe(true)
    expect(lastObserver().options?.rootMargin).toBe('0px 0px 600px 0px')

    act(() => lastObserver().callback([{ isIntersecting: false }]))
    expect(view.result.current.limit).toBe(12)

    act(() => lastObserver().callback([{ isIntersecting: true }]))
    expect(view.result.current.limit).toBe(24)

    // Si con eso todavía queda a la vista, el observador nuevo avisa de nuevo y carga la que sigue, hasta el total.
    act(() => lastObserver().callback([{ isIntersecting: true }]))
    expect(view.result.current.limit).toBe(30)
    expect(view.result.current.hasMore).toBe(false)
  })

  it('al llegar al final no sigue mirando, y cambiar el filtro vuelve a la primera página', () => {
    const view = mount(20)

    act(() => lastObserver().callback([{ isIntersecting: true }]))
    expect(view.result.current.hasMore).toBe(false)
    const before = observers.length

    view.rerender({ total: 20, key: 'b' })
    expect(view.result.current.limit).toBe(12)
    expect(view.result.current.hasMore).toBe(true)
    expect(observers.length).toBeGreaterThan(before)
  })

  it('con menos de una página no hay nada más que cargar ni observador', () => {
    const view = mount(5)

    expect(view.result.current.hasMore).toBe(false)
    expect(observers).toHaveLength(0)
  })

  it('sin IntersectionObserver queda «cargar más» a mano', () => {
    vi.stubGlobal('IntersectionObserver', undefined)
    const view = mount(30)

    expect(view.result.current.limit).toBe(12)
    act(() => view.result.current.loadMore())
    expect(view.result.current.limit).toBe(24)
  })
})
