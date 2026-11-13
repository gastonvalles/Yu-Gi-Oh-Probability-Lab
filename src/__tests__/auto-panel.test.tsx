// @vitest-environment jsdom
import { cleanup, fireEvent, screen, within } from '@testing-library/react'
import '@testing-library/jest-dom'
import { describe, expect, it } from 'vitest'

import { LOCATION as L, type CoreAsk } from '../app/auto/protocol'
import { CardPicker, PickBand } from '../components/auto/CardPicker'
import { act, loc, stringId } from './support/auto-session-fake'
import { core, handCard, phaseButton, renderAuto } from './support/auto-screen-harness'
import { Harness, hand, render, tap } from './support/practice-mat-harness'

/**
 * La familia de carteles del duelo automático (`AutoPanel`): la ficha de una carta con todas sus jugadas, las fases y las preguntas. Y la frontera (Gastón, 2026-11-10: «no apliques el nuevo diseño de
 * menús al modo manual»): con `duel.auto` aparece la familia nueva y no `CardSheet`; sin `duel.auto`, al revés.
 */
const IDLE: CoreAsk = {
  type: 'select_idlecmd',
  player: 0,
  summons: [loc(100, L.HAND, 0)],
  special_summons: [],
  pos_changes: [],
  monster_sets: [loc(100, L.HAND, 0)],
  spell_sets: [],
  activates: [act(400, L.GRAVE, 0, stringId(400, 1)), act(400, L.GRAVE, 0, stringId(400, 2))],
  to_bp: true,
  to_ep: true,
  shuffle: false,
}

