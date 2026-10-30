// @vitest-environment jsdom
import { act, cleanup, fireEvent, screen, within } from '@testing-library/react'
import '@testing-library/jest-dom'
import { describe, expect, it, vi } from 'vitest'

import { LOCATION as L, type CoreAsk } from '../app/auto/protocol'
import { createMatcherPattern } from '../app/pattern-factory'
import { createMatState, replayMat, type MatAction, type MatPhase } from '../app/practice-mat'
import { createSavedCombo, readSavedCombos, writeSavedCombos, type SavedCombo } from '../app/saved-combos'
import { AutoSoloScreen, STEP_MS } from '../components/auto/AutoSoloScreen'
import type { CardEntry, CardRole } from '../types'
import { CARDS, fakeSession, loc, SPOTS, type FakeSession } from './support/auto-session-fake'
import { core, dispatches, handCard, inHand, phaseButton, renderAuto } from './support/auto-screen-harness'
import { Harness, render, zone } from './support/practice-mat-harness'
import { menuRow, tapMenu } from './support/mat-menu'

// «Jugar solo automático» con el panel de la práctica: los pasos (la cinta del núcleo, con la mano de apertura como paso 0) y los combos. La mesa nunca despacha: lo que se
// anota es lo que contó el núcleo.

vi.mock('../app/lab-odds-client', () => ({ requestLabOdds: vi.fn(() => new Promise(() => {})) }))

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
  fireEvent.click(screen.getByRole('menuitem', { name: `Ir a ${name}` }))
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

  it('hasta 1100 px (sin fila de abajo) la lista se abre desde lo primero del ⋯ de la barra, en una hoja con «Pasos» y «Combos»', () => {
    const fake = renderAuto(openingSession())

    rearm(fake, START, IDLE)
    goTo('Main Phase 1')
    step()
    // No es un botón suelto (ni arriba ni abajo): va en el ⋯.
    expect(screen.queryByRole('button', { name: 'Pasos y combos' })).toBeNull()
    fireEvent.click(menuRow(/^Pasos y combos$/))
    const sheet = screen.getByRole('dialog', { name: 'Pasos y combos' })

    expect(within(sheet).getAllByRole('radio').map((radio) => radio.textContent)).toEqual(['Pasos2', 'Combos0'])
    expect(within(within(sheet).getByRole('list', { name: 'Jugadas' })).getAllByRole('button').map((button) => button.textContent)).toEqual(['2Pasás a la Main Phase 1', '1Pasás a la Standby Phase', '0Mano inicial'])
    expect(dispatches).toBe(0)
  })

  const entry = (code: number, roles: CardRole[]): CardEntry => ({ id: `card-${code}`, name: CARDS.get(`card-${code}-1`)!.name, copies: 1, source: 'manual', apiCard: null, origin: 'engine', roles, needsReview: false })
  const lab = {
    handSize: 2,
    derivedMainCards: [entry(100, ['starter']), entry(900, ['enabler']), entry(101, ['brick']), entry(102, ['brick'])],
    patterns: [createMatcherPattern('Salida básica', 'opening', [{ matcher: { type: 'role', value: 'starter' }, quantity: 1, kind: 'include' }])],
    hasCompletedClassification: true,
    reviewPendingPatternCount: 0,
  }
  const mainIds = [...CARDS.keys()].filter((id) => id !== 'card-500-1')

  it('las salidas de tu mano de apertura (los chips del Lab) están como en la práctica: tocar una ilumina sus cartas y con la primera jugada se van', () => {
    const fake = openingSession()

    render(<AutoSoloScreen mainIds={mainIds} extraIds={['card-500-1']} cardsById={CARDS} deckName="Test" onExit={() => {}} lab={lab} connect={() => fake} />)
    rearm(fake, START, IDLE)
    // En el celular van plegadas en la píldora de la barra de arriba: se abre para verlas.
    fireEvent.click(screen.getByRole('button', { name: 'Salidas y problemas de tu mano: 1 salida' }))
    const chip = within(screen.getByRole('list', { name: 'Salidas' })).getByRole('button', { name: 'Salida básica' })

    fireEvent.click(chip)
    expect(handCard('Ash Blossom')).toHaveAttribute('data-glow', 'true')
    goTo('Standby Phase')
    expect(screen.queryByRole('list', { name: 'Salidas' })).toBeNull()
    expect(screen.queryByRole('button', { name: /^Salidas y problemas de tu mano:/ })).toBeNull()
    expect(handCard('Ash Blossom')).not.toHaveAttribute('data-glow', 'true')
    expect(dispatches).toBe(0)
  })

  it('si el automático sigue de la mesa de la práctica (`resume`) la mano ya no es de apertura: ni la píldora ni los chips de salidas', () => {
    const fake = openingSession()

    render(<AutoSoloScreen mainIds={mainIds} extraIds={['card-500-1']} cardsById={CARDS} deckName="Test" onExit={() => {}} lab={lab} resume={{ state: createMatState([], [], 0), lp: [8000, 8000] }} connect={() => fake} />)
    rearm(fake, START, IDLE)
    expect(handCard('Ash Blossom')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /^Salidas y problemas de tu mano:/ })).toBeNull()
    expect(screen.queryByRole('list', { name: 'Salidas' })).toBeNull()
  })
})

