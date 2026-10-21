// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, render, screen } from '@testing-library/react'
import '@testing-library/jest-dom'

import { easeSnap } from '../app/motion'
import { formatWholePercent } from '../app/utils'
import { ProgressRing } from '../components/ui/ProgressRing'
import { SegmentedRing } from '../components/ui/SegmentedRing'

function mockReducedMotion(reduced: boolean) {
  window.matchMedia = vi.fn().mockReturnValue({ matches: reduced }) as unknown as typeof window.matchMedia
}

/**
 * Si el anillo se ve. El observador que simulamos queda guardado en el módulo de los anillos (como en la app), así que lee esta bandera cada vez que mira
 * un anillo: si fuera fija, un test que dijo «fuera de pantalla» dejaría así a todos los siguientes.
 */
let visibleNow = true

/** jsdom no trae IntersectionObserver: se simula uno que informa si el anillo se ve. */
function mockVisibility(visible: boolean) {
  visibleNow = visible
  vi.stubGlobal(
    'IntersectionObserver',
    class {
      constructor(private callback: (entries: Array<{ target: Element; isIntersecting: boolean }>) => void) {}
      observe(target: Element) {
        this.callback([{ target, isIntersecting: visibleNow }])
      }
      unobserve() {}
    },
  )
}

afterEach(() => {
  vi.unstubAllGlobals()
})

/** Los dos cuadros que el anillo espera antes de pasar a su valor (el primero lo pinta vacío). */
function flushFrames() {
  act(() => {
    vi.advanceTimersByTime(50)
  })
}

const arcOf = (container: HTMLElement) => container.querySelectorAll('circle')[1]!

describe('ProgressRing', () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['requestAnimationFrame', 'cancelAnimationFrame', 'setTimeout', 'clearTimeout'] })
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('arranca vacío y se llena hasta su valor', () => {
    mockReducedMotion(false)
    const { container } = render(<ProgressRing value={0.25} size={100} strokeWidth={10} label="Manos limpias" />)
    const circumference = 2 * Math.PI * 45

    expect(arcOf(container).getAttribute('stroke-dashoffset')).toBe(String(circumference))

    flushFrames()
    expect(Number(arcOf(container).getAttribute('stroke-dashoffset'))).toBeCloseTo(circumference * 0.75, 5)
    expect(screen.getByRole('meter', { name: 'Manos limpias' })).toHaveAttribute('aria-valuenow', '25')
  })

  it('fuera de pantalla se llena de golpe, sin transición (nadie lo ve llenarse)', () => {
    mockReducedMotion(false)
    mockVisibility(false)
    const { container } = render(<ProgressRing value={0.25} size={100} strokeWidth={10} label="Manos limpias" />)

    act(() => {
      vi.advanceTimersByTime(32)
    })
    expect(Number(arcOf(container).getAttribute('stroke-dashoffset'))).toBeCloseTo(2 * Math.PI * 45 * 0.75, 5)
    expect(arcOf(container).style.transitionDuration).toMatch(/^0m?s$/)

    flushFrames()
    expect(arcOf(container).style.transitionDuration).toBe('')
  })

  it('con "reducir movimiento" aparece lleno de entrada', () => {
    mockReducedMotion(true)
    const { container } = render(<ProgressRing value={0.5} size={100} strokeWidth={10} label="Manos limpias" />)

    expect(Number(arcOf(container).getAttribute('stroke-dashoffset'))).toBeCloseTo(2 * Math.PI * 45 * 0.5, 5)
  })

  it('acota valores fuera de rango', () => {
    mockReducedMotion(true)
    render(<ProgressRing value={1.7} label="Sobrepasado" />)

    expect(screen.getByRole('meter', { name: 'Sobrepasado' })).toHaveAttribute('aria-valuenow', '100')
  })

  it('el entero del centro no miente en las puntas: 99,5 % no es "100%" ni 0,4 % es "0%"', () => {
    mockReducedMotion(true)
    render(<ProgressRing value={0.9952} label="Interacción" />)

    expect(screen.getByText('>99%')).toBeInTheDocument()
    expect(formatWholePercent(0.9927)).toBe('99%')
    expect(formatWholePercent(0.004)).toBe('<1%')
    expect(formatWholePercent(0.747)).toBe('75%')
    expect(formatWholePercent(1)).toBe('100%')
    expect(formatWholePercent(0)).toBe('0%')
  })
})

