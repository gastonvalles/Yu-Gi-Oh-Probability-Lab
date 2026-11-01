// @vitest-environment jsdom
import { act, fireEvent, screen } from '@testing-library/react'
import '@testing-library/jest-dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { LOCATION as L, type CoreAsk } from '../app/auto/protocol'
import { FLIGHT_MS } from '../app/use-card-flights'
import { fakeSession, loc, pos } from './support/auto-session-fake'
import { core, dispatches, renderAuto } from './support/auto-screen-harness'
import { tap } from './support/practice-mat-harness'

// El ataque a la vista mientras se decide (la referencia de Master Duel que aprobó Gastón): tu monstruo que ataca lleva el aro rojo mientras elegís a quién y, con el mouse sobre un
// objetivo, la estela hasta él; cuando ataca el rival, la estela queda de su monstruo a tu carta (o a tus vidas) mientras le podés responder y se va con el daño.

const BATTLE: CoreAsk = { type: 'select_battlecmd', player: 0, chains: [], attacks: [{ ...loc(200, L.MZONE, 0), can_direct: false }], to_m2: true, to_ep: true }
const TARGET: CoreAsk = { type: 'select_card', player: 0, can_cancel: true, min: 1, max: 1, selects: [pos(700, L.MZONE, 0, 1, 1)] }
const CHAIN: CoreAsk = { type: 'select_chain', player: 0, spe_count: 1, forced: false, hint_timing: 0, hint_timing_other: 0, selects: [{ ...pos(900, L.HAND, 1, 10), description: '0', client_mode: 0 }] }
const rivalAttack = (target?: string) => ({ action: { type: 'attack' as const, id: 'c1', ...(target ? { target } : {}) }, reveal: {} })

// jsdom no tiene layout: tus cartas abajo, las del rival arriba y las vidas en el borde, así la estela tiene camino.
const rectOf = (element: Element) => {
  const box = (left: number, top: number, width: number, height: number) => ({ left, top, width, height, right: left + width, bottom: top + height, x: left, y: top, toJSON: () => ({}) }) as DOMRect

  if (element.hasAttribute('data-card-id')) return box(20, 500, 48, 70)
  if (element.hasAttribute('data-rival-card-id')) return box(200, 60, 48, 70)
  if (element.hasAttribute('data-lp')) return box(300, 700, 80, 40)
  return box(0, 0, 390, 844)
}
const original = Element.prototype.getBoundingClientRect

beforeEach(() => {
  Element.prototype.getBoundingClientRect = function (this: Element) {
    return rectOf(this)
  }
})
afterEach(() => {
  Element.prototype.getBoundingClientRect = original
})

const trail = () => document.querySelector<HTMLElement>('[data-fx="trail"]')
const attacker = () => screen.getByRole('button', { name: 'Maxx C' })
const rivalCard = () => document.querySelector<HTMLElement>('[data-rival-card-id="c1"]')!

/** «Atacar» con Maxx C y el núcleo pregunta a quién (`HINTMSG_ATTACKTARGET`). */
function aiming() {
  const fake = renderAuto()

  core(() => fake.ask(BATTLE))
  tap(attacker())
  fireEvent.click(screen.getByRole('menuitem', { name: 'Atacar' }))
  core(() => fake.ask(TARGET, '549'))

  return fake
}

