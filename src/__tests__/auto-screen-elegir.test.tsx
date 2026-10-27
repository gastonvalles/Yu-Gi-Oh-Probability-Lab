// @vitest-environment jsdom
import { fireEvent, screen, within } from '@testing-library/react'
import '@testing-library/jest-dom'
import { describe, expect, it } from 'vitest'

import { LOCATION as L, type CoreAsk } from '../app/auto/protocol'
import { loc, pos } from './support/auto-session-fake'
import { core, dispatches, handCard, renderAuto, status } from './support/auto-screen-harness'
import { tap } from './support/practice-mat-harness'

// Elegir en la mesa: cartas (con tope, soltar, Sacrificios, una suma), casillas y la posición.

const CARD: CoreAsk = { type: 'select_card', player: 0, can_cancel: true, min: 1, max: 2, selects: [pos(100, L.HAND, 0, 10), pos(200, L.MZONE, 0, 1), pos(700, L.MZONE, 0, 1, 1)] }
const ONE: CoreAsk = { ...CARD, min: 1, max: 1 }
const UNSELECT: CoreAsk = { type: 'select_unselect_card', player: 0, can_finish: true, can_cancel: false, min: 1, max: 3, select_cards: [pos(100, L.HAND, 0, 10)], unselect_cards: [pos(200, L.MZONE, 0, 1)] }
const TRIBUTE: CoreAsk = { type: 'select_tribute', player: 0, can_cancel: false, min: 1, max: 1, selects: [{ ...loc(200, L.MZONE, 0), release_param: 1 }] }
const SUM: CoreAsk = { type: 'select_sum', player: 0, select_max: 0, amount: 4, min: 1, max: 2, selects_must: [], selects: [{ ...loc(200, L.MZONE, 0), amount: 4 }, { ...loc(100, L.HAND, 0), amount: 3 }] }
/** Libres: mi mz 1 y mi mz 2 (los bits 1 y 2 en 0). */
const PLACE: CoreAsk = { type: 'select_place', player: 0, count: 1, field_mask: ~0b110 >>> 0 }
const POSITION: CoreAsk = { type: 'select_position', player: 0, code: 100, positions: 1 | 4 }
const SEARCH: CoreAsk = { type: 'select_card', player: 0, can_cancel: false, min: 1, max: 1, selects: [pos(101, L.DECK, 1, 10), pos(102, L.DECK, 0, 10)] }
/** Una suma entre el cementerio y la mano: no cabe en el campo ni en una pila → la hoja aparte. */
const SUM_LIST: CoreAsk = { ...SUM, selects: [{ ...loc(400, L.GRAVE, 0), amount: 4 }, { ...loc(100, L.HAND, 0), amount: 3 }] } as CoreAsk
const UNSELECT_LIST: CoreAsk = { ...UNSELECT, select_cards: [pos(100, L.HAND, 0, 10), pos(400, L.GRAVE, 0, 5)], unselect_cards: [] } as CoreAsk

