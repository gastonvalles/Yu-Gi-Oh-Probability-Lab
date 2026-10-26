// @vitest-environment jsdom
import { fireEvent, screen, within } from '@testing-library/react'
import '@testing-library/jest-dom'
import { describe, expect, it } from 'vitest'

import { LOCATION as L, type CoreAsk } from '../app/auto/protocol'
import { loc, pos, stringId } from './support/auto-session-fake'
import { core, dispatches, handCard, renderAuto } from './support/auto-screen-harness'

// Las hojas y la pregunta del medio: una opción, un número, Tipos, Atributos, ordenar, sí o no, y el efecto preguntado.

/** Un texto de Nibiru, «a la mano» y «al cementerio» del sistema, y un texto que Nibiru no tiene. */
const OPTION: CoreAsk = { type: 'select_option', player: 0, options: [stringId(400, 2), '573', '574', stringId(400, 7)] }
const NUMBER: CoreAsk = { type: 'announce_number', player: 0, options: ['1', '2', '4'] }
const RACE: CoreAsk = { type: 'announce_race', player: 0, count: 2, available: String((1n << 13n) | 2n | 1n) }
const ATTRIB: CoreAsk = { type: 'announce_attrib', player: 0, count: 1, available: 0b0110010 }
const SORT: CoreAsk = { type: 'sort_card', player: 0, cards: [loc(100, L.HAND, 0), loc(900, L.HAND, 1)] }
const YESNO: CoreAsk = { type: 'select_yesno', player: 0, description: '31' }
const EFFECTYN: CoreAsk = { type: 'select_effectyn', player: 0, ...pos(400, L.GRAVE, 0, 5), description: '6400' }
const MIXED: CoreAsk = { type: 'select_card', player: 0, can_cancel: true, min: 1, max: 2, selects: [pos(400, L.GRAVE, 0, 5), pos(500, L.EXTRA, 0, 10)] }
/** Con dos cartas del deck, en el orden en que el núcleo las manda (Imperm antes que Droll), y una del Cementerio. */
const MIXED_DECK: CoreAsk = { type: 'select_card', player: 0, can_cancel: true, min: 1, max: 2, selects: [pos(102, L.DECK, 0, 8), pos(101, L.DECK, 1, 8), pos(400, L.GRAVE, 0, 5)] }

