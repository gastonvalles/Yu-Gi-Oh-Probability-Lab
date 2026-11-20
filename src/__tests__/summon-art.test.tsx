// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import '@testing-library/jest-dom'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { SUMMON_ART_KEY, playSummonArt, setSummonArt, summonArtOn } from '../app/summon-art'
import { MatMoreMenu } from '../components/probability/MatBarActions'

// «Imagen de la carta al invocar (beta)» (`app/summon-art.ts`): apagada de fábrica, se prende desde «La mesa» y se recuerda tras recargar.
describe('el interruptor de la irrupción al invocar', () => {
  afterEach(() => {
    cleanup()
    setSummonArt(false)
    localStorage.removeItem(SUMMON_ART_KEY)
  })

  it('viene apagado, se prende desde «La mesa» y se guarda', () => {
    expect(summonArtOn()).toBe(false)
    render(<MatMoreMenu items={[]} defaultOpen />)
    const row = screen.getByRole('menuitemcheckbox', { name: /^Imagen de la carta al invocar \(beta\)/ })

    expect(row).toHaveAttribute('aria-checked', 'false')
    fireEvent.click(row)
    expect(summonArtOn()).toBe(true)
    expect(localStorage.getItem(SUMMON_ART_KEY)).toBe('on')
  })

  it('al recargar se lee lo guardado; apagarla borra la clave', async () => {
    localStorage.setItem(SUMMON_ART_KEY, 'on')
    vi.resetModules()
    const fresh = await import('../app/summon-art')

    expect(fresh.summonArtOn()).toBe(true)
    fresh.setSummonArt(false)
    expect(localStorage.getItem(SUMMON_ART_KEY)).toBeNull()
  })

  it('la franja va con bordes rectos (decisión del Jefe, 2026-11-19: sin barrido diagonal): las bandas son rectángulos, el arte no se recorta en diagonal y los cortes son verticales', () => {
    Element.prototype.animate = () => ({ addEventListener: () => {}, cancel: () => {} }) as unknown as Animation
    try {
      document.body.innerHTML = ''
      playSummonArt('arte.jpg')
      const root = document.querySelector<HTMLElement>('[data-fx="summon-art"]')!
      const polygons = [...root.querySelectorAll('polygon')].map((polygon) => polygon.getAttribute('points')!.split(' ').map((point) => Number(point.split(',')[0])))
      expect(polygons).toHaveLength(3)
      // Un rectángulo: sólo dos x distintas (los dos lados, derechos).
      for (const xs of polygons) expect(new Set(xs).size).toBe(2)
      const lines = [...root.querySelectorAll('line')]
      expect(lines).toHaveLength(3)
      for (const line of lines) expect(line.getAttribute('x1')).toBe(line.getAttribute('x2'))
      expect(root.innerHTML).not.toMatch(/clip-path/)
    } finally {
      delete (Element.prototype as Partial<Element>).animate
      document.body.innerHTML = ''
    }
  })

  it('la franja se centra en el campo (sin los paneles laterales); con el campo centrado en la ventana (el celular) queda donde estaba', () => {
    const width = window.innerWidth
    Element.prototype.animate = () => ({ addEventListener: () => {}, cancel: () => {} }) as unknown as Animation
    Object.assign(window, { innerWidth: 1440 })
    try {
      const fieldAt = (left: number, w: number) => ({ getBoundingClientRect: () => new DOMRect(left, 250, w, 420) }) as unknown as Element
      const shifted = (field: Element | null) => {
        document.body.innerHTML = ''
        playSummonArt('arte.jpg', field)
        const root = document.querySelector<HTMLElement>('[data-fx="summon-art"]')!
        return [root.style.left !== '', root.style.right !== '']
      }
      // El campo de 400 a 1000 px: su centro (700) está 20 px a la izquierda del de la ventana (720).
      expect(shifted(fieldAt(400, 600))).toEqual([true, true])
      expect(shifted(fieldAt(420, 600))).toEqual([false, false])
      expect(shifted(null)).toEqual([false, false])
    } finally {
      Object.assign(window, { innerWidth: width })
      delete (Element.prototype as Partial<Element>).animate
      document.body.innerHTML = ''
    }
  })
})
