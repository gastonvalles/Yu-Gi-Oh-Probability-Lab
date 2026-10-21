// @vitest-environment jsdom
import { act, cleanup, render } from '@testing-library/react'
import '@testing-library/jest-dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { AttackFx, measureStrike, type Strike } from '../components/probability/AttackFx'
import { EASE_OUT } from '../app/motion'

/** jsdom no tiene layout (todo mide 0): cada elemento dice dónde está. */
function place(element: Element, left: number, top: number, width: number, height: number) {
  element.getBoundingClientRect = () => ({ left, top, width, height, right: left + width, bottom: top + height, x: left, y: top, toJSON: () => ({}) }) as DOMRect
}

/** Una mesa: el atacante (centro en 50,50), una carta del rival y las dos barras de vida, cada una con su caja. */
function table() {
  document.body.innerHTML = `
    <section id="mesa">
      <div data-lp="theirs"></div>
      <div data-rival-card-id="c7"></div>
      <div data-card-id="card-1-1"></div>
      <div data-lp="mine"></div>
    </section>`

  const mesa = document.getElementById('mesa')!
  const at = (selector: string, left: number, top: number, width: number, height: number) => place(mesa.querySelector(selector)!, left, top, width, height)
  place(mesa, 0, 100, 400, 600)
  at('[data-card-id="card-1-1"]', 0, 0, 100, 100)
  at('[data-rival-card-id="c7"]', 30, 40, 100, 100)
  at('[data-lp="theirs"]', 150, -30, 100, 20)
  at('[data-lp="mine"]', 150, 480, 100, 20)

  return mesa
}

const strike = (overrides: Partial<Strike> = {}): Strike => ({ key: 1, ax: 50, ay: 60, bx: 250, by: 60, len: 200, ang: 0, target: null, ...overrides })

// jsdom no trae `matchMedia`: lo que un test le ponga se saca al terminar.
const originalMatchMedia = window.matchMedia

beforeEach(() => {
  document.body.innerHTML = ''
})

afterEach(() => {
  vi.useRealTimers()
  vi.unstubAllGlobals()
  window.matchMedia = originalMatchMedia
  cleanup()
})