/** Lo guardado, tal cual: la misma clave y la misma lista que la práctica manual. */
const stored = () => JSON.parse(localStorage.getItem('ygo-lab:practice-combos') ?? '[]') as SavedCombo[]
const saveButton = () => menuRow('Guardar combo')
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

const nameOf = (id: string) => CARDS.get(id)?.name ?? id
/** Un combo de la práctica manual: Droll e Imperm en la mano; Droll al campo y la activación de Imperm. */
const DROLL_LINE = () =>
  createSavedCombo(
    { name: 'Línea Droll', deckName: 'Test', initial: createMatState(['card-101-1', 'card-102-1', 'card-100-1'], [], 2), actions: [{ type: 'place', id: 'card-101-1', zone: 'mz', index: 2, pos: 'atk', how: 'normal' }, { type: 'activate', id: 'card-102-1' }], nameOf },
    [],
  )
const rivalMonster = () => document.querySelector('[data-rival-card-id="c1"]')
const replayControls = () => screen.queryByRole('group', { name: 'Controles del replay' })
const lane = () => document.querySelector<HTMLElement>('[data-lane]')

describe('auto-screen · repasar en la misma mesa', () => {
  it('un combo guardado se repasa con los controles del replay y el lado del rival vacío, sin despachar ni contestar nada; «Volver al duelo» lo retoma donde estaba, con su pregunta', () => {
    writeSavedCombos([DROLL_LINE()])
    const fake = played()

    expect(rivalMonster()).not.toBeNull()
    expect(phaseButton()).toBeEnabled()
    fireEvent.click(within(panel()).getByRole('radio', { name: /Combos/ }))
    fireEvent.click(within(panel()).getByRole('button', { name: 'Cargar Línea Droll' }))

    // La mesa del combo, desde su mano inicial; se reproduce sola, con los controles de siempre (abajo, en el lugar de la fila de tus vidas).
    expect(replayControls()).not.toBeNull()
    expect(screen.getByRole('button', { name: 'Pausar' })).toBeInTheDocument()
    expect(handCard('Droll')).toBeInTheDocument()
    expect(inHand('Called by the Grave')).toBeNull()
    expect(rivalMonster()).toBeNull()
    expect(lane()).toHaveTextContent('Repasás “Línea Droll”Mano inicial')
    // Nada que jugar: ni el botón de fases ni el menú de una carta, ni tocar la mesa adelanta el duelo.
    expect(phaseButton()).toBeDisabled()
    act(() => vi.advanceTimersByTime(1400 + 5))
    expect(within(zone('Zona de monstruo 3')).getByRole('button', { name: 'Droll' })).toBeInTheDocument()
    // En el celular el replay va partido (opción B): el aviso dice qué paso se mira y abajo van los botones y, debajo de ellos, la línea de tiempo con la lista.
    // «Volver al duelo» es secundario (lavanda: no compite con el botón grande) y la carta grande va sin cartel (el paso ya se lee arriba).
    expect(lane()).toHaveTextContent('Repasás “Línea Droll”1 de 2 · Invocación Normal de Droll')
    expect(within(lane()!).getByRole('button', { name: 'Volver al duelo' })).toHaveClass('bg-lavender')
    const timeline = document.querySelector<HTMLElement>('[data-replay-timeline]')!
    // Abajo, con los botones, y después de ellos (Gastón, 2026-10-29: «chips de replay debajo del reproductor»).
    expect(timeline.closest('[data-mat-float]')).not.toBeNull()
    expect(replayControls()!.compareDocumentPosition(timeline) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
    expect(within(timeline).getByRole('slider', { name: 'Línea de tiempo del replay' })).toHaveAttribute('aria-valuenow', '1')
    expect(within(timeline).getByRole('button', { name: 'Ver los pasos' })).toBeInTheDocument()
    expect(within(replayControls()!).queryByRole('slider')).toBeNull()
    expect(within(replayControls()!).getAllByRole('button').map((button) => button.getAttribute('aria-label'))).toEqual(['Volver al principio', 'Anterior', 'Pausar', 'Siguiente', 'Velocidad: 1×'])
    expect(document.querySelector('[data-activation] span[data-stage-text]')).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: 'Siguiente' }))
    fireEvent.pointerDown(document.querySelector('[data-drop="hand"]')!, { button: 0, pointerId: 1 })
    fireEvent.click(within(panel()).getByRole('radio', { name: /Pasos/ }))
    expect(steps()).toEqual(['2Activás el efecto de Imperm', '1Invocación Normal de Droll', '0Mano inicial'])

    fireEvent.click(within(lane()!).getByRole('button', { name: 'Volver al duelo' }))
    expect(replayControls()).toBeNull()
    expect(within(zone('Zona de monstruo 2')).getByRole('button', { name: 'Ash Blossom' })).toBeInTheDocument()
    expect(handCard('Called by the Grave')).toBeInTheDocument()
    expect(rivalMonster()).not.toBeNull()
    expect(phaseButton()).toBeEnabled()
    expect(steps()[0]).toBe('3Invocación Normal de Ash Blossom')
    expect(stored().map((combo) => combo.name)).toEqual(['Línea Droll'])
    expect(fake.answers).toEqual([])
    expect(dispatches).toBe(0)
  })

  it('tocar un paso de tus jugadas lo muestra en la mesa (como en la práctica, sin los controles del replay); el duelo espera: la tanda que llega no avanza hasta volver (tocando el último paso o «Volver al duelo»)', () => {
    const fake = played()

    core(() => fake.events([to('battle')]))
    fireEvent.click(within(panel()).getByRole('button', { name: /^1/ }))
    expect(handCard('Ash Blossom')).toBeInTheDocument()
    expect(replayControls()).toBeNull()
    expect(lane()).toHaveTextContent('Repasás tus jugadas: el duelo te espera donde lo dejaste.')
    // Ni el tiempo ni tocar la mesa lo mueven: la lista sigue siendo la de antes y la cinta del núcleo no cambia.
    step()
    step()
    fireEvent.pointerDown(document.querySelector('[data-drop="hand"]')!, { button: 0, pointerId: 1 })
    expect(steps()).toEqual(['3Invocación Normal de Ash Blossom', '2Pasás a la Main Phase 1', '1Pasás a la Standby Phase', '0Mano inicial'])
    expect(fake.getSnapshot().mineActions).toEqual([...START, SUMMON, to('battle')])

    fireEvent.click(within(panel()).getByRole('button', { name: /^2/ }))
    expect(lane()).toHaveTextContent('Repasás tus jugadas')
    // El último paso es ahora: vuelve al duelo, que sigue a su ritmo.
    fireEvent.click(within(panel()).getByRole('button', { name: /^3/ }))
    expect(lane()).toBeNull()
    expect(inHand('Ash Blossom')).toBeNull()
    step()
    expect(steps()[0]).toBe('4Pasás a la Battle Phase')
    expect(fake.answers).toEqual([])
    expect(dispatches).toBe(0)
  })

  it('repasando, la mira que deja un combo no se quita sola (la mesa no despacha); reiniciar el duelo cierra el repaso', () => {
    const marked = createSavedCombo({ name: 'Con mira', deckName: 'Test', initial: createMatState(['card-101-1', 'card-102-1'], [], 2), actions: [{ type: 'target', id: 'card-101-1' }], nameOf }, [])

    writeSavedCombos([marked])
    const fake = played()

    fireEvent.click(within(panel()).getByRole('radio', { name: /Combos/ }))
    fireEvent.click(within(panel()).getByRole('button', { name: 'Cargar Con mira' }))
    act(() => vi.advanceTimersByTime(1400 + 5))
    act(() => vi.advanceTimersByTime(6000))
    expect(handCard('Droll (target)')).toBeInTheDocument()
    expect(dispatches).toBe(0)

    tapMenu('Opciones del duelo')
    fireEvent.click(screen.getByRole('button', { name: 'Reiniciar el mismo duelo' }))
    expect(fake.restarts).toBe(1)
    expect(lane()?.textContent ?? '').not.toMatch(/Repasás/)
    expect(replayControls()).toBeNull()
  })
})
