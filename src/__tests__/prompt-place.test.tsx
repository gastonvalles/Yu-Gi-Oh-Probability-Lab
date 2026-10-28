// @vitest-environment jsdom
import { act, fireEvent, screen, within } from '@testing-library/react'
import '@testing-library/jest-dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { CHAIN_LINK_MS, type ChainStep } from '../app/auto/chain-feed'
import type { CoreAsk } from '../app/auto/protocol'
import { fakeSession, stringId } from './support/auto-session-fake'
import { core, renderAuto } from './support/auto-screen-harness'

// El lugar fijo de la pregunta del medio (`PracticeMat`, `matSpot`): apoyada sobre la fila de las Zonas Extra, siempre la misma, con la pila de la cadena arriba que se acorta si no entran las dos,
// y cuántas veces el navegador tendría que recalcular la mesa para ubicarlas (una lectura después de una escritura es un layout forzado). jsdom no mide: una geometría de mentira de un celular
// de 390 × 844 (la barra hasta 60, las Zonas Extra de 380 a 452) que respeta el `translate` de la pila y su lista acortada.

const YESNO: CoreAsk = { type: 'select_yesno', player: 0, description: '31' }
const link = (index: number, mine: boolean): ChainStep => ({ kind: 'chain', at: 0, index, link: mine ? { card: { side: 'mine', id: 'card-100-1' }, code: 100, mine, description: stringId(100, 0) } : { card: { side: 'theirs', id: 'c1' }, code: 700, mine, description: stringId(700, 0) } })

const px = (translate: string) => Number(/\s(-?\d+)px/.exec(translate)?.[1] ?? 0)
const rect = (top: number, bottom: number, left = 20, right = 370) => ({ top, bottom, left, right, x: left, y: top, width: right - left, height: bottom - top, toJSON: () => ({}) }) as DOMRect
const layer = () => screen.queryByTestId('duel-prompt-layer')
const box = () => layer()?.firstElementChild as HTMLElement | null | undefined
const chain = () => screen.queryByTestId('duel-chain-layer')
const list = () => chain()?.querySelector<HTMLElement>('[data-chain-list]')
const page = () => document.documentElement.style
/** La columna de la mesa (la que se desplaza, debajo de la `section`). */
const isColumn = (element: Element | null) => element?.parentElement?.tagName === 'SECTION' && element.classList.contains('overflow-y-auto')

let layouts = 0
/** Se escribió un `translate` o un `max-height` distinto desde la última medida: la próxima medida obliga al navegador a recalcular la mesa (escribir el mismo valor no). */
let dirty = false
/** El alto de la pregunta (px). */
let promptHeight = 100
let original: typeof Element.prototype.getBoundingClientRect
const restore: Array<() => void> = []

/** Anota cuándo cambia una propiedad del estilo en línea (`translate` no la conoce jsdom: se guarda aparte). */
function watch(name: 'translate' | 'maxHeight') {
  // El estilo en línea de jsdom es un `CSSStyleProperties`: las propiedades viven en su prototipo, no en el de `CSSStyleDeclaration`.
  const proto = Object.getPrototypeOf(document.body.style) as CSSStyleDeclaration
  const own = Object.getOwnPropertyDescriptor(proto, name)
  const store = new WeakMap<CSSStyleDeclaration, string>()

  Object.defineProperty(proto, name, {
    configurable: true,
    get(this: CSSStyleDeclaration) {
      return own?.get ? (own.get.call(this) as string) : (store.get(this) ?? '')
    },
    set(this: CSSStyleDeclaration, value: string) {
      const before = own?.get ? (own.get.call(this) as string) : (store.get(this) ?? '')

      if (own?.set) own.set.call(this, value)
      else store.set(this, value)
      if (before !== value) dirty = true
    },
  })
  restore.push(() => (own ? Object.defineProperty(proto, name, own) : delete (proto as unknown as Record<string, unknown>)[name]))
}

beforeEach(() => {
  layouts = 0
  dirty = false
  promptHeight = 100
  watch('translate')
  watch('maxHeight')
  const remove = CSSStyleDeclaration.prototype.removeProperty
  CSSStyleDeclaration.prototype.removeProperty = function (this: CSSStyleDeclaration, property: string) {
    const value = remove.call(this, property)

    if (value) dirty = true
    return value
  }
  restore.push(() => (CSSStyleDeclaration.prototype.removeProperty = remove))
  original = Element.prototype.getBoundingClientRect
  Element.prototype.getBoundingClientRect = function (this: Element) {
    if (dirty) layouts += 1
    dirty = false
    const lift = px(chain()?.style.translate ?? '')
    const notice = chain()?.querySelector('[data-testid="chain-notice"]')

    if (this.tagName === 'SECTION' || isColumn(this)) return rect(0, 844, 0, 390)
    // La barra de arriba: lo primero de la columna.
    if (isColumn(this.parentElement) && this === this.parentElement!.firstElementChild) return rect(0, 60, 0, 390)
    if (this.matches('[data-drop="emz:0"]')) return rect(380, 452, 80, 152)
    if (this.matches('[data-drop="emz:1"]')) return rect(380, 452, 238, 310)
    if (this === box()) return rect(380 - promptHeight, 380)
    if (this === notice) return rect(160 + lift, 640 + lift)
    if (notice && this === notice.firstElementChild) return rect(160 + lift, 204 + lift)
    if (this === list()) {
      const full = chain()?.dataset.squeezed === undefined ? 400 : 0
      const cap = list()!.style.maxHeight ? Number.parseInt(list()!.style.maxHeight, 10) : full

      return rect(212 + lift, 212 + lift + Math.min(full, cap))
    }

    return rect(0, 0, 0, 0)
  }
})