describe('measureStrike', () => {
  it('con objetivo mide del centro del atacante al centro del objetivo: el largo y el ángulo en radianes', () => {
    const mesa = table()
    const hit = measureStrike({ from: '[data-card-id="card-1-1"]', to: '[data-rival-card-id="c7"]', bounds: mesa })

    // Del (50, 50) al (80, 90): 30 a la derecha y 40 hacia abajo.
    expect(hit).toMatchObject({ ax: 50, ay: 50, bx: 80, by: 90, len: 50 })
    expect(hit!.ang).toBeCloseTo(Math.atan2(40, 30))
    expect(hit!.target).toBe(mesa.querySelector('[data-rival-card-id="c7"]'))
    expect(typeof hit!.key).toBe('number')

    // Hacia arriba el ángulo es negativo.
    place(mesa.querySelector('[data-rival-card-id="c7"]')!, 0, -150, 100, 100)
    expect(measureStrike({ from: '[data-card-id="card-1-1"]', to: '[data-rival-card-id="c7"]', bounds: mesa })!.ang).toBeCloseTo(-Math.PI / 2)
  })

  it('el ataque directo va a la barra de vida del rival (o a la propia, si el que ataca es el rival)', () => {
    const mesa = table()
    const theirs = measureStrike({ from: '[data-card-id="card-1-1"]', direct: 'theirs', bounds: mesa })

    expect(theirs).toMatchObject({ bx: 200, by: -20 })
    expect(theirs!.len).toBeCloseTo(Math.hypot(150, 70))
    expect(theirs!.target).toBe(mesa.querySelector('[data-lp="theirs"]'))

    const mine = measureStrike({ from: '[data-card-id="card-1-1"]', direct: 'mine', bounds: mesa })
    expect(mine).toMatchObject({ bx: 200, by: 490 })
    expect(mine!.target).toBe(mesa.querySelector('[data-lp="mine"]'))
  })

  it('el directo sin barra de vida (la práctica) cae sobre el borde de la mesa, a la misma altura horizontal que el atacante', () => {
    const mesa = table()
    mesa.querySelectorAll('[data-lp]').forEach((tile) => tile.remove())

    // La mesa va de y = 100 a y = 700; el atacante está en x = 50.
    expect(measureStrike({ from: '[data-card-id="card-1-1"]', direct: 'theirs', bounds: mesa })).toMatchObject({ bx: 50, by: 100, len: 50, target: null })
    expect(measureStrike({ from: '[data-card-id="card-1-1"]', direct: 'mine', bounds: mesa })).toMatchObject({ bx: 50, by: 700, len: 650, target: null })
    // Sin `direct` ataca el jugador: va hacia arriba.
    expect(measureStrike({ from: '[data-card-id="card-1-1"]', bounds: mesa })!.by).toBe(100)
  })

  it('sin el atacante en pantalla (o sin la carta atacada, o con un id que no es un selector) no hay ataque que dibujar', () => {
    const mesa = table()

    expect(measureStrike({ from: '[data-card-id="no-esta"]', bounds: mesa })).toBeNull()
    expect(measureStrike({ from: '[data-card-id="card-1-1"]', to: '[data-rival-card-id="c99"]', bounds: mesa })).toBeNull()
    // Los ids del rival llegan por la red: uno con comillas no puede romper nada.
    expect(measureStrike({ from: '[data-rival-card-id="c7"]', to: '[data-card-id="a"]b"]', bounds: mesa })).toBeNull()
    expect(measureStrike({ from: '[data-rival-card-id="x"]y"]', bounds: mesa })).toBeNull()
  })

  it('sólo busca dentro de la mesa que se le da: otra mesa en la misma página no se cruza', () => {
    const mesa = table()
    const otra = document.body.appendChild(document.createElement('section'))
    otra.innerHTML = '<div data-card-id="solo-de-la-otra"></div>'

    expect(measureStrike({ from: '[data-card-id="solo-de-la-otra"]', bounds: mesa })).toBeNull()
    expect(measureStrike({ from: '[data-card-id="solo-de-la-otra"]', bounds: otra })).not.toBeNull()
  })
})

