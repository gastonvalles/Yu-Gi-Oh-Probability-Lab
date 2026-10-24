// @vitest-environment jsdom
import { fireEvent, screen, within } from '@testing-library/react'
import '@testing-library/jest-dom'
import { describe, expect, it } from 'vitest'

import { LOCATION as L, type CoreAsk } from '../app/auto/protocol'
import { act, loc, pos } from './support/auto-session-fake'
import { core, dispatches, handCard, lane, phaseButton, renderAuto, status } from './support/auto-screen-harness'
import { tap } from './support/practice-mat-harness'

// Las jugadas del turno en «Jugar solo automático»: cada pregunta del núcleo se contesta tocando la mesa de siempre, un gesto por prueba, y la mesa nunca despacha (0 del centinela).

const IDLE: CoreAsk = {
  type: 'select_idlecmd',
  player: 0,
  summons: [loc(100, L.HAND, 0)],
  special_summons: [loc(500, L.EXTRA, 0)],
  pos_changes: [loc(200, L.MZONE, 0)],
  monster_sets: [loc(100, L.HAND, 0)],
  spell_sets: [loc(900, L.HAND, 1)],
  activates: [act(900, L.HAND, 1), act(400, L.GRAVE, 0, '6401'), act(400, L.GRAVE, 0, '6402')],
  to_bp: true,
  to_ep: true,
  shuffle: false,
}
const BATTLE: CoreAsk = { type: 'select_battlecmd', player: 0, chains: [], attacks: [{ ...loc(200, L.MZONE, 0), can_direct: false }], to_m2: true, to_ep: true }
const CHAIN: CoreAsk = { type: 'select_chain', player: 0, spe_count: 0, forced: false, hint_timing: 0, hint_timing_other: 0, selects: [{ ...pos(900, L.HAND, 1, 10), description: '0', client_mode: 0 }] }

