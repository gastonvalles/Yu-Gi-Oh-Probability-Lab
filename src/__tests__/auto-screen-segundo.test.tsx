// @vitest-environment jsdom
import { fireEvent, screen } from '@testing-library/react'
import '@testing-library/jest-dom'
import { describe, expect, it, vi } from 'vitest'

import { seatOf, setAutoPref } from '../app/auto-prefs'
import { AutoSoloScreen } from '../components/auto/AutoSoloScreen'
import { CARDS, fakeSession, type FakeSession } from './support/auto-session-fake'
import { core } from './support/auto-screen-harness'
import { tapMenu } from './support/mat-menu'
import { render } from './support/practice-mat-harness'

// Quién empieza en jugar solo automático (la hoja de reglas de Jugar): ir segundo es ocupar el asiento 1 del núcleo. Lo del núcleo (el rival pasivo pasa su turno 1 y vos robás
// en el 2) lo cubre `auto-segundo.slow.test.ts`; acá, lo de la pantalla: el asiento que se pide, las vidas y el final desde ese asiento y «Nueva mano» con «Al azar».

type Connect = NonNullable<Parameters<typeof AutoSoloScreen>[0]['connect']>

function mount() {
  const fakes: FakeSession[] = []
  const connect = vi.fn<Connect>(() => {
    const fake = fakeSession()

    fakes.push(fake)
    return fake
  })

  render(<AutoSoloScreen mainIds={[...CARDS.keys()].filter((id) => id !== 'card-500-1')} extraIds={['card-500-1']} cardsById={CARDS} deckName="Test" onExit={() => {}} connect={connect} />)

  return { connect, last: () => fakes.at(-1)! }
}

describe('auto-screen · quién empieza', () => {
  it('«Al azar» sale de la semilla: la misma semilla, el mismo asiento, y salen los dos', () => {
    const seats = Array.from({ length: 64 }, (_, seed) => seatOf('random', seed * 7919))

    expect(seats).toContain(0)
    expect(seats).toContain(1)
    expect(seatOf('random', 12345)).toBe(seatOf('random', 12345))
    expect([seatOf('me', 3), seatOf('rival', 3)]).toEqual([0, 1])
  })

  it('«Empiezo yo» (lo de siempre): el asiento 0, y «Nueva mano» reparte en la misma sesión', () => {
    const { connect, last } = mount()

    expect(connect.mock.calls.at(-1)![1]).toMatchObject({ seat: 0 })
    const calls = connect.mock.calls.length

    tapMenu('Nueva mano')
    expect(last().restarts).toBe(1)
    expect(connect.mock.calls.length).toBe(calls)
  })

  it('«Empieza el rival»: vas en el asiento 1; tus vidas y el final se leen desde ahí', () => {
    setAutoPref('first', 'rival')
    const { connect, last } = mount()

    expect(connect.mock.calls.at(-1)![1]).toMatchObject({ seat: 1 })
    const fake = last()

    core(() => fake.set({ overlay: { ...fake.getSnapshot().overlay, lp: [0, 6500] } }))
    core(() => fake.end(1, 1))
    const cover = screen.getByRole('alertdialog', { name: '¡Ganaste!' })

    expect(cover).toHaveTextContent('Vos 6500 · Rival 0')
    expect(cover).not.toHaveTextContent('Te quedaste sin puntos de vida.')
    setAutoPref('first', 'me')
  })

  it('«Al azar»: el asiento es el de la semilla; «Nueva mano» arma otra sesión con otra semilla (puede cambiar quién empieza) y reiniciar repite la misma', () => {
    setAutoPref('first', 'random')
    const { connect, last } = mount()
    const opened = connect.mock.calls.at(-1)![1]

    expect(opened.seat).toBe(seatOf('random', opened.seed!))
    const calls = connect.mock.calls.length

    tapMenu('Nueva mano')
    const dealt = connect.mock.calls.at(-1)![1]

    expect(connect.mock.calls.length).toBe(calls + 1)
    expect(dealt.seed).not.toBe(opened.seed)
    expect(dealt.seat).toBe(seatOf('random', dealt.seed!))
    expect(last().restarts).toBe(0)
    // Reiniciar es el mismo duelo: la misma sesión (la misma semilla, el mismo asiento).
    tapMenu('Opciones del duelo')
    fireEvent.click(screen.getByRole('button', { name: 'Reiniciar el mismo duelo' }))
    expect(last().restarts).toBe(1)
    expect(connect.mock.calls.length).toBe(calls + 1)
    setAutoPref('first', 'me')
  })
})
