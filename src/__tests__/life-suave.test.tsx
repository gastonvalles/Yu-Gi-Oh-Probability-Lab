// @vitest-environment jsdom
import { act, cleanup, render, screen } from '@testing-library/react'
import '@testing-library/jest-dom'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { LifeBadge } from '../components/duel/LifeScore'
import { LifeTile } from '../components/duel/DuelBar'

afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
})

describe('la chapa de vidas cuenta suave', () => {
  it('el número es el mismo elemento antes, durante y después del cambio (no se vuelve a montar) y el «−N» aparece en el mismo dibujo que el cambio', () => {
    const view = render(<LifeBadge name="Rival" label="Rival" life={8000} />)
    const number = screen.getByRole('group').querySelector('.tabular-nums.block')!

    expect(number).toHaveTextContent('8000')
    act(() => {
      view.rerender(<LifeBadge name="Rival" label="Rival" life={7200} />)
    })
    // Sin esperar ningún cuadro más: el «−800» ya está (layout effect, no passive).
    expect(screen.getByRole('group').querySelector('[data-life-delta]')).toHaveTextContent('−800')
    expect(screen.getByRole('group').querySelector('.tabular-nums.block')).toBe(number)
  })

  it('la cuenta escribe el texto por ref: a mitad de camino React no vuelve a dibujar la chapa', () => {
    let frames: FrameRequestCallback[] = []

    vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) => frames.push(callback))
    vi.stubGlobal('cancelAnimationFrame', () => {})
    const frame = (time: number) => {
      const now = frames

      frames = []
      act(() => now.forEach((callback) => callback(time)))
    }
    const view = render(<LifeBadge name="Rival" label="Rival" life={8000} />)
    const number = screen.getByRole('group').querySelector('.tabular-nums.block')!

    act(() => {
      view.rerender(<LifeBadge name="Rival" label="Rival" life={7000} />)
    })
    frame(1000)
    frame(1100)
    // Va por el medio y el texto lo escribió la cuenta (React sigue creyendo que son 8000).
    expect(Number(number.textContent)).toBeGreaterThan(7000)
    expect(Number(number.textContent)).toBeLessThan(8000)
    frame(1500)
    expect(number).toHaveTextContent('7000')
  })
})

describe('la barra de vidas se escala, no cambia de ancho', () => {
  it('lleva el ancho completo, scaleX desde la izquierda y la duración de la cuenta del número', () => {
    const view = render(<LifeTile name="Yeou" life={8000} mine />)
    const bar = () => screen.getByRole('meter').firstElementChild as HTMLElement

    expect(bar().style.transform).toBe('scaleX(1)')
    expect(bar().style.width).toBe('')
    expect(bar()).toHaveClass('origin-left', 'transition-transform', 'motion-reduce:transition-none')
    expect(bar().className).not.toContain('transition-[width]')
    act(() => {
      view.rerender(<LifeTile name="Yeou" life={6000} mine />)
    })
    expect(bar().style.transform).toBe('scaleX(0.75)')
    // La misma duración que la cuenta del número (lifeCountMs de 2000: 320 + 580 × 0,25 = 465).
    expect(bar().style.transitionDuration).toBe('465ms')
  })
})
