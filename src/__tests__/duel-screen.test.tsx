// @vitest-environment jsdom
import { configureStore } from '@reduxjs/toolkit'
import { act, cleanup, fireEvent, render as renderBare, screen, within, type RenderResult } from '@testing-library/react'
import '@testing-library/jest-dom'
import type { ReactElement } from 'react'
import { Provider } from 'react-redux'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { extractRoomCode } from '../app/duel-link'
import type { SocketStatus, SocketTransport } from '../app/duel-socket'
import type { DuelConnect } from '../app/use-duel'
import { DuelScreen } from '../components/duel/DuelScreen'
import type { ApiCardReference } from '../types'
import { createMemoryRoom, type MemoryEnd, type MemoryRoom } from './support/memory-room'

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

const mainIds = Array.from({ length: 12 }, (_, index) => `card-${1000 + index}-1`)
const extraIds = ['card-9001-1']
const cardsById = new Map([...mainIds, ...extraIds].map((id) => [id, { name: `Carta ${id}`, apiCard: null }]))

// Para jugar de verdad (invocar, atacar) las cartas tienen que ser monstruos: el marco dice qué son.
const effectMonster = { ygoprodeckId: 1, frameType: 'effect', cardType: 'x', race: null, description: null, attribute: null, level: null, linkValue: null, atk: null, def: null, archetype: null, ygoprodeckUrl: null, imageUrl: null, imageUrlSmall: null } as unknown as ApiCardReference
const monsters = new Map([...mainIds, ...extraIds].map((id) => [id, { name: `Monstruo ${id.replace(/\D/g, '')}`, apiCard: effectMonster }]))

let memory: MemoryRoom
let connect: DuelConnect

