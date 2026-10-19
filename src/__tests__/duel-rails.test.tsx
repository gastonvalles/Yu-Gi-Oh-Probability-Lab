// @vitest-environment jsdom
import { act, cleanup, render, screen } from '@testing-library/react'
import '@testing-library/jest-dom'
import { useRef } from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { classicCell, railsFit } from '../app/duel-rails'
import { useHostToasts } from '../app/toast-box'
import { AppToaster } from '../components/ui/AppToaster'

afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
})

describe('cuándo hay laterales', () => {
  it('la casilla sin laterales sale del alto: 24,75 rem de lo que no es campo, entre 3,5 y 9,5 rem', () => {
    expect(classicCell(1000)).toBeCloseTo((1000 - 396) / 5)
    expect(classicCell(300)).toBe(56)
    expect(classicCell(3000)).toBe(152)
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
