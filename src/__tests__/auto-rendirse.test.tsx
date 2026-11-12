// @vitest-environment jsdom
import { fireEvent, screen, within } from '@testing-library/react'
import '@testing-library/jest-dom'
import { describe, expect, it } from 'vitest'

import { core, dispatches, hand, renderAuto } from './support/auto-screen-harness'
import { openOptions } from './support/mat-menu'

// «Rendirse» de Opciones (decisión 11), en «Jugar solo automático»: va al final, pide confirmar y termina el duelo como derrota, con su pantalla final.

describe('auto-screen · rendirse', () => {
  it('es lo último de Opciones y pide confirmar: «Seguir jugando» no hace nada', () => {
    renderAuto()
    const options = openOptions()

    expect(within(options).getAllByRole('button').at(-1)).toHaveAccessibleName('Rendirse')
    fireEvent.click(within(options).getByRole('button', { name: 'Rendirse' }))
    const confirm = screen.getByRole('alertdialog', { name: '¿Rendirte en este duelo?' })

    expect(confirm).toHaveTextContent('Perdés el duelo y ves la pantalla final.')
    fireEvent.click(within(confirm).getByRole('button', { name: 'Seguir jugando' }))
    expect(screen.queryByRole('alertdialog')).toBeNull()
    expect(hand()).toBeInTheDocument()
  })

  it('confirmado, la pantalla final es una derrota («Te rendiste.») con «Jugar otra vez», que la borra y vuelve a la mesa', () => {
    const fake = renderAuto()

    fireEvent.click(within(openOptions()).getByRole('button', { name: 'Rendirse' }))
    fireEvent.click(within(screen.getByRole('alertdialog', { name: '¿Rendirte en este duelo?' })).getByRole('button', { name: 'Rendirse' }))
    const cover = screen.getByRole('alertdialog', { name: 'Perdiste' })

    expect(cover).toHaveTextContent('Te rendiste.')
    // Sin marcador: «8000 a 8000» se lee como un empate.
    expect(cover.querySelector('[data-score]')).toBeNull()
    expect(dispatches).toBe(0)
    core(() => fake.set({ status: 'ready' }))
    fireEvent.click(within(cover).getByRole('button', { name: 'Jugar otra vez' }))
    expect(fake.restarts).toBe(1)
    expect(screen.queryByRole('alertdialog', { name: 'Perdiste' })).toBeNull()
  })

  it('con el duelo terminado, Rendirse ya no se ofrece', () => {
    const fake = renderAuto()

    core(() => fake.end(0, 1))
    expect(screen.getByRole('alertdialog', { name: '¡Ganaste!' })).toBeInTheDocument()
    expect(within(openOptions()).queryByRole('button', { name: 'Rendirse' })).toBeNull()
  })
})
