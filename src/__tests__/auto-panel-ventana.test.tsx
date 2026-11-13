// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import '@testing-library/jest-dom'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import { setMatMenus } from '../app/mat-menus'
import { clampSize, readSize, sizeKey } from '../app/use-draggable-offset'
import { AskPrompt } from '../components/auto/AskPrompt'
import { autoWindowKey } from '../components/auto/AutoPanel'

/**
 * En escritorio los carteles del duelo automático son ventanas (TI-145; Gastón, 2026-11-10: «en desktop los menús son ventanas flotantes con drag and pull»): la barra de título violeta es el asa
 * (`useDraggableOffset`), se estiran del borde y la esquina, y lugar y tamaño se recuerdan por tipo. jsdom no tiene diseño: la ventana mide lo que dicen sus `width`/`height` (620 × 200 sin estirar) y
 * su lugar de siempre es el de la mesa, centrada en 1280 px y apoyada abajo (800 px), más su corrimiento (`--drag-x`, `--drag-y`).
 */
const VIEW = { width: 1280, height: 800 }
const sizeOf = (element: HTMLElement) => ({ width: Number.parseFloat(element.style.width) || 620, height: Number.parseFloat(element.style.height) || 200 })
const drag = (element: HTMLElement) => ({ x: Number.parseFloat(element.style.getPropertyValue('--drag-x')) || 0, y: Number.parseFloat(element.style.getPropertyValue('--drag-y')) || 0 })

let desktop = true
const original = {
  matchMedia: window.matchMedia,
  rect: Element.prototype.getBoundingClientRect,
  width: Object.getOwnPropertyDescriptor(HTMLElement.prototype, 'offsetWidth')!,
  height: Object.getOwnPropertyDescriptor(HTMLElement.prototype, 'offsetHeight')!,
}

beforeEach(() => {
  desktop = true
  localStorage.clear()
  HTMLElement.prototype.setPointerCapture = () => {}
  Object.defineProperty(window, 'innerWidth', { configurable: true, value: VIEW.width })
  Object.defineProperty(window, 'innerHeight', { configurable: true, value: VIEW.height })
  window.matchMedia = ((query: string) => ({ matches: desktop && query === '(min-width: 1101px)', media: query, addEventListener: () => {}, removeEventListener: () => {}, addListener: () => {}, removeListener: () => {}, onchange: null, dispatchEvent: () => false })) as typeof window.matchMedia
  Element.prototype.getBoundingClientRect = function (this: HTMLElement) {
    if (!this.matches('[data-prompt]')) return { left: 0, top: 0, width: 0, height: 0, right: 0, bottom: 0, x: 0, y: 0, toJSON: () => ({}) } as DOMRect
    const { width, height } = sizeOf(this)
    const { x, y } = drag(this)
    const left = VIEW.width / 2 - width / 2 + x
    const top = VIEW.height - height + y

    return { left, top, width, height, right: left + width, bottom: top + height, x: left, y: top, toJSON: () => ({}) } as DOMRect
  }
  Object.defineProperty(HTMLElement.prototype, 'offsetWidth', { configurable: true, get(this: HTMLElement) { return this.matches('[data-prompt]') ? sizeOf(this).width : 0 } })
  Object.defineProperty(HTMLElement.prototype, 'offsetHeight', { configurable: true, get(this: HTMLElement) { return this.matches('[data-prompt]') ? sizeOf(this).height : 0 } })
})

afterEach(() => {
  cleanup()
  setMatMenus('docked')
  window.matchMedia = original.matchMedia
  Element.prototype.getBoundingClientRect = original.rect
  Object.defineProperty(HTMLElement.prototype, 'offsetWidth', original.width)
  Object.defineProperty(HTMLElement.prototype, 'offsetHeight', original.height)
})

