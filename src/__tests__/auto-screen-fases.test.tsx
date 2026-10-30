// @vitest-environment jsdom
import { act, cleanup, fireEvent, screen, within } from '@testing-library/react'
import '@testing-library/jest-dom'
import { describe, expect, it, vi } from 'vitest'

import { LOCATION as L, type CoreAsk } from '../app/auto/protocol'
import { setAutoPref } from '../app/auto-prefs'
import type { MatAction, MatPhase } from '../app/practice-mat'
import { STEP_MS } from '../components/auto/AutoSoloScreen'
import { fakeSession, loc, pos, type FakeSession } from './support/auto-session-fake'
import { core, dispatches, hand, handCard, lane, phaseButton, renderAuto } from './support/auto-screen-harness'
import { tap } from './support/practice-mat-harness'

// Las fases de «Jugar solo automático» como en la mesa manual: arrancás en la Draw Phase y las cambiás vos con el botón de fases. La mesa frena en tu DP y tu SP
// (aunque el núcleo ya las contó) y, si tenés algo para activar ahí (una Rápida), la ventana se juega como en la manual: brilla y el botón de fases pasa.

const IDLE: CoreAsk = { type: 'select_idlecmd', player: 0, summons: [loc(100, L.HAND, 0)], special_summons: [], pos_changes: [], monster_sets: [], spell_sets: [], activates: [], to_bp: false, to_ep: true, shuffle: false }
/** La ventana de una fase tuya con Called by the Grave (900, en la mano) para activar: sin nada que «responda de verdad» (`spe_count` 0), como la abre el núcleo. */
const windowAt = (hint_timing: number): CoreAsk => ({ type: 'select_chain', player: 0, spe_count: 0, forced: false, hint_timing, hint_timing_other: 0, selects: [{ ...pos(900, L.HAND, 1, 10), description: '0', client_mode: 0 }] })
const PASS = { type: 'select_chain', index: null }
const to = (phase: MatPhase, skipDraw?: true): MatAction => ({ type: 'phase', phase, ...(skipDraw ? { skipDraw } : {}) })
/** Lo que el núcleo cuenta al empezar tu turno 1: la DP, la SP y la M1 de una (el turno 1 no roba). */
const START = [to('standby'), to('main1')]

/** La sesión con la mesa del arranque como la arma el núcleo: el turno 1 en la Draw Phase (la sesión de mentira arranca en la M1). */
function drawPhaseSession(actions: MatAction[] = []): FakeSession {
  const fake = fakeSession()
  const { initial } = fake.getSnapshot()

  fake.set({ initial: { mine: { ...initial.mine, phase: 'draw' }, theirs: initial.theirs }, mineActions: actions })
  return fake
}
/** La mesa rearmada (un duelo nuevo, un deshacer, un reinicio): la misma del arranque, con esas jugadas y, después, la pregunta. */
function rearm(fake: FakeSession, actions: MatAction[], ask: CoreAsk | null) {
  core(() => fake.set({ initial: { ...fake.getSnapshot().initial }, mineActions: actions, status: 'ready', replaying: false }))
  if (ask) core(() => fake.ask(ask))
}
const phaseIs = (name: string) => expect(phaseButton()).toHaveAccessibleName(`Fases: ${name}`)
const goTo = (name: string) => {
  fireEvent.click(phaseButton())
  fireEvent.click(screen.getByRole('menuitem', { name: `Ir a ${name}` }))
}
const step = () => act(() => vi.advanceTimersByTime(STEP_MS + 5))