describe('AttackFx', () => {
  it('dibuja el rayo, la espada y el impacto (la onda, el destello y seis chispas) en un portal sobre toda la pantalla, sin que se pueda tocar', () => {
    const { container } = render(<AttackFx strike={strike({ ax: 40, ay: 70, bx: 300, by: 90, len: 260.8, ang: 0.0767 })} onDone={() => {}} />)

    // No se dibuja donde se lo monta: va en el `body`.
    expect(container.querySelector('[data-fx="strike"]')).toBeNull()
    const fx = document.querySelector('[data-fx="strike"]') as HTMLElement
    expect(fx).toHaveAttribute('aria-hidden', 'true')
    expect(fx.parentElement).toBe(document.body)
    expect(fx).toHaveClass('pointer-events-none', 'fixed', 'inset-0')
    expect(fx.style.getPropertyValue('--fx-rgb')).toBe('255 74 94')

    // El rayo y la espada salen del atacante, girados hacia el objetivo, y miden lo que hay hasta él.
    const origin = fx.querySelector('.animate-fx-beam')!.parentElement as HTMLElement
    expect(origin.style.left).toBe('40px')
    expect(origin.style.top).toBe('70px')
    expect(origin.style.transform).toBe('rotate(0.0767rad)')
    expect(origin.style.getPropertyValue('--len')).toBe('260.8px')
    expect(origin.querySelector('svg.animate-fx-blade')).not.toBeNull()

    // El impacto está en el objetivo y espera a que la espada llegue.
    const impact = fx.querySelector('.animate-fx-shock')!.parentElement as HTMLElement
    expect(impact.style.left).toBe('300px')
    expect(impact.style.top).toBe('90px')
    expect(impact.querySelectorAll('.animate-fx-flash')).toHaveLength(1)
    expect(impact.querySelectorAll('.animate-fx-spark')).toHaveLength(6)

    for (const part of impact.querySelectorAll<HTMLElement>('.animate-fx-flash, .animate-fx-shock, .animate-fx-spark')) {
      expect(part.style.animationDelay).toBe('300ms')
      expect(part).toHaveClass('opacity-0')
    }

    // Cada chispa sale para un lado distinto, y con reducir el movimiento ninguna pieza se ve.
    const aims = [...impact.querySelectorAll<HTMLElement>('.animate-fx-spark')].map((spark) => `${spark.style.getPropertyValue('--dx')} ${spark.style.getPropertyValue('--dy')}`)
    expect(new Set(aims).size).toBe(6)

    for (const part of fx.querySelectorAll('.animate-fx-beam, .animate-fx-blade, .animate-fx-flash, .animate-fx-shock, .animate-fx-spark')) {
      expect(part).toHaveClass('motion-reduce:hidden')
    }
  })

  it('se va solo pasado el impacto: avisa una sola vez, aunque quien lo muestra cambie de función en cada dibujo', () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] })
    const first = vi.fn()
    const second = vi.fn()
    const view = render(<AttackFx strike={strike()} onDone={first} />)

    act(() => {
      vi.advanceTimersByTime(600)
    })
    // Con otra función a mitad de camino el reloj no arranca de nuevo, y se llama a la última.
    view.rerender(<AttackFx strike={strike()} onDone={second} />)
    act(() => {
      vi.advanceTimersByTime(400)
    })
    expect(second).not.toHaveBeenCalled()

    act(() => {
      vi.advanceTimersByTime(100)
    })
    expect(first).not.toHaveBeenCalled()
    expect(second).toHaveBeenCalledTimes(1)

    act(() => {
      vi.advanceTimersByTime(5000)
    })
    expect(second).toHaveBeenCalledTimes(1)
  })

  it('al desmontarse no avisa', () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] })
    const done = vi.fn()
    const view = render(<AttackFx strike={strike()} onDone={done} />)

    view.unmount()
    act(() => {
      vi.advanceTimersByTime(5000)
    })
    expect(done).not.toHaveBeenCalled()
    expect(document.querySelector('[data-fx="strike"]')).toBeNull()
  })

  describe('la sacudida del objetivo', () => {
    /** El navegador sabe sumar animaciones (`composite`) y el objetivo recibe la sacudida. */
    function withAnimations() {
      vi.stubGlobal('KeyframeEffect', class { get composite() { return 'replace' } })
      const cancel = vi.fn()
      const target = document.body.appendChild(document.createElement('div'))
      target.animate = vi.fn(() => ({ cancel }) as unknown as Animation)

      return { target, cancel }
    }

    it('se suma a lo que ya tenga la carta, espera al impacto y se corta si el ataque se va antes', () => {
      const { target, cancel } = withAnimations()
      const view = render(<AttackFx strike={strike({ target })} onDone={() => {}} />)

      expect(target.animate).toHaveBeenCalledTimes(1)
      const [frames, options] = vi.mocked(target.animate).mock.calls[0]!
      expect(frames).toHaveLength(5)
      expect(options).toEqual({ duration: 360, delay: 300, easing: EASE_OUT, composite: 'add' })

      view.unmount()
      expect(cancel).toHaveBeenCalledTimes(1)
    })

    it('sin objetivo en pantalla no se sacude nada', () => {
      const { target } = withAnimations()

      render(<AttackFx strike={strike({ target: null })} onDone={() => {}} />)
      expect(target.animate).not.toHaveBeenCalled()
    })

    it('sin soporte para sumar animaciones (se pisaría el giro de la carta) no se sacude nada', () => {
      const { target } = withAnimations()

      vi.unstubAllGlobals()
      render(<AttackFx strike={strike({ target })} onDone={() => {}} />)
      expect(target.animate).not.toHaveBeenCalled()
    })

    it('pidiendo menos movimiento no se sacude nada', () => {
      const { target } = withAnimations()

      window.matchMedia = ((query: string) => ({ matches: query.includes('reduce') })) as typeof window.matchMedia
      render(<AttackFx strike={strike({ target })} onDone={() => {}} />)
      expect(target.animate).not.toHaveBeenCalled()
    })
  })
})
