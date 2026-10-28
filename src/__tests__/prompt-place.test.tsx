// @vitest-environment jsdom
import { act, screen } from '@testing-library/react'
import '@testing-library/jest-dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { CHAIN_LINK_MS, type ChainStep } from '../app/auto/chain-feed'
import type { CoreAsk } from '../app/auto/protocol'
import { fakeSession, stringId } from './support/auto-session-fake'
import { core, renderAuto } from './support/auto-screen-harness'

// La pregunta del medio con la pila de la cadena en el celular (`PracticeMat`): dónde quedan la pregunta, la pila y su lista, y cuántas veces el navegador tendría que
// recalcular la mesa para ubicarlas (una lectura después de una escritura es un layout forzado). jsdom no mide: una geometría de mentira que respeta los `translate` y la lista acortada.

const YESNO: CoreAsk = { type: 'select_yesno', player: 0, description: '31' }
const link = (index: number, mine: boolean): ChainStep => ({ kind: 'chain', at: 0, index, link: mine ? { card: { side: 'mine', id: 'card-100-1' }, code: 100, mine, description: stringId(100, 0) } : { card: { side: 'theirs', id: 'c1' }, code: 700, mine, description: stringId(700, 0) } })

const px = (translate: string) => Number(/\s(-?\d+)px/.exec(translate)?.[1] ?? 0)
const rect = (top: number, bottom: number, left = 20, right = 370) => ({ top, bottom, left, right, x: left, y: top, width: right - left, height: bottom - top, toJSON: () => ({}) }) as DOMRect
const box = () => screen.queryByTestId('duel-prompt-layer')?.firstElementChild as HTMLElement | null | undefined
const chain = () => screen.queryByTestId('duel-chain-layer')
const list = () => chain()?.querySelector<HTMLElement>('[data-chain-list]')

let layouts = 0
/** Se escribió un `translate` o un `max-height` distinto desde la última medida: la próxima medida obliga al navegador a recalcular la mesa (escribir el mismo valor no). */
let dirty = false
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

    if (this === screen.queryByTestId('duel-prompt-layer')) return rect(0, 844, 0, 390)
    if (this === box()) return rect(300 + px((this as HTMLElement).style.translate), 400 + px((this as HTMLElement).style.translate))
    if (this.matches('[data-drop="mz:0"]')) return rect(600, 680)
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

describe('la pregunta del medio con la pila de la cadena (celular)', () => {
  it('queda arriba de tus monstruos, la pila sube y su lista se acorta a lo que queda; lo ubica con un solo recálculo de la mesa cada vez', () => {
    const fake = fakeSession()

    renderAuto(fake)
    core(() => fake.set({ chainSteps: [link(0, true), link(1, false)] }))
    act(() => vi.advanceTimersByTime(0))
    act(() => vi.advanceTimersByTime(CHAIN_LINK_MS))
    layouts = 0
    core(() => fake.ask(YESNO))

    // Arriba de tus monstruos (600 − 8 − 100 de alto), la pila 48 px más arriba y su lista de 400 acortada a 492 − 8 − (212 − 48).
    expect(box()!.style.translate).toBe('0 192px')
    expect(chain()!.style.translate).toBe('0 -48px')
    expect(list()!.style.maxHeight).toBe('320px')
    expect(chain()!.dataset.squeezed).toBeUndefined()
    // Se ubica dos veces (al aparecer y al cuadro siguiente). Antes eran 4 recálculos: subir la pila y medirla en la primera; en la segunda, borrar y medir, soltar la pila y medir, subirla y medir.
    // Ahora 1: la segunda vez borra todo junto antes de medir (la primera no tiene nada que borrar).
    expect(layouts).toBe(1)
  })
})