describe('auto-screen · las fases son manuales', () => {
  it('un duelo nuevo arranca en la Draw Phase: el botón de fases ofrece la SP y la M1, y cambiar de fase no le contesta nada al núcleo hasta la Main Phase 1', () => {
    const fake = renderAuto(drawPhaseSession())

    rearm(fake, START, IDLE)
    phaseIs('Draw Phase')
    expect(phaseButton()).toBeEnabled()
    fireEvent.click(phaseButton())
    expect(screen.getByRole('menuitem', { name: 'Ir a Standby Phase' })).not.toHaveAttribute('aria-disabled')
    expect(screen.getByRole('menuitem', { name: 'Ir a Main Phase 1' })).not.toHaveAttribute('aria-disabled')
    // Sin pasar por la M1 no hay batalla (el núcleo no la deja), ni vuelta atrás.
    expect(screen.getByRole('menuitem', { name: /^Battle Phase/ })).toHaveAttribute('aria-disabled', 'true')
    fireEvent.click(screen.getByRole('menuitem', { name: 'Ir a Standby Phase' }))
    phaseIs('Standby Phase')
    expect(phaseButton()).toBeEnabled()
    // En la DP y la SP no hay jugadas que ofrecer: tocar una carta sólo la muestra.
    tap(handCard('Ash Blossom'))
    expect(screen.queryByRole('menuitem')).toBeNull()
    goTo('Main Phase 1')
    phaseIs('Main Phase 1')
    tap(handCard('Ash Blossom'))
    fireEvent.click(screen.getByRole('menuitem', { name: 'Invocación Normal' }))
    expect(fake.answers).toEqual([{ type: 'select_idlecmd', action: 0, index: 0 }])
    expect(dispatches).toBe(0)
  })

  it('«Main Phase 1» desde la Draw Phase salta las dos', () => {
    const fake = renderAuto(drawPhaseSession())

    rearm(fake, START, IDLE)
    goTo('Main Phase 1')
    step()
    phaseIs('Main Phase 1')
    expect(fake.answers).toEqual([])
    expect(phaseButton()).toBeEnabled()
  })

  it('el turno que llega se cuenta a su ritmo y frena en tu DP: ni el tiempo ni tocar la mesa cruzan la parada', () => {
    const fake = renderAuto()

    // Terminaste tu turno; el núcleo cuenta tu End Phase, el turno del rival, tu robo y tu DP, SP y M1 de una.
    core(() => fake.events([to('end'), to('draw', true), { type: 'draw', count: 1, ids: ['card-101-1'] }, ...START]))
    core(() => fake.ask(IDLE))
    expect(phaseButton()).toBeDisabled()
    // Tocar la mesa salta hasta la parada, no más allá.
    fireEvent.pointerDown(hand(), { button: 0, pointerId: 1 })
    phaseIs('Draw Phase')
    expect(handCard('Droll')).toBeInTheDocument()
    expect(phaseButton()).toBeEnabled()
    for (let n = 0; n < 4; n += 1) step()
    fireEvent.pointerDown(hand(), { button: 0, pointerId: 1 })
    phaseIs('Draw Phase')
    goTo('Standby Phase')
    phaseIs('Standby Phase')
    goTo('Main Phase 1')
    phaseIs('Main Phase 1')
    expect(fake.answers).toEqual([])
  })

  it('rearmar: un deshacer a mitad del turno o una recarga no frenan; deshacer la primera jugada del turno vuelve a la M1; reiniciar, a la Draw Phase', () => {
    const fake = renderAuto(drawPhaseSession())
    const midTurn = [...START, { type: 'move', id: 'card-200-1', to: 'gy' } as MatAction]

    rearm(fake, midTurn, IDLE)
    phaseIs('Main Phase 1')
    expect(screen.queryByRole('button', { name: 'Maxx C' })).toBeNull()
    rearm(fake, START, IDLE)
    phaseIs('Draw Phase')
    goTo('Main Phase 1')
    step()
    phaseIs('Main Phase 1')
    // Deshacer la primera jugada de la M1: ya habías dejado la DP y la SP de este turno.
    core(() => fake.undo())
    rearm(fake, START, IDLE)
    phaseIs('Main Phase 1')
    // Reiniciar es otro duelo: lo pedido vuelve a cero.
    core(() => fake.restart())
    rearm(fake, START, IDLE)
    phaseIs('Draw Phase')

    // La mesa que se arma con el turno empezado (el invitado que recarga) tampoco frena; si recién empieza, sí.
    const reload = (actions: MatAction[]) => {
      const session = drawPhaseSession(actions)

      session.ask(IDLE)
      cleanup()
      renderAuto(session)
    }

    reload(midTurn)
    phaseIs('Main Phase 1')
    reload(START)
    phaseIs('Draw Phase')
  })

  it('la ventana de tu DP con una Rápida en la mano: brilla sin cartel, se activa con su menú y «Standby Phase» pasa; la de la SP, igual', () => {
    const fake = renderAuto(drawPhaseSession())

    rearm(fake, [], windowAt(0x1))
    phaseIs('Draw Phase')
    expect(handCard('Called by the Grave')).toHaveAttribute('data-glow-kind', 'can')
    expect(lane()).toBeNull()
    tap(handCard('Called by the Grave'))
    expect(screen.getAllByRole('menuitem').map((item) => item.textContent)).toEqual(['Activar'])
    fireEvent.keyDown(window, { key: 'Escape' })
    goTo('Standby Phase')
    expect(fake.answers).toEqual([PASS])
    // El núcleo pasa a tu SP y vuelve a abrir la ventana: la mesa cruza la parada que pediste y la muestra.
    core(() => fake.events([to('standby')]))
    core(() => fake.ask(windowAt(0x2)))
    step()
    phaseIs('Standby Phase')
    tap(handCard('Called by the Grave'))
    fireEvent.click(screen.getByRole('menuitem', { name: 'Activar' }))
    expect(fake.answers).toEqual([PASS, { type: 'select_chain', index: 0 }])
    expect(dispatches).toBe(0)
  })

  it('«Main Phase 1» en la ventana de la DP pasa y la ventana de la SP se pasa sola, sin mostrarse', () => {
    const fake = renderAuto(drawPhaseSession())

    rearm(fake, [], windowAt(0x1))
    goTo('Main Phase 1')
    core(() => fake.events([to('standby')]))
    core(() => fake.ask(windowAt(0x2)))
    expect(fake.answers).toEqual([PASS, PASS])
    step()
    expect(handCard('Called by the Grave')).not.toHaveAttribute('data-glow-kind', 'can')
    core(() => fake.events([to('main1')]))
    core(() => fake.ask(IDLE))
    step()
    phaseIs('Main Phase 1')
    expect(phaseButton()).toBeEnabled()
  })

  it('la ventana de la End Phase: «Terminar turno» la pasa; con «Respuestas: Nunca» las ventanas no se muestran', () => {
    const fake = renderAuto(drawPhaseSession())

    rearm(fake, [...START, to('end')], windowAt(0x20))
    phaseIs('End Phase')
    expect(handCard('Called by the Grave')).toHaveAttribute('data-glow-kind', 'can')
    // En el celular, el botón de la End Phase pregunta si terminás el turno (como en la mesa manual).
    fireEvent.click(phaseButton())
    fireEvent.click(within(screen.getByRole('alertdialog', { name: '¿Terminar tu turno?' })).getByRole('button', { name: 'Terminar turno' }))
    expect(fake.answers).toEqual([PASS])

    act(() => setAutoPref('chain', 'never'))
    core(() => fake.ask(windowAt(0x1)))
    expect(fake.answers).toEqual([PASS, PASS])
    expect(handCard('Called by the Grave')).not.toHaveAttribute('data-glow-kind', 'can')
  })

  it('en el turno del rival, la mesa y la barra muestran su fase y el botón de fases queda apagado', () => {
    const fake = renderAuto()
    const { overlay, theirs } = fake.getSnapshot()

    core(() => fake.set({ overlay: { ...overlay, turn: 2, turnPlayer: 1 }, theirs: { ...theirs, phase: 'battle' } }))
    phaseIs('Battle Phase')
    expect(phaseButton()).toBeDisabled()
    // El botón dice la fase del rival con su sigla (no la tuya: la sesión de mentira te deja en la Main Phase 1); el nombre, en su aria-label. Nada más la repite.
    expect(phaseButton()).toHaveTextContent(/^BP$/)
    expect(screen.queryAllByText(/Battle Phase|Main Phase 1/)).toHaveLength(0)
  })

  // El de tu mesa («Turno de Rival») y los del rival van cada uno por su lado.
  const banners = () => [...document.querySelectorAll('[data-fx="banner"]')].map((element) => element.textContent ?? '')
  const rivalBanner = () => banners().find((text) => /^(Rival|Tu turno)/.test(text)) ?? null
  /**
   * Terminás tu turno y, en la misma tanda, el rival juega el suyo entero y te lo devuelve, como lo cuenta el núcleo de verdad (el rival pasivo y el de handtraps, yendo primero o
   * segundo: `auto-fases-rival.slow.test.ts`): su robo, su SP, su M1, su End Phase (a veces con su descarte) y el pase; después, tu robo del turno nuevo.
   */
  const rivalTurn = (fake: FakeSession) => {
    const { overlay } = fake.getSnapshot()
    const theirs = [{ type: 'draw', count: 1 } as MatAction, to('standby'), to('main1'), to('end'), to('draw', true)].map((action) => ({ action, reveal: {} }))

    core(() => fake.set({ overlay: { ...overlay, turn: 3, turnPlayer: 0 }, mineActions: [to('end'), to('draw', true), { type: 'draw', count: 1 }], theirsActs: theirs, order: ['mine', 'mine', 'theirs', 'theirs', 'theirs', 'theirs', 'theirs', 'mine'] }))
    core(() => fake.ask(IDLE))
  }

  it('el turno del rival, que el núcleo juega de una, se ve fase por fase con su cartel después de tu End Phase y «Turno de Rival», con su End Phase antes de «Tu turno»; tu turno espera', () => {
    const fake = renderAuto()
    const cards = () => within(hand()).getAllByRole('listitem').length
    const before = cards()

    rivalTurn(fake)
    // Ninguno antes de que tu mesa llegue: primero tu End Phase y «Turno de Rival».
    expect(rivalBanner()).toBeNull()
    step()
    step()
    expect(banners()).toContain('Turno de Rival')
    // Su robo va con «Turno de Rival», sin cartel propio.
    act(() => vi.advanceTimersByTime(0))
    const seen: string[] = []
    for (let i = 0; i < 4; i += 1) {
      act(() => vi.advanceTimersByTime(1100))
      seen.push(rivalBanner() ?? '')
      // Tu turno (tu robo, el botón de fases) no empieza debajo de los carteles del rival: lo tuyo no tapa su End Phase.
      if (i < 3) {
        expect(cards()).toBe(before)
        expect(phaseButton()).toBeDisabled()
      }
    }
    expect(seen).toEqual(['RivalStandby Phase', 'RivalMain Phase 1', 'RivalEnd Phase', 'Tu turno'])
    step()
    expect(cards()).toBe(before + 1)
    act(() => vi.advanceTimersByTime(1100))
    expect(rivalBanner()).toBeNull()
  })

  it('tocar la mesa mientras se cuenta el turno del rival lo salta sin carteles en ráfaga', () => {
    const fake = renderAuto()

    rivalTurn(fake)
    step()
    step()
    act(() => vi.advanceTimersByTime(0))
    act(() => vi.advanceTimersByTime(1100))
    expect(rivalBanner()).toBe('RivalStandby Phase')
    fireEvent.pointerDown(hand())
    const seen = new Set<string>()
    for (let i = 0; i < 8; i += 1) {
      act(() => vi.advanceTimersByTime(STEP_MS))
      seen.add(rivalBanner() ?? '')
    }
    expect(seen).toEqual(new Set(['RivalStandby Phase', '']))
    expect(phaseButton()).toBeEnabled()
  })
})
