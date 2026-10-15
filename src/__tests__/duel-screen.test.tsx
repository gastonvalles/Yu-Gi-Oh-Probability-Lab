// @vitest-environment jsdom
import { configureStore } from '@reduxjs/toolkit'
import { act, cleanup, fireEvent, render as renderBare, screen, within, type RenderResult } from '@testing-library/react'
import '@testing-library/jest-dom'
import type { ReactElement } from 'react'
import { Provider } from 'react-redux'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { extractRoomCode } from '../app/duel-link'
import type { SocketStatus, SocketTransport, SpectatorSocket } from '../app/duel-socket'
import type { DuelConnect } from '../app/use-duel'
import { LifeTile } from '../components/duel/DuelBar'
import { DuelScreen } from '../components/duel/DuelScreen'
import { applyLocale } from '../i18n'
import type { ApiCardReference } from '../types'
import { createMemoryRoom, type MemoryEnd, type MemoryRoom, type MemorySpectator } from './support/memory-room'

// Las cartas de un deck pegado se piden por su número: acá salen todas menos la 999 (que no existe).
vi.mock('../ygoprodeck', () => ({
  fetchCardsByIds: vi.fn(async (ids: number[]) =>
    ids.filter((id) => id !== 999).map((id) => ({ ygoprodeckId: id, name: 'Carta ' + id, frameType: 'effect', cardType: 'Effect Monster', race: null, description: null, attribute: null, level: null, linkValue: null, atk: null, def: null, archetype: null, ygoprodeckUrl: null, imageUrl: null, imageUrlSmall: null })),
  ),
}))

const store = configureStore({ reducer: { settings: (state = { handSize: 5, deckFormat: 'unlimited' as const }) => state } })

/** Cada pantalla en su propio contenedor: las dos conviven en el mismo documento, como dos pestañas. */
const render = (ui: ReactElement): RenderResult => renderBare(<Provider store={store}>{ui}</Provider>, { container: document.body.appendChild(document.createElement('div')) })

const asSocket = (end: MemoryEnd): SocketTransport =>
  Object.assign(end, {
    status: 'open' as SocketStatus,
    onStatus: (listener: (status: SocketStatus) => void) => {
      listener('open')
      return () => {}
    },
  })

const asSpectatorSocket = (spectator: MemorySpectator, status: SocketStatus = 'open'): SpectatorSocket =>
  Object.assign(spectator, {
    status,
    onStatus: (listener: (status: SocketStatus) => void) => {
      listener(status)
      return () => {}
    },
  })

const mainIds = Array.from({ length: 12 }, (_, index) => `card-${1000 + index}-1`)
const extraIds = ['card-9001-1']
const cardsById = new Map([...mainIds, ...extraIds].map((id) => [id, { name: `Carta ${id}`, apiCard: null }]))

// Para jugar de verdad (invocar, atacar) las cartas tienen que ser monstruos: el marco dice qué son.
const effectMonster = { ygoprodeckId: 1, frameType: 'effect', cardType: 'x', race: null, description: null, attribute: null, level: null, linkValue: null, atk: null, def: null, archetype: null, ygoprodeckUrl: null, imageUrl: null, imageUrlSmall: null } as unknown as ApiCardReference
const monsters = new Map([...mainIds, ...extraIds].map((id) => [id, { name: `Monstruo ${id.replace(/\D/g, '')}`, apiCard: effectMonster }]))

let memory: MemoryRoom
let connect: DuelConnect

const screenProps = (overrides: Partial<Parameters<typeof DuelScreen>[0]> = {}) => ({ handSize: 5, mainIds, extraIds, cardsById, deckName: 'Mi deck', connect, connectSpectator: () => asSpectatorSocket(memory.spectate()), ...overrides })
const flush = () => act(() => memory.flush())
const click = (view: RenderResult, name: string | RegExp, role: 'button' | 'menuitem' = 'button') => fireEvent.click(within(view.container).getByRole(role, { name }))
const pointer = { button: 0, pointerId: 1 }
const tap = (element: HTMLElement) => {
  fireEvent.pointerDown(element, { ...pointer, clientX: 10, clientY: 10 })
  fireEvent.pointerUp(element, { ...pointer, clientX: 10, clientY: 10 })
}
const handOf = (view: RenderResult) => within(within(view.container).getByRole('list', { name: 'Mano' }))
const zoneOf = (view: RenderResult, name: string) => within(within(view.container).getByRole('group', { name }))
/** Invoca la primera carta de la mano en la zona de monstruo 1 y devuelve cómo se llama. */
function summonFirst(view: RenderResult): string {
  const [card] = handOf(view).getAllByRole('listitem')
  const name = card!.getAttribute('aria-label')!

  tap(card!)
  fireEvent.click(screen.getByRole('menuitem', { name: 'Invocación Normal' }))
  fireEvent.click(within(view.container).getByRole('button', { name: 'Zona de monstruo 1: elegir' }))
  return name
}
/** De la sala a la mesa: los dos listos, definen con piedra-papel-tijera (gana el anfitrión), él elige ir primero (o segundo) y cada uno reparte su mano solo. */
function openTable(host: RenderResult, guest: RenderResult, first: 'host' | 'guest' = 'host') {
  click(host, 'Estoy listo')
  flush()
  click(guest, 'Estoy listo')
  flush()
  click(host, 'Piedra, papel o tijera')
  flush()
  click(host, 'Piedra')
  flush()
  click(guest, 'Tijera')
  flush()
  click(host, first === 'host' ? 'Ir primero' : 'Ir segundo')
  // Cada uno reparte al enterarse (en un efecto) y lo que reparte le llega al otro en la vuelta siguiente.
  flush()
  flush()
}
const typeInto = (view: RenderResult, label: string, value: string) => fireEvent.change(within(view.container).getByLabelText(label), { target: { value } })

beforeEach(() => {
  memory = createMemoryRoom()
  connect = () => asSocket(memory.join())
  localStorage.clear()
  sessionStorage.clear()
  window.history.replaceState(null, '', '#duel')
  HTMLElement.prototype.setPointerCapture = () => {}
  window.matchMedia = ((query: string) => ({ matches: query.includes('reduce'), media: query, addEventListener: () => {}, removeEventListener: () => {}, addListener: () => {}, removeListener: () => {}, onchange: null, dispatchEvent: () => false })) as typeof window.matchMedia
})

afterEach(() => {
  vi.useRealTimers()
  vi.restoreAllMocks()
  cleanup()
})

