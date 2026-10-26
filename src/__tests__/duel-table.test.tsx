// @vitest-environment jsdom
import { configureStore } from '@reduxjs/toolkit'
import { render as renderBare, screen, within, type RenderResult } from '@testing-library/react'
import '@testing-library/jest-dom'
import type { ReactElement } from 'react'
import { Provider } from 'react-redux'
import { describe, expect, it } from 'vitest'

import { createMatState, replayMat, type MatAction, type MatState } from '../app/practice-mat'
import { DuelTable, type DuelSideView } from '../components/duel/DuelTable'

// `CardArt` lee el formato del deck del store (para el aviso de límite): acá, uno mínimo.
const store = configureStore({ reducer: { settings: (state = { handSize: 5, deckFormat: 'unlimited' as const }) => state } })
const render = (ui: ReactElement): RenderResult => renderBare(<Provider store={store}>{ui}</Provider>)

const main = Array.from({ length: 12 }, (_, index) => `card-${1000 + index}-1`)
const extra = ['card-9001-1', 'card-9002-1']
const start = createMatState(main, extra, 5)

const play = (...actions: MatAction[]): MatState => replayMat(start, actions)

/** Un lado de la mesa: el arte de cada carta es su propio id (así se ve cuál se dibujó) salvo las que `secret` oculta. */
const side = (state: MatState, secret: string[] = [], handCount?: number): DuelSideView => ({
  state,
  artOf: (id) => (secret.includes(id) ? null : `https://images.ygoprodeck.com/images/cards_small/${id.replace(/\D/g, '')}.jpg`),
  handCount,
})

const grid = () => screen.getByRole('group', { name: 'Mesa del duelo' })
const zone = (name: string) => screen.getByRole('group', { name })
const images = (element: HTMLElement) => within(element).queryAllByRole('img')

