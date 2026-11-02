// @vitest-environment jsdom
import { configureStore } from '@reduxjs/toolkit'
import { cleanup, fireEvent, render as renderBare, screen, within } from '@testing-library/react'
import '@testing-library/jest-dom'
import type { ReactElement } from 'react'
import { Provider } from 'react-redux'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { CardPicker, type PickCard } from '../components/auto/CardPicker'
import { MatPrompt } from '../components/duel/MatPrompt'

const store = configureStore({ reducer: { settings: (state = { handSize: 5, deckFormat: 'unlimited' as const }) => state } })
const render = (ui: ReactElement) => renderBare(ui, { wrapper: ({ children }) => <Provider store={store}>{children}</Provider> })

// Las hojas del duelo y los carteles de la mesa se minimizan arrastrando su franja de arriba hacia abajo y se abren arrastrando su asa hacia arriba, además de la flecha de siempre.

const CARDS: PickCard[] = [
  { key: 'a', name: 'Fallen of Albaz', art: null, place: 'Mano' },
  { key: 'b', name: 'Aluber the Jester of Despia', art: null, place: 'Cementerio' },
]

/** Arrastra en vertical con el dedo (`dy` px, positivo hacia abajo) y suelta a los `elapsed` ms: lento, decide la distancia. */
function drag(element: Element, dy: number, elapsed = 400) {
  const base = { pointerId: 7, pointerType: 'touch', isPrimary: true }

  fireEvent.pointerDown(element, { ...base, button: 0, buttons: 1, clientX: 120, clientY: 300 })
  fireEvent.pointerMove(element, { ...base, buttons: 1, clientX: 120, clientY: 300 + dy / 2 })
  fireEvent.pointerMove(element, { ...base, buttons: 1, clientX: 120, clientY: 300 + dy })
  const up = new Event('pointerup', { bubbles: true, cancelable: true })

  Object.assign(up, { ...base, button: 0, buttons: 0, clientX: 120, clientY: 300 + dy })
  Object.defineProperty(up, 'timeStamp', { value: performance.now() + elapsed })
  fireEvent(element, up)
  // Como el navegador: tras soltar, llega el clic.
  fireEvent.click(element)
}

beforeEach(() => {
  window.scrollTo = () => {}
  vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) => {
    callback(0)
    return 1
  })
  vi.stubGlobal('cancelAnimationFrame', () => {})
})

afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
})

