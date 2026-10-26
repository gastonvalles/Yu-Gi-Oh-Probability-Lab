// @vitest-environment jsdom
import { fireEvent, screen, within } from '@testing-library/react'
import '@testing-library/jest-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { LOCATION as L, type CoreAsk } from '../app/auto/protocol'
import { HOLD_MS } from '../app/use-mat-drag'
import { STEP_MS } from '../components/auto/AutoSoloScreen'
import { act, fakeSession, loc, pos, SPOTS, stringId } from './support/auto-session-fake'
import { core, dispatches, hand, handCard, inHand, lane, phaseButton, renderAuto, status } from './support/auto-screen-harness'
import { pointer, tap, zone } from './support/practice-mat-harness'

// Las jugadas del turno en «Jugar solo automático»: cada pregunta del núcleo se contesta tocando la mesa de siempre, un gesto por prueba, y la mesa nunca despacha (0 del centinela).

const IDLE: CoreAsk = {
  type: 'select_idlecmd',
  player: 0,
  summons: [loc(100, L.HAND, 0)],
  special_summons: [loc(500, L.EXTRA, 0)],
  pos_changes: [loc(200, L.MZONE, 0)],
  monster_sets: [loc(100, L.HAND, 0)],
  spell_sets: [loc(900, L.HAND, 1)],
  activates: [act(900, L.HAND, 1), act(400, L.GRAVE, 0, stringId(400, 1)), act(400, L.GRAVE, 0, stringId(400, 2))],
  to_bp: true,
  to_ep: true,
  shuffle: false,
}
const BATTLE: CoreAsk = { type: 'select_battlecmd', player: 0, chains: [], attacks: [{ ...loc(200, L.MZONE, 0), can_direct: false }], to_m2: true, to_ep: true }
const CHAIN: CoreAsk = { type: 'select_chain', player: 0, spe_count: 1, forced: false, hint_timing: 0, hint_timing_other: 0, selects: [{ ...pos(900, L.HAND, 1, 10), description: '0', client_mode: 0 }] }

