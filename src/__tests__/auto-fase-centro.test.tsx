// @vitest-environment jsdom
import { fireEvent, screen, within } from '@testing-library/react'
import '@testing-library/jest-dom'
import { beforeEach, describe, expect, it, onTestFinished } from 'vitest'

import { LOCATION as L, type CoreAsk } from '../app/auto/protocol'
import { DESKTOP_DECK_BUILDER_MEDIA_QUERY } from '../app/use-media-query'
import { COMPACT_FIELD_MEDIA_QUERY } from '../components/probability/compact-field'
import { loc } from './support/auto-session-fake'
import { core, renderAuto } from './support/auto-screen-harness'

/**
 * Las fases, en un solo lugar (Gastón, 2026-11-12: «el botón de fases anterior estaba bien, debe estar en el medio de las 2 zonas de extra monster zone»; «las fases se repiten y no deberían»):
 * el botón con la sigla en `p2`, entre las dos Zonas Extra, en el celular y en escritorio. Sin la pista de fases ni el botón del turno: terminar el turno va en su menú.
 */

const idle: CoreAsk = {
  type: 'select_idlecmd',
  player: 0,
  summons: [loc(100, L.HAND, 0)],
  special_summons: [],
  pos_changes: [],
  monster_sets: [],
  spell_sets: [],
  activates: [],
  to_bp: true,
  to_ep: true,
  shuffle: false,
}

const viewport = (query: string, width: number, height: number) => {
  window.matchMedia = ((media: string) => ({ matches: media === query || media.includes('reduce'), media, addEventListener: () => {}, removeEventListener: () => {}, addListener: () => {}, removeListener: () => {}, onchange: null, dispatchEvent: () => false })) as typeof window.matchMedia
  Object.assign(window, { innerWidth: width, innerHeight: height })
}

beforeEach(() => {
  const size = { width: window.innerWidth, height: window.innerHeight }
  onTestFinished(() => void Object.assign(window, { innerWidth: size.width, innerHeight: size.height }))
})

describe('auto · las fases al medio del campo', () => {
  for (const [name, query, width, height] of [
    ['celular', COMPACT_FIELD_MEDIA_QUERY, 390, 844],
    ['escritorio', DESKTOP_DECK_BUILDER_MEDIA_QUERY, 1440, 900],
  ] as const) {
    it(`${name}: un solo botón «Fases:», en el campo entre las dos Zonas Extra (\`p2\`), sin pista de fases ni botón del turno; tocarlo abre las fases`, () => {
      viewport(query, width, height)
      const fake = renderAuto()

      core(() => fake.ask(idle))
      const phases = screen.getAllByRole('button', { name: /^Fases:/ })

      expect(phases).toHaveLength(1)
      expect(phases[0]).toHaveAccessibleName('Fases: Main Phase 1')
      expect(phases[0]).toHaveTextContent('M1')
      expect(within(screen.getByLabelText('Campo')).getByRole('button', { name: /^Fases:/ })).toBe(phases[0])
      expect(phases[0]!.parentElement).toHaveStyle({ gridArea: 'p2' })
      expect(document.querySelector('[data-phase-track], [data-turn-action]')).toBeNull()
      expect(screen.queryByRole('button', { name: /^(Ir a Batalla|Terminar turno)$/ })).toBeNull()

      fireEvent.click(phases[0]!)
      expect(document.querySelector('[data-prompt="phases"]')).not.toBeNull()
    })
  }

  it('celular: sin línea entre el campo y tu mano (una marca de 0 px), tus vidas abajo sin el botón del turno y la chapa del que juega con el borde de 3 px (sin texto de turno)', () => {
    viewport(COMPACT_FIELD_MEDIA_QUERY, 390, 844)
    const fake = renderAuto()

    core(() => fake.ask(idle))
    expect(document.querySelector('[data-duel-line]')).toHaveClass('h-0')
    const seat = document.querySelector<HTMLElement>('[data-mat-seat]')!

    expect(within(seat).queryByRole('button', { name: /^(Ir a Batalla|Terminar turno)$/ })).toBeNull()
    const [mine, theirs] = ['mine', 'theirs'].map((side) => document.querySelector<HTMLElement>(`[data-life-badge][data-lp="${side}"]`)!)

    expect(seat).toContainElement(mine!)
    expect(theirs!.closest('[data-bar-seat]')).not.toBeNull()
    expect(mine).toHaveAttribute('data-active', 'true')
    expect(mine).toHaveClass('border-[3px]', 'border-primary')
    expect(mine.textContent).not.toMatch(/turno/i)
    expect(theirs).toHaveAttribute('data-active', 'false')
    expect(theirs).toHaveClass('border-border-subtle')
    expect(theirs).not.toHaveClass('border-[3px]')
  })
})
