// @vitest-environment jsdom
// Cuántas veces se dibuja la mesa entera por jugada: los commits de React en los que se dibujó `PracticeMat` (un Profiler alrededor y `useMatPanels`, que sólo usa ella, como espía).
// La jugada se dibuja una vez, con sus efectos ya puestos (antes eran dos: un efecto los fijaba después, con los vuelos en el aire), y lo que se va solo, en una más (el destello y la carta
// grande de una activación, juntos).
import { act, fireEvent, screen, within } from '@testing-library/react'
import '@testing-library/jest-dom'
import { Profiler } from 'react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { Harness, hand, phaseButton, render, tap } from './support/practice-mat-harness'

vi.mock('../ygoprodeck', () => ({ fetchCardsByIds: vi.fn(async () => []) }))

const spy = vi.hoisted(() => ({ renders: 0, seen: 0, commits: 0 }))

vi.mock('../app/mat-panels', async () => {
  const actual = await vi.importActual<typeof import('../app/mat-panels')>('../app/mat-panels')

  return {
    ...actual,
    useMatPanels: (...args: Parameters<typeof actual.useMatPanels>) => {
      spy.renders += 1
      return actual.useMatPanels(...args)
    },
  }
})

/** Un commit cuenta si la mesa se dibujó desde el anterior (un hijo que se dibuja solo no es la mesa). */
const onCommit = () => {
  if (spy.renders !== spy.seen) spy.commits += 1
  spy.seen = spy.renders
}

beforeEach(() => {
  localStorage.clear()
  HTMLElement.prototype.setPointerCapture = () => {}
  window.matchMedia = ((query: string) => ({ matches: query.includes('reduce'), media: query, addEventListener: () => {}, removeEventListener: () => {}, addListener: () => {}, removeListener: () => {}, onchange: null, dispatchEvent: () => false })) as typeof window.matchMedia
  window.requestAnimationFrame = (callback) => {
    callback(0)
    return 1
  }
  window.cancelAnimationFrame = () => {}
})

/** Los dibujos de la mesa que hace `play` y, después, los de lo que se va solo. */
function count(play: () => void): { play: number; after: number } {
  const before = spy.commits
  play()
  const played = spy.commits
  act(() => {
    vi.advanceTimersByTime(2000)
  })

  return { play: played - before, after: spy.commits - played }
}

describe('los dibujos de la mesa por jugada', () => {
  it('una invocación, una activación y un cambio de fase se dibujan una vez, y lo que se va solo, una vez más', () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'Date'] })

    try {
      render(
        <Profiler id="spy" onRender={onCommit}>
          <Harness />
        </Profiler>,
      )

      tap(within(hand()).getByRole('listitem', { name: 'Ash Blossom' }))
      fireEvent.click(screen.getByRole('menuitem', { name: 'Invocación Normal' }))
      expect(count(() => fireEvent.click(screen.getByRole('button', { name: 'Zona de monstruo 1: elegir' })))).toEqual({ play: 1, after: 1 })
      expect(document.querySelector('[data-fx="landing"]')).toBeNull()

      tap(within(hand()).getByRole('listitem', { name: 'Maxx C' }))
      expect(count(() => fireEvent.click(screen.getByRole('menuitem', { name: 'Activar efecto' })))).toEqual({ play: 1, after: 1 })
      expect(document.querySelector('[data-activation]')).toBeNull()

      fireEvent.click(phaseButton())
      expect(count(() => fireEvent.click(screen.getByRole('menuitem', { name: 'Ir a Main Phase 1' })))).toEqual({ play: 1, after: 1 })
      expect(document.querySelector('[data-fx="banner"]')).toBeNull()
    } finally {
      vi.useRealTimers()
    }
  })
})
