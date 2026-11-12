// @vitest-environment jsdom
import { fireEvent, render as renderBare, screen, within } from '@testing-library/react'
import '@testing-library/jest-dom'
import { beforeEach, describe, expect, it, onTestFinished, vi } from 'vitest'

import { LOCATION as L, type CoreAsk } from '../app/auto/protocol'
import { PHASES } from '../app/practice-mat'
import { COMPACT_FIELD_MEDIA_QUERY } from '../components/probability/compact-field'
import { PhaseTrack, TurnAction, turnActionOf } from '../components/probability/PhaseTrack'
import { loc } from './support/auto-session-fake'
import { core, renderAuto } from './support/auto-screen-harness'

/**
 * El turno en el pulgar (Gastón, «Las 7», mejora 4), sólo en el duelo automático del celular: la línea muestra la pista de fases cuando no hay cadena ni aviso, abajo va un botón de un toque
 * («Ir a Batalla» o «Terminar turno»), la chapa del que juega se enciende con su aro y la ficha «M1» sale del campo.
 */

const idle = (toBattle: boolean): CoreAsk => ({
  type: 'select_idlecmd',
  player: 0,
  summons: [loc(100, L.HAND, 0)],
  special_summons: [],
  pos_changes: [],
  monster_sets: [],
  spell_sets: [],
  activates: [],
  to_bp: toBattle,
  to_ep: true,
  shuffle: false,
})

beforeEach(() => {
  window.matchMedia = ((query: string) => ({ matches: query === COMPACT_FIELD_MEDIA_QUERY || query.includes('reduce'), media: query, addEventListener: () => {}, removeEventListener: () => {}, addListener: () => {}, removeListener: () => {}, onchange: null, dispatchEvent: () => false })) as typeof window.matchMedia
  const size = { width: window.innerWidth, height: window.innerHeight }
  Object.assign(window, { innerWidth: 390, innerHeight: 844 })
  onTestFinished(() => void Object.assign(window, { innerWidth: size.width, innerHeight: size.height }))
})

describe('auto · el turno en el pulgar (celular)', () => {
  it('en reposo la línea lleva la pista de fases (la única «Fases:», fuera del campo) y abajo «Ir a Batalla» va a la Battle Phase de un toque', () => {
    const fake = renderAuto()

    core(() => fake.ask(idle(true)))
    const line = document.querySelector<HTMLElement>('[data-duel-line]')!
    const track = within(line).getByRole('button', { name: 'Fases: Main Phase 1' })

    expect(screen.getAllByRole('button', { name: /^Fases:/ })).toEqual([track])
    expect(within(screen.getByLabelText('Campo')).queryByRole('button', { name: /^Fases:/ })).toBeNull()
    expect(track.querySelector('[data-now]')).toHaveTextContent('M1')

    const action = screen.getByRole('button', { name: 'Ir a Batalla' })

    expect(document.querySelector('[data-mat-seat]')).toContainElement(action)
    expect(action).toHaveClass('min-h-11', 'bg-primary')
    fireEvent.click(action)
    expect(fake.answers.at(-1)).toMatchObject({ type: 'select_idlecmd', action: 6 })
  })

  it('sin Battle Phase (el primer turno) dice «Terminar turno», con borde rojo, y termina el turno', () => {
    const fake = renderAuto()

    core(() => fake.ask(idle(false)))
    const action = screen.getByRole('button', { name: 'Terminar turno' })

    expect(action).toHaveClass('border-2', 'border-danger-soft')
    fireEvent.click(action)
    expect(fake.answers.at(-1)).toMatchObject({ type: 'select_idlecmd', action: 7 })
  })

  it('el botón no se recorta nunca: mide al menos lo de su texto y lo que falta lo cede tu chapa, que recorta su turno («Turno de Rival · 12»)', () => {
    const fake = renderAuto()

    core(() => fake.ask(idle(false)))
    const seat = document.querySelector<HTMLElement>('[data-mat-seat]')!
    const badge = seat.querySelector<HTMLElement>('[data-life-badge]')!
    const turn = [...badge.querySelectorAll('.truncate')].at(-1)!

    // jsdom no mide: se fija el contrato (el navegador real lo mide el caso diario a 360, 390 y 430).
    expect(screen.getByRole('button', { name: 'Terminar turno' })).toHaveClass('min-w-max', 'flex-1', 'px-2!')
    expect(badge.parentElement).toBe(seat)
    expect(seat).toHaveClass('[&>[data-life-badge]]:min-w-0', '[&>[data-life-badge]]:shrink')
    expect(turn.parentElement).toHaveClass('min-w-0', 'max-w-full')
    expect(turn).toHaveClass('min-w-0', 'truncate')
  })

  it('la chapa del que juega lleva su aro y la del otro se apaga', () => {
    const fake = renderAuto()

    core(() => fake.ask(idle(true)))
    const [mine, theirs] = ['mine', 'theirs'].map((side) => document.querySelector<HTMLElement>(`[data-life-badge][data-lp="${side}"]`)!)

    expect(mine).toHaveAttribute('data-active', 'true')
    expect(mine).toHaveClass('ring-2', 'ring-primary')
    expect(theirs).toHaveAttribute('data-active', 'false')
    expect(theirs).toHaveClass('border-border-subtle')
  })
})

describe('las piezas', () => {
  const items = (offered: string[], current: string) => PHASES.map((phase) => ({ label: phase.name, onSelect: vi.fn(), ...(phase.id === current ? { current: true } : offered.includes(phase.id) ? {} : { disabled: true }) }))

  it('«Ir a Batalla» sólo si el núcleo ofrece la Battle Phase; si no, «Terminar turno» con lo que dé el núcleo', () => {
    const end = () => {}

    expect(turnActionOf(items(['battle', 'end'], 'main1'), end).kind).toBe('battle')
    expect(turnActionOf(items(['main2', 'end'], 'battle'), end)).toEqual({ kind: 'end', onSelect: end })
    expect(turnActionOf(items(['end'], 'main1'), null)).toEqual({ kind: 'end', onSelect: null })
  })

  it('en el turno del rival (o con una cadena) el lugar queda, apagado; mientras el núcleo piensa no cambia de forma', () => {
    const view = renderBare(<TurnAction items={items(['battle', 'end'], 'main1')} endTurn={() => {}} live />)

    expect(screen.getByRole('button', { name: 'Ir a Batalla' })).toBeEnabled()
    view.rerender(<TurnAction items={[]} endTurn={null} live />)
    expect(screen.getByRole('button', { name: 'Ir a Batalla' })).toBeDisabled()
    view.rerender(<TurnAction items={items(['main2', 'end'], 'battle')} endTurn={() => {}} live={false} />)
    expect(screen.getByRole('button', { name: 'Ir a Batalla' })).toBeDisabled()
  })

  it('la pista marca la de ahora, a las que podés ir y las pasadas, y abre las fases', () => {
    const open = vi.fn()

    renderBare(<PhaseTrack phase="battle" items={items(['main2', 'end'], 'battle')} disabled={false} onOpen={open} />)
    const track = screen.getByRole('button', { name: 'Fases: Battle Phase' })
    const tile = (short: string) => within(track).getByText(short)

    expect(tile('BP')).toHaveClass('bg-info')
    expect(tile('M2')).toHaveClass('border-foreground')
    expect(tile('M1')).toHaveClass('border-dashed')
    fireEvent.click(track)
    expect(open).toHaveBeenCalledTimes(1)
  })
})