describe('auto-screen · las jugadas', () => {
  it('idle: tocar una carta de la mano abre sus jugadas legales y «Invocación Normal» contesta', () => {
    const fake = renderAuto()

    core(() => fake.ask(IDLE))
    tap(handCard('Ash Blossom'))
    const items = screen.getAllByRole('menuitem').map((item) => item.textContent)

    expect(items).toEqual(['Invocación Normal', 'Colocar'])
    fireEvent.click(screen.getByRole('menuitem', { name: 'Invocación Normal' }))
    expect(fake.answers).toEqual([{ type: 'select_idlecmd', action: 0, index: 0 }])
    expect(screen.queryByRole('menuitem')).toBeNull()
    expect(dispatches).toBe(0)
  })

  it('idle: una carta con dos efectos pregunta cuál (el segundo paso) y elegir uno contesta con su índice', () => {
    const fake = renderAuto()

    core(() => fake.ask(IDLE))
    fireEvent.click(screen.getByRole('button', { name: 'GY: 1' }))
    fireEvent.click(screen.getByRole('button', { name: /^Nibiru/ }))
    fireEvent.click(screen.getByRole('menuitem', { name: /Activar efecto/ }))
    const sheet = screen.getByRole('dialog', { name: 'Activar efecto' })
    const effects = within(sheet).getAllByRole('menuitem')

    // Cada efecto dice qué hace: su rótulo del `.cdb` (`strN`, el que nombra el `desc`), sin un «Efecto n» que no es el de la carta.
    expect(effects.map((effect) => effect.textContent)).toEqual(['Summon a Token', 'Destroy a monster'])
    // Como la lista de efectos de la mesa manual: la carta arriba y un efecto por fila, a la izquierda (aunque los textos sean cortos).
    expect(sheet).toHaveTextContent('Nibiru')
    expect(effects[0]).toHaveClass('text-left')
    fireEvent.click(effects[1]!)
    expect(fake.answers).toEqual([{ type: 'select_idlecmd', action: 5, index: 2 }])
    expect(dispatches).toBe(0)
  })

  it('idle: brilla sólo lo que se activa; lo que sólo se invoca, se coloca o cambia de posición no brilla y se toca igual', () => {
    const fake = renderAuto()

    core(() => fake.ask(IDLE))
    expect(handCard('Called by the Grave')).toHaveAttribute('data-glow-kind', 'respond')
    expect(screen.getByRole('button', { name: 'GY: 1' })).toHaveAttribute('data-respond', 'true')
    expect(handCard('Ash Blossom')).toHaveAttribute('data-glow', 'false')
    expect(screen.getByRole('button', { name: 'Maxx C' })).toHaveAttribute('data-glow', 'false')
    tap(handCard('Ash Blossom'))
    expect(screen.getAllByRole('menuitem').map((item) => item.textContent)).toEqual(['Invocación Normal', 'Colocar'])
  })

  it('idle: una Mágica de la mano dice «Activar» (y «Colocar»)', () => {
    const fake = renderAuto()

    core(() => fake.ask(IDLE))
    tap(handCard('Called by the Grave'))
    expect(screen.getAllByRole('menuitem').map((item) => item.textContent)).toEqual(['Activar', 'Colocar'])
    fireEvent.click(screen.getByRole('menuitem', { name: 'Activar' }))
    expect(fake.answers).toEqual([{ type: 'select_idlecmd', action: 5, index: 0 }])
  })

  it('fases: el botón de la fase ofrece las que el núcleo deja (las demás, apagadas) y «Battle Phase» contesta', () => {
    const fake = renderAuto()

    core(() => fake.ask(IDLE))
    expect(phaseButton()).toBeEnabled()
    fireEvent.click(phaseButton())
    const items = screen.getAllByRole('menuitem')

    expect(items).toHaveLength(6)
    expect(items[0]).toHaveTextContent('Draw PhaseTodavía no')
    expect(items[0]).toHaveAttribute('aria-disabled', 'true')
    expect(items[2]).toHaveAttribute('aria-current', 'true')
    expect(items[3]).toHaveTextContent('Battle Phase')
    expect(items[3]).not.toHaveAttribute('aria-disabled')
    fireEvent.click(items[3]!)
    expect(fake.answers).toEqual([{ type: 'select_idlecmd', action: 6, index: null }])
    expect(dispatches).toBe(0)
  })

  it('terminar el turno: «End Phase» desde el botón de la fase contesta `to_ep` (el núcleo pasa el turno solo)', () => {
    const fake = renderAuto()

    core(() => fake.ask(IDLE))
    fireEvent.click(phaseButton())
    fireEvent.click(screen.getByRole('menuitem', { name: 'End Phase' }))
    expect(fake.answers).toEqual([{ type: 'select_idlecmd', action: 7, index: null }])
    // Sin pregunta, el botón de la fase se apaga: no hay nada que contestar.
    expect(phaseButton()).toBeDisabled()
  })

  it('battle: «Atacar» en el monstruo del campo contesta y las fases ofrecen Main Phase 2 y End Phase', () => {
    const fake = renderAuto()

    core(() => fake.ask(BATTLE))
    fireEvent.click(phaseButton())
    expect(screen.getByRole('menuitem', { name: 'Main Phase 2' })).not.toHaveAttribute('aria-disabled')
    expect(screen.getByRole('menuitem', { name: /^Draw Phase/ })).toHaveAttribute('aria-disabled', 'true')
    fireEvent.keyDown(window, { key: 'Escape' })
    // Lo que sólo puede atacar no brilla.
    expect(screen.getByRole('button', { name: 'Maxx C' })).toHaveAttribute('data-glow', 'false')
    tap(screen.getByRole('button', { name: 'Maxx C' }))
    fireEvent.click(screen.getByRole('menuitem', { name: 'Atacar' }))
    expect(fake.answers).toEqual([{ type: 'select_battlecmd', action: 1, index: 0 }])
    expect(dispatches).toBe(0)
  })

  it('cadena: la carta que puede responder brilla, el medio de la mesa ofrece sólo «No responder» (la línea queda libre) y contesta null', () => {
    const fake = renderAuto()

    core(() => fake.ask(CHAIN))
    expect(handCard('Called by the Grave')).toHaveAttribute('data-glow-kind', 'respond')
    expect(lane()).toBeNull()
    const prompt = within(screen.getByTestId('duel-prompt-layer'))

    expect(prompt.getByRole('status')).toHaveTextContent('Podés activar Called by the Grave ahora')
    expect(prompt.getAllByRole('button').map((button) => button.textContent)).toEqual(['No responder'])
    fireEvent.click(prompt.getByRole('button', { name: 'No responder' }))
    expect(fake.answers).toEqual([{ type: 'select_chain', index: null }])
  })

  it('cadena con un eslabón: el medio dice a qué respondés, con su carta chica a la izquierda, en una sola fila con «No responder»', () => {
    const fake = renderAuto()
    const overlay = fake.getSnapshot().overlay

    core(() => fake.set({ overlay: { ...overlay, chain: [{ card: { side: 'mine', id: 'card-200-1' }, code: 200, description: '0', state: 'chained' }] } }))
    core(() => fake.ask(CHAIN))
    const prompt = screen.getByTestId('duel-prompt-layer').querySelector<HTMLElement>('[data-prompt="ask"]')!

    expect(prompt).toHaveTextContent('Podés responder a Maxx C con Called by the Grave')
    expect(within(prompt).getByRole('img', { name: 'Maxx C' })).toBeInTheDocument()
    expect(prompt.className).toContain('flex')
  })

  it('cadena obligatoria: sin «No responder», la línea dice que hay que activarla; tocar la carta y «Activar» contesta', () => {
    const fake = renderAuto()

    core(() => fake.ask({ ...CHAIN, forced: true }))
    expect(lane()).toHaveTextContent('Tenés que activar Called by the Grave: tocala')
    expect(within(lane()!).queryByRole('button')).toBeNull()
    tap(handCard('Called by the Grave'))
    fireEvent.click(screen.getByRole('menuitem', { name: 'Activar' }))
    expect(fake.answers).toEqual([{ type: 'select_chain', index: 0 }])
  })

  it('cadena sin nada que responda de verdad a este momento (`spe_count` 0): «Preguntar» contesta «No responder» sola, sin mostrar nada', () => {
    const fake = renderAuto()

    core(() => fake.ask({ ...CHAIN, spe_count: 0 }))
    expect(fake.answers).toEqual([{ type: 'select_chain', index: null }])
    expect(lane()).toBeNull()
    expect(handCard('Called by the Grave')).not.toHaveAttribute('data-glow-kind', 'respond')
  })

  it('cadena: tocar la carta que responde y «Activar» contesta con su índice', () => {
    const fake = renderAuto()

    core(() => fake.ask(CHAIN))
    tap(handCard('Called by the Grave'))
    fireEvent.click(screen.getByRole('menuitem', { name: 'Activar' }))
    expect(fake.answers).toEqual([{ type: 'select_chain', index: 0 }])
  })

  it('una carta sin jugada legal abre su hoja sin jugadas (lo dice y «Ver carta» la muestra)', () => {
    const fake = renderAuto()

    core(() => fake.ask(CHAIN))
    tap(handCard('Ash Blossom'))
    const sheet = screen.getByRole('region', { name: 'Ash Blossom' })

    expect(within(sheet).queryByRole('menuitem')).toBeNull()
    expect(sheet).toHaveTextContent('No hay nada para hacer desde acá.')
    fireEvent.click(within(sheet).getByRole('button', { name: 'Ver carta' }))
    expect(screen.getByRole('dialog', { name: 'Detalle de Ash Blossom' })).toBeInTheDocument()
    expect(status()).toBeInTheDocument()
    expect(fake.answers).toEqual([])
    expect(dispatches).toBe(0)
  })

  it('el deck se mira por nombre (no en su orden: Imperm está arriba) y cerrarlo no baraja ni despacha', () => {
    const fake = renderAuto(fakeSession(SPOTS.map((spot) => (spot.id === 'card-101-1' ? { ...spot, sequence: 0 } : spot.id === 'card-102-1' ? { ...spot, sequence: 1 } : spot))))

    core(() => fake.ask(CHAIN))
    expect(screen.getByRole('button', { name: 'Main: 2' })).toHaveAttribute('title', 'Main Deck · Tocá: ver las cartas que quedan, por nombre')
    tap(screen.getByRole('button', { name: 'Main: 2' }))
    const viewer = screen.getByRole('dialog', { name: 'Main · 2' })

    expect(viewer).toHaveTextContent('Por nombre, no en el orden del deck')
    expect(within(viewer).getByRole('list')).toHaveTextContent(/Droll.*Imperm/)
    fireEvent.click(within(viewer).getByRole('button', { name: 'Cerrar' }))
    expect(screen.queryByRole('dialog', { name: 'Main · 2' })).toBeNull()
    expect(fake.answers).toEqual([])
    expect(dispatches).toBe(0)
  })

  it('Enter en el deck abre el visor (no un menú vacío) y una carta suya sin jugada abre su hoja con «Ver carta»', () => {
    const fake = renderAuto()

    core(() => fake.ask(CHAIN))
    fireEvent.keyDown(screen.getByRole('button', { name: 'Main: 2' }), { key: 'Enter' })
    expect(screen.queryByRole('menu')).toBeNull()
    fireEvent.click(within(screen.getByRole('dialog', { name: 'Main · 2' })).getByRole('button', { name: /^Droll/ }))
    fireEvent.click(within(screen.getByRole('region', { name: 'Droll' })).getByRole('button', { name: 'Ver carta' }))
    expect(screen.getByRole('dialog', { name: 'Detalle de Droll' })).toBeInTheDocument()
    expect(dispatches).toBe(0)
  })

  it('una carta del rival que no se elige se muestra grande (sin el detalle fijo de la izquierda)', () => {
    const fake = renderAuto()

    core(() => fake.ask(IDLE))
    fireEvent.click(screen.getByRole('button', { name: 'Rival, Zona de monstruo 1: marcar' }))
    // El texto llega de YGOPRODeck (acá no hay): mientras tanto, «Carta del rival».
    expect(screen.getByRole('dialog', { name: 'Detalle de Carta del rival' })).toBeInTheDocument()
    expect(fake.answers).toEqual([])
  })

  it('Escape es «No responder» en una cadena (no en la obligatoria ni en la ventana de una fase tuya) y cancela lo que se elige en la mesa', () => {
    const fake = renderAuto()

    core(() => fake.ask({ ...CHAIN, forced: true }))
    fireEvent.keyDown(window, { key: 'Escape' })
    // En tu Draw Phase con una Rápida, pasar es cambiar de fase: eso va por el botón de fases.
    core(() => fake.ask({ ...CHAIN, spe_count: 0, hint_timing: 0x1 }))
    expect(handCard('Called by the Grave')).toHaveAttribute('data-glow-kind', 'respond')
    fireEvent.keyDown(window, { key: 'Escape' })
    expect(fake.answers).toEqual([])
    core(() => fake.ask(CHAIN))
    fireEvent.keyDown(window, { key: 'Escape' })
    expect(fake.answers).toEqual([{ type: 'select_chain', index: null }])
    core(() => fake.ask({ type: 'select_card', player: 0, can_cancel: true, min: 1, max: 1, selects: [pos(100, L.HAND, 0, 10), pos(200, L.MZONE, 0, 1)] }))
    fireEvent.keyDown(window, { key: 'Escape' })
    expect(fake.answers[1]).toEqual({ type: 'select_card', indices: null })
    expect(dispatches).toBe(0)
  })

  it('una carta del campo no se arrastra: moverla no la levanta ni enciende zonas, y soltarla no hace nada', () => {
    const fake = renderAuto()

    core(() => fake.ask(IDLE))
    const maxx = screen.getByRole('button', { name: 'Maxx C' })
    const mz2 = screen.getByRole('group', { name: 'Zona de monstruo 2' })

    expect(maxx).toHaveAttribute('data-still', 'true')
    document.elementFromPoint = () => mz2
    fireEvent.pointerDown(maxx, { ...pointer, clientX: 10, clientY: 10 })
    fireEvent.pointerMove(maxx, { ...pointer, clientX: 40, clientY: 60 })
    fireEvent.pointerMove(maxx, { ...pointer, clientX: 80, clientY: 120 })
    expect(maxx).toHaveAttribute('data-dragging', 'false')
    expect(mz2).toHaveAttribute('data-over', 'false')
    fireEvent.pointerUp(maxx, { ...pointer, clientX: 80, clientY: 120 })
    expect(screen.queryByRole('menuitem')).toBeNull()
    expect(fake.answers).toEqual([])
    expect(dispatches).toBe(0)
  })
})