describe('la mesa del duelo', () => {
  it('el campo del rival va espejado: su zona 1 queda a la derecha, su Main a la izquierda y su Extra a la derecha', () => {
    render(<DuelTable mine={side(start)} theirs={side(start)} />)

    const rows = grid().style.getPropertyValue('--areas')
    expect(rows).toContain("'tdeck ts5 ts4 ts3 ts2 ts1 textra'")
    expect(rows).toContain("'tgy tm5 tm4 tm3 tm2 tm1 tfld'")
    expect(rows).toContain("'fld m1 m2 m3 m4 m5 gy'")
    expect(rows).toContain("'extra s1 s2 s3 s4 s5 deck'")

    // La zona 1 del rival y la mía no son la misma área, y cada una lleva su nombre.
    expect(zone('Rival, Zona de monstruo 1').style.gridArea).toBe('tm1')
    expect(zone('Zona de monstruo 1').style.gridArea).toBe('m1')
  })

  it('en un celular en vertical (menos de 640 px) son cinco columnas y una fila de pilas por jugador: el Extra y el Deck en los extremos y la Zona de campo en el medio, y la del rival espejada', () => {
    render(<DuelTable mine={side(start)} theirs={side(start)} />)

    const compact = grid().style.getPropertyValue('--areas-compact')

    // La del rival arriba (Deck a la izquierda y Extra a la derecha: espejada) y la mía abajo (Extra a la izquierda y Deck a la derecha).
    expect(compact).toBe(
      ["'tdeck tgy tfld tban textra'", "'ts5 ts4 ts3 ts2 ts1'", "'tm5 tm4 tm3 tm2 tm1'", "'p1 emz1 p2 emz2 p3'", "'m1 m2 m3 m4 m5'", "'s1 s2 s3 s4 s5'", "'extra ban fld gy deck'"].join(' '),
    )
    // Las cinco columnas del centro, y las áreas de siempre en escritorio (son clases: cada una con su medio).
    expect(grid()).toHaveClass('max-sm:grid-cols-[repeat(5,minmax(0,1fr))]', 'max-sm:[grid-template-areas:var(--areas-compact)]', '[grid-template-areas:var(--areas)]')
    // Sólo un campo: la fila del medio y la de pilas de ese lado.
    expect(zone('Zona de monstruo 1')).toBeInTheDocument()
  })

  it('una pila del rival lleva la mira si adentro hay una carta marcada como objetivo, o si el otro la marcó entera, y el aro cuando algo suyo destella ahí', () => {
    const id = 'card-1000-1'
    const theirs = play({ type: 'move', id, to: 'gy' }, { type: 'target', id })
    const { rerender: rerenderBare } = render(<DuelTable mine={side(start)} theirs={side(theirs)} />)
    const rerender = (ui: ReactElement) => rerenderBare(<Provider store={store}>{ui}</Provider>)

    expect(document.querySelector('[data-rival-drop="gy"]')).toHaveAttribute('data-targeted', 'true')
    expect(document.querySelector('[data-rival-drop="banished"]')).toHaveAttribute('data-targeted', 'false')

    rerender(<DuelTable mine={side(start)} theirs={{ ...side(start), marks: { cards: [], piles: ['banished'] }, flash: { id: 'card-1001-1', key: 1, kind: 'activate' } }} />)
    expect(document.querySelector('[data-rival-drop="banished"]')).toHaveAttribute('data-targeted', 'true')
    expect(document.querySelector('[data-rival-drop="gy"]')).toHaveAttribute('data-targeted', 'false')

    // Algo de adentro de la pila destella (se mandó ahí o se activó ahí): la pila lleva el aro.
    const flashing = play({ type: 'move', id: 'card-1001-1', to: 'gy' })
    rerender(<DuelTable mine={side(start)} theirs={{ ...side(flashing), flash: { id: 'card-1001-1', key: 1, kind: 'activate' } }} />)
    expect(document.querySelector('[data-rival-drop="gy"]')).toHaveAttribute('data-flash', 'true')
    expect(document.querySelector('[data-rival-drop="banished"]')).toHaveAttribute('data-flash', 'false')
  })

  it('una pila del rival muestra la carta marcada como objetivo aunque no sea la de arriba, con la mira encima', () => {
    // Dos cartas en el cementerio del rival: la de arriba es la última que llegó; la marcada es la de abajo.
    const theirs = play({ type: 'move', id: 'card-1000-1', to: 'gy' }, { type: 'move', id: 'card-1001-1', to: 'gy' }, { type: 'target', id: 'card-1000-1' })
    render(<DuelTable mine={side(start)} theirs={side(theirs)} />)

    const gy = screen.getByRole('group', { name: 'GY: 2' })
    expect(images(gy)[0]!.getAttribute('src')).toContain('10001.jpg')
    expect(gy.querySelector('[data-fx="target"]')).not.toBeNull()
  })

  it('las cartas del rival miran hacia él (de cabeza) y las propias hacia vos, con los contadores derechos', () => {
    const placed = (id: string) => play({ type: 'place', id, zone: 'mz', index: 0, pos: 'atk', how: 'normal' }, { type: 'counter', id, delta: 2 })
    const theirs = replayMat(placed('card-1000-1'), [{ type: 'move', id: 'card-1001-1', to: 'gy' }])

    render(<DuelTable mine={side(placed('card-1002-1'))} theirs={side(theirs)} />)

    const art = (zoneName: string) => zone(zoneName).querySelector('[data-rival-card-id], [data-card-id]')!.firstElementChild as HTMLElement

    expect(art('Rival, Zona de monstruo 1')).toHaveClass('rotate-180')
    expect(art('Zona de monstruo 1')).not.toHaveClass('rotate-180')
    // El contador no gira con la carta.
    expect(art('Rival, Zona de monstruo 1').parentElement!.querySelector('span.bg-warning-solid')).not.toHaveClass('rotate-180')
    // La carta de arriba de su cementerio, también.
    expect(document.querySelector('[data-rival-drop="gy"] .rotate-180')).not.toBeNull()
  })

  it('las Zonas Extra son de los dos: la de la izquierda de uno es la de la derecha del otro', () => {
    const mine = play({ type: 'place', id: 'card-9001-1', zone: 'emz', index: 0, pos: 'atk' })
    const theirs = play({ type: 'place', id: 'card-9002-1', zone: 'emz', index: 0, pos: 'atk' })
    render(<DuelTable mine={side(mine)} theirs={side(theirs)} />)

    // Mi zona extra 1 es la de la izquierda (emz1); la 1 del rival, vista desde acá, es la de la derecha (emz2).
    expect(images(zone('Zona extra de monstruo 1'))).toHaveLength(1)
    expect(images(zone('Zona extra de monstruo 1'))[0]!.getAttribute('src')).toContain('9001')
    expect(zone('Zona extra de monstruo 1').style.gridArea).toBe('emz1')
    expect(images(zone('Zona extra de monstruo 2'))[0]!.getAttribute('src')).toContain('9002')
    expect(zone('Zona extra de monstruo 2').style.gridArea).toBe('emz2')
  })

  it('si los dos ocupan la misma Zona Extra, se ve la propia y un aviso', () => {
    const mine = play({ type: 'place', id: 'card-9001-1', zone: 'emz', index: 0, pos: 'atk' })
    // La zona 2 del rival (índice 1) es, vista desde acá, la de la izquierda: la misma que la mía.
    const theirs = play({ type: 'place', id: 'card-9002-1', zone: 'emz', index: 1, pos: 'atk' })
    render(<DuelTable mine={side(mine)} theirs={side(theirs)} />)

    const shared = zone('Zona extra de monstruo 1: la ocupan los dos')
    expect(within(shared).getByText('!')).toBeInTheDocument()
    expect(images(shared)[0]!.getAttribute('src')).toContain('9001')
  })

  it('del rival se ve de dorso lo que está boca abajo o no se sabe cuál es; lo propio boca abajo se ve atenuado', () => {
    const cards = play(
      { type: 'place', id: 'card-1000-1', zone: 'mz', index: 0, pos: 'atk' },
      { type: 'place', id: 'card-1001-1', zone: 'mz', index: 1, pos: 'set' },
      { type: 'place', id: 'card-1002-1', zone: 'mz', index: 2, pos: 'atk' },
    )
    render(<DuelTable mine={side(cards)} theirs={side(cards, ['card-1002-1'])} />)

    expect(images(zone('Rival, Zona de monstruo 1'))).toHaveLength(1)
    expect(images(zone('Rival, Zona de monstruo 2'))).toHaveLength(0)
    expect(images(zone('Rival, Zona de monstruo 3'))).toHaveLength(0)

    // La propia boca abajo: se ve su imagen, atenuada.
    const mineFaceDown = zone('Zona de monstruo 2')
    expect(images(mineFaceDown)).toHaveLength(1)
    expect(mineFaceDown.querySelector('.brightness-\\[0\\.4\\]')).not.toBeNull()
  })

  it('las cartas acostadas (defensa o boca abajo) en una zona de monstruo giran; las de pie y las de magia y trampa, no', () => {
    const cards = play(
      { type: 'place', id: 'card-1000-1', zone: 'mz', index: 0, pos: 'def' },
      { type: 'place', id: 'card-1001-1', zone: 'mz', index: 1, pos: 'atk' },
      { type: 'place', id: 'card-1002-1', zone: 'st', index: 1, pos: 'set' },
    )
    render(<DuelTable mine={side(cards)} theirs={side(start)} />)

    const rotated = (name: string) => zone(name).querySelector('[data-card-id]')?.className.includes('rotate(90deg)')
    expect(rotated('Zona de monstruo 1')).toBe(true)
    expect(rotated('Zona de monstruo 2')).toBe(false)
    expect(rotated('Zona de magia y trampa 2')).toBe(false)
  })

  it('el Xyz del rival muestra sus materiales: la pila de dorso detrás, de media vuelta como su carta, y el contador derecho', () => {
    const xyz = (pos: 'atk' | 'def') =>
      play({ type: 'place', id: 'card-9001-1', zone: 'mz', index: 0, pos }, { type: 'attach', id: 'card-1000-1', to: 'card-9001-1' }, { type: 'attach', id: 'card-1001-1', to: 'card-9001-1' })
    const { rerender: rerenderBare } = render(<DuelTable mine={side(start)} theirs={side(xyz('atk'))} />)
    const rerender = (ui: ReactElement) => rerenderBare(<Provider store={store}>{ui}</Provider>)
    const rival = () => zone('Rival, Zona de monstruo 1')

    const stack = rival().querySelector<HTMLElement>('[data-material-stack]')!
    expect(stack.children).toHaveLength(2)
    expect(stack).toHaveClass('[transform:rotate(180deg)]', 'pointer-events-none')
    expect(stack).toHaveAttribute('aria-hidden', 'true')
    // Sólo la carta lleva el id que buscan la espada y los vuelos; la pila va antes (detrás).
    expect(rival().querySelectorAll('[data-rival-card-id]')).toHaveLength(1)
    expect(stack.nextElementSibling).toHaveAttribute('data-rival-card-id', 'card-9001-1')
    const ring = within(rival()).getByRole('img', { name: '2 materiales' })
    expect(ring.parentElement).not.toHaveClass('rotate-180')
    expect(ring.parentElement).not.toHaveClass('-rotate-90')

    // En defensa: la pila gira con su carta (acostada y de cabeza); el número, al revés que la carta, queda derecho.
    rerender(<DuelTable mine={side(start)} theirs={side(xyz('def'))} />)
    expect(rival().querySelector('[data-material-stack]')).toHaveClass('[transform:rotate(270deg)]')
    expect(within(rival()).getByRole('img', { name: '2 materiales' }).parentElement).toHaveClass('-rotate-90')

    // Sin materiales, nada.
    rerender(<DuelTable mine={side(start)} theirs={side(play({ type: 'place', id: 'card-9001-1', zone: 'mz', index: 0, pos: 'atk' }))} />)
    expect(rival().querySelector('[data-material-stack]')).toBeNull()
    expect(within(rival()).queryByRole('img', { name: /material/ })).not.toBeInTheDocument()
  })

  it('cada carta lleva el id con el que la busca la espada de un ataque: la propia por el suyo y la del rival por el que él le dio', () => {
    const mine = play({ type: 'place', id: 'card-1000-1', zone: 'mz', index: 0, pos: 'atk' })
    // El id que le dio el rival a su carta (en un duelo es opaco: `c3`) es el que lleva la zona; acá, como el resto de la prueba, uno de las cartas armadas.
    const theirs = play({ type: 'place', id: 'card-1001-1', zone: 'mz', index: 2, pos: 'atk' })
    render(<DuelTable mine={side(mine)} theirs={side(theirs, ['card-1001-1'])} />)

    expect(zone('Zona de monstruo 1').querySelector('[data-card-id="card-1000-1"]')).not.toBeNull()
    expect(zone('Zona de monstruo 1').querySelector('[data-rival-card-id]')).toBeNull()
    expect(zone('Rival, Zona de monstruo 3').querySelector('[data-rival-card-id="card-1001-1"]')).not.toBeNull()
    expect(zone('Rival, Zona de monstruo 3').querySelector('[data-card-id]')).toBeNull()
  })

  it('pasar el mouse por una carta del campo, propia o del rival, la eleva un poco y enciende su borde en blanco, tenue (el borde sale de --card-shadow, así un destaque de color no lo pisa)', () => {
    const mine = play({ type: 'place', id: 'card-1000-1', zone: 'mz', index: 0, pos: 'atk' })
    const theirs = play({ type: 'place', id: 'card-1001-1', zone: 'mz', index: 2, pos: 'atk' })
    render(<DuelTable mine={side(mine)} theirs={side(theirs)} />)

    for (const card of [zone('Zona de monstruo 1').querySelector('[data-card-id]'), zone('Rival, Zona de monstruo 3').querySelector('[data-rival-card-id]')]) {
      // Sube lo justo (2 px, un poco más grande) y por delante de las vecinas.
      expect(card).toHaveClass('hover:-translate-y-0.5', 'hover:scale-105', 'hover:z-10')
      // El borde: un aro blanco al 60 % y un resplandor tenue, con la sombra que se agranda y baja.
      expect(card!.className).toContain('hover:[--card-shadow:0_10px_20px_rgba(0,0,0,0.5),0_0_0_1px_rgb(255_255_255/0.6),0_0_12px_rgb(255_255_255/0.2)]')
      expect(card).toHaveClass('[box-shadow:var(--card-shadow)]')
      // Sin movimiento (preferencia del sistema) la carta no se mueve y queda sólo el borde.
      expect(card).toHaveClass('motion-reduce:hover:translate-y-0', 'motion-reduce:hover:scale-100')
      // Se mueve con `translate` y `scale` (no con `transform`: el de la rotación de una carta en defensa y los vuelos siguen igual), y lo anima.
      expect(card!.className).toContain('translate_var(--motion-duration)')
    }
  })

  it('las pilas muestran su cantidad, con la carta de arriba en el cementerio y el dorso en el Banish boca abajo', () => {
    const cards = play(
      { type: 'move', id: 'card-1000-1', to: 'gy' },
      { type: 'move', id: 'card-1001-1', to: 'banished', faceDown: true },
    )
    render(<DuelTable mine={side(cards)} theirs={side(start)} />)

    expect(images(zone('GY: 1'))[0]!.getAttribute('src')).toContain('1000')
    expect(images(zone('Banish: 1'))).toHaveLength(0)
    // Las pilas de cada lado: 12 cartas con la mano de 5 dejan 7 en el Main; el Extra, 2 (la mía y la del rival).
    expect(screen.getAllByRole('group', { name: 'Main: 7' })).toHaveLength(2)
    expect(screen.getAllByRole('group', { name: 'Extra: 2' })).toHaveLength(2)
  })

  it('la mano del rival se ve sólo como cantidad, de dorso', () => {
    render(<DuelTable mine={side(start)} theirs={side(start, [], 5)} />)

    const hand = screen.getByRole('img', { name: 'Mano del rival: 5' })

    expect(hand.children).toHaveLength(5)
    // Va dentro de una columna que scrollea: sin `shrink-0` la columna la aplastaba a 0 px y sólo se veían sus sombras (en jsdom no hay layout, así que se cuida la clase).
    expect(hand.parentElement).toHaveClass('shrink-0')
  })

  it('se puede mostrar un solo campo: el propio o el del rival, con las Zonas Extra en el medio', () => {
    const { rerender } = render(<DuelTable mine={side(start)} theirs={side(start)} show="mine" />)

    const areas = () => grid().style.getPropertyValue('--areas')
    const compact = () => grid().style.getPropertyValue('--areas-compact')

    expect(areas()).not.toContain('tgy')
    expect(areas()).toContain("'. p1 emz1 p2 emz2 p3 ban'")
    // En un celular en vertical (cinco columnas) también: sin las filas del rival, y la fila del medio sin sus pilas.
    expect(compact()).not.toContain('tgy')
    expect(compact()).toBe(["'p1 emz1 p2 emz2 p3'", "'m1 m2 m3 m4 m5'", "'s1 s2 s3 s4 s5'", "'extra ban fld gy deck'"].join(' '))
    expect(screen.queryByRole('group', { name: 'Rival, Zona de monstruo 1' })).toBeNull()

    rerender(<DuelTable mine={side(start)} theirs={side(start)} show="theirs" />)
    expect(areas()).not.toContain("'fld")
    expect(areas()).toContain("'tban p1 emz1 p2 emz2 p3 .'")
    expect(compact()).not.toContain("'fld")
    expect(compact()).toBe(["'tdeck tgy tfld tban textra'", "'ts5 ts4 ts3 ts2 ts1'", "'tm5 tm4 tm3 tm2 tm1'", "'p1 emz1 p2 emz2 p3'"].join(' '))
    expect(screen.queryByRole('group', { name: 'Zona de monstruo 1' })).toBeNull()
    expect(screen.getByRole('group', { name: 'Rival, Zona de monstruo 1' })).toBeInTheDocument()
  })

  describe('el arte de una magia de campo boca arriba, de fondo de la mitad de quien la tiene', () => {
    const field = (id: string, pos: 'atk' | 'set') => play({ type: 'place', id, zone: 'field', index: 0, pos })
    const arts = () => Array.from(document.querySelectorAll<HTMLElement>('.mat-field-art'))

    it('la mía en mis filas y la del rival en las suyas, por las líneas de la grilla, y derecha para los dos (sus cartas giran, el fondo no); la mesa es su propio contexto', () => {
      render(<DuelTable mine={side(field('card-1003-1', 'atk'))} theirs={side(field('card-1004-1', 'atk'))} />)

      const [theirs, mine] = arts()

      expect(mine).toHaveAttribute('data-side', 'mine')
      expect(mine).toHaveAttribute('aria-hidden', 'true')
      expect(mine!.style.gridArea).toBe('m1-start / extra-start / extra-end / deck-end')
      expect(mine!.querySelector('img')).toHaveAttribute('src', '/api/card-image/cards_cropped/10031.jpg?w=512')
      expect(theirs).toHaveAttribute('data-side', 'theirs')
      expect(theirs!.style.gridArea).toBe('tdeck-start / tdeck-start / tm1-end / textra-end')
      expect(theirs!.querySelector('img')).toHaveAttribute('src', '/api/card-image/cards_cropped/10041.jpg?w=512')
      expect(document.querySelectorAll('.mat-field-art.rotate-180, .mat-field-art .rotate-180')).toHaveLength(0)
      // Sin `isolate`, el `-z-9` del fondo lo mandaba detrás de la pantalla del espectador.
      expect(grid()).toHaveClass('isolate')
    })

    it('sin fondo si la carta está boca abajo, o si es del rival y no la mostró', () => {
      render(<DuelTable mine={side(field('card-1003-1', 'set'))} theirs={side(field('card-1004-1', 'atk'), ['card-1004-1'])} />)

      expect(arts()).toHaveLength(0)
    })
  })

  it('las fases del turno se ven en la tira del medio y se enciende la del que juega', () => {
    const mine = play({ type: 'phase', phase: 'battle' })
    const theirs = play({ type: 'phase', phase: 'main2' })
    const { rerender } = render(<DuelTable mine={side(mine)} theirs={side(theirs)} turn="mine" />)

    expect(screen.getByLabelText('Fase actual: Battle Phase')).toBeInTheDocument()

    rerender(<DuelTable mine={side(mine)} theirs={side(theirs)} turn="theirs" />)
    expect(screen.getByLabelText('Fase actual: Main Phase 2')).toBeInTheDocument()
  })
})
