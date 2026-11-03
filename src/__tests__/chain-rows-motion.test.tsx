// @vitest-environment jsdom
import { configureStore } from '@reduxjs/toolkit'
import { cleanup, render } from '@testing-library/react'
import { Provider } from 'react-redux'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { ChainListRows, type ChainNoticeRow } from '../components/auto/chain-parts'

// La pila de la cadena se anima sólo cuando un eslabón cambia entre un dibujo y el siguiente (comparado por su número): nunca al montarse ya armada ni con movimiento reducido.

const store = configureStore({ reducer: { settings: (state = { handSize: 5, deckFormat: 'unlimited' as const }) => state } })
const link = (number: number, state: ChainNoticeRow['state'], by?: number): ChainNoticeRow => ({ number, who: 'Vos', mine: true, name: `Carta ${number}`, art: null, state, ...(by ? { by } : {}) })
const ui = (rows: ChainNoticeRow[]) => (
  <Provider store={store}>
    <ol>
      <ChainListRows rows={rows} onPick={() => {}} />
    </ol>
  </Provider>
)

const originalAnimate = Element.prototype.animate
let calls: Array<{ element: Element; keyframes: Keyframe[] }> = []
/** Qué se animó: «CL3:body», «CL2:li»… (la fila y la capa). */
const animated = () =>
  calls.map(({ element }) => `CL${element.closest('[data-link]')?.getAttribute('data-link')}:${element.getAttribute('data-part') ?? element.tagName.toLowerCase()}`).sort()

beforeEach(() => {
  calls = []
  Element.prototype.animate = function (this: Element, keyframes) {
    calls.push({ element: this, keyframes: keyframes as Keyframe[] })

    return { cancel() {}, addEventListener() {} } as unknown as Animation
  }
})

afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
  Element.prototype.animate = originalAnimate
})

describe('ChainListRows · el movimiento de la pila', () => {
  it('una pila que se monta ya armada (la hoja que se abre a mitad de cadena) se ve como está: nada entra', () => {
    const view = render(ui([link(1, 'solving'), link(2, 'negated', 3), link(3, 'solved')]))

    expect(calls).toEqual([])
    // Otro dibujo con la misma pila (otro arreglo, mismo contenido): tampoco.
    view.rerender(ui([link(1, 'solving'), link(2, 'negated', 3), link(3, 'solved')]))
    expect(calls).toEqual([])
  })

  it('el eslabón que se suma entra y los de abajo bajan; el que resuelve hace un pop con su aro, su chip y la marca', () => {
    const view = render(ui([link(1, 'chained'), link(2, 'chained')]))

    view.rerender(ui([link(1, 'chained'), link(2, 'chained'), link(3, 'chained')]))
    expect(animated()).toEqual(['CL1:li', 'CL2:li', 'CL3:li'])
    expect(calls.find(({ element }) => element.getAttribute('data-link') === '3')!.keyframes[0]).toMatchObject({ opacity: 0 })

    calls = []
    view.rerender(ui([link(1, 'chained'), link(2, 'chained'), link(3, 'solving')]))
    expect(animated()).toEqual(['CL3:body', 'CL3:chip', 'CL3:cursor', 'CL3:ring'])
  })

  it('negado: la cruz cae y la fila se sacude; resuelto: el tilde, el arte se apaga y el aro se va (cada uno en su fila)', () => {
    const view = render(ui([link(1, 'chained'), link(2, 'chained'), link(3, 'solving')]))

    view.rerender(ui([link(1, 'chained'), link(2, 'disabled', 3), link(3, 'solving')]))
    expect(animated()).toEqual(['CL2:body', 'CL2:chip', 'CL2:mark'])

    calls = []
    view.rerender(ui([link(1, 'solving'), link(2, 'disabled', 3), link(3, 'solved')]))
    // CL1 resuelve (la marca viaja desde CL3, que resolvió antes) y CL3 queda resuelta.
    expect(animated()).toEqual(['CL1:body', 'CL1:chip', 'CL1:cursor', 'CL1:ring', 'CL3:art', 'CL3:chip', 'CL3:mark', 'CL3:ring'])
  })

  it('el diff va por número: si la pila llega en otro orden y crece, sólo anima lo que cambió', () => {
    const view = render(ui([link(1, 'chained'), link(2, 'chained')]))

    view.rerender(ui([link(3, 'chained'), link(2, 'solved'), link(1, 'chained')]))
    // CL3 entra; CL2 queda resuelta. CL1 no cambió de estado: sólo baja su lugar.
    expect(animated().filter((name) => !name.endsWith(':li'))).toEqual(['CL2:art', 'CL2:chip', 'CL2:mark'])
    expect(animated().filter((name) => name.endsWith(':li'))).toEqual(['CL1:li', 'CL2:li', 'CL3:li'])
  })

  it('con movimiento reducido no anima nada (los cambios quedan secos)', () => {
    vi.stubGlobal('matchMedia', (query: string) => ({ matches: query.includes('reduce'), media: query, addEventListener() {}, removeEventListener() {} }))
    const view = render(ui([link(1, 'chained'), link(2, 'chained')]))

    view.rerender(ui([link(1, 'chained'), link(2, 'chained'), link(3, 'solving')]))
    view.rerender(ui([link(1, 'chained'), link(2, 'negated'), link(3, 'solved')]))
    expect(calls).toEqual([])
  })
})