describe('auto-screen · soltar una carta de la mano en una casilla', () => {
  /** Arrastra una carta de la mano hasta una casilla (la que devuelven `elementFromPoint` y `elementsFromPoint`) y la suelta. */
  const dragToZone = (name: string, target: HTMLElement) => {
    document.elementFromPoint = () => target
    document.elementsFromPoint = () => [target]
    const dragged = handCard(name)

    fireEvent.pointerDown(dragged, { ...pointer, clientX: 10, clientY: 10 })
    fireEvent.pointerMove(dragged, { ...pointer, clientX: 40, clientY: 60 })
    fireEvent.pointerMove(dragged, { ...pointer, clientX: 80, clientY: 120 })
    fireEvent.pointerUp(dragged, { ...pointer, clientX: 80, clientY: 120 })
  }
  const waitingIn = (target: HTMLElement) => target.querySelector('[data-pending="true"]')
  /** La pregunta de una casilla: libres, mi mz 1 a 4 y mis cinco de abajo (la mz 0 la ocupa Maxx C). */
  const PLACE: CoreAsk = { type: 'select_place', player: 0, count: 1, field_mask: ~(0b11110 | (0b11111 << 8)) >>> 0 }
  const placed = (location: number, sequence: number) => ({ type: 'select_place', places: [{ player: 0, location, sequence }] })

  it('un monstruo soltado en una casilla libre se queda ahí, el menú ofrece lo que lo saca ahí y, elegido, la casilla contesta sola la pregunta del núcleo; mientras piensa, sigue ahí', () => {
    const fake = renderAuto()

    core(() => fake.ask(IDLE))
    dragToZone('Ash Blossom', zone('Zona de monstruo 2'))
    expect(waitingIn(zone('Zona de monstruo 2'))).toHaveAttribute('data-card-id', 'card-100-1')
    expect(inHand('Ash Blossom')).toBeNull()
    const sheet = screen.getByRole('region', { name: 'Ash Blossom' })

    // Con el nombre de la casilla arriba, como en la mesa manual.
    expect(sheet).toHaveTextContent('Zona de monstruo 2')
    expect(within(sheet).getAllByRole('menuitem').map((item) => item.textContent)).toEqual(['Invocación Normal', 'Colocar'])
    fireEvent.click(within(sheet).getByRole('menuitem', { name: 'Invocación Normal' }))
    expect(fake.answers).toEqual([{ type: 'select_idlecmd', action: 0, index: 0 }])
    core(() => fake.thinking())
    expect(waitingIn(zone('Zona de monstruo 2'))).not.toBeNull()
    expect(inHand('Ash Blossom')).toBeNull()
    // La casilla la contesta la soltada (la mz 2 es la secuencia 1), sin encender ninguna.
    core(() => fake.ask(PLACE))
    expect(fake.answers[1]).toEqual(placed(L.MZONE, 1))
    expect(screen.queryByRole('button', { name: /: elegir$/ })).toBeNull()
    expect(waitingIn(zone('Zona de monstruo 2'))).not.toBeNull()
    // El núcleo la cuenta y pregunta lo que sigue (tus jugadas del turno) de una vez: la mesa lo muestra a su ritmo y, hasta que la carta cae, sigue en la casilla.
    core(() => {
      fake.events([{ type: 'place', id: 'card-100-1', zone: 'mz', index: 1, pos: 'atk' }])
      fake.ask(IDLE)
    })
    expect(waitingIn(zone('Zona de monstruo 2'))).not.toBeNull()
    expect(inHand('Ash Blossom')).toBeNull()
    core(() => void vi.advanceTimersByTime(STEP_MS + 5))
    expect(waitingIn(zone('Zona de monstruo 2'))).toBeNull()
    expect(within(zone('Zona de monstruo 2')).getByRole('button', { name: 'Ash Blossom' })).toBeInTheDocument()
    expect(dispatches).toBe(0)
  })

  it('soltada donde no tiene jugada (abajo un monstruo, arriba una Mágica, una ocupada, la Zona Extra, la de campo) vuelve a la mano sin menú; una Mágica abajo ofrece Activar o Colocar', () => {
    const fake = renderAuto()

    core(() => fake.ask(IDLE))
    for (const [card, place] of [
      ['Ash Blossom', 'Zona de magia y trampa 1'],
      ['Called by the Grave', 'Zona de monstruo 2'],
      ['Ash Blossom', 'Zona de monstruo 1'],
      ['Ash Blossom', 'Zona extra de monstruo 1'],
      ['Called by the Grave', 'Zona de campo'],
    ] as const) {
      dragToZone(card, zone(place))
      expect(inHand(card)).not.toBeNull()
      expect(waitingIn(zone(place))).toBeNull()
      expect(screen.queryByRole('menuitem')).toBeNull()
    }
    dragToZone('Called by the Grave', zone('Zona de magia y trampa 3'))
    expect(waitingIn(zone('Zona de magia y trampa 3'))).toHaveAttribute('data-card-id', 'card-900-1')
    expect(screen.getAllByRole('menuitem').map((item) => item.textContent)).toEqual(['Activar', 'Colocar'])
    fireEvent.click(screen.getByRole('menuitem', { name: 'Colocar' }))
    core(() => fake.ask(PLACE))
    expect(fake.answers).toEqual([{ type: 'select_idlecmd', action: 4, index: 0 }, placed(L.SZONE, 2)])
    expect(dispatches).toBe(0)
  })

  it('una Rápida soltada en una cadena: con una sola jugada se activa sin menú y su casilla es la soltada', () => {
    const fake = renderAuto()

    core(() => fake.ask(CHAIN))
    dragToZone('Called by the Grave', zone('Zona de magia y trampa 2'))
    expect(screen.queryByRole('menuitem')).toBeNull()
    expect(fake.answers).toEqual([{ type: 'select_chain', index: 0 }])
    expect(waitingIn(zone('Zona de magia y trampa 2'))).not.toBeNull()
    core(() => fake.ask(PLACE))
    expect(fake.answers[1]).toEqual(placed(L.SZONE, 1))
  })

  it('si la casilla soltada no se puede usar, se pregunta como siempre y la carta vuelve a la mano; cancelar los Sacrificios también la devuelve', () => {
    const fake = renderAuto()

    core(() => fake.ask(IDLE))
    dragToZone('Ash Blossom', zone('Zona de monstruo 2'))
    fireEvent.click(screen.getByRole('menuitem', { name: 'Invocación Normal' }))
    // La máscara no da la mz 2 (libres: la 3, la 4 y la 5).
    core(() => fake.ask({ ...PLACE, field_mask: ~0b11100 >>> 0 }))
    expect(fake.answers).toHaveLength(1)
    expect(waitingIn(zone('Zona de monstruo 2'))).toBeNull()
    expect(inHand('Ash Blossom')).not.toBeNull()
    fireEvent.click(screen.getByRole('button', { name: 'Zona de monstruo 4: elegir' }))
    expect(fake.answers[1]).toEqual(placed(L.MZONE, 3))

    // Con Sacrificios la carta espera en la casilla; cancelarlos (el núcleo vuelve a tus jugadas) la devuelve a la mano.
    core(() => fake.ask(IDLE))
    dragToZone('Ash Blossom', zone('Zona de monstruo 3'))
    fireEvent.click(screen.getByRole('menuitem', { name: 'Invocación Normal' }))
    core(() => fake.ask({ type: 'select_tribute', player: 0, can_cancel: true, min: 1, max: 1, selects: [{ ...loc(200, L.MZONE, 0), release_param: 1 }] }))
    expect(waitingIn(zone('Zona de monstruo 3'))).not.toBeNull()
    fireEvent.keyDown(window, { key: 'Escape' })
    expect(fake.answers.at(-1)).toEqual({ type: 'select_tribute', indices: null })
    core(() => fake.ask(IDLE))
    expect(waitingIn(zone('Zona de monstruo 3'))).toBeNull()
    expect(inHand('Ash Blossom')).not.toBeNull()
    expect(dispatches).toBe(0)
  })

  it('si a mitad del arrastre la mano se reordena (React mueve la carta y el navegador le saca el puntero), el arrastre sigue y la carta cae donde se suelta', () => {
    const fake = renderAuto()

    core(() => fake.ask(IDLE))
    // Cada movimiento en su cuadro (el del arnés devuelve 1 y la mano se queda esperando el siguiente).
    window.requestAnimationFrame = (callback) => {
      callback(0)
      return 0
    }
    const mz2 = zone('Zona de monstruo 2')
    const dragged = handCard('Ash Blossom')

    // Por encima de la vecina: la mano se reordena y la carta cambia de lugar en el DOM.
    document.elementsFromPoint = () => [handCard('Called by the Grave')]
    fireEvent.pointerDown(dragged, { ...pointer, clientX: 10, clientY: 10 })
    fireEvent.pointerMove(dragged, { ...pointer, clientX: 400, clientY: 12 })
    expect(within(hand()).getAllByRole('listitem').map((card) => card.getAttribute('aria-label'))).toEqual(['Called by the Grave', 'Ash Blossom'])
    fireEvent.lostPointerCapture(dragged, { pointerId: 1 })
    document.elementFromPoint = () => mz2
    document.elementsFromPoint = () => [mz2]
    fireEvent.pointerMove(dragged, { ...pointer, clientX: 80, clientY: 120 })
    fireEvent.pointerUp(dragged, { ...pointer, clientX: 80, clientY: 120 })
    expect(waitingIn(mz2)).toHaveAttribute('data-card-id', 'card-100-1')
    expect(screen.getAllByRole('menuitem').map((item) => item.textContent)).toEqual(['Invocación Normal', 'Colocar'])
  })

  it('mientras se arrastra se enciende sólo la casilla donde la carta tiene jugada', () => {
    const fake = renderAuto()

    core(() => fake.ask(IDLE))
    const card = handCard('Ash Blossom')
    const mz3 = zone('Zona de monstruo 3')
    const st3 = zone('Zona de magia y trampa 3')

    // Cada movimiento en su cuadro (el del arnés devuelve 1 y la mano se queda esperando el siguiente).
    window.requestAnimationFrame = (callback) => {
      callback(0)
      return 0
    }
    document.elementsFromPoint = () => [mz3]
    fireEvent.pointerDown(card, { ...pointer, clientX: 10, clientY: 10 })
    fireEvent.pointerMove(card, { ...pointer, clientX: 40, clientY: 60 })
    expect(mz3).toHaveAttribute('data-over', 'true')
    document.elementsFromPoint = () => [st3]
    fireEvent.pointerMove(card, { ...pointer, clientX: 80, clientY: 120 })
    expect(mz3).toHaveAttribute('data-over', 'false')
    expect(st3).toHaveAttribute('data-over', 'false')
    fireEvent.pointerUp(card, { ...pointer, clientX: 80, clientY: 120 })
    expect(screen.queryByRole('menuitem')).toBeNull()
  })
})

