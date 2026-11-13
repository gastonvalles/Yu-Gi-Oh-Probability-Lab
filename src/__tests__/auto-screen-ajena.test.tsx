// @vitest-environment jsdom
import { screen } from '@testing-library/react'
import '@testing-library/jest-dom'
import { describe, expect, it } from 'vitest'

import { LOCATION as L } from '../app/auto/protocol'
import { fakeSession, SPOTS } from './support/auto-session-fake'
import { core, dispatches, renderAuto } from './support/auto-screen-harness'

// Una carta del rival que controlo (`f.c9`, en mi campo y ya fuera del suyo): la mesa la dibuja con su nombre, no como «un monstruo del rival».
describe('auto-screen · una carta del rival en mi campo', () => {
  it('se ve con su nombre (el código lo sabe el núcleo), no como un monstruo cualquiera del rival', () => {
    const fake = fakeSession([...SPOTS, { side: 'mine', id: 'f.c9', code: 701, location: L.MZONE, sequence: 1, pos: 'atk' }])

    renderAuto(fake)
    core(() => fake.set({ names: { ...fake.getSnapshot().names, 701: 'Gameciel, the Sea Turtle Kaiju' } }))
    expect(screen.getByRole('button', { name: 'Gameciel, the Sea Turtle Kaiju' })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /un monstruo del rival/ })).toBeNull()
    expect(dispatches).toBe(0)
  })
})
