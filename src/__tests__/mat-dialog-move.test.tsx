// @vitest-environment jsdom
import { configureStore } from '@reduxjs/toolkit'
import { cleanup, fireEvent, render as renderBare, screen } from '@testing-library/react'
import '@testing-library/jest-dom'
import type { ReactElement } from 'react'
import { Provider } from 'react-redux'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { matCardPositionKey } from '../app/use-draggable-offset'
import { PileViewer } from '../components/probability/MatDialogs'
import { Modal } from '../components/ui/Modal'

// En escritorio, los diálogos de la mesa (`Modal anchor="mat"`) y el visor de una pila se llevan con el mouse por su fila de arriba, como la pregunta del medio: el `Modal` suma el corrimiento
// a su centrado (`--drag-x`, `--drag-y`), el visor con su `translate`. jsdom no mide: cada panel está en (400, 300) y mide 384 × 200 (el asa, 240 × 56), en una ventana de 1280 × 800.

const store = configureStore({ reducer: { settings: (state = { handSize: 5, deckFormat: 'unlimited' as const }) => state } })
const render = (ui: ReactElement) => renderBare(ui, { wrapper: ({ children }) => <Provider store={store}>{children}</Provider> })
const px = (value: string) => Number.parseFloat(value) || 0
/** Lo corrido: el `translate` (el visor, un `Modal` sin mesa) o las variables (el `Modal` de la mesa). */
const offsetOf = (element: HTMLElement) => {
  const [x = '0', y = '0'] = (element.style?.translate ?? '').split(' ')

  return { x: px(x) + px(element.style?.getPropertyValue('--drag-x') ?? ''), y: px(y) + px(element.style?.getPropertyValue('--drag-y') ?? '') }
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
    const panel = this.matches('[role="dialog"], [role="alertdialog"]')
    const handle = panel && this.matches('[data-minimized]')
    const { x, y } = offsetOf(this)
    // El recuadro del armazón (al lado del menú de 76 px): el que contiene a `#contenido`.
    const frame = this.hasAttribute('data-frame')
    const [width, height] = frame ? [1204, 800] : handle ? [240, 56] : panel ? [384, 200] : [0, 0]
    const left = frame ? 76 : panel ? 400 + x : 0
    const top = panel ? 300 + y : 0

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

/** Arrastra con el mouse desde (500, 320) hasta `(dx, dy)` más allá y suelta sobre lo mismo (la captura del puntero). */
function drag(element: Element, dx: number, dy: number) {
  fireEvent.pointerDown(element, { ...mouse, button: 0, buttons: 1, clientX: 500, clientY: 320 })
  fireEvent.pointerMove(element, { ...mouse, buttons: 1, clientX: 500 + dx / 2, clientY: 320 + dy / 2 })
  fireEvent.pointerMove(element, { ...mouse, buttons: 1, clientX: 500 + dx, clientY: 320 + dy })
  fireEvent.pointerUp(element, { ...mouse, button: 0, buttons: 0, clientX: 500 + dx, clientY: 320 + dy })
}

const saved = (place: 'prompt' | 'dialog') => JSON.parse(localStorage.getItem(matCardPositionKey(place)) ?? 'null') as unknown
const onClose = vi.fn()
const dialog = (props: Partial<Parameters<typeof Modal>[0]> = {}) =>
  render(
    <Modal isOpen onClose={onClose} size="keypad" anchor="mat" title="Más opciones" {...props}>
      <button type="button">Algo</button>
    </Modal>,
  )
const panel = () => screen.getByRole('dialog')
const head = () => screen.getByRole('heading', { name: 'Más opciones' })

describe('un diálogo de la mesa (Modal anchor="mat") desde 1101 px', () => {
  it('se lleva por el encabezado sumado a su centrado, se acuerda en el lugar de los diálogos y doble clic lo devuelve', () => {
    dialog()
    expect(head().closest('header')).toHaveAttribute('title', expect.stringContaining('Doble clic'))
    drag(head(), 100, 150)
    expect(panel().style.getPropertyValue('--drag-x')).toBe('100px')
    expect(panel().style.getPropertyValue('--drag-y')).toBe('150px')
    // El centrado de Tailwind sigue: no se pisa el `translate`.
    expect(panel().style.translate).toBe('')
    expect(panel()).toHaveAttribute('data-moved')
    expect(saved('dialog')).toEqual({ x: 100, y: 150 })
    expect(saved('prompt')).toBeNull()
    fireEvent.doubleClick(head())
    expect(panel().style.getPropertyValue('--drag-x')).toBe('')
    expect(panel()).not.toHaveAttribute('data-moved')
    expect(saved('dialog')).toBeNull()
  })

  it('soltar sobre el fondo después de arrastrar no lo cierra; la X sigue siendo un clic', () => {
    onClose.mockClear()
    dialog()
    drag(head(), 300, 300)
    fireEvent.click(panel().parentElement!)
    expect(onClose).not.toHaveBeenCalled()
    drag(screen.getByRole('button', { name: 'Cerrar' }), 120, 0)
    expect(saved('dialog')).toEqual({ x: 300, y: 300 })
    fireEvent.click(screen.getByRole('button', { name: 'Cerrar' }))
    expect(onClose).toHaveBeenCalledTimes(1)
  })

  it('se acota al recuadro del armazón (no pasa debajo del menú) y Alt + flechas lo mueven', () => {
    render(<div data-frame=""><div id="contenido" /></div>)
    dialog()
    drag(head(), -5000, 5000)
    expect(offsetOf(panel())).toEqual({ x: -324, y: 300 })
    fireEvent.keyDown(screen.getByRole('button', { name: 'Algo' }), { key: 'ArrowUp', altKey: true })
    expect(saved('dialog')).toEqual({ x: -324, y: 284 })
  })

  it('el próximo diálogo sale donde quedó el anterior (se relee al abrirse)', () => {
    const view = dialog({ isOpen: false })
    localStorage.setItem(matCardPositionKey('dialog'), '{"x":-40,"y":20}')
    view.rerender(
      <Modal isOpen onClose={onClose} size="keypad" anchor="mat" title="Más opciones">
        <button type="button">Algo</button>
      </Modal>,
    )
    expect(offsetOf(panel())).toEqual({ x: -40, y: 20 })
  })

  it('una pregunta (lowerable) usa el lugar de la pregunta del medio, también minimizada', () => {
    dialog({ lowerable: true, title: 'Elegí la posición' })
    drag(screen.getByRole('heading', { name: 'Elegí la posición' }), -60, -40)
    expect(saved('prompt')).toEqual({ x: -60, y: -40 })
    expect(saved('dialog')).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: 'Minimizar' }))
    drag(screen.getByText('Elegí la posición', { selector: '[data-minimized] p' }), 20, 0)
    expect(saved('prompt')).toEqual({ x: -40, y: -40 })
  })

  it('un Modal sin mesa sólo se mueve si lo pide (`movable`), con su `translate`', () => {
    render(
      <Modal isOpen onClose={onClose} size="sm" title="Otro">
        x
      </Modal>,
    )
    expect(screen.getByRole('dialog')).not.toHaveAttribute('aria-keyshortcuts')
    cleanup()
    render(
      <Modal isOpen onClose={onClose} size="sm" movable title="Guardar combo">
        x
      </Modal>,
    )
    drag(screen.getByRole('heading', { name: 'Guardar combo' }), 30, 10)
    expect(screen.getByRole('dialog').style.translate).toBe('30px 10px')
  })

  it('en el celular no se mueve ni usa lo guardado', () => {
    desktop = false
    localStorage.setItem(matCardPositionKey('dialog'), '{"x":-120,"y":60}')
    dialog()
    drag(head(), 100, 100)
    expect(panel().style.getPropertyValue('--drag-x')).toBe('')
    expect(panel()).not.toHaveAttribute('data-moved')
    expect(panel()).not.toHaveAttribute('aria-keyshortcuts')
  })
})

