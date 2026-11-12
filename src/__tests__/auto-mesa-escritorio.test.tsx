// @vitest-environment jsdom
import { screen, within } from '@testing-library/react'
import '@testing-library/jest-dom'
import { beforeEach, describe, expect, it, onTestFinished } from 'vitest'

import { LOCATION as L, type CoreAsk } from '../app/auto/protocol'
import { DESKTOP_DECK_BUILDER_MEDIA_QUERY } from '../app/use-media-query'
import { loc } from './support/auto-session-fake'
import { core, renderAuto } from './support/auto-screen-harness'

/**
 * La mesa de escritorio del duelo automático (desde 1101 px; Gastón, 2026-11-12: «esto de mover el detalle de la carta a un único panel derecho no me gusta»): dos paneles, el detalle de la carta a la
 * izquierda (desde 1440 px) y los pasos a la derecha, sin pestañas ni columna única; sin línea debajo del campo ni renglón del turno; la fase, en su botón cuadrado, al medio del campo.
 * Lo que mide (la casilla de ~100 px a 1440 × 900, entera a 1101 × 700, el campo que no se mueve) se mide en un navegador: jsdom no mide.
 */

const idle =(toBattle: boolean): CoreAsk => ({
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
  window.matchMedia = ((query: string) => ({ matches: query === DESKTOP_DECK_BUILDER_MEDIA_QUERY || query.includes('reduce'), media: query, addEventListener: () => {}, removeEventListener: () => {}, addListener: () => {}, removeListener: () => {}, onchange: null, dispatchEvent: () => false })) as typeof window.matchMedia
  const size = { width: window.innerWidth, height: window.innerHeight }
  Object.assign(window, { innerWidth: 1440, innerHeight: 900 })
  onTestFinished(() => void Object.assign(window, { innerWidth: size.width, innerHeight: size.height }))
})

describe('auto · la mesa de escritorio', () => {
  it('dos paneles, como antes: el detalle de la carta a la izquierda y los pasos a la derecha, sin pestañas ni columna única', () => {
    renderAuto()

    expect(screen.getAllByLabelText('Detalle de la carta')).toHaveLength(1)
    expect(document.querySelector('[data-card-dock]')).toHaveClass('min-[1440px]:col-start-1')
    expect(screen.getByRole('region', { name: 'Pasos y combos' })).toHaveClass('min-[1101px]:col-start-2', 'min-[1440px]:col-start-3')
    expect(screen.queryByRole('tablist', { name: 'Panel de la mesa' })).toBeNull()
    expect(document.querySelector('[data-mat-column]')).toBeNull()
  })

  it('sin línea debajo del campo (queda su marca de 0 px, el techo de las ventanas) ni pista de fases ni botón del turno: la fase va en su botón, al medio del campo, cuadrado', () => {
    const fake = renderAuto()

    core(() => fake.ask(idle(true)))
    const line = document.querySelector<HTMLElement>('[data-duel-line]')!

    expect(line).toHaveClass('h-0')
    expect(within(line).queryByRole('button')).toBeNull()
    expect(document.querySelector('[data-phase-track], [data-turn-action]')).toBeNull()
    const phase = screen.getAllByRole('button', { name: /^Fases:/ })

    expect(phase).toEqual([within(screen.getByLabelText('Campo')).getByRole('button', { name: 'Fases: Main Phase 1' })])
    expect(phase[0]).toHaveClass('size-[100cqmin]!')
    expect(screen.queryByRole('button', { name: /^(Ir a Batalla|Terminar turno)$/ })).toBeNull()
    expect(document.querySelector('[data-mat-seat]')).toBeNull()
  })

  it('ningún renglón dice de quién es el turno (la chapa de quien juega lo dice)', () => {
    renderAuto()

    expect(screen.queryByTestId('auto-turn')).toBeNull()
  })
})