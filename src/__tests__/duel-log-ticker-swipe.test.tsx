// @vitest-environment jsdom
import { act, fireEvent, render, screen } from '@testing-library/react'
import '@testing-library/jest-dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { DuelLogTicker } from '../components/duel/DuelBar'
import type { FeedEntry } from '../components/duel/use-duel-feed'
import { SWIPE_MS } from '../app/use-swipe-away'

const event = (id: string, text: string, side: 'mine' | 'theirs' = 'mine'): FeedEntry => ({ id, kind: 'event', side, text })

const FEED = [event('e1', 'Ana hace una Invocación Normal', 'theirs'), event('e2', 'Barajás el deck')]

const banner = () => screen.queryByRole('button', { name: /Abrir el registro de jugadas/ })

/** Arrastra el cartel de costado (con el dedo): apretar, mover y soltar. Los tiempos son los de `timeStamp` de cada evento. */
function drag(element: HTMLElement, from: { x: number; y: number }, to: { x: number; y: number }, elapsed = 400) {
  const base = { pointerId: 7, pointerType: 'touch', isPrimary: true }

  fireEvent.pointerDown(element, { ...base, button: 0, buttons: 1, clientX: from.x, clientY: from.y })
  fireEvent.pointerMove(element, { ...base, buttons: 1, clientX: (from.x + to.x) / 2, clientY: (from.y + to.y) / 2 })
  fireEvent.pointerMove(element, { ...base, buttons: 1, clientX: to.x, clientY: to.y })
  // El tiempo del gesto se lee del `timeStamp` del evento: se fija el del que suelta.
  const up = new Event('pointerup', { bubbles: true, cancelable: true })

  Object.assign(up, { ...base, button: 0, buttons: 0, clientX: to.x, clientY: to.y })
  Object.defineProperty(up, 'timeStamp', { value: performance.now() + elapsed })
  fireEvent(element, up)
}

describe('el cartel del registro sobre el campo se saca con el dedo', () => {
  beforeEach(() => {
    vi.useFakeTimers()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('un toque abre el registro y un arrastre largo de costado lo saca sin abrirlo; queda el lugar reservado', () => {
    const onOpen = vi.fn()
    const { container } = render(<DuelLogTicker feed={FEED} onOpen={onOpen} />)

    fireEvent.click(banner()!)
    expect(onOpen).toHaveBeenCalledTimes(1)

    // Lo arrastrado no es un toque: el clic que viene detrás no abre nada.
    drag(banner()!, { x: 300, y: 20 }, { x: 100, y: 22 })
    fireEvent.click(banner()!)
    expect(onOpen).toHaveBeenCalledTimes(1)

    // Se va hacia donde se lo mandó y, al terminar la salida, ya no está; el lugar queda (el campo no se corre).
    expect(banner()).toBeInTheDocument()
    act(() => {
      vi.advanceTimersByTime(SWIPE_MS + 100)
    })
    expect(banner()).not.toBeInTheDocument()
    expect(container.firstElementChild).toHaveAttribute('aria-hidden', 'true')
    expect(container.firstElementChild!.className).toContain('min-h-11')
  })

  it('un arrastre corto y lento vuelve a su lugar (el cartel sigue ahí) y un arrastre vertical no lo saca', () => {
    render(<DuelLogTicker feed={FEED} onOpen={vi.fn()} />)

    drag(banner()!, { x: 200, y: 20 }, { x: 214, y: 20 }, 600)
    act(() => {
      vi.advanceTimersByTime(SWIPE_MS + 200)
    })
    expect(banner()).toBeInTheDocument()

    // Más para arriba que de costado: es de la página, no del cartel.
    drag(banner()!, { x: 200, y: 200 }, { x: 260, y: 20 })
    act(() => {
      vi.advanceTimersByTime(SWIPE_MS + 200)
    })
    expect(banner()).toBeInTheDocument()
  })

  it('un tirón corto y rápido también lo saca, hacia cualquier lado', () => {
    render(<DuelLogTicker feed={FEED} onOpen={vi.fn()} />)

    drag(banner()!, { x: 100, y: 20 }, { x: 140, y: 20 }, 30)
    act(() => {
      vi.advanceTimersByTime(SWIPE_MS + 100)
    })
    expect(banner()).not.toBeInTheDocument()
  })

  it('con Supr desde el teclado también se saca', () => {
    render(<DuelLogTicker feed={FEED} onOpen={vi.fn()} />)

    banner()!.focus()
    fireEvent.keyDown(banner()!, { key: 'Delete' })
    act(() => {
      vi.advanceTimersByTime(SWIPE_MS + 100)
    })
    expect(banner()).not.toBeInTheDocument()
  })

  it('la próxima jugada lo vuelve a mostrar, con lo nuevo solo (no con lo que ya se sacó)', () => {
    const view = render(<DuelLogTicker feed={FEED} onOpen={vi.fn()} />)

    drag(banner()!, { x: 300, y: 20 }, { x: 100, y: 20 })
    act(() => {
      vi.advanceTimersByTime(SWIPE_MS + 100)
    })
    expect(banner()).not.toBeInTheDocument()

    view.rerender(<DuelLogTicker feed={[...FEED, event('e3', 'Robás una carta')]} onOpen={vi.fn()} />)

    expect(banner()).toBeInTheDocument()
    expect(screen.getByText('Robás una carta')).toBeInTheDocument()
    expect(screen.queryByText('Barajás el deck')).not.toBeInTheDocument()
    expect(screen.queryByText('Ana hace una Invocación Normal')).not.toBeInTheDocument()
  })

  it('con movimiento reducido se va de una, sin esperar la salida', () => {
    const original = window.matchMedia

    window.matchMedia = ((query: string) => ({ matches: query.includes('reduce'), media: query, addEventListener: vi.fn(), removeEventListener: vi.fn() })) as unknown as typeof window.matchMedia
    render(<DuelLogTicker feed={FEED} onOpen={vi.fn()} />)

    drag(banner()!, { x: 300, y: 20 }, { x: 100, y: 20 })
    expect(banner()).not.toBeInTheDocument()
    window.matchMedia = original
  })

  it('sin jugadas deja el lugar reservado y no hay nada que sacar', () => {
    const { container } = render(<DuelLogTicker feed={[]} onOpen={vi.fn()} />)

    expect(banner()).not.toBeInTheDocument()
    expect(container.firstElementChild).toHaveAttribute('aria-hidden', 'true')
  })
})
