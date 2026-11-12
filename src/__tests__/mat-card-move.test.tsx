// @vitest-environment jsdom
import { configureStore } from '@reduxjs/toolkit'
import { cleanup, fireEvent, render as renderBare, screen } from '@testing-library/react'
import '@testing-library/jest-dom'
import type { ReactElement } from 'react'
import { Provider } from 'react-redux'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { clampOffset, matCardPositionKey, readOffset } from '../app/use-draggable-offset'
import { MatPrompt } from '../components/duel/MatPrompt'

// En escritorio, los carteles de la mesa (la pregunta del medio y su asa) se llevan con el mouse a cualquier lado, como las mascotas: por su cabeza, sin redibujar,
// acotados a la ventana, recordados por lugar; doble clic, a su lugar; Alt + flechas con el foco adentro. Con el dedo sigue el gesto de minimizar. jsdom no mide: cada cartel está en
// (400, 300) y mide 384 × 200 (el asa, 240 × 56), corrido por su `translate`, en una ventana de 1280 × 800.

const store = configureStore({ reducer: { settings: (state = { handSize: 5, deckFormat: 'unlimited' as const }) => state } })
const render = (ui: ReactElement) => renderBare(ui, { wrapper: ({ children }) => <Provider store={store}>{children}</Provider> })
const offsetOf = (translate: string) => {
  const [x = '0', y = '0'] = translate.split(' ')

  return { x: Number.parseFloat(x) || 0, y: Number.parseFloat(y) || 0 }
}

let desktop = true
const original = { matchMedia: window.matchMedia, rect: Element.prototype.getBoundingClientRect }

beforeEach(() => {
  desktop = true
  localStorage.clear()
  window.scrollTo = () => {}
  Object.defineProperty(window, 'innerWidth', { configurable: true, value: 1280 })
  Object.defineProperty(window, 'innerHeight', { configurable: true, value: 800 })
  window.matchMedia = ((query: string) => ({ matches: desktop && query === '(min-width: 1101px)', media: query, addEventListener: () => {}, removeEventListener: () => {}, addListener: () => {}, removeListener: () => {}, onchange: null, dispatchEvent: () => false })) as typeof window.matchMedia
  Element.prototype.getBoundingClientRect = function (this: HTMLElement) {
    const card = this.matches('[data-prompt]')
    const handle = this.matches('[data-minimized]')
    const { x, y } = offsetOf(this.style?.translate ?? '')
    // El armazón de la app (recorta al lado del menú de 76 px).
    const frame = this.hasAttribute('data-frame')
    const [width, height] = frame ? [1204, 800] : handle ? [240, 56] : card ? [384, 200] : [0, 0]
    const left = frame ? 76 : card ? 400 + x : 0
    const top = card ? 300 + y : 0

    return { left, top, width, height, right: left + width, bottom: top + height, x: left, y: top, toJSON: () => ({}) } as DOMRect
  }
  vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) => {
    callback(0)
    return 1
  })
  vi.stubGlobal('cancelAnimationFrame', () => {})
})

afterEach(() => {
  cleanup()
  window.matchMedia = original.matchMedia
  Element.prototype.getBoundingClientRect = original.rect
  vi.unstubAllGlobals()
})

const mouse = { pointerId: 1, pointerType: 'mouse', isPrimary: true }

/** Arrastra con el mouse desde (500, 320) hasta `(dx, dy)` más allá y suelta; como el navegador, después llega el clic. */
function drag(element: Element, dx: number, dy: number, base: Record<string, unknown> = mouse) {
  fireEvent.pointerDown(element, { ...base, button: 0, buttons: 1, clientX: 500, clientY: 320 })
  fireEvent.pointerMove(element, { ...base, buttons: 1, clientX: 500 + dx / 2, clientY: 320 + dy / 2 })
  fireEvent.pointerMove(element, { ...base, buttons: 1, clientX: 500 + dx, clientY: 320 + dy })
  fireEvent.pointerUp(element, { ...base, button: 0, buttons: 0, clientX: 500 + dx, clientY: 320 + dy })
  fireEvent.click(element)
}