describe('auto-screen · las jugadas', () => {
  it('idle: tocar una carta de la mano abre sus jugadas legales y «Invocación Normal» contesta', () => {
    const fake = renderAuto()

    core(() => fake.ask(IDLE))
    tap(handCard('Ash Blossom'))
    const items = screen.getAllByRole('menuitem').map((item) => item.textContent)

    expect(items).toEqual(['Invocación Normal', 'Colocar'])
    fireEvent.click(screen.getByRole('menuitem', { name: 'Invocación Normal' }))
    expect(fake.answers).toEqual([{ type: 'select_idlecmd', action: 0, index: 0 }])
    expect(screen.queryByRole('menuitem')).toBeNull()
    expect(dispatches).toBe(0)
  })

  it('idle: una carta con dos efectos pregunta cuál (el segundo paso) y elegir uno contesta con su índice', () => {
    const fake = renderAuto()

    core(() => fake.ask(IDLE))
    fireEvent.click(screen.getByRole('button', { name: 'GY: 1' }))
    fireEvent.click(screen.getByRole('button', { name: /^Nibiru/ }))
    fireEvent.click(screen.getByRole('menuitem', { name: /Activar efecto/ }))
    const sheet = screen.getByRole('dialog', { name: 'Activar efecto' })
    const effects = within(sheet).getAllByRole('menuitem')

    expect(effects).toHaveLength(2)
    expect(effects[1]).toHaveTextContent('Efecto 2')
    fireEvent.click(effects[1]!)
    expect(fake.answers).toEqual([{ type: 'select_idlecmd', action: 5, index: 2 }])
    expect(dispatches).toBe(0)
  })

  it('idle: una Mágica de la mano dice «Activar» (y «Colocar»)', () => {
    const fake = renderAuto()

    core(() => fake.ask(IDLE))
    tap(handCard('Called by the Grave'))
    expect(screen.getAllByRole('menuitem').map((item) => item.textContent)).toEqual(['Activar', 'Colocar'])
    fireEvent.click(screen.getByRole('menuitem', { name: 'Activar' }))
    expect(fake.answers).toEqual([{ type: 'select_idlecmd', action: 5, index: 0 }])
  })

  it('fases: el botón de la fase ofrece las que el núcleo deja (las demás, apagadas) y «Battle Phase» contesta', () => {
    const fake = renderAuto()

    core(() => fake.ask(IDLE))
    expect(phaseButton()).toBeEnabled()
    fireEvent.click(phaseButton())
    const items = screen.getAllByRole('menuitem')

    expect(items).toHaveLength(6)
    expect(items[0]).toHaveTextContent('Draw PhaseTodavía no')
    expect(items[0]).toHaveAttribute('aria-disabled', 'true')
    expect(items[2]).toHaveAttribute('aria-current', 'true')
    expect(items[3]).toHaveTextContent('Battle Phase')
    expect(items[3]).not.toHaveAttribute('aria-disabled')
    fireEvent.click(items[3]!)
    expect(fake.answers).toEqual([{ type: 'select_idlecmd', action: 6, index: null }])
    expect(dispatches).toBe(0)
  })

  it('terminar el turno: «End Phase» desde el botón de la fase contesta `to_ep` (el núcleo pasa el turno solo)', () => {
    const fake = renderAuto()

    core(() => fake.ask(IDLE))
    fireEvent.click(phaseButton())
    fireEvent.click(screen.getByRole('menuitem', { name: 'End Phase' }))
    expect(fake.answers).toEqual([{ type: 'select_idlecmd', action: 7, index: null }])
    // Sin pregunta, el botón de la fase se apaga: no hay nada que contestar.
    expect(phaseButton()).toBeDisabled()
  })

  it('battle: «Atacar» en el monstruo del campo contesta y las fases ofrecen Main Phase 2 y End Phase', () => {
    const fake = renderAuto()

    core(() => fake.ask(BATTLE))
    fireEvent.click(phaseButton())
    expect(screen.getByRole('menuitem', { name: 'Main Phase 2' })).not.toHaveAttribute('aria-disabled')
    expect(screen.getByRole('menuitem', { name: /^Draw Phase/ })).toHaveAttribute('aria-disabled', 'true')
    fireEvent.keyDown(window, { key: 'Escape' })
    tap(screen.getByRole('button', { name: 'Maxx C' }))
    fireEvent.click(screen.getByRole('menuitem', { name: 'Atacar' }))
    expect(fake.answers).toEqual([{ type: 'select_battlecmd', action: 1, index: 0 }])
    expect(dispatches).toBe(0)
  })

  it('cadena: la carta que puede responder brilla, la línea ofrece «No responder» y contesta null', () => {
    const fake = renderAuto()

    core(() => fake.ask(CHAIN))
    expect(handCard('Called by the Grave')).toHaveAttribute('data-glow-kind', 'respond')
    expect(lane()).toHaveTextContent('Podés activar Called by the Grave ahora')
    fireEvent.click(within(lane()!).getByRole('button', { name: 'No responder' }))
    expect(fake.answers).toEqual([{ type: 'select_chain', index: null }])
  })

  it('cadena: tocar la carta que responde y «Activar» contesta con su índice', () => {
    const fake = renderAuto()

    core(() => fake.ask(CHAIN))
    tap(handCard('Called by the Grave'))
    fireEvent.click(screen.getByRole('menuitem', { name: 'Activar' }))
    expect(fake.answers).toEqual([{ type: 'select_chain', index: 0 }])
  })

  it('una carta sin jugada legal no abre nada, y el deck no se mira', () => {
    const fake = renderAuto()

    core(() => fake.ask(CHAIN))
    tap(handCard('Ash Blossom'))
    expect(screen.queryByRole('menuitem')).toBeNull()
    tap(screen.getByRole('button', { name: 'Main: 2' }))
    expect(screen.queryByRole('dialog')).toBeNull()
    expect(status()).toBeInTheDocument()
    expect(fake.answers).toEqual([])
    expect(dispatches).toBe(0)
  })
})
