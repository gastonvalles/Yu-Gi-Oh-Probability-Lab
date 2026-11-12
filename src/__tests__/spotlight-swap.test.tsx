/** @vitest-environment jsdom */
// La carta grande que llega con otra a la vista no la reemplaza en seco: la anterior sale (se funde) y recién después entra la nueva. jsdom no anima: un `animate` falso anota la salida y deja
// terminarla a mano, y `getAnimations` dice si la anterior todavía se ve.
import { configureStore } from '@reduxjs/toolkit'
import { act, cleanup, render as renderBare } from '@testing-library/react'
import '@testing-library/jest-dom'
import type { ReactElement } from 'react'
import { Provider } from 'react-redux'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import { Spotlight, SpotlightSwap } from '../components/probability/MatFx'

const original = { animate: Element.prototype.animate, getAnimations: Element.prototype.getAnimations, matchMedia: window.matchMedia }
let fades: Array<{ keyframes: Keyframe[]; finish: () => Promise<void> }> = []
/** Si la carta de antes sigue en pantalla (su animación corre). */
let running = true

beforeEach(() => {
  fades = []
  running = true
  window.matchMedia = ((query: string) => ({ matches: false, media: query, addEventListener: () => {}, removeEventListener: () => {} })) as unknown as typeof window.matchMedia
  Element.prototype.animate = function (keyframes: Keyframe[] | PropertyIndexedKeyframes | null) {
    let resolve = () => {}
    const finished = new Promise<void>((done) => {
      resolve = () => done()
    })

    fades.push({ keyframes: keyframes as Keyframe[], finish: async () => { resolve(); await finished } })
    return { finished, cancel: () => {}, addEventListener: () => {} } as unknown as Animation
  }
  Element.prototype.getAnimations = function () {
    return running ? [{ playState: 'running', effect: { getComputedTiming: () => ({ endTime: 950 }) } } as unknown as Animation] : []
  }
})

afterEach(() => {
  cleanup()
  Element.prototype.animate = original.animate
  Element.prototype.getAnimations = original.getAnimations
  window.matchMedia = original.matchMedia
})

const STORE = configureStore({ reducer: { settings: (state = { handSize: 5, deckFormat: 'unlimited' as const }) => state } })
const render = (ui: ReactElement) => renderBare(ui, { wrapper: ({ children }) => <Provider store={STORE}>{children}</Provider> })
const stage = (id: string) => <Spotlight key={id} kind="activate" cards={[{ id, name: id, art: null }]} />
const shown = () => [...document.querySelectorAll('[data-activation]')].map((root) => root.getAttribute('data-activation'))

describe('SpotlightSwap', () => {
  it('con la anterior a la vista, la anterior se funde y recién después entra la nueva', async () => {
    const view = render(<SpotlightSwap>{stage('a')}</SpotlightSwap>)

    view.rerender(<SpotlightSwap>{stage('b')}</SpotlightSwap>)
    expect(shown()).toEqual(['a'])
    expect(fades.at(-1)!.keyframes).toEqual([{ opacity: 0 }])
    await act(fades.at(-1)!.finish)
    expect(shown()).toEqual(['b'])
  })

  it('si la anterior ya se fue sola, la nueva entra enseguida; e irse sin reemplazo también sale', async () => {
    const view = render(<SpotlightSwap>{stage('a')}</SpotlightSwap>)

    running = false
    view.rerender(<SpotlightSwap>{stage('b')}</SpotlightSwap>)
    expect(shown()).toEqual(['b'])

    running = true
    view.rerender(<SpotlightSwap>{null}</SpotlightSwap>)
    expect(shown()).toEqual(['b'])
    await act(fades.at(-1)!.finish)
    expect(shown()).toEqual([])
  })
})
