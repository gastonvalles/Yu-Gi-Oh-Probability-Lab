// @vitest-environment jsdom
import { act, cleanup, render, screen } from '@testing-library/react'
import '@testing-library/jest-dom'
import { useRef } from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { FIELD_ZOOM_MAX, classicCell, fieldZoom, promptAbove, promptTop, railsFit } from '../app/duel-rails'
import { useHostToasts } from '../app/toast-box'
import { AppToaster } from '../components/ui/AppToaster'

afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
})

describe('la pregunta del medio no tapa lo que hay que tocar', () => {
  const box = (top: number, bottom: number, left = 0, right = 100) => ({ top, bottom, left, right })
  const prompt = box(400, 500)

  it('sin nada abajo se queda; tapando una carta sube lo justo, también por encima de otra que queda en el camino; sin lugar arriba baja y, sin lugar en ninguno, no hay dónde', () => {
    expect(promptTop(prompt, [box(600, 700), box(400, 500, 200, 300)], 0, 900)).toBe(400)
    expect(promptTop(prompt, [box(450, 550)], 0, 900)).toBe(342)
    expect(promptTop(prompt, [box(450, 550), box(300, 420)], 0, 900)).toBe(192)
    expect(promptTop(prompt, [box(450, 550), box(0, 420)], 0, 900)).toBe(558)
    expect(promptTop(prompt, [box(450, 550), box(0, 420), box(500, 900)], 0, 900)).toBeNull()
  })

  it('en el celular termina arriba de tus monstruos, sea cual sea la ranura; si tapa algo que brilla sólo sube y, sin lugar entre la barra y tus monstruos, va por la ranura de siempre', () => {
    // Tus monstruos desde 600: la banda de 100 termina en 592, venga de arriba o de abajo.
    expect(promptAbove(prompt, [], 0, 600)).toBe(492)
    expect(promptAbove(box(650, 750), [], 0, 600)).toBe(492)
    // La mano y tu campo (abajo de 600) no la mueven; una carta del rival que brilla, sí: sube por encima.
    expect(promptAbove(prompt, [box(620, 700), box(700, 844)], 0, 600)).toBe(492)
    expect(promptAbove(prompt, [box(540, 580)], 0, 600)).toBe(432)
    // Con la barra hasta 120: una banda de 310 no entra arriba de tus monstruos en 400, ni una de 100 si lo que brilla llega hasta 150.
    expect(promptAbove(box(0, 310), [], 120, 400)).toBeNull()
    expect(promptAbove(prompt, [box(150, 580)], 120, 600)).toBeNull()
  })

  it('con la cadena a la vista, el techo es la píldora (en un renglón, hasta 148, más 8): entra la banda que cabe debajo; la más alta no, y la píldora se aparta (`PracticeMat`)', () => {
    // Medido con el núcleo a 740 de alto: tus monstruos en 402; «¿Activás el efecto?» mide 236 a 414 px (queda en 158) y 258 a 390 px (no entra debajo de 156).
    expect(promptAbove(box(0, 236), [], 156, 402)).toBe(158)
    expect(promptAbove(box(0, 258), [], 156, 402)).toBeNull()
  })
})

describe('cuándo hay laterales', () => {
  it('la casilla sin laterales sale del alto: 30,45 rem de lo que no es campo (las manos incluidas, sin tapar el campo), entre 3,5 y 12 rem', () => {
    expect(classicCell(1000)).toBeCloseTo((1000 - 487.2) / 5)
    expect(classicCell(300)).toBe(56)
    expect(classicCell(3000)).toBe(192)
  })

  it('hay laterales sólo si entran los dos sin achicar el campo', () => {
    // 1919 × 1000 con el menú abierto y el chat: la columna de la mesa mide 1349 de ancho.
    expect(railsFit(1349, 1000)).toBe(true)
    // 1440 × 900 con el menú abierto y el chat (870): sigue la barra de arriba y de abajo.
    expect(railsFit(870, 900)).toBe(false)
    // Sin medir todavía (0), o con un celular.
    expect(railsFit(0, 0)).toBe(false)
    expect(railsFit(390, 844)).toBe(false)
  })

  it('una ventana más alta pide una columna más ancha: la casilla (y el campo) es más grande', () => {
    expect(railsFit(1349, 800)).toBe(true)
    expect(railsFit(1349, 1300)).toBe(false)
    expect(railsFit(1700, 1300)).toBe(true)
  })
})

describe('cuánto se agranda la vista 3D', () => {
  it('crece parejo hasta donde entra a lo ancho o a lo alto (lo que se acaba primero), sin pasar del máximo', () => {
    expect(fieldZoom({ width: 570, height: 435, availWidth: 840, availHeight: 570 })).toBeCloseTo(1.31, 2)
    expect(fieldZoom({ width: 900, height: 580, availWidth: 940, availHeight: 840 })).toBeCloseTo(1.044, 2)
    expect(fieldZoom({ width: 300, height: 300, availWidth: 3000, availHeight: 3000 })).toBe(FIELD_ZOOM_MAX)
  })

  it('nunca lo achica ni se rompe sin medidas', () => {
    expect(fieldZoom({ width: 900, height: 600, availWidth: 500, availHeight: 400 })).toBe(1)
    expect(fieldZoom({ width: 0, height: 0, availWidth: 800, availHeight: 600 })).toBe(1)
  })
})

describe('los avisos adentro de un lateral', () => {
  function Host({ enabled }: { enabled: boolean }) {
    const ref = useRef<HTMLDivElement | null>(null)

    useHostToasts(ref, enabled)

    return <div ref={ref} data-testid="host" />
  }

  const box = { left: 256, top: 148, width: 208, height: 720 }

  it('mientras está el lateral, el contenedor de avisos se apoya en su recuadro; al irse, vuelve abajo al centro', () => {
    vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockReturnValue({ ...box, right: 464, bottom: 868, x: 256, y: 148, toJSON: () => ({}) })

    render(<AppToaster />)
    const container = () => document.querySelector<HTMLElement>('.app-toaster')!

    expect(container().style.width).toBe('')

    const host = render(<Host enabled />)

    act(() => undefined)
    expect(container().style.left).toBe('256px')
    expect(container().style.top).toBe('148px')
    expect(container().style.width).toBe('208px')
    expect(container().style.height).toBe('720px')
    expect(container().className).not.toContain('min-[1101px]:bottom-4!')

    host.unmount()
    expect(container().style.width).toBe('')
    expect(container().className).toContain('min-[1101px]:bottom-4!')
    expect(screen.queryByTestId('host')).not.toBeInTheDocument()
  })

  it('apagado (sin laterales) no toca nada', () => {
    vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockReturnValue({ ...box, right: 464, bottom: 868, x: 256, y: 148, toJSON: () => ({}) })

    render(<AppToaster />)
    render(<Host enabled={false} />)

    expect(document.querySelector<HTMLElement>('.app-toaster')!.style.width).toBe('')
  })
})
