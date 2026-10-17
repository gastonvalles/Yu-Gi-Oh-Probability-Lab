// @vitest-environment jsdom
import { configureStore } from '@reduxjs/toolkit'
import { act, cleanup, fireEvent, render as renderBare, screen, within, type RenderResult } from '@testing-library/react'
import '@testing-library/jest-dom'
import type { ReactElement } from 'react'
import { Provider } from 'react-redux'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { extractRoomCode } from '../app/duel-link'
import { RIFFLE_MS } from '../app/shuffle-fx'
import type { SocketStatus, SocketTransport, SpectatorSocket } from '../app/duel-socket'
import type { DuelConnect } from '../app/use-duel'
import { LifeTile } from '../components/duel/DuelBar'
import type { RoomsApi } from '../app/duel-rooms'
import type { LiveDuel, PublicRoom } from '../app/duel-relay-rules'
import { DuelScreen } from '../components/duel/DuelScreen'
import { applyLocale } from '../i18n'
import type { ApiCardReference } from '../types'
import { createMemoryRoom, type MemoryEnd, type MemoryRoom, type MemorySpectator } from './support/memory-room'

// Las cartas de un deck pegado se piden por su número: acá salen todas menos la 999 (que no existe).
vi.mock('../ygoprodeck', () => ({
  fetchCardsByIds: vi.fn(async (ids: number[]) =>
    ids.filter((id) => id !== 999).map((id) => ({ ygoprodeckId: id, name: 'Carta ' + id, frameType: 'effect', cardType: 'Effect Monster', race: null, description: null, attribute: null, level: null, linkValue: null, atk: null, def: null, archetype: null, ygoprodeckUrl: null, imageUrl: null, imageUrlSmall: null })),
  ),
  // El detalle de una carta pide también sus artes alternativos: acá no hay ninguno.
  fetchCardArts: vi.fn(async () => []),
}))

const store = configureStore({ reducer: { settings: (state = { handSize: 5, deckFormat: 'unlimited' as const }) => state } })

/** Las salas públicas del relay, de mentira: lo que esperan, lo que se juega y cada aviso del anfitrión. */
const fakeRooms = (list: PublicRoom[] = [], live: LiveDuel[] = []) => ({
  list: vi.fn(async () => list),
  overview: vi.fn(async () => ({ rooms: list, live })),
  register: vi.fn<RoomsApi['register']>(async () => true),
  live: vi.fn<RoomsApi['live']>(async () => true),
  unlist: vi.fn<RoomsApi['unlist']>(),
})

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

const mainIds = Array.from({ length: 40 }, (_, index) => `card-${1000 + index}-1`)
const extraIds = ['card-9001-1']
const cardsById = new Map([...mainIds, ...extraIds].map((id) => [id, { name: `Carta ${id}`, apiCard: null }]))

// Para jugar de verdad (invocar, atacar) las cartas tienen que ser monstruos: el marco dice qué son.
const effectMonster = { ygoprodeckId: 1, frameType: 'effect', cardType: 'x', race: null, description: null, attribute: null, level: null, linkValue: null, atk: null, def: null, archetype: null, ygoprodeckUrl: null, imageUrl: null, imageUrlSmall: null } as unknown as ApiCardReference
const monsters = new Map([...mainIds, ...extraIds].map((id) => [id, { name: `Monstruo ${id.replace(/\D/g, '')}`, apiCard: effectMonster }]))

let memory: MemoryRoom
let connect: DuelConnect

const screenProps = (overrides: Partial<Parameters<typeof DuelScreen>[0]> = {}) => ({ handSize: 5, mainIds, extraIds, cardsById, deckName: 'Mi deck', connect, connectSpectator: () => asSpectatorSocket(memory.spectate()), ...overrides })
const flush = () => act(() => memory.flush())
/** El rival de quien tocó Deshacer ve el cartel y permite volver atrás la jugada. */
const allowUndo = () => {
  fireEvent.click(screen.getByRole('button', { name: 'Permitir' }))
  flush()
}
/**
 * En el celular, Reconectar, Rendirme y Salir del duelo van detrás de «Más opciones del duelo» (en escritorio están a la vista): abre la hoja y devuelve el botón.
 * La hoja queda abierta; `closeMore` la cierra.
 */
const MORE_OPTIONS = ['Reconectar', 'Rendirme', 'Salir del duelo']
const moreButton = (view: RenderResult, name: string): HTMLElement => {
  const inline = within(view.container).queryByRole('button', { name })

  if (inline) return inline

  fireEvent.click(within(view.container).getByRole('button', { name: 'Más opciones del duelo' }))

  return within(screen.getByRole('dialog', { name: 'Más opciones del duelo' })).getByRole('button', { name })
}
/** La moneda, el dado y los juegos están dentro del + (el botón «Ficha»): se abre su menú y se elige. */
const openGames = (view: RenderResult) => {
  tap(within(view.container).getByRole('button', { name: 'Ficha' }))
  fireEvent.click(screen.getByRole('menuitem', { name: 'Moneda, dado y más' }))
}
const closeMore = () => fireEvent.keyDown(document, { key: 'Escape' })
const click = (view: RenderResult, name: string | RegExp, role: 'button' | 'menuitem' = 'button') =>
  fireEvent.click(typeof name === 'string' && role === 'button' && MORE_OPTIONS.includes(name) ? moreButton(view, name) : within(view.container).getByRole(role, { name }))
const typeInto = (view: RenderResult, label: string, value: string) => fireEvent.change(within(view.container).getByLabelText(label), { target: { value } })
/** La hoja «Reglas del duelo» (está en un portal, fuera de la pantalla): se abre desde el renglón de las reglas del inicio de Jugar. */
const openRules = (view: RenderResult) => click(view, /^Reglas del duelo/)
const rulesDialog = () => screen.getByRole('dialog', { name: 'Reglas del duelo' })
/** Abrir un duelo 1 vs 1 como se hace: abrir las reglas y «Abrir duelo» (con las reglas que vienen elegidas, o las que se pidan: el tiempo, o también pública o privada). */
const createRoom = (view: RenderResult, minutes?: string, visibility?: 'Pública' | 'Privada') => {
  openRules(view)

  if (minutes) {
    fireEvent.click(within(rulesDialog()).getByRole('radio', { name: minutes }))
  }

  if (visibility) {
    fireEvent.click(within(rulesDialog()).getByRole('radio', { name: visibility }))
  }

  fireEvent.click(within(rulesDialog()).getByRole('button', { name: 'Abrir duelo' }))
}
/** El deck con que se juega se elige en una hoja («Tu deck»), que se abre desde el renglón del nombre del deck. */
const openDeck = (view: RenderResult) => click(view, /^(Sin deck|.+ · \d+)$/)
const deckDialog = () => within(screen.getByRole('dialog', { name: 'Tu deck' }))
/** Entrar con un enlace o un código: el campo está detrás de «Tengo un código». */
const joinByLink = (view: RenderResult, link: string) => {
  if (!within(view.container).queryByRole('textbox', { name: 'Enlace o código' })) click(view, 'Tengo un código')

  typeInto(view, 'Enlace o código', link)
  click(view, 'Unirme')
}
/** Pasar el turno como se hace: llegar a la End Phase y tocar "Pasar turno" (que sólo se enciende ahí). */
const passTurn = (view: RenderResult) => {
  click(view, 'End Phase')
  flush()
  click(view, 'Pasar turno')
  flush()
}
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

beforeEach(() => {
  memory = createMemoryRoom()
  connect = () => asSocket(memory.join())
  localStorage.clear()
  sessionStorage.clear()
  window.history.replaceState(null, '', '#duel')
  HTMLElement.prototype.setPointerCapture = () => {}
  HTMLElement.prototype.scrollIntoView = () => {}
  window.matchMedia = ((query: string) => ({ matches: query.includes('reduce'), media: query, addEventListener: () => {}, removeEventListener: () => {}, addListener: () => {}, removeListener: () => {}, onchange: null, dispatchEvent: () => false })) as typeof window.matchMedia
})

afterEach(() => {
  vi.useRealTimers()
  vi.restoreAllMocks()
  cleanup()
})