describe('el visor de una pila (PileViewer) en escritorio', () => {
  const ids = Array.from({ length: 10 }, (_, index) => `c${index}`)
  const viewer = () =>
    render(<PileViewer pile="gy" ids={ids} info={(id) => ({ name: `Carta ${id}`, art: null, faceDown: false, faceUp: false })} targeted={new Set()} onPick={() => {}} onClose={() => {}} />)

  it('se lleva por su título y comparte el lugar de los diálogos; el buscador sigue siendo un campo', () => {
    localStorage.setItem(matCardPositionKey('dialog'), '{"x":10,"y":-10}')
    viewer()
    const section = screen.getByRole('dialog')

    expect(section.style.translate).toBe('10px -10px')
    drag(screen.getByRole('heading', { name: /· 10/ }), -90, -50)
    expect(section.style.translate).toBe('-80px -60px')
    expect(saved('dialog')).toEqual({ x: -80, y: -60 })
    drag(screen.getByRole('searchbox'), 200, 0)
    expect(saved('dialog')).toEqual({ x: -80, y: -60 })
  })

  it('en el celular (la hoja de abajo) no se mueve', () => {
    desktop = false
    localStorage.setItem(matCardPositionKey('dialog'), '{"x":10,"y":-10}')
    viewer()
    expect(screen.getByRole('dialog').style.translate).toBe('')
    expect(screen.getByRole('dialog')).not.toHaveAttribute('data-moved')
  })
})
