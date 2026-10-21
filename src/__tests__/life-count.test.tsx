// @vitest-environment jsdom
import { act, cleanup, render } from '@testing-library/react'
import '@testing-library/jest-dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { lifeCountMs, useLifeNumber } from '../app/life-effects'

describe('lifeCountMs: lo que cuenta un número de vidas según cuánto cambió', () => {
  it('320 ms sin cambio, 610 ms con 4000 y 900 ms desde la vida entera (8000) para arriba, con cualquier signo', () => {
    expect(lifeCountMs(0)).toBe(320)
    expect(lifeCountMs(-1000)).toBe(393)
    expect(lifeCountMs(1000)).toBe(lifeCountMs(-1000))
    expect(lifeCountMs(-4000)).toBe(610)
    expect(lifeCountMs(4000)).toBe(610)
    expect(lifeCountMs(-8000)).toBe(900)
    expect(lifeCountMs(-20000)).toBe(900)
  })
})

// Un reloj a mano: cada cuadro de rAF se manda con el tiempo que se le da (el conteo corre con el tiempo del cuadro, no con el reloj real).
let pendientes = new Map<number, FrameRequestCallback>()
let siguiente = 1

function cuadro(tiempo: number) {
  act(() => {
    const lista = [...pendientes.values()]
    pendientes = new Map()
    lista.forEach((callback) => callback(tiempo))
  })
}

function Numero({ life }: { life: number }) {
  return <output>{useLifeNumber(life)}</output>
}

describe('useLifeNumber: el número cuenta con la duración de su cambio', () => {
  beforeEach(() => {
    pendientes = new Map()
    siguiente = 1
    vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) => {
      const id = siguiente
      siguiente += 1
      pendientes.set(id, callback)
      return id
    })
    vi.stubGlobal('cancelAnimationFrame', (id: number) => {
      pendientes.delete(id)
    })
  })

  afterEach(() => {
    cleanup()
    vi.unstubAllGlobals()
  })

  it('llega al valor nuevo en lo que dura su cambio (900 ms desde 8000 a 0)', () => {
    const view = render(<Numero life={8000} />)

    view.rerender(<Numero life={0} />)
    cuadro(1000)
    cuadro(1900)
    expect(view.container.textContent).toBe('0')
  })

  it('un re-render a mitad del conteo no lo reinicia (sigue hasta el final previsto)', () => {
    const view = render(<Numero life={8000} />)

    view.rerender(<Numero life={4000} />)
    cuadro(1000)
    cuadro(1300)
    view.rerender(<Numero life={4000} />)
    // 610 ms desde el primer cuadro: si el re-render hubiera reiniciado el conteo, a 1610 todavía no llegaría.
    cuadro(1610)
    expect(view.container.textContent).toBe('4000')
  })

  it('un cambio nuevo a mitad del conteo recalcula su duración desde donde está', () => {
    const view = render(<Numero life={8000} />)

    view.rerender(<Numero life={4000} />)
    cuadro(1000)
    cuadro(1300)
    // De 4000 a 3000: un cambio de 1000, 393 ms desde este cuadro.
    view.rerender(<Numero life={3000} />)
    cuadro(1300)
    cuadro(1693)
    expect(view.container.textContent).toBe('3000')
  })
})