describe('auto-screen · mantener apretado', () => {
  it('un monstruo del campo cambia de posición sin menú, como en la práctica; donde no hay cambio que hacer (la batalla) no se hunde y mantener es tocar', () => {
    const fake = renderAuto()

    core(() => fake.ask(IDLE))
    const maxx = screen.getByRole('button', { name: 'Maxx C' })

    fireEvent.pointerDown(maxx, { ...pointer, clientX: 10, clientY: 10 })
    expect(maxx).toHaveAttribute('data-holding', 'true')
    core(() => void vi.advanceTimersByTime(HOLD_MS))
    fireEvent.pointerUp(maxx, { ...pointer, clientX: 10, clientY: 10 })
    expect(fake.answers).toEqual([{ type: 'select_idlecmd', action: 2, index: 0 }])
    expect(screen.queryByRole('menuitem')).toBeNull()

    core(() => fake.ask(BATTLE))
    const attacker = screen.getByRole('button', { name: 'Maxx C' })

    fireEvent.pointerDown(attacker, { ...pointer, clientX: 10, clientY: 10 })
    expect(attacker).not.toHaveAttribute('data-holding')
    core(() => void vi.advanceTimersByTime(HOLD_MS))
    fireEvent.pointerUp(attacker, { ...pointer, clientX: 10, clientY: 10 })
    expect(fake.answers).toHaveLength(1)
    expect(screen.getAllByRole('menuitem').map((item) => item.textContent)).toEqual(['Atacar'])
    expect(dispatches).toBe(0)
  })
})

