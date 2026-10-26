// @vitest-environment jsdom
import { fireEvent, screen } from '@testing-library/react'
import '@testing-library/jest-dom'
import { beforeEach, describe, expect, it } from 'vitest'

import { LOCATION as L, type CoreAsk } from '../app/auto/protocol'
import { loc } from './support/auto-session-fake'
import { core, dispatches, handCard, renderAuto } from './support/auto-screen-harness'
import { tap } from './support/practice-mat-harness'

// Escritorio con el detalle fijo: una carta con una sola jugada no abre el menú de un renglón sino una etiqueta pegada a la carta; otro toque la hace, Escape la suelta. Con varias, el menú de siempre.

/** Ash se puede Invocar de forma Normal y nada más. */
const IDLE: CoreAsk = { type: 'select_idlecmd', player: 0, summons: [loc(100, L.HAND, 0)], special_summons: [], pos_changes: [], monster_sets: [], spell_sets: [], activates: [], to_bp: true, to_ep: true, shuffle: false }

beforeEach(() => {
  const media = window.matchMedia

  window.matchMedia = ((query: string) => ({ ...media(query), matches: query.includes('reduce') || query === '(min-width: 1101px)' || query === '(min-width: 1440px)' })) as typeof window.matchMedia
})

describe('auto-screen · una sola jugada es una etiqueta pegada a la carta', () => {
  it('un toque muestra la etiqueta (sin menú) y otro toque sobre ella hace la jugada', () => {
    const fake = renderAuto()

    core(() => fake.ask(IDLE))
    tap(handCard('Ash Blossom'))
    const tag = screen.getByRole('button', { name: 'Invocación Normal · Ash Blossom' })

    expect(screen.queryByRole('menu')).toBeNull()
    expect(tag).toHaveTextContent('Invocación Normal')
    expect(fake.answers).toEqual([])
    fireEvent.click(tag)
    expect(fake.answers).toEqual([{ type: 'select_idlecmd', action: 0, index: 0 }])
    expect(screen.queryByRole('button', { name: 'Invocación Normal · Ash Blossom' })).toBeNull()
    expect(dispatches).toBe(0)
  })

  it('Escape suelta la etiqueta sin jugar', () => {
    const fake = renderAuto()

    core(() => fake.ask(IDLE))
    tap(handCard('Ash Blossom'))
    fireEvent.keyDown(document, { key: 'Escape' })
    expect(screen.queryByRole('button', { name: 'Invocación Normal · Ash Blossom' })).toBeNull()
    expect(fake.answers).toEqual([])
  })

  it('con varias jugadas, el menú en bloques de siempre', () => {
    const fake = renderAuto()

    core(() => fake.ask({ ...IDLE, monster_sets: [loc(100, L.HAND, 0)] }))
    tap(handCard('Ash Blossom'))
    expect(screen.getAllByRole('menuitem').map((item) => item.textContent)).toEqual(['Colocar', 'Invocación Normal'])
    expect(screen.queryByRole('button', { name: /· Ash Blossom$/ })).toBeNull()
  })
})