const screenProps = (overrides: Partial<Parameters<typeof DuelScreen>[0]> = {}) => ({ handSize: 5, mainIds, extraIds, cardsById, deckName: 'Mi deck', connect, ...overrides })
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
    expect(within(view.container).getByRole('button', { name: 'Repartir mi mano' })).toBeDisabled()
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

    expect(within(host.container).getByText('Beto está en la sala.')).toBeInTheDocument()
    expect(within(guest.container).getByText('Ana está en la sala.')).toBeInTheDocument()
    expect(within(guest.container).queryByTestId('duel-link')).not.toBeInTheDocument()

    click(host, 'Repartir mi mano')
    flush()
    expect(within(host.container).getByText('Esperando que tu rival reparta su mano…')).toBeInTheDocument()

    click(guest, 'Repartir mi mano')
    flush()

    // Ya hay mesa: la mano del rival se cuenta sin verse, y de quién es el turno lo ven igual los dos.
    expect(within(host.container).getByLabelText('Mano del rival: 5')).toBeInTheDocument()
    expect(within(guest.container).getByLabelText('Mano del rival: 5')).toBeInTheDocument()
    // El reloj de la ronda arranca solo cuando los dos tienen su mano: los dos lo ven corriendo, sin apretar nada.
    expect(within(host.container).getByRole('button', { name: 'Pausar el reloj' })).toBeInTheDocument()
    flush()
    expect(within(guest.container).getByRole('button', { name: 'Pausar el reloj' })).toBeInTheDocument()
    expect(within(host.container).getByText('Tu turno')).toBeInTheDocument()
    expect(within(guest.container).getByText('Turno de Ana')).toBeInTheDocument()

    // El anfitrión pierde 1000: el invitado lo ve en la tarjeta del rival.
    click(host, /Cambiar mis puntos de vida/)
    fireEvent.click(screen.getByRole('button', { name: '−1000' }))
    flush()

    expect(within(host.container).getByRole('button', { name: /Puntos de vida de Ana: 7\D?000/ })).toBeInTheDocument()
    expect(within(guest.container).getByRole('group', { name: /Puntos de vida de Ana: 7\D?000/ })).toBeInTheDocument()
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
    click(host, 'Repartir mi mano')
    click(guest, 'Repartir mi mano')
    flush()

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
    click(host, 'Repartir mi mano')
    click(guest, 'Repartir mi mano')
    flush()

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
    click(host, 'Repartir mi mano')
    click(guest, 'Repartir mi mano')
    flush()

    const panel = () => within(screen.getByRole('dialog', { name: 'Juegos y señales' }))
    const open = (view: RenderResult) => click(view, 'Moneda, dado y más')
    const close = () => fireEvent.keyDown(document, { key: 'Escape' })

    // La moneda: tira Ana, los dos ven el mismo resultado, con su nombre.
    open(host)
    fireEvent.click(panel().getByRole('button', { name: 'Moneda' }))
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
    expect(panel().getByText('Ana eligió en piedra, papel o tijera')).toBeInTheDocument()
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

    // Quién empieza: Ana dice que va primero Beto, y el turno cambia en las dos pantallas.
    expect(within(host.container).getByText('Tu turno')).toBeInTheDocument()
    fireEvent.click(panel().getByRole('button', { name: 'Va primero Beto' }))
    flush()
    expect(panel().getByText('Empieza Beto.')).toBeInTheDocument()
    close()
    expect(within(host.container).getByText('Turno de Beto')).toBeInTheDocument()
    expect(within(guest.container).getByText('Tu turno')).toBeInTheDocument()

    // Una señal: llega y queda en el registro de Beto.
    open(host)
    fireEvent.click(panel().getByRole('button', { name: 'Paso' }))
    flush()
    close()
    open(guest)
    expect(panel().getByText('Ana: Paso')).toBeInTheDocument()
  })

  /** Los dos adentro de la sala, con su nombre; si se pide, quien crea elige esos puntos de vida. */
  function startDuel(options: { lp?: string } = {}) {
    const host = render(<DuelScreen {...screenProps()} />)
    typeInto(host, 'Tu nombre', 'Ana')
    if (options.lp) fireEvent.click(within(host.container).getByRole('button', { name: options.lp }))
    click(host, 'Crear un duelo')
    const link = within(host.container).getByTestId('duel-link').textContent ?? ''
    window.history.replaceState(null, '', '#duel')
    const guest = render(<DuelScreen {...screenProps()} />)
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
    click(host, 'Repartir mi mano')
    click(guest, 'Repartir mi mano')
    flush()

    const names = (view: RenderResult) => handOf(view).getAllByRole('listitem').map((card) => card.getAttribute('aria-label'))
    expect(names(host)).toHaveLength(5)
    expect(names(host).every((name) => /^Carta 20\d\d$/.test(name ?? ''))).toBe(true)
    expect(names(guest).some((name) => /^Carta 20\d\d$/.test(name ?? ''))).toBe(false)
  })

  it('puntos de vida: quien crea el duelo elige 8000 o 4000 y los dos empiezan con eso', () => {
    const { host, guest } = startDuel({ lp: '4000' })

    expect(within(host.container).getByText('Cada uno empieza con 4000 LP y una mano de 5 cartas.')).toBeInTheDocument()
    expect(within(guest.container).getByText('Cada uno empieza con 4000 LP y una mano de 5 cartas.')).toBeInTheDocument()

    click(host, 'Repartir mi mano')
    click(guest, 'Repartir mi mano')
    flush()
    expect(within(host.container).getByRole('button', { name: /Cambiar mis puntos de vida/ })).toHaveAccessibleName(/4\D?000/)
    expect(within(guest.container).getByRole('group', { name: /Puntos de vida de Ana: 4\D?000/ })).toBeInTheDocument()
  })

  it('rendirse: pide confirmación, termina el duelo para los dos y la revancha de los dos vuelve a la sala con todo de cero', () => {
    const { host, guest } = startDuel()
    click(host, 'Repartir mi mano')
    click(guest, 'Repartir mi mano')
    flush()

    const panel = () => within(screen.getByRole('dialog', { name: 'Juegos y señales' }))
    const close = () => fireEvent.keyDown(document, { key: 'Escape' })

    click(guest, 'Moneda, dado y más')
    fireEvent.click(panel().getByRole('button', { name: 'Rendirme' }))
    // Cancelar no se rinde.
    fireEvent.click(panel().getByRole('button', { name: 'Cancelar' }))
    expect(within(host.container).queryByText(/se rindió/)).not.toBeInTheDocument()
    fireEvent.click(panel().getByRole('button', { name: 'Rendirme' }))
    expect(panel().getByText('¿Seguro? Gana Ana.')).toBeInTheDocument()
    fireEvent.click(panel().getByRole('button', { name: 'Sí, rendirme' }))
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

    // De vuelta en la sala, cada uno reparte otra vez y el resultado se fue.
    click(host, 'Repartir mi mano')
    click(guest, 'Repartir mi mano')
    flush()
    expect(within(host.container).queryByText(/se rindió/)).not.toBeInTheDocument()
    expect(within(guest.container).queryByText('Te rendiste.')).not.toBeInTheDocument()
    expect(within(guest.container).getByRole('group', { name: /Puntos de vida de Ana: 8\D?000/ })).toBeInTheDocument()
    // La revancha empieza con el reloj de nuevo: se reinició y vuelve a arrancar solo.
    expect(within(host.container).getByRole('button', { name: 'Pausar el reloj' })).toBeInTheDocument()
    flush()
    expect(within(guest.container).getByRole('button', { name: 'Pausar el reloj' })).toBeInTheDocument()
  })

  it('el robo del turno: al pasar el turno no se roba de más, y el que no empezó roba en su primer turno', () => {
    const { host, guest } = startDuel()
    click(host, 'Repartir mi mano')
    click(guest, 'Repartir mi mano')
    flush()

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

    // Sin deck todavía no puede repartir; cuando vuelve el guardado, sí.
    expect(within(guest.container).getByRole('button', { name: 'Repartir mi mano' })).toBeDisabled()
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 30))
    })
    flush()
    expect(within(guest.container).getByRole('button', { name: 'Repartir mi mano' })).toBeEnabled()
  })
})
