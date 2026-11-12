// @vitest-environment jsdom
// Minimizar sin saltos: soltada cerca, la hoja vuelve deslizándose; al plegar, baja hasta la tira y recién al llegar cambia de estado; al abrir, sube desde donde estaba la tira. jsdom no anima ni
// mide: un `animate` falso anota cada animación (y deja terminarla a mano) y cada hoja dice dónde está su borde de arriba, abierta o plegada.
import { act, cleanup, fireEvent, render, within } from '@testing-library/react'
import '@testing-library/jest-dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { AutoPanel } from '../components/auto/AutoPanel'
import { Modal } from '../components/ui/Modal'

interface Call {
  keyframes: Keyframe[]
  options: KeyframeAnimationOptions
  finish: () => Promise<void>
}

const original = { animate: Element.prototype.animate, rect: HTMLElement.prototype.getBoundingClientRect, matchMedia: window.matchMedia }
let calls: Call[] = []

beforeEach(() => {
  calls = []
  window.scrollTo = () => {}
  window.matchMedia = ((query: string) => ({ matches: false, media: query, addEventListener: () => {}, removeEventListener: () => {}, addListener: () => {}, removeListener: () => {}, onchange: null, dispatchEvent: () => false })) as typeof window.matchMedia
  Element.prototype.animate = function (keyframes: Keyframe[] | PropertyIndexedKeyframes | null, options?: number | KeyframeAnimationOptions) {
    let resolve = () => {}
    const finished = new Promise<void>((done) => {
      resolve = () => done()
    })

    calls.push({ keyframes: keyframes as Keyframe[], options: options as KeyframeAnimationOptions, finish: async () => { resolve(); await finished } })
    return { finished, cancel: () => {}, addEventListener: () => {} } as unknown as Animation
  }
  // Abierta, su borde de arriba a 600 px; plegada (la tira), a 790.
  HTMLElement.prototype.getBoundingClientRect = function (this: HTMLElement) {
    const top = this.hasAttribute('data-minimized') ? 790 : 600

    return { top, bottom: 844, left: 0, right: 390, width: 390, height: 844 - top, x: 0, y: top, toJSON: () => ({}) } as DOMRect
  }
  vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) => {
    callback(0)
    return 1
  })
  vi.stubGlobal('cancelAnimationFrame', () => {})
})

afterEach(() => {
  cleanup()
  Element.prototype.animate = original.animate
  HTMLElement.prototype.getBoundingClientRect = original.rect
  window.matchMedia = original.matchMedia
  vi.unstubAllGlobals()
})

/** Arrastra con el dedo `dy` px hacia abajo y suelta despacio (decide la distancia); después llega el clic, como en el navegador. */
function drag(element: Element, dy: number) {
  const base = { pointerId: 7, pointerType: 'touch', isPrimary: true }

  fireEvent.pointerDown(element, { ...base, button: 0, buttons: 1, clientX: 120, clientY: 300 })
  fireEvent.pointerMove(element, { ...base, buttons: 1, clientX: 120, clientY: 300 + dy / 2 })
  fireEvent.pointerMove(element, { ...base, buttons: 1, clientX: 120, clientY: 300 + dy })
  const up = new Event('pointerup', { bubbles: true, cancelable: true })

  Object.assign(up, { ...base, button: 0, buttons: 0, clientX: 120, clientY: 300 + dy })
  Object.defineProperty(up, 'timeStamp', { value: performance.now() + 400 })
  fireEvent(element, up)
  fireEvent.click(element)
}

describe('la hoja acoplada del duelo (AutoPanel)', () => {
  const panel = () => document.querySelector<HTMLElement>('[data-prompt="ask"]')!

  it('soltada cerca vuelve deslizándose; plegada, baja hasta la tira y recién al llegar se minimiza; abierta, sube desde la tira', async () => {
    render(
      <AutoPanel kind="ask" label="¿Activás el efecto?" actions={<button type="button">Sí</button>}>
        <p>Branded Fusion</p>
      </AutoPanel>,
    )
    const grip = () => panel().querySelector('[data-panel-grip]')!

    drag(grip(), 30)
    expect(panel()).not.toHaveAttribute('data-minimized')
    expect(panel().style.translate).toBe('')
    expect(calls.at(-1)!.keyframes).toEqual([{ transform: 'translateY(30px)' }, { transform: 'translateY(0px)' }])

    drag(grip(), 120)
    const fold = calls.at(-1)!

    // Arranca donde la dejó el dedo y se queda en su último cuadro hasta que llega la tira: todavía no cambió.
    expect(fold.keyframes[0]).toEqual({ transform: 'translateY(120px)', opacity: 1 })
    expect(fold.options).toMatchObject({ fill: 'forwards' })
    expect(panel()).not.toHaveAttribute('data-minimized')
    await act(fold.finish)
    expect(panel()).toHaveAttribute('data-minimized')

    fireEvent.click(within(panel()).getByRole('button', { name: 'Mostrar la pregunta' }))
    expect(panel()).not.toHaveAttribute('data-minimized')
    expect(calls.at(-1)!.keyframes).toEqual([{ transform: 'translateY(190px)', opacity: 1 }, { transform: 'translateY(0px)', opacity: 1 }])
  })

  it('con el botón de minimizar (y Escape) también baja antes de plegarse', async () => {
    render(<AutoPanel kind="ask" label="¿Activás el efecto?" escape actions={<button type="button">Sí</button>} />)

    fireEvent.keyDown(document, { key: 'Escape' })
    expect(panel()).not.toHaveAttribute('data-minimized')
    await act(calls.at(-1)!.finish)
    expect(panel()).toHaveAttribute('data-minimized')
  })
})

describe('una hoja de la mesa (Modal lowerable)', () => {
  it('se funde bajando hasta el asa y recién ahí se minimiza; abierta, sube desde el asa apareciendo', async () => {
    render(
      <Modal isOpen onClose={() => {}} size="fit" lowerable anchor="mat" veil={false} kicker="Branded Fusion" title="Elegí qué agregar a tu mano">
        <p>Fallen of Albaz</p>
      </Modal>,
    )
    const dialog = () => document.querySelector<HTMLElement>('[role="dialog"]')!

    drag(within(dialog()).getByRole('heading', { name: 'Elegí qué agregar a tu mano' }), 120)
    const fold = calls.at(-1)!

    expect(fold.keyframes[0]).toEqual({ transform: 'translateY(120px)', opacity: 1 })
    expect(fold.keyframes[1]).toMatchObject({ opacity: 0 })
    expect(dialog()).not.toHaveAttribute('data-minimized')
    await act(fold.finish)
    expect(dialog()).toHaveAttribute('data-minimized')
    expect(dialog().style.getPropertyValue('--tw-translate-y')).toBe('')

    fireEvent.click(within(dialog()).getByRole('button', { name: 'Mostrar la pregunta' }))
    expect(dialog()).not.toHaveAttribute('data-minimized')
    expect(calls.at(-1)!.keyframes).toEqual([{ transform: 'translateY(190px)', opacity: 0 }, { transform: 'translateY(0px)', opacity: 1 }])
  })
})
