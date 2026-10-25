// @vitest-environment jsdom
import { act, fireEvent, screen, within } from '@testing-library/react'
import '@testing-library/jest-dom'
import { describe, expect, it, vi } from 'vitest'

import { LOCATION as L, type CoreAsk } from '../app/auto/protocol'
import type { MatAction, MatPhase } from '../app/practice-mat'
import { STEP_MS } from '../components/auto/AutoSoloScreen'
import { fakeSession, loc, SPOTS, type FakeSession } from './support/auto-session-fake'
import { core, dispatches, handCard, inHand, phaseButton, renderAuto } from './support/auto-screen-harness'

// «Jugar solo automático» con el panel de la práctica: los pasos (la cinta del núcleo, con la mano de apertura como paso 0) y los combos. La mesa nunca despacha: lo que se
// anota es lo que contó el núcleo.

const IDLE: CoreAsk = { type: 'select_idlecmd', player: 0, summons: [loc(100, L.HAND, 0)], special_summons: [], pos_changes: [], monster_sets: [], spell_sets: [], activates: [], to_bp: false, to_ep: true, shuffle: false }
const to = (phase: MatPhase): MatAction => ({ type: 'phase', phase })
/** El arranque como lo cuenta el núcleo: la mano vacía y, de una tanda, el robo de la mano, la SP y la M1 (el turno 1 no roba). */
const OPENING: MatAction = { type: 'draw', count: 2, ids: ['card-100-1', 'card-900-1'] }
const START = [OPENING, to('standby'), to('main1')]
const SUMMON: MatAction = { type: 'place', id: 'card-100-1', zone: 'mz', index: 1, pos: 'atk', how: 'normal' }

/** La sesión con la mesa del arranque del núcleo: la mano en el deck (las de la mano, arriba de todo) y el turno 1 en la Draw Phase. */
function openingSession(): FakeSession {
  const fake = fakeSession(SPOTS.map((spot) => (spot.side === 'mine' && spot.location === L.HAND ? { ...spot, location: L.DECK, sequence: 10 + spot.sequence } : spot)))
  const { initial } = fake.getSnapshot()

  fake.set({ initial: { mine: { ...initial.mine, phase: 'draw' }, theirs: initial.theirs } })
  return fake
}
/** La mesa rearmada (el duelo recién armado): las jugadas y, después, la pregunta. */
function rearm(fake: FakeSession, actions: MatAction[], ask: CoreAsk | null) {
  core(() => fake.set({ initial: { ...fake.getSnapshot().initial }, mineActions: actions, status: 'ready', replaying: false }))
  if (ask) core(() => fake.ask(ask))
}
const goTo = (name: string) => {
  fireEvent.click(phaseButton())
  fireEvent.click(screen.getByRole('menuitem', { name }))
}
const step = () => act(() => vi.advanceTimersByTime(STEP_MS + 5))
const panel = () => screen.getByRole('region', { name: 'Pasos y combos' })
/** La lista de pasos (la última jugada arriba y la mano inicial al final), como la lee quien mira: el número y la frase. */
const steps = () => within(within(panel()).getByRole('list', { name: 'Jugadas' })).getAllByRole('button').map((button) => button.textContent)

describe('auto-screen · los pasos de la práctica', () => {
  it('la mano de apertura es el paso 0 («Mano inicial») y la lista crece con lo que la mesa cuenta, no antes: las fases que pedís y lo que juega el núcleo', () => {
    const fake = renderAuto(openingSession())

    rearm(fake, START, IDLE)
    // La mesa frena en la Draw Phase con la mano ya repartida; el núcleo ya contó la SP y la M1, pero la lista no se adelanta.
    expect(handCard('Ash Blossom')).toBeInTheDocument()
    expect(handCard('Called by the Grave')).toBeInTheDocument()
    expect(within(panel()).getByText('Todavía no hay jugadas')).toBeInTheDocument()
    // Acá no se arrastra ni se mantiene: la lista vacía dice cómo se juega en esta mesa.
    expect(within(panel()).getByText('Tocá una carta o el botón de fases para ver qué podés hacer. Cada jugada queda anotada acá.')).toBeInTheDocument()
    expect(within(panel()).getByRole('radio', { name: /Pasos/ })).toBeChecked()

    goTo('Standby Phase')
    expect(steps()).toEqual(['1Pasás a la Standby Phase', '0Mano inicial'])
    goTo('Main Phase 1')
    step()
    expect(steps()).toEqual(['2Pasás a la Main Phase 1', '1Pasás a la Standby Phase', '0Mano inicial'])

    // Lo que el núcleo cuenta llega a la lista al ritmo de la mesa (un paso por vez).
    core(() => fake.events([SUMMON, to('battle')]))
    expect(steps()).toHaveLength(3)
    step()
    expect(steps()[0]).toBe('3Invocación Normal de Ash Blossom')
    expect(inHand('Ash Blossom')).toBeNull()
    step()
    expect(steps()).toHaveLength(5)
    expect(dispatches).toBe(0)
  })

  it('en el celular la lista se abre con su botón abajo a la derecha (arriba van los íconos de la práctica y el engranaje), en una hoja con «Pasos» y «Combos»', () => {
    const fake = renderAuto(openingSession())

    rearm(fake, START, IDLE)
    goTo('Main Phase 1')
    step()
    // No va en la barra de arriba (la de los íconos de la mesa).
    expect(within(screen.getByRole('toolbar', { name: 'Mesa' })).queryByRole('button', { name: 'Pasos y combos' })).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: 'Pasos y combos' }))
    const sheet = screen.getByRole('dialog', { name: 'Pasos y combos' })

    expect(within(sheet).getAllByRole('radio').map((radio) => radio.textContent)).toEqual(['Pasos2', 'Combos0'])
    expect(within(within(sheet).getByRole('list', { name: 'Jugadas' })).getAllByRole('button').map((button) => button.textContent)).toEqual(['2Pasás a la Main Phase 1', '1Pasás a la Standby Phase', '0Mano inicial'])
    expect(dispatches).toBe(0)
  })
})
