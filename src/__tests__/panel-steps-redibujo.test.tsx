// @vitest-environment jsdom
import { act, fireEvent, screen } from '@testing-library/react'
import { useState } from 'react'
import { describe, expect, it, vi } from 'vitest'

import { LOCATION as L, type CoreAsk } from '../app/auto/protocol'
import { createMatState, describeMatSteps, matReducer, type MatAction, type MatState } from '../app/practice-mat'
import { STEP_MS } from '../components/auto/AutoSoloScreen'
import { PracticeMatPanel } from '../components/probability/PracticeMatPanel'
import { createPanelSteps, panelStepsOf, type PanelChains } from '../components/probability/panel-steps'
import { fakeSession, loc, SPOTS } from './support/auto-session-fake'
import { core, phaseButton, renderAuto } from './support/auto-screen-harness'
import { render } from './support/practice-mat-harness'
import { random, randomAction } from './support/random-mat'

// La lista de pasos no se rehace entera con cada jugada (con 200 jugadas eran ~40 ms por paso): cada ficha (`StepTile`, `memo`) se dibuja de nuevo sólo si cambia lo suyo. Se cuentan
// los tableros chicos de las fichas (uno por ficha con los detalles, que vienen prendidos).
const snapshots = vi.hoisted(() => ({ count: 0 }))

vi.mock('../components/probability/MatSnapshot', () => ({
  MatSnapshot: () => {
    snapshots.count += 1
    return null
  },
}))
vi.mock('../app/lab-odds-client', () => ({ requestLabOdds: vi.fn(() => new Promise(() => {})) }))

const NO_COMBOS: never[] = []
const redrawn = (run: () => void) => {
  const before = snapshots.count

  run()
  return snapshots.count - before
}

describe('la lista de pasos · qué fichas se dibujan de nuevo', () => {
  const table = createMatState(Array.from({ length: 40 }, (_, index) => `card-${1000 + index}-1`), ['card-9000-1'], 5)
  const nameOf = (id: string) => `Carta ${id}`
  const artOf = () => null
  const next = random(11)
  const actions: MatAction[] = []

  for (let state: MatState = table; actions.length < 31; ) {
    const action = randomAction(state, next)

    actions.push(action)
    state = matReducer(state, action)
  }
  const labels = describeMatSteps(table, actions, nameOf)
  /** Una marca de cadena en cada paso par, armada de nuevo en cada llamada (como `panelChainsOf` con cada jugada). */
  const chainsOf = (count: number): PanelChains => ({
    marks: new Map(Array.from({ length: count }, (_, index) => index + 1).filter((step) => step % 2 === 0).map((step) => [step, { chain: 1, link: step, result: { negated: false, from: step, to: step } }])),
    ends: new Map(),
  })

  it('una jugada más dibuja la ficha nueva y la que deja de ser la actual; las marcas de cadena iguales pero rearmadas no rehacen las demás', () => {
    const stepsOf = createPanelSteps()
    // Los callbacks de la mesa son estables (`useCallback`); acá, los mismos de siempre.
    const nothing = () => {}
    let setCount: (count: number) => void = nothing
    function Host() {
      const [count, set] = useState(30)

      setCount = set
      return <PracticeMatPanel steps={stepsOf(table, actions.slice(0, count), labels, nameOf, artOf)} initial={table} cursor={count} onSeek={nothing} nameOf={nameOf} artOf={artOf} combos={NO_COMBOS} deckName="Test" onLoad={nothing} onRename={nothing} onDelete={nothing} showCombos={false} chains={chainsOf(count)} />
    }
    const boxed = (step: number) => (panelStepsOf(table, actions, labels, nameOf, artOf)[step - 1]!.divider ? 0 : 1)

    render(<Host />)
    expect(redrawn(() => act(() => setCount(31)))).toBe(boxed(30) + boxed(31))
  })
})

describe('«Jugar solo automático» · la lista de pasos y los avisos del núcleo', () => {
  const IDLE: CoreAsk = { type: 'select_idlecmd', player: 0, summons: [loc(100, L.HAND, 0)], special_summons: [], pos_changes: [], monster_sets: [], spell_sets: [], activates: [], to_bp: false, to_ep: true, shuffle: false }
  const START: MatAction[] = [{ type: 'draw', count: 2, ids: ['card-100-1', 'card-900-1'] }, { type: 'phase', phase: 'standby' }, { type: 'phase', phase: 'main1' }]
  const SUMMON: MatAction = { type: 'place', id: 'card-100-1', zone: 'mz', index: 1, pos: 'atk', how: 'normal' }
  const step = () => act(() => vi.advanceTimersByTime(STEP_MS + 5))

  it('un aviso que no suma jugadas (las vidas) no dibuja ninguna ficha y una jugada más dibuja sólo la nueva y la anterior: `nameOf`, `artOf` y `onSeek` duran entre dibujos', () => {
    const fake = fakeSession(SPOTS.map((spot) => (spot.side === 'mine' && spot.location === L.HAND ? { ...spot, location: L.DECK, sequence: 10 + spot.sequence } : spot)))
    const { initial } = fake.getSnapshot()

    fake.set({ initial: { mine: { ...initial.mine, phase: 'draw' }, theirs: initial.theirs } })
    renderAuto(fake)
    core(() => fake.set({ initial: { ...fake.getSnapshot().initial }, mineActions: START, status: 'ready', replaying: false }))
    core(() => fake.ask(IDLE))
    fireEvent.click(phaseButton())
    fireEvent.click(screen.getByRole('menuitem', { name: 'Ir a Main Phase 1' }))
    step()
    core(() => fake.events([SUMMON]))
    step()
    // Tres pasos: la Standby y la Main Phase 1 (cabeceras, sin tablero) y la Invocación Normal.
    expect(screen.getAllByText('Invocación Normal de Ash Blossom').length).toBeGreaterThan(0)

    expect(redrawn(() => core(() => fake.set({ overlay: { ...fake.getSnapshot().overlay, lp: [7000, 8000] } })))).toBe(0)
    expect(redrawn(() => core(() => fake.ask(IDLE)))).toBe(0)
    // Un aviso del rival rearma su espejo (y lo que se sabe de sus cartas, `foreignKnown`) aunque no cambie nada.
    expect(redrawn(() => core(() => fake.set({ theirs: { ...fake.getSnapshot().theirs } })))).toBe(0)
    // La jugada nueva es una cabecera (sin tablero): sólo se dibuja de nuevo la Invocación, que deja de ser la actual.
    expect(
      redrawn(() => {
        core(() => fake.events([{ type: 'phase', phase: 'battle' }]))
        step()
      }),
    ).toBe(1)
  })
})
