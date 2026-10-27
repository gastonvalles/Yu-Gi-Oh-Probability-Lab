// @vitest-environment jsdom
import { act, fireEvent, screen, within } from '@testing-library/react'
import '@testing-library/jest-dom'
import { describe, expect, it, vi } from 'vitest'

import { LOCATION as L, type CoreAsk } from '../app/auto/protocol'
import { UNDO_CHIP_MS } from '../components/probability/UndoChip'
import { act as active, loc, pos, stringId } from './support/auto-session-fake'
import { core, handCard, renderAuto } from './support/auto-screen-harness'
import { Harness, render, tap } from './support/practice-mat-harness'

// El aviso de «Deshacer» de lo que acabás de activar (en «Jugar solo automático» y en la práctica) y «Cancelar» del segundo paso de «Activar efecto».

const IDLE: CoreAsk = {
  type: 'select_idlecmd',
  player: 0,
  summons: [loc(100, L.HAND, 0)],
  special_summons: [],
  pos_changes: [],
  monster_sets: [],
  spell_sets: [],
  activates: [active(900, L.HAND, 1), active(400, L.GRAVE, 0, stringId(400, 1)), active(400, L.GRAVE, 0, stringId(400, 2))],
  to_bp: false,
  to_ep: true,
  shuffle: false,
}
const CHAIN: CoreAsk = { type: 'select_chain', player: 0, spe_count: 1, forced: false, hint_timing: 0, hint_timing_other: 0, selects: [{ ...pos(900, L.HAND, 1, 10), description: '0', client_mode: 0 }] }
const chip = () => screen.queryByRole('button', { name: 'Deshacer la última jugada' })
const activateSpell = () => {
  tap(handCard('Called by the Grave'))
  fireEvent.click(screen.getByRole('menuitem', { name: 'Activar' }))
}

describe('el aviso de «Deshacer»', () => {
  it('automático: activar muestra el arte y «Deshacer» (sin el nombre); tocarlo deshace como la barra y el aviso se va', () => {
    const fake = renderAuto()

    core(() => fake.ask(IDLE))
    expect(chip()).toBeNull()
    activateSpell()
    expect(fake.answers).toEqual([{ type: 'select_idlecmd', action: 5, index: 0 }])
    // La próxima pregunta (el núcleo ya contestó): sigue el aviso.
    core(() => fake.ask(IDLE))
    expect(chip()).toHaveTextContent(/^Deshacer$/)
    expect(chip()!.querySelector('img')).toHaveAttribute('alt', '')
    expect(chip()).not.toHaveTextContent('Called by the Grave')
    // El de la barra sigue donde está.
    expect(screen.getByRole('button', { name: 'Deshacer' })).toBeInTheDocument()
    fireEvent.click(chip()!)
    expect(fake.undos).toBe(1)
    // Rearmando, el aviso no se ve; con la mesa rearmada (otra jugada deshecha), tampoco vuelve.
    expect(chip()).toBeNull()
    core(() => fake.rearm([], IDLE))
    expect(chip()).toBeNull()
  })

  it('automático: se va solo a los UNDO_CHIP_MS', () => {
    const fake = renderAuto()

    core(() => fake.ask(IDLE))
    activateSpell()
    core(() => fake.ask(IDLE))
    act(() => void vi.advanceTimersByTime(UNDO_CHIP_MS - 100))
    expect(chip()).toBeInTheDocument()
    act(() => void vi.advanceTimersByTime(200))
    expect(chip()).toBeNull()
  })

  it('automático: una jugada que no es una activación no lo muestra, y otra jugada saca el de la activación (Deshacer volvería a ésa)', () => {
    const fake = renderAuto()

    core(() => fake.ask(IDLE))
    tap(handCard('Ash Blossom'))
    fireEvent.click(screen.getByRole('menuitem', { name: 'Invocación Normal' }))
    core(() => fake.ask(IDLE))
    expect(chip()).toBeNull()
    activateSpell()
    core(() => fake.ask(IDLE))
    expect(chip()).toBeInTheDocument()
    tap(handCard('Ash Blossom'))
    fireEvent.click(screen.getByRole('menuitem', { name: 'Invocación Normal' }))
    core(() => fake.ask(IDLE))
    expect(chip()).toBeNull()
  })

  it('automático: responder en una cadena es una activación (con aviso); pasar no lo saca', () => {
    const fake = renderAuto()

    core(() => fake.ask(CHAIN))
    tap(handCard('Called by the Grave'))
    fireEvent.click(screen.getByRole('menuitem', { name: 'Activar' }))
    expect(fake.answers).toEqual([{ type: 'select_chain', index: 0 }])
    core(() => fake.ask(IDLE))
    expect(chip()).toBeInTheDocument()
    // Con el núcleo pensando, no.
    core(() => fake.thinking())
    expect(chip()).toBeNull()
  })

  it('el segundo paso de «Activar efecto» (cuál de los efectos) se cancela sin contestar nada', () => {
    const fake = renderAuto()

    core(() => fake.ask(IDLE))
    fireEvent.click(screen.getByRole('button', { name: 'GY: 1' }))
    fireEvent.click(screen.getByRole('button', { name: /^Nibiru/ }))
    fireEvent.click(screen.getByRole('menuitem', { name: /Activar efecto/ }))
    const sheet = screen.getByRole('dialog', { name: 'Activar efecto' })

    fireEvent.click(within(sheet).getByRole('button', { name: 'Cancelar' }))
    expect(screen.queryByRole('dialog', { name: 'Activar efecto' })).toBeNull()
    expect(fake.answers).toEqual([])
  })

  it('práctica: activar muestra el aviso; tocarlo deshace la activación y otra jugada lo saca', () => {
    render(<Harness />)
    const ash = () => within(screen.getByRole('list', { name: 'Mano' })).getByRole('listitem', { name: 'Ash Blossom' })

    expect(chip()).toBeNull()
    tap(ash())
    fireEvent.click(screen.getByRole('menuitem', { name: 'Activar efecto' }))
    expect(chip()).toHaveTextContent(/^Deshacer$/)
    fireEvent.click(chip()!)
    expect(chip()).toBeNull()
    expect(screen.getByRole('button', { name: 'Deshacer' })).toBeDisabled()
    // Otra vez, y una jugada después: el aviso se va (Deshacer deshace la última, no la activación).
    tap(ash())
    fireEvent.click(screen.getByRole('menuitem', { name: 'Activar efecto' }))
    expect(chip()).toBeInTheDocument()
    tap(within(screen.getByRole('list', { name: 'Mano' })).getByRole('listitem', { name: 'Maxx C' }))
    fireEvent.click(screen.getByRole('menuitem', { name: 'Invocación Normal' }))
    // Todavía elige dónde: no hay otra jugada.
    expect(chip()).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Zona de monstruo 1: elegir' }))
    expect(within(screen.getByRole('group', { name: 'Zona de monstruo 1' })).getByRole('button', { name: 'Maxx C' })).toBeInTheDocument()
    expect(chip()).toBeNull()
  })
})