describe('auto-screen · las hojas', () => {
  it('option: una hoja con lo que hace cada opción (sin texto, «Activar efecto», nunca un número inventado) y la carta que pregunta arriba; tocar una contesta con su índice', () => {
    const fake = renderAuto()

    core(() => fake.ask(OPTION))
    const sheet = screen.getByRole('dialog', { name: 'Elegí una opción' })
    expect(sheet.parentElement!.querySelector('.animate-nav-scrim')).toBeNull()

    expect(within(sheet).getAllByRole('menuitem').map((item) => item.textContent)).toEqual(['Destroy a monster', 'A la mano', 'Al cementerio', 'Activar efecto'])
    expect(sheet).toHaveTextContent('Nibiru')
    fireEvent.click(within(sheet).getAllByRole('menuitem')[2]!)
    expect(fake.answers).toEqual([{ type: 'select_option', index: 2 }])
    expect(dispatches).toBe(0)
  })

  it('number: un botón por número', () => {
    const fake = renderAuto()

    core(() => fake.ask(NUMBER))
    const sheet = screen.getByRole('dialog', { name: 'Declará un número' })

    expect(within(sheet).getAllByRole('menuitem').map((item) => item.textContent)).toEqual(['1', '2', '4'])
    fireEvent.click(within(sheet).getByRole('menuitem', { name: '4' }))
    expect(fake.answers).toEqual([{ type: 'announce_number', index: 2 }])
  })

  it('race: se eligen dos Tipos (las pastillas) y «Declarar» contesta la máscara', () => {
    const fake = renderAuto()

    core(() => fake.ask(RACE))
    const sheet = screen.getByRole('dialog', { name: 'Declará 2 Tipos' })

    fireEvent.click(within(sheet).getByRole('button', { name: 'Dragon' }))
    fireEvent.click(within(sheet).getByRole('button', { name: 'Warrior' }))
    fireEvent.click(within(sheet).getByRole('button', { name: 'Declarar' }))
    expect(fake.answers).toEqual([{ type: 'announce_race', races: String((1n << 13n) | 1n) }])
  })

  it('attrib: un Atributo (con `count` 1 la pastilla elegida cambia) y «Declarar» contesta el bit', () => {
    const fake = renderAuto()

    core(() => fake.ask(ATTRIB))
    const sheet = screen.getByRole('dialog', { name: 'Declará 1 Atributo' })

    expect(within(sheet).getAllByRole('button', { pressed: false }).map((button) => button.textContent)).toEqual(['WATER', 'LIGHT', 'DARK'])
    fireEvent.click(within(sheet).getByRole('button', { name: 'LIGHT' }))
    fireEvent.click(within(sheet).getByRole('button', { name: 'Declarar' }))
    expect(fake.answers).toEqual([{ type: 'announce_attrib', attributes: 1 << 4 }])
  })

  it('sort: tocar las cartas en orden y «Ordenar así» contesta el orden; «Dejar como está», null', () => {
    const fake = renderAuto()

    core(() => fake.ask(SORT))
    const sheet = screen.getByRole('dialog', { name: 'Ordená las cartas' })
    const options = within(sheet).getAllByRole('option')

    fireEvent.click(options[1]!)
    fireEvent.click(options[0]!)
    fireEvent.click(within(sheet).getByRole('button', { name: 'Ordenar así' }))
    // La carta 1 va primera (posición 0) y la 0, segunda.
    expect(fake.answers).toEqual([{ type: 'sort_card', order: [1, 0] }])
    core(() => fake.ask(SORT))
    fireEvent.click(within(screen.getByRole('dialog', { name: 'Ordená las cartas' })).getByRole('button', { name: 'Dejar como está' }))
    expect(fake.answers[1]).toEqual({ type: 'sort_card', order: null })
  })

  it('yesno: la pregunta del medio sin carta, con su texto si lo tiene (si no, «¿Lo hacés?»); «Hacerlo» contesta que sí', () => {
    const fake = renderAuto()

    core(() => fake.ask(YESNO))
    const prompt = screen.getByTestId('duel-prompt-layer')

    expect(prompt).toHaveTextContent('¿Lo hacés?')
    fireEvent.click(within(prompt).getByRole('button', { name: 'Hacerlo' }))
    expect(fake.answers).toEqual([{ type: 'select_yesno', yes: true }])
    expect(dispatches).toBe(0)
    core(() => fake.ask({ ...YESNO, description: stringId(400, 1) }))
    expect(screen.getByTestId('duel-prompt-layer')).toHaveTextContent('Summon a Token')
  })

  it('effectyn: la pregunta nombra la carta, que brilla en su pila, y «No activar» contesta que no', () => {
    const fake = renderAuto()

    core(() => fake.ask(EFFECTYN))
    const prompt = screen.getByTestId('duel-prompt-layer')

    expect(prompt).toHaveTextContent('¿Activás el efecto de Nibiru?')
    expect(screen.getByRole('button', { name: 'GY: 1' })).toHaveAttribute('data-glow-kind', 'can')
    fireEvent.click(within(prompt).getByRole('button', { name: 'No activar' }))
    expect(fake.answers).toEqual([{ type: 'select_effectyn', yes: false }])
  })

  it('una lista mixta (cementerio y Extra) va en la hoja de elegir cartas, con de dónde es cada una', () => {
    const fake = renderAuto()

    core(() => fake.ask(MIXED))
    const sheet = screen.getByRole('dialog', { name: 'Elegí de 1 a 2 cartas · 0 de 2' })
    const options = within(sheet).getAllByRole('option').map((option) => option.getAttribute('aria-label'))

    expect(options).toEqual(['Nibiru, GY', 'Zeus, Extra'])
    fireEvent.click(within(sheet).getAllByRole('option')[1]!)
    fireEvent.click(within(sheet).getByRole('button', { name: 'Elegir 1 carta' }))
    expect(fake.answers).toEqual([{ type: 'select_card', indices: [1] }])
    expect(handCard('Ash Blossom')).not.toHaveAttribute('data-glow-kind', 'can')
  })

  it('las del deck de una lista mixta se muestran por nombre, no en el orden del deck, y se contesta con el índice del núcleo', () => {
    const fake = renderAuto()

    core(() => fake.ask(MIXED_DECK))
    const sheet = screen.getByRole('dialog', { name: 'Elegí de 1 a 2 cartas · 0 de 2' })
    const options = within(sheet).getAllByRole('option').map((option) => option.getAttribute('aria-label'))

    // El núcleo las manda Imperm, Droll, Nibiru: Droll (la segunda) sale primero y su respuesta sigue siendo el índice 1.
    expect(options).toEqual(['Droll, Main', 'Imperm, Main', 'Nibiru, GY'])
    fireEvent.click(within(sheet).getAllByRole('option')[0]!)
    fireEvent.click(within(sheet).getByRole('button', { name: 'Elegir 1 carta' }))
    expect(fake.answers).toEqual([{ type: 'select_card', indices: [1] }])
  })
})