describe('auto-screen · elegir', () => {
  it('select_card: las candidatas brillan, el estado cuenta, tocar una la elige y «Listo» contesta con los índices', () => {
    const fake = renderAuto()

    core(() => fake.ask(CARD))
    expect(handCard('Ash Blossom')).toHaveAttribute('data-glow-kind', 'can')
    expect(status()).toHaveTextContent('Elegí de 1 a 2 cartas · 0/2')
    tap(handCard('Ash Blossom'))
    expect(status()).toHaveTextContent('· 1/2')
    fireEvent.click(within(status()).getByRole('button', { name: 'Listo' }))
    expect(fake.answers).toEqual([{ type: 'select_card', indices: [0] }])
    expect(dispatches).toBe(0)
  })

  it('select_card con una sola: el primer toque contesta; «Cancelar» (si se puede) contesta null', () => {
    const fake = renderAuto()

    core(() => fake.ask(ONE))
    fireEvent.click(within(status()).getByRole('button', { name: 'Cancelar' }))
    expect(fake.answers).toEqual([{ type: 'select_card', indices: null }])
    core(() => fake.ask(ONE))
    tap(screen.getByRole('button', { name: 'Maxx C' }))
    expect(fake.answers[1]).toEqual({ type: 'select_card', indices: [1] })
  })

  it('select_card: una carta del rival se elige tocándola en su campo', () => {
    const fake = renderAuto()

    core(() => fake.ask(ONE))
    fireEvent.click(screen.getByRole('button', { name: 'Rival, Zona de monstruo 1: marcar' }))
    expect(fake.answers).toEqual([{ type: 'select_card', indices: [2] }])
  })

  it('select_card en el campo: cada monstruo que se elige lleva su ATK/DEF de ahora debajo y en su nombre; fuera de la pregunta, ninguno', () => {
    const fake = renderAuto()
    const tags = () => [...document.querySelectorAll('[data-pick-stat]')].map((tag) => tag.textContent).sort()

    core(() => fake.set({ overlay: { ...fake.getSnapshot().overlay, stats: { mine: { 'card-200-1': { attack: 1900, defense: 1000, level: 4 } }, theirs: { c1: { attack: 3500, defense: 2500, level: 8 } } } } }))
    expect(tags()).toEqual([])
    expect(screen.getByRole('button', { name: 'Maxx C' })).toBeInTheDocument()
    core(() => fake.ask(CARD))
    // La mano (Ash Blossom) también se elige, pero no está en el campo: sin etiqueta.
    expect(tags()).toEqual(['1900 / 1000', '3500 / 2500'])
    expect(screen.getByRole('button', { name: 'Maxx C, ATK 1900, DEF 1000, elegible' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Rival, Zona de monstruo 1, ATK 3500, DEF 2500, elegible: marcar' })).toBeInTheDocument()
    tap(screen.getByRole('button', { name: /^Maxx C, ATK/ }))
    expect(screen.getByRole('button', { name: 'Maxx C, ATK 1900, DEF 1000, elegible (Elegida)' })).toBeInTheDocument()
    fireEvent.click(within(status()).getByRole('button', { name: 'Listo' }))
    expect(fake.answers).toEqual([{ type: 'select_card', indices: [1] }])
    expect(tags()).toEqual([])
  })

  it('unselect: la ya elegida lleva «Elegida», tocar una la suma o la suelta de a una, y «Listo» termina', () => {
    const fake = renderAuto()

    core(() => fake.ask(UNSELECT))
    expect(screen.getByRole('button', { name: /^Maxx C.*Elegida/ })).toBeInTheDocument()
    tap(handCard('Ash Blossom'))
    expect(fake.answers).toEqual([{ type: 'select_unselect_card', index: 0 }])
    core(() => fake.ask(UNSELECT))
    fireEvent.click(within(status()).getByRole('button', { name: 'Listo' }))
    expect(fake.answers[1]).toEqual({ type: 'select_unselect_card', index: null })
  })

  it('tribute: el rótulo cuenta los Sacrificios y el único vale contesta al toque', () => {
    const fake = renderAuto()

    core(() => fake.ask(TRIBUTE))
    expect(status()).toHaveTextContent('Sacrificios: 0 de 1')
    tap(screen.getByRole('button', { name: 'Maxx C' }))
    expect(fake.answers).toEqual([{ type: 'select_tribute', indices: [0] }])
  })

  it('sum: sólo se ofrece lo que todavía suma; la que completa contesta sola', () => {
    const fake = renderAuto()

    core(() => fake.ask(SUM))
    expect(status()).toHaveTextContent('Niveles: 0 de 4')
    // 3 + nada no llega a 4 exacto y 3 + 4 se pasa: la de 3 no se ofrece.
    expect(handCard('Ash Blossom')).not.toHaveAttribute('data-glow-kind', 'can')
    tap(screen.getByRole('button', { name: 'Maxx C' }))
    expect(fake.answers).toEqual([{ type: 'select_sum', indices: [0] }])
  })

  it('place: las casillas libres se encienden y tocar una contesta con su lugar', () => {
    const fake = renderAuto()

    core(() => fake.ask(PLACE))
    expect(status()).toHaveTextContent('Elegí 1 casilla')
    expect(screen.queryByRole('button', { name: 'Zona de monstruo 1: elegir' })).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: 'Zona de monstruo 3: elegir' }))
    expect(fake.answers).toEqual([{ type: 'select_place', places: [{ player: 0, location: L.MZONE, sequence: 2 }] }])
    expect(dispatches).toBe(0)
  })

  it('place y disfield con casillas del rival: se encienden en su campo (su Zona Extra, en la tuya de enfrente) y tocar una contesta con su lado', () => {
    const fake = renderAuto()

    // Libres sólo del rival: su mz 1 (bit 17) y su Zona Extra 0 (bit 21), que desde acá es tu Zona Extra 2.
    core(() => fake.ask({ type: 'select_place', player: 0, count: 1, field_mask: ~((1 << 17) | (1 << 21)) >>> 0 }))
    expect(screen.queryByRole('button', { name: 'Zona de monstruo 2: elegir' })).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: 'Zona extra de monstruo 2: elegir' }))
    expect(fake.answers).toEqual([{ type: 'select_place', places: [{ player: 1, location: L.MZONE, sequence: 5 }] }])
    core(() => fake.ask({ type: 'select_place', player: 0, count: 1, field_mask: ~((1 << 17) | (1 << 21)) >>> 0 }))
    fireEvent.click(screen.getByRole('button', { name: 'Rival, Zona de monstruo 2: elegir' }))
    expect(fake.answers[1]).toEqual({ type: 'select_place', places: [{ player: 1, location: L.MZONE, sequence: 1 }] })

    // Inutilizar: tu mz 2 (bit 1) y la Mágica y Trampa 1 del rival (bit 24); el estado dice para qué.
    core(() => fake.ask({ type: 'select_disfield', player: 0, count: 1, field_mask: ~((1 << 1) | (1 << 24)) >>> 0 }))
    expect(status()).toHaveTextContent('Elegí 1 casilla que no se va a poder usar')
    expect(screen.getByRole('button', { name: 'Zona de monstruo 2: elegir' })).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Rival, Zona de magia y trampa 1: elegir' }))
    expect(fake.answers[2]).toEqual({ type: 'select_disfield', places: [{ player: 1, location: L.SZONE, sequence: 0 }] })
    expect(dispatches).toBe(0)
  })

  it('position: la hoja ofrece sólo las posiciones permitidas y una contesta', () => {
    const fake = renderAuto()

    core(() => fake.ask(POSITION))
    const sheet = screen.getByRole('dialog', { name: 'Elegí la posición' })

    expect(within(sheet).getAllByRole('menuitem').map((item) => item.textContent)).toEqual(['En ataque', 'En defensa'])
    fireEvent.click(within(sheet).getByRole('menuitem', { name: 'En defensa' }))
    expect(fake.answers).toEqual([{ type: 'select_position', position: 4 }])
  })

  it('una suma en una lista corta (la banda): la cuenta la lleva el núcleo (lo que no suma va apagado) y la que completa contesta sola', () => {
    const fake = renderAuto()

    core(() => fake.ask(SUM_LIST))
    const sheet = screen.getByRole('group', { name: /Niveles/ })
    const ash = within(sheet).getByRole('option', { name: /Ash Blossom/ })

    expect(ash).toHaveAttribute('aria-disabled', 'true')
    fireEvent.click(ash)
    expect(fake.answers).toEqual([])
    fireEvent.click(within(sheet).getByRole('option', { name: /Nibiru/ }))
    expect(fake.answers).toEqual([{ type: 'select_sum', indices: [0] }])
    expect(dispatches).toBe(0)
  })

  it('unselect en una lista corta (la banda), de a una: tocar contesta, y con `can_finish` hay «Listo»', () => {
    const fake = renderAuto()

    core(() => fake.ask(UNSELECT_LIST))
    const sheet = screen.getByRole('group', { name: /Elegí/ })

    fireEvent.click(within(sheet).getByRole('button', { name: 'Listo' }))
    expect(fake.answers).toEqual([{ type: 'select_unselect_card', index: null }])
    core(() => fake.ask(UNSELECT_LIST))
    fireEvent.click(within(screen.getByRole('group', { name: /Elegí/ })).getByRole('option', { name: /Nibiru/ }))
    expect(fake.answers[1]).toEqual({ type: 'select_unselect_card', index: 1 })
  })

  it('unselect de 1 a 2 para agregar a tu mano: el núcleo vuelve a preguntar tras cada toque y es la misma banda (el mismo nodo: no sale ni vuelve a entrar, las cartas no se corren); otra decisión, otra banda', () => {
    const fake = renderAuto()
    const first: CoreAsk = { type: 'select_unselect_card', player: 0, can_finish: false, can_cancel: true, min: 1, max: 2, select_cards: [pos(100, L.HAND, 0, 10), pos(400, L.GRAVE, 0, 5)], unselect_cards: [] }

    core(() => fake.ask(first, '506'))
    const band = screen.getByRole('group', { name: 'Elegí de 1 a 2 cartas para agregar a tu mano · 0/2' })
    const order = within(band).getAllByRole('option')
    const nibiru = within(band).getByRole('option', { name: /Nibiru/ })

    fireEvent.click(nibiru)
    expect(fake.answers).toEqual([{ type: 'select_unselect_card', index: 1 }])
    // Mientras el núcleo vuelve a preguntar, sigue la misma (quieta).
    expect(screen.getByRole('group', { name: 'Elegí de 1 a 2 cartas para agregar a tu mano · 0/2' })).toBe(band)
    core(() => fake.ask({ ...first, can_finish: true, select_cards: [first.select_cards[0]!], unselect_cards: [first.select_cards[1]!] }, '506'))
    const again = screen.getByRole('group', { name: 'Elegí de 1 a 2 cartas para agregar a tu mano · 1/2' })

    expect(again).toBe(band)
    expect(within(again).getAllByRole('option')).toEqual(order)
    expect(nibiru).toHaveAttribute('aria-selected', 'true')
    expect(nibiru.querySelector('[data-fx="frame"]')).not.toBeNull()
    fireEvent.click(within(again).getByRole('button', { name: 'Elegir 1 carta' }))
    expect(fake.answers[1]).toEqual({ type: 'select_unselect_card', index: null })

    core(() => fake.ask(UNSELECT_LIST))
    expect(screen.getByRole('group', { name: /de 1 a 3/ })).not.toBe(band)
  })

  it('unselect: si tras elegir quedan todas en el deck (el núcleo saca las que ya no valen), sigue la misma banda y no se pasa al visor del deck', () => {
    const fake = renderAuto()
    const first: CoreAsk = { type: 'select_unselect_card', player: 0, can_finish: false, can_cancel: true, min: 1, max: 2, select_cards: [pos(101, L.DECK, 1, 10), pos(102, L.DECK, 0, 10), pos(400, L.GRAVE, 0, 5)], unselect_cards: [] }

    core(() => fake.ask(first, '506'))
    const band = screen.getByRole('group', { name: /agregar a tu mano · 0\/2$/ })

    fireEvent.click(within(band).getByRole('option', { name: /Droll/ }))
    core(() => fake.ask({ ...first, can_finish: true, select_cards: [first.select_cards[1]!], unselect_cards: [first.select_cards[0]!] }, '506'))
    expect(screen.getByRole('group', { name: /agregar a tu mano · 1\/2$/ })).toBe(band)
    expect(screen.queryByRole('dialog', { name: /^Main/ })).toBeNull()
  })

  it('buscar en el deck: el visor muestra sólo las candidatas y tocar una contesta', () => {
    const fake = renderAuto()

    core(() => fake.ask(SEARCH))
    const viewer = screen.getByRole('dialog', { name: /^Main/ })
    const shown = within(viewer).getAllByRole('button').map((button) => button.textContent ?? '')

    // Sólo las dos candidatas (con la inicial de su ficha delante); ninguna de las demás cartas.
    expect(shown.filter((text) => /Droll|Imperm|Ash|Maxx|Nibiru/.test(text))).toEqual(['DDroll', 'IImperm'])
    fireEvent.click(within(viewer).getByRole('button', { name: /Imperm/ }))
    expect(fake.answers).toEqual([{ type: 'select_card', indices: [1] }])
    expect(dispatches).toBe(0)
  })

  it('declarar una carta: pocas, en la banda (el toque la declara); muchas, en la hoja con un buscador por nombre', () => {
    const fake = renderAuto()
    const announce = (cards: number[]): CoreAsk => ({ type: 'announce_card', player: 0, opcodes: ['1073741840'], cards })

    core(() => fake.ask(announce([400, 100])))
    const band = screen.getByRole('group', { name: 'Declará el nombre de una carta' })

    // Por nombre: Ash Blossom antes que Nibiru.
    expect(within(band).getAllByRole('option').map((option) => option.getAttribute('aria-label'))).toEqual(['Ash Blossom', 'Nibiru'])
    fireEvent.click(within(band).getByRole('option', { name: 'Nibiru' }))
    expect(fake.answers).toEqual([{ type: 'announce_card', code: 400 }])

    core(() => fake.ask(announce([100, 101, 102, 200, 400, ...Array.from({ length: 9 }, (_, i) => 5000 + i)])))
    const sheet = screen.getByRole('dialog', { name: 'Declará el nombre de una carta' })

    fireEvent.change(within(sheet).getByRole('searchbox', { name: 'Buscar por nombre' }), { target: { value: 'nib' } })
    expect(within(sheet).getAllByRole('option').map((option) => option.getAttribute('aria-label'))).toEqual(['Nibiru'])
    fireEvent.change(within(sheet).getByRole('searchbox', { name: 'Buscar por nombre' }), { target: { value: 'zzz' } })
    expect(within(sheet).getByText('No hay cartas con «zzz».')).toBeInTheDocument()
    fireEvent.change(within(sheet).getByRole('searchbox', { name: 'Buscar por nombre' }), { target: { value: 'droll' } })
    fireEvent.click(within(sheet).getByRole('option', { name: 'Droll' }))
    expect(fake.answers[1]).toEqual({ type: 'announce_card', code: 101 })
    expect(dispatches).toBe(0)
  })
})
