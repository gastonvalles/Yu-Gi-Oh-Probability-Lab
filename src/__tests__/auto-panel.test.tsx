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
  it('todas las jugadas que da el núcleo a la vista, sin «Más», «⋯» ni submenú: la principal primero, violeta y de doble ancho; cada una con su ícono', () => {
    const fake = renderAuto()

    core(() => fake.ask(IDLE))
    tap(handCard('Ash Blossom'))
    const sheet = screen.getByRole('region', { name: 'Ash Blossom' })
    const plays = within(sheet).getAllByRole('menuitem')

    expect(plays.map((play) => play.textContent)).toEqual(['Invocación Normal', 'Colocar'])
    expect(plays[0]).toHaveClass('bg-primary', 'col-span-2')
    expect(plays[1]).not.toHaveClass('bg-primary')
    expect(plays.every((play) => play.querySelector('svg'))).toBe(true)
    expect(within(sheet).queryByText(/Más|⋯/)).toBeNull()
    expect(within(sheet).getByRole('menu').firstElementChild).toHaveClass('grid-cols-5', '@min-[36rem]:grid-cols-8')
    // Esquinas rectas (los radios de los tokens en 0) y fondo al 92 % sin desenfoque.
    expect(sheet).toHaveClass('mat-square', 'bg-card-background/92')
    expect(sheet.className).not.toMatch(/backdrop-/)
    expect(fixedRadii(sheet)).toEqual([])

    fireEvent.click(plays[1]!)
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
  it('seis botones cuadrados en línea: la de ahora llena de lima, las que se pueden elegir con aro blanco y las que no, apagadas y punteadas; «Cancelar» abajo', () => {
    const fake = renderAuto()

    core(() => fake.ask(IDLE))
    fireEvent.click(phaseButton())
    const panel = screen.getByRole('dialog', { name: 'Pasar a la fase' })
    const phases = within(panel).getAllByRole('menuitem')

    expect(phases).toHaveLength(6)
    expect(phases[2]).toHaveAttribute('aria-current', 'true')
    expect(phases[3]).not.toHaveAttribute('aria-disabled')
    expect(phases[0]).toHaveAttribute('aria-disabled', 'true')
    expect(phases[0]).toHaveClass('[&[aria-disabled=true]>span:first-child]:border-dashed', '[&>span:first-child]:border-white', '[&[aria-current=true]>span:first-child]:bg-info')
    expect(fixedRadii(panel)).toEqual([])
    fireEvent.click(within(panel).getByRole('button', { name: 'Cancelar' }))
    expect(screen.queryByRole('dialog', { name: 'Pasar a la fase' })).toBeNull()
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
  })
})