/** Las clases de radio que `mat-square` no apaga (no salen de un token): ninguna en la familia. */
const fixedRadii = (root: Element) => [root, ...root.querySelectorAll('*')].flatMap((element) => [...element.classList].filter((name) => /(^|:)rounded-(full|\[)/.test(name)))

describe('la frontera entre la mesa manual y el duelo automático', () => {
  it('con `duel.auto`, tocar una carta abre la ficha de la familia nueva (no la hoja de la manual, sin «Al deck» ni submenús)', () => {
    const fake = renderAuto()

    core(() => fake.ask(IDLE))
    tap(handCard('Ash Blossom'))
    const sheet = screen.getByRole('region', { name: 'Ash Blossom' })

    expect(sheet).toHaveAttribute('data-auto-panel', 'docked')
    // Apoyada en el borde: 8 px bajo los botones más el área segura, en una sola clase (dos `pb-*` se pisaban y la fila quedaba al ras).
    expect(sheet).toHaveClass('pb-[calc(0.5rem+env(safe-area-inset-bottom,0px))]')
    expect(sheet.className).not.toMatch(/(^|\s)pb-(2|\[env)/)
    expect(within(sheet).queryByRole('menuitem', { name: /Al deck|Revelar|Más/ })).toBeNull()
  })

  it('sin `duel.auto`, tocar una carta abre la hoja de la mesa manual (`CardSheet`, con «Al deck») y nada de la familia nueva', () => {
    cleanup()
    render(<Harness />)
    tap(within(hand()).getByRole('listitem', { name: 'Ash Blossom' }))
    const sheet = screen.getByRole('region', { name: 'Ash Blossom' })

    expect(sheet).not.toHaveAttribute('data-auto-panel')
    expect(within(sheet).getByRole('menuitem', { name: 'Al deck' })).toBeInTheDocument()
    expect(document.querySelector('[data-auto-panel]')).toBeNull()
  })
})

describe('la ficha de una carta en el automático', () => {
  it('M-01: todas las jugadas que da el núcleo a la vista, sin «Más», «⋯» ni submenú, de a dos por fila en un renglón y sin ícono: la principal al final, rellena; el tipo, en un chip de su color', () => {
    const fake = renderAuto()

    core(() => fake.ask(IDLE))
    tap(handCard('Ash Blossom'))
    const sheet = screen.getByRole('region', { name: 'Ash Blossom' })
    const plays = within(sheet).getAllByRole('menuitem')

    expect(plays.map((play) => play.textContent)).toEqual(['Colocar', 'Invocación Normal'])
    expect(plays[1]).toHaveClass('bg-primary', 'whitespace-nowrap')
    expect(plays[0]).not.toHaveClass('bg-primary')
    expect(plays.some((play) => play.querySelector('svg'))).toBe(false)
    expect(within(sheet).queryByText(/Más|⋯/)).toBeNull()
    expect(within(sheet).getByRole('menu').firstElementChild).toHaveClass('grid-cols-2')
    // Ni «Mano» ni la fase ni el turno: ya la tocaste ahí (cada dato, una vez); sin flecha de bajar.
    expect(sheet).not.toHaveTextContent(/Mano|Phase|Turno/)
    expect(sheet.querySelector('[data-panel-fold], [data-prompt-turn]')).toBeNull()
    // Esquinas rectas (los radios de los tokens en 0) y fondo al 92 % sin desenfoque.
    expect(sheet).toHaveClass('mat-square', 'bg-card-background')
    expect(sheet.className).not.toMatch(/backdrop-/)
    expect(fixedRadii(sheet)).toEqual([])

    // El tipo, en un chip del color de su marco (lámina T).
    expect(sheet.querySelector('[data-type-chip]')!.className).toMatch(/bg-frame-/)

    fireEvent.click(plays[0]!)
    expect(fake.answers).toEqual([{ type: 'select_idlecmd', action: 3, index: 0 }])
    expect(screen.queryByRole('region', { name: 'Ash Blossom' })).toBeNull()
  })

  it('Escape y la X la cierran sin contestar', () => {
    const fake = renderAuto()

    core(() => fake.ask(IDLE))
    tap(handCard('Ash Blossom'))
    fireEvent.keyDown(window, { key: 'Escape' })
    expect(screen.queryByRole('region', { name: 'Ash Blossom' })).toBeNull()
    tap(handCard('Ash Blossom'))
    fireEvent.click(within(screen.getByRole('region', { name: 'Ash Blossom' })).getByRole('button', { name: 'Cerrar' }))
    expect(screen.queryByRole('region', { name: 'Ash Blossom' })).toBeNull()
    expect(fake.answers).toEqual([])
  })
})

describe('las fases del automático', () => {
  it('las seis fases en una línea pegada al botón (la de `PhaseRow`, la del manual): la de ahora marcada, las que no se pueden apagadas; Escape la cierra', () => {
    const fake = renderAuto()

    core(() => fake.ask(IDLE))
    fireEvent.click(phaseButton())
    const menu = screen.getByRole('menu', { name: 'Pasar a la fase' })
    const phases = within(menu).getAllByRole('menuitem')

    expect(phases.map((phase) => phase.getAttribute('aria-label'))).toEqual(['Draw Phase · Todavía no', 'Standby Phase · Todavía no', 'Fase actual: Main Phase 1', 'Ir a Battle Phase', 'Main Phase 2 · Todavía no', 'Ir a End Phase'])
    expect(phases[2]).toHaveAttribute('aria-current', 'true')
    expect(phases[0]).toHaveAttribute('aria-disabled', 'true')
    expect(document.querySelector('[data-phase-row]')!.parentElement).toHaveClass('mat-square')
    expect(fixedRadii(document.querySelector('[data-phase-row]')!.parentElement!)).toEqual([])
    fireEvent.keyDown(window, { key: 'Escape' })
    expect(screen.queryByRole('menu', { name: 'Pasar a la fase' })).toBeNull()
    fireEvent.click(phaseButton())
    fireEvent.click(screen.getByRole('menuitem', { name: 'Ir a Battle Phase' }))
    expect(fake.answers).toEqual([{ type: 'select_idlecmd', action: 6, index: null }])
  })
})

describe('los carteles: el contador sólo con un total mayor que 1', () => {
  const CARDS = [
    { key: 'a', name: 'Fallen of Albaz', art: null },
    { key: 'b', name: 'Branded Fusion', art: null },
  ]

  it('eligiendo una sola carta no hay «1/1» ni «0 de 1»; con dos, «1 de 2»', () => {
    render(<CardPicker title="Elegí 1 carta" cards={CARDS} min={1} max={1} onPick={() => {}} onCancel={() => {}} />)
    expect(screen.getByRole('dialog')).not.toHaveTextContent(/\d\s*(\/|de)\s*1\b/)
    cleanup()

    render(<PickBand title="Elegí 1 carta" cards={CARDS} chosen={['a']} eligible={new Set(['a', 'b'])} multi={false} done onToggle={() => {}} onPick={() => {}} />)
    expect(screen.getByRole('group')).not.toHaveTextContent(/\d\s*(\/|de)\s*1\b/)
    cleanup()

    render(<CardPicker title="Elegí 2 cartas" cards={CARDS} min={2} max={2} onPick={() => {}} />)
    fireEvent.click(screen.getByRole('option', { name: 'Fallen of Albaz' }))
    expect(screen.getByRole('status')).toHaveTextContent('1 de 2')
    // El contador, a la derecha del título (no en la fila de los botones).
    expect(screen.getByRole('status').closest('[data-panel-body]')).toBeNull()
    expect(screen.getByRole('status').parentElement?.querySelector('h2')).not.toBeNull()
  })
})
