// @vitest-environment jsdom
import { act, fireEvent, screen, within } from '@testing-library/react'
import '@testing-library/jest-dom'
import { describe, expect, it } from 'vitest'

import { LOCATION as L, type CoreAsk } from '../app/auto/protocol'
import { act as activate, loc, pos, stringId } from './support/auto-session-fake'
import { core, handCard, phaseButton, renderAuto } from './support/auto-screen-harness'
import { tap } from './support/practice-mat-harness'

/**
 * En el celular, una sola capa abajo (Gastón, 2026-11-11: «al intentar activar un efecto en el gy, los menús se tapan»): la tira bajada del visor de una pila (z 180) quedaba encima de la fila de
 * jugadas de la ficha del automático (z 130). Ahora la ficha y las fases esconden el visor sin cerrarlo (vuelve como estaba al cerrarlas) y el visor esconde las preguntas, como la hoja de la cadena.
 */

const IDLE: CoreAsk = {
  type: 'select_idlecmd',
  player: 0,
  summons: [loc(100, L.HAND, 0)],
  special_summons: [],
  pos_changes: [],
  monster_sets: [loc(100, L.HAND, 0)],
  spell_sets: [],
  activates: [activate(400, L.GRAVE, 0, stringId(400, 1))],
  to_bp: true,
  to_ep: true,
  shuffle: false,
}

const viewer = () => document.querySelector('[data-pile-sheet]')
const openGy = () => fireEvent.click(screen.getByRole('button', { name: 'GY: 1' }))
/** Lo que sale con `Presence` termina de salir. */
const settle = () => act(() => {})

describe('auto · capas de abajo en el celular', () => {
  it('la ficha de una carta del GY esconde el visor (sus jugadas quedan solas abajo) y al cerrarla el visor vuelve con la misma pila', () => {
    const fake = renderAuto()

    core(() => fake.ask(IDLE))
    openGy()
    expect(viewer()).toHaveAccessibleName('GY · 1')
    fireEvent.click(within(viewer() as HTMLElement).getByRole('button', { name: /^Nibiru/ }))
    settle()
    const sheet = screen.getByRole('region', { name: 'Nibiru' })

    expect(viewer()).toBeNull()
    expect(within(sheet).getAllByRole('menuitem')).toHaveLength(1)

    fireEvent.click(within(sheet).getByRole('button', { name: 'Cerrar' }))
    settle()
    expect(viewer()).toHaveAccessibleName('GY · 1')
  })

  it('con el visor bajado, la ficha de una carta de la mano y las fases también lo esconden; la jugada desde el GY lo cierra', () => {
    const fake = renderAuto()

    core(() => fake.ask(IDLE))
    openGy()
    fireEvent.click(screen.getByRole('button', { name: 'Bajar la hoja' }))
    expect(viewer()).toHaveAttribute('data-lowered')

    tap(handCard('Ash Blossom'))
    settle()
    expect(screen.getByRole('region', { name: 'Ash Blossom' })).toBeInTheDocument()
    expect(viewer()).toBeNull()
    fireEvent.click(within(screen.getByRole('region', { name: 'Ash Blossom' })).getByRole('button', { name: 'Cerrar' }))
    settle()
    expect(viewer()).not.toBeNull()

    fireEvent.click(phaseButton())
    settle()
    expect(document.querySelector('[data-prompt="phases"]')).not.toBeNull()
    // Debajo del cartel, tu mano y tu fila se atenúan (sólo `opacity`): su texto no compite con el del cartel a través del fondo al 92 %.
    expect(screen.getByRole('list', { name: 'Mano' })).toHaveClass('in-[body:has(>[data-auto-panel=docked]:not([data-minimized]))]:opacity-30')
    expect(viewer()).toBeNull()
    fireEvent.click(within(document.querySelector<HTMLElement>('[data-prompt="phases"]')!).getByRole('button', { name: 'Cancelar' }))
    settle()

    // Activar desde el GY: el visor se cierra (si no, taparía lo que el núcleo pregunte después).
    fireEvent.click(within(viewer() as HTMLElement).getByRole('button', { name: /^Nibiru/ }))
    settle()
    fireEvent.click(screen.getAllByRole('menuitem')[0]!)
    settle()
    expect(viewer()).toBeNull()
    expect(fake.answers).toEqual([{ type: 'select_idlecmd', action: 5, index: 0 }])
  })

  it('con un cartel acoplado abierto, tu mano lleva la atenuación y su regla se cumple; minimizado o sin cartel, no', () => {
    const fake = renderAuto()
    const dim = 'in-[body:has(>[data-auto-panel=docked]:not([data-minimized]))]:opacity-30'
    // La regla de la clase (`body:has(…)`): lo que el navegador evalúa para atenuar.
    const under = () => document.body.matches('body:has(>[data-auto-panel=docked]:not([data-minimized]))')

    core(() => fake.ask(IDLE))
    expect(screen.getByRole('list', { name: 'Mano' })).toHaveClass(dim)
    expect(under()).toBe(false)

    fireEvent.click(phaseButton())
    settle()
    expect(under()).toBe(true)
    fireEvent.click(within(document.querySelector<HTMLElement>('[data-prompt="phases"]')!).getByRole('button', { name: 'Minimizar' }))
    settle()
    expect(under()).toBe(false)
    fireEvent.click(within(document.querySelector<HTMLElement>('[data-prompt="phases"]')!).getByRole('button', { name: 'Cancelar' }))
    settle()
    expect(document.querySelector('[data-prompt="phases"]')).toBeNull()
    expect(under()).toBe(false)
  })

  it('una pregunta del núcleo se esconde mientras el visor de una pila está abierto (la regla va en el cartel; el visor lleva la marca)', () => {
    const fake = renderAuto()

    core(() => fake.ask({ type: 'select_effectyn', player: 0, ...pos(400, L.GRAVE, 0, 5), description: '6400' }))
    const ask = document.querySelector<HTMLElement>('[data-prompt]:not([data-prompt="card"]):not([data-prompt="phases"])')!

    expect(ask).toHaveClass('in-[body:has([data-pile-sheet])]:hidden')
    openGy()
    expect(viewer()).not.toBeNull()
  })
})
