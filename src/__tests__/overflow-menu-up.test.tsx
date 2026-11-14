// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { useEscapeKey } from '../app/use-overlay'
import { OverflowMenu } from '../components/ui/OverflowMenu'

// jsdom no mide: cada caja dice dónde está (y el menú, su alto) y se prueba la cuenta de «abajo no entra, arriba sí».
const rect = (top: number, bottom: number) => ({ top, bottom, left: 0, right: 100, width: 100, height: bottom - top, x: 0, y: top, toJSON: () => ({}) }) as DOMRect

function openIn(scroller: { top: number; bottom: number }, trigger: { top: number; bottom: number }) {
  vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockImplementation(function (this: HTMLElement) {
    if (this.dataset.scroller !== undefined) return rect(scroller.top, scroller.bottom)
    return rect(trigger.top, trigger.bottom)
  })
  vi.spyOn(HTMLElement.prototype, 'offsetHeight', 'get').mockReturnValue(80)
  render(
    <div data-scroller="" style={{ overflowY: 'auto' }}>
      <OverflowMenu label="Más opciones de Combo" items={[{ label: 'Compartir enlace', onSelect: () => {} }, { label: 'Descargar video', onSelect: () => {} }]} />
    </div>,
  )
  fireEvent.click(screen.getByRole('button', { name: 'Más opciones de Combo' }))
  return screen.getByRole('menu')
}

afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
})

describe('OverflowMenu: no lo corta lo que lo contiene', () => {
  it('la última ficha de una lista con scroll lo abre hacia arriba', () => {
    const menu = openIn({ top: 100, bottom: 600 }, { top: 550, bottom: 590 })
    expect(menu.className).toContain('bottom-full')
    expect(menu.className).not.toContain('top-full')
  })

  it('con lugar abajo (o sin lugar arriba) se abre hacia abajo, como siempre', () => {
    expect(openIn({ top: 100, bottom: 600 }, { top: 150, bottom: 190 }).className).toContain('top-full')
  })
})

describe('OverflowMenu: Escape', () => {
  // Como el menú del replay: adentro de una capa que también se cierra con Escape (`ReplayLayer`).
  function Layer({ onClose }: { onClose: () => void }) {
    useEscapeKey(onClose)
    return <OverflowMenu label="Más opciones de Duelo" items={[{ label: 'Ver desde el otro lado', onSelect: () => {} }]} />
  }

  it('cierra sólo el menú y deja abierto lo que lo contiene; el segundo Escape cierra la capa', () => {
    const onClose = vi.fn()
    render(<Layer onClose={onClose} />)
    const trigger = screen.getByRole('button', { name: 'Más opciones de Duelo' })
    fireEvent.click(trigger)
    expect(trigger.getAttribute('aria-expanded')).toBe('true')

    fireEvent.keyDown(document.body, { key: 'Escape' })
    expect(trigger.getAttribute('aria-expanded')).toBe('false')
    expect(onClose).not.toHaveBeenCalled()
    expect(document.activeElement).toBe(trigger)

    fireEvent.keyDown(document.body, { key: 'Escape' })
    expect(onClose).toHaveBeenCalledTimes(1)
  })
})