describe('la pantalla del duelo', () => {
  it('sin cartas suficientes en el Main avisa, lleva a elegir deck y no deja retar, entrar ni abrir un duelo', () => {
    const view = render(<DuelScreen {...screenProps({ mainIds: mainIds.slice(0, 3) })} />)

    expect(within(view.container).getByText(/hacen falta 5 cartas en el Main/)).toBeInTheDocument()
    expect(within(view.container).getByRole('button', { name: 'Retar a un amigo' })).toBeDisabled()
    expect(within(view.container).getByRole('button', { name: 'Entrenar solo' })).toBeDisabled()

    click(view, 'Tengo un código')
    typeInto(view, 'Enlace o código', 'K7QF2M9X')
    expect(within(view.container).getByRole('button', { name: 'Unirme' })).toBeDisabled()

    openRules(view)
    expect(within(rulesDialog()).getByRole('button', { name: 'Abrir duelo' })).toBeDisabled()
    closeMore()

    // La acción principal no queda muerta: lleva a elegir el deck.
    click(view, 'Elegí tu deck para jugar')
    expect(screen.getByRole('dialog', { name: 'Tu deck' })).toBeInTheDocument()
  })

  it('Entrenar solo lleva a la mesa de práctica sin crear sala', () => {
    const view = render(<DuelScreen {...screenProps()} />)

    click(view, 'Entrenar solo')

    expect(window.location.hash).toBe('#practice')
    expect(extractRoomCode(window.location.hash)).toBeNull()
  })

  it('las reglas se recuerdan: «Guardar reglas» las deja para la próxima vez y se ven en el renglón del inicio', () => {
    const view = render(<DuelScreen {...screenProps()} />)

    expect(within(view.container).getByRole('button', { name: /^Reglas del duelo · TCG · 50 min · Single/ })).toBeInTheDocument()
    openRules(view)
    fireEvent.click(within(rulesDialog()).getByRole('radio', { name: 'Match · mejor de 3' }))
    fireEvent.click(within(rulesDialog()).getByRole('radio', { name: 'Sin tiempo' }))
    fireEvent.click(within(rulesDialog()).getByRole('button', { name: 'Guardar reglas' }))

    expect(within(view.container).getByRole('button', { name: /^Reglas del duelo · TCG · Sin tiempo · Match/ })).toBeInTheDocument()
    expect(JSON.parse(localStorage.getItem('ygo-lab:duel-prefs') ?? '{}')).toMatchObject({ limitMin: 0, match: true, format: 'tcg' })

    // Otra visita al inicio las encuentra, y el duelo que se abre con «Jugar ahora» las usa.
    view.unmount()
    const again = render(<DuelScreen {...screenProps()} />)

    expect(within(again.container).getByRole('button', { name: /^Reglas del duelo · TCG · Sin tiempo · Match/ })).toBeInTheDocument()
    click(again, 'Jugar ahora')
    const summary = within(within(again.container).getByTestId('room-summary'))
    expect(summary.getByText('Match')).toBeInTheDocument()
    expect(summary.getByText('Sin tiempo')).toBeInTheDocument()
  })

  it('el tiempo tiene dos opciones, 50 minutos o sin tiempo, y el tope de puntos de Genesys sólo aparece con Genesys', () => {
    const view = render(<DuelScreen {...screenProps()} />)

    openRules(view)
    expect(within(rulesDialog()).getAllByRole('radio', { name: /min$|Sin tiempo/ }).map((radio) => radio.getAttribute('aria-label') ?? radio.textContent)).toEqual(['50 min', 'Sin tiempo'])
    expect(within(rulesDialog()).queryByRole('group', { name: 'Puntos máximos' })).not.toBeInTheDocument()

    fireEvent.change(within(rulesDialog()).getByRole('combobox', { name: 'Formato' }), { target: { value: 'genesys' } })
    const cap = within(rulesDialog()).getByRole('group', { name: 'Puntos máximos' })
    expect(within(cap).getByRole('textbox', { name: 'Puntos máximos' })).toHaveValue('100')

    fireEvent.click(within(cap).getByRole('button', { name: 'Restar 10' }))
    expect(within(cap).getByRole('textbox', { name: 'Puntos máximos' })).toHaveValue('90')
    fireEvent.change(within(cap).getByRole('textbox', { name: 'Puntos máximos' }), { target: { value: '130' } })
    fireEvent.click(within(rulesDialog()).getByRole('button', { name: 'Guardar reglas' }))

    expect(within(view.container).getByRole('button', { name: /^Reglas del duelo · Genesys 130 pts · 50 min · Single/ })).toBeInTheDocument()
    expect(JSON.parse(localStorage.getItem('ygo-lab:duel-prefs') ?? '{}')).toMatchObject({ format: 'genesys', genesysCap: 130 })
  })

  it('una sala de Genesys lleva su tope: se anota en la lista con él y se ve en la sala', async () => {
    const rooms = fakeRooms()
    const host = render(<DuelScreen {...screenProps({ rooms })} />)
    typeInto(host, 'Tu nombre', 'Ana')

    openRules(host)
    fireEvent.change(within(rulesDialog()).getByRole('combobox', { name: 'Formato' }), { target: { value: 'genesys' } })
    fireEvent.change(within(rulesDialog()).getByRole('textbox', { name: 'Puntos máximos' }), { target: { value: '80' } })
    fireEvent.click(within(rulesDialog()).getByRole('button', { name: 'Abrir duelo' }))
    await act(async () => {})

    expect(rooms.register).toHaveBeenCalledWith(expect.any(String), { host: 'Ana', match: false, siding: false, format: 'genesys', limitMin: 50, genesysCap: 80 }, expect.any(String))
    expect(within(within(host.container).getByTestId('room-summary')).getByText('80 pts')).toBeInTheDocument()
  })

  it('con un código se entra a jugar o a mirar: «Mirar» sirve para una sala pública o una privada y no pide deck', () => {
    const view = render(<DuelScreen {...screenProps({ mainIds: [], extraIds: [], cardsById: new Map() })} />)

    click(view, 'Tengo un código')
    expect(within(view.container).getByRole('button', { name: 'Mirar' })).toBeDisabled()
    typeInto(view, 'Enlace o código', 'K7QF2M9X')
    expect(within(view.container).getByRole('button', { name: 'Unirme' })).toBeDisabled()
    click(view, 'Mirar')

    expect(window.location.hash).toBe('#duel?room=K7QF2M9X&watch=1')
  })

  it('«Jugar ahora» sin relay abre una sala con enlace y las reglas que vienen elegidas', () => {
    const view = render(<DuelScreen {...screenProps()} />)

    click(view, 'Jugar ahora')

    expect(extractRoomCode(window.location.hash)).not.toBeNull()
    expect(within(view.container).getByTestId('duel-link')).toBeInTheDocument()
  })

  it('«Jugar ahora» entra a una sala pública compatible (mismo formato y tipo) en lugar de abrir otra', async () => {
    const mismatch = { code: 'AAAAAAAA', host: 'Dani', match: true, siding: false, format: 'tcg', limitMin: 50, createdAt: 1 }
    const fit = { code: 'K7QF2M9X', host: 'Carla', match: false, siding: false, format: 'tcg', limitMin: 50, createdAt: 2 }
    const rooms = fakeRooms([mismatch, fit])
    const view = render(<DuelScreen {...screenProps({ rooms })} />)

    click(view, 'Jugar ahora')
    await act(async () => {})

    expect(window.location.hash).toBe('#duel?room=K7QF2M9X')
    expect(rooms.register).not.toHaveBeenCalled()
  })

  it('«Jugar ahora» sin sala compatible abre la tuya, pública y con tus reglas; y al cancelar (salir) se baja de la lista con su token', async () => {
    const other = { code: 'AAAAAAAA', host: 'Dani', match: false, siding: false, format: 'edison', limitMin: 50, createdAt: 1 }
    const rooms = fakeRooms([other])
    const view = render(<DuelScreen {...screenProps({ rooms })} />)
    typeInto(view, 'Tu nombre', 'Ana')

    click(view, 'Jugar ahora')
    expect(within(view.container).getByRole('button', { name: 'Jugar ahora' })).toBeDisabled()
    await act(async () => {})

    const room = extractRoomCode(window.location.hash)!
    expect(room).not.toBe('AAAAAAAA')
    expect(rooms.register).toHaveBeenCalledTimes(1)
    expect(rooms.register).toHaveBeenCalledWith(room, { host: 'Ana', match: false, siding: false, format: 'tcg', limitMin: 50 }, expect.stringMatching(/^[A-Za-z0-9]{16}$/))
    const token = rooms.register.mock.calls[0]![2]

    // Cancelar la espera: salir de la sala la baja de la lista.
    click(view, 'Salir')
    expect(rooms.unlist).toHaveBeenCalledWith(room, token)
    expect(window.location.hash).toBe('#duel')
  })

  it('«Retar a un amigo» abre una sala privada con el enlace, aunque haya relay: nunca se anota en la lista', async () => {
    const rooms = fakeRooms()
    const view = render(<DuelScreen {...screenProps({ rooms })} />)

    click(view, 'Retar a un amigo')
    await act(async () => {})

    expect(within(view.container).getByTestId('duel-link')).toBeInTheDocument()
    expect(within(within(view.container).getByTestId('room-summary')).getByText('Privada')).toBeInTheDocument()
    expect(rooms.register).not.toHaveBeenCalled()
  })

  it('el tiempo que elige el anfitrión llega al rival y cambia el reloj', () => {
    const host = render(<DuelScreen {...screenProps()} />)

    createRoom(host, 'Sin tiempo')
    expect(within(within(host.container).getByTestId('room-summary')).getByText('Sin tiempo')).toBeInTheDocument()
  })

  it('la sala dice en qué paso va (Invitar · Listos · Quién empieza) y muestra desde el principio tu tarjeta y el lugar que espera al rival', () => {
    const host = render(<DuelScreen {...screenProps()} />)
    typeInto(host, 'Tu nombre', 'Ana')
    createRoom(host)

    const view = within(host.container)
    const steps = view.getByRole('list', { name: 'Pasos de la sala' })

    expect(within(steps).getAllByRole('listitem').map((item) => item.textContent)).toEqual(['Invitar', 'Listos', 'Quién empieza'])
    expect(within(steps).getByText('Invitar').closest('li')).toHaveAttribute('aria-current', 'step')
    // Tu tarjeta con tu deck y, al lado, el lugar del rival.
    expect(view.getByText('Ana')).toBeInTheDocument()
    expect(view.getByText(/\d+ \+ \d+/)).toBeInTheDocument()
    expect(view.getByText('Esperando a tu rival…')).toBeInTheDocument()
    // La principal («Copiar enlace») va antes que el enlace para mirar, que es sin caja y va al final de la fila.
    const labels = view.getAllByRole('button').map((button) => button.textContent)
    expect(labels).toContain('Copiar enlace')
    expect(labels.indexOf('Copiar enlace')).toBeLessThan(labels.indexOf('Copiar enlace para mirar'))
  })

  it('con el rival adentro el paso es «Listos» y con los dos listos, «Quién empieza»', () => {
    const { host, guest } = startDuel()
    const current = (view: RenderResult) => within(within(view.container).getByRole('list', { name: 'Pasos de la sala' })).getAllByRole('listitem').find((item) => item.getAttribute('aria-current') === 'step')?.textContent

    expect(current(host)).toBe('Listos')
    expect(current(guest)).toBe('Listos')

    click(host, 'Estoy listo')
    click(guest, 'Estoy listo')
    flush()
    expect(current(host)).toBe('Quién empieza')
  })

  it('con un formato, un deck que no lo cumple no puede estar listo y se dice qué carta sobra', () => {
    const host = render(<DuelScreen {...screenProps()} />)
    typeInto(host, 'Tu nombre', 'Ana')
    createRoom(host)
    const link = within(host.container).getByTestId('duel-link').textContent ?? ''
    window.history.replaceState(null, '', '#duel')
    const banned = [...mainIds.slice(1), 'card-440556-1']
    const bannedCard = { ygoprodeckId: 440556, banlist: { tcg: 'forbidden', ocg: null, goat: null }, genesys: { points: null } } as unknown as ApiCardReference
    const bannedCards = new Map<string, { name: string; apiCard: ApiCardReference | null }>([...cardsById, ['card-440556-1', { name: 'Bahamut Shark', apiCard: bannedCard }]])
    const guest = render(<DuelScreen {...screenProps({ mainIds: banned, cardsById: bannedCards })} />)
    joinByLink(guest, link)
    flush()

    expect(within(guest.container).getByText(/Bahamut Shark está prohibida en TCG/)).toBeInTheDocument()
    expect(within(guest.container).getByRole('button', { name: 'Estoy listo' })).toBeDisabled()
    expect(within(host.container).getByRole('button', { name: 'Estoy listo' })).toBeEnabled()
  })

  it('un Match se elige al crear la sala y las dos pantallas muestran el marcador en la mesa', () => {
    const host = render(<DuelScreen {...screenProps()} />)
    typeInto(host, 'Tu nombre', 'Ana')
    openRules(host)
    fireEvent.click(within(rulesDialog()).getByRole('radio', { name: 'Match · mejor de 3' }))
    fireEvent.click(within(rulesDialog()).getByRole('button', { name: 'Abrir duelo' }))
    const link = within(host.container).getByTestId('duel-link').textContent ?? ''
    window.history.replaceState(null, '', '#duel')
    const guest = render(<DuelScreen {...screenProps()} />)
    typeInto(guest, 'Tu nombre', 'Beto')
    joinByLink(guest, link)
    flush()

    expect(within(within(guest.container).getByTestId('room-summary')).getByText('Match')).toBeInTheDocument()
    openTable(host, guest)
    expect(within(host.container).getByTestId('duel-series')).toHaveTextContent('Duelo 1 · 0–0')
    expect(within(guest.container).getByTestId('duel-series')).toHaveTextContent('Duelo 1 · 0–0')
  })

  it('un Match con siding: entre duelo y duelo cada uno cambia cartas de su Side y, con los dos listos, sigue el duelo', () => {
    const sideIds = ['card-777-1']
    const withSide = new Map([...cardsById, ['card-777-1', { name: 'Carta del Side', apiCard: null }]])
    const props = { sideIds, cardsById: withSide }
    const host = render(<DuelScreen {...screenProps(props)} />)
    typeInto(host, 'Tu nombre', 'Ana')
    openRules(host)
    fireEvent.click(within(rulesDialog()).getByRole('radio', { name: 'Match · mejor de 3' }))
    fireEvent.click(within(rulesDialog()).getByRole('switch', { name: 'Cambiar cartas entre duelos' }))
    fireEvent.click(within(rulesDialog()).getByRole('button', { name: 'Abrir duelo' }))
    const link = within(host.container).getByTestId('duel-link').textContent ?? ''
    window.history.replaceState(null, '', '#duel')
    const guest = render(<DuelScreen {...screenProps(props)} />)
    typeInto(guest, 'Tu nombre', 'Beto')
    joinByLink(guest, link)
    flush()
    openTable(host, guest)

    // Beto se rinde: Ana va 1–0 y el Match sigue, así que «Siguiente duelo» lleva al siding.
    click(guest, 'Rendirme')
    fireEvent.click(within(screen.getByRole('alertdialog')).getByRole('button', { name: 'Rendirme' }))
    flush()
    expect(within(host.container).getByText(/Match 1–0/)).toBeInTheDocument()
    click(host, 'Siguiente duelo')
    click(guest, 'Siguiente duelo')

    expect(within(host.container).getByRole('heading', { name: 'Siding' })).toBeInTheDocument()
    // Como en el builder: las tres zonas con sus cartas, y arriba ir a cada una con lo que lleva.
    const jump = within(within(host.container).getByRole('navigation', { name: 'Ir a una zona del deck' }))
    expect(jump.getAllByRole('button').map((button) => button.textContent)).toEqual(['Main 40', 'Extra 1', 'Side 1'])
    // Un toque en una carta del Main la pasa al Side; otro en el Side la devuelve.
    fireEvent.click(within(host.container).getAllByRole('button', { name: 'Mover Carta card-1000-1 al Side Deck' })[0]!)
    expect(jump.getAllByRole('button').map((button) => button.textContent)).toEqual(['Main 39', 'Extra 1', 'Side 2'])
    expect(within(host.container).getByRole('region', { name: 'Side Deck' })).toHaveTextContent('Carta card-1000-1')
    fireEvent.click(within(within(host.container).getByRole('region', { name: 'Side Deck' })).getByRole('button', { name: 'Mover Carta card-1000-1 al Main Deck' }))
    expect(jump.getAllByRole('button').map((button) => button.textContent)).toEqual(['Main 40', 'Extra 1', 'Side 1'])
    expect(within(host.container).getByRole('region', { name: 'Side Deck' })).toHaveTextContent('Carta del Side')
    fireEvent.click(within(host.container).getByRole('button', { name: 'Mover Carta del Side al Main Deck' }))
    expect(within(host.container).getByRole('region', { name: 'Main Deck' })).toHaveTextContent('Carta del Side')

    click(host, 'Listo')
    flush()
    expect(within(host.container).getByText('Esperando a Beto…')).toBeInTheDocument()
    expect(within(guest.container).getByText('Ana ya está listo.')).toBeInTheDocument()
    click(guest, 'Listo')
    flush()

    // Con los dos listos se limpia la mesa: elige quién va primero quien perdió (Beto) y el siding se fue.
    expect(within(guest.container).getByText('Elegís vos, porque perdiste el duelo anterior.')).toBeInTheDocument()
    expect(within(host.container).queryByRole('heading', { name: 'Siding' })).not.toBeInTheDocument()
  })

  it('una sala pública se anota mientras espera; al llegar el rival pasa a «en vivo» (se avisa cada minuto, con cuántos la miran) y sólo se baja al salir', async () => {
    vi.useFakeTimers({ toFake: ['setInterval', 'clearInterval'] })
    const rooms = fakeRooms()
    const host = render(<DuelScreen {...screenProps({ rooms })} />)
    typeInto(host, 'Tu nombre', 'Ana')
    openRules(host)
    expect(within(rulesDialog()).getByRole('radio', { name: 'Pública' })).toBeChecked()
    fireEvent.click(within(rulesDialog()).getByRole('button', { name: 'Abrir duelo' }))
    const link = within(host.container).getByTestId('duel-link').textContent ?? ''
    const room = extractRoomCode(link)!
    const info = { host: 'Ana', match: false, siding: false, format: 'tcg', limitMin: 50 }

    expect(rooms.register).toHaveBeenCalledTimes(1)
    expect(rooms.register).toHaveBeenCalledWith(room, info, expect.stringMatching(/^[A-Za-z0-9]{16}$/))
    expect(rooms.live).not.toHaveBeenCalled()
    expect(rooms.unlist).not.toHaveBeenCalled()
    const token = rooms.register.mock.calls[0]![2]

    window.history.replaceState(null, '', '#duel')
    const guest = render(<DuelScreen {...screenProps()} />)
    typeInto(guest, 'Tu nombre', 'Beto')
    joinByLink(guest, link)
    flush()

    // Llegó el rival: la sala deja de esperar y pasa a los duelos en vivo (sin bajarla), con el mismo token.
    expect(rooms.live).toHaveBeenCalledTimes(1)
    expect(rooms.live).toHaveBeenCalledWith(room, info, 0, token)
    expect(rooms.unlist).not.toHaveBeenCalled()

    // Lo avisa cada minuto mientras dura.
    act(() => {
      vi.advanceTimersByTime(60_000)
    })
    expect(rooms.live).toHaveBeenCalledTimes(2)

    // Al salir de la sala se baja, con el mismo token.
    host.unmount()
    expect(rooms.unlist).toHaveBeenCalledWith(room, token)
  })

  it('si el relay no registra el duelo en vivo (uno de antes, o sin red), la sala se baja al llegar el rival como siempre, y no se insiste', async () => {
    vi.useFakeTimers({ toFake: ['setInterval', 'clearInterval'] })
    const rooms = fakeRooms()

    rooms.live.mockResolvedValue(false)

    const host = render(<DuelScreen {...screenProps({ rooms })} />)
    typeInto(host, 'Tu nombre', 'Ana')
    openRules(host)
    fireEvent.click(within(rulesDialog()).getByRole('button', { name: 'Abrir duelo' }))
    const link = within(host.container).getByTestId('duel-link').textContent ?? ''
    const room = extractRoomCode(link)!
    const token = rooms.register.mock.calls[0]![2]

    window.history.replaceState(null, '', '#duel')
    const guest = render(<DuelScreen {...screenProps()} />)
    typeInto(guest, 'Tu nombre', 'Beto')
    joinByLink(guest, link)
    flush()
    await act(async () => {})

    expect(rooms.live).toHaveBeenCalledTimes(1)
    expect(rooms.unlist).toHaveBeenCalledWith(room, token)

    act(() => {
      vi.advanceTimersByTime(180_000)
    })
    expect(rooms.live).toHaveBeenCalledTimes(1)
  })

  it('una sala privada nunca se anota ni se avisa como duelo en vivo', async () => {
    const rooms = fakeRooms()
    const host = render(<DuelScreen {...screenProps({ rooms })} />)
    typeInto(host, 'Tu nombre', 'Ana')
    openRules(host)
    fireEvent.click(within(rulesDialog()).getByRole('radio', { name: 'Privada' }))
    fireEvent.click(within(rulesDialog()).getByRole('button', { name: 'Abrir duelo' }))
    const link = within(host.container).getByTestId('duel-link').textContent ?? ''

    window.history.replaceState(null, '', '#duel')
    const guest = render(<DuelScreen {...screenProps()} />)
    typeInto(guest, 'Tu nombre', 'Beto')
    joinByLink(guest, link)
    flush()
    await act(async () => {})

    expect(rooms.register).not.toHaveBeenCalled()
    expect(rooms.live).not.toHaveBeenCalled()
  })

  it('al crear la sala se ve la ficha de reglas: pública o privada, el tipo, el formato, el reloj, las vidas y cuántos miran', () => {
    const rooms = fakeRooms()
    const host = render(<DuelScreen {...screenProps({ rooms })} />)

    openRules(host)
    fireEvent.click(within(rulesDialog()).getByRole('radio', { name: 'Match · mejor de 3' }))
    fireEvent.click(within(rulesDialog()).getByRole('button', { name: 'Abrir duelo' }))

    const summary = within(within(host.container).getByTestId('room-summary'))
    for (const chip of ['Pública', 'Match', 'TCG', '50 min']) {
      expect(summary.getByText(chip)).toBeInTheDocument()
    }
    expect(summary.getByText('0 de 2')).toBeInTheDocument()
    expect(summary.getByText('8000')).toBeInTheDocument()
  })

  it('una sala privada no se anota', () => {
    const rooms = fakeRooms()
    const host = render(<DuelScreen {...screenProps({ rooms })} />)

    openRules(host)
    fireEvent.click(within(rulesDialog()).getByRole('radio', { name: 'Privada' }))
    fireEvent.click(within(rulesDialog()).getByRole('button', { name: 'Abrir duelo' }))

    expect(within(host.container).getByTestId('duel-link')).toBeInTheDocument()
    expect(rooms.register).not.toHaveBeenCalled()
  })

  it('la arena muestra las salas abiertas y se entra a una con un toque, sin pegar un enlace', async () => {
    const open = { code: 'K7QF2M9X', host: 'Carla', match: true, siding: true, format: 'tcg', limitMin: 50, createdAt: Date.now() }
    const rooms = fakeRooms([open])
    const view = render(<DuelScreen {...screenProps({ rooms })} />)

    const section = within(await within(view.container).findByRole('region', { name: 'En la arena ahora' }))
    expect(await section.findByText('Carla')).toBeInTheDocument()
    expect(section.getByText('1 sala esperando rival')).toBeInTheDocument()
    for (const chip of ['Match', 'TCG', '50 min', 'Siding']) {
      expect(section.getByText(chip)).toBeInTheDocument()
    }

    fireEvent.click(section.getByRole('button', { name: 'Entrar a la sala de Carla' }))
    expect(window.location.hash).toBe('#duel?room=K7QF2M9X')
  })

  it('la arena muestra los duelos en vivo con cuántos los miran, se entra a mirar con un toque y uno lleno no deja mirar', async () => {
    const live = [
      { code: 'LIVEAAAA', host: 'Eli', match: false, siding: false, format: 'tcg', limitMin: 50, watchers: 1, since: Date.now() },
      { code: 'LIVEBBBB', host: 'Fede', match: true, siding: false, format: 'tcg', limitMin: 0, watchers: 2, since: Date.now() },
    ]
    const view = render(<DuelScreen {...screenProps({ rooms: fakeRooms([], live) })} />)

    const section = within(await within(view.container).findByRole('region', { name: 'En la arena ahora' }))
    expect(await section.findByText('2 duelos en vivo')).toBeInTheDocument()
    expect(section.getByText('Eli está jugando')).toBeInTheDocument()
    expect(section.getByText('Mirando 1 de 2')).toBeInTheDocument()
    expect(section.getByRole('button', { name: 'Mirar el duelo de Fede' })).toBeDisabled()

    fireEvent.click(section.getByRole('button', { name: 'Mirar el duelo de Eli' }))
    expect(window.location.hash).toBe('#duel?room=LIVEAAAA&watch=1')
  })

  it('la arena sin nada lo dice con honestidad (no inventa actividad), y sin deck no se puede entrar a una sala', async () => {
    const rooms = fakeRooms()
    const view = render(<DuelScreen {...screenProps({ rooms })} />)

    expect(await within(view.container).findByText(/Todavía no hay salas abiertas/)).toBeInTheDocument()
    expect(within(view.container).queryByText(/en vivo/)).not.toBeInTheDocument()

    const open = { code: 'K7QF2M9X', host: 'Carla', match: false, siding: false, format: 'unlimited', limitMin: 0, createdAt: 1 }
    const noDeck = render(<DuelScreen {...screenProps({ rooms: fakeRooms([open]), mainIds: mainIds.slice(0, 2) })} />)

    expect(await within(noDeck.container).findByRole('button', { name: 'Entrar a la sala de Carla' })).toBeDisabled()
  })

  it('sin relay no hay arena: el inicio de Jugar no muestra una lista que no puede llenar', () => {
    const view = render(<DuelScreen {...screenProps()} />)

    expect(within(view.container).queryByRole('region', { name: 'En la arena ahora' })).not.toBeInTheDocument()
  })

  it('el siding dura 3 minutos: se ve la cuenta y, al acabarse, queda listo solo con el deck como esté', () => {
    vi.useFakeTimers()

    const withSide = new Map([...cardsById, ['card-777-1', { name: 'Carta del Side', apiCard: null }]])
    const props = { sideIds: ['card-777-1'], cardsById: withSide }
    const host = render(<DuelScreen {...screenProps(props)} />)
    typeInto(host, 'Tu nombre', 'Ana')
    openRules(host)
    fireEvent.click(within(rulesDialog()).getByRole('radio', { name: 'Match · mejor de 3' }))
    fireEvent.click(within(rulesDialog()).getByRole('switch', { name: 'Cambiar cartas entre duelos' }))
    fireEvent.click(within(rulesDialog()).getByRole('button', { name: 'Abrir duelo' }))
    const link = within(host.container).getByTestId('duel-link').textContent ?? ''
    window.history.replaceState(null, '', '#duel')
    const guest = render(<DuelScreen {...screenProps(props)} />)
    typeInto(guest, 'Tu nombre', 'Beto')
    joinByLink(guest, link)
    flush()
    openTable(host, guest)

    click(guest, 'Rendirme')
    fireEvent.click(within(screen.getByRole('alertdialog')).getByRole('button', { name: 'Rendirme' }))
    flush()
    click(host, 'Siguiente duelo')

    expect(within(host.container).getByTestId('siding-clock')).toHaveTextContent('Te quedan 03:00')
    act(() => {
      vi.advanceTimersByTime(60_000)
    })
    expect(within(host.container).getByTestId('siding-clock')).toHaveTextContent('Te quedan 02:00')

    // Se acaba el tiempo: Ana queda lista sin tocar nada y espera a Beto.
    act(() => {
      vi.advanceTimersByTime(120_000)
    })
    flush()
    expect(within(host.container).getByText('Esperando a Beto…')).toBeInTheDocument()
    expect(within(host.container).queryByTestId('siding-clock')).not.toBeInTheDocument()
  })

  it('crear un duelo pone el código en la dirección y muestra el enlace para el rival', () => {
    const view = render(<DuelScreen {...screenProps()} />)

    createRoom(view)

    const room = extractRoomCode(window.location.hash)
    expect(room).not.toBeNull()
    expect(within(view.container).getByTestId('duel-link')).toHaveTextContent(`#duel?room=${room}`)
    expect(within(view.container).getByText('Esperando a tu rival…')).toBeInTheDocument()
    // Sin rival todavía no hay nada que decir ni a quién esperar: no hay botón de estar listo.
    expect(within(view.container).queryByRole('button', { name: 'Estoy listo' })).not.toBeInTheDocument()
  })

  it('unirse con algo que no es un código lo dice y no entra a ninguna sala', () => {
    const view = render(<DuelScreen {...screenProps()} />)

    joinByLink(view, 'hola')

    expect(within(view.container).getByRole('alert')).toHaveTextContent('Ese no parece un código de duelo')
    expect(window.location.hash).toBe('#duel')
  })

  it('una sala llena se dice, deja probar otro enlace y, en vez de un callejón sin salida, deja mirar el duelo sin deck', () => {
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
      reconnect: () => {},
      close: () => {},
    }
    const view = render(<DuelScreen {...screenProps({ connect: () => full })} />)

    expect(within(view.container).getByRole('heading', { name: 'La sala ya está completa' })).toBeInTheDocument()
    click(view, 'Probar otro enlace')
    expect(within(view.container).getByRole('button', { name: 'Jugar ahora' })).toBeInTheDocument()
    expect(window.location.hash).toBe('#duel')
  })

  it('dos jugadores: uno crea, el otro pega el enlace, cada uno reparte su mano y se ven los puntos de vida del otro', () => {
    const host = render(<DuelScreen {...screenProps()} />)
    typeInto(host, 'Tu nombre', 'Ana')
    createRoom(host)
    const link = within(host.container).getByTestId('duel-link').textContent ?? ''

    // Otra pestaña: sin sala en la dirección, pega el enlace.
    window.history.replaceState(null, '', '#duel')
    const guest = render(<DuelScreen {...screenProps()} />)
    typeInto(guest, 'Tu nombre', 'Beto')
    joinByLink(guest, link)
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
    createRoom(host)
    const link = within(host.container).getByTestId('duel-link').textContent ?? ''
    window.history.replaceState(null, '', '#duel')
    const guest = render(<DuelScreen {...screenProps()} />)

    joinByLink(guest, link)
    flush()
    openTable(host, guest)

    click(guest, 'Salir del duelo')
    // Confirmar es otra acción, en un diálogo: cancelar no saca a nadie.
    fireEvent.click(screen.getByRole('button', { name: 'Seguir jugando' }))
    expect(within(guest.container).getByRole('button', { name: 'Más opciones del duelo' })).toBeInTheDocument()

    click(guest, 'Salir del duelo')
    fireEvent.click(within(screen.getByRole('alertdialog')).getByRole('button', { name: 'Salir y dejar en pausa' }))
    expect(within(guest.container).getByRole('button', { name: 'Jugar ahora' })).toBeInTheDocument()
  })

  it('atacar: el rival ve el cartel del ataque y la espada cruza la mesa (directo, o a la carta tuya que atacó) y lo que se ve no revela nada más', () => {
    // El aviso se va solo a los pocos segundos: se controla el reloj de los temporizadores (lo demás sigue igual).
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] })
    const host = render(<DuelScreen {...screenProps({ cardsById: monsters })} />)
    typeInto(host, 'Tu nombre', 'Ana')
    createRoom(host)
    const link = within(host.container).getByTestId('duel-link').textContent ?? ''
    window.history.replaceState(null, '', '#duel')
    const guest = render(<DuelScreen {...screenProps({ cardsById: monsters })} />)
    typeInto(guest, 'Tu nombre', 'Beto')
    joinByLink(guest, link)
    flush()
    openTable(host, guest)

    // Beto invoca un monstruo; Ana invoca el suyo y pasa a la Battle Phase.
    const betoCard = summonFirst(guest)
    flush()
    summonFirst(host)
    flush()
    click(host, 'Battle Phase')
    flush()
    // Las invocaciones de recién traen su carta y su cartel; pasan solos.
    act(() => {
      vi.advanceTimersByTime(1100)
    })

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
    // El cartel del ataque (role=status) es pasajero; la línea del registro, en cambio, se queda: se busca el cartel.
    const attackBanner = (view: RenderResult, text = 'Ana te ataca directo') => within(view.container).queryAllByText(text).find((element) => element.getAttribute('role') === 'status')
    /** De dónde salen las espadas (en la mesa de cada uno) y adónde llegan. */
    const flights = () => ({ from: centers('.animate-fx-beam'), to: centers('.animate-fx-shock') })

    // Ataque directo: Beto lo lee en un cartel y ve la espada cruzar su mesa (la de Ana también la ve cruzar la suya); nadie ve una carta grande en el centro.
    tap(zoneOf(host, 'Zona de monstruo 1').getAllByRole('button')[0]!)
    fireEvent.click(screen.getByRole('menuitem', { name: 'Ataque directo' }))
    flush()
    expect(attackBanner(guest)).toBeDefined()
    expect(within(host.container).queryByText('Ana te ataca directo')).not.toBeInTheDocument()
    // Y queda anotado en el registro de Beto (la línea sobre el campo).
    expect(within(guest.container).getByRole('button', { name: /^Abrir el registro de jugadas: Ana te ataca directo/ })).toHaveTextContent('Ana te ataca directo')
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
    expect(attackBanner(guest)).toBeDefined()
    act(() => {
      vi.advanceTimersByTime(5000)
    })
    expect(attackBanner(guest)).toBeUndefined()
    click(host, 'Main Phase 2')
    flush()
    click(host, 'Deshacer')
    flush()
    allowUndo()
    expect(attackBanner(guest)).toBeUndefined()
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
    expect(attackBanner(guest, `Ana ataca a ${betoCard}`)).toBeDefined()
    // La espada llega a una carta: la del rival, por el id que él le dio (en la mesa de Ana), y la propia, por el suyo (en la de Beto).
    expect(strikes()).toHaveLength(2)
    // Se cruzan: la espada de Ana va de su monstruo (50, 350) al de Beto (50, 150), y en la mesa de Beto, al revés.
    expect(flights()).toEqual({ from: ['50px,150px', '50px,350px'], to: ['50px,150px', '50px,350px'] })
    expect(host.container.querySelector('[data-rival-card-id]')).not.toBeNull()
    expect(document.querySelector('[data-kind="attack"]')).toBeNull()
  })

  it('lo que el rival activa y es público se queda tres segundos con el nombre de la carta, en el cartel y en el registro (una línea, corregida); lo que no es público no se nombra', async () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] })
    const { host, guest } = startDuel({ cardsById: monsters })
    openTable(host, guest)
    summonFirst(host)
    flush()
    const stage = () => guest.container.querySelector('[data-activation]')

    // Invocada, la carta todavía es un dorso para Beto: sin nombre, y dura lo de siempre.
    expect(stage()!.querySelector('figcaption')).toBeNull()
    expect(stage()!.querySelector('[class*="animate-card-activate-linger"]')).toBeNull()
    act(() => {
      vi.advanceTimersByTime(1000)
    })
    expect(stage()).toBeNull()

    // Al activarla pasa a ser pública: se queda 3 s y, cuando se busca su nombre, el cartel y la carta lo llevan.
    tap(zoneOf(host, 'Zona de monstruo 1').getAllByRole('button')[0]!)
    fireEvent.click(screen.getByRole('menuitem', { name: 'Activar efecto' }))
    flush()
    expect(stage()!.querySelector('[class*="animate-card-activate-linger"]')).not.toBeNull()
    await act(async () => {})
    expect(stage()).toHaveTextContent(/Ana activa Carta \d+/)
    expect(stage()!.querySelector('figcaption')).toHaveTextContent(/^Carta \d+$/)
    act(() => {
      vi.advanceTimersByTime(2000)
    })
    expect(stage()).not.toBeNull()

    // El registro tiene una sola línea de esa activación, ya con el nombre (no la genérica y otra más).
    click(guest, /^Chat/)
    const log = within(screen.getByRole('dialog')).getByRole('log')
    expect(within(log).getAllByText(/Ana activa/)).toHaveLength(1)
    expect(within(log).getByText(/Ana activa Carta \d+/)).toBeInTheDocument()
    expect(within(log).queryByText('Ana activa una carta')).not.toBeInTheDocument()
  })

  it('lo que el rival activa, revela o marca como objetivo se ve igual que lo tuyo: su carta grande en el centro y el aro en su campo, y el objetivo queda marcado', () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] })
    const { host, guest } = startDuel({ cardsById: monsters })
    openTable(host, guest)
    summonFirst(host)
    flush()

    const rivalCard = () => guest.container.querySelector<HTMLElement>('[data-rival-card-id]')!
    const stage = () => guest.container.querySelector('[data-activation]')
    const ring = () => rivalCard().getAttribute('data-flash')
    const myMonster = () => tap(zoneOf(host, 'Zona de monstruo 1').getAllByRole('button')[0]!)
    // Invocar también se anima, con su carta (de dorso: Beto todavía no la vio) y su cartel, como en un combo guardado.
    expect(stage()).toHaveAttribute('data-kind', 'normal')
    expect(guest.container.querySelector('[data-activation]')).toHaveTextContent('Ana hace una Invocación Normal')
    act(() => {
      vi.advanceTimersByTime(1000)
    })
    expect(stage()).toBeNull()
    expect(ring()).toBe('false')

    // Ana activa el efecto: Beto ve la carta de Ana grande en el centro, con un cartel, y el aro dorado en su campo; se van solos.
    myMonster()
    fireEvent.click(screen.getByRole('menuitem', { name: 'Activar efecto' }))
    flush()
    expect(stage()).toHaveAttribute('data-kind', 'activate')
    expect(guest.container.querySelector('[data-activation]')).toHaveTextContent('Ana activa una carta')
    expect(ring()).toBe('true')
    expect(rivalCard()).toHaveAttribute('data-flash-kind', 'activate')
    // Quien activa la ve a su manera (la suya ya se veía): sólo Beto ve la del rival.
    expect(within(host.container).queryByText('Ana activa una carta')).not.toBeInTheDocument()
    // Lo que se activa y es público se queda 3 s (el resto de lo que se anima, 1): pasado 1 s sigue y se va a los 3.
    act(() => {
      vi.advanceTimersByTime(1000)
    })
    expect(stage()).not.toBeNull()
    expect(ring()).toBe('true')
    act(() => {
      vi.advanceTimersByTime(2100)
    })
    expect(stage()).toBeNull()
    expect(ring()).toBe('false')

    // Revelar una carta de la mano: otro color y otro cartel (la mano del rival no se ve, así que no hay aro, sólo la carta en el centro).
    tap(handOf(host).getAllByRole('listitem')[0]!)
    fireEvent.click(screen.getByRole('menuitem', { name: 'Revelar' }))
    flush()
    expect(stage()).toHaveAttribute('data-kind', 'reveal')
    expect(guest.container.querySelector('[data-activation]')).toHaveTextContent('Ana revela una carta')
    act(() => {
      vi.advanceTimersByTime(1000)
    })

    // Marcar un objetivo: la carta sale en el centro con su cartel, le queda el aro, y la mira se queda mientras esté marcada.
    myMonster()
    fireEvent.click(screen.getByRole('menuitem', { name: 'Target' }))
    flush()
    expect(stage()).toHaveAttribute('data-kind', 'target')
    expect(guest.container.querySelector('[data-activation]')).toHaveTextContent('Ana marca una carta como objetivo')
    expect(rivalCard()).toHaveAttribute('data-flash-kind', 'target')
    expect(rivalCard()).toHaveAttribute('data-targeted', 'true')
    act(() => {
      vi.advanceTimersByTime(1000)
    })
    expect(ring()).toBe('false')
    expect(rivalCard()).toHaveAttribute('data-targeted', 'true')
    expect(within(rivalCard()).getByRole('img', { name: 'Target' })).toBeInTheDocument()

    // Mandar la carta al cementerio es la única jugada que no se muestra grande: su carta viaja (lo anima la mesa), no sale cartel ni carta en el centro, y la línea queda en el registro.
    myMonster()
    fireEvent.click(screen.getByRole('menuitem', { name: 'Al cementerio' }))
    flush()
    expect(stage()).toBeNull()
    expect(guest.container.querySelector('[data-activation]')).toBeNull()
    click(guest, /^Chat/)
    expect(within(within(screen.getByRole('dialog')).getByRole('log')).getByText('Ana manda una carta al cementerio')).toBeInTheDocument()
    fireEvent.keyDown(document, { key: 'Escape' })

    // Deshacer lo de Ana no repite nada en la mesa de Beto.
    click(host, 'Deshacer')
    flush()
    allowUndo()
    expect(stage()).toBeNull()
    expect(guest.container.querySelector('[data-rival-drop="gy"]')?.getAttribute('aria-label')).toBe('GY: 0')
  })

  it('en escritorio lo que se centra en la mesa (la carta grande de un efecto del rival, y las tarjetas de pausa y de resultado) deja afuera la columna del chat; en el celular, no', () => {
    const edge = 'min-[1101px]:right-[20rem]'

    asDesktop()
    const { host, guest } = startDuel({ cardsById: monsters })
    openTable(host, guest)
    summonFirst(host)
    flush()
    tap(zoneOf(host, 'Zona de monstruo 1').getAllByRole('button')[0]!)
    fireEvent.click(screen.getByRole('menuitem', { name: 'Activar efecto' }))
    flush()
    expect(guest.container.querySelector('[data-activation]')).toHaveClass(edge)

    // Rendirse: la tarjeta del resultado tapa la mesa pero no el chat.
    click(host, 'Rendirme')
    fireEvent.click(within(screen.getByRole('alertdialog')).getByRole('button', { name: 'Rendirme' }))
    flush()
    expect(within(guest.container).getByRole('dialog', { name: '¡Ganaste!' }).parentElement).toHaveClass(edge)
  })

  it('el rival se puede marcar como objetivo: su carta del campo, su mano, su Main, su cementerio y su destierro; el dueño lo ve en lo suyo, y se quita igual', () => {
    const { host, guest } = startDuel({ cardsById: monsters })
    openTable(host, guest)
    summonFirst(host)
    flush()

    const markRival = (view: RenderResult, name: string, item: string) => {
      fireEvent.click(within(view.container).getByRole('button', { name }))
      fireEvent.click(screen.getByRole('menuitem', { name: item }))
      flush()
    }
    const gyOf = (view: RenderResult) => view.container.querySelector('[data-drop="gy"]')!

    // Su carta del campo: Beto la marca (menú pegado, una sola jugada) y Ana la ve en la suya; los dos con la mira.
    fireEvent.click(within(guest.container).getByRole('button', { name: 'Rival, Zona de monstruo 1: marcar' }))
    expect(screen.getByRole('menu')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('menuitem', { name: 'Target' }))
    flush()
    expect(zoneOf(host, 'Zona de monstruo 1').getByRole('img', { name: 'Target' })).toBeInTheDocument()
    expect(guest.container.querySelector('[data-rival-card-id]')).toHaveAttribute('data-targeted', 'true')

    // Sus pilas y su mano: la mira queda sobre cada una, de los dos lados.
    markRival(guest, 'GY: marcar', 'Target')
    markRival(guest, 'Banish: marcar', 'Target')
    markRival(guest, 'Main: marcar', 'Target')
    markRival(guest, 'Mano: marcar', 'Target')
    expect(gyOf(host)).toHaveAttribute('data-targeted', 'true')
    expect(host.container.querySelector('[data-drop="banished"]')).toHaveAttribute('data-targeted', 'true')
    expect(host.container.querySelector('[data-drop="deck"]')).toHaveAttribute('data-targeted', 'true')
    expect(host.container.querySelector('[data-marked="hand"]')).not.toBeNull()
    expect(guest.container.querySelector('[data-rival-drop="gy"]')).toHaveAttribute('data-targeted', 'true')
    expect(guest.container.querySelector('[data-rival-drop="hand"]')).toHaveAttribute('data-targeted', 'true')

    // Marcar de nuevo ofrece quitarla.
    markRival(guest, 'GY: marcar', 'Quitar target')
    markRival(guest, 'Mano: marcar', 'Quitar target')
    expect(gyOf(host)).toHaveAttribute('data-targeted', 'false')
    expect(host.container.querySelector('[data-marked="hand"]')).toBeNull()
    expect(host.container.querySelector('[data-drop="banished"]')).toHaveAttribute('data-targeted', 'true')

    // Y Ana también puede marcar lo de Beto (es de los dos lados).
    markRival(host, 'Extra: marcar', 'Target')
    expect(guest.container.querySelector('[data-drop="extra"]')).toHaveAttribute('data-targeted', 'true')
  })

  it('cuando el rival toca su deck o suma una carta a su mano, su deck y su mano se barajan y se ven', () => {
    const { host, guest } = startDuel({ cardsById: monsters })
    openTable(host, guest)

    const animated: Element[] = []
    const { animate, getAnimations, matchMedia } = { animate: Element.prototype.animate, getAnimations: Element.prototype.getAnimations, matchMedia: window.matchMedia }

    vi.stubGlobal('KeyframeEffect', class { get composite() { return 'replace' } })
    Element.prototype.getAnimations = () => []
    // Sólo se cuentan las animaciones del barajado (las demás, como los vuelos, duran otra cosa).
    Element.prototype.animate = function (this: Element, _frames: unknown, options?: KeyframeAnimationOptions | number) {
      if (typeof options === 'object' && options.duration === RIFFLE_MS) animated.push(this)

      return { cancel() {}, finish() {}, onfinish: null, oncancel: null } as unknown as Animation
    }
    window.matchMedia = (() => ({ matches: false, media: '', addEventListener: () => {}, removeEventListener: () => {}, addListener: () => {}, removeListener: () => {}, onchange: null, dispatchEvent: () => false })) as unknown as typeof window.matchMedia

    try {
      // Ana toca su deck y roba: Beto ve barajarse el deck de Ana (sus capas) y su mano (sus dorsos).
      tap(within(host.container).getByRole('button', { name: /^Main: [0-9]+$/ }))
      fireEvent.click(screen.getByRole('menuitem', { name: 'Robar' }))
      flush()

      const inRivalHand = animated.filter((element) => guest.container.contains(element) && element.closest('[data-rival-drop="hand"]') !== null)
      const inRivalDeck = animated.filter((element) => guest.container.contains(element) && element.hasAttribute('data-layer') && element.closest('[data-rival-drop="deck"]') !== null)

      expect(inRivalHand.length).toBeGreaterThan(0)
      expect(inRivalDeck.length).toBe(2)

      // Una jugada que no toca ni el deck ni la mano (poner una carta en el campo) no los baraja.
      animated.length = 0
      summonFirst(host)
      flush()
      expect(animated.filter((element) => guest.container.contains(element) && (element.closest('[data-rival-drop="hand"]') !== null || element.hasAttribute('data-layer')))).toHaveLength(0)
    } finally {
      vi.unstubAllGlobals()
      Element.prototype.animate = animate
      Element.prototype.getAnimations = getAnimations
      window.matchMedia = matchMedia
    }
  })

  it('el rival puede desplegar mi cementerio y mi destierro (no el deck, el Extra ni la mano) y marcar una carta de adentro', () => {
    const { host, guest } = startDuel({ cardsById: monsters })
    openTable(host, guest)
    summonFirst(host)
    flush()
    tap(zoneOf(host, 'Zona de monstruo 1').getAllByRole('button')[0]!)
    fireEvent.click(screen.getByRole('menuitem', { name: 'Al cementerio' }))
    flush()

    const itemsOf = (name: string) => {
      fireEvent.click(within(guest.container).getByRole('button', { name }))

      return screen.getAllByRole('menuitem').map((item) => item.textContent)
    }

    // Lo público se despliega; lo secreto, sólo se marca.
    expect(itemsOf('Main: marcar')).toEqual(['Señalar', 'Target'])
    fireEvent.keyDown(document, { key: 'Escape' })
    expect(itemsOf('Mano: marcar')).toEqual(['Señalar', 'Target'])
    fireEvent.keyDown(document, { key: 'Escape' })
    expect(itemsOf('GY: marcar')).toEqual(['Ver las cartas', 'Señalar', 'Target'])

    // El cementerio de Ana, con su carta (por su arte: no se sabe cómo se llama), y se la puede marcar.
    fireEvent.click(screen.getByRole('menuitem', { name: 'Ver las cartas' }))
    const viewer = () => within(screen.getByRole('dialog', { name: 'GY · 1' }))
    fireEvent.click(viewer().getByRole('button', { name: 'Carta del rival' }))
    fireEvent.click(screen.getByRole('menuitem', { name: 'Target' }))
    flush()

    // Ana ve la mira sobre su cementerio, y en el visor de Beto la carta la lleva.
    expect(host.container.querySelector('[data-drop="gy"]')).toHaveAttribute('data-targeted', 'true')
    expect(viewer().getByRole('button', { name: 'Carta del rival (target)' })).toBeInTheDocument()
    fireEvent.keyDown(document, { key: 'Escape' })

    // El destierro también se despliega (vacío).
    expect(itemsOf('Banish: marcar')).toEqual(['Ver las cartas', 'Señalar', 'Target'])
    fireEvent.click(screen.getByRole('menuitem', { name: 'Ver las cartas' }))
    expect(within(screen.getByRole('dialog', { name: 'Banish · 0' })).getByText('No hay cartas acá.')).toBeInTheDocument()
  })

  it('cuando Ana agrega a su mano una carta de su deck (la busca), Beto la ve de frente en la animación y no de dorso', () => {
    const { host, guest } = startDuel({ cardsById: monsters })
    openTable(host, guest)

    tap(within(host.container).getByRole('button', { name: /^Main: [0-9]+$/ }))
    fireEvent.click(screen.getByRole('menuitem', { name: 'Ver el deck' }))
    fireEvent.click(within(screen.getByRole('dialog', { name: /Main/ })).getAllByRole('button', { name: /^Monstruo/ })[0]!)
    fireEvent.click(screen.getByRole('menuitem', { name: 'A la mano' }))
    flush()

    const stage = guest.container.querySelector('[data-activation]')!
    expect(stage).toHaveAttribute('data-kind', 'hand')
    expect(guest.container.querySelector('[data-activation]')).toHaveTextContent('Ana lleva una carta a su mano')
    // La carta del frente tiene su imagen (la del dorso no la tendría).
    expect(stage.querySelector('img')).not.toBeNull()
  })

  it('Beto puede ver el detalle de una carta de Ana que ya está a la vista (y de una boca abajo, no)', async () => {
    const { host, guest } = startDuel({ cardsById: monsters })
    openTable(host, guest)
    summonFirst(host)
    flush()

    // Tocar la carta de Ana abre su menú: marcarla y ver su detalle (que se pide por su número).
    fireEvent.click(within(guest.container).getByRole('button', { name: 'Rival, Zona de monstruo 1: marcar' }))
    expect(screen.getAllByRole('menuitem').map((item) => item.textContent)).toEqual(['Señalar', 'Target', 'Ver carta'])
    fireEvent.click(screen.getByRole('menuitem', { name: 'Ver carta' }))
    await act(async () => {})
    expect(screen.getByRole('dialog', { name: /^Detalle de Carta \d+$/ })).toBeInTheDocument()
    fireEvent.keyDown(document, { key: 'Escape' })

    // Una carta boca abajo no se sabe cuál es: sólo se puede marcar.
    tap(handOf(host).getAllByRole('listitem')[0]!)
    fireEvent.click(screen.getByRole('menuitem', { name: 'Colocar' }))
    fireEvent.click(within(host.container).getByRole('button', { name: 'Zona de monstruo 2: elegir' }))
    flush()
    fireEvent.click(within(guest.container).getByRole('button', { name: 'Rival, Zona de monstruo 2: marcar' }))
    expect(screen.getAllByRole('menuitem').map((item) => item.textContent)).toEqual(['Señalar', 'Target'])
  })

  it('Señalar es temporal y distinto de Target: un aro que late un rato en las dos pantallas, sin dejar marca ni jugada, y se va solo; también se señala una carta propia del campo', () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] })
    const { host, guest } = startDuel({ cardsById: monsters })
    openTable(host, guest)
    summonFirst(host)
    flush()
    act(() => {
      vi.advanceTimersByTime(1500)
    })
    const ring = (view: RenderResult) => view.container.querySelector('[data-pointed="true"]')

    expect(ring(host)).toBeNull()
    expect(ring(guest)).toBeNull()

    // Beto señala la carta de Ana: la ve en su zona (y Beto, en la de ella); no queda marcada como objetivo.
    fireEvent.click(within(guest.container).getByRole('button', { name: 'Rival, Zona de monstruo 1: marcar' }))
    fireEvent.click(screen.getByRole('menuitem', { name: 'Señalar' }))
    flush()
    expect(ring(host)).toHaveAttribute('data-drop', 'mz:0')
    expect(ring(guest)).toHaveAttribute('aria-label', 'Rival, Zona de monstruo 1')
    expect(host.container.querySelector('[data-targeted="true"]')).toBeNull()

    // Late un rato y se va solo (también con el chat y las jugadas siguiendo).
    act(() => {
      vi.advanceTimersByTime(2600)
    })
    expect(ring(host)).toBeNull()
    expect(ring(guest)).toBeNull()

    // Ana señala su propia carta del campo: está entre las jugadas de la carta, y Beto la ve en el campo de su rival.
    tap(zoneOf(host, 'Zona de monstruo 1').getAllByRole('button')[0]!)
    fireEvent.click(screen.getByRole('menuitem', { name: 'Señalar' }))
    flush()
    expect(ring(host)).toHaveAttribute('data-drop', 'mz:0')
    expect(ring(guest)).toHaveAttribute('aria-label', 'Rival, Zona de monstruo 1')
  })

  it('Deshacer le pide permiso al rival: él ve un aviso sobre la línea del registro (no un diálogo que tapa la mesa) para permitirlo o no, y quien pidió espera con Deshacer apagado y la jugada sigue hasta que se lo permitan', () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] })
    const { host, guest } = startDuel({ cardsById: monsters })
    openTable(host, guest)
    summonFirst(host)
    flush()
    const monsterCards = () => zoneOf(host, 'Zona de monstruo 1').queryAllByRole('button')

    click(host, 'Deshacer')
    flush()

    // Ana espera (sin poder pedirlo de nuevo) y su jugada sigue; Beto ve el cartel.
    expect(within(host.container).getByRole('button', { name: 'Deshacer' })).toBeDisabled()
    expect(monsterCards()).toHaveLength(1)
    const lane = (view: RenderResult, kind: string) => view.container.querySelector<HTMLElement>(`[data-lane="${kind}"]`)
    // Sin diálogo: nada tapa la mesa. El aviso se apoya sobre la línea del registro (la misma fila: no suma alto).
    expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument()
    expect(lane(guest, 'undoAsked')).toHaveTextContent('Ana quiere volver atrás su jugada')
    expect(lane(guest, 'undoAsked')!.parentElement).toHaveClass('relative', 'basis-full')
    // Quien pidió ve que espera, en el mismo lugar.
    expect(lane(host, 'undoAsking')).toHaveTextContent('Le pedís a Beto volver atrás tu jugada…')
    const ask = within(lane(guest, 'undoAsked')!)

    // No lo permite: el aviso se va, Ana ve que no se lo permitió, puede volver a pedir y su jugada sigue en la mesa.
    fireEvent.click(ask.getByRole('button', { name: 'No permitir' }))
    flush()
    expect(lane(guest, 'undoAsked')).toBeNull()
    expect(lane(host, 'undoResult')).toHaveTextContent('Beto no permitió volver atrás tu jugada.')
    act(() => {
      vi.advanceTimersByTime(4500)
    })
    expect(lane(host, 'undoResult')).toBeNull()
    expect(within(host.container).getByRole('button', { name: 'Deshacer' })).toBeEnabled()
    expect(monsterCards()).toHaveLength(1)

    // Lo permite: ahora sí se deshace, en las dos mesas.
    click(host, 'Deshacer')
    flush()
    allowUndo()
    expect(monsterCards()).toHaveLength(0)
    expect(guest.container.querySelector('[data-rival-card-id]')).toBeNull()
  })

  it('juegos: moneda, piedra-papel-tijera y quién empieza; los dos ven lo mismo y la elección del rival no se ve hasta elegir la propia', () => {
    const host = render(<DuelScreen {...screenProps()} />)
    typeInto(host, 'Tu nombre', 'Ana')
    createRoom(host)
    const link = within(host.container).getByTestId('duel-link').textContent ?? ''
    window.history.replaceState(null, '', '#duel')
    const guest = render(<DuelScreen {...screenProps()} />)
    typeInto(guest, 'Tu nombre', 'Beto')
    joinByLink(guest, link)
    flush()
    openTable(host, guest)

    const panel = () => within(screen.getByRole('dialog', { name: 'Juegos' }))
    const open = (view: RenderResult) => openGames(view)
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
    createRoom(host)
    const link = within(host.container).getByTestId('duel-link').textContent ?? ''
    window.history.replaceState(null, '', '#duel')
    const guest = render(<DuelScreen {...screenProps(props)} />)
    typeInto(guest, 'Tu nombre', 'Beto')
    joinByLink(guest, link)
    flush()
    return { host, guest }
  }

  it('otro deck: se pega un .ydk, se buscan las cartas y se juega con ese; se recuerda y, sin deck armado, se vuelve a usar solo', async () => {
    const small = { mainIds: mainIds.slice(0, 2), extraIds: [], cardsById: new Map() }
    const view = render(<DuelScreen {...screenProps(small)} />)

    expect(within(view.container).getByRole('button', { name: 'Retar a un amigo' })).toBeDisabled()
    openDeck(view)
    fireEvent.click(deckDialog().getByRole('button', { name: 'Usar otro deck' }))

    // Algo que no es un deck se dice y no cambia nada.
    fireEvent.change(deckDialog().getByRole('textbox', { name: 'ydke://… o el texto del .ydk' }), { target: { value: 'Dark Magician x3' } })
    fireEvent.click(deckDialog().getByRole('button', { name: 'Usar este deck' }))
    expect(await deckDialog().findByText(/No reconozco ese deck/)).toBeInTheDocument()

    // Un .ydk de verdad: 41 cartas en el Main (una que no existe) y 1 en el Extra; el Side no cuenta.
    const ydk = ['#created by Ana', '#main', ...Array.from({ length: 40 }, (_, index) => String(1000 + index)), '999', '#extra', '9001', '!side', '5'].join('\n')
    fireEvent.change(deckDialog().getByRole('textbox', { name: 'ydke://… o el texto del .ydk' }), { target: { value: ydk } })
    fireEvent.click(deckDialog().getByRole('button', { name: 'Usar este deck' }))

    expect(await deckDialog().findByText('Deck importado: 41 cartas en el Main y 1 en el Extra')).toBeInTheDocument()
    expect(deckDialog().getByText(/1 cartas no se reconocieron/)).toBeInTheDocument()
    expect(localStorage.getItem('ygo-lab:duel-deck')).toContain('#main')
    closeMore()
    expect(within(view.container).getByRole('button', { name: 'Retar a un amigo' })).toBeEnabled()

    // Volver al del builder quita el importado y lo olvida.
    openDeck(view)
    fireEvent.click(deckDialog().getByRole('button', { name: 'Volver al deck del builder' }))
    closeMore()
    expect(within(view.container).getByRole('button', { name: 'Retar a un amigo' })).toBeDisabled()
    expect(localStorage.getItem('ygo-lab:duel-deck')).toBeNull()

    // Con un deck guardado y el builder vacío, la pantalla lo usa sola al abrir.
    localStorage.setItem('ygo-lab:duel-deck', ydk)
    cleanup()
    const again = render(<DuelScreen {...screenProps(small)} />)
    openDeck(again)
    expect(await deckDialog().findByText('Deck importado: 41 cartas en el Main y 1 en el Extra')).toBeInTheDocument()

    // Y con un deck armado en el builder no se pisa solo.
    cleanup()
    const builder = render(<DuelScreen {...screenProps()} />)
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 30))
    })
    openDeck(builder)
    expect(deckDialog().getByText('El del builder: Mi deck (40 cartas en el Main)')).toBeInTheDocument()
    expect(deckDialog().queryByText(/Deck importado/)).not.toBeInTheDocument()
  })

  it('un duelo se juega con 40 cartas en el Main como mínimo: con menos se dice y no se puede estar listo', () => {
    const host = render(<DuelScreen {...screenProps()} />)
    createRoom(host)
    const link = within(host.container).getByTestId('duel-link').textContent ?? ''
    window.history.replaceState(null, '', '#duel')
    const guest = render(<DuelScreen {...screenProps({ mainIds: mainIds.slice(0, 39) })} />)
    joinByLink(guest, link)
    flush()

    expect(within(guest.container).getByText(/Tu Main tiene 39 cartas y un duelo se juega con 40 como mínimo/)).toBeInTheDocument()
    expect(within(guest.container).getByRole('button', { name: 'Estoy listo' })).toBeDisabled()
    expect(within(host.container).queryByText(/Tu Main tiene/)).not.toBeInTheDocument()
  })

  it('otro deck: la mano se reparte con las cartas del deck pegado, y el rival juega con las suyas', async () => {
    const small = { mainIds: mainIds.slice(0, 2), extraIds: [], cardsById: new Map() }
    const host = render(<DuelScreen {...screenProps(small)} />)
    typeInto(host, 'Tu nombre', 'Ana')
    openDeck(host)
    fireEvent.click(deckDialog().getByRole('button', { name: 'Usar otro deck' }))
    const ydk = ['#main', ...Array.from({ length: 40 }, (_, index) => String(2000 + index))].join('\n')
    fireEvent.change(deckDialog().getByRole('textbox', { name: 'ydke://… o el texto del .ydk' }), { target: { value: ydk } })
    fireEvent.click(deckDialog().getByRole('button', { name: 'Usar este deck' }))
    await deckDialog().findByText('Deck importado: 40 cartas en el Main y 0 en el Extra')
    closeMore()
    createRoom(host)
    const link = within(host.container).getByTestId('duel-link').textContent ?? ''
    window.history.replaceState(null, '', '#duel')
    const guest = render(<DuelScreen {...screenProps()} />)
    typeInto(guest, 'Tu nombre', 'Beto')
    joinByLink(guest, link)
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

    for (const view of [host, guest]) {
      const rules = within(within(view.container).getByTestId('room-summary'))

      expect(rules.getByText('Vida inicial').nextElementSibling).toHaveTextContent('8000')
      expect(rules.getByText('Mano inicial').nextElementSibling).toHaveTextContent('5')
      expect(rules.getByText('Tiempo').nextElementSibling).toHaveTextContent('50 min')
    }

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

    openGames(guest)
    fireEvent.click(panel().getByRole('button', { name: 'Rendirme' }))
    // Cancelar no se rinde.
    fireEvent.click(panel().getByRole('button', { name: 'Cancelar' }))
    expect(within(host.container).queryByText(/se rindió/)).not.toBeInTheDocument()
    fireEvent.click(panel().getByRole('button', { name: 'Rendirme' }))
    expect(panel().getByText('¿Seguro? Gana Ana.')).toBeInTheDocument()
    fireEvent.click(panel().getByRole('button', { name: 'Rendirme' }))
    flush()

    const hostResult = within(within(host.container).getByRole('dialog', { name: '¡Ganaste!' }))
    expect(hostResult.getByText('Beto se rindió.')).toBeInTheDocument()
    const guestResult = within(within(guest.container).getByRole('dialog', { name: 'Perdiste' }))
    expect(guestResult.getByText('Te rendiste.')).toBeInTheDocument()

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
    allowUndo()
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
    openGames(host)
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
    expect(sheet().getByRole('button', { name: /^Sumar 500/ })).toBeEnabled()
    // Borrar saca de a un dígito: 18 es 1800 y, sin el 8, 100.
    key('Borrar el último dígito')
    expect(sheet().getByText('Tecleá el monto')).toBeInTheDocument()
    expect(sheet().getByRole('button', { name: /^Sumar 0/ })).toBeDisabled()
    key('1')
    key('8')
    expect(sheet().getByText('7200 + 1800')).toBeInTheDocument()
    key('Borrar el último dígito')
    expect(sheet().getByText('7200 + 100')).toBeInTheDocument()
    key('Borrar el último dígito')
    key('5')
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

    // En la sala el chat está siempre a un toque (también antes de que entre el rival), en una hoja que se abre desde «Chat».
    const roomChat = (view: RenderResult) => {
      click(view, 'Chat')

      return within(screen.getByRole('dialog', { name: 'Chat' }))
    }
    const closeChat = () => fireEvent.keyDown(document, { key: 'Escape' })

    let inChat = roomChat(host)
    fireEvent.change(inChat.getByLabelText('Escribí un mensaje'), { target: { value: 'Hola, ya entro' } })
    fireEvent.click(inChat.getByRole('button', { name: 'Enviar' }))
    flush()
    closeChat()
    inChat = roomChat(guest)
    expect(inChat.getByText('Hola, ya entro')).toBeInTheDocument()

    // Un mensaje rápido va con un toque. Las señales, sólo con su emoji (🤔 pensando, ✋ esperá, 👍 continuá): nada de una lista larga ni de texto.
    const quick = inChat.getByRole('group', { name: 'Mensajes rápidos' })
    expect(within(quick).getAllByRole('button').map((button) => button.getAttribute('aria-label') ?? button.textContent)).toEqual(['Pensando…', 'Esperá', 'Continuá'])
    for (const button of within(quick).getAllByRole('button')) {
      // Sin texto: sólo el emoji (y, tras apretarlo, su copia que sube).
      expect(button.textContent).toMatch(/^\p{Extended_Pictographic}+$/u)
      // Grandes: el emoji de 33 px en un botón de 56 (con el pulgar se acierta y se ve lo que se manda).
      expect(button).toHaveClass('h-14', 'w-14', 'text-stat')
    }
    fireEvent.click(within(quick).getByRole('button', { name: 'Pensando…' }))
    fireEvent.click(within(quick).getByRole('button', { name: 'Continuá' }))
    flush()
    closeChat()

    const hostLog = roomChat(host).getByRole('log', { name: 'Chat con Beto' })
    // Un emoji solo se ve grande, como una reacción.
    expect(within(hostLog).getByText('🤔', { exact: false })).toHaveClass('text-display')
    expect(within(hostLog).getAllByText('👍', { exact: false }).at(-1)).toHaveClass('text-display')
    closeChat()

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

  it('"Pasar turno" se enciende recién en la End Phase y sólo para quien tiene el turno; un toque lo pasa, sin confirmar, y la fase va en el color de quien juega', () => {
    const { host, guest } = startDuel()
    openTable(host, guest)

    const phase = (view: RenderResult) => within(view.container).getByTestId('duel-phase').textContent
    const pass = (view: RenderResult) => within(view.container).getByRole('button', { name: 'Pasar turno' })
    const phaseButton = (view: RenderResult, name: string) => within(view.container).getByRole('button', { name })

    // Ni Ana (con el turno) ni Beto lo pueden tocar antes de la End Phase. La fase actual de Ana va en violeta claro (lo tuyo) y la misma, vista por Beto, en ámbar (lo del rival).
    expect(pass(host)).toBeDisabled()
    expect(pass(guest)).toBeDisabled()
    click(host, 'Main Phase 1')
    flush()
    expect(pass(host)).toBeDisabled()
    expect(phaseButton(host, 'Main Phase 1')).toHaveClass('bg-accent')
    expect(phaseButton(guest, 'Main Phase 1')).toHaveClass('bg-info')

    // En la End Phase se enciende, sólo el de Ana. Un solo toque termina el turno: Beto lo ve y ahora el botón es de él (todavía apagado: le falta llegar a su End Phase).
    click(host, 'End Phase')
    flush()
    expect(pass(host)).toBeEnabled()
    expect(pass(guest)).toBeDisabled()
    click(host, 'Pasar turno')
    flush()
    expect(within(guest.container).getAllByText('Tu turno').length).toBeGreaterThan(0)
    expect(phase(guest)).toBe(' · Draw Phase')
    expect(pass(host)).toBeDisabled()
    expect(pass(guest)).toBeDisabled()
    expect(phaseButton(guest, 'Draw Phase')).toHaveClass('bg-accent')
    expect(phaseButton(host, 'Draw Phase')).toHaveClass('bg-info')
  })

  it('el registro del duelo: lo escrito, el comienzo de cada turno y lo que hizo cada uno van en orden en el chat, y la línea sobre el campo muestra lo último y lo abre', () => {
    const { host, guest } = startDuel()
    openTable(host, guest)

    // Sin nada que mostrar, la línea del registro no ocupa lugar.
    expect(within(host.container).queryByRole('button', { name: 'Abrir el registro de jugadas' })).not.toBeInTheDocument()

    // Ana pasa el turno y Beto escribe: la línea de Ana muestra lo último escrito.
    passTurn(host)
    click(guest, 'Chat')
    const guestChat = () => within(screen.getByRole('dialog', { name: 'Chat con Ana' }))
    fireEvent.change(guestChat().getByLabelText('Escribí un mensaje'), { target: { value: 'Dale, mi turno' } })
    fireEvent.click(guestChat().getByRole('button', { name: 'Enviar' }))
    flush()
    fireEvent.keyDown(document, { key: 'Escape' })
    expect(within(host.container).getByRole('button', { name: /^Abrir el registro de jugadas: Beto: Dale, mi turno/ })).toHaveTextContent('Beto: Dale, mi turno')

    // Tocarla abre el chat, con el comienzo del turno y lo escrito en el orden en que pasó.
    click(host, /^Abrir el registro de jugadas/)
    const log = within(within(screen.getByRole('dialog', { name: 'Chat con Beto' })).getByRole('log'))
    const rows = log.getAllByRole('listitem').map((row) => row.textContent)
    expect(rows[0]).toBe('Turno 2 · Beto')
    expect(rows[1]).toContain('Dale, mi turno')
  })

  it('el registro no repite el comienzo de un turno al deshacer y volver a pasarlo, ni anota el turno que retrocede', () => {
    const { host, guest } = startDuel()
    openTable(host, guest)

    passTurn(host)
    click(host, 'Deshacer')
    flush()
    allowUndo()
    click(host, 'Pasar turno')
    flush()

    click(guest, 'Chat')
    const rows = within(within(screen.getByRole('dialog', { name: 'Chat con Ana' })).getByRole('log'))
      .getAllByRole('listitem')
      .map((row) => row.textContent)
    expect(rows.filter((text) => text?.startsWith('Turno'))).toEqual(['Turno 2 · Beto'])
  })

  it('mirar un duelo: el anfitrión da un enlace para espectadores y ve cuántos miran; son hasta dos', async () => {
    const written: string[] = []
    Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText: async (text: string) => void written.push(text) } })
    const { host, guest } = startDuel()
    const watching = (view: RenderResult) => within(within(view.container).getByTestId('room-summary')).getByText('Mirando').nextElementSibling

    expect(watching(host)).toHaveTextContent('0 de 2')
    await act(async () => {
      click(host, 'Copiar enlace para mirar')
    })
    expect(written.at(-1)).toMatch(/#duel\?room=[A-Z0-9]{8}&watch=1$/)

    // Alguien entra a mirar: los dos jugadores lo ven en la ficha de la sala; con dos, no entra un tercero.
    memory.spectate()
    flush()
    expect(watching(host)).toHaveTextContent('1 de 2')
    expect(watching(guest)).toHaveTextContent('1 de 2')
    memory.spectate()
    flush()
    expect(watching(host)).toHaveTextContent('2 de 2')
    expect(watching(guest)).toHaveTextContent('2 de 2')
    expect(() => memory.spectate()).toThrow()
  })

  it('quien mira una sala antes de que empiece el duelo ve quiénes están y si están listos, las reglas, y lo que escriben y tiran los jugadores', () => {
    const { host, guest } = startDuel()
    const room = extractRoomCode(window.location.hash)!

    window.history.replaceState(null, '', `#duel?room=${room}&watch=1`)
    const watcher = render(<DuelScreen {...screenProps({ mainIds: [], extraIds: [], cardsById: new Map() })} />)
    flush()
    flush()
    const view = within(watcher.container)
    const seat = (name: string) => view.getByText(name).closest('li')!

    // Quiénes están, y si ya tocaron «Estoy listo» (en verde).
    expect(seat('Ana')).toHaveAttribute('data-ready', 'false')
    expect(seat('Beto')).toHaveAttribute('data-ready', 'false')
    expect(within(view.getByTestId('room-summary')).getByText('Single')).toBeInTheDocument()

    click(host, 'Estoy listo')
    flush()
    expect(seat('Ana')).toHaveAttribute('data-ready', 'true')
    expect(seat('Ana')).toHaveClass('border-success/60')
    expect(seat('Beto')).toHaveAttribute('data-ready', 'false')

    // El chat de los jugadores y lo que tiran, juntos y de sólo lectura.
    click(host, 'Chat')
    const chat = within(screen.getByRole('dialog', { name: 'Chat' }))
    fireEvent.change(chat.getByLabelText('Escribí un mensaje'), { target: { value: 'Suerte' } })
    fireEvent.click(chat.getByRole('button', { name: 'Enviar' }))
    flush()
    fireEvent.keyDown(document, { key: 'Escape' })
    click(guest, 'Estoy listo')
    flush()
    click(host, 'Piedra, papel o tijera')
    flush()

    const log = within(view.getByRole('log', { name: 'Chat de los jugadores' }))
    expect(log.getByText('Suerte')).toBeInTheDocument()
    expect(log.getByText(/eligió piedra, papel o tijera/)).toBeInTheDocument()
    expect(view.queryByRole('textbox')).not.toBeInTheDocument()
  })

  it('«Salir» es una X (en la sala, en la pausa, en el resultado y mirando), nunca un botón con la palabra', () => {
    const { host } = startDuel()
    const leave = within(host.container).getByRole('button', { name: 'Salir' })

    expect(leave).toHaveTextContent('')
    expect(leave.querySelector('svg')).not.toBeNull()
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
    createRoom(host)
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

  it('un enlace de una sala vacía, tras unos segundos, dice que ya no funciona y deja crear una sala directo', () => {
    vi.useFakeTimers()
    window.history.replaceState(null, '', '#duel?room=K7QF2M9X')

    const view = render(<DuelScreen {...screenProps()} />)
    flush()

    expect(within(view.container).queryByRole('heading', { name: 'Ese enlace ya no funciona' })).not.toBeInTheDocument()
    act(() => {
      vi.advanceTimersByTime(13_000)
    })
    expect(within(view.container).getByRole('heading', { name: 'Ese enlace ya no funciona' })).toBeInTheDocument()
    expect(within(view.container).getByText(/ya tiene a sus dos jugadores/)).toBeInTheDocument()

    // «Crear una sala» vuelve al inicio de Jugar con las reglas ya abiertas.
    click(view, 'Crear una sala')
    expect(rulesDialog()).toBeInTheDocument()
    expect(window.location.hash).toBe('#duel')
  })

  it('Mirar un duelo: una pantalla propia donde se pega el enlace o el código y se entra de espectador, sin deck', () => {
    window.history.replaceState(null, '', '#duel?view=watch')
    const view = render(<DuelScreen {...screenProps({ mainIds: [], extraIds: [], cardsById: new Map() })} />)

    expect(within(view.container).getByRole('heading', { name: 'Mirar un duelo' })).toBeInTheDocument()
    expect(within(view.container).getByRole('button', { name: 'Mirar el duelo' })).toBeDisabled()

    // Algo que no es un enlace se dice y no entra a ningún lado.
    typeInto(view, 'Pegá el enlace del duelo', 'hola')
    click(view, 'Mirar el duelo')
    expect(within(view.container).getByRole('alert')).toHaveTextContent(/no parece un código de duelo/)
    expect(window.location.hash).toBe('#duel')

    // Un enlace común también entra a mirar (esta pantalla no es para jugar).
    typeInto(view, 'Pegá el enlace del duelo', 'http://x.test/#duel?room=K7QF2M9X')
    click(view, 'Mirar el duelo')
    expect(window.location.hash).toBe('#duel?room=K7QF2M9X&watch=1')
  })

  it('el menú del celular abre el lobby ya en el paso que se eligió (#duel?view=…), también si el duelo ya estaba abierto, y borra el pedido de la dirección', () => {
    // Nueva sala: abre ya con las reglas del duelo.
    window.history.replaceState(null, '', '#duel?view=create')
    const created = render(<DuelScreen {...screenProps()} />)

    expect(rulesDialog()).toBeInTheDocument()
    expect(window.location.hash).toBe('#duel')
    created.unmount()

    // Mirar un duelo, con el duelo ya abierto en el lobby (el pedido llega como un cambio de dirección).
    window.history.replaceState(null, '', '#duel')
    const view = render(<DuelScreen {...screenProps()} />)

    expect(within(view.container).getByRole('button', { name: 'Jugar ahora' })).toBeInTheDocument()
    act(() => {
      window.location.hash = '#duel?view=watch'
      window.dispatchEvent(new HashChangeEvent('hashchange'))
    })
    expect(within(view.container).getByRole('heading', { name: 'Mirar un duelo' })).toBeInTheDocument()
    expect(window.location.hash).toBe('#duel')
    click(view, 'Volver al inicio del duelo')

    // Entrar con un enlace: el campo del enlace recibe el foco.
    act(() => {
      window.location.hash = '#duel?view=join'
      window.dispatchEvent(new HashChangeEvent('hashchange'))
    })
    expect(within(view.container).getByRole('textbox', { name: 'Enlace o código' })).toHaveFocus()
    expect(window.location.hash).toBe('#duel')
  })

  it('Mirar un duelo se puede cancelar y vuelve al inicio del duelo', () => {
    window.history.replaceState(null, '', '#duel?view=watch')
    const view = render(<DuelScreen {...screenProps()} />)

    click(view, 'Cancelar')

    expect(within(view.container).getByRole('button', { name: 'Jugar ahora' })).toBeInTheDocument()
  })

  it('pegar un enlace para mirar entra de espectador aunque no haya deck, y uno común sigue pidiéndolo', () => {
    window.history.replaceState(null, '', '#duel')
    const view = render(<DuelScreen {...screenProps({ mainIds: [], extraIds: [], cardsById: new Map() })} />)

    click(view, 'Tengo un código')
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
    createRoom(host)
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
    expect(guestView.queryByRole('button', { name: 'Cambiar deck' })).not.toBeInTheDocument()
    expect(within(host.container).getByText('Listo')).toBeInTheDocument()
  })

  it('los dos jugadores no pueden llamarse igual: el invitado que llega con el mismo nombre pasa a llamarse con un número, y el nombre del rival no se acepta', () => {
    const { host, guest } = startDuel()
    // Ana (anfitrión) y Beto (invitado) ya están en la sala.
    const guestInput = within(guest.container).getByLabelText('Tu nombre')

    // El invitado quiere llamarse como el anfitrión: no se acepta, avisa y el campo vuelve al que estaba.
    fireEvent.change(guestInput, { target: { value: ' ana ' } })
    fireEvent.blur(guestInput)
    flush()
    expect(within(host.container).queryByText('ana')).not.toBeInTheDocument()
    expect(guestInput).toHaveValue('Beto')
    expect(within(host.container).getByText('Beto')).toBeInTheDocument()
  })

  it('un nombre tiene hasta 20 caracteres', () => {
    const view = render(<DuelScreen {...screenProps()} />)

    expect(within(view.container).getByLabelText('Tu nombre')).toHaveAttribute('maxlength', '20')
  })

  it('quien llega con el mismo nombre que el anfitrión pasa a llamarse con un número (sin tocar el nombre guardado)', () => {
    const host = render(<DuelScreen {...screenProps()} />)
    typeInto(host, 'Tu nombre', 'Ana')
    createRoom(host)
    const link = within(host.container).getByTestId('duel-link').textContent ?? ''
    window.history.replaceState(null, '', '#duel')
    const guest = render(<DuelScreen {...screenProps()} />)
    typeInto(guest, 'Tu nombre', 'ANA')
    joinByLink(guest, link)
    flush()
    flush()

    expect(within(guest.container).getByLabelText('Tu nombre')).toHaveValue('ANA 2')
    expect(within(host.container).getByText('ANA 2')).toBeInTheDocument()
    expect(localStorage.getItem('ygo-lab:duel-name')).toBe('ANA')
  })

  it('en el celular el chat de la sala está siempre a un toque, también antes de que entre el rival', () => {
    const host = render(<DuelScreen {...screenProps()} />)
    createRoom(host)

    click(host, 'Chat')
    expect(within(screen.getByRole('dialog', { name: 'Chat' })).getByText('Cuando entre tu rival, acá se hablan.')).toBeInTheDocument()
  })

  it('en una sala llena «Mirar el duelo» entra de espectador, sin deck', () => {
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
      reconnect: () => {},
      close: () => {},
    }
    const view = render(<DuelScreen {...screenProps({ connect: () => full, mainIds: [], extraIds: [], cardsById: new Map() })} />)

    click(view, 'Mirar el duelo')
    expect(window.location.hash).toBe('#duel?room=K7QF2M9X&watch=1')
  })

  it('quien entra por un enlace sin deck lo ve explicado y puede elegir uno ahí mismo', () => {
    const { guest } = arriveByLink({ mainIds: mainIds.slice(0, 2), extraIds: [], cardsById: new Map() })
    const view = within(guest.container)

    expect(view.getByRole('button', { name: 'Estoy listo' })).toBeDisabled()
    expect(view.getByText(/hacen falta 5 cartas en el Main y tu deck tiene 2/)).toBeInTheDocument()
    click(guest, 'Cambiar deck')
    fireEvent.click(within(screen.getByRole('dialog', { name: 'Tu deck' })).getByRole('button', { name: 'Usar otro deck' }))
    expect(within(screen.getByRole('dialog', { name: 'Tu deck' })).getByLabelText('ydke://… o el texto del .ydk')).toBeInTheDocument()
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
    // La de la barra es la primera (con el resultado en pantalla, la tarjeta tiene la suya debajo).
    fireEvent.click(within(view.container).getAllByRole('button', { name: 'Salir del duelo' })[0]!)
    fireEvent.click(within(screen.getByRole('alertdialog')).getByRole('button', { name: 'Salir y dejar en pausa' }))
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
    expect(within(guest.container).getByRole('button', { name: 'Jugar ahora' })).toBeInTheDocument()
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

  it('si el duelo entra en pausa con un cartel de opciones abierto (el de una carta del rival o el de una propia), no se ve, y no vuelve al seguir', () => {
    const { host, guest } = startDuel({ cardsById: monsters })
    openTable(host, guest)

    const pauseOf = () => within(guest.container).queryByRole('alertdialog', { name: 'Duelo en pausa' })

    // El menú de lo del rival (su cementerio) abierto cuando Ana sale.
    fireEvent.click(within(guest.container).getByRole('button', { name: 'GY: marcar' }))
    expect(screen.getByRole('menu')).toBeInTheDocument()
    leaveDuel(host)
    flush()
    expect(pauseOf()).toBeInTheDocument()
    expect(screen.queryByRole('menu')).not.toBeInTheDocument()

    // Ana vuelve: el menú no reaparece.
    click(host, 'Volver al duelo')
    flush()
    flush()
    expect(pauseOf()).not.toBeInTheDocument()
    expect(screen.queryByRole('menu')).not.toBeInTheDocument()

    // Lo mismo con el menú de una carta propia.
    tap(handOf(guest).getAllByRole('listitem')[0]!)
    expect(screen.getByRole('menu')).toBeInTheDocument()
    leaveDuel(host)
    flush()
    expect(pauseOf()).toBeInTheDocument()
    expect(screen.queryByRole('menu')).not.toBeInTheDocument()
  })

  it('en pausa se puede reconectar sin salir del duelo: si el aviso de que el rival está se perdió, se retoma con la mesa como estaba', () => {
    const ends: MemoryEnd[] = []
    connect = () => {
      const end = memory.join()
      ends.push(end)
      return asSocket(end)
    }
    const { host, guest } = startDuel({ cardsById: monsters })
    openTable(host, guest)
    const summoned = summonFirst(host)
    flush()

    // El relay dijo que el rival no está y no lo repitió: la mesa queda tapada aunque el rival siga ahí.
    act(() => ends[0]!.notify(false))
    const pause = within(host.container).getByRole('alertdialog', { name: 'Duelo en pausa' })
    expect(within(pause).getByRole('button', { name: 'Salir del duelo' })).toBeInTheDocument()

    // Reconectar vuelve a pedirle al relay cómo está la sala (acá, la sala en memoria contesta que el rival está).
    const reconnect = vi.spyOn(ends[0]!, 'reconnect').mockImplementation(() => ends[0]!.notify(true))
    fireEvent.click(within(pause).getByRole('button', { name: 'Reconectar' }))
    flush()

    expect(reconnect).toHaveBeenCalledTimes(1)
    expect(within(host.container).queryByRole('alertdialog', { name: 'Duelo en pausa' })).not.toBeInTheDocument()
    expect(zoneOf(host, 'Zona de monstruo 1').getByLabelText(summoned)).toBeInTheDocument()
  })

  it('Reconectar está a la vista de los dos jugadores siempre, y si cualquiera lo toca el duelo sigue: aunque el que lo toque no vea ninguna pausa', () => {
    const ends: MemoryEnd[] = []
    connect = () => {
      const end = memory.join()
      ends.push(end)
      return asSocket(end)
    }
    const { host, guest } = startDuel()
    openTable(host, guest)

    // Los dos lo tienen a un toque (detrás de «Más opciones», con la mesa a la vista).
    expect(moreButton(host, 'Reconectar')).toBeInTheDocument()
    closeMore()
    expect(moreButton(guest, 'Reconectar')).toBeInTheDocument()
    closeMore()

    // Ana ve el duelo en pausa por un aviso perdido; Beto no ve nada raro y es él quien toca Reconectar: el relay le avisa de nuevo a los dos.
    act(() => ends[0]!.notify(false))
    expect(within(host.container).getByRole('alertdialog', { name: 'Duelo en pausa' })).toBeInTheDocument()
    expect(within(guest.container).queryByRole('alertdialog', { name: 'Duelo en pausa' })).not.toBeInTheDocument()
    const reconnect = vi.spyOn(ends[1]!, 'reconnect').mockImplementation(() => {
      ends[0]!.notify(true)
      ends[1]!.notify(true)
    })
    click(guest, 'Reconectar')
    flush()

    expect(reconnect).toHaveBeenCalledTimes(1)
    expect(within(host.container).queryByRole('alertdialog', { name: 'Duelo en pausa' })).not.toBeInTheDocument()
  })

  it('la barra de arriba no parte sus filas en celular: vida, reloj y los botones van juntos, y el turno con el chat; si no entra, se achica en vez de caerse a otra fila', () => {
    const { host, guest } = startDuel()
    openTable(host, guest)

    const bar = within(host.container)
    const rowOf = (name: string | RegExp) => bar.getByRole('button', { name }).parentElement!.closest('div')!

    // Vida, reloj, la vista, rendirse, el engranaje (reconectar) y salir: la misma fila, que no se parte.
    const top = rowOf(/^Reloj de la ronda/)
    expect(top.contains(bar.getByRole('group', { name: /^Puntos de vida de / }))).toBe(true)
    for (const name of ['Cambiar a la vista superior', 'Rendirme', 'Más opciones del duelo', 'Salir del duelo']) {
      expect(top).toBe(rowOf(name))
    }
    expect(top).not.toHaveClass('flex-wrap')

    // El turno: otra fila, que tampoco se parte (el chat bajó a la botonera de abajo).
    const turn = bar.getByText(/^Turno 1$/).closest('div')!
    expect(turn).toHaveTextContent(/Turno 1/)
    expect(within(turn).queryByRole('button', { name: 'Chat' })).not.toBeInTheDocument()
    expect(turn).not.toHaveClass('flex-wrap')
    expect(turn).not.toBe(top)
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
    expect(within(host.container).getByRole('button', { name: 'Jugar ahora' })).toBeInTheDocument()
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
    openGames(guest)
    fireEvent.click(within(screen.getByRole('dialog', { name: 'Juegos' })).getByRole('button', { name: 'Rendirme' }))
    fireEvent.click(within(screen.getByRole('dialog', { name: 'Juegos' })).getByRole('button', { name: 'Rendirme' }))
    flush()
    fireEvent.keyDown(document, { key: 'Escape' })
    leaveDuel(guest)
    flush()
    expect(hasSave('guest')).toBe(false)
    expect(within(guest.container).queryByText(/Tenés un duelo en pausa/)).not.toBeInTheDocument()

    // Al anfitrión no le tapa la mesa una pausa: el duelo terminó y se sigue viendo el resultado.
    expect(within(host.container).getByText('Beto se rindió.')).toBeInTheDocument()
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

  it('en escritorio quien mira ve el chat de los jugadores fijo al costado, de sólo lectura y sin botón para abrirlo', () => {
    const { host, guest } = startDuel()
    openTable(host, guest)
    const room = Object.keys(localStorage).find((key) => key.endsWith(':host'))!.split(':')[2]
    const matchMedia = window.matchMedia

    window.matchMedia = ((query: string) => ({ matches: query.includes('1101'), media: query, addEventListener: () => {}, removeEventListener: () => {}, addListener: () => {}, removeListener: () => {}, onchange: null, dispatchEvent: () => false })) as typeof window.matchMedia
    window.history.replaceState(null, '', `#duel?room=${room}&watch=1`)
    const watcher = render(<DuelScreen {...screenProps({ mainIds: [], extraIds: [], cardsById: new Map() })} />)
    flush()
    flush()

    const view = within(watcher.container)

    expect(view.getByRole('complementary', { name: 'Chat de los jugadores' })).toBeInTheDocument()
    expect(view.getByText('Los espectadores no pueden escribir.')).toBeInTheDocument()
    expect(view.getByRole('log', { name: 'Chat de los jugadores' })).toBeInTheDocument()
    expect(view.queryByRole('button', { name: /Chat de los jugadores/ })).not.toBeInTheDocument()
    expect(view.queryByRole('textbox')).not.toBeInTheDocument()

    window.matchMedia = matchMedia
  })

  it('la pantalla de quien mira no parte sus filas en celular: vida, reloj y salir juntos; "Mirando" con el turno; los avisos aparte', () => {
    const { host, guest } = startDuel()
    openTable(host, guest)
    const room = Object.keys(localStorage).find((key) => key.endsWith(':host'))!.split(':')[2]

    window.history.replaceState(null, '', `#duel?room=${room}&watch=1`)
    const watcher = render(<DuelScreen {...screenProps({ mainIds: [], extraIds: [], cardsById: new Map() })} />)
    flush()
    flush()
    const view = within(watcher.container)
    const rowOf = (element: HTMLElement) => element.closest('div')!

    // Vida, reloj y salir: la misma fila, que no se parte.
    const top = rowOf(view.getByRole('button', { name: 'Salir' }))
    expect(top).toBe(rowOf(view.getByLabelText(/^Reloj de la ronda/)))
    expect(top.querySelector('[data-lp]')).not.toBeNull()
    expect(top).not.toHaveClass('flex-wrap')

    // "Mirando" y el turno: otra fila, que tampoco se parte.
    const watching = rowOf(view.getByText('Mirando'))
    expect(watching).not.toBe(top)
    expect(watching).toHaveTextContent(/Turno de/)
    expect(watching).not.toHaveClass('flex-wrap')

    // "En pausa" y los avisos no se pegan a ninguna de las dos: tienen su propia fila.
    const hostKey = Object.keys(localStorage).find((key) => key.endsWith(':host'))!
    const hostSave = localStorage.getItem(hostKey)!
    localStorage.removeItem(hostKey)
    leaveDuel(guest)
    flush()
    localStorage.setItem(hostKey, hostSave)
    const notices = rowOf(view.getByText('En pausa'))
    expect(notices).not.toBe(top)
    expect(notices).not.toBe(watching)
    expect(notices).toHaveTextContent('Falta un jugador')
    expect(notices).not.toHaveClass('flex-wrap')
  })

  /** Una pantalla de escritorio (a partir de 1101 px): ahí el chat va fijo a la derecha. */
  const asDesktop = () => {
    window.matchMedia = ((query: string) => ({ matches: query.includes('1101') || query.includes('reduce'), media: query, addEventListener: () => {}, removeEventListener: () => {}, addListener: () => {}, removeListener: () => {}, onchange: null, dispatchEvent: () => false })) as typeof window.matchMedia
  }

  it('rendirse queda a la vista en la barra: pide confirmar, termina el duelo para los dos y después ya no hay a quién rendirse', () => {
    const { host, guest } = startDuel()
    openTable(host, guest)
    expect(moreButton(guest, 'Rendirme')).toBeEnabled()
    closeMore()

    click(guest, 'Rendirme')
    // Cancelar no se rinde.
    fireEvent.click(within(screen.getByRole('alertdialog')).getByRole('button', { name: 'Seguir jugando' }))
    flush()
    expect(within(host.container).queryByText(/se rindió/)).not.toBeInTheDocument()

    click(guest, 'Rendirme')
    expect(within(screen.getByRole('alertdialog')).getByText('Perdés el duelo y Ana gana. Después podés pedir la revancha.')).toBeInTheDocument()
    fireEvent.click(within(screen.getByRole('alertdialog')).getByRole('button', { name: 'Rendirme' }))
    flush()

    expect(within(host.container).getByText('Beto se rindió.')).toBeInTheDocument()
    expect(within(guest.container).getByText('Te rendiste.')).toBeInTheDocument()
    expect(moreButton(guest, 'Rendirme')).toBeDisabled()
    closeMore()
    expect(moreButton(host, 'Rendirme')).toBeDisabled()
    closeMore()
  })

  it('el final del duelo es una tarjeta al centro: título grande y motivo (sin puntos de vida), "Ver la mesa" la cierra y deja una línea arriba con la revancha', () => {
    const { host, guest } = startDuel()
    openTable(host, guest)

    // Beto se queda sin puntos de vida: 80 es 8000.
    click(guest, /Cambiar mis puntos de vida/)
    const sheet = () => within(screen.getByRole('dialog', { name: 'Mis puntos de vida' }))
    fireEvent.click(sheet().getByRole('button', { name: '8' }))
    fireEvent.click(sheet().getByRole('button', { name: '0' }))
    fireEvent.click(sheet().getByRole('button', { name: /^Restar 8000/ }))
    flush()

    const lost = within(guest.container).getByRole('dialog', { name: 'Perdiste' })
    expect(within(lost).getByText('Te quedaste sin puntos de vida.')).toBeInTheDocument()
    const won = within(host.container).getByRole('dialog', { name: '¡Ganaste!' })
    expect(within(won).getByText('Beto se quedó sin puntos de vida.')).toBeInTheDocument()
    // Con la tarjeta abierta la revancha está una sola vez.
    expect(within(host.container).getAllByRole('button', { name: 'Revancha' })).toHaveLength(1)

    // Ver la mesa: la tarjeta se va y arriba queda el resultado en una línea, con la revancha.
    fireEvent.click(within(won).getByRole('button', { name: 'Ver la mesa' }))
    expect(within(host.container).queryByRole('dialog', { name: '¡Ganaste!' })).not.toBeInTheDocument()
    expect(within(host.container).getByText('¡Ganaste!')).toBeInTheDocument()
    expect(within(host.container).getAllByRole('button', { name: 'Revancha' })).toHaveLength(1)

    // Desde la tarjeta también se sale.
    fireEvent.click(within(lost).getByRole('button', { name: 'Salir del duelo' }))
    expect(within(guest.container).queryByRole('dialog', { name: 'Perdiste' })).not.toBeInTheDocument()
    expect(within(guest.container).getByRole('button', { name: 'Jugar ahora' })).toBeInTheDocument()
  })

  it('las señales de abajo (✋ esperá y 👍 continuá) están a mano del pulgar y salen como un globo junto a las vidas de quien las manda, que se va solo y no cuenta como mensaje sin leer', () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] })
    const { host, guest } = startDuel()
    openTable(host, guest)
    const bubble = (view: RenderResult, side: 'mine' | 'theirs') => view.container.querySelector(`[data-lp="${side}"] [role="status"]`)

    expect(bubble(host, 'theirs')).toBeNull()
    // Abajo, con el pulgar: deshacer, el + (la ficha, los contadores y los juegos), el chat y las dos señales. Los dados ya no tienen botón: están dentro del +.
    const toolbar = within(guest.container).getByRole('toolbar')
    expect(within(toolbar).getAllByRole('button').map((button) => button.getAttribute('aria-label'))).toEqual(['Deshacer', 'Ficha', 'Chat', 'Esperá', 'Continuá', expect.stringMatching(/^Puntos de vida de/)])
    expect(within(toolbar).queryByRole('button', { name: 'Moneda, dado y más' })).not.toBeInTheDocument()

    // Beto avisa que continúa: lo ve junto a sus vidas (arriba, en la mesa de Ana, y abajo en la suya), en su color.
    fireEvent.click(within(guest.container).getByRole('button', { name: 'Continuá' }))
    flush()
    expect(bubble(host, 'theirs')).toHaveTextContent('👍')
    expect(bubble(guest, 'mine')).toHaveTextContent('👍')
    // El globo de un emoji solo lo dibuja grande (44 px), de los dos lados: el que mandás y el que manda el rival.
    expect(bubble(host, 'theirs')).toHaveClass('text-display')
    expect(bubble(guest, 'mine')).toHaveClass('text-display')
    expect(bubble(host, 'mine')).toBeNull()
    expect(host.container.querySelector('[data-lp="theirs"]')).toHaveClass('border-info/50')
    // Una señal no es un mensaje sin leer ni avisa aparte.
    expect(within(host.container).getByRole('button', { name: 'Chat' })).toBeInTheDocument()

    // Se va sola; y "continuá" es un 👍.
    act(() => {
      vi.advanceTimersByTime(4000)
    })
    expect(bubble(host, 'theirs')).toBeNull()
    fireEvent.click(within(host.container).getByRole('button', { name: 'Continuá' }))
    flush()
    expect(bubble(guest, 'theirs')).toHaveTextContent('👍')
    expect(within(guest.container).getByRole('button', { name: 'Chat' })).toBeInTheDocument()
  })

  it('✋ Esperá es un pedido de atención y no una reacción: el rival ve un cartel hasta que se suelta, jugar no lo cancela y 👍 o tocar ✋ otra vez lo suelta', () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] })
    const { host, guest } = startDuel({ cardsById: monsters })
    openTable(host, guest)
    const banner = (view: RenderResult) => view.container.querySelector('[data-hold]')

    expect(banner(host)).toBeNull()
    const hold = within(guest.container).getByRole('button', { name: 'Esperá' })
    expect(hold).toHaveAttribute('aria-pressed', 'false')
    fireEvent.click(hold)
    flush()

    // Ana ve el cartel del rival (ámbar, lleno), con su nombre; Beto ve el suyo, con cómo soltarlo, y ✋ queda apretado.
    expect(banner(host)).toHaveAttribute('data-hold', 'theirs')
    expect(banner(host)).toHaveTextContent('Beto pide que esperes')
    expect(banner(host)).toHaveClass('bg-info')
    expect(banner(guest)).toHaveAttribute('data-hold', 'mine')
    expect(banner(guest)).toHaveTextContent('Pediste esperar')
    expect(within(guest.container).getByRole('button', { name: 'Esperá' })).toHaveAttribute('aria-pressed', 'true')
    // El cartel se apoya sobre la línea del registro (la misma fila): no suma alto, y no tiene botones de más para quien lo recibe.
    expect(banner(host)!.parentElement).toHaveClass('relative', 'basis-full')
    expect(within(banner(host) as HTMLElement).queryByRole('button')).not.toBeInTheDocument()

    // No dura sólo un instante ni se cancela por jugar (quien la pidió decide cuándo seguir): pasan los segundos y ella misma juega.
    act(() => {
      vi.advanceTimersByTime(30_000)
    })
    summonFirst(guest)
    flush()
    expect(banner(host)).toHaveAttribute('data-hold', 'theirs')
    expect(banner(guest)).toHaveAttribute('data-hold', 'mine')

    // Soltarla: tocar ✋ otra vez manda 👍 (continuá) y los dos carteles se van.
    fireEvent.click(within(guest.container).getByRole('button', { name: 'Esperá' }))
    flush()
    expect(banner(host)).toBeNull()
    expect(banner(guest)).toBeNull()
    expect(within(guest.container).getByRole('button', { name: 'Esperá' })).toHaveAttribute('aria-pressed', 'false')

    // También se suelta desde el cartel propio, y 👍 (continuá) de la misma persona la suelta.
    fireEvent.click(within(guest.container).getByRole('button', { name: 'Esperá' }))
    flush()
    expect(banner(host)).not.toBeNull()
    fireEvent.click(within(banner(guest) as HTMLElement).getByRole('button', { name: 'Soltar la espera' }))
    flush()
    expect(banner(host)).toBeNull()
    expect(banner(guest)).toBeNull()
  })

  it('una espera que nadie soltó se vence sola (tope de seguridad de un minuto), y si el rival se va no queda colgada', () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] })
    const { host, guest } = startDuel()
    openTable(host, guest)
    const banner = (view: RenderResult) => view.container.querySelector('[data-hold]')

    fireEvent.click(within(host.container).getByRole('button', { name: 'Esperá' }))
    flush()
    expect(banner(guest)).toHaveAttribute('data-hold', 'theirs')

    act(() => {
      vi.advanceTimersByTime(59_000)
    })
    expect(banner(guest)).not.toBeNull()
    act(() => {
      vi.advanceTimersByTime(2_000)
    })
    expect(banner(guest)).toBeNull()
    expect(banner(host)).toBeNull()
    expect(within(host.container).getByRole('button', { name: 'Esperá' })).toHaveAttribute('aria-pressed', 'false')
  })

  it('el 👍 del rival no suelta mi espera: sólo la suelta quien la pidió', () => {
    const { host, guest } = startDuel()
    openTable(host, guest)
    const banner = (view: RenderResult) => view.container.querySelector('[data-hold]')

    fireEvent.click(within(guest.container).getByRole('button', { name: 'Esperá' }))
    flush()
    fireEvent.click(within(host.container).getByRole('button', { name: 'Continuá' }))
    flush()

    expect(banner(guest)).toHaveAttribute('data-hold', 'mine')
    expect(banner(host)).toHaveAttribute('data-hold', 'theirs')
  })

  it('en escritorio el chat está siempre abierto a la derecha: se escribe sin abrir nada y no hay botón para abrirlo', () => {
    asDesktop()
    const { host, guest } = startDuel()
    openTable(host, guest)

    const panel = within(within(guest.container).getByRole('region', { name: 'Chat con Ana' }))
    expect(within(guest.container).queryByRole('button', { name: /^Chat/ })).not.toBeInTheDocument()

    fireEvent.click(panel.getByRole('button', { name: 'Continuá' }))
    flush()
    expect(within(within(within(host.container).getByRole('region', { name: 'Chat con Beto' })).getByRole('log')).getByText('👍')).toBeInTheDocument()
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
    expect(status()).toHaveClass('sr-only')

    tap(within(guest.container).getByRole('button', { name: 'Ficha' }))
    fireEvent.click(screen.getByRole('menuitem', { name: 'Poner contadores' }))
    expect(status()).toHaveClass('pointer-events-auto')
    expect(within(status()).getByRole('button', { name: 'Listo' })).toBeInTheDocument()
  })

  it('cada jugador tiene su color, el mismo en sus vidas y en su globo del chat: el tuyo violeta claro y el del rival ámbar', () => {
    asDesktop()
    const { host, guest } = startDuel()
    openTable(host, guest)

    fireEvent.click(within(within(guest.container).getByRole('region', { name: 'Chat con Ana' })).getByRole('button', { name: 'Pensando…' }))
    flush()
    fireEvent.click(within(within(host.container).getByRole('region', { name: 'Chat con Beto' })).getByRole('button', { name: 'Continuá' }))
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
      expect(mineLife.querySelector('span.tabular-nums')).toHaveClass('text-accent')
      expect(mineLine).toHaveClass('bg-accent/20')
      expect(mineLine.querySelector('span')).toHaveClass('text-accent')

      // El del rival, celeste, también en sus dos lugares.
      expect(theirLife).toHaveClass('border-info/50')
      expect(theirLife.querySelector('span.tabular-nums')).toHaveClass('text-info-soft')
      expect(theirLine).toHaveClass('bg-info/20')
      expect(theirLine.querySelector('span')).toHaveClass('text-info-soft')
    }
  })

  it('quien mira ve a cada jugador con su color (anfitrión violeta claro, invitado ámbar) en las vidas y en el chat, y al dar vuelta la mesa los colores siguen a los jugadores', () => {
    const { host, guest } = startDuel()
    openTable(host, guest)
    const room = Object.keys(localStorage).find((key) => key.endsWith(':host'))!.split(':')[2]

    window.history.replaceState(null, '', `#duel?room=${room}&watch=1`)
    const watcher = render(<DuelScreen {...screenProps({ mainIds: [], extraIds: [], cardsById: new Map() })} />)
    flush()
    flush()

    // Lo que escriben los dos (después de que quien mira entró: el chat anterior no se repite).
    for (const [view, quick] of [[host, 'Pensando…'], [guest, 'Continuá']] as const) {
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
    expect(within(guest.container).getByRole('button', { name: 'Jugar ahora' })).not.toHaveClass('bg-primary')
    expect(within(guest.container).getByRole('button', { name: 'Volver al duelo' })).toHaveClass('bg-primary')

    click(guest, 'Dejar ese duelo')
    expect(within(guest.container).getByRole('button', { name: 'Jugar ahora' })).toHaveClass('bg-primary')
    expect(within(guest.container).queryByText(/Tenés un duelo en pausa/)).not.toBeInTheDocument()
    expect(hasSave('guest')).toBe(false)
  })

  it('recargar dentro de la sala con un deck pegado y el builder vacío: el deck guardado vuelve solo y se puede repartir', async () => {
    const ydk = ['#main', ...Array.from({ length: 40 }, (_, index) => String(3000 + index))].join('\n')
    localStorage.setItem('ygo-lab:duel-deck', ydk)

    // Ana crea la sala; Beto (sin deck armado) llega a ella por la dirección, como al recargar la página.
    const host = render(<DuelScreen {...screenProps()} />)
    typeInto(host, 'Tu nombre', 'Ana')
    createRoom(host)
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