describe('auto-screen · el visor de las pilas en escritorio', () => {
  beforeEach(() => {
    // Desde 1101 px (sin el detalle fijo, que llega a los 1440): el de la mesa del duelo.
    const media = window.matchMedia

    window.matchMedia = ((query: string) => ({ ...media(query), matches: query.includes('reduce') || query === '(min-width: 1101px)' })) as typeof window.matchMedia
  })

  // La tira sobre las Zonas Extra es la de las mesas sin columna a la derecha (el duelo por enlace sin el detalle: `auto-screen-online`).
  it('con los pasos y combos a la derecha, igual es la ventana que flota sobre la mesa (la columna queda a la vista); jugar una carta suya lo cierra', () => {
    const fake = renderAuto()

    core(() => fake.ask(IDLE))
    fireEvent.click(screen.getByRole('button', { name: 'Extra: 1' }))
    const slot = document.querySelector<HTMLElement>('[data-pile-slot]')!

    expect(within(slot).getByRole('dialog', { name: 'Extra · 1' })).toBeInTheDocument()
    expect(slot.className).toContain('top-[var(--strip-top,0.5rem)]')
    expect(slot.className).not.toContain('col-[')
    fireEvent.click(within(screen.getByRole('dialog', { name: 'Extra · 1' })).getByRole('button', { name: /^Zeus/ }))
    fireEvent.click(screen.getByRole('menuitem', { name: 'Invocación Especial' }))
    expect(fake.answers.at(-1)).toEqual({ type: 'select_idlecmd', action: 1, index: 0 })
    expect(screen.queryByRole('dialog', { name: 'Extra · 1' })).toBeNull()
    expect(dispatches).toBe(0)
  })

  it('el menú de una carta va en los bloques de la manual: las jugadas con la principal abajo, pegada a la carta', () => {
    const fake = renderAuto()

    core(() => fake.ask(IDLE))
    tap(handCard('Ash Blossom'))
    expect(screen.getAllByRole('menuitem').map((item) => item.textContent)).toEqual(['Colocar', 'Invocación Normal', 'Ver carta'])
  })
})