const ask = () => render(<AskPrompt text="¿Activás el efecto?" yes={{ label: 'Activar efecto', onSelect: () => {} }} no={{ label: 'No activar', onSelect: () => {} }} />)
const win = () => document.querySelector<HTMLElement>('[data-prompt]')!
const bar = () => win().querySelector<HTMLElement>('[data-window-bar]')!
const key = (init: KeyboardEventInit) => fireEvent.keyDown(bar(), init)
const saved = (storage: string) => JSON.parse(localStorage.getItem(storage) ?? 'null') as unknown
/** Dónde se ve la esquina de arriba a la izquierda. */
const corner = () => {
  const { left, top } = win().getBoundingClientRect()
  return { left, top }
}
const mouse = { pointerId: 1, pointerType: 'mouse', isPrimary: true }
const finger = { pointerId: 2, pointerType: 'touch', isPrimary: true }
function pull(element: Element, dx: number, dy: number, pointer = mouse) {
  fireEvent.pointerDown(element, { ...pointer, button: 0, buttons: 1, clientX: 500, clientY: 500 })
  fireEvent.pointerMove(element, { ...pointer, buttons: 1, clientX: 500 + dx, clientY: 500 + dy })
  fireEvent.pointerUp(element, { ...pointer, button: 0, buttons: 0, clientX: 500 + dx, clientY: 500 + dy })
}
/** Las clases de radio que `mat-square` no apaga (no salen de un token). */
const fixedRadii = (root: Element) => [root, ...root.querySelectorAll('*')].flatMap((element) => [...element.classList].filter((name) => /(^|:)rounded-(full|\[)/.test(name)))

describe('la ventana del escritorio', () => {
  it('sale en el lugar de siempre (centrada, apaisada de 30 rem, apoyada abajo), con la barra de título violeta sin fase, turno ni flecha de bajar, esquinas rectas y 92 % sin desenfoque; es un diálogo nombrado por la pregunta', () => {
    ask()
    const dialog = screen.getByRole('dialog', { name: '¿Activás el efecto?' })

    expect(dialog).toBe(win())
    expect(dialog).toHaveAttribute('data-auto-panel', 'floating')
    // De fábrica, el ancho de tu mano (`--window-w`, lo mide al abrir); sin mano a la vista, 30 rem.
    expect(dialog).toHaveClass('fixed', 'bottom-0', 'w-[min(var(--window-w,30rem),var(--mat-w,100vw))]', 'mat-square', 'bg-card-background')
    expect(dialog.className).not.toMatch(/backdrop-|rounded-/)
    expect(fixedRadii(dialog)).toEqual([])
    expect(drag(dialog)).toEqual({ x: 0, y: 0 })
    expect(dialog.style.width).toBe('')
    // La barra: violeta con texto blanco, el asa (se enfoca); sin fase, turno ni flecha de bajar (M-08); sólo «Minimizar», un botón de 44 px para el mouse.
    expect(bar()).toHaveClass('bg-primary', 'text-white', 'cursor-grab', 'focus-visible:shadow-focus')
    expect(bar()).toHaveAttribute('tabindex', '0')
    expect(within(bar()).getAllByRole('button').map((button) => button.getAttribute('aria-label'))).toEqual(['Minimizar'])
    // La pregunta va en la barra, en hasta dos renglones y sin «…» (entera en su `title`): es el título que nombra el diálogo, y no se repite abajo.
    expect(within(bar()).getByRole('heading', { name: '¿Activás el efecto?' })).toHaveClass('line-clamp-2', 'text-body')
    expect(within(bar()).getByRole('heading')).not.toHaveClass('truncate')
    expect(within(bar()).getByRole('heading')).toHaveAttribute('title', '¿Activás el efecto?')
    expect(screen.getAllByRole('heading')).toHaveLength(1)
    expect(dialog.querySelector('[data-panel-fold], [data-prompt-turn]')).toBeNull()
    // Tab recorre la barra, sus botones y los de abajo; el foco arranca en la principal.
    expect(screen.getByRole('button', { name: 'Activar efecto' })).toHaveFocus()
    expect(dialog.querySelectorAll('[data-window-corner]')).toHaveLength(1)
  })

  it('con la barra enfocada, las flechas la mueven 16 px (Mayús: 64), acotada a la pantalla, y se recuerda por tipo; Alt + flechas la estiran dejando quieta su esquina', () => {
    ask()
    bar().focus()
    key({ key: 'ArrowLeft' })
    expect(drag(win())).toEqual({ x: -16, y: 0 })
    key({ key: 'ArrowUp', shiftKey: true })
    expect(drag(win())).toEqual({ x: -16, y: -64 })
    expect(saved(autoWindowKey('ask'))).toEqual({ x: -16, y: -64 })
    // Más abajo no hay lugar: queda apoyada en el borde.
    key({ key: 'ArrowDown', shiftKey: true })
    key({ key: 'ArrowDown', shiftKey: true })
    expect(drag(win()).y).toBe(0)
    key({ key: 'ArrowUp', shiftKey: true })

    const before = corner()
    key({ key: 'ArrowRight', altKey: true })
    key({ key: 'ArrowDown', altKey: true, shiftKey: true })
    expect(sizeOf(win())).toEqual({ width: 636, height: 264 })
    expect(corner()).toEqual(before)
    expect(saved(sizeKey(autoWindowKey('ask')))).toEqual({ width: 636, height: 264 })
    // Hasta el mínimo (la fila de botones en un renglón), nunca menos.
    for (let i = 0; i < 20; i += 1) key({ key: 'ArrowLeft', altKey: true, shiftKey: true })
    expect(sizeOf(win()).width).toBe(420)
  })

  it('con el mouse: la barra la lleva y la esquina la estira; se guarda al soltar y la próxima pregunta sale ahí, con ese tamaño; doble clic (o Enter) la vuelve a su lugar y su tamaño', () => {
    const { unmount } = ask()

    pull(bar(), -100, -300)
    expect(drag(win())).toEqual({ x: -100, y: -300 })
    const before = corner()
    pull(win().querySelector('[data-window-corner]')!, 40, 30)
    expect(sizeOf(win())).toEqual({ width: 660, height: 230 })
    expect(corner()).toEqual(before)
    // El borde derecho, sólo el ancho; el de abajo, sólo el alto.
    pull(win().querySelector('.cursor-ew-resize')!, 20, 99)
    pull(win().querySelector('.cursor-ns-resize')!, 99, 10)
    expect(sizeOf(win())).toEqual({ width: 680, height: 240 })
    expect(saved(sizeKey(autoWindowKey('ask')))).toEqual({ width: 680, height: 240 })

    unmount()
    ask()
    expect(sizeOf(win())).toEqual({ width: 680, height: 240 })
    expect(corner()).toEqual(before)

    fireEvent.doubleClick(bar())
    expect(win().style.width).toBe('')
    expect(drag(win())).toEqual({ x: 0, y: 0 })
    expect(localStorage.getItem(autoWindowKey('ask'))).toBeNull()
    expect(localStorage.getItem(sizeKey(autoWindowKey('ask')))).toBeNull()

    key({ key: 'ArrowUp' })
    key({ key: 'Enter' })
    expect(drag(win())).toEqual({ x: 0, y: 0 })
  })

  it('lo guardado inválido se ignora; lo guardado más grande que la pantalla se acota', () => {
    for (const bad of ['{"width":"700","height":300}', '{"width":-5,"height":300}', '{"width":null}', 'nope']) {
      localStorage.setItem(sizeKey('k'), bad)
      expect(readSize('k')).toBeNull()
    }
    expect(clampSize({ width: 5000, height: 10 }, { width: 360, height: 160 }, { left: 0, top: 0, right: 1280, bottom: 800 })).toEqual({ width: 1280, height: 160 })

    localStorage.setItem(sizeKey(autoWindowKey('ask')), '{"width":5000,"height":5000}')
    ask()
    expect(sizeOf(win())).toEqual({ width: VIEW.width, height: VIEW.height })
  })

  it('Escape la minimiza (no la contesta ni la cierra): queda la tira con la barra, la pregunta y sus botones, en el mismo lugar y con el mismo ancho', () => {
    localStorage.setItem(autoWindowKey('ask'), '{"x":-40,"y":-200}')
    localStorage.setItem(sizeKey(autoWindowKey('ask')), '{"width":500,"height":260}')
    render(<AskPrompt text="¿Activás el efecto?" yes={{ label: 'Activar efecto', onSelect: () => {} }} no={{ label: 'No activar', onSelect: () => {} }} />)
    act(() => {
      fireEvent.keyDown(window, { key: 'Escape' })
    })
    const strip = screen.getByRole('dialog', { name: '¿Activás el efecto?' })

    expect(strip).toHaveAttribute('data-minimized')
    expect(strip.querySelector('[data-window-bar]')).toHaveTextContent('¿Activás el efecto?')
    expect(within(strip).getAllByRole('button').map((button) => button.getAttribute('aria-label') ?? button.textContent)).toEqual(['Mostrar la pregunta', 'No activar', 'Activar efecto'])
    expect(drag(strip)).toEqual({ x: -40, y: -200 })
    expect(strip.style.width).toBe('500px')
    expect(strip).toHaveClass('h-auto!')
  })

  it('la ficha de una carta y las fases recuerdan su propio lugar: no el de las preguntas', () => {
    expect(new Set(['ask', 'respond', 'pick', 'card', 'phases'].map(autoWindowKey))).toEqual(new Set([autoWindowKey('ask'), autoWindowKey('card'), autoWindowKey('phases')]))
    expect(autoWindowKey('ask')).toBe('ygo-lab:auto-window:v1:ask')
  })
})

describe('en el celular (menos de 1101 px)', () => {
  it('sigue acoplado abajo: sin barra de título, sin arrastre ni agarres, y lo guardado del escritorio no se le aplica', () => {
    desktop = false
    localStorage.setItem(autoWindowKey('ask'), '{"x":-40,"y":-200}')
    localStorage.setItem(sizeKey(autoWindowKey('ask')), '{"width":500,"height":260}')
    ask()

    expect(win()).toHaveAttribute('data-auto-panel', 'docked')
    expect(win()).toHaveClass('fixed', 'inset-x-0', 'bottom-0')
    expect(win().querySelector('[data-window-bar], [data-window-corner]')).toBeNull()
    expect(win().style.width).toBe('')
    expect(drag(win())).toEqual({ x: 0, y: 0 })
  })
})

describe('«Menús flotantes» (Opciones) en el celular', () => {
  const phoneKey = (storage: string) => `${storage}:phone`

  it('vuelve ventana la pregunta abierta, con barra y esquina; con el dedo la barra la lleva y la esquina la estira; el lugar y el tamaño se guardan aparte del de escritorio', () => {
    desktop = false
    localStorage.setItem(autoWindowKey('ask'), '{"x":-40,"y":-200}')
    ask()
    expect(win()).toHaveAttribute('data-auto-panel', 'docked')
    act(() => setMatMenus('floating'))

    expect(win()).toHaveAttribute('data-auto-panel', 'floating')
    expect(bar()).toBeInTheDocument()
    expect(drag(win())).toEqual({ x: 0, y: 0 })
    pull(bar(), -100, -300, finger)
    expect(drag(win())).toEqual({ x: -100, y: -300 })
    const before = corner()
    pull(win().querySelector('[data-window-corner]')!, 40, 80, finger)
    expect(sizeOf(win())).toEqual({ width: 660, height: 280 })
    expect(corner()).toEqual(before)
    // Estirada, la esquina de arriba a la izquierda quedó quieta: el corrimiento que se guardó es el de ahora.
    expect(saved(phoneKey(autoWindowKey('ask')))).toEqual(drag(win()))
    expect(saved(sizeKey(phoneKey(autoWindowKey('ask'))))).toEqual({ width: 660, height: 280 })
    // El de escritorio no se tocó.
    expect(saved(autoWindowKey('ask'))).toEqual({ x: -40, y: -200 })
    // Apagado, vuelve a la hoja de abajo.
    act(() => setMatMenus('docked'))
    expect(win()).toHaveAttribute('data-auto-panel', 'docked')
  })

  it('lleva la pregunta en la barra (hasta dos renglones), el lugar sobre el arte (`data-window`) y, si lo guardado deja el contenido cortado, al abrir crece hasta su contenido (sin guardarlo)', () => {
    desktop = false
    setMatMenus('floating')
    // Lo que mide su contenido sin alto propio: 300 px (jsdom no mide).
    Object.defineProperty(HTMLElement.prototype, 'offsetHeight', { configurable: true, get(this: HTMLElement) { return this.matches('[data-prompt]') ? Number.parseFloat(this.style.height) || 300 : 0 } })
    localStorage.setItem(sizeKey(phoneKey(autoWindowKey('ask'))), JSON.stringify({ width: 369, height: 260 }))
    ask()

    expect(win()).toHaveAttribute('data-window')
    // Apoyada sobre tu chapa y la botonera (nunca las tapa) y con techo en el borde de arriba de la mesa: sube lo que necesita.
    expect(win()).toHaveClass('bottom-[var(--panel-floor,0px)]', 'max-h-[calc(100dvh-var(--panel-ceiling,50dvh)-var(--panel-floor,0px))]')
    expect(within(bar()).getByRole('heading', { name: '¿Activás el efecto?' })).toHaveClass('line-clamp-2')
    expect(screen.getAllByRole('heading')).toHaveLength(1)
    expect(sizeOf(win())).toEqual({ width: 369, height: 300 })
    expect(saved(sizeKey(phoneKey(autoWindowKey('ask'))))).toEqual({ width: 369, height: 260 })
  })

  it('en escritorio el dedo también la lleva (una pantalla táctil), como el mouse y el lápiz', () => {
    ask()
    pull(bar(), -100, -300, finger)
    expect(drag(win())).toEqual({ x: -100, y: -300 })
    expect(saved(autoWindowKey('ask'))).toEqual({ x: -100, y: -300 })
  })
})

describe('el mínimo de la ventana', () => {
  it('achicada a lo más chico que deja, la ventana mide lo que pide la fila de botones entera (el celular, 296×256, dos filas; el escritorio, 420×186)', () => {
    localStorage.setItem(sizeKey(autoWindowKey('ask')), JSON.stringify({ width: 50, height: 50 }))
    const view = ask()

    expect(Number.parseFloat(win().style.width)).toBe(420)
    // El mínimo es 186, pero al abrir crece hasta lo que mide su contenido (jsdom: 200): un tamaño guardado nunca esconde nada.
    expect(Number.parseFloat(win().style.height)).toBe(200)
    view.unmount()
    desktop = false
    act(() => setMatMenus('floating'))
    localStorage.setItem(sizeKey(`${autoWindowKey('ask')}:phone`), JSON.stringify({ width: 50, height: 50 }))
    ask()
    expect(Number.parseFloat(win().style.width)).toBe(296)
    expect(Number.parseFloat(win().style.height)).toBe(256)
  })
})

describe('minimizar con el mouse', () => {
  it('la barra de la ventana lleva «Minimizar» (44 px): queda la tira con la pregunta y sus botones; tocarla la vuelve a subir', () => {
    ask()
    expect(within(bar()).getByRole('button', { name: 'Minimizar' })).toHaveClass('size-11')
    fireEvent.click(within(bar()).getByRole('button', { name: 'Minimizar' }))
    expect(win()).toHaveAttribute('data-minimized')
    expect(within(bar()).queryByRole('button', { name: 'Minimizar' })).toBeNull()
    fireEvent.click(within(bar()).getByRole('button', { name: 'Mostrar la pregunta' }))
    expect(win()).not.toHaveAttribute('data-minimized')
  })
})

describe('los botones, siempre abajo (TI-206)', () => {
  // jsdom no mide: lo que se comprueba es el lugar en el árbol (la fila es el borde de abajo, fuera de lo que se desplaza) y su `mt-auto`, que en la ventana estirada deja el aire entre el contenido y ella.
  const row = () => screen.getByRole('button', { name: 'Activar efecto' }).parentElement!

  it('ventana: la fila de acciones es el último hijo de la columna, fuera de la bandeja que se desplaza, y se pega al borde de abajo', () => {
    ask()
    const column = row().parentElement!

    expect(column.lastElementChild).toBe(row())
    expect(win().querySelector('[data-panel-body]')?.contains(row()) ?? false).toBe(false)
    expect(row()).toHaveClass('group-data-[auto-panel=floating]/panel:mt-auto', 'shrink-0')
  })

  it('hoja de abajo (celular): lo mismo, la fila es lo último de la hoja', () => {
    desktop = false
    ask()
    expect(win()).toHaveAttribute('data-auto-panel', 'docked')
    expect(row().parentElement!.lastElementChild).toBe(row())
    expect(win().querySelector('[data-panel-body]')?.contains(row()) ?? false).toBe(false)
  })

  it('la ventana flotante del celular («Menús flotantes») también', () => {
    desktop = false
    act(() => setMatMenus('floating'))
    ask()
    expect(win()).toHaveAttribute('data-auto-panel', 'floating')
    expect(row().parentElement!.lastElementChild).toBe(row())
    expect(row()).toHaveClass('group-data-[auto-panel=floating]/panel:mt-auto')
  })
})