describe('auto-screen · el aro del que ataca y la estela', () => {
  it('el aro rojo va en tu monstruo sólo mientras elegís a quién ataca: antes es «puede atacar» y al elegir se va', () => {
    const fake = renderAuto()

    core(() => fake.ask(BATTLE))
    expect(attacker()).toHaveAttribute('data-glow-kind', 'can')
    tap(attacker())
    fireEvent.click(screen.getByRole('menuitem', { name: 'Atacar' }))
    core(() => fake.ask(TARGET, '549'))
    expect(attacker()).toHaveAttribute('data-glow-kind', 'aim')
    expect(attacker()).toHaveAccessibleDescription('Ataca: elegí a qué')
    expect(document.querySelectorAll('[data-glow-kind="aim"]')).toHaveLength(1)
    // Elegir el objetivo contesta y el aro se va.
    fireEvent.click(screen.getByRole('button', { name: 'Rival, Zona de monstruo 1: marcar' }))
    expect(fake.answers.at(-1)).toEqual({ type: 'select_card', indices: [0] })
    expect(document.querySelector('[data-glow-kind="aim"]')).toBeNull()
    // Otra elección de cartas del rival (el objetivo de un efecto) no es un ataque: sin aro.
    core(() => fake.ask(TARGET, '551'))
    expect(document.querySelector('[data-glow-kind="aim"]')).toBeNull()
    expect(dispatches).toBe(0)
  })

  it('con el mouse sobre un objetivo, la estela va de tu monstruo a él; al salir se va; con el dedo no hay estela (sólo el aro)', () => {
    aiming()

    expect(trail()).toBeNull()
    fireEvent.pointerOver(rivalCard(), { pointerType: 'touch' })
    expect(trail()).toBeNull()
    fireEvent.pointerOver(rivalCard(), { pointerType: 'mouse' })
    expect(trail()).not.toBeNull()
    expect(trail()).toHaveAttribute('aria-hidden', 'true')
    // De abajo a la izquierda hacia arriba a la derecha.
    expect(trail()!.style.transform).toMatch(/^rotate\(-[\d.]+rad\)$/)
    fireEvent.pointerOver(attacker(), { pointerType: 'mouse' })
    expect(trail()).toBeNull()
    expect(document.querySelector('[data-glow-kind="aim"]')).not.toBeNull()
  })

  it('el ataque del rival deja su estela a tu monstruo mientras le podés responder; contestar, o el daño, la sacan', () => {
    const fake = renderAuto()

    core(() => fake.set({ theirsActs: [rivalAttack('card-200-1')], order: ['theirs'], overlay: { ...fake.getSnapshot().overlay, turnPlayer: 1 } }))
    act(() => vi.advanceTimersByTime(FLIGHT_MS))
    // Sin pregunta tuya, no hay ventana: sin estela.
    expect(trail()).toBeNull()
    core(() => fake.ask(CHAIN))
    expect(screen.getByRole('group', { name: '¿Activás algo ahora?' })).toBeInTheDocument()
    // Mientras está su cartel («Rival ataca a Maxx C», por donde pasa la estela), lo dice el cartel; al irse, la estela.
    expect(screen.getByText('Rival ataca a Maxx C')).toBeInTheDocument()
    expect(trail()).toBeNull()
    act(() => vi.advanceTimersByTime(4000))
    expect(screen.queryByText('Rival ataca a Maxx C')).toBeNull()
    expect(trail()).not.toBeNull()
    // Del rival (arriba) hacia tu carta (abajo).
    expect(trail()!.style.transform).toMatch(/^rotate\([\d.]+rad\)$/)
    fireEvent.click(screen.getByRole('button', { name: 'No responder' }))
    expect(trail()).toBeNull()
    // Otra ventana en el mismo ataque, todavía sin daño: vuelve; con el daño (cambian las vidas), ya no.
    core(() => fake.ask(CHAIN))
    expect(trail()).not.toBeNull()
    core(() => fake.set({ lifeSteps: [{ at: 0, lp: [8000, 8000] }, { at: 1, lp: [7000, 8000] }] }))
    expect(trail()).toBeNull()
    expect(dispatches).toBe(0)
  })

  it('un ataque directo del rival va a tus vidas', () => {
    const fake = renderAuto()

    core(() => fake.set({ theirsActs: [rivalAttack()], order: ['theirs'] }))
    act(() => vi.advanceTimersByTime(FLIGHT_MS))
    core(() => fake.ask(CHAIN))
    act(() => vi.advanceTimersByTime(4000))
    expect(trail()).not.toBeNull()
  })

  it('al volver a la pantalla con el ataque ya contado, la ventana abierta igual lo muestra (no depende del cartel, que no se repite)', () => {
    const fake = fakeSession()

    fake.set({ theirsActs: [rivalAttack('card-200-1')], order: ['theirs'] })
    renderAuto(fake)
    core(() => fake.ask(CHAIN))
    expect(screen.queryByText('Rival ataca a Maxx C')).toBeNull()
    expect(trail()).not.toBeNull()
  })
})
