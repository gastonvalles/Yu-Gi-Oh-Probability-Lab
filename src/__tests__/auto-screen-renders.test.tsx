// @vitest-environment jsdom
// Cuántas veces se dibuja la mesa entera en «Jugar solo automático» (`useMatPanels`, que sólo usa `PracticeMat`, como espía: un commit en el que la mesa se dibujó). Un aviso del
// núcleo que no cambia nada de lo que la mesa muestra no la vuelve a dibujar (la pantalla arma `duel` de nuevo en cada render suyo y la mesa lo compara campo por campo), cada paso de
// una tanda es un dibujo, la pregunta se ve en el commit en que llega y lo que la mesa toca ve siempre lo último (nada queda congelado).
import { act, fireEvent, screen } from '@testing-library/react'
import '@testing-library/jest-dom'
import { describe, expect, it, vi } from 'vitest'

import { LOCATION as L, type CoreAsk } from '../app/auto/protocol'
import { STEP_MS } from '../components/auto/AutoSoloScreen'
import { loc } from './support/auto-session-fake'
import { core, dispatches, handCard, inHand, phaseButton, renderAuto } from './support/auto-screen-harness'

const spy = vi.hoisted(() => ({ draws: 0 }))

vi.mock('../app/mat-panels', async () => {
  const actual = await vi.importActual<typeof import('../app/mat-panels')>('../app/mat-panels')
  const { useLayoutEffect } = await vi.importActual<typeof import('react')>('react')

  return {
    ...actual,
    useMatPanels: (...args: Parameters<typeof actual.useMatPanels>) => {
      // Un dibujo = un commit en el que la mesa corrió (un `setState` durante el render la vuelve a correr sin dibujar: no cuenta dos veces).
      useLayoutEffect(() => {
        spy.draws += 1
      })
      return actual.useMatPanels(...args)
    },
  }
})

const IDLE: CoreAsk = { type: 'select_idlecmd', player: 0, summons: [loc(100, L.HAND, 0)], special_summons: [], pos_changes: [], monster_sets: [], spell_sets: [], activates: [], to_bp: false, to_ep: true, shuffle: false }
/** Otra pregunta del turno, sin la Invocación: la carta de la mano ya no se puede invocar y se ofrece la batalla. */
const IDLE_NO_SUMMON: CoreAsk = { ...IDLE, summons: [], to_bp: true }

/** Cuántas veces se dibujó la mesa mientras corre `run`. */
function draws(run: () => void): number {
  const before = spy.draws

  run()
  return spy.draws - before
}
const step = () => act(() => vi.advanceTimersByTime(STEP_MS + 5))

