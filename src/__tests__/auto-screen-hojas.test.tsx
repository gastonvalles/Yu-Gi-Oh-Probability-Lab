// @vitest-environment jsdom
import { fireEvent, screen, within } from '@testing-library/react'
import '@testing-library/jest-dom'
import { describe, expect, it } from 'vitest'

import { LOCATION as L, type CoreAsk } from '../app/auto/protocol'
import { fakeSession, loc, pos, SPOTS, stringId } from './support/auto-session-fake'
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

  it('sort_chain: la misma hoja para los costos de un ataque (no eslabones: sin «CLn»); «Pagar así» contesta el puesto de cada uno', () => {
    const fake = renderAuto()

    core(() => fake.ask({ type: 'sort_chain', player: 0, cards: [loc(200, L.MZONE, 0), loc(400, L.GRAVE, 0)] }))
    const sheet = screen.getByRole('dialog', { name: 'Ordená los costos del ataque' })
    const options = within(sheet).getAllByRole('option')

    expect(sheet).toHaveTextContent('Tocalos en el orden en que se pagan: el 1 se paga primero.')
    expect(sheet).not.toHaveTextContent(/CL\d/)
    fireEvent.click(options[1]!)
    fireEvent.click(options[0]!)
    fireEvent.click(within(sheet).getByRole('button', { name: 'Pagar así' }))
    expect(fake.answers).toEqual([{ type: 'sort_chain', order: [1, 0] }])
  })

  it('select_counter: una fila por carta con cuántos tiene; «Sacar contadores» se enciende con el total justo y contesta cuántos de cada una', () => {
    const fake = renderAuto()

    core(() => fake.ask({ type: 'select_counter', player: 0, counter_type: 1, count: 2, cards: [{ ...loc(200, L.MZONE, 0), count: 2 }, { ...loc(700, L.MZONE, 0, 1), count: 3 }] }))
    const sheet = screen.getByRole('dialog', { name: 'Sacá 2 contadores' })
    const done = within(sheet).getByRole('button', { name: 'Sacar contadores' })
    const more = (name: string) => within(within(sheet).getByRole('group', { name: `Contadores a sacar de ${name}` })).getByRole('button', { name: 'Uno más' })

    expect(sheet).toHaveTextContent('Tiene 2')
    expect(done).toBeDisabled()
    fireEvent.click(more('Maxx C'))
    expect(done).toBeDisabled()
    fireEvent.click(within(sheet).getAllByRole('button', { name: 'Uno más' })[1]!)
    // Con el total justo, ya no se suma más en ninguna.
    expect(more('Maxx C')).toBeDisabled()
    fireEvent.click(done)
    expect(fake.answers).toEqual([{ type: 'select_counter', counters: [1, 1] }])
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

  it('effectyn: la pregunta, sin el nombre de la carta, con su lugar en la pestaña, la carta brilla en su pila y «No activar» contesta que no', () => {
    const fake = renderAuto()

    core(() => fake.ask(EFFECTYN))
    const prompt = screen.getByTestId('duel-prompt-layer')

    expect(prompt).toHaveTextContent('¿Activás el efecto?')
    expect(prompt).not.toHaveTextContent('Nibiru')
    expect(within(prompt).getByText('Cementerio')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'GY: 1' })).toHaveAttribute('data-glow-kind', 'can')
    fireEvent.click(within(prompt).getByRole('button', { name: 'No activar' }))
    expect(fake.answers).toEqual([{ type: 'select_effectyn', yes: false }])
  })

  it('un efecto que se dispara: qué pasó justo antes, sin nombres, y, a la izquierda, «Seguir en modo manual»', () => {
    const fake = renderAuto()

    core(() => {
      fake.set({ overlay: { ...fake.getSnapshot().overlay, cause: { kind: 'normal', codes: [700] } } })
      fake.ask({ ...EFFECTYN, description: '221' })
    })
    const prompt = screen.getByTestId('duel-prompt-layer')

    expect(prompt).toHaveTextContent('Tras la Invocación Normal')
    expect(prompt).not.toHaveTextContent(/Blue-Eyes|Nibiru/)
    expect(within(prompt).getAllByRole('button').map((button) => button.textContent)).toEqual(['', 'Seguir en modo manual', 'No activar', 'Activar efecto'])
  })

  it('una lista corta y mixta (cementerio y Extra) va en la banda del medio, sin velo: el título dice para qué, cada carta de dónde es, y «Cancelar» sin caja antes de la principal', () => {
    const fake = renderAuto()

    core(() => fake.ask(MIXED, '503'))
    expect(screen.queryByRole('dialog')).toBeNull()
    const band = within(screen.getByTestId('duel-prompt-layer')).getByRole('group', { name: 'Elegí de 1 a 2 cartas para desterrar · 0/2' })
    const options = within(band).getAllByRole('option').map((option) => option.getAttribute('aria-label'))

    expect(band).toHaveAttribute('data-prompt-row')
    expect(options).toEqual(['Nibiru, GY', 'Zeus, Extra'])
    expect(within(band).getAllByRole('button').map((button) => button.textContent)).toEqual(['', 'Cancelar', 'Listo'])
    fireEvent.click(within(band).getAllByRole('option')[1]!)
    expect(band).toHaveAccessibleName('Elegí de 1 a 2 cartas para desterrar · 1/2')
    expect(within(band).getAllByRole('option')[1]).toHaveAttribute('aria-selected', 'true')
    fireEvent.click(within(band).getByRole('button', { name: 'Elegir 1 carta' }))
    expect(fake.answers).toEqual([{ type: 'select_card', indices: [1] }])
    expect(handCard('Ash Blossom')).not.toHaveAttribute('data-glow-kind', 'can')
  })

  it('las del deck de una lista mixta se muestran por nombre, no en el orden del deck, y se contesta con el índice del núcleo; Escape cancela', () => {
    const fake = renderAuto()

    core(() => fake.ask(MIXED_DECK))
    const band = screen.getByRole('group', { name: 'Elegí de 1 a 2 cartas · 0/2' })
    const options = within(band).getAllByRole('option').map((option) => option.getAttribute('aria-label'))

    // El núcleo las manda Imperm, Droll, Nibiru: Droll (la segunda) sale primero y su respuesta sigue siendo el índice 1.
    expect(options).toEqual(['Droll, Main', 'Imperm, Main', 'Nibiru, GY'])
    fireEvent.click(within(band).getAllByRole('option')[0]!)
    fireEvent.click(within(band).getByRole('button', { name: 'Elegir 1 carta' }))
    expect(fake.answers).toEqual([{ type: 'select_card', indices: [1] }])
    core(() => fake.ask(MIXED_DECK))
    fireEvent.keyDown(window, { key: 'Escape' })
    expect(fake.answers[1]).toEqual({ type: 'select_card', indices: null })
  })

  it('todas del mismo lugar (el Cementerio del rival): el lugar va una vez, en la pestaña, con cuántas son', () => {
    const fake = renderAuto(fakeSession([...SPOTS, { side: 'theirs', id: 'g1', code: 700, location: L.GRAVE, sequence: 0 }, { side: 'theirs', id: 'g2', code: 701, location: L.GRAVE, sequence: 1 }]))

    core(() => fake.ask({ type: 'select_card', player: 0, can_cancel: false, min: 1, max: 1, selects: [pos(700, L.GRAVE, 0, 5, 1), pos(701, L.GRAVE, 1, 5, 1)] }, '504'))
    const band = screen.getByRole('group', { name: 'Elegí 1 carta para enviar al Cementerio' })

    expect(band).toHaveTextContent('Rival, Cementerio · 2')
    expect(within(band).getAllByRole('option').every((option) => !option.getAttribute('aria-label')!.includes(','))).toBe(true)
    // Una sola, sin poder cancelar: sin pie (sólo la flecha de minimizar); el toque contesta.
    expect(within(band).getAllByRole('button').map((button) => button.getAttribute('aria-label'))).toEqual(['Minimizar'])
    fireEvent.click(within(band).getAllByRole('option')[1]!)
    expect(fake.answers).toEqual([{ type: 'select_card', indices: [1] }])
  })

  it('con más de 6 cartas, la hoja de siempre (con el mismo título)', () => {
    const fake = renderAuto()
    const seven = Array.from({ length: 7 }, (_, i) => pos(800 + i, L.REMOVED, i, 5, 1))

    core(() => fake.ask({ type: 'select_card', player: 0, can_cancel: true, min: 1, max: 1, selects: seven }, '503'))
    expect(screen.queryByTestId('duel-prompt-layer')).toBeNull()
    const sheet = screen.getByRole('dialog', { name: 'Elegí 1 carta para desterrar' })

    expect(within(sheet).getAllByRole('option')).toHaveLength(7)
    fireEvent.click(within(sheet).getAllByRole('option')[6]!)
    expect(fake.answers).toEqual([{ type: 'select_card', indices: [6] }])
  })
})