describe('SegmentedRing', () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['requestAnimationFrame', 'cancelAnimationFrame', 'setTimeout', 'clearTimeout'] })
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('reparte el círculo en tramos proporcionales a su valor', () => {
    mockReducedMotion(true)
    const { container } = render(
      <SegmentedRing
        size={100}
        strokeWidth={10}
        label="Reparto"
        segments={[
          { key: 'a', value: 0.5, color: '0 255 0' },
          { key: 'b', value: 0.25, color: '255 0 0' },
        ]}
      />,
    )
    const circumference = 2 * Math.PI * 45
    const [, first, second] = Array.from(container.querySelectorAll('circle'))
    const length = (circle: Element | undefined) => Number(circle?.getAttribute('stroke-dasharray')?.split(' ')[0])

    // Con puntas redondas cada tramo pierde el grosor del trazo más 3 px de separación.
    expect(length(first)).toBeCloseTo((0.5 / 0.75) * circumference - 13, 5)
    expect(length(second)).toBeCloseTo((0.25 / 0.75) * circumference - 13, 5)
    expect(screen.getByRole('img', { name: 'Reparto' })).toBeInTheDocument()
  })

  it('llena los tramos en orden: cada uno espera a que termine el anterior', () => {
    mockReducedMotion(false)
    const { container } = render(
      <SegmentedRing
        size={100}
        strokeWidth={10}
        label="Reparto"
        segments={[
          { key: 'a', value: 0.5, color: '0 255 0' },
          { key: 'b', value: 0.5, color: '255 0 0' },
        ]}
      />,
    )
    const [, first, second] = Array.from(container.querySelectorAll('circle'))
    const waitOf = (circle: Element | undefined) => Number(/linear (\d+(?:\.\d+)?)ms/.exec((circle as SVGElement).style.transition)?.[1])

    expect(waitOf(first)).toBe(0)
    expect(waitOf(second)).toBeGreaterThan(0)
  })

  it('arranca con los tramos vacíos y los llena en el cuadro siguiente', () => {
    mockReducedMotion(false)
    const { container } = render(<SegmentedRing size={100} strokeWidth={10} label="Reparto" segments={[{ key: 'a', value: 1, color: '0 255 0' }]} />)
    const arc = () => container.querySelectorAll('circle')[1]!

    expect(arc().getAttribute('stroke-dasharray')?.startsWith('0 ')).toBe(true)
    flushFrames()
    expect(Number(arc().getAttribute('stroke-dasharray')?.split(' ')[0])).toBeGreaterThan(200)
  })

  it('`fluid` ocupa su contenedor: `size` queda como la escala del dibujo', () => {
    mockReducedMotion(true)
    render(<SegmentedRing fluid size={100} strokeWidth={8} label="2 materiales" segments={[{ key: 'a', value: 1, color: '0 255 0' }, { key: 'b', value: 1, color: '0 255 0' }]} />)
    const ring = screen.getByRole('img', { name: '2 materiales' })
    const svg = ring.querySelector('svg')!

    expect(ring).toHaveClass('size-full')
    expect(ring.style.width).toBe('')
    expect(svg).toHaveAttribute('width', '100%')
    expect(svg).toHaveAttribute('viewBox', '0 0 100 100')
  })
})

