// @vitest-environment jsdom
import { act, cleanup, fireEvent, screen, within, type RenderResult } from '@testing-library/react'
import '@testing-library/jest-dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { extractRoomCode } from '../app/duel-link'
import { readPlayReturn } from '../app/play-return'
import { createDuel } from '../app/duel-session'
import type { SocketTransport } from '../app/duel-socket'
import type { DuelConnect } from '../app/use-duel'
import { DuelScreen } from '../components/duel/DuelScreen'
import type { ApiCardReference } from '../types'
import { createMemoryRoom, type MemoryRoom } from './support/memory-room'
import { createDuelHarness, asSocket, cardsById, closeMore, effectMonster, fakeRooms, hasSave, mainIds, monsters, render, rulesDialog, summonFirst, tap, typeInto, zoneOf } from './support/duel-screen-harness'

// La pantalla del duelo arma dos mesas completas por prueba: sola cada una tarda un par de segundos, pero con toda la suite corriendo a la vez alguna pasaba los 5 s de siempre (la de «atacar» fallaba una de cada tantas corridas).
vi.setConfig({ testTimeout: 20_000 })

// Las cartas de un deck pegado se piden por su número: acá salen todas menos la 999 (que no existe).
vi.mock('../ygoprodeck', () => ({
  fetchCardsByIds: vi.fn(async (ids: number[]) =>
    ids.filter((id) => id !== 999).map((id) => ({ ygoprodeckId: id, name: 'Carta ' + id, frameType: 'effect', cardType: 'Effect Monster', race: null, description: null, attribute: null, level: null, linkValue: null, atk: null, def: null, archetype: null, ygoprodeckUrl: null, imageUrl: null, imageUrlSmall: null })),
  ),
  // El detalle de una carta pide también sus artes alternativos: acá no hay ninguno.
  fetchCardArts: vi.fn(async () => []),
}))

const { railsOn } = vi.hoisted(() => ({ railsOn: { value: false } }))

vi.mock('../app/duel-rails', async (importOriginal) => ({ ...(await importOriginal<typeof import('../app/duel-rails')>()), railsFit: () => railsOn.value }))

// La calculadora de vidas se carga a pedido (`lazy`): en las pruebas llega al instante.
vi.mock('../components/deck-mode/lazy-steps', async (importOriginal) => ({ ...(await importOriginal<typeof import('../components/deck-mode/lazy-steps')>()), LazyLifeCalculatorScreen: (await import('../components/life/LifeCalculatorScreen')).LifeCalculatorScreen }))

let memory: MemoryRoom
let connect: DuelConnect

const { allowUndo, changeLife, click, createRoom, flush, joinByLink, openDeck, openRules, openTable, screenProps, startDuel, startSiding } = createDuelHarness(() => ({ memory, connect }))

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
  railsOn.value = false
  vi.useRealTimers()
  vi.restoreAllMocks()
  cleanup()
})