const onYes = vi.fn()
const prompt = () =>
  render(
    <MatPrompt kind="ask" label="¿Activás el efecto?" head={<p className="m-0">¿Activás el efecto?</p>}>
      <button type="button" onClick={onYes}>
        Sí
      </button>
    </MatPrompt>,
  )
const cartel = () => document.querySelector<HTMLElement>('[data-prompt="ask"]')!
const head = () => screen.getByText('¿Activás el efecto?', { selector: 'p' })
const saved = (place: 'prompt') => JSON.parse(localStorage.getItem(matCardPositionKey(place)) ?? 'null') as unknown

describe('acotar y recordar (lógica pura)', () => {
  const box = { left: 400, top: 300, width: 384, height: 200 }
  const view = { left: 0, top: 0, right: 1280, bottom: 800 }

  it('queda entero en lo que se ve; si no entra, con la cabeza (arriba a la izquierda) en su borde', () => {
    expect(clampOffset({ x: 100, y: -100 }, box, view)).toEqual({ x: 100, y: -100 })
    expect(clampOffset({ x: 5000, y: 5000 }, box, view)).toEqual({ x: 496, y: 300 })
    expect(clampOffset({ x: -5000, y: -5000 }, box, view)).toEqual({ x: -400, y: -300 })
    expect(clampOffset({ x: 50, y: 50 }, { ...box, width: 2000, height: 900 }, view)).toEqual({ x: -400, y: -300 })
    // El armazón recorta al lado del menú (76 px): no pasa por debajo.
    expect(clampOffset({ x: -5000, y: 0 }, box, { ...view, left: 76 })).toEqual({ x: -324, y: 0 })
  })

  it('sólo lee números finitos de lo guardado', () => {
    localStorage.setItem('k', '{"x":12,"y":-4}')
    expect(readOffset('k')).toEqual({ x: 12, y: -4 })
    for (const bad of ['{"x":null,"y":3}', '{"x":"1","y":2}', 'nope', '[1,2]']) {
      localStorage.setItem('k', bad)
      expect(readOffset('k')).toEqual({ x: 0, y: 0 })
    }
  })
})