describe('ProgressRing: el número cuenta junto con el arco', () => {
  beforeEach(() => {
    mockVisibility(true)
  })

  /** Cuadros a mano: cada `tick(tiempo)` corre los cuadros que pidió el anillo con ese tiempo, así se sabe en qué punto del recorrido va el conteo. */
  function manualFrames() {
    const pending = new Map<number, FrameRequestCallback>()
    let nextId = 1

    vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) => {
      pending.set(nextId, callback)
      return nextId++
    })
    vi.stubGlobal('cancelAnimationFrame', (id: number) => {
      pending.delete(id)
    })

    return (time: number) => {
      const callbacks = [...pending.values()]

      pending.clear()
      act(() => {
        callbacks.forEach((callback) => callback(time))
      })
    }
  }

  const meterOf = (name: string) => screen.getByRole('meter', { name })
  const centerOf = (name: string) => meterOf(name).querySelector('span')?.textContent

  it('desde 64 px cuenta de 0 al valor, con la curva del arco, y llega exacto', () => {
    mockReducedMotion(false)
    const tick = manualFrames()
    render(<ProgressRing value={0.81} size={168} strokeWidth={14} label="Lab" format={formatWholePercent} />)

    expect(centerOf('Lab')).toBe('0%')
    tick(0)
    tick(16)
    tick(100)
    expect(centerOf('Lab')).toBe('0%')

    tick(100 + 225)
    expect(centerOf('Lab')).toBe(formatWholePercent(0.81 * easeSnap(0.25)))
    tick(100 + 450)
    expect(centerOf('Lab')).toBe(formatWholePercent(0.81 * easeSnap(0.5)))
    tick(100 + 675)
    expect(centerOf('Lab')).toBe(formatWholePercent(0.81 * easeSnap(0.75)))

    tick(100 + 900)
    expect(centerOf('Lab')).toBe('81%')
  })

  it('el número sube sin retroceder y termina en el valor exacto', () => {
    mockReducedMotion(false)
    const tick = manualFrames()
    render(<ProgressRing value={0.81} size={168} strokeWidth={14} label="Lab" format={formatWholePercent} />)
    tick(0)
    tick(16)

    const shownAt: number[] = []

    for (let elapsed = 0; elapsed <= 1000; elapsed += 20) {
      tick(100 + elapsed)
      shownAt.push(Number.parseFloat(centerOf('Lab') ?? ''))
    }

    expect(shownAt[0]).toBe(0)
    expect(shownAt[shownAt.length - 1]).toBe(81)
    expect(shownAt.every((value, index) => index === 0 || value >= shownAt[index - 1]!)).toBe(true)
  })

  it('`aria-valuenow` lleva el valor real desde el primer cuadro: el conteo es sólo visual', () => {
    mockReducedMotion(false)
    const tick = manualFrames()
    render(<ProgressRing value={0.81} size={168} strokeWidth={14} label="Lab" format={formatWholePercent} />)

    expect(meterOf('Lab')).toHaveAttribute('aria-valuenow', '81')
    tick(0)
    tick(16)
    tick(100)
    expect(meterOf('Lab')).toHaveAttribute('aria-valuenow', '81')
    expect(centerOf('Lab')).toBe('0%')
  })

  it('con "reducir movimiento" el número aparece ya en su valor', () => {
    mockReducedMotion(true)
    render(<ProgressRing value={0.81} size={168} strokeWidth={14} label="Lab" format={formatWholePercent} />)

    expect(centerOf('Lab')).toBe('81%')
  })

  it('por debajo de 64 px no cuenta: las listas muestran su valor de una', () => {
    mockReducedMotion(false)
    render(<ProgressRing value={0.81} size={56} label="Lista" format={formatWholePercent} />)

    expect(centerOf('Lista')).toBe('81%')
  })

  it('fuera de pantalla aparece lleno de una, como su arco', () => {
    mockReducedMotion(false)
    mockVisibility(false)
    const tick = manualFrames()
    render(<ProgressRing value={0.81} size={168} strokeWidth={14} label="Lab" format={formatWholePercent} />)
    tick(0)
    tick(16)

    expect(centerOf('Lab')).toBe('81%')
  })
})