describe('la pantalla del duelo', () => {
  it('sin cartas suficientes en el Main avisa, lleva a elegir deck y no deja retar, entrar ni abrir un duelo', () => {
    const view = render(<DuelScreen {...screenProps({ mainIds: mainIds.slice(0, 3) })} />)

    expect(within(view.container).getByText(/hacen falta 5 cartas en el Main/)).toBeInTheDocument()
    expect(within(view.container).getByRole('button', { name: 'Retar a un amigo' })).toHaveAttribute('aria-disabled', 'true')
    expect(within(view.container).getByRole('button', { name: 'Entrenar solo' })).toHaveAttribute('aria-disabled', 'true')

    click(view, 'Tengo un código')
    typeInto(view, 'Enlace o código', 'K7QF2M9X')
    expect(within(view.container).getByRole('button', { name: 'Unirme' })).toBeDisabled()

    openRules(view)
    expect(within(rulesDialog()).getByRole('button', { name: 'Abrir duelo' })).toBeDisabled()
    closeMore()

    // La acción principal no queda muerta: lleva al builder, a elegir (y tocar) las cartas del deck.
    click(view, 'Elegí tu deck para jugar')
    expect(window.location.hash).toBe('#deck-builder')
    expect(screen.queryByRole('dialog', { name: 'Tu deck' })).not.toBeInTheDocument()
  })

  it('toda referencia al deck lleva al builder (no a un selector): el deck del lobby se abre ahí y el builder recuerda dónde volver', () => {
    const view = render(<DuelScreen {...screenProps()} />)

    openDeck(view)

    expect(window.location.hash).toBe('#deck-builder')
    expect(readPlayReturn()).toBe('#duel')
    expect(screen.queryByRole('dialog', { name: 'Tu deck' })).not.toBeInTheDocument()
  })

  it('al crear una sala se elige Single, Match o Solo; Solo esconde lo del rival y entra a la mesa sin crear sala', () => {
    const view = render(<DuelScreen {...screenProps()} />)

    openRules(view)
    expect(within(rulesDialog()).getAllByRole('radio').slice(0, 3).map((radio) => radio.getAttribute('aria-label') ?? radio.textContent)).toEqual(['Single', 'Match · mejor de 3', 'Solo'])
    expect(within(rulesDialog()).getByRole('button', { name: 'Abrir duelo' })).toBeInTheDocument()

    fireEvent.click(within(rulesDialog()).getByRole('radio', { name: 'Solo' }))

    // Sin rival no hay tiempo, formato ni quién entra, ni se abre una sala: la acción es jugar solo.
    expect(within(rulesDialog()).queryByRole('radio', { name: '50 min' })).not.toBeInTheDocument()
    expect(within(rulesDialog()).queryByLabelText('Formato')).not.toBeInTheDocument()
    expect(within(rulesDialog()).queryByRole('button', { name: 'Abrir duelo' })).not.toBeInTheDocument()
    expect(within(rulesDialog()).queryByRole('button', { name: 'Guardar reglas' })).not.toBeInTheDocument()

    fireEvent.click(within(rulesDialog()).getByRole('button', { name: 'Jugar solo' }))

    expect(window.location.hash).toBe('#practice')
    expect(extractRoomCode(window.location.hash)).toBeNull()
  })

  it('en las reglas, el límite de tiempo por turno se enciende, se apaga y se personaliza: viene encendido con 7 minutos y 3 de más, y apagado esconde los minutos', () => {
    const view = render(<DuelScreen {...screenProps()} />)

    openRules(view)

    const turn = within(rulesDialog()).getByRole('switch', { name: 'Límite de tiempo por turno' })

    expect(turn).toBeChecked()
    expect(within(within(rulesDialog()).getByRole('group', { name: 'Minutos de cada jugador' })).getByRole('textbox')).toHaveDisplayValue('7')
    expect(within(within(rulesDialog()).getByRole('group', { name: 'Minutos de más al recibir el turno' })).getByRole('textbox')).toHaveDisplayValue('3')

    fireEvent.click(turn)
    expect(turn).not.toBeChecked()
    expect(within(rulesDialog()).queryByRole('group', { name: 'Minutos de cada jugador' })).not.toBeInTheDocument()

    // Con Solo (sin rival) no hay reloj de turnos que elegir.
    fireEvent.click(within(rulesDialog()).getByRole('radio', { name: 'Solo' }))
    expect(within(rulesDialog()).queryByRole('switch', { name: 'Límite de tiempo por turno' })).not.toBeInTheDocument()
  })

  it('Solo no se recuerda: al volver a abrir las reglas vuelve el tipo de antes, y sin deck armado no se puede jugar solo', () => {
    const view = render(<DuelScreen {...screenProps({ mainIds: mainIds.slice(0, 3) })} />)

    openRules(view)
    fireEvent.click(within(rulesDialog()).getByRole('radio', { name: 'Solo' }))
    expect(within(rulesDialog()).getByRole('button', { name: 'Jugar solo' })).toBeDisabled()
    expect(within(rulesDialog()).getByText(/hace falta un deck armado en el builder/)).toBeInTheDocument()
    closeMore()

    openRules(view)
    expect(within(rulesDialog()).getByRole('radio', { name: 'Single' })).toBeChecked()
  })

  it('Entrenar solo lleva a la mesa de práctica sin crear sala', () => {
    const view = render(<DuelScreen {...screenProps()} />)

    click(view, 'Entrenar solo')

    expect(window.location.hash).toBe('#practice')
    expect(extractRoomCode(window.location.hash)).toBeNull()
  })

  it('avisa si es el lobby (ahí está el buscador de cartas de la app) o ya la sala: sin sala es lobby, con sala no, y al irse de la pantalla deja de serlo', () => {
    const onLobbyChange = vi.fn()
    const view = render(<DuelScreen {...screenProps({ onLobbyChange })} />)

    expect(onLobbyChange).toHaveBeenLastCalledWith(true)

    createRoom(view)

    expect(onLobbyChange).toHaveBeenLastCalledWith(false)

    view.unmount()

    expect(onLobbyChange).toHaveBeenLastCalledWith(false)
  })

  it('las reglas se recuerdan: «Guardar reglas» las deja para la próxima vez y se ven en el renglón del inicio', () => {
    const view = render(<DuelScreen {...screenProps()} />)

    expect(within(view.container).getByRole('button', { name: 'Reglas del duelo' })).toHaveAccessibleDescription(expect.stringMatching(/^TCG · 50 min · Single/))
    openRules(view)
    fireEvent.click(within(rulesDialog()).getByRole('radio', { name: 'Match · mejor de 3' }))
    fireEvent.click(within(rulesDialog()).getByRole('radio', { name: 'Sin tiempo' }))
    fireEvent.click(within(rulesDialog()).getByRole('button', { name: 'Guardar reglas' }))

    expect(within(view.container).getByRole('button', { name: 'Reglas del duelo' })).toHaveAccessibleDescription(expect.stringMatching(/^TCG · Sin tiempo · Match/))
    expect(JSON.parse(localStorage.getItem('ygo-lab:duel-prefs') ?? '{}')).toMatchObject({ limitMin: 0, match: true, format: 'tcg' })

    // Otra visita al inicio las encuentra, y el duelo que se abre con «Jugar ahora» las usa.
    view.unmount()
    const again = render(<DuelScreen {...screenProps()} />)

    expect(within(again.container).getByRole('button', { name: 'Reglas del duelo' })).toHaveAccessibleDescription(expect.stringMatching(/^TCG · Sin tiempo · Match/))
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

    expect(within(view.container).getByRole('button', { name: 'Reglas del duelo' })).toHaveAccessibleDescription(expect.stringMatching(/^Genesys 130 pts · 50 min · Single/))
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

    // La X pide confirmar: «Seguir en la sala» no cierra nada.
    click(view, 'Salir')
    expect(screen.getByRole('alertdialog', { name: '¿Seguro que querés cerrar la sala?' })).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Seguir en la sala' }))
    expect(rooms.unlist).not.toHaveBeenCalled()
    expect(window.location.hash).toBe(`#duel?room=${room}`)

    // Cancelar la espera: cerrar la sala la baja de la lista.
    click(view, 'Salir')
    fireEvent.click(screen.getByRole('button', { name: 'Cerrar la sala' }))
    expect(rooms.unlist).toHaveBeenCalledWith(room, token)
    expect(window.location.hash).toBe('#duel')
  })

  it('si la dirección pierde la sala por afuera (atrás del navegador, no el botón Salir) también se sale: se baja de la lista y no sigue conectado', async () => {
    const rooms = fakeRooms()
    const view = render(<DuelScreen {...screenProps({ rooms })} />)

    click(view, 'Jugar ahora')
    await act(async () => {})

    const room = extractRoomCode(window.location.hash)!
    const token = rooms.register.mock.calls[0]![2]

    // Atrás del navegador (o pegar un enlace sin sala): cambia la dirección sin pasar por «Salir».
    act(() => {
      window.history.replaceState(null, '', '#duel')
      window.dispatchEvent(new HashChangeEvent('hashchange'))
    })

    expect(rooms.unlist).toHaveBeenCalledWith(room, token)
    expect(within(view.container).getByRole('button', { name: 'Jugar ahora' })).toBeInTheDocument()
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

  it('la sala muestra desde el principio tu tarjeta y el lugar que espera al rival, sin pasos ni el enlace a la vista: el enlace se copia o se comparte', () => {
    const host = render(<DuelScreen {...screenProps()} />)
    typeInto(host, 'Tu nombre', 'Ana')
    createRoom(host)

    const view = within(host.container)

    expect(view.queryByRole('list', { name: 'Pasos de la sala' })).not.toBeInTheDocument()
    // El enlace no se dibuja ni lo lee el lector de pantalla: lo copian y lo comparten los botones.
    expect(view.getByTestId('duel-link')).not.toBeVisible()
    expect(view.queryByText(/#duel\?room=/, { ignore: '[hidden]' })).not.toBeInTheDocument()
    // Tu tarjeta con tu deck y, al lado, el lugar del rival.
    expect(view.getByText('Ana')).toBeInTheDocument()
    expect(view.getByText(/\d+ \+ \d+/)).toBeInTheDocument()
    expect(view.getByText('Esperando a tu rival…')).toBeInTheDocument()
    // La principal («Copiar enlace») va antes que el enlace para mirar, que es sin caja y va al final de la fila.
    const labels = view.getAllByRole('button').map((button) => button.textContent)
    expect(labels).toContain('Copiar enlace')
    expect(labels.indexOf('Copiar enlace')).toBeLessThan(labels.indexOf('Copiar enlace para mirar'))
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
    const withSide = new Map([...monsters, ['card-777-1', { name: 'Carta del Side', apiCard: effectMonster }]])
    const props = { sideIds, cardsById: withSide }
    const host = render(<DuelScreen {...screenProps(props)} />)
    typeInto(host, 'Tu nombre', 'Ana')
    openRules(host)
    fireEvent.click(within(rulesDialog()).getByRole('radio', { name: 'Match · mejor de 3' }))
    fireEvent.click(within(rulesDialog()).getByRole('switch', { name: 'Sidedeck' }))
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

    expect(within(host.container).getByRole('heading', { name: 'Sidedeck' })).toBeInTheDocument()
    // Como en el builder: las tres zonas con sus cartas, y sin botones para saltar de una a otra.
    const zone = (name: 'main' | 'extra' | 'side') => host.container.querySelector<HTMLElement>(`[data-deck-zone="${name}"][data-deck-count]`)!
    const counts = () => (['main', 'extra', 'side'] as const).map((name) => zone(name).dataset.deckCount)
    expect(counts()).toEqual(['40', '1', '1'])
    expect(within(host.container).queryByRole('navigation', { name: 'Ir a una zona del deck' })).not.toBeInTheDocument()
    // Un toque en una carta del Main la pasa al Side; otro en el Side la devuelve.
    fireEvent.click(within(host.container).getAllByRole('button', { name: 'Mover Monstruo 10001 al Side Deck' })[0]!)
    expect(counts()).toEqual(['39', '1', '2'])
    expect(within(zone('side')).getByRole('button', { name: 'Mover Monstruo 10001 al Main Deck' })).toBeInTheDocument()
    // Con el teclado también: la carta es un botón (Enter la pasa).
    fireEvent.keyDown(within(zone('side')).getByRole('button', { name: 'Mover Monstruo 10001 al Main Deck' }), { key: 'Enter' })
    expect(counts()).toEqual(['40', '1', '1'])
    fireEvent.click(within(zone('side')).getByRole('button', { name: 'Mover Carta del Side al Main Deck' }))
    expect(within(zone('main')).getByRole('button', { name: 'Mover Carta del Side al Side Deck' })).toBeInTheDocument()

    click(host, 'Listo')
    flush()
    expect(within(host.container).getByText('Esperando a Beto…')).toBeInTheDocument()
    expect(within(guest.container).getByText('Ana ya está listo.')).toBeInTheDocument()
    click(guest, 'Listo')
    flush()

    // Con los dos listos se limpia la mesa: elige quién va primero quien perdió (Beto) y el siding se fue.
    expect(within(guest.container).getByText('Elegís vos, porque perdiste el duelo anterior.')).toBeInTheDocument()
    expect(within(host.container).queryByRole('heading', { name: 'Sidedeck' })).not.toBeInTheDocument()
  })

  it('recargar durante el siding vuelve al siding, con las cartas como estaban: ni la pausa, ni la mesa, ni la sala; y ya listo, sigue esperando al rival', () => {
    // Recarga Beto (el invitado): el rol de la pestaña es el último que entró.
    const { host, guest, props, counts } = startSiding()

    fireEvent.click(within(guest.container).getByRole('button', { name: 'Mover Carta del Side al Main Deck' }))
    expect(counts(guest)).toEqual(['41', '1', '0'])

    guest.unmount()
    flush()
    const reloaded = render(<DuelScreen {...screenProps(props)} />)
    flush()
    flush()

    expect(within(reloaded.container).getByRole('heading', { name: 'Sidedeck' })).toBeInTheDocument()
    expect(within(reloaded.container).queryByRole('alertdialog', { name: 'Duelo en pausa' })).not.toBeInTheDocument()
    // Las cartas siguen donde se las dejó.
    expect(counts(reloaded)).toEqual(['41', '1', '0'])

    click(reloaded, 'Listo')
    flush()
    expect(within(reloaded.container).getByText(/^Esperando a /)).toBeInTheDocument()

    // Recargar ya listo: sigue esperando (el pedido quedó guardado y se le repite al rival).
    reloaded.unmount()
    flush()
    const again = render(<DuelScreen {...screenProps(props)} />)
    flush()
    flush()
    expect(within(again.container).getByRole('heading', { name: 'Sidedeck' })).toBeInTheDocument()
    expect(within(again.container).getByText(/^Esperando a /)).toBeInTheDocument()
    expect(within(host.container).getByText('Beto ya está listo.')).toBeInTheDocument()

    // Cuando Ana está lista, sigue el duelo (Beto, que perdió, elige quién va primero) y el siding se fue.
    click(host, 'Listo')
    flush()
    flush()
    expect(within(again.container).getByText('Elegís vos, porque perdiste el duelo anterior.')).toBeInTheDocument()
    expect(within(again.container).queryByRole('heading', { name: 'Sidedeck' })).not.toBeInTheDocument()
  })

  it('el siding no tiene salida: no hay botón de salir, sólo «Listo»', () => {
    const { host } = startSiding()

    expect(within(host.container).queryByRole('button', { name: /Salir/ })).not.toBeInTheDocument()
    expect(within(host.container).getByRole('button', { name: 'Listo' })).toHaveClass('hover:bg-success-solid')
  })

  it('salir de un duelo en curso avisa que es abandonarlo: el rival gana, quien salió pierde y no queda nada en pausa', () => {
    const { host, guest } = startDuel()
    openTable(host, guest)

    click(guest, 'Salir del duelo')
    const dialog = within(screen.getByRole('alertdialog'))
    expect(dialog.getByText('¿Abandonar el duelo?')).toBeInTheDocument()
    expect(dialog.getByText('Salir es abandonar: perdés el duelo automáticamente y Ana gana. No hay forma de volver a esta mesa.')).toBeInTheDocument()
    fireEvent.click(dialog.getByRole('button', { name: 'Abandonar y perder' }))
    flush()

    expect(hasSave('guest')).toBe(false)
    expect(within(guest.container).queryByText(/Tenés un duelo en pausa/)).not.toBeInTheDocument()
    expect(within(host.container).getByRole('dialog', { name: '¡Ganaste!' })).toBeInTheDocument()
  })

  it('terminado el duelo y con el rival afuera, avisa con una cuenta de 5 segundos y la sala se cierra del todo: se vuelve al inicio y nadie más entra', () => {
    vi.useFakeTimers({ toFake: ['setInterval', 'clearInterval'] })
    const { host, guest } = startDuel()
    openTable(host, guest)

    click(guest, 'Rendirme')
    fireEvent.click(within(screen.getByRole('alertdialog')).getByRole('button', { name: 'Rendirme' }))
    flush()
    expect(within(host.container).getByRole('dialog', { name: '¡Ganaste!' })).toBeInTheDocument()
    // Con el rival todavía adentro no hay aviso.
    expect(within(host.container).queryByTestId('room-closing')).not.toBeInTheDocument()

    // El rival se va (cierra la pestaña): el que se queda se entera de que la sala va a desaparecer, con la cuenta.
    guest.unmount()
    flush()
    expect(within(host.container).getByTestId('room-closing')).toHaveTextContent('Beto se fue: la sala desaparece en 5 segundos.')
    act(() => {
      vi.advanceTimersByTime(2000)
    })
    expect(within(host.container).getByTestId('room-closing')).toHaveTextContent('la sala desaparece en 3 segundos.')
    expect(memory.ended).toBe(false)

    // A los 5 segundos la sala se da por terminada del todo y se vuelve al inicio.
    act(() => {
      vi.advanceTimersByTime(3000)
    })
    expect(memory.ended).toBe(true)
    expect(within(host.container).queryByTestId('room-closing')).not.toBeInTheDocument()
    expect(within(host.container).getByRole('button', { name: 'Jugar ahora' })).toBeInTheDocument()
    expect(window.location.hash).toBe('#duel')
  })

  it('si el rival vuelve antes de los 5 segundos, el aviso se va y la sala sigue abierta', () => {
    vi.useFakeTimers({ toFake: ['setInterval', 'clearInterval'] })
    const { host, guest } = startDuel()
    openTable(host, guest)

    click(guest, 'Rendirme')
    fireEvent.click(within(screen.getByRole('alertdialog')).getByRole('button', { name: 'Rendirme' }))
    flush()

    // Se le cae la conexión (no sale de la sala): el aviso arranca, y al volver se cancela.
    const rivalEnd = memory.ends[1]!
    rivalEnd.disconnect()
    flush()
    expect(within(host.container).getByTestId('room-closing')).toBeInTheDocument()

    act(() => {
      vi.advanceTimersByTime(2000)
    })
    rivalEnd.reconnect()
    flush()
    expect(within(host.container).queryByTestId('room-closing')).not.toBeInTheDocument()

    act(() => {
      vi.advanceTimersByTime(10_000)
    })
    expect(memory.ended).toBe(false)
    expect(within(host.container).getByRole('dialog', { name: '¡Ganaste!' })).toBeInTheDocument()
  })

  it('un tercero que llega durante la cuenta no la reinicia ni la cancela: sigue bajando y la sala se cierra a los 5 segundos del rival que se fue', () => {
    vi.useFakeTimers({ toFake: ['setInterval', 'clearInterval'] })
    const { host, guest } = startDuel()
    openTable(host, guest)

    click(guest, 'Rendirme')
    fireEvent.click(within(screen.getByRole('alertdialog')).getByRole('button', { name: 'Rendirme' }))
    flush()
    guest.unmount()
    flush()
    act(() => {
      vi.advanceTimersByTime(2000)
    })
    expect(within(host.container).getByTestId('room-closing')).toHaveTextContent('en 3 segundos')

    // Llega alguien con otra identidad: para la cuenta es como si nadie hubiera llegado.
    createDuel(asSocket(memory.join()), { role: 'guest', name: 'Cami', sid: 'third-1' })
    flush()
    expect(within(host.container).getByTestId('room-closing')).toHaveTextContent('en 3 segundos')
    act(() => {
      vi.advanceTimersByTime(1000)
    })
    expect(within(host.container).getByTestId('room-closing')).toHaveTextContent('en 2 segundos')

    act(() => {
      vi.advanceTimersByTime(2000)
    })
    expect(memory.ended).toBe(true)
  })

  it('con el duelo en curso no hay cuenta: un rival que se cae deja la mesa en pausa como siempre', () => {
    vi.useFakeTimers({ toFake: ['setInterval', 'clearInterval'] })
    const { host, guest } = startDuel()
    openTable(host, guest)

    memory.ends[1]!.disconnect()
    flush()
    act(() => {
      vi.advanceTimersByTime(10_000)
    })

    expect(within(host.container).queryByTestId('room-closing')).not.toBeInTheDocument()
    expect(memory.ended).toBe(false)
    expect(within(host.container).getByRole('alertdialog', { name: 'Duelo en pausa' })).toBeInTheDocument()
  })

  it('una sala pública no vuelve a la lista de las que esperan rival cuando el duelo terminó y el rival se fue (ahí un tercero entraría a ver la mesa del que se quedó)', async () => {
    vi.useFakeTimers({ toFake: ['setInterval', 'clearInterval'] })
    const rooms = fakeRooms()
    const host = render(<DuelScreen {...screenProps({ rooms })} />)
    typeInto(host, 'Tu nombre', 'Ana')
    openRules(host)
    fireEvent.click(within(rulesDialog()).getByRole('button', { name: 'Abrir duelo' }))
    const link = within(host.container).getByTestId('duel-link').textContent ?? ''

    window.history.replaceState(null, '', '#duel')
    const guest = render(<DuelScreen {...screenProps()} />)
    typeInto(guest, 'Tu nombre', 'Beto')
    joinByLink(guest, link)
    flush()
    openTable(host, guest)
    expect(rooms.register).toHaveBeenCalledTimes(1)
    rooms.unlist.mockClear()

    click(guest, 'Rendirme')
    fireEvent.click(within(screen.getByRole('alertdialog')).getByRole('button', { name: 'Rendirme' }))
    flush()
    guest.unmount()
    flush()

    // Se baja de la lista y no se vuelve a anotar como si esperara rival.
    expect(rooms.unlist).toHaveBeenCalled()
    expect(rooms.register).toHaveBeenCalledTimes(1)
  })

  it('quien llega a una sala que ya se cerró ve que ya no funciona, sin ver nada de ella', () => {
    connect = () => asSocket(memory.join(), 'gone')
    const view = render(<DuelScreen {...screenProps()} />)
    typeInto(view, 'Tu nombre', 'Cami')
    joinByLink(view, 'https://app.test/#duel?room=ABCD2345')

    expect(within(view.container).getByText('Ese enlace ya no funciona')).toBeInTheDocument()
    expect(within(view.container).queryByRole('button', { name: 'Estoy listo' })).not.toBeInTheDocument()
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
    // El anfitrión avisa también contra quién juega (el nombre de quien entró).
    expect(rooms.live).toHaveBeenCalledWith(room, info, 0, token, 'Beto')
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

  it('al crear la sala se ve la ficha de reglas: pública o privada, el tipo, el formato, el reloj y cuántos miran (la vida y la mano inicial no se dicen en TCG)', () => {
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
    // En TCG (y OCG) la vida y la mano inicial son siempre las mismas: no hace falta comunicarlas.
    expect(summary.queryByText('Vida inicial')).not.toBeInTheDocument()
    expect(summary.queryByText('Mano inicial')).not.toBeInTheDocument()
    // Todo lo de quien mira lleva un ojo: la fila de los espectadores también.
    expect(summary.getByText('Mirando').querySelector('svg')).not.toBeNull()
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
    for (const chip of ['Match', 'TCG', '50 min', 'Sidedeck']) {
      expect(section.getByText(chip)).toBeInTheDocument()
    }

    fireEvent.click(section.getByRole('button', { name: 'Entrar a la sala de Carla' }))
    expect(window.location.hash).toBe('#duel?room=K7QF2M9X')
  })

  it('la arena muestra los duelos en vivo con cuántos los miran, se entra a mirar con un toque y uno lleno no deja mirar', async () => {
    const live = [
      { code: 'LIVEAAAA', host: 'Eli', guest: 'Gus', match: false, siding: false, format: 'tcg', limitMin: 50, watchers: 1, since: Date.now() },
      { code: 'LIVEBBBB', host: 'Fede', match: true, siding: false, format: 'tcg', limitMin: 0, watchers: 2, since: Date.now() },
    ]
    const view = render(<DuelScreen {...screenProps({ rooms: fakeRooms([], live) })} />)

    const section = within(await within(view.container).findByRole('region', { name: 'En la arena ahora' }))
    expect(await section.findByText('2 duelos en vivo')).toBeInTheDocument()
    // Quiénes se enfrentan (de un anfitrión de antes, que no manda el rival, sólo se sabe quién juega).
    expect(section.getByText('Eli vs Gus')).toBeInTheDocument()
    expect(section.getByText('Fede está jugando')).toBeInTheDocument()
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

  it('la columna del lobby y de la sala se puede achicar: a 320 px un botón que no cabe no ensancha todo y lo corta del lado derecho', () => {
    const view = render(<DuelScreen {...screenProps()} />)
    // Una sola columna `minmax(0, 1fr)` (con la pista automática, el contenido más ancho decide el ancho de toda la columna).
    const column = view.container.querySelector('[class*="max-w-xl"][class*="grid"]')

    expect(column).not.toBeNull()
    expect(column!.className).toContain('grid-cols-[minmax(0,1fr)]')
  })

  it('sin relay no hay arena: el inicio de Jugar no muestra una lista que no puede llenar', () => {
    const view = render(<DuelScreen {...screenProps()} />)

    expect(within(view.container).queryByRole('region', { name: 'En la arena ahora' })).not.toBeInTheDocument()
  })

  it('el siding dura 3 minutos: se ve la cuenta y, al acabarse, queda listo solo con el deck como esté', () => {
    vi.useFakeTimers()

    const withSide = new Map([...monsters, ['card-777-1', { name: 'Carta del Side', apiCard: effectMonster }]])
    const props = { sideIds: ['card-777-1'], cardsById: withSide }
    const host = render(<DuelScreen {...screenProps(props)} />)
    typeInto(host, 'Tu nombre', 'Ana')
    openRules(host)
    fireEvent.click(within(rulesDialog()).getByRole('radio', { name: 'Match · mejor de 3' }))
    fireEvent.click(within(rulesDialog()).getByRole('switch', { name: 'Sidedeck' }))
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
    expect(within(host.container).getByText(/^Tu turno · \d+$/)).toBeInTheDocument()
    expect(within(guest.container).getByText(/^Turno de Ana · \d+$/)).toBeInTheDocument()

    // El anfitrión pierde 1000: el invitado lo ve en la tarjeta del rival.
    // Un dígito sin 0 se entiende en centenas: "1" y «000» es 1000.
    changeLife(host, ['1', '000'])

    expect(within(host.container).getByRole('button', { name: /Puntos de vida de Ana: 7000/ })).toBeInTheDocument()
    expect(within(guest.container).getByRole('button', { name: /Puntos de vida de Ana: 7000/ })).toBeInTheDocument()
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
    expect(within(guest.container).getByRole('button', { name: 'Más opciones' })).toBeInTheDocument()

    click(guest, 'Salir del duelo')
    fireEvent.click(within(screen.getByRole('alertdialog')).getByRole('button', { name: 'Abandonar y perder' }))
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

    // Atacar al monstruo de Beto: el menú lista a los del rival sólo por el nombre de su carta y Beto lee el nombre de SU carta.
    tap(zoneOf(host, 'Zona de monstruo 1').getAllByRole('button')[0]!)
    fireEvent.click(screen.getByRole('menuitem', { name: 'Atacar' }))
    const choices = screen.getAllByRole('menuitem').map((item) => item.textContent)
    expect(choices).toHaveLength(1)
    expect(choices[0]).toMatch(/^Monstruo \d+$/)
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

  it('al atacar, el monstruo del rival se elige tocándolo en el campo: el menú no tapa la mesa y sólo dice el nombre, y los que se pueden atacar laten', () => {
    const { host, guest } = startDuel({ cardsById: monsters })
    openTable(host, guest)

    // Cada uno invoca un monstruo y Ana pasa a la Battle Phase.
    const betoCard = summonFirst(guest)
    flush()
    summonFirst(host)
    flush()
    click(host, 'Battle Phase')
    flush()

    tap(zoneOf(host, 'Zona de monstruo 1').getAllByRole('button')[0]!)
    fireEvent.click(screen.getByRole('menuitem', { name: 'Atacar' }))

    // El menú dice sólo el nombre (sin la zona) y el fondo deja pasar los toques; el monstruo del rival late como una zona que se puede elegir.
    expect(screen.getAllByRole('menuitem').map((item) => item.textContent)).toEqual([expect.stringMatching(/^Monstruo \d+$/)])
    expect(screen.getByRole('menu').parentElement).toHaveClass('pointer-events-none')
    const rivalCard = host.container.querySelector('[data-rival-card-id]')!
    expect(rivalCard).toHaveAttribute('data-attack-target', 'true')

    // Tocarlo en el campo ataca: se va el menú y deja de latir, y Beto ve el ataque a su carta.
    fireEvent.click(within(host.container).getByRole('button', { name: 'Rival, Zona de monstruo 1: marcar' }))
    flush()
    expect(screen.queryByRole('menu')).not.toBeInTheDocument()
    expect(rivalCard).not.toHaveAttribute('data-attack-target')
    expect(within(guest.container).queryAllByText(`Ana ataca a ${betoCard}`).some((element) => element.getAttribute('role') === 'status')).toBe(true)
    // No se abrió el menú de Señalar y Target de su carta: el toque fue de atacar.
    expect(screen.queryByRole('menuitem', { name: 'Señalar' })).not.toBeInTheDocument()
  })

})
