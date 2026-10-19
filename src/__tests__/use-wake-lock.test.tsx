// @vitest-environment jsdom
import { renderHook, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { useWakeLock } from '../app/use-wake-lock'

interface FakeSentinel {
  released: boolean
  release: ReturnType<typeof vi.fn>
}

function stubWakeLock(request?: () => Promise<FakeSentinel>) {
  const sentinels: FakeSentinel[] = []
  const requestLock = vi.fn(
    request ??
      (async () => {
        const sentinel: FakeSentinel = {
          released: false,
          release: vi.fn(async () => {
            sentinel.released = true
          }),
        }
        sentinels.push(sentinel)

        return sentinel
      }),
  )

  Object.defineProperty(navigator, 'wakeLock', { configurable: true, value: { request: requestLock } })

  return { requestLock, sentinels }
}

const setVisibility = (state: 'visible' | 'hidden') => {
  Object.defineProperty(document, 'visibilityState', { configurable: true, value: state })
  document.dispatchEvent(new Event('visibilitychange'))
}

beforeEach(() => {
  setVisibility('visible')
})

afterEach(() => {
  Reflect.deleteProperty(navigator, 'wakeLock')
})

describe('useWakeLock: la pantalla no se apaga en un duelo', () => {
  it('pide el bloqueo de pantalla mientras está activo y lo suelta al desmontarse', async () => {
    const { requestLock, sentinels } = stubWakeLock()
    const { unmount } = renderHook(() => useWakeLock(true))

    await waitFor(() => expect(sentinels).toHaveLength(1))
    expect(requestLock).toHaveBeenCalledWith('screen')

    unmount()
    expect(sentinels[0]!.release).toHaveBeenCalledTimes(1)
  })

  it('inactivo (el lobby) no pide nada, y al pasar a activo lo pide', async () => {
    const { requestLock, sentinels } = stubWakeLock()
    const { rerender } = renderHook(({ active }) => useWakeLock(active), { initialProps: { active: false } })

    expect(requestLock).not.toHaveBeenCalled()

    rerender({ active: true })
    await waitFor(() => expect(sentinels).toHaveLength(1))

    rerender({ active: false })
    expect(sentinels[0]!.release).toHaveBeenCalledTimes(1)
  })

  it('el navegador lo suelta al ocultar la pestaña: al volver se pide de nuevo (y con el bloqueo vigente no se pide otro)', async () => {
    const { requestLock, sentinels } = stubWakeLock()

    renderHook(() => useWakeLock(true))
    await waitFor(() => expect(sentinels).toHaveLength(1))

    // Volver a ver la pestaña con el bloqueo todavía vigente no pide otro.
    setVisibility('visible')
    expect(requestLock).toHaveBeenCalledTimes(1)

    // El navegador lo soltó al ocultarla.
    sentinels[0]!.released = true
    setVisibility('hidden')
    expect(requestLock).toHaveBeenCalledTimes(1)
    setVisibility('visible')
    await waitFor(() => expect(requestLock).toHaveBeenCalledTimes(2))
  })

  it('si el navegador no tiene la API, o no la concede, no pasa nada', async () => {
    expect(() => renderHook(() => useWakeLock(true))).not.toThrow()

    const { requestLock } = stubWakeLock(() => Promise.reject(new DOMException('Battery saver', 'NotAllowedError')))
    const { unmount } = renderHook(() => useWakeLock(true))

    await waitFor(() => expect(requestLock).toHaveBeenCalledTimes(1))
    expect(() => unmount()).not.toThrow()
  })

  it('si se desmontó antes de que el navegador respondiera, suelta el bloqueo que llegó tarde', async () => {
    let resolve: (sentinel: FakeSentinel) => void = () => {}
    const late = new Promise<FakeSentinel>((done) => {
      resolve = done
    })
    const sentinel: FakeSentinel = { released: false, release: vi.fn(async () => undefined) }
    const { requestLock } = stubWakeLock(() => late)
    const { unmount } = renderHook(() => useWakeLock(true))

    await waitFor(() => expect(requestLock).toHaveBeenCalledTimes(1))
    unmount()
    resolve(sentinel)

    await waitFor(() => expect(sentinel.release).toHaveBeenCalledTimes(1))
  })
})
