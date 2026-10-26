// @vitest-environment jsdom
// Las fases en una línea (lámina 06): qué dice cada una, qué hace tocarla, cómo se cierra y el teclado.
import { act, fireEvent, render, screen } from '@testing-library/react'
import '@testing-library/jest-dom'
import { describe, expect, it, vi } from 'vitest'

import type { MenuItem } from '../components/probability/MatDialogs'
import { PhaseRow, phaseRowEntries } from '../components/probability/PhaseRow'

const ANCHOR = { left: 300, top: 400, width: 44, height: 44, right: 344, bottom: 444, x: 300, y: 400, toJSON: () => ({}) } as DOMRect

/** Las fases como las arma el núcleo en la Main Phase 1: la DP y la SP todavía no, la M1 la de ahora, el resto se puede elegir. */
const items = (onSelect = vi.fn()): MenuItem[] => [
  { label: 'Draw Phase', disabled: true, hint: 'Todavía no', onSelect },
  { label: 'Standby Phase', disabled: true, hint: 'Todavía no', onSelect },
  { label: 'Main Phase 1', current: true, onSelect },
  { label: 'Battle Phase', onSelect },
  { label: 'Main Phase 2', onSelect },
  { label: 'End Phase', onSelect },
]

describe('PhaseRow · las fases en una línea', () => {
  it('cada fase lleva la sigla del botón, su palabra y un nombre que dice qué hace tocarla', () => {
    expect(phaseRowEntries(items()).map(({ short, word, name }) => [short, word, name])).toEqual([
      ['DP', 'Draw', 'Draw Phase · Todavía no'],
      ['SP', 'Standby', 'Standby Phase · Todavía no'],
      ['M1', 'Main 1', 'Fase actual: Main Phase 1'],
      ['BP', 'Battle', 'Ir a Battle Phase'],
      ['M2', 'Main 2', 'Ir a Main Phase 2'],
      ['EP', 'End', 'Ir a End Phase'],
    ])
  })

  it('marca la de ahora, las apagadas no hacen nada y elegir una llama a su opción', () => {
    const onSelect = vi.fn()

    render(<PhaseRow anchor={ANCHOR} items={items(onSelect)} onClose={() => {}} />)
    expect(screen.getByRole('menu', { name: 'Pasar a la fase' })).toHaveAttribute('aria-orientation', 'horizontal')
    expect(screen.getByRole('menuitem', { name: 'Fase actual: Main Phase 1' })).toHaveAttribute('aria-current', 'true')
    fireEvent.click(screen.getByRole('menuitem', { name: 'Draw Phase · Todavía no' }))
    expect(onSelect).not.toHaveBeenCalled()
    fireEvent.click(screen.getByRole('menuitem', { name: 'Ir a Battle Phase' }))
    expect(onSelect).toHaveBeenCalledTimes(1)
  })

  it('Escape, «Cancelar» y tocar afuera la cierran; tocar adentro no', () => {
    const now = vi.spyOn(performance, 'now')
    const onClose = vi.fn()

    now.mockReturnValue(0)
    render(<PhaseRow anchor={ANCHOR} items={items()} onClose={onClose} />)
    fireEvent.keyDown(window, { key: 'Escape' })
    expect(onClose).toHaveBeenCalledTimes(1)
    fireEvent.click(screen.getByRole('button', { name: 'Cancelar' }))
    expect(onClose).toHaveBeenCalledTimes(2)
    // El toque fantasma del celular (justo después de abrir) no la cierra; uno de verdad, afuera, sí.
    const backdrop = screen.getByRole('menu').closest('[data-phase-row]')!.parentElement!

    fireEvent.click(backdrop)
    expect(onClose).toHaveBeenCalledTimes(2)
    now.mockReturnValue(10_000)
    fireEvent.click(screen.getByRole('menu'))
    expect(onClose).toHaveBeenCalledTimes(2)
    fireEvent.click(backdrop)
    expect(onClose).toHaveBeenCalledTimes(3)
    now.mockRestore()
  })

  it('el foco arranca en la de ahora y ← → Inicio Fin recorren sólo las que se pueden elegir, dando la vuelta', async () => {
    render(<PhaseRow anchor={ANCHOR} items={items()} onClose={() => {}} />)
    await act(() => new Promise((resolve) => requestAnimationFrame(resolve)))
    const focused = () => document.activeElement?.getAttribute('aria-label')
    const key = (name: string) => fireEvent.keyDown(document.activeElement!, { key: name })

    expect(focused()).toBe('Fase actual: Main Phase 1')
    key('ArrowRight')
    expect(focused()).toBe('Ir a Battle Phase')
    key('End')
    expect(focused()).toBe('Ir a End Phase')
    key('ArrowRight')
    expect(focused()).toBe('Fase actual: Main Phase 1')
    key('ArrowLeft')
    expect(focused()).toBe('Ir a End Phase')
    key('Home')
    expect(focused()).toBe('Fase actual: Main Phase 1')
  })

  it('sin botón (cerrada) no dibuja nada', () => {
    render(<PhaseRow anchor={null} items={items()} onClose={() => {}} />)
    expect(screen.queryByRole('menu')).not.toBeInTheDocument()
  })
})
