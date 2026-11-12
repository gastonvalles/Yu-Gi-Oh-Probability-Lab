// @vitest-environment jsdom
import { act, fireEvent, screen, within } from '@testing-library/react'
import '@testing-library/jest-dom'
import { describe, expect, it } from 'vitest'

import { LOCATION as L, type CoreAsk } from '../app/auto/protocol'
import { act as activate, loc, pos, stringId } from './support/auto-session-fake'
import { core, handCard, phaseButton, renderAuto } from './support/auto-screen-harness'
import { tap } from './support/practice-mat-harness'

/**
 * En el celular, una sola hoja abajo y opaca (Gastón, 2026-11-11: «al intentar activar un efecto en el gy, los menús se tapan», y «Las 7»): gana la pregunta del núcleo, después la ficha de una carta
 * (o las fases) y después el visor de una pila. Lo que pierde se esconde sin cerrarse y vuelve como estaba; la cabeza de lo que gana lo dice con su flecha («‹ GY · 1», «‹ Ficha de «X»»).
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
const EFFECT_YN: CoreAsk = { type: 'select_effectyn', player: 0, ...pos(400, L.GRAVE, 0, 5), description: '6400' }

/** El visor a la vista (cediendo el lugar sigue montado, escondido: así vuelve como estaba). */
const viewer = () => document.querySelector('[data-pile-sheet]:not([hidden])')
const openGy = () => fireEvent.click(screen.getByRole('button', { name: 'GY: 1' }))
/** La pregunta del núcleo (ni la ficha ni las fases). */
const question = () => document.querySelector<HTMLElement>('[data-auto-panel]:not([data-prompt="card"]):not([data-prompt="phases"])')
/** Lo que sale con `Presence` termina de salir. */
const settle = () => act(() => {})

describe('auto · una sola hoja abajo en el celular', () => {
  it('la ficha de una carta del GY reemplaza al visor y lleva «‹ GY · 1»: volver la cierra y el visor vuelve con la misma pila (la X, igual)', () => {
    const fake = renderAuto()

    core(() => fake.ask(IDLE))
    openGy()
    expect(viewer()).toHaveAccessibleName('GY · 1')
    fireEvent.click(within(viewer() as HTMLElement).getByRole('button', { name: /^Nibiru/ }))
    settle()
    const sheet = screen.getByRole('region', { name: 'Nibiru' })

    expect(viewer()).toBeNull()
    expect(within(sheet).getAllByRole('menuitem')).toHaveLength(1)
    fireEvent.click(within(sheet).getByRole('button', { name: 'Volver a GY · 1' }))
    settle()
    expect(screen.queryByRole('region', { name: 'Nibiru' })).toBeNull()
    expect(viewer()).toHaveAccessibleName('GY · 1')

    fireEvent.click(within(viewer() as HTMLElement).getByRole('button', { name: /^Nibiru/ }))
    settle()
    fireEvent.click(within(screen.getByRole('region', { name: 'Nibiru' })).getByRole('button', { name: 'Cerrar' }))
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
    // Vuelve como estaba: bajado.
    expect(viewer()).toHaveAttribute('data-lowered')

    fireEvent.click(phaseButton())
    settle()
    expect(document.querySelector('[data-prompt="phases"]')).not.toBeNull()
    expect(viewer()).toBeNull()
    // Las fases son un menú pegado a su botón (M-04): Escape lo cierra.
    fireEvent.keyDown(window, { key: 'Escape' })
    settle()

    // Activar desde el GY: el visor se cierra (si no, taparía lo que el núcleo pregunte después).
    fireEvent.click(within(viewer() as HTMLElement).getByRole('button', { name: /^Nibiru/ }))
    settle()
    fireEvent.click(screen.getAllByRole('menuitem')[0]!)
    settle()
    expect(viewer()).toBeNull()
    expect(fake.answers).toEqual([{ type: 'select_idlecmd', action: 5, index: 0 }])
  })

  it('la pregunta que llega gana al visor abierto: el visor cede sin cerrarse, la pregunta dice «‹ GY · 1» y, contestada, el visor vuelve', () => {
    const fake = renderAuto()

    core(() => fake.ask(IDLE))
    openGy()
    core(() => fake.ask(EFFECT_YN))
    settle()
    expect(viewer()).toBeNull()
    expect(question()).not.toBeNull()
    expect(question()!.querySelector('[data-layer-back]')).toHaveTextContent('GY · 1')

    core(() => fake.ask(IDLE))
    settle()
    expect(question()).toBeNull()
    expect(viewer()).toHaveAccessibleName('GY · 1')
  })

  it('lo que abrís con la pregunta ya abierta va encima: el visor se ve y la pregunta se esconde sin cerrarse (la regla va en el cartel) hasta cerrarlo', () => {
    const fake = renderAuto()
    // La regla de la clase (`body:has(…)`): lo que el navegador evalúa para esconder la pregunta.
    const covered = () => document.body.matches('body:has(>[data-auto-panel=docked][data-prompt=card],[data-pile-sheet]:not([hidden]))')

    core(() => fake.ask(EFFECT_YN))
    expect(question()).toHaveClass('in-[body:has(>[data-auto-panel=docked][data-prompt=card],[data-pile-sheet]:not([hidden]))]:hidden')
    expect(question()!.querySelector('[data-layer-back]')).toBeNull()
    expect(covered()).toBe(false)
    openGy()
    expect(viewer()).toHaveAccessibleName('GY · 1')
    expect(covered()).toBe(true)
    fireEvent.click(within(viewer() as HTMLElement).getByRole('button', { name: 'Cerrar' }))
    settle()
    expect(covered()).toBe(false)
    expect(question()).not.toBeNull()
  })

  it('una pregunta que llega con la ficha abierta la guarda (no la cierra): dice «‹ Ficha de «X»» y, contestada, la ficha vuelve', () => {
    const fake = renderAuto()

    core(() => fake.ask(IDLE))
    tap(handCard('Ash Blossom'))
    settle()
    expect(screen.getByRole('region', { name: 'Ash Blossom' })).toBeInTheDocument()

    core(() => fake.ask(EFFECT_YN))
    settle()
    expect(screen.queryByRole('region', { name: 'Ash Blossom' })).toBeNull()
    expect(question()!.querySelector('[data-layer-back]')).toHaveTextContent('Ficha de «Ash Blossom»')

    core(() => fake.ask(IDLE))
    settle()
    expect(screen.getByRole('region', { name: 'Ash Blossom' })).toBeInTheDocument()
  })

  it('las hojas de abajo son opacas: la pregunta, la ficha y el visor (nada de la mano se lee a través)', () => {
    const fake = renderAuto()

    core(() => fake.ask(EFFECT_YN))
    expect(question()).toHaveClass('bg-card-background')
    core(() => fake.ask(IDLE))
    settle()
    openGy()
    expect(viewer()!.querySelector('.bg-card-background')).not.toBeNull()
    tap(handCard('Ash Blossom'))
    settle()
    expect(screen.getByRole('region', { name: 'Ash Blossom' })).toHaveClass('bg-card-background')
    expect(document.querySelector('[class*="bg-card-background/"]')).toBeNull()
  })
})
