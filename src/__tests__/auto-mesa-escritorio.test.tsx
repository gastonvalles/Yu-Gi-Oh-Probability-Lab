// @vitest-environment jsdom
import { fireEvent, screen, within } from '@testing-library/react'
import '@testing-library/jest-dom'
import { beforeEach, describe, expect, it, onTestFinished } from 'vitest'

import { LOCATION as L, type CoreAsk } from '../app/auto/protocol'
import { DESKTOP_DECK_BUILDER_MEDIA_QUERY } from '../app/use-media-query'
import { loc } from './support/auto-session-fake'
import { core, renderAuto } from './support/auto-screen-harness'

/**
 * La mesa de escritorio crece (Gastón, «Las 7», mejora 6b), sólo en el duelo automático desde 1101 px: debajo del campo va la línea de alto fijo (la pista de fases o la cadena) con el botón
 * del turno a su derecha, y la ficha «M1» sale del campo. Lo que mide (la casilla de 88 px a 1440 × 900, entera a 1101 × 700) se mide en un navegador: jsdom no mide.
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
  window.matchMedia = ((query: string) => ({ matches: query === DESKTOP_DECK_BUILDER_MEDIA_QUERY || query.includes('reduce'), media: query, addEventListener: () => {}, removeEventListener: () => {}, addListener: () => {}, removeListener: () => {}, onchange: null, dispatchEvent: () => false })) as typeof window.matchMedia
  const size = { width: window.innerWidth, height: window.innerHeight }
  Object.assign(window, { innerWidth: 1440, innerHeight: 900 })
  onTestFinished(() => void Object.assign(window, { innerWidth: size.width, innerHeight: size.height }))
})

describe('auto · la mesa de escritorio', () => {
  it('la línea de abajo del campo lleva la pista de fases (la única «Fases:», fuera del campo) y, a su derecha, el botón del turno', () => {
    const fake = renderAuto()

    core(() => fake.ask(idle(true)))
    const line = document.querySelector<HTMLElement>('[data-duel-line]')!
    const track = within(line).getByRole('button', { name: 'Fases: Main Phase 1' })

    expect(screen.getAllByRole('button', { name: /^Fases:/ })).toEqual([track])
    expect(within(screen.getByLabelText('Campo')).queryByRole('button', { name: /^Fases:/ })).toBeNull()
    expect(line).toHaveClass('h-14')

    const action = within(line).getByRole('button', { name: 'Ir a Batalla' })

    expect(document.querySelector('[data-mat-seat]')).toBeNull()
    fireEvent.click(action)
    expect(fake.answers.at(-1)).toMatchObject({ type: 'select_idlecmd', action: 6 })
  })

  it('sin Battle Phase el botón dice «Terminar turno» y termina el turno', () => {
    const fake = renderAuto()

    core(() => fake.ask(idle(false)))
    fireEvent.click(within(document.querySelector<HTMLElement>('[data-duel-line]')!).getByRole('button', { name: 'Terminar turno' }))
    expect(fake.answers.at(-1)).toMatchObject({ type: 'select_idlecmd', action: 7 })
  })
})
