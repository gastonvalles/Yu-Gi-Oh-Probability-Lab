// @vitest-environment jsdom
import { fireEvent, screen, within } from '@testing-library/react'
import '@testing-library/jest-dom'
import { describe, expect, it } from 'vitest'

import { fakeSession } from './support/auto-session-fake'
import { core, dispatches, renderAuto } from './support/auto-screen-harness'

// La mano del rival, de dorso salvo lo que es de conocimiento público (`Adapter.publicInHand`): se ve boca arriba con un aro que late, se abre al tocarla y se pierde al barajar su mano.

const HAND = ['c2', 'c3', 'c4']

describe('auto-screen · la mano del rival', () => {
  it('lo público va boca arriba con su aro y se abre al tocarlo; lo oculto no se ve ni se filtra; al barajar vuelve de dorso', () => {
    const fake = fakeSession()

    renderAuto(fake)
    const setHand = () => core(() => fake.set({ theirs: { ...fake.getSnapshot().theirs, hand: HAND } }))
    const hand = () => screen.getByLabelText(/^Mano del rival:/)

    setHand()
    expect(hand()).toHaveAccessibleName('Mano del rival: 3')
    expect(hand().querySelector('[data-public]')).toBeNull()

    // Se mostró la del lugar 1 (c2 = Ash Blossom): boca arriba y con aro; las otras dos siguen de dorso, sin nombre en ningún lado.
    fake.publicHand.set('c2', 100)
    core(() => fake.set({}))
    expect(hand()).toHaveAccessibleName('Mano del rival: 3, a la vista: Ash Blossom')
    expect(hand().querySelectorAll('[data-public]')).toHaveLength(1)
    expect(within(hand()).getAllByRole('button').map((button) => button.getAttribute('aria-label'))).toEqual(['Ash Blossom'])
    expect([...hand().querySelectorAll('[title]')].map((item) => item.getAttribute('title'))).toEqual(['Ash Blossom'])
    expect(hand().textContent).not.toContain('Nibiru')

    // Tocarla abre su detalle.
    fireEvent.click(within(hand()).getByRole('button', { name: 'Ash Blossom' }))
    expect(screen.getByRole('dialog', { name: /^Detalle de / })).toBeInTheDocument()
    fireEvent.keyDown(document, { key: 'Escape' })

    // Barajó su mano: ya no es público.
    fake.publicHand.clear()
    core(() => fake.set({}))
    expect(hand()).toHaveAccessibleName('Mano del rival: 3')
    expect(hand().querySelector('[data-public]')).toBeNull()
    expect(within(hand()).queryAllByRole('button')).toHaveLength(0)
    expect(dispatches).toBe(0)
  })
})
