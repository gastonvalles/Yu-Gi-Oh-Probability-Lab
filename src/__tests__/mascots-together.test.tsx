// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import '@testing-library/jest-dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { getMascotState, resetMascotChoiceForTests, resetMascotForTests, summonMascot } from '../app/mascot'
import { resetMascotInterplayForTests } from '../app/mascot-interplay'
import { NO_SHELL_INSETS, setShellInsets } from '../app/shell-layout'
import { Mascot } from '../components/mascot/Mascot'

beforeEach(() => {
  localStorage.clear()
  // Las mascotas saludan solas la primera vez: acá ya las saludaron.
  localStorage.setItem('ygo-lab:mascot-greeted', '1')
  resetMascotChoiceForTests()
  resetMascotForTests()
  resetMascotInterplayForTests()
  HTMLElement.prototype.setPointerCapture = () => {}
  window.matchMedia = ((query: string) => ({ matches: false, media: query, addEventListener: () => {}, removeEventListener: () => {}, addListener: () => {}, removeListener: () => {}, onchange: null, dispatchEvent: () => false })) as typeof window.matchMedia
  vi.useFakeTimers()
})

afterEach(() => {
  cleanup()
  vi.useRealTimers()
})

const mascotButton = (name: string) => screen.getByRole('button', { name: `Saludar a ${name}` })
/** Dónde está una mascota en la pantalla (el `translate3d` de su contenedor). */
const spot = (name: string) => {
  const [x, y] = /translate3d\(([-\d.]+)px, ([-\d.]+)px/.exec((mascotButton(name).closest('div.fixed') as HTMLElement).style.transform)!.slice(1).map(Number)
  return { x: x!, y: y! }
}
const imageOf = (name: string) => mascotButton(name).querySelector('img')!.getAttribute('src')

describe('varias mascotas afuera', () => {
  it('cada una sale en su lugar, una al lado de la otra y no encima, y cada una con su animación', () => {
    render(<Mascot />)
    act(() => {
      summonMascot('winged-kuriboh')
    })

    expect(spot('Winged Kuriboh').y).toBe(spot('Cupsy').y)
    // El lado de una mascota en escritorio es 104 px: la segunda arranca pasado ese lado (más un hueco).
    expect(spot('Winged Kuriboh').x - spot('Cupsy').x).toBeGreaterThanOrEqual(104)

    // Recién sacada, saluda; la otra sigue en reposo.
    expect(imageOf('Winged Kuriboh')).toBe('/mascot/winged-kuriboh/waving.webp')
    expect(imageOf('Cupsy')).toBe('/mascot/cupsy/idle.webp')
  })

  it('un toque saluda sólo a esa mascota, y mandar una a descansar no toca a la otra', () => {
    render(<Mascot />)
    act(() => {
      summonMascot('winged-kuriboh')
      vi.advanceTimersByTime(3000)
    })
    expect(imageOf('Winged Kuriboh')).toBe('/mascot/winged-kuriboh/idle.webp')

    fireEvent.pointerDown(mascotButton('Cupsy'), { button: 0, pointerId: 1, clientX: 20, clientY: 20 })
    fireEvent.pointerUp(mascotButton('Cupsy'), { button: 0, pointerId: 1, clientX: 20, clientY: 20 })
    fireEvent.click(mascotButton('Cupsy'))

    expect(getMascotState('cupsy')).toBe('waving')
    expect(getMascotState('winged-kuriboh')).toBe('idle')
    expect(imageOf('Cupsy')).toBe('/mascot/cupsy/waving.webp')
    expect(imageOf('Winged Kuriboh')).toBe('/mascot/winged-kuriboh/idle.webp')
  })

  it('al arrastrar una contra la otra chocan: la empujada se corre y a esa no le gusta', () => {
    render(<Mascot />)
    act(() => {
      summonMascot('winged-kuriboh')
      vi.advanceTimersByTime(3000)
    })

    const before = spot('Cupsy')
    const kuriboh = spot('Winged Kuriboh')
    const grab = { x: kuriboh.x + 40, y: kuriboh.y + 40 }

    fireEvent.pointerDown(mascotButton('Winged Kuriboh'), { button: 0, pointerId: 1, clientX: grab.x, clientY: grab.y })
    // La lleva encima de Cupsy.
    fireEvent.pointerMove(mascotButton('Winged Kuriboh'), { pointerId: 1, clientX: grab.x - (kuriboh.x - before.x), clientY: grab.y })

    expect(spot('Cupsy')).not.toEqual(before)
    expect(getMascotState('cupsy')).toBe('failed')
    // La que se arrastra salta (como siempre que se agarra una mascota).
    expect(imageOf('Winged Kuriboh')).toBe('/mascot/winged-kuriboh/jumping.webp')
  })

  it('se las puede dejar en cualquier lugar de la pantalla: no se pegan al borde y nada las esquiva, ni el menú ni el pie', () => {
    // Menú lateral abierto y pie, como en escritorio.
    act(() => setShellInsets({ left: 240, bottom: 64 }))

    try {
      render(<Mascot />)
      const drag = (dx: number, dy: number) => {
        fireEvent.pointerDown(mascotButton('Cupsy'), { button: 0, pointerId: 1, clientX: 100, clientY: 100 })
        fireEvent.pointerMove(mascotButton('Cupsy'), { pointerId: 1, clientX: 100 + dx, clientY: 100 + dy })
        fireEvent.pointerUp(mascotButton('Cupsy'), { pointerId: 1, clientX: 100 + dx, clientY: 100 + dy })
      }

      // Si nadie la movió, arranca en el rincón libre: al lado del menú y arriba del pie.
      const start = spot('Cupsy')
      expect(start.x).toBeGreaterThanOrEqual(240)

      // La lleva al medio de la pantalla y la suelta: se queda exactamente ahí (no se pega al costado).
      drag(300, -250)
      expect(spot('Cupsy')).toEqual({ x: start.x + 300, y: start.y - 250 })
      expect(JSON.parse(localStorage.getItem('ygo-lab:mascot-position:cupsy')!)).toEqual(spot('Cupsy'))

      // La lleva encima del menú y contra el pie: sólo la frena el borde de la ventana, sin margen.
      drag(-2000, 2000)
      expect(spot('Cupsy')).toEqual({ x: 0, y: window.innerHeight - 104 })
    } finally {
      act(() => setShellInsets(NO_SHELL_INSETS))
    }
  })
})