describe('la pregunta del medio (MatPrompt) desde 1101 px', () => {
  it('sin moverla, queda donde siempre: sin translate, sin nada guardado; un clic sin arrastre no la mueve', () => {
    prompt()
    expect(cartel().style.translate).toBe('')
    expect(cartel()).not.toHaveAttribute('data-moved')
    drag(head(), 3, 2)
    expect(cartel().style.translate).toBe('')
    expect(saved('prompt')).toBeNull()
    expect(head().parentElement!.parentElement!.parentElement).toHaveAttribute('title', expect.stringContaining('Doble clic'))
  })

  it('con el mouse, la cabeza la lleva a otro lado (sin minimizarla) y se recuerda; los botones siguen andando', () => {
    onYes.mockClear()
    prompt()
    drag(head(), 100, 150)
    expect(cartel().style.translate).toBe('100px 150px')
    expect(cartel()).not.toHaveAttribute('data-minimized')
    expect(cartel()).toHaveAttribute('data-moved')
    expect(saved('prompt')).toEqual({ x: 100, y: 150 })
    fireEvent.click(screen.getByRole('button', { name: 'Sí' }))
    expect(onYes).toHaveBeenCalledTimes(1)
    // Otra vez, desde donde quedó.
    drag(head(), -50, -20)
    expect(saved('prompt')).toEqual({ x: 50, y: 130 })
  })

  it('arrancar sobre un botón de la cabeza no la mueve, y el botón sigue siendo un clic', () => {
    prompt()
    drag(screen.getByRole('button', { name: 'Minimizar' }), 120, 0)
    expect(saved('prompt')).toBeNull()
    expect(cartel()).toHaveAttribute('data-minimized')
  })

  it('con el dedo no se mueve: arrastrar la cabeza hacia abajo sigue minimizándola', () => {
    prompt()
    drag(head(), 0, 120, { pointerId: 7, pointerType: 'touch', isPrimary: true })
    expect(saved('prompt')).toBeNull()
    expect(cartel()).toHaveAttribute('data-minimized')
    expect(cartel().style.translate).toBe('')
  })

  it('se acota a la ventana, y otra vez al achicarla sin olvidar dónde la dejó', () => {
    prompt()
    drag(head(), 5000, -5000)
    expect(cartel().style.translate).toBe('496px -300px')
    expect(saved('prompt')).toEqual({ x: 496, y: -300 })
    Object.defineProperty(window, 'innerWidth', { configurable: true, value: 1100 })
    fireEvent(window, new Event('resize'))
    expect(cartel().style.translate).toBe('316px -300px')
    expect(saved('prompt')).toEqual({ x: 496, y: -300 })
  })

  it('una pregunta nueva sale donde la dejó la persona; doble clic en la cabeza la devuelve a su lugar', () => {
    localStorage.setItem(matCardPositionKey('prompt'), '{"x":-120,"y":60}')
    prompt()
    expect(cartel().style.translate).toBe('-120px 60px')
    fireEvent.doubleClick(head())
    expect(cartel().style.translate).toBe('')
    expect(saved('prompt')).toBeNull()
  })

  it('con el foco adentro, Alt + flechas la mueven (y no hacen otra cosa); sin Alt, nada', () => {
    prompt()
    const yes = screen.getByRole('button', { name: 'Sí' })

    expect(cartel()).toHaveAttribute('aria-keyshortcuts', expect.stringContaining('Alt+ArrowLeft'))
    expect(cartel()).toHaveAttribute('aria-description', expect.stringContaining('Alt + flechas'))
    expect(cartel()).toHaveTextContent(/^¿Activás el efecto\?Sí$/)
    expect(fireEvent.keyDown(yes, { key: 'ArrowRight', altKey: true })).toBe(false)
    fireEvent.keyDown(yes, { key: 'ArrowDown', altKey: true })
    fireEvent.keyDown(yes, { key: 'ArrowDown' })
    expect(cartel().style.translate).toBe('16px 16px')
    expect(saved('prompt')).toEqual({ x: 16, y: 16 })
  })

  it('minimizada, el asa también se lleva (la misma posición) y su flecha la sigue abriendo', () => {
    prompt()
    fireEvent.click(screen.getByRole('button', { name: 'Minimizar' }))
    drag(screen.getByText('¿Activás el efecto?', { selector: '[data-minimized] p' }), -60, -40)
    expect(cartel()).toHaveAttribute('data-minimized')
    expect(cartel().style.translate).toBe('-60px -40px')
    fireEvent.click(screen.getByRole('button', { name: 'Mostrar la pregunta' }))
    expect(cartel()).not.toHaveAttribute('data-minimized')
    expect(cartel().style.translate).toBe('-60px -40px')
  })

  it('en el celular (la hoja de abajo) no se mueve ni usa lo guardado', () => {
    desktop = false
    localStorage.setItem(matCardPositionKey('prompt'), '{"x":-120,"y":60}')
    prompt()
    expect(cartel().style.translate).toBe('')
    expect(cartel()).not.toHaveAttribute('aria-keyshortcuts')
  })

  it('no pasa por debajo de lo que la recorta (el armazón, al lado del menú)', () => {
    render(
      <div data-frame="" style={{ overflowX: 'hidden', overflowY: 'hidden' }}>
        <MatPrompt kind="ask" label="¿Activás el efecto?" head={<p className="m-0">¿Activás el efecto?</p>}>
          <button type="button">Sí</button>
        </MatPrompt>
      </div>,
    )
    drag(head(), -5000, 0)
    expect(cartel().style.translate).toBe('-324px 0')
  })
})
