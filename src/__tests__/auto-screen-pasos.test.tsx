// @vitest-environment jsdom
import { act, cleanup, fireEvent, screen, within } from '@testing-library/react'
import '@testing-library/jest-dom'
import { describe, expect, it, vi } from 'vitest'

import { LOCATION as L, type CoreAsk } from '../app/auto/protocol'
import { createMatState, replayMat, type MatAction, type MatPhase } from '../app/practice-mat'
import { createSavedCombo, readSavedCombos, writeSavedCombos, type SavedCombo } from '../app/saved-combos'
import { STEP_MS } from '../components/auto/AutoSoloScreen'
import { CARDS, fakeSession, loc, SPOTS, type FakeSession } from './support/auto-session-fake'
import { core, dispatches, handCard, inHand, phaseButton, renderAuto } from './support/auto-screen-harness'
import { Harness, render, zone } from './support/practice-mat-harness'

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

/** Lo guardado, tal cual: la misma clave y la misma lista que la práctica manual. */
const stored = () => JSON.parse(localStorage.getItem('ygo-lab:practice-combos') ?? '[]') as SavedCombo[]
const saveButton = () => within(screen.getByRole('toolbar', { name: 'Mesa' })).getByRole('button', { name: 'Guardar combo' })
/** Un duelo con la Main Phase 1 y una Invocación Normal ya contadas. */
function played(): FakeSession {
  const fake = renderAuto(openingSession())

  rearm(fake, START, IDLE)
  goTo('Main Phase 1')
  step()
  core(() => fake.events([SUMMON]))
  step()
  return fake
}

describe('auto-screen · guardar combos', () => {
  it('«Guardar combo» va arriba con los íconos de la práctica, apagado sin jugadas: guarda lo que se ve, con la mano inicial y «Combo 1», sin despachar ni contestarle nada al núcleo', () => {
    const fake = renderAuto(openingSession())

    rearm(fake, START, IDLE)
    expect(saveButton()).toBeDisabled()
    goTo('Main Phase 1')
    step()
    core(() => fake.events([SUMMON]))
    step()
    expect(saveButton()).toBeEnabled()
    fireEvent.click(saveButton())
    const dialog = screen.getByRole('dialog', { name: 'Guardar combo' })

    expect(within(dialog).getByRole('textbox', { name: 'Nombre' })).toHaveValue('Combo 1')
    fireEvent.click(within(dialog).getByRole('button', { name: 'Guardar' }))

    const [combo] = stored()
    const { initial, mineActions } = fake.getSnapshot()

    expect(combo).toMatchObject({ name: 'Combo 1', deckName: 'Test', auto: true })
    // La mano de apertura en la mesa del arranque; las jugadas, desde la primera fase. Reproducido, es la mesa del núcleo.
    expect(combo!.initial.hand).toEqual(['card-100-1', 'card-900-1'])
    expect(combo!.actions).toEqual([to('standby'), to('main1'), SUMMON])
    expect(replayMat(combo!.initial, combo!.actions)).toEqual(replayMat(initial.mine, mineActions))
    expect(combo!.names['card-100-1']).toBe('Ash Blossom')
    expect(readSavedCombos()).toHaveLength(1)
    expect(fake.answers).toEqual([])
    expect(dispatches).toBe(0)
  })

  it('la pestaña «Combos» es la de la práctica: lista lo guardado en las dos mesas, se renombra y se borra', () => {
    const manual = createSavedCombo({ name: 'De la manual', deckName: 'Test', initial: createMatState(['card-100-1', 'card-900-1', 'card-101-1'], [], 2), actions: [{ type: 'activate', id: 'card-900-1' }], nameOf: (id) => CARDS.get(id)?.name ?? id }, [])

    writeSavedCombos([manual])
    played()
    fireEvent.click(saveButton())
    fireEvent.click(within(screen.getByRole('dialog', { name: 'Guardar combo' })).getByRole('button', { name: 'Guardar' }))
    fireEvent.click(within(panel()).getByRole('radio', { name: /Combos/ }))
    expect(within(panel()).getByText('De la manual')).toBeInTheDocument()
    expect(within(panel()).getByText('Combo 2')).toBeInTheDocument()

    fireEvent.click(within(panel()).getByRole('button', { name: 'Renombrar Combo 2' }))
    const rename = screen.getByRole('dialog', { name: 'Renombrar combo' })

    fireEvent.change(within(rename).getByRole('textbox', { name: 'Nombre' }), { target: { value: 'Ash al campo' } })
    fireEvent.click(within(rename).getByRole('button', { name: 'Guardar' }))
    expect(stored().map((combo) => combo.name)).toEqual(['De la manual', 'Ash al campo'])

    fireEvent.click(within(panel()).getByRole('button', { name: 'Borrar Ash al campo' }))
    fireEvent.click(within(screen.getByRole('alertdialog', { name: '¿Borrar “Ash al campo”?' })).getByRole('button', { name: 'Borrar' }))
    expect(stored().map((combo) => combo.name)).toEqual(['De la manual'])
    expect(dispatches).toBe(0)
  })

  it('un combo grabado en la automática se abre en la práctica manual: la misma lista, y su replay llega a la misma mesa', () => {
    played()
    fireEvent.click(saveButton())
    fireEvent.click(within(screen.getByRole('dialog', { name: 'Guardar combo' })).getByRole('button', { name: 'Guardar' }))
    cleanup()

    render(<Harness cards={CARDS} />)
    const aside = screen.getByRole('region', { name: 'Pasos y combos' })

    fireEvent.click(within(aside).getByRole('radio', { name: /Combos/ }))
    fireEvent.click(within(aside).getByRole('button', { name: 'Cargar Combo 1' }))
    fireEvent.click(within(aside).getByRole('radio', { name: /Pasos/ }))
    expect(within(within(aside).getByRole('list', { name: 'Jugadas' })).getAllByRole('button').map((button) => button.textContent)).toEqual([
      '3Invocación Normal de Ash Blossom',
      '2Pasás a la Main Phase 1',
      '1Pasás a la Standby Phase',
      '0Mano inicial',
    ])
    fireEvent.click(within(aside).getByRole('button', { name: /^3/ }))
    expect(within(zone('Zona de monstruo 2')).getByRole('button', { name: 'Ash Blossom' })).toBeInTheDocument()
  })
})
