// @vitest-environment jsdom
import { act, cleanup, render, screen } from '@testing-library/react'
import '@testing-library/jest-dom'
import { useRef } from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { FIELD_ZOOM_MAX, classicCell, fieldZoom, matSpot, railsFit } from '../app/duel-rails'
import { useHostToasts } from '../app/toast-box'
import { AppToaster } from '../components/ui/AppToaster'

afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
})

describe('el lugar fijo de los carteles de la mesa (`matSpot`)', () => {
  const box = (top: number, bottom: number, left: number, right: number) => ({ top, bottom, left, right })
  // Un celular de 390 × 844: la barra hasta 60, la columna de 0 a 844 y las dos Zonas Extra (la 2.ª y la 4.ª de cinco columnas) de 380 a 452.
  const extra = [box(380, 452, 80, 152), box(380, 452, 238, 310)]
  const column = box(0, 844, 0, 390)

  it('el cartel chico apoya en el borde de arriba de la fila Extra y la hoja va a su centro, a lo ancho del campo', () => {
    const spot = matSpot(extra, column, 60)!

    expect(spot.top).toBe(380)
    expect(spot.x).toBe(195)
    expect(spot.y).toBe(416)
    // Ancho: la columna entera menos 8 de cada lado.
    expect(spot.width).toBe(374)
  })

  it('la hoja, lo más alta que entra centrada sin tapar la barra ni salirse de la columna, y no más del 70 % de la mesa', () => {
    // Centrada en 416: hasta la barra hay 356 (menos 8), y el 70 % de 844 es 590: gana el 70 %.
    expect(matSpot(extra, column, 60)!.room).toBe(590)
    // Con la barra hasta 200: 2 × (216 − 8) = 416.
    expect(matSpot(extra, column, 200)!.room).toBe(416)
    // Con la columna cortada en 500 (la ventana): 2 × (84 − 8) = 152.
    expect(matSpot(extra, box(0, 500, 0, 390), 60)!.room).toBe(152)
  })

  it('con laterales o paneles la fila no está al centro de la columna: el ancho es el doble de lo que hay hasta el costado más cercano', () => {
    const spot = matSpot([box(300, 400, 600, 700), box(300, 400, 800, 900)], box(0, 900, 300, 1400), 0)!

    expect(spot.x).toBe(750)
    expect(spot.width).toBe(2 * (750 - 300) - 16)
  })

  it('sin la fila (todavía no hay campo) no hay lugar: los carteles van al centro de la pantalla', () => {
    expect(matSpot([], column, 60)).toBeNull()
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
