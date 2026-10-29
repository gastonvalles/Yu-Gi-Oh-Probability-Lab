// @vitest-environment jsdom
import { fireEvent, screen, within } from '@testing-library/react'
import '@testing-library/jest-dom'
import { describe, expect, it, vi } from 'vitest'

import { autoPrefs, setAutoPref } from '../app/auto-prefs'
import type { MatAction } from '../app/practice-mat'
import { IDLE } from './support/auto-core-fake'
import { core, dispatches, renderAuto } from './support/auto-screen-harness'
import { tapMenu } from './support/mat-menu'

// Cuatro jugadas mías sobre la mesa falsa (en la mano, Ash Blossom y Called by the Grave; arriba del deck, Droll), con la pregunta de la quinta esperando.
const PLAYS: MatAction[][] = [[{ type: 'move', id: 'card-900-1', to: 'gy' }], [{ type: 'move', id: 'card-100-1', to: 'banished' }], [{ type: 'draw', count: 1, ids: ['card-101-1'] }], [{ type: 'move', id: 'card-101-1', to: 'gy' }]]

const dialog = () => screen.getByRole('dialog', { name: 'Seguir en modo manual' })

describe('auto-screen · seguir en modo manual', () => {
  it('«Más opciones → Seguir en modo manual» abre el diálogo: «Volver atrás» ofrece «Nada» y cada jugada con lo que deshace; 3 pasa la partida de 3 jugadas atrás, sin tocar el interruptor', () => {
    setAutoPref('duel', true)
    const onManual = vi.fn()
    const fake = renderAuto(undefined, undefined, onManual)

    core(() => fake.set({ mineActions: PLAYS.flat(), playStarts: [0, 1, 2, 3, 4] }))
    core(() => fake.ask(IDLE))
    tapMenu('Opciones del duelo')
    expect(screen.getByText(/La partida sigue en la mesa manual/)).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Seguir en modo manual' }))

    const back = within(dialog()).getByRole('radiogroup', { name: 'Volver atrás' })

    expect(within(back).getAllByRole('radio')).toHaveLength(5)
    expect(within(back).getByRole('radio', { name: 'Nada: seguir desde acá' })).toHaveAttribute('aria-checked', 'true')
    // La 3 deshace desde la segunda jugada: destierra a Ash Blossom.
    const three = within(back).getByRole('radio', { name: /^3 jugadas: .*Ash Blossom/ })

    fireEvent.click(three)
    expect(three).toHaveAttribute('aria-checked', 'true')
    expect(dialog()).toHaveTextContent('El rival no pasa')
    fireEvent.click(within(dialog()).getByRole('button', { name: 'Seguir en manual' }))

    expect(onManual).toHaveBeenCalledTimes(1)
    expect(onManual.mock.calls[0]![0]).toMatchObject({ initial: fake.getSnapshot().initial.mine, actions: PLAYS[0] })
    expect(autoPrefs().duel).toBe(true)
    // No es reiniciar, ni deshacer en el núcleo, ni una jugada: sólo cambia de mesa.
    expect(fake.restarts).toBe(0)
    expect(fake.undos).toBe(0)
    expect(dispatches).toBe(0)
  })

  it('«Cancelar» cierra sin pasar; al volver a abrir, «Nada» otra vez', () => {
    const onManual = vi.fn()
    const fake = renderAuto(undefined, undefined, onManual)

    core(() => fake.set({ mineActions: PLAYS.flat(), playStarts: [0, 1, 2, 3, 4] }))
    core(() => fake.ask(IDLE))
    tapMenu('Opciones del duelo')
    fireEvent.click(screen.getByRole('button', { name: 'Seguir en modo manual' }))
    fireEvent.click(within(dialog()).getByRole('radio', { name: /^2 jugadas/ }))
    fireEvent.click(within(dialog()).getByRole('button', { name: 'Cancelar' }))
    expect(onManual).not.toHaveBeenCalled()
    tapMenu('Opciones del duelo')
    fireEvent.click(screen.getByRole('button', { name: 'Seguir en modo manual' }))
    expect(within(dialog()).getByRole('radio', { name: 'Nada: seguir desde acá' })).toHaveAttribute('aria-checked', 'true')
  })

  it('el núcleo se cayó: la portada ofrece seguir en manual desde la última jugada buena', () => {
    const onManual = vi.fn()
    const fake = renderAuto(undefined, undefined, onManual)

    core(() => fake.set({ mineActions: PLAYS.flat(), playStarts: [0, 1, 2, 3] }))
    core(() => fake.fault({ kind: 'crash', message: 'worker error', cards: [] }))
    fireEvent.click(within(screen.getByRole('alertdialog', { name: 'El núcleo se cayó' })).getByRole('button', { name: 'Seguir en modo manual' }))
    // Sin pregunta pendiente, la última (que ya robó) también se puede deshacer.
    expect(within(dialog()).getAllByRole('radio')).toHaveLength(5)
    fireEvent.click(within(dialog()).getByRole('button', { name: 'Seguir en manual' }))
    expect(onManual.mock.calls[0]![0]).toMatchObject({ actions: PLAYS.flat() })
  })

  it('re-simulando, no se pasa hasta que la mesa termina de rearmarse', () => {
    const fake = renderAuto()

    core(() => fake.set({ mineActions: PLAYS.flat(), playStarts: [0, 1, 2, 3, 4], replaying: true }))
    tapMenu('Opciones del duelo')
    fireEvent.click(screen.getByRole('button', { name: 'Seguir en modo manual' }))
    expect(within(dialog()).getByRole('button', { name: 'Seguir en manual' })).toBeDisabled()
    expect(dialog()).toHaveTextContent('Rearmando la mesa…')
    core(() => fake.ask(IDLE))
    expect(within(dialog()).getByRole('button', { name: 'Seguir en manual' })).toBeEnabled()
  })

  it('sin mesa todavía (el núcleo no arrancó), «Seguir en modo manual» pasa directo, con una mano nueva', () => {
    const onManual = vi.fn()
    const fake = renderAuto(undefined, undefined, onManual)

    core(() => fake.fault({ kind: 'setup', message: 'createDuel returned null', cards: [] }))
    fireEvent.click(within(screen.getByRole('alertdialog')).getByRole('button', { name: 'Seguir en modo manual' }))
    expect(onManual).toHaveBeenCalledWith(null)
    expect(screen.queryByRole('dialog', { name: 'Seguir en modo manual' })).toBeNull()
  })
})
