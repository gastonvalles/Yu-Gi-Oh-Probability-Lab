// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react'
import '@testing-library/jest-dom'
import { afterEach, describe, expect, it } from 'vitest'

import { TURN_WARNING_MS, freshTurnClock, type TurnClock } from '../app/duel-clock'
import { TurnDial } from '../components/duel/TurnDial'

afterEach(cleanup)

const clock = (left: number): TurnClock => ({ ...freshTurnClock(7 * 60_000), banks: [left, left] })

const ring = () => document.querySelector('svg circle:nth-of-type(2)') as SVGElement | null

describe('el círculo del reloj de turnos', () => {
  it('es ámbar siempre: en tu turno, en el del rival y con poco tiempo', () => {
    for (const [me, left] of [[0, 5 * 60_000], [1, 5 * 60_000], [0, TURN_WARNING_MS - 1000], [undefined, 5 * 60_000]] as const) {
      const view = render(<TurnDial clock={clock(left)} owner={0} me={me} names={['Ana', 'Beto']} />)

      expect(ring()).toHaveClass('stroke-info')
      expect(ring()).not.toHaveClass('stroke-danger', 'stroke-accent')
      view.unmount()
    }
  })

  it('con poco tiempo el número se pone rojo y parpadea, pero el círculo sigue ámbar', () => {
    render(<TurnDial clock={clock(TURN_WARNING_MS - 1000)} owner={0} me={0} names={['Ana', 'Beto']} />)

    expect(screen.getByTestId('turn-dial-time')).toHaveClass('text-danger-soft')
    expect(ring()).toHaveClass('stroke-info')
  })
})