describe('la pantalla del duelo', () => {
  it('sin cartas suficientes en el Main avisa y no deja crear ni unirse', () => {
    const view = render(<DuelScreen {...screenProps({ mainIds: mainIds.slice(0, 3) })} />)

    expect(within(view.container).getByText(/hacen falta 5 cartas en el Main/)).toBeInTheDocument()
    expect(within(view.container).getByRole('button', { name: 'Crear un duelo' })).toBeDisabled()

    typeInto(view, 'Enlace o código', 'K7QF2M9X')
    expect(within(view.container).getByRole('button', { name: 'Unirme' })).toBeDisabled()
  })

  it('crear un duelo pone el código en la dirección y muestra el enlace para el rival', () => {
    const view = render(<DuelScreen {...screenProps()} />)

    click(view, 'Crear un duelo')

    const room = extractRoomCode(window.location.hash)
    expect(room).not.toBeNull()
    expect(within(view.container).getByTestId('duel-link')).toHaveTextContent(`#duel?room=${room}`)
    expect(within(view.container).getByText('Esperando a tu rival…')).toBeInTheDocument()
    // Sin rival todavía no hay nada que decir ni a quién esperar: no hay botón de estar listo.
    expect(within(view.container).queryByRole('button', { name: 'Estoy listo' })).not.toBeInTheDocument()
  })

  it('unirse con algo que no es un código lo dice y no entra a ninguna sala', () => {
    const view = render(<DuelScreen {...screenProps()} />)

    typeInto(view, 'Enlace o código', 'hola')
    click(view, 'Unirme')

    expect(within(view.container).getByRole('alert')).toHaveTextContent('Ese no parece un código de duelo')
    expect(window.location.hash).toBe('#duel')
  })

  it('una sala llena se dice y deja salir', () => {
    window.history.replaceState(null, '', '#duel?room=K7QF2M9X')
    const full: SocketTransport = {
      status: 'full',
      onStatus: (listener) => {
        listener('full')
        return () => {}
      },
      send: () => {},
      onMessage: () => () => {},
      onPeer: (listener) => {
        listener(false)
        return () => {}
      },
      close: () => {},
    }
    const view = render(<DuelScreen {...screenProps({ connect: () => full })} />)

    expect(within(view.container).getByText('Esa sala ya tiene dos jugadores.')).toBeInTheDocument()
    click(view, 'Salir')
    expect(within(view.container).getByRole('button', { name: 'Crear un duelo' })).toBeInTheDocument()
    expect(window.location.hash).toBe('#duel')
  })

  it('dos jugadores: uno crea, el otro pega el enlace, cada uno reparte su mano y se ven los puntos de vida del otro', () => {
    const host = render(<DuelScreen {...screenProps()} />)
    typeInto(host, 'Tu nombre', 'Ana')
    click(host, 'Crear un duelo')
    const link = within(host.container).getByTestId('duel-link').textContent ?? ''

    // Otra pestaña: sin sala en la dirección, pega el enlace.
    window.history.replaceState(null, '', '#duel')
    const guest = render(<DuelScreen {...screenProps()} />)
    typeInto(guest, 'Tu nombre', 'Beto')
    typeInto(guest, 'Enlace o código', link)
    click(guest, 'Unirme')
    flush()

    // Con los dos adentro se ven los dos nombres en sus tarjetas: no se repite quién está en la sala.
    expect(within(host.container).getByText('Beto')).toBeInTheDocument()
    expect(within(guest.container).getByText('Ana')).toBeInTheDocument()
    expect(within(host.container).queryByText(/está en la sala/)).not.toBeInTheDocument()
    expect(within(host.container).queryByText('Esperando a tu rival…')).not.toBeInTheDocument()
    expect(within(guest.container).queryByTestId('duel-link')).not.toBeInTheDocument()

    // Cada uno ve si el otro está listo.
    click(host, 'Estoy listo')
    flush()
    expect(within(host.container).getByText('Esperando que Beto esté listo…')).toBeInTheDocument()
    expect(within(guest.container).getAllByText('Listo')).toHaveLength(1)
    click(guest, 'Estoy listo')
    flush()
    expect(within(host.container).getAllByText('Listo')).toHaveLength(2)
    expect(within(guest.container).getAllByText('Listo')).toHaveLength(2)

    // Definen quién elige: gana el anfitrión y elige ir primero; los dos reciben su mano.
    click(host, 'Piedra, papel o tijera')
    flush()
    click(host, 'Piedra')
    flush()
    click(guest, 'Tijera')
    flush()
    expect(within(guest.container).getByText('Ana está eligiendo quién va primero…')).toBeInTheDocument()
    click(host, 'Ir primero')
    flush()
    flush()

    // Ya hay mesa: la mano del rival se cuenta sin verse, y de quién es el turno lo ven igual los dos.
    expect(within(host.container).getByLabelText('Mano del rival: 5')).toBeInTheDocument()
    expect(within(guest.container).getByLabelText('Mano del rival: 5')).toBeInTheDocument()
    // El reloj de la ronda arranca solo cuando los dos tienen su mano: los dos lo ven corriendo, sin apretar nada.
    expect(within(host.container).getByRole('button', { name: /Pausar el reloj/ })).toBeInTheDocument()
    flush()
    expect(within(guest.container).getByRole('button', { name: /Pausar el reloj/ })).toBeInTheDocument()
    expect(within(host.container).getByText('Tu turno')).toBeInTheDocument()
    expect(within(guest.container).getByText('Turno de Ana')).toBeInTheDocument()

    // El anfitrión pierde 1000: el invitado lo ve en la tarjeta del rival.
    click(host, /Cambiar mis puntos de vida/)
    // Con menos de tres cifras se entiende en centenas: "10" es 1000. Restar es lo que viene elegido.
    fireEvent.click(screen.getByRole('button', { name: '1' }))
    fireEvent.click(screen.getByRole('button', { name: '0' }))
    fireEvent.click(screen.getByRole('button', { name: /^Restar [0-9]/ }))
    flush()

    expect(within(host.container).getByRole('button', { name: /Puntos de vida de Ana: 7000/ })).toBeInTheDocument()
    expect(within(guest.container).getByRole('group', { name: /Puntos de vida de Ana: 7000/ })).toBeInTheDocument()
  })

  it('salir del duelo pide confirmación y vuelve al lobby', () => {
    const host = render(<DuelScreen {...screenProps()} />)
    click(host, 'Crear un duelo')
    const link = within(host.container).getByTestId('duel-link').textContent ?? ''
    window.history.replaceState(null, '', '#duel')
    const guest = render(<DuelScreen {...screenProps()} />)

    typeInto(guest, 'Enlace o código', link)
    click(guest, 'Unirme')
    flush()
    openTable(host, guest)

    click(guest, 'Salir del duelo')
    // Confirmar es otra acción, en un diálogo: cancelar no saca a nadie.
    fireEvent.click(screen.getByRole('button', { name: 'Cancelar' }))
    expect(within(guest.container).getByRole('button', { name: 'Salir del duelo' })).toBeInTheDocument()

    click(guest, 'Salir del duelo')
    fireEvent.click(within(screen.getByRole('alertdialog')).getByRole('button', { name: 'Salir del duelo' }))
    expect(within(guest.container).getByRole('button', { name: 'Crear un duelo' })).toBeInTheDocument()
  })

  it('atacar: el rival ve el cartel del ataque y la espada cruza la mesa (directo, o a la carta tuya que atacó) y lo que se ve no revela nada más', () => {
    // El aviso se va solo a los pocos segundos: se controla el reloj de los temporizadores (lo demás sigue igual).
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] })
    const host = render(<DuelScreen {...screenProps({ cardsById: monsters })} />)
    typeInto(host, 'Tu nombre', 'Ana')
    click(host, 'Crear un duelo')
    const link = within(host.container).getByTestId('duel-link').textContent ?? ''
    window.history.replaceState(null, '', '#duel')
    const guest = render(<DuelScreen {...screenProps({ cardsById: monsters })} />)
    typeInto(guest, 'Tu nombre', 'Beto')
    typeInto(guest, 'Enlace o código', link)
    click(guest, 'Unirme')
    flush()
    openTable(host, guest)

    // Beto invoca un monstruo; Ana invoca el suyo y pasa a la Battle Phase.
    const betoCard = summonFirst(guest)
    flush()
    summonFirst(host)
    flush()
    click(host, 'Battle Phase')
    flush()

    // Cada barra de vida dice de quién es: a ahí llega la espada de un ataque directo.
    expect(host.container.querySelector('[data-lp="theirs"]')).toHaveAccessibleName(/Puntos de vida de Beto/)
    expect(host.container.querySelector('[data-lp="mine"]')).toHaveAccessibleName(/Puntos de vida de Ana/)
    // Los efectos de movimiento se ven sólo si no se pidió reducirlo: ya repartidas las manos (que con menos movimiento salen de una), se acepta.
    window.matchMedia = ((query: string) => ({ matches: false, media: query, addEventListener: () => {}, removeEventListener: () => {}, addListener: () => {}, removeListener: () => {}, onchange: null, dispatchEvent: () => false })) as typeof window.matchMedia
    const strikes = () => document.querySelectorAll('[data-fx="strike"]')
    expect(strikes()).toHaveLength(0)
    // jsdom no tiene layout: las cartas propias miden (0, 300), las del rival (0, 100) y las barras de vida (0, 0) la del rival y (0, 500) la propia, así que se ve de dónde a dónde va cada espada.
    vi.spyOn(Element.prototype, 'getBoundingClientRect').mockImplementation(function (this: Element) {
      const [left, top, width, height] = this.matches('[data-lp="theirs"]') ? [0, 0, 100, 20] : this.matches('[data-lp="mine"]') ? [0, 500, 100, 20] : this.matches('[data-rival-card-id]') ? [0, 100, 100, 100] : this.matches('[data-card-id]') ? [0, 300, 100, 100] : [0, 0, 0, 0]

      return { left, top, width, height, right: left + width, bottom: top + height, x: left, y: top, toJSON: () => ({}) } as DOMRect
    })
    const centers = (part: string) => [...document.querySelectorAll<HTMLElement>(`[data-fx="strike"] ${part}`)].map(({ parentElement }) => `${parentElement!.style.left},${parentElement!.style.top}`).sort()
    /** De dónde salen las espadas (en la mesa de cada uno) y adónde llegan. */
    const flights = () => ({ from: centers('.animate-fx-beam'), to: centers('.animate-fx-shock') })

    // Ataque directo: Beto lo lee en un cartel y ve la espada cruzar su mesa (la de Ana también la ve cruzar la suya); nadie ve una carta grande en el centro.
    tap(zoneOf(host, 'Zona de monstruo 1').getAllByRole('button')[0]!)
    fireEvent.click(screen.getByRole('menuitem', { name: 'Ataque directo' }))
    flush()
    expect(within(guest.container).getByText('Ana te ataca directo')).toHaveAttribute('role', 'status')
    expect(within(host.container).queryByText('Ana te ataca directo')).not.toBeInTheDocument()
    expect(strikes()).toHaveLength(2)
    // Ana la tira de su monstruo (50, 350) a la barra de vida del rival (50, 10); en la mesa de Beto, el monstruo de Ana (50, 150) cae sobre la barra propia (50, 510).
    expect(flights()).toEqual({ from: ['50px,150px', '50px,350px'], to: ['50px,10px', '50px,510px'] })
    expect(document.querySelector('[data-kind="attack"]')).toBeNull()
    expect(document.querySelector('[data-activation]')).toBeNull()

    // Se va solo (el cartel a los 4 s, la espada antes); y si Ana pasa de fase y lo deshace, el ataque de antes no se vuelve a avisar.
    act(() => {
      vi.advanceTimersByTime(1100)
    })
    expect(strikes()).toHaveLength(0)
    expect(within(guest.container).getByText('Ana te ataca directo')).toBeInTheDocument()
    act(() => {
      vi.advanceTimersByTime(5000)
    })
    expect(within(guest.container).queryByText('Ana te ataca directo')).not.toBeInTheDocument()
    click(host, 'Main Phase 2')
    flush()
    click(host, 'Deshacer')
    flush()
    expect(within(guest.container).queryByText('Ana te ataca directo')).not.toBeInTheDocument()
    expect(strikes()).toHaveLength(0)
    click(host, 'Battle Phase')
    flush()

    // Atacar al monstruo de Beto: el menú lista a los del rival por su zona y Beto lee el nombre de SU carta.
    tap(zoneOf(host, 'Zona de monstruo 1').getAllByRole('button')[0]!)
    fireEvent.click(screen.getByRole('menuitem', { name: 'Atacar' }))
    const choices = screen.getAllByRole('menuitem').map((item) => item.textContent)
    expect(choices).toHaveLength(1)
    expect(choices[0]).toMatch(/^Rival, Zona de monstruo 1: Monstruo \d+$/)
    fireEvent.click(screen.getAllByRole('menuitem')[0]!)
    flush()
    expect(within(guest.container).getByText(`Ana ataca a ${betoCard}`)).toBeInTheDocument()
    // La espada llega a una carta: la del rival, por el id que él le dio (en la mesa de Ana), y la propia, por el suyo (en la de Beto).
    expect(strikes()).toHaveLength(2)
    // Se cruzan: la espada de Ana va de su monstruo (50, 350) al de Beto (50, 150), y en la mesa de Beto, al revés.
    expect(flights()).toEqual({ from: ['50px,150px', '50px,350px'], to: ['50px,150px', '50px,350px'] })
    expect(host.container.querySelector('[data-rival-card-id]')).not.toBeNull()
    expect(document.querySelector('[data-kind="attack"]')).toBeNull()
  })

  it('juegos: moneda, piedra-papel-tijera y quién empieza; los dos ven lo mismo y la elección del rival no se ve hasta elegir la propia', () => {
    const host = render(<DuelScreen {...screenProps()} />)
    typeInto(host, 'Tu nombre', 'Ana')
    click(host, 'Crear un duelo')
    const link = within(host.container).getByTestId('duel-link').textContent ?? ''
    window.history.replaceState(null, '', '#duel')
    const guest = render(<DuelScreen {...screenProps()} />)
    typeInto(guest, 'Tu nombre', 'Beto')
    typeInto(guest, 'Enlace o código', link)
    click(guest, 'Unirme')
    flush()
    openTable(host, guest)

    const panel = () => within(screen.getByRole('dialog', { name: 'Juegos' }))
    const open = (view: RenderResult) => click(view, 'Moneda, dado y más')
    const close = () => fireEvent.keyDown(document, { key: 'Escape' })

    // La moneda: tira Ana, los dos ven el mismo resultado, con su nombre.
    open(host)
    fireEvent.click(panel().getByRole('button', { name: 'Tirar la moneda' }))
    flush()
    const tossed = panel().getByText(/^Ana: (Cara|Cruz)$/).textContent!.replace('Ana: ', '')
    close()
    open(guest)
    expect(panel().getByText(`Ana tiró la moneda: ${tossed}`)).toBeInTheDocument()
    close()

    // Piedra, papel o tijera: Ana elige y espera; Beto sabe que eligió pero no qué.
    open(host)
    fireEvent.click(panel().getByRole('button', { name: 'Piedra' }))
    flush()
    expect(panel().getByText('Elegiste Piedra. Esperando a Beto…')).toBeInTheDocument()
    close()
    open(guest)
    expect(panel().getByText('Ana ya eligió.')).toBeInTheDocument()
    // No dice qué eligió: ni el resultado ni el registro lo cuentan todavía.
    expect(panel().queryByText(/ contra /)).not.toBeInTheDocument()
    // En el registro están las dos elecciones de Ana: la de la sala, que definió quién empieza, y ésta.
    expect(panel().getAllByText('Ana eligió en piedra, papel o tijera')).toHaveLength(2)
    fireEvent.click(panel().getByRole('button', { name: 'Tijera' }))
    flush()
    expect(panel().getByText('Tijera contra Piedra')).toBeInTheDocument()
    expect(panel().getByText('Perdiste')).toBeInTheDocument()
    close()
    open(host)
    expect(panel().getByText('Piedra contra Tijera')).toBeInTheDocument()
    expect(panel().getByText('Ganaste')).toBeInTheDocument()

    // Otra ronda: vuelve a elegir.
    fireEvent.click(panel().getByRole('button', { name: 'Otra ronda' }))
    flush()
    expect(panel().getByRole('button', { name: 'Papel' })).toBeInTheDocument()

    // Quién empieza ya no se cambia desde acá: se definió al entrar.
    expect(panel().queryByText('Quién empieza')).not.toBeInTheDocument()
    expect(within(host.container).getByText('Tu turno')).toBeInTheDocument()
  })

  /** Los dos adentro de la sala, con su nombre. */
  function startDuel(props: Partial<Parameters<typeof DuelScreen>[0]> = {}) {
    const host = render(<DuelScreen {...screenProps(props)} />)
    typeInto(host, 'Tu nombre', 'Ana')
    click(host, 'Crear un duelo')
    const link = within(host.container).getByTestId('duel-link').textContent ?? ''
    window.history.replaceState(null, '', '#duel')
    const guest = render(<DuelScreen {...screenProps(props)} />)
    typeInto(guest, 'Tu nombre', 'Beto')
    typeInto(guest, 'Enlace o código', link)
    click(guest, 'Unirme')
    flush()
    return { host, guest }
  }

  it('otro deck: se pega un .ydk, se buscan las cartas y se juega con ese; se recuerda y, sin deck armado, se vuelve a usar solo', async () => {
    const small = { mainIds: mainIds.slice(0, 2), extraIds: [], cardsById: new Map() }
    const view = render(<DuelScreen {...screenProps(small)} />)

    expect(within(view.container).getByRole('button', { name: 'Crear un duelo' })).toBeDisabled()
    click(view, 'Usar otro deck')

    // Algo que no es un deck se dice y no cambia nada.
    fireEvent.change(within(view.container).getByRole('textbox', { name: 'ydke://… o el texto del .ydk' }), { target: { value: 'Dark Magician x3' } })
    click(view, 'Usar este deck')
    expect(await within(view.container).findByText(/No reconozco ese deck/)).toBeInTheDocument()

    // Un .ydk de verdad: 13 cartas en el Main (una que no existe) y 1 en el Extra; el Side no cuenta.
    const ydk = ['#created by Ana', '#main', ...Array.from({ length: 12 }, (_, index) => String(1000 + index)), '999', '#extra', '9001', '!side', '5'].join('\n')
    fireEvent.change(within(view.container).getByRole('textbox', { name: 'ydke://… o el texto del .ydk' }), { target: { value: ydk } })
    click(view, 'Usar este deck')

    expect(await within(view.container).findByText('Deck importado: 13 cartas en el Main y 1 en el Extra')).toBeInTheDocument()
    expect(within(view.container).getByText(/1 cartas no se reconocieron/)).toBeInTheDocument()
    expect(within(view.container).getByRole('button', { name: 'Crear un duelo' })).toBeEnabled()
    expect(localStorage.getItem('ygo-lab:duel-deck')).toContain('#main')

    // Volver al del builder quita el importado y lo olvida.
    click(view, 'Volver al deck del builder')
    expect(within(view.container).getByRole('button', { name: 'Crear un duelo' })).toBeDisabled()
    expect(localStorage.getItem('ygo-lab:duel-deck')).toBeNull()

    // Con un deck guardado y el builder vacío, la pantalla lo usa sola al abrir.
    localStorage.setItem('ygo-lab:duel-deck', ydk)
    cleanup()
    const again = render(<DuelScreen {...screenProps(small)} />)
    expect(await within(again.container).findByText('Deck importado: 13 cartas en el Main y 1 en el Extra')).toBeInTheDocument()

    // Y con un deck armado en el builder no se pisa solo.
    cleanup()
    const builder = render(<DuelScreen {...screenProps()} />)
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 30))
    })
    expect(within(builder.container).getByText('El del builder: Mi deck (12 cartas en el Main)')).toBeInTheDocument()
    expect(within(builder.container).queryByText(/Deck importado/)).not.toBeInTheDocument()
  })

  it('otro deck: la mano se reparte con las cartas del deck pegado, y el rival juega con las suyas', async () => {
    const small = { mainIds: mainIds.slice(0, 2), extraIds: [], cardsById: new Map() }
    const host = render(<DuelScreen {...screenProps(small)} />)
    typeInto(host, 'Tu nombre', 'Ana')
    click(host, 'Usar otro deck')
    const ydk = ['#main', ...Array.from({ length: 12 }, (_, index) => String(2000 + index))].join('\n')
    fireEvent.change(within(host.container).getByRole('textbox', { name: 'ydke://… o el texto del .ydk' }), { target: { value: ydk } })
    click(host, 'Usar este deck')
    await within(host.container).findByText('Deck importado: 12 cartas en el Main y 0 en el Extra')
    click(host, 'Crear un duelo')
    const link = within(host.container).getByTestId('duel-link').textContent ?? ''
    window.history.replaceState(null, '', '#duel')
    const guest = render(<DuelScreen {...screenProps()} />)
    typeInto(guest, 'Tu nombre', 'Beto')
    typeInto(guest, 'Enlace o código', link)
    click(guest, 'Unirme')
    flush()
    openTable(host, guest)

    const names = (view: RenderResult) => handOf(view).getAllByRole('listitem').map((card) => card.getAttribute('aria-label'))
    expect(names(host)).toHaveLength(5)
    expect(names(host).every((name) => /^Carta 20\d\d$/.test(name ?? ''))).toBe(true)
    expect(names(guest).some((name) => /^Carta 20\d\d$/.test(name ?? ''))).toBe(false)
  })

  it('puntos de vida: no se elige, los dos empiezan siempre con 8000', () => {
    window.history.replaceState(null, '', '#duel')
    const lobby = render(<DuelScreen {...screenProps()} />)
    expect(within(lobby.container).queryByText('Puntos de vida')).not.toBeInTheDocument()
    expect(within(lobby.container).queryByRole('button', { name: '4000' })).not.toBeInTheDocument()
    cleanup()

    const { host, guest } = startDuel()

    expect(within(host.container).getByText('Cada uno empieza con 8000 LP y una mano de 5 cartas.')).toBeInTheDocument()
    expect(within(guest.container).getByText('Cada uno empieza con 8000 LP y una mano de 5 cartas.')).toBeInTheDocument()

    openTable(host, guest)
    expect(within(host.container).getByRole('button', { name: /Cambiar mis puntos de vida/ })).toHaveAccessibleName(/8000/)
    expect(within(guest.container).getByRole('group', { name: /Puntos de vida de Ana: 8000/ })).toBeInTheDocument()
  })

  it('puntos de vida: se escriben sin separador de miles en inglés también (12000, no 12,000)', () => {
    applyLocale('en')

    try {
      const view = render(<LifeTile name="Yeou" life={12000} mine onClick={() => {}} />)

      expect(within(view.container).getByRole('button')).toHaveTextContent('12000')
      expect(view.container).not.toHaveTextContent('12,000')
    } finally {
      applyLocale('es')
    }
  })

  it('rendirse: pide confirmación, termina el duelo para los dos y la revancha de los dos vuelve a la sala con todo de cero', () => {
    const { host, guest } = startDuel()
    openTable(host, guest)

    const panel = () => within(screen.getByRole('dialog', { name: 'Juegos' }))
    const close = () => fireEvent.keyDown(document, { key: 'Escape' })

    click(guest, 'Moneda, dado y más')
    fireEvent.click(panel().getByRole('button', { name: 'Rendirme' }))
    // Cancelar no se rinde.
    fireEvent.click(panel().getByRole('button', { name: 'Cancelar' }))
    expect(within(host.container).queryByText(/se rindió/)).not.toBeInTheDocument()
    fireEvent.click(panel().getByRole('button', { name: 'Rendirme' }))
    expect(panel().getByText('¿Seguro? Gana Ana.')).toBeInTheDocument()
    fireEvent.click(panel().getByRole('button', { name: 'Rendirme' }))
    flush()

    expect(within(host.container).getByText('Beto se rindió. ¡Ganaste!')).toBeInTheDocument()
    expect(within(guest.container).getByText('Te rendiste.')).toBeInTheDocument()

    // Ana pide la revancha: Beto lo ve y la acepta.
    click(host, 'Revancha')
    flush()
    expect(within(host.container).getByText('Esperando a Beto…')).toBeInTheDocument()
    expect(within(guest.container).getByText('Ana quiere la revancha.')).toBeInTheDocument()
    click(guest, 'Revancha')
    flush()
    close()

    // De vuelta en la sala, elige quién va primero quien perdió (Beto), sin tirar nada: los dos ya estaban listos. Después cada uno reparte otra vez y el resultado se fue.
    expect(within(guest.container).getByText('Elegís vos, porque perdiste el duelo anterior.')).toBeInTheDocument()
    expect(within(host.container).getByText('Beto elige, porque perdió el duelo anterior.')).toBeInTheDocument()
    click(guest, 'Ir segundo')
    flush()
    flush()
    expect(within(host.container).getByText('Tu turno')).toBeInTheDocument()
    expect(within(host.container).queryByText(/se rindió/)).not.toBeInTheDocument()
    expect(within(guest.container).queryByText('Te rendiste.')).not.toBeInTheDocument()
    expect(within(guest.container).getByRole('group', { name: /Puntos de vida de Ana: 8000/ })).toBeInTheDocument()
    // La revancha empieza con el reloj de nuevo: se reinició y vuelve a arrancar solo.
    expect(within(host.container).getByRole('button', { name: /Pausar el reloj/ })).toBeInTheDocument()
    flush()
    expect(within(guest.container).getByRole('button', { name: /Pausar el reloj/ })).toBeInTheDocument()
  })

  it('el robo del turno: al pasar el turno no se roba de más, y el que no empezó roba en su primer turno', () => {
    const { host, guest } = startDuel()
    openTable(host, guest)

    const hand = (view: RenderResult) => handOf(view).getAllByRole('listitem').length
    expect([hand(host), hand(guest)]).toEqual([5, 5])

    // Ana (la que empieza) termina su turno: su mesa pasa a la Draw Phase del turno siguiente pero todavía no le toca, así que no roba.
    click(host, 'End Phase')
    click(host, 'Draw Phase')
    flush()
    expect(hand(host)).toBe(5)
    // A Beto le empieza el primer turno: roba solo.
    expect(hand(guest)).toBe(6)

    // Beto termina el suyo: ahora a Ana le toca otra vez y roba; Beto no roba de más.
    click(guest, 'End Phase')
    click(guest, 'Draw Phase')
    flush()
    expect(hand(host)).toBe(6)
    expect(hand(guest)).toBe(6)

    // Ana se arrepiente de pasar (deshace) y vuelve a pasar: Beto ya robó por ese turno y no roba otra vez.
    click(host, 'End Phase')
    click(host, 'Draw Phase')
    flush()
    expect(hand(guest)).toBe(7)
    click(host, 'Deshacer')
    flush()
    click(host, 'Draw Phase')
    flush()
    expect(hand(guest)).toBe(7)
  })

  it('la sala: cada uno ve si el otro tocó "Estoy listo", y se puede dejar de estarlo', () => {
    const { host, guest } = startDuel()

    expect(within(host.container).getByRole('button', { name: 'Estoy listo' })).toBeEnabled()
    click(host, 'Estoy listo')
    flush()

    // El invitado ve que Ana ya está lista; Ana, que todavía falta Beto.
    expect(within(guest.container).getAllByText('Listo')).toHaveLength(1)
    expect(within(guest.container).getByText('Todavía no')).toBeInTheDocument()
    expect(within(host.container).getByText('Esperando que Beto esté listo…')).toBeInTheDocument()

    // Ana se arrepiente.
    click(host, 'Ya no estoy listo')
    flush()
    expect(within(guest.container).queryByText('Listo')).not.toBeInTheDocument()
    // Hasta que los dos están listos no se ofrece cómo definir quién empieza.
    expect(within(host.container).queryByRole('button', { name: 'Moneda' })).not.toBeInTheDocument()
  })

  it('quién empieza: con la moneda pide cara o cruz quien la eligió; con el dado tiran los dos; y quien gana elige ir primero o segundo', () => {
    // Moneda: Ana la elige, Beto lo ve, Ana pide cara o cruz.
    const first = startDuel()
    click(first.host, 'Estoy listo')
    click(first.guest, 'Estoy listo')
    flush()
    click(first.host, 'Moneda')
    flush()
    expect(within(first.guest.container).getByText('Ana está eligiendo cara o cruz…')).toBeInTheDocument()
    expect(within(first.host.container).getByText('Elegí cara o cruz')).toBeInTheDocument()
    click(first.host, 'Cara')
    flush()
    // Gane quien gane, lo dicen los dos lados: uno elige y el otro espera.
    const hostChooses = within(first.host.container).queryByText('Ganaste: elegís vos.') !== null
    expect(within(first.host.container).getByText(hostChooses ? '¿Querés ir primero o segundo?' : 'Ganó Beto.')).toBeInTheDocument()
    expect(within(first.guest.container).getByText(hostChooses ? 'Ana está eligiendo quién va primero…' : '¿Querés ir primero o segundo?')).toBeInTheDocument()
    cleanup()
    window.history.replaceState(null, '', '#duel')
    sessionStorage.clear()

    // Dado: cada uno tira el suyo y los dos ven los dos números.
    const second = startDuel()
    click(second.host, 'Estoy listo')
    click(second.guest, 'Estoy listo')
    flush()
    click(second.guest, 'Dado')
    flush()
    const dice = (view: RenderResult) => view.container.querySelector('[data-stage="dice"]')
    // Antes de que nadie tire, los dos ven los dos lugares vacíos.
    expect(dice(second.host)?.textContent).toContain('?')
    click(second.host, 'Tirar el dado')
    flush()
    expect(within(second.guest.container).getByText('Ana ya tiró: te toca.')).toBeInTheDocument()
    expect(within(second.host.container).getByRole('button', { name: 'Tirar el dado' })).toBeDisabled()
    // El dado de Ana gira también en la pantalla de Beto, y el de Beto sigue vacío hasta que tire.
    expect(dice(second.guest)?.querySelectorAll('[class*="animate-die-spin"]')).toHaveLength(1)
    expect(dice(second.guest)?.textContent).toContain('?')
    click(second.guest, 'Tirar el dado')
    flush()
    // Ya tiraron los dos: cada uno ve los dos dados (sin lugares vacíos) y, sin empate, quién elige.
    for (const view of [second.host, second.guest]) {
      expect(dice(view)?.querySelectorAll('[class*="animate-die-spin"]')).toHaveLength(2)
      expect(dice(view)?.textContent).not.toContain('?')
    }
    const tied = within(second.host.container).queryByText(/^Empate en [1-6]: tiren de nuevo.$/) !== null
    if (!tied) {
      expect(within(second.host.container).queryByText('Ganaste: elegís vos.') ?? within(second.host.container).queryByText('Ganó Beto.')).not.toBeNull()
    }
  })

  it('piedra, papel o tijera en la sala: cuando eligieron los dos, los dos ven las dos manos a la vez', () => {
    const { host, guest } = startDuel()
    click(host, 'Estoy listo')
    click(guest, 'Estoy listo')
    flush()
    click(host, 'Piedra, papel o tijera')
    flush()
    const hands = (view: RenderResult) => view.container.querySelector('[data-stage="rps"]')

    // Con una sola elección todavía no se muestra ninguna mano (la del rival no se ve hasta elegir la propia).
    click(host, 'Piedra')
    flush()
    expect(hands(host)).toBeNull()
    expect(hands(guest)).toBeNull()

    click(guest, 'Tijera')
    flush()
    for (const view of [host, guest]) {
      expect(hands(view)?.textContent).toContain('✊')
      expect(hands(view)?.textContent).toContain('✌')
      expect(hands(view)?.querySelectorAll('[class*="animate-rps-reveal"]')).toHaveLength(2)
    }
  })

  it('en la mesa lo que tira el rival se ve girar aunque el panel de juegos esté cerrado, y las dos manos al cerrarse una ronda de piedra-papel-tijera', () => {
    const { host, guest } = startDuel()
    openTable(host, guest)
    const overlay = () => document.querySelector('[role="status"].fixed')
    expect(overlay()).toBeNull()

    // Ana tira la moneda con su panel: Beto la ve en el centro de su pantalla, sin abrir nada.
    click(host, 'Moneda, dado y más')
    fireEvent.click(within(screen.getByRole('dialog', { name: 'Juegos' })).getByRole('button', { name: 'Tirar la moneda' }))
    flush()
    fireEvent.keyDown(document, { key: 'Escape' })
    expect(within(guest.container).queryByRole('dialog')).not.toBeInTheDocument()
    expect(overlay()?.textContent).toMatch(/Ana: (Cara|Cruz)/)
  })

  it('puntos de vida: el teclado muestra cómo quedan antes de aplicar, resta o suma, y la mitad se aplica sola', () => {
    const { host, guest } = startDuel()
    openTable(host, guest)
    const sheet = () => within(screen.getByRole('dialog', { name: 'Mis puntos de vida' }))
    const key = (name: string | RegExp) => fireEvent.click(sheet().getByRole('button', { name }))
    const lifeOfAna = (view: RenderResult) => within(view.container).getByRole('group', { name: /Puntos de vida de Ana/ })

    // "8" es 800: se ve cómo quedaría (8000 − 800 = 7200) y recién al confirmar cambia (y el rival lo ve).
    click(host, /Cambiar mis puntos de vida/)
    expect(sheet().getByText('Tecleá el monto')).toBeInTheDocument()
    key('8')
    expect(sheet().getByText(/8000 − 800/)).toBeInTheDocument()
    expect(sheet().getByRole('status')).toHaveTextContent(/7200/)
    expect(sheet().getByRole('button', { name: /^Restar 800/ })).toBeEnabled()
    flush()
    expect(lifeOfAna(guest)).toHaveAccessibleName(/8000/)
    key(/^Restar 800/)
    flush()
    expect(lifeOfAna(guest)).toHaveAccessibleName(/7200/)

    // Sumar: "+" y un monto; borrar deja el monto en cero y "=" deshabilitado.
    click(host, /Cambiar mis puntos de vida/)
    key('Sumar')
    key('5')
    key('00')
    expect(sheet().getByRole('button', { name: /^Sumar 500/ })).toBeEnabled()
    key('Borrar lo tecleado')
    expect(sheet().getByText('Tecleá el monto')).toBeInTheDocument()
    expect(sheet().getByRole('button', { name: /^Sumar 0/ })).toBeDisabled()
    key('5')
    key('00')
    key(/^Sumar 500/)
    flush()
    expect(lifeOfAna(guest)).toHaveAccessibleName(/7700/)

    // La mitad se aplica sola y cierra.
    click(host, /Cambiar mis puntos de vida/)
    key(/con la mitad/)
    flush()
    expect(lifeOfAna(guest)).toHaveAccessibleName(/3850/)
    expect(screen.queryByRole('dialog', { name: 'Mis puntos de vida' })).not.toBeInTheDocument()
  })

  it('el chat: desde la sala y desde la mesa, con un contador de lo que no leíste', () => {
    const { host, guest } = startDuel()

    // En la sala el chat está a la vista.
    fireEvent.change(within(host.container).getByLabelText('Escribí un mensaje'), { target: { value: 'Hola, ya entro' } })
    click(host, 'Enviar')
    flush()
    expect(within(guest.container).getByText('Hola, ya entro')).toBeInTheDocument()
    // Un mensaje rápido va con un toque.
    click(guest, '¿Querés responder?')
    flush()
    expect(within(within(host.container).getByRole('log', { name: 'Chat con Beto' })).getByText('¿Querés responder?')).toBeInTheDocument()

    openTable(host, guest)

    // En la mesa el chat se abre desde la barra; con el chat cerrado el botón cuenta lo que llegó.
    click(host, 'Chat')
    const chat = () => within(screen.getByRole('dialog', { name: 'Chat con Beto' }))
    fireEvent.change(chat().getByLabelText('Escribí un mensaje'), { target: { value: '¿Respondés a mi invocación?' } })
    fireEvent.click(chat().getByRole('button', { name: 'Enviar' }))
    flush()
    expect(chat().getByText('¿Respondés a mi invocación?')).toBeInTheDocument()

    expect(within(guest.container).getByRole('button', { name: 'Chat (1 sin leer)' })).toBeInTheDocument()
    click(guest, /^Chat/)
    expect(within(screen.getAllByRole('dialog', { name: 'Chat con Ana' }).at(-1)!).getByText('¿Respondés a mi invocación?')).toBeInTheDocument()
  })

  it('las fases y el turno: los dos ven en qué fase va quien juega, el rival ve el cartel de cada fase y, al terminar el turno, el de "Tu turno"', () => {
    const { host, guest } = startDuel()
    openTable(host, guest)

    const phase = (view: RenderResult) => within(view.container).getByTestId('duel-phase').textContent
    const banner = (view: RenderResult) => view.container.querySelector('[data-fx="banner"]')?.textContent ?? ''

    expect(phase(host)).toBe(' · Draw Phase')
    expect(phase(guest)).toBe(' · Draw Phase')

    // Ana pasa a la Main Phase 1: Beto lo ve en la barra y en un cartel con el nombre de Ana.
    click(host, 'Main Phase 1')
    flush()
    expect(phase(host)).toBe(' · Main Phase 1')
    expect(phase(guest)).toBe(' · Main Phase 1')
    expect(banner(guest)).toContain('Ana')
    expect(banner(guest)).toContain('Main Phase 1')

    // Las fases son una sola para los dos y sólo las toca quien tiene el turno: Beto las ve (encendidas igual que Ana) pero no puede cambiarlas.
    const phaseButton = (view: RenderResult, name: string) => within(view.container).getByRole('button', { name })
    expect(phaseButton(guest, 'Main Phase 1')).toBeDisabled()
    expect(phaseButton(guest, 'Main Phase 1')).toHaveAttribute('aria-pressed', 'true')
    expect(phaseButton(host, 'Main Phase 1')).toBeEnabled()

    // La End Phase se juega: llegar a ella no pasa el turno ni le hace robar a Beto.
    const handOfGuest = handOf(guest).getAllByRole('listitem').length
    click(host, 'End Phase')
    flush()
    expect(phase(guest)).toBe(' · End Phase')
    expect(within(guest.container).queryByText('Tu turno')).not.toBeInTheDocument()
    expect(handOf(guest).getAllByRole('listitem')).toHaveLength(handOfGuest)
    expect(phaseButton(guest, 'Draw Phase')).toBeDisabled()
    expect(phaseButton(guest, 'End Phase')).toHaveAttribute('aria-pressed', 'true')
    // Para Ana, la Draw Phase es ahora pasar el turno (se lo dice).
    expect(phaseButton(host, 'Draw Phase')).toHaveAttribute('title', 'Pasar el turno')

    // Ana toca la Draw Phase: ahí sí pasa el turno, Beto ve el cartel y roba, y ahora las fases son de él.
    click(host, 'Draw Phase')
    flush()
    expect(within(host.container).getAllByText('Turno de Beto').length).toBeGreaterThan(0)
    expect(within(guest.container).getAllByText('Tu turno').length).toBeGreaterThan(0)
    expect(phase(guest)).toBe(' · Draw Phase')
    expect(phase(host)).toBe(' · Draw Phase')
    expect(banner(guest)).toContain('Tu turno')
    expect(banner(host)).toContain('Turno de Beto')
    expect(handOf(guest).getAllByRole('listitem')).toHaveLength(handOfGuest + 1)
    expect(phaseButton(host, 'Main Phase 1')).toBeDisabled()
    expect(phaseButton(guest, 'Main Phase 1')).toBeEnabled()

    // Y Beto juega su turno: Ana lo ve fase por fase.
    click(guest, 'Battle Phase')
    flush()
    expect(phase(host)).toBe(' · Battle Phase')
    expect(phaseButton(host, 'Battle Phase')).toHaveAttribute('aria-pressed', 'true')
  })

  it('mirar un duelo: el anfitrión da un enlace para espectadores y ve cuántos miran; son hasta dos', async () => {
    const written: string[] = []
    Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText: async (text: string) => void written.push(text) } })
    const { host } = startDuel()

    expect(within(host.container).queryByText(/mirando/)).not.toBeInTheDocument()
    await act(async () => {
      click(host, 'Copiar enlace para mirar')
    })
    expect(written.at(-1)).toMatch(/#duel\?room=[A-Z0-9]{8}&watch=1$/)

    // Alguien entra a mirar: el anfitrión lo ve; con dos, no entra un tercero.
    memory.spectate()
    flush()
    expect(within(host.container).getByText('1 mirando')).toBeInTheDocument()
    memory.spectate()
    flush()
    expect(within(host.container).getByText('2 mirando')).toBeInTheDocument()
    expect(() => memory.spectate()).toThrow()
  })

  it('quien mira entra con el enlace de espectador, sin deck ni nombre, ve a los dos jugadores y no puede tocar nada', () => {
    const { host, guest } = startDuel()
    openTable(host, guest)

    host.container.dataset.who = 'host'
    // Una tercera persona abre el enlace para mirar (sin deck: el builder está vacío).
    const room = extractRoomCode(window.location.hash)!
    window.history.replaceState(null, '', `#duel?room=${room}&watch=1`)
    const watcher = render(<DuelScreen {...screenProps({ mainIds: [], extraIds: [], cardsById: new Map() })} />)
    flush()
    flush()

    const view = within(watcher.container)
    expect(view.getByTestId('spectator-table')).toBeInTheDocument()
    // Ven los dos nombres y las vidas de los dos, y de quién es el turno y la fase.
    expect(view.getAllByText('Ana').length).toBeGreaterThan(0)
    expect(view.getAllByText('Beto').length).toBeGreaterThan(0)
    expect(view.getAllByRole('group', { name: /Puntos de vida de/ })).toHaveLength(2)
    expect(view.getByText('Mirando')).toBeInTheDocument()
    expect(view.getByText(/Turno de Ana/)).toBeInTheDocument()
    expect(view.getByTestId('duel-phase')).toHaveTextContent('Draw Phase')
    // La mano de los dos se cuenta sin verse.
    expect(view.getAllByRole('img', { name: 'Mano del rival: 5' })).toHaveLength(2)

    // Los jugadores se enteran de que los miran.
    expect(within(host.container).getByLabelText('1 mirando')).toBeInTheDocument()
    expect(within(guest.container).getByLabelText('1 mirando')).toBeInTheDocument()

    // Sigue el duelo en vivo.
    click(host, 'Main Phase 1')
    flush()
    expect(view.getByTestId('duel-phase')).toHaveTextContent('Main Phase 1')

    // Nada que tocar: ni jugadas, ni deshacer, ni listo, ni dados, ni un campo para escribir.
    expect(view.queryByRole('textbox')).not.toBeInTheDocument()
    for (const name of [/Deshacer/, /Moneda, dado y más/, /Estoy listo/, /Cambiar mis puntos de vida/, /Draw Phase$/, /Main Phase 1$/, /Ficha/]) {
      expect(view.queryByRole('button', { name })).not.toBeInTheDocument()
    }
    expect(view.queryAllByRole('listitem', { name: /Mano/ })).toHaveLength(0)
  })

  it('quien mira con un solo jugador en la sala espera a su rival, sin hablar de dos', () => {
    const host = render(<DuelScreen {...screenProps()} />)
    typeInto(host, 'Tu nombre', 'Ana')
    click(host, 'Crear un duelo')
    const room = extractRoomCode(window.location.hash)!
    window.history.replaceState(null, '', `#duel?room=${room}&watch=1`)
    const watcher = render(<DuelScreen {...screenProps({ mainIds: [], extraIds: [], cardsById: new Map() })} />)
    flush()
    flush()

    expect(within(watcher.container).getByText('Esperando al rival de Ana…')).toBeInTheDocument()
  })

  it('quien mira puede dar vuelta la mesa para verla desde el lado del otro jugador', () => {
    const { host, guest } = startDuel()
    openTable(host, guest)
    const room = extractRoomCode(window.location.hash)!
    window.history.replaceState(null, '', `#duel?room=${room}&watch=1`)
    const watcher = render(<DuelScreen {...screenProps({ mainIds: [], extraIds: [], cardsById: new Map() })} />)
    flush()
    flush()

    // Las vidas de abajo (a la derecha) son las del anfitrión; al dar vuelta, las del invitado, y las de arriba cambian al revés.
    const bottom = () => watcher.container.querySelector('[data-lp="mine"]')?.getAttribute('aria-label')
    const top = () => watcher.container.querySelector('[data-lp="theirs"]')?.getAttribute('aria-label')
    expect(bottom()).toContain('Ana')
    expect(top()).toContain('Beto')
    click(watcher, 'Ver desde el otro lado')
    expect(bottom()).toContain('Beto')
    expect(top()).toContain('Ana')
    click(watcher, 'Ver desde el otro lado')
    expect(bottom()).toContain('Ana')
  })

  it('el chat de los jugadores se lee desde afuera, sin poder escribir', () => {
    const { host, guest } = startDuel()
    openTable(host, guest)
    const room = extractRoomCode(window.location.hash)!
    window.history.replaceState(null, '', `#duel?room=${room}&watch=1`)
    const watcher = render(<DuelScreen {...screenProps({ mainIds: [], extraIds: [], cardsById: new Map() })} />)
    flush()
    flush()

    click(host, 'Chat')
    fireEvent.change(screen.getByLabelText('Escribí un mensaje'), { target: { value: '¿respondés?' } })
    fireEvent.click(screen.getByRole('button', { name: 'Enviar' }))
    flush()
    fireEvent.keyDown(document, { key: 'Escape' })

    const view = within(watcher.container)
    expect(view.getByRole('button', { name: /Chat de los jugadores \(1 sin leer\)/ })).toBeInTheDocument()
    fireEvent.click(view.getByRole('button', { name: /Chat de los jugadores/ }))
    const log = within(screen.getByRole('log', { name: 'Chat de los jugadores' }))
    expect(log.getByText('¿respondés?')).toBeInTheDocument()
    expect(log.getByText('Ana')).toBeInTheDocument()
    expect(within(screen.getAllByRole('dialog').at(-1)!).queryByRole('textbox')).not.toBeInTheDocument()
  })

  it('pegar un enlace para mirar entra de espectador aunque no haya deck, y uno común sigue pidiéndolo', () => {
    window.history.replaceState(null, '', '#duel')
    const view = render(<DuelScreen {...screenProps({ mainIds: [], extraIds: [], cardsById: new Map() })} />)

    typeInto(view, 'Enlace o código', 'K7QF2M9X')
    expect(within(view.container).getByRole('button', { name: 'Unirme' })).toBeDisabled()

    typeInto(view, 'Enlace o código', 'http://x.test/#duel?room=K7QF2M9X&watch=1')
    expect(within(view.container).getByRole('button', { name: 'Unirme' })).toBeEnabled()
    click(view, 'Unirme')
    expect(window.location.hash).toBe('#duel?room=K7QF2M9X&watch=1')
    expect(within(view.container).getByText('Todavía no hay jugadores en la sala…')).toBeInTheDocument()
    expect(within(view.container).getByText('Sólo mirás: no podés cambiar nada.')).toBeInTheDocument()
  })

  it('si ya hay dos mirando, o la sala es de un relay anterior, se dice y se puede salir', () => {
    for (const [status, text] of [
      ['full', 'Ya hay dos personas mirando este duelo.'],
      ['unsupported', 'Esta sala todavía no admite espectadores.'],
    ] as const) {
      cleanup()
      window.history.replaceState(null, '', '#duel?room=K7QF2M9X&watch=1')
      const view = render(<DuelScreen {...screenProps({ connectSpectator: () => asSpectatorSocket(memory.spectate(), status) })} />)

      expect(within(view.container).getByText(text)).toBeInTheDocument()
      click(view, 'Salir')
      expect(window.location.hash).toBe('#duel')
    }
  })

  /** Ana crea la sala y otra persona llega por el enlace, sin pasar por el lobby (en otro navegador: sin nombre guardado ni rol). */
  function arriveByLink(props: Partial<Parameters<typeof DuelScreen>[0]> = {}) {
    const host = render(<DuelScreen {...screenProps()} />)
    typeInto(host, 'Tu nombre', 'Ana')
    click(host, 'Crear un duelo')
    const room = extractRoomCode(within(host.container).getByTestId('duel-link').textContent ?? '')!
    sessionStorage.removeItem('ygo-lab:duel-role:' + room)
    localStorage.removeItem('ygo-lab:duel-name')
    const guest = render(<DuelScreen {...screenProps(props)} />)
    flush()
    return { host, guest }
  }

  it('quien entra por un enlace se pone nombre desde la sala, el rival lo ve, y puede estar listo', () => {
    const { host, guest } = arriveByLink()
    const guestView = within(guest.container)

    // Sin nombre guardado se presenta como Duelista, pero lo puede cambiar ahí mismo.
    expect(within(host.container).getByText('Duelista')).toBeInTheDocument()
    const input = guestView.getByLabelText('Tu nombre')
    fireEvent.change(input, { target: { value: 'Beto' } })
    fireEvent.blur(input)
    flush()

    expect(within(host.container).getByText('Beto')).toBeInTheDocument()
    expect(within(host.container).queryByText('Duelista')).not.toBeInTheDocument()
    expect(localStorage.getItem('ygo-lab:duel-name')).toBe('Beto')

    // Con el deck del builder, "Estoy listo" anda; ya listo, el nombre deja de editarse y el deck también.
    expect(guestView.getByRole('region', { name: 'Tu deck' })).toBeInTheDocument()
    click(guest, 'Estoy listo')
    flush()
    expect(guestView.queryByLabelText('Tu nombre')).not.toBeInTheDocument()
    expect(guestView.queryByRole('region', { name: 'Tu deck' })).not.toBeInTheDocument()
    expect(within(host.container).getByText('Listo')).toBeInTheDocument()
  })

  it('quien entra por un enlace sin deck lo ve explicado y puede elegir uno ahí mismo', () => {
    const { guest } = arriveByLink({ mainIds: mainIds.slice(0, 2), extraIds: [], cardsById: new Map() })
    const view = within(guest.container)

    expect(view.getByRole('button', { name: 'Estoy listo' })).toBeDisabled()
    expect(view.getByText(/hacen falta 5 cartas en el Main y tu deck tiene 2/)).toBeInTheDocument()
    click(guest, 'Usar otro deck')
    expect(view.getByLabelText('ydke://… o el texto del .ydk')).toBeInTheDocument()
  })

  it('mientras la pantalla del duelo está abierta, la página lo marca (los avisos suben sobre la botonera en celular) y al salir lo saca', () => {
    expect(document.body).not.toHaveAttribute('data-duel')

    const view = render(<DuelScreen {...screenProps()} />)
    expect(document.body).toHaveAttribute('data-duel')

    view.unmount()
    expect(document.body).not.toHaveAttribute('data-duel')
  })

  it('recargar la página en pleno duelo: quien recarga sigue con la misma mesa, sus vidas y de quién es el turno (no recibe otra mano) y el rival la ve', () => {
    const { host, guest } = startDuel({ cardsById: monsters })
    // El invitado empieza (Ir segundo del anfitrión): así el turno guardado se distingue del de arranque.
    openTable(host, guest, 'guest')

    const cardsOf = (view: RenderResult) => handOf(view).getAllByRole('listitem').map((card) => card.getAttribute('aria-label'))
    const savedActions = () => (JSON.parse(localStorage.getItem(Object.keys(localStorage).find((key) => key.endsWith(':guest') && key.includes('duel-save'))!) ?? '{}') as { actions?: unknown[] }).actions?.length

    const summoned = summonFirst(guest)
    // Se guarda en el momento de jugar, no en la próxima vuelta.
    expect(savedActions()).toBe(1)
    flush()

    click(guest, /Cambiar mis puntos de vida/)
    fireEvent.click(screen.getByRole('button', { name: '1' }))
    fireEvent.click(screen.getByRole('button', { name: '0' }))
    fireEvent.click(screen.getByRole('button', { name: /^Restar [0-9]/ }))
    flush()
    expect(within(guest.container).getByRole('button', { name: /Puntos de vida de Beto: 7000/ })).toBeInTheDocument()

    const hand = cardsOf(guest)
    expect(hand).toHaveLength(4)
    expect(within(guest.container).getByText('Tu turno')).toBeInTheDocument()

    // La pestaña se recarga: se cierra la pantalla y se vuelve a abrir en la misma sala (el rol queda en la pestaña).
    guest.unmount()
    flush()
    const reloaded = render(<DuelScreen {...screenProps({ cardsById: monsters })} />)
    flush()
    flush()

    expect(cardsOf(reloaded)).toEqual(hand)
    expect(zoneOf(reloaded, 'Zona de monstruo 1').getByLabelText(summoned)).toBeInTheDocument()
    expect(within(reloaded.container).getByRole('button', { name: /Puntos de vida de Beto: 7000/ })).toBeInTheDocument()
    expect(within(reloaded.container).getByText('Tu turno')).toBeInTheDocument()
    // El anfitrión sigue con su mano y ve la de quien recargó, con la carta invocada y las vidas de antes.
    expect(handOf(host).getAllByRole('listitem')).toHaveLength(5)
    expect(within(host.container).getAllByRole('img', { name: 'Mano del rival: 4' })).toHaveLength(1)
    expect(within(host.container).getByRole('group', { name: /Puntos de vida de Beto: 7000/ })).toBeInTheDocument()
  })

  /** Sale del duelo desde la mesa (con la confirmación). */
  function leaveDuel(view: RenderResult) {
    click(view, 'Salir del duelo')
    fireEvent.click(within(screen.getByRole('alertdialog')).getByRole('button', { name: 'Salir del duelo' }))
  }
  const hasSave = (role: 'host' | 'guest') => Object.keys(localStorage).some((key) => key.startsWith('ygo-lab:duel-save:') && key.endsWith(`:${role}`))

  it('salir del duelo lo deja en pausa: lo guardado sigue, el rival ve la pausa (y el reloj se para), y al volver sigue la misma mesa', () => {
    const { host, guest } = startDuel({ cardsById: monsters })
    openTable(host, guest, 'guest')

    const cardsOf = (view: RenderResult) => handOf(view).getAllByRole('listitem').map((card) => card.getAttribute('aria-label'))
    const summoned = summonFirst(guest)
    flush()
    const hand = cardsOf(guest)
    expect(within(host.container).getByRole('button', { name: /Pausar el reloj/ })).toBeInTheDocument()

    leaveDuel(guest)
    flush()

    // Quien salió está en el inicio del duelo, con su duelo en pausa a mano; lo guardado sigue.
    expect(within(guest.container).getByRole('button', { name: 'Crear un duelo' })).toBeInTheDocument()
    expect(within(guest.container).getByText(/Tenés un duelo en pausa con/)).toBeInTheDocument()
    expect(hasSave('guest')).toBe(true)

    // El rival ve el duelo en pausa, sin poder tocar la mesa, y el reloj parado.
    const pause = within(host.container).getByRole('alertdialog', { name: 'Duelo en pausa' })
    expect(within(pause).getByText('Beto salió del duelo. Sigue cuando vuelva, con la mesa como la dejaron.')).toBeInTheDocument()
    expect(within(host.container).getByRole('button', { name: /Iniciar el reloj/ })).toBeInTheDocument()

    // Vuelve desde el inicio del duelo: la misma mano y la misma carta en su zona; el rival retoma y el reloj vuelve a andar.
    click(guest, 'Volver al duelo')
    flush()
    flush()
    expect(cardsOf(guest)).toEqual(hand)
    expect(zoneOf(guest, 'Zona de monstruo 1').getByLabelText(summoned)).toBeInTheDocument()
    expect(within(host.container).queryByRole('alertdialog', { name: 'Duelo en pausa' })).not.toBeInTheDocument()
    expect(within(host.container).getByRole('button', { name: /Pausar el reloj/ })).toBeInTheDocument()
    expect(within(guest.container).getByRole('button', { name: /Pausar el reloj/ })).toBeInTheDocument()
  })

  it('en pausa también se puede salir desde el cartel; y quien vuelve con el enlace en otra pestaña sigue siendo quien era (anfitrión) con su mesa', () => {
    const { host, guest } = startDuel({ cardsById: monsters })
    openTable(host, guest)

    const cardsOf = (view: RenderResult) => handOf(view).getAllByRole('listitem').map((card) => card.getAttribute('aria-label'))
    const hand = cardsOf(host)
    const room = Object.keys(localStorage).find((key) => key.endsWith(':host'))!.split(':')[2]

    // El invitado sale (en su propio navegador: acá comparten almacenamiento, así que mientras sale no se ve lo del anfitrión): al anfitrión le queda el cartel de pausa, y de ahí también puede salir.
    const hostKey = Object.keys(localStorage).find((key) => key.endsWith(':host'))!
    const hostSave = localStorage.getItem(hostKey)!
    localStorage.removeItem(hostKey)
    leaveDuel(guest)
    flush()
    localStorage.setItem(hostKey, hostSave)
    fireEvent.click(within(within(host.container).getByRole('alertdialog', { name: 'Duelo en pausa' })).getByRole('button', { name: 'Salir del duelo' }))
    expect(within(host.container).getByRole('button', { name: 'Crear un duelo' })).toBeInTheDocument()
    expect(hasSave('host')).toBe(true)

    // Vuelve con el enlace en una pestaña nueva (sin el rol guardado en la pestaña): por su duelo guardado se sabe que era el anfitrión.
    host.unmount()
    sessionStorage.clear()
    window.history.replaceState(null, '', `#duel?room=${room}`)
    const back = render(<DuelScreen {...screenProps({ cardsById: monsters })} />)
    flush()
    expect(within(back.container).getByRole('alertdialog', { name: 'Duelo en pausa' })).toBeInTheDocument()

    // El invitado vuelve: los dos retoman, y el anfitrión sigue con su mano (no recibió otra).
    click(guest, 'Volver al duelo')
    flush()
    flush()
    expect(within(back.container).queryByRole('alertdialog', { name: 'Duelo en pausa' })).not.toBeInTheDocument()
    expect(cardsOf(back)).toEqual(hand)
  })

  it('un duelo que ya terminó no queda en pausa: al salir se borra lo guardado y al rival no se le tapa la mesa', () => {
    const { host, guest } = startDuel()
    openTable(host, guest)

    // El invitado se rinde y sale: terminó, no hay nada que retomar.
    click(guest, /Moneda, dado y más/)
    fireEvent.click(within(screen.getByRole('dialog', { name: 'Juegos' })).getByRole('button', { name: 'Rendirme' }))
    fireEvent.click(within(screen.getByRole('dialog', { name: 'Juegos' })).getByRole('button', { name: 'Rendirme' }))
    flush()
    fireEvent.keyDown(document, { key: 'Escape' })
    leaveDuel(guest)
    flush()
    expect(hasSave('guest')).toBe(false)
    expect(within(guest.container).queryByText(/Tenés un duelo en pausa/)).not.toBeInTheDocument()

    // Al anfitrión no le tapa la mesa una pausa: el duelo terminó y se sigue viendo el resultado.
    expect(within(host.container).getByText('Beto se rindió. ¡Ganaste!')).toBeInTheDocument()
    expect(within(host.container).queryByRole('alertdialog', { name: 'Duelo en pausa' })).not.toBeInTheDocument()

    // El anfitrión sale también: el duelo (que ya terminó) tampoco queda.
    leaveDuel(host)
    expect(hasSave('host')).toBe(false)
  })

  it('quien mira ve "En pausa" mientras falta uno de los jugadores, y deja de verlo cuando vuelve', () => {
    const { host, guest } = startDuel()
    openTable(host, guest)
    const room = Object.keys(localStorage).find((key) => key.endsWith(':host'))!.split(':')[2]

    window.history.replaceState(null, '', `#duel?room=${room}&watch=1`)
    const watcher = render(<DuelScreen {...screenProps({ mainIds: [], extraIds: [], cardsById: new Map() })} />)
    flush()
    flush()
    expect(within(watcher.container).getByTestId('spectator-table')).toBeInTheDocument()
    expect(within(watcher.container).queryByText('En pausa')).not.toBeInTheDocument()

    // El invitado sale (desde su propio navegador: acá comparten almacenamiento, así que mientras sale no se ve lo del anfitrión).
    const hostKey = Object.keys(localStorage).find((key) => key.endsWith(':host'))!
    const hostSave = localStorage.getItem(hostKey)!
    localStorage.removeItem(hostKey)
    leaveDuel(guest)
    flush()
    localStorage.setItem(hostKey, hostSave)
    expect(within(watcher.container).getByText('En pausa')).toBeInTheDocument()

    click(guest, 'Volver al duelo')
    flush()
    flush()
    expect(within(watcher.container).queryByText('En pausa')).not.toBeInTheDocument()
  })

  /** Una pantalla de escritorio (a partir de 1101 px): ahí el chat va fijo a la derecha. */
  const asDesktop = () => {
    window.matchMedia = ((query: string) => ({ matches: query.includes('1101') || query.includes('reduce'), media: query, addEventListener: () => {}, removeEventListener: () => {}, addListener: () => {}, removeListener: () => {}, onchange: null, dispatchEvent: () => false })) as typeof window.matchMedia
  }

  it('rendirse queda a la vista en la barra: pide confirmar, termina el duelo para los dos y después ya no hay a quién rendirse', () => {
    const { host, guest } = startDuel()
    openTable(host, guest)
    expect(within(guest.container).getByRole('button', { name: 'Rendirme' })).toBeEnabled()

    click(guest, 'Rendirme')
    // Cancelar no se rinde.
    fireEvent.click(within(screen.getByRole('alertdialog')).getByRole('button', { name: 'Cancelar' }))
    flush()
    expect(within(host.container).queryByText(/se rindió/)).not.toBeInTheDocument()

    click(guest, 'Rendirme')
    expect(within(screen.getByRole('alertdialog')).getByText('Gana Ana. El duelo termina para los dos y se puede pedir la revancha.')).toBeInTheDocument()
    fireEvent.click(within(screen.getByRole('alertdialog')).getByRole('button', { name: 'Rendirme' }))
    flush()

    expect(within(host.container).getByText('Beto se rindió. ¡Ganaste!')).toBeInTheDocument()
    expect(within(guest.container).getByText('Te rendiste.')).toBeInTheDocument()
    expect(within(guest.container).getByRole('button', { name: 'Rendirme' })).toBeDisabled()
    expect(within(host.container).getByRole('button', { name: 'Rendirme' })).toBeDisabled()
  })

  it('en escritorio el chat está siempre abierto a la derecha: se escribe sin abrir nada y no hay botón para abrirlo', () => {
    asDesktop()
    const { host, guest } = startDuel()
    openTable(host, guest)

    const panel = within(within(guest.container).getByRole('region', { name: 'Chat con Ana' }))
    expect(within(guest.container).queryByRole('button', { name: /^Chat/ })).not.toBeInTheDocument()

    fireEvent.click(panel.getByRole('button', { name: 'Paso' }))
    flush()
    expect(within(within(within(host.container).getByRole('region', { name: 'Chat con Beto' })).getByRole('log')).getByText('Paso')).toBeInTheDocument()
    // Con el chat a la vista, lo que llega no suma un contador de no leídos.
    expect(within(host.container).queryByLabelText(/sin leer/)).not.toBeInTheDocument()
  })

  it('en el celular el chat no está fijo: un botón lo abre', () => {
    const { host, guest } = startDuel()
    openTable(host, guest)

    expect(within(guest.container).queryByRole('region', { name: 'Chat con Ana' })).not.toBeInTheDocument()
    expect(within(guest.container).getByRole('button', { name: 'Chat' })).toBeInTheDocument()
  })

  it('en un duelo de escritorio, mientras se eligen contadores o materiales, "Listo" y "Cancelar" reciben toques: la barra de abajo ataja los suyos', () => {
    asDesktop()
    const { host, guest } = startDuel({ cardsById: monsters })
    openTable(host, guest)
    summonFirst(guest)
    flush()

    const status = () => within(guest.container).getByRole('status', { name: 'Paso actual' })
    expect(status()).not.toHaveClass('min-[1101px]:pointer-events-auto')

    tap(within(guest.container).getByRole('button', { name: 'Ficha' }))
    fireEvent.click(screen.getByRole('menuitem', { name: 'Poner contadores' }))
    expect(status()).toHaveClass('min-[1101px]:pointer-events-auto')
    expect(within(status()).getByRole('button', { name: 'Listo' })).toBeInTheDocument()
  })

  it('cada jugador tiene su color, el mismo en sus vidas y en su globo del chat: el tuyo verde y el del rival celeste', () => {
    asDesktop()
    const { host, guest } = startDuel()
    openTable(host, guest)

    fireEvent.click(within(within(guest.container).getByRole('region', { name: 'Chat con Ana' })).getByRole('button', { name: 'Paso' }))
    flush()
    fireEvent.click(within(within(host.container).getByRole('region', { name: 'Chat con Beto' })).getByRole('button', { name: '¡Gracias!' }))
    flush()

    const colors = (view: RenderResult) => {
      const mineLife = view.container.querySelector('[data-lp="mine"]')!
      const theirLife = view.container.querySelector('[data-lp="theirs"]')!
      const log = within(within(view.container).getByRole('region', { name: /^Chat con/ })).getByRole('log')
      const mineLine = log.querySelector('[data-from="mine"]')!
      const theirLine = log.querySelector('[data-from="theirs"]')!

      return { mineLife, theirLife, mineLine, theirLine }
    }

    for (const view of [guest, host]) {
      const { mineLife, theirLife, mineLine, theirLine } = colors(view)

      // El tuyo, verde: la casilla de tus vidas (borde y número) y tu globo, con tu nombre.
      expect(mineLife).toHaveClass('border-accent/50')
      expect(mineLife.querySelector('span:last-child')).toHaveClass('text-accent')
      expect(mineLine).toHaveClass('bg-accent/20')
      expect(mineLine.querySelector('span')).toHaveClass('text-accent')

      // El del rival, celeste, también en sus dos lugares.
      expect(theirLife).toHaveClass('border-info/50')
      expect(theirLife.querySelector('span:last-child')).toHaveClass('text-info-soft')
      expect(theirLine).toHaveClass('bg-info/20')
      expect(theirLine.querySelector('span')).toHaveClass('text-info-soft')
    }
  })

  it('quien mira ve a cada jugador con su color (anfitrión verde, invitado celeste) en las vidas y en el chat, y al dar vuelta la mesa los colores siguen a los jugadores', () => {
    const { host, guest } = startDuel()
    openTable(host, guest)
    const room = Object.keys(localStorage).find((key) => key.endsWith(':host'))!.split(':')[2]

    window.history.replaceState(null, '', `#duel?room=${room}&watch=1`)
    const watcher = render(<DuelScreen {...screenProps({ mainIds: [], extraIds: [], cardsById: new Map() })} />)
    flush()
    flush()

    // Lo que escriben los dos (después de que quien mira entró: el chat anterior no se repite).
    for (const [view, quick] of [[host, 'Paso'], [guest, '¡Gracias!']] as const) {
      click(view, /^Chat/)
      fireEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: quick }))
      flush()
      fireEvent.keyDown(document, { key: 'Escape' })
    }

    const life = (name: string) => within(watcher.container).getByRole('group', { name: new RegExp(`Puntos de vida de ${name}`) })

    expect(life('Ana')).toHaveClass('border-accent/50')
    expect(life('Beto')).toHaveClass('border-info/50')

    click(watcher, /Ver desde el otro lado/)
    expect(life('Ana')).toHaveClass('border-accent/50')
    expect(life('Beto')).toHaveClass('border-info/50')

    click(watcher, /Chat de los jugadores/)
    const log = within(screen.getByRole('dialog')).getByRole('log')
    expect(log.querySelector('[data-from="host"]')).toHaveClass('bg-accent/20')
    expect(log.querySelector('[data-from="guest"]')).toHaveClass('bg-info/20')
  })

  it('desde el inicio del duelo se puede dejar el duelo en pausa', () => {
    const { host, guest } = startDuel()
    openTable(host, guest)

    leaveDuel(guest)
    expect(within(guest.container).getByText(/Tenés un duelo en pausa con/)).toBeInTheDocument()

    // Sin duelo en pausa lo principal es crear uno; con uno en pausa lo principal es volver a él (una sola principal en la vista).
    expect(within(guest.container).getByRole('button', { name: 'Crear un duelo' })).not.toHaveClass('bg-primary')
    expect(within(guest.container).getByRole('button', { name: 'Volver al duelo' })).toHaveClass('bg-primary')

    click(guest, 'Dejar ese duelo')
    expect(within(guest.container).getByRole('button', { name: 'Crear un duelo' })).toHaveClass('bg-primary')
    expect(within(guest.container).queryByText(/Tenés un duelo en pausa/)).not.toBeInTheDocument()
    expect(hasSave('guest')).toBe(false)
  })

  it('recargar dentro de la sala con un deck pegado y el builder vacío: el deck guardado vuelve solo y se puede repartir', async () => {
    const ydk = ['#main', ...Array.from({ length: 12 }, (_, index) => String(3000 + index))].join('\n')
    localStorage.setItem('ygo-lab:duel-deck', ydk)

    // Ana crea la sala; Beto (sin deck armado) llega a ella por la dirección, como al recargar la página.
    const host = render(<DuelScreen {...screenProps()} />)
    typeInto(host, 'Tu nombre', 'Ana')
    click(host, 'Crear un duelo')
    const room = extractRoomCode(within(host.container).getByTestId('duel-link').textContent ?? '')!
    sessionStorage.removeItem('ygo-lab:duel-role:' + room)
    const guest = render(<DuelScreen {...screenProps({ mainIds: mainIds.slice(0, 2), extraIds: [], cardsById: new Map() })} />)
    flush()

    // Sin deck todavía no puede estar listo; cuando vuelve el guardado, sí.
    expect(within(guest.container).getByRole('button', { name: 'Estoy listo' })).toBeDisabled()
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 30))
    })
    flush()
    expect(within(guest.container).getByRole('button', { name: 'Estoy listo' })).toBeEnabled()
  })
})