describe('una hoja del duelo (Modal lowerable)', () => {
  const picker = (onCancel = () => {}) => render(<CardPicker title="Elegí qué agregar a tu mano" kicker="Branded Fusion" cards={CARDS} min={1} max={2} onPick={() => {}} onCancel={onCancel} />)
  const dialog = () => screen.getByRole('dialog', { name: 'Elegí qué agregar a tu mano' })
  const title = () => within(dialog()).getByRole('heading', { name: 'Elegí qué agregar a tu mano' })

  it('arrastrar el encabezado hacia abajo la minimiza: el cartel sigue al dedo, se suelta en su lugar y nada se contesta', () => {
    const onCancel = vi.fn()

    picker(onCancel)
    fireEvent.pointerDown(title(), { pointerId: 7, pointerType: 'touch', button: 0, buttons: 1, clientX: 120, clientY: 300 })
    fireEvent.pointerMove(title(), { pointerId: 7, pointerType: 'touch', buttons: 1, clientX: 120, clientY: 340 })
    expect(dialog().style.getPropertyValue('--tw-translate-y')).toBe('calc(-50% + 40px)')
    // Hacia arriba no la sube más allá de su lugar.
    fireEvent.pointerMove(title(), { pointerId: 7, pointerType: 'touch', buttons: 1, clientX: 120, clientY: 250 })
    expect(dialog().style.getPropertyValue('--tw-translate-y')).toBe('calc(-50% + 0px)')
    fireEvent.pointerCancel(title(), { pointerId: 7 })
    expect(dialog().style.getPropertyValue('--tw-translate-y')).toBe('')

    drag(title(), 120)
    expect(dialog()).toHaveAttribute('data-minimized')
    expect(dialog().style.getPropertyValue('--tw-translate-y')).toBe('')
    expect(within(dialog()).getByRole('button', { name: 'Mostrar la pregunta' })).toHaveFocus()
    expect(onCancel).not.toHaveBeenCalled()
  })

  it('un arrastre corto o hacia arriba no la minimiza y el clic que sigue a un arrastre no cierra ni cancela', () => {
    const onCancel = vi.fn()

    picker(onCancel)
    drag(title(), 30)
    expect(dialog()).not.toHaveAttribute('data-minimized')
    drag(title(), -150)
    expect(dialog()).not.toHaveAttribute('data-minimized')
    // Un arrastre que empieza en la X y baja no cierra ni cancela (el clic que sigue se descarta).
    drag(within(dialog()).getByRole('button', { name: 'Cerrar' }), 120)
    expect(dialog()).toHaveAttribute('data-minimized')
    expect(onCancel).not.toHaveBeenCalled()
  })

  it('minimizada, arrastrar el asa hacia arriba la abre (la flecha sigue valiendo); un arrastre corto no', () => {
    picker()
    drag(title(), 120)
    const handle = () => within(dialog()).getByRole('button', { name: 'Mostrar la pregunta' }).parentElement!

    drag(handle(), -20)
    expect(dialog()).toHaveAttribute('data-minimized')
    drag(handle(), -90)
    expect(dialog()).not.toHaveAttribute('data-minimized')
    expect(within(dialog()).getByRole('button', { name: 'Minimizar' })).toHaveFocus()

    fireEvent.click(within(dialog()).getByRole('button', { name: 'Minimizar' }))
    fireEvent.click(within(dialog()).getByRole('button', { name: 'Mostrar la pregunta' }))
    expect(dialog()).not.toHaveAttribute('data-minimized')
  })
})

describe('un cartel de la mesa (MatPrompt, desde 1101 px: en el celular es la hoja de abajo)', () => {
  const original = window.matchMedia

  beforeEach(() => {
    window.matchMedia = ((query: string) => ({ matches: query === '(min-width: 1101px)', media: query, addEventListener: () => {}, removeEventListener: () => {}, addListener: () => {}, removeListener: () => {}, onchange: null, dispatchEvent: () => false })) as typeof window.matchMedia
  })
  afterEach(() => {
    window.matchMedia = original
  })

  const prompt = () =>
    render(
      <MatPrompt kind="ask" label="¿Activás el efecto?" head={<p className="m-0">¿Activás el efecto?</p>}>
        <button type="button">Sí</button>
      </MatPrompt>,
    )

  it('arrastrar su fila de arriba hacia abajo lo minimiza al asa y arrastrar el asa hacia arriba lo abre', () => {
    prompt()
    const cartel = () => document.querySelector<HTMLElement>('[data-prompt="ask"]')!

    fireEvent.pointerDown(screen.getByText('¿Activás el efecto?'), { pointerId: 7, pointerType: 'touch', button: 0, buttons: 1, clientX: 120, clientY: 300 })
    fireEvent.pointerMove(screen.getByText('¿Activás el efecto?'), { pointerId: 7, pointerType: 'touch', buttons: 1, clientX: 120, clientY: 330 })
    expect(cartel().style.translate).toBe('0 30px')
    fireEvent.pointerCancel(screen.getByText('¿Activás el efecto?'), { pointerId: 7 })
    expect(cartel().style.translate).toBe('')

    drag(screen.getByText('¿Activás el efecto?'), 100)
    expect(cartel()).toHaveAttribute('data-minimized')
    drag(cartel(), -100)
    expect(cartel()).not.toHaveAttribute('data-minimized')
    expect(screen.getByRole('button', { name: 'Sí' })).toBeInTheDocument()
  })
})
