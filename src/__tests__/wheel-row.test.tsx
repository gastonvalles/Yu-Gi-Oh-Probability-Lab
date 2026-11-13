// @vitest-environment jsdom
import { configureStore } from '@reduxjs/toolkit'
import { cleanup, fireEvent, render as renderBare, screen } from '@testing-library/react'
import type { ReactElement } from 'react'
import { Provider } from 'react-redux'
import { afterEach, describe, expect, it } from 'vitest'

import { wheelRowStep } from '../app/use-wheel-row'
import { PickGrid, TRAY } from '../components/auto/CardPicker'

/** La ruedita en escritorio: la fila que sólo se desliza de costado (la bandeja de cartas) se mueve de costado con la rueda vertical; una lista vertical, no. */
afterEach(cleanup)

const store = configureStore({ reducer: { settings: (state = { handSize: 5, deckFormat: 'unlimited' as const }) => state } })
const render = (ui: ReactElement) => renderBare(ui, { wrapper: ({ children }) => <Provider store={store}>{children}</Provider> })

const size = (element: HTMLElement, scrollWidth: number, clientWidth: number) => {
  Object.defineProperty(element, 'scrollWidth', { configurable: true, value: scrollWidth })
  Object.defineProperty(element, 'clientWidth', { configurable: true, value: clientWidth })
}
const CARDS = ['a', 'b', 'c'].map((key) => ({ key, name: `Carta ${key}`, art: null }))

describe('la ruedita en una fila de costado', () => {
  it('el paso: la rueda vertical, de costado y hasta el borde; Mayús, la rueda horizontal o una fila que no se desliza, nada (el navegador ya lo hace)', () => {
    const row = { scrollLeft: 10, scrollWidth: 500, clientWidth: 200, clientHeight: 100 }
    const wheel = (deltaY: number, more: Partial<WheelEvent> = {}) => wheelRowStep(row, { deltaX: 0, deltaY, deltaMode: 0, shiftKey: false, ...more })

    expect(wheel(100)).toBe(110)
    expect(wheel(-100)).toBe(0)
    expect(wheel(1000)).toBe(300)
    expect(wheelRowStep({ ...row, scrollLeft: 300 }, { deltaX: 0, deltaY: 100, deltaMode: 0, shiftKey: false })).toBeNull()
    expect(wheel(3, { deltaMode: 1 })).toBe(58)
    expect(wheel(100, { shiftKey: true })).toBeNull()
    expect(wheel(10, { deltaX: 40 })).toBeNull()
    expect(wheelRowStep({ ...row, scrollWidth: 200 }, { deltaX: 0, deltaY: 100, deltaMode: 0, shiftKey: false })).toBeNull()
  })

  it('un `wheel` vertical sobre la bandeja cambia su `scrollLeft` y no pasa a la página; sobre una lista que no se desliza de costado, no la toca', () => {
    render(<PickGrid label="Bandeja" cards={CARDS} chosen={[]} onToggle={() => {}} multi={false} className={TRAY} />)
    const tray = screen.getByRole('listbox', { name: 'Bandeja' })

    size(tray, 600, 200)
    const moved = fireEvent.wheel(tray, { deltaY: 120 })

    expect(tray.scrollLeft).toBe(120)
    expect(moved).toBe(false)
    cleanup()

    render(<PickGrid label="Lista" cards={CARDS} chosen={[]} onToggle={() => {}} multi={false} />)
    const list = screen.getByRole('listbox', { name: 'Lista' })

    size(list, 200, 200)
    expect(fireEvent.wheel(list, { deltaY: 120 })).toBe(true)
    expect(list.scrollLeft).toBe(0)
  })
})