afterEach(() => {
  Element.prototype.getBoundingClientRect = original
  restore.splice(0).reverse().forEach((undo) => undo())
})

describe('la pregunta del medio, en su lugar fijo', () => {
  it('apoya su borde de abajo sobre la fila de las Zonas Extra y crece hacia arriba hasta la barra; las hojas tienen el centro de la fila', () => {
    const fake = fakeSession()

    renderAuto(fake)
    core(() => fake.ask(YESNO))

    // La capa va de la barra (60) al borde de arriba de la fila Extra (844 − 380 = 464 desde abajo) y la pregunta, anclada abajo.
    expect(layer()).toHaveClass('justify-end')
    expect(layer()!.style.top).toBe('60px')
    expect(layer()!.style.bottom).toBe('464px')
    expect(box()).toHaveClass('min-h-0')
    // Lo que leen las hojas (`Modal anchor="mat"`, en un portal) y el asa de una minimizada.
    expect(page().getPropertyValue('--mat-extra')).toBe('380px')
    expect(page().getPropertyValue('--mat-x')).toBe('195px')
    expect(page().getPropertyValue('--mat-y')).toBe('416px')
    expect(page().getPropertyValue('--mat-w')).toBe('374px')
  })

  it('no se corre: minimizada, el asa queda en el mismo lugar, y otra pregunta (más alta) también', () => {
    const fake = fakeSession()

    renderAuto(fake)
    core(() => fake.ask(YESNO))
    fireEvent.click(within(layer()!).getByRole('button', { name: 'Minimizar' }))
    expect(layer()!.querySelector('[data-minimized]')).not.toBeNull()
    expect(layer()!.style.bottom).toBe('464px')

    promptHeight = 300
    core(() => fake.ask({ ...YESNO, description: '32' }))
    expect(layer()!.querySelector('[data-minimized]')).toBeNull()
    expect(layer()!.style.top).toBe('60px')
    expect(layer()!.style.bottom).toBe('464px')
    expect(box()!.style.translate).toBe('')
  })
})

describe('la pregunta con la pila de la cadena (celular)', () => {
  it('la pila sube y su lista se acorta a lo que queda arriba de la pregunta; con una pregunta más alta queda en su resumen; nunca se achica la pregunta; un solo recálculo de la mesa', () => {
    const fake = fakeSession()

    renderAuto(fake)
    core(() => fake.set({ chainSteps: [link(0, true), link(1, false)] }))
    act(() => vi.advanceTimersByTime(0))
    act(() => vi.advanceTimersByTime(CHAIN_LINK_MS))
    layouts = 0
    core(() => fake.ask(YESNO))

    // La pregunta de 100 empieza en 280; la pila sube 48 y su lista de 400 se acorta a 280 − 8 − (212 − 48).
    expect(chain()!.style.translate).toBe('0 -48px')
    expect(list()!.style.maxHeight).toBe('108px')
    expect(chain()!.dataset.squeezed).toBeUndefined()
    expect(layer()!.style.bottom).toBe('464px')
    // Un solo recálculo: lo que dejó la vez anterior en la pila se borra junto antes de medir.
    expect(layouts).toBeLessThanOrEqual(1)

    // Una pregunta de 250 empieza en 130: no entra ni un eslabón y la pila queda en su resumen; la pregunta sigue entera, en su lugar.
    promptHeight = 250
    window.dispatchEvent(new Event('resize'))
    act(() => vi.advanceTimersByTime(20))
    expect(chain()!.dataset.squeezed).toBe('')
    expect(layer()!.style.bottom).toBe('464px')

    // Minimizada, la pila vuelve a estar entera en su lugar.
    fireEvent.click(within(layer()!).getByRole('button', { name: 'Minimizar' }))
    window.dispatchEvent(new Event('resize'))
    act(() => vi.advanceTimersByTime(20))
    expect(chain()!.dataset.squeezed).toBeUndefined()
    expect(chain()!.style.translate).toBe('')
  })
})