describe('auto-screen · los dibujos de la mesa', () => {
  it('un aviso del núcleo que no cambia lo que se ve no la dibuja; una jugada o una pregunta nueva, sí, en el commit en que llega', () => {
    vi.useFakeTimers()
    const fake = renderAuto()

    core(() => fake.ask(IDLE))
    // Lo que el núcleo manda sin cambiar la mesa (el avance de la carga con la mesa lista, las jugadas del rival que no la tocan, un aviso igual al anterior): cero dibujos.
    expect(draws(() => core(() => fake.set({ progress: { done: 3, total: 3 } })))).toBe(0)
    expect(draws(() => core(() => fake.set({ theirsActs: [] })))).toBe(0)
    expect(draws(() => core(() => fake.set({})))).toBe(0)
    // Una jugada: la tanda llega (la mesa deja de ofrecer jugadas mientras la cuenta: un dibujo) y el paso se muestra a su ritmo (otro).
    expect(draws(() => core(() => fake.events([{ type: 'move', id: 'card-200-1', to: 'gy' }])))).toBe(1)
    expect(draws(step)).toBe(1)
    expect(screen.queryByRole('button', { name: 'Maxx C' })).toBeNull()
    // La pregunta que sigue se ve en el dibujo en que llega: el botón de la fase se enciende.
    expect(draws(() => core(() => fake.ask(IDLE)))).toBe(1)
    expect(phaseButton()).toBeEnabled()
    expect(dispatches).toBe(0)
  })

  it('una tanda de tres jugadas se cuenta en un dibujo por paso, y los avisos de por medio que no cambian nada no suman', () => {
    vi.useFakeTimers()
    const fake = renderAuto()

    expect(draws(() => core(() => fake.events([{ type: 'draw', count: 1, ids: ['card-101-1'] }, { type: 'draw', count: 1, ids: ['card-102-1'] }, { type: 'move', id: 'card-200-1', to: 'gy' }])))).toBe(1)
    // Avisos de por medio que no cambian nada (como los `stats` del núcleo).
    expect(draws(() => core(() => fake.set({ progress: { done: 3, total: 3 } })))).toBe(0)
    // Un robo son dos dibujos: el paso y, después, la mano que recibe la carta (el reparto de a una, `dealt`); mover una carta del campo, uno.
    expect(draws(step)).toBeLessThanOrEqual(2)
    expect(draws(() => core(() => fake.set({ theirsActs: [] })))).toBe(0)
    expect(draws(step)).toBeLessThanOrEqual(2)
    expect(draws(step)).toBe(1)
    expect(draws(() => core(() => fake.ask(IDLE)))).toBe(1)
    expect(inHand('Imperm')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Maxx C' })).toBeNull()
    expect(phaseButton()).toBeEnabled()
  })

  it('la etiqueta de ATK/DEF de siempre: los mismos números (otro aviso, una carta que no está en el campo) no dibujan la mesa; uno que cambia, un dibujo', () => {
    vi.useFakeTimers()
    const fake = renderAuto()
    const overlay = () => fake.getSnapshot().overlay
    const stats = (attack: number, extra = {}) => ({ mine: { 'card-200-1': { attack, defense: 1000, level: 4 }, ...extra }, theirs: {} })

    core(() => fake.ask(IDLE))
    expect(draws(() => core(() => fake.set({ overlay: { ...overlay(), stats: stats(1900) } })))).toBe(1)
    expect(document.querySelector('[data-pick-stat]')).toHaveTextContent('1900 / 1000')
    expect(draws(() => core(() => fake.set({ overlay: { ...overlay(), stats: stats(1900) } })))).toBe(0)
    expect(draws(() => core(() => fake.set({ overlay: { ...overlay(), stats: stats(1900, { 'card-101-1': { attack: 500, defense: 500, level: 1 } }) } })))).toBe(0)
    expect(draws(() => core(() => fake.set({ overlay: { ...overlay(), stats: stats(2400) } })))).toBe(1)
    expect(document.querySelector('[data-pick-stat]')).toHaveTextContent('2400 / 1000')
  })

  it('nada queda congelado: lo que la mesa ofrece es siempre lo de la última pregunta, aunque la de antes haya dejado sus funciones armadas', () => {
    vi.useFakeTimers()
    const fake = renderAuto()

    core(() => fake.ask(IDLE))
    fireEvent.pointerDown(handCard('Ash Blossom'), { button: 0, pointerId: 1 })
    fireEvent.pointerUp(handCard('Ash Blossom'), { button: 0, pointerId: 1 })
    expect(screen.getByRole('menuitem', { name: 'Invocación Normal' })).toBeInTheDocument()
    fireEvent.keyDown(document, { key: 'Escape' })
    // Otra pregunta: la carta ya no se invoca y el botón de la fase ofrece la Battle Phase (lo nuevo).
    core(() => fake.ask(IDLE_NO_SUMMON))
    fireEvent.pointerDown(handCard('Ash Blossom'), { button: 0, pointerId: 1 })
    fireEvent.pointerUp(handCard('Ash Blossom'), { button: 0, pointerId: 1 })
    expect(screen.queryByRole('menuitem', { name: 'Invocación Normal' })).toBeNull()
    fireEvent.keyDown(document, { key: 'Escape' })
    fireEvent.click(phaseButton())
    fireEvent.click(screen.getByRole('menuitem', { name: 'Ir a Battle Phase' }))
    expect(fake.answers.at(-1)).toEqual({ type: 'select_idlecmd', action: 6, index: null })
    expect(dispatches).toBe(0)
  })
})
