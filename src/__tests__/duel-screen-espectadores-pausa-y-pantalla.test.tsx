// @vitest-environment jsdom
import { act, cleanup, fireEvent, screen, within, type RenderResult } from '@testing-library/react'
import '@testing-library/jest-dom'
import type { ReactElement } from 'react'
import { toast } from 'react-hot-toast'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { extractRoomCode } from '../app/duel-link'
import { readPlayReturn } from '../app/play-return'
import type { SocketTransport } from '../app/duel-socket'
import type { DuelConnect } from '../app/use-duel'
import { DuelScreen } from '../components/duel/DuelScreen'
import { COMPACT_FIELD_MEDIA_QUERY } from '../components/probability/compact-field'
import { createMemoryRoom, type MemoryEnd, type MemoryRoom } from './support/memory-room'
import { createDuelHarness, asDesktop, asSocket, asSpectatorSocket, closeMore, handOf, hasSave, leaveDuel, mainIds, monsters, moreButton, openGames, phaseChip, render, rulesDialog, summonFirst, tap, typeInto, zoneOf } from './support/duel-screen-harness'

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

const { arriveByLink, changeLife, click, closeTab, createRoom, flush, joinByLink, openTable, screenProps, startDuel } = createDuelHarness(() => ({ memory, connect }))

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
    for (const name of [/Deshacer/, /Moneda, dado y más/, /Estoy listo/, /Abrir la calculadora de vidas/, /Draw Phase$/, /Main Phase 1$/, /Ficha/]) {
      expect(view.queryByRole('button', { name })).not.toBeInTheDocument()
    }
    expect(view.queryAllByRole('listitem', { name: /Mano/ })).toHaveLength(0)
  })

  it('quien mira ve volar las cartas: Ana manda el tope de su deck al cementerio y la carta vuela en la mesa de quien mira', () => {
    const { host, guest } = startDuel()
    openTable(host, guest)
    const room = extractRoomCode(window.location.hash)!
    // Con animaciones (jsdom no las tiene) desde antes de abrir la mesa de quien mira: la primera medida es la de su mesa recién abierta.
    const { animate, getAnimations, matchMedia } = { animate: Element.prototype.animate, getAnimations: Element.prototype.getAnimations, matchMedia: window.matchMedia }
    Element.prototype.getAnimations = () => []
    Element.prototype.animate = function () {
      return { cancel() {}, finish() {}, onfinish: null, oncancel: null } as unknown as Animation
    }
    window.matchMedia = (() => ({ matches: false, media: '', addEventListener: () => {}, removeEventListener: () => {}, addListener: () => {}, removeListener: () => {}, onchange: null, dispatchEvent: () => false })) as unknown as typeof window.matchMedia

    try {
      window.history.replaceState(null, '', `#duel?room=${room}&watch=1`)
      const watcher = render(<DuelScreen {...screenProps({ mainIds: [], extraIds: [], cardsById: new Map() })} />)
      flush()
      flush()

      fireEvent.keyDown(within(host.container).getByRole('button', { name: /^Main: [0-9]+$/ }), { key: 'Enter' })
      fireEvent.click(screen.getByRole('menuitem', { name: 'Mandar al cementerio' }))
      flush()

      // El fantasma vuela dentro de la mesa de quien mira (Ana es la de abajo: sus pilas, con las marcas propias), y el cementerio espera a que llegue.
      const table = within(watcher.container).getByTestId('spectator-table')
      expect(table.querySelector(':scope > [data-flight-ghost]')).not.toBeNull()
      expect(table.querySelector('[data-drop="gy"] [data-flight-hold]')).not.toBeNull()
    } finally {
      Element.prototype.animate = animate
      Element.prototype.getAnimations = getAnimations
      window.matchMedia = matchMedia
    }
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

  it('al empezar el duelo los dos ven en el medio de la pantalla si van primero o segundo; el cartel no tapa la mesa y se va solo', () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] })
    const { host, guest } = startDuel()
    openTable(host, guest)

    const banner = (view: RenderResult) => within(view.container).getByTestId('turn-banner')
    expect(banner(host)).toHaveAttribute('data-turn', 'first')
    expect(within(banner(host)).getByRole('heading', { name: 'Vas primero' })).toBeInTheDocument()
    expect(banner(guest)).toHaveAttribute('data-turn', 'second')
    expect(within(banner(guest)).getByRole('heading', { name: 'Vas segundo' })).toBeInTheDocument()
    expect(within(banner(guest)).getByText('Empieza Ana. Tu turno viene después.')).toBeInTheDocument()
    // La medalla es 3D (un número en un disco de metal) y no recibe toques: la mesa se puede usar mientras tanto.
    expect(banner(host).querySelector('[data-medal="first"]')).not.toBeNull()
    expect(banner(host)).toHaveClass('pointer-events-none')

    act(() => {
      vi.advanceTimersByTime(3000)
    })
    expect(within(host.container).queryByTestId('turn-banner')).not.toBeInTheDocument()
    expect(within(guest.container).queryByTestId('turn-banner')).not.toBeInTheDocument()
  })

  it('el final es un cartel con una medalla 3D: ganar es ámbar con rayos y confeti; perder es roja, se agrieta y no lleva confeti', () => {
    const { host, guest } = startDuel()
    openTable(host, guest)
    click(guest, 'Rendirme')
    fireEvent.click(within(screen.getByRole('alertdialog')).getByRole('button', { name: 'Rendirme' }))
    flush()

    const won = within(host.container).getByRole('dialog', { name: '¡Ganaste!' })
    const lost = within(guest.container).getByRole('dialog', { name: 'Perdiste' })

    expect(within(won).getByTestId('result-hero')).toHaveAttribute('data-tone', 'win')
    expect(won.querySelector('[data-medal="win"]')).not.toBeNull()
    expect(won.querySelector('.medal-rays')).not.toBeNull()
    expect(won.querySelector('[data-fx="confetti"]')).not.toBeNull()
    expect(within(lost).getByTestId('result-hero')).toHaveAttribute('data-tone', 'lose')
    expect(lost.querySelector('[data-medal="lose"] path')).not.toBeNull()
    expect(lost.querySelector('[data-fx="confetti"]')).toBeNull()
    // Los botones de siempre siguen: ver la mesa y la revancha.
    expect(within(won).getByRole('button', { name: 'Revancha' })).toBeInTheDocument()
  })

  it('quien mira ve el final con un cartel (quién ganó y por qué) y, terminado el duelo, vuelve solo al inicio', () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] })
    const { host, guest } = startDuel()
    openTable(host, guest)
    const room = extractRoomCode(window.location.hash)!
    window.history.replaceState(null, '', `#duel?room=${room}&watch=1`)
    const watcher = render(<DuelScreen {...screenProps({ mainIds: [], extraIds: [], cardsById: new Map() })} />)
    flush()
    flush()

    expect(within(watcher.container).queryByTestId('watch-result')).not.toBeInTheDocument()

    click(guest, 'Rendirme')
    fireEvent.click(within(screen.getByRole('alertdialog')).getByRole('button', { name: 'Rendirme' }))
    flush()

    const end = within(watcher.container).getByRole('dialog', { name: 'Ganó Ana' })
    expect(within(end).getByText('Beto se rindió.')).toBeInTheDocument()
    expect(end.querySelector('[data-medal="win"]')).not.toBeNull()
    expect(within(end).getByRole('button', { name: 'Volver al inicio' })).toBeInTheDocument()

    // Se terminó lo que miraba: a los pocos segundos vuelve al inicio.
    expect(within(watcher.container).getByTestId('spectator-table')).toBeInTheDocument()
    act(() => {
      vi.advanceTimersByTime(8500)
    })
    expect(within(watcher.container).queryByTestId('spectator-table')).not.toBeInTheDocument()
    expect(within(watcher.container).queryByTestId('watch-result')).not.toBeInTheDocument()
  })

  it('el control de un monstruo: Ana lo da desde su menú, Beto lo recibe solo en su campo y lo puede devolver; y Beto puede tomar uno de Ana desde el menú de su carta', () => {
    const { host, guest } = startDuel({ cardsById: monsters })
    openTable(host, guest)

    const myMonster = (view: RenderResult) => tap(zoneOf(view, 'Zona de monstruo 1').getAllByRole('button')[0]!)
    const occupied = (view: RenderResult, zone: number) => zoneOf(view, `Zona de monstruo ${zone}`).queryAllByRole('button').length > 0

    summonFirst(host)
    flush()

    // El menú del monstruo propio ofrece dar el control (al rival, por su nombre).
    myMonster(host)
    expect(screen.getByRole('menuitem', { name: 'Dar el control a Beto' })).toBeInTheDocument()
    fireEvent.click(screen.getByRole('menuitem', { name: 'Dar el control a Beto' }))
    flush()

    expect(occupied(host, 1)).toBe(false)
    expect(occupied(guest, 1)).toBe(true)
    // Ana lo ve en el campo de Beto, con su carta, y el paso no se puede deshacer.
    expect(within(host.container).getByRole('button', { name: 'Rival, Zona de monstruo 1: marcar' })).toBeInTheDocument()
    expect(within(host.container).getByRole('button', { name: 'Deshacer' })).toBeDisabled()
    expect(within(guest.container).getByRole('button', { name: 'Deshacer' })).toBeDisabled()

    // Beto lo tiene: su menú ofrece devolverlo (en vez de dar el control).
    myMonster(guest)
    expect(screen.getByRole('menuitem', { name: 'Devolver el control a Ana' })).toBeInTheDocument()
    expect(screen.queryByRole('menuitem', { name: 'Dar el control a Ana' })).not.toBeInTheDocument()
    fireEvent.click(screen.getByRole('menuitem', { name: 'Devolver el control a Ana' }))
    flush()
    expect(occupied(guest, 1)).toBe(false)
    expect(occupied(host, 1)).toBe(true)

    // Beto toma el monstruo de Ana desde el menú de su carta en el campo de ella.
    fireEvent.click(within(guest.container).getByRole('button', { name: 'Rival, Zona de monstruo 1: marcar' }))
    fireEvent.click(screen.getByRole('menuitem', { name: 'Tomar el control' }))
    flush()
    expect(occupied(host, 1)).toBe(false)
    expect(occupied(guest, 1)).toBe(true)
    // Ana ve que se lo llevaron y puede recuperarlo.
    fireEvent.click(within(host.container).getByRole('button', { name: 'Rival, Zona de monstruo 1: marcar' }))
    fireEvent.click(screen.getByRole('menuitem', { name: 'Recuperar el control' }))
    flush()
    expect(occupied(host, 1)).toBe(true)
    expect(occupied(guest, 1)).toBe(false)
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

  it('quien entra por un enlace sin deck lee quién lo invitó, ve explicado qué falta y tiene un solo botón principal para elegir uno ahí mismo', () => {
    const { host, guest } = arriveByLink({ mainIds: mainIds.slice(0, 2), extraIds: [], cardsById: new Map() })
    const view = within(guest.container)

    expect(view.getByText('Ana te invitó a un duelo')).toBeInTheDocument()
    expect(view.getByRole('button', { name: 'Estoy listo' })).toBeDisabled()
    // Dice qué hacer sin mandar a un «abajo» que no existe, y el botón dice lo que hace (no «Cambiar deck» a quien no tiene).
    expect(view.getByText(/hacen falta 5 cartas en el Main y tu deck tiene 2\. Elegí un deck/)).toBeInTheDocument()
    expect(view.queryByText(/abajo/)).not.toBeInTheDocument()
    expect(view.queryByRole('button', { name: 'Cambiar deck' })).not.toBeInTheDocument()
    expect(view.getByRole('button', { name: 'Elegir mi deck' })).toHaveClass('bg-primary')
    // El anfitrión no lee «te invitó»: con el rival adentro, copiar el enlace deja de ser el botón principal.
    expect(within(host.container).queryByText(/te invitó a un duelo/)).not.toBeInTheDocument()
    expect(within(host.container).getByRole('button', { name: 'Copiar enlace' })).not.toHaveClass('bg-primary')
    // Elegir el deck lleva al builder y, de vuelta, a la misma sala.
    click(guest, 'Elegir mi deck')
    expect(window.location.hash).toBe('#deck-builder')
    expect(readPlayReturn()?.startsWith('#duel?room=')).toBe(true)
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

    // Con menos de tres cifras se entiende en centenas: "10" es 1000.
    changeLife(guest, ['1', '0'])
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
    expect(within(host.container).getByRole('button', { name: /Puntos de vida de Beto: 7000/ })).toBeInTheDocument()
  })

  it('salir del duelo lo deja en pausa: lo guardado sigue, el rival ve la pausa (y el reloj se para), y al volver sigue la misma mesa', () => {
    const { host, guest } = startDuel({ cardsById: monsters })
    openTable(host, guest, 'guest')

    const cardsOf = (view: RenderResult) => handOf(view).getAllByRole('listitem').map((card) => card.getAttribute('aria-label'))
    const summoned = summonFirst(guest)
    flush()
    const hand = cardsOf(guest)
    expect(within(host.container).getByRole('button', { name: /Pausar el reloj/ })).toBeInTheDocument()

    closeTab(guest)
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

  it('si el duelo entra en pausa con el visor de una pila abierto, se esconde sin cerrarse: al seguir vuelve como estaba, con lo buscado', () => {
    const { host, guest } = startDuel({ cardsById: monsters })
    openTable(host, guest)

    const viewer = () => screen.queryByRole('dialog', { name: /^Main · / })
    tap(within(guest.container).getByRole('button', { name: /^Main: [0-9]+$/ }))
    fireEvent.change(within(viewer()!).getByRole('searchbox', { name: 'Buscar carta' }), { target: { value: 'Monstruo' } })

    closeTab(host)
    flush()
    expect(within(guest.container).getByRole('alertdialog', { name: 'Duelo en pausa' })).toBeInTheDocument()
    expect(viewer()).not.toBeInTheDocument()

    click(host, 'Volver al duelo')
    flush()
    flush()
    expect(within(guest.container).queryByRole('alertdialog', { name: 'Duelo en pausa' })).not.toBeInTheDocument()
    expect(within(viewer()!).getByRole('searchbox', { name: 'Buscar carta' })).toHaveValue('Monstruo')
  })

  it('si el duelo entra en pausa con un cartel de opciones abierto (el de una carta del rival o el de una propia), no se ve, y no vuelve al seguir', () => {
    const { host, guest } = startDuel({ cardsById: monsters })
    openTable(host, guest)

    const pauseOf = () => within(guest.container).queryByRole('alertdialog', { name: 'Duelo en pausa' })

    // El menú de lo del rival (su cementerio) abierto cuando Ana sale.
    fireEvent.click(within(guest.container).getByRole('button', { name: 'GY: marcar' }))
    expect(screen.getByRole('menu')).toBeInTheDocument()
    closeTab(host)
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
    closeTab(host)
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
    expect(bar.getAllByRole('button', { name: /^Puntos de vida de / }).some((tile) => top.contains(tile))).toBe(true)
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
    closeTab(guest)
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
    closeTab(guest)
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
    closeTab(guest)
    flush()
    localStorage.setItem(hostKey, hostSave)
    const notices = rowOf(view.getByText('En pausa'))
    expect(notices).not.toBe(top)
    expect(notices).not.toBe(watching)
    expect(notices).toHaveTextContent('Falta un jugador')
    expect(notices).not.toHaveClass('flex-wrap')
  })

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
    changeLife(guest, ['8', '0'], /^Aplicar: restar 8000/)

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

  it('en un celular en vertical (menos de 640 px) el campo se ajusta al alto de la pantalla y la línea de jugadas flota sobre la mano del rival (no ocupa lugar): al terminar el duelo la tira del resultado ocupa su lugar y tampoco suma alto', () => {
    window.matchMedia = ((query: string) => ({ matches: query === COMPACT_FIELD_MEDIA_QUERY, media: query, addEventListener: () => {}, removeEventListener: () => {}, addListener: () => {}, removeListener: () => {} })) as unknown as typeof window.matchMedia
    const { host, guest } = startDuel()
    openTable(host, guest)

    // El campo: la casilla sale del alto de la pantalla (3D, lo de siempre) y la mano del rival se acomoda con ella.
    const field = within(host.container).getByLabelText('Campo')
    expect(field.style.getPropertyValue('--cell-m')).toContain('calc((100dvh - 30.9rem) / 5.2)')

    // La línea de jugadas: sin lugar en el celular (flota), arriba del campo.
    const floating = () => Array.from(host.container.querySelectorAll<HTMLElement>('[class~="max-sm:-mb-11"]'))
    expect(floating()).toHaveLength(1)
    expect(floating()[0]).toHaveClass('order-3', 'max-sm:z-20', 'max-sm:pointer-events-none')
    expect(floating()[0]).not.toHaveClass('max-[1101px]:hidden')

    // Termina el duelo y se cierra la tarjeta: la tira del resultado ocupa ese mismo lugar (la línea se esconde) y flota igual.
    click(guest, 'Rendirme')
    fireEvent.click(within(screen.getByRole('alertdialog')).getByRole('button', { name: 'Rendirme' }))
    flush()
    fireEvent.click(within(within(host.container).getByRole('dialog', { name: '¡Ganaste!' })).getByRole('button', { name: 'Ver la mesa' }))

    const rows = floating()
    expect(rows).toHaveLength(2)
    expect(rows.filter((row) => row.classList.contains('max-[1101px]:hidden'))).toHaveLength(1)
    const strip = rows.find((row) => within(row).queryByRole('button', { name: 'Revancha' }))
    expect(strip).toHaveClass('order-3', 'max-sm:relative', 'max-sm:z-20')
  })

  it('la señal de abajo (👍 continuá) está a mano del pulgar; las tuyas salen como un globo junto a tus vidas y las del rival, en el celular, como un mensaje más en la línea del registro (no en toda la pantalla)', () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] })
    const { host, guest } = startDuel()
    openTable(host, guest)
    const bubble = (view: RenderResult, side: 'mine' | 'theirs') => view.container.querySelector(`[data-lp="${side}"] [role="status"]`)

    const rivalEmoji = (view: RenderResult) => within(view.container).queryByTestId('rival-emoji')

    expect(rivalEmoji(host)).toBeNull()
    // Abajo, con el pulgar: deshacer y el chat (a la derecha del todo); las dos reacciones van centradas debajo de la mano, en su propia fila. El + (la ficha, los contadores y los juegos) ya no está en la botonera: va en el campo, a la altura del reloj de turnos, entre el Banish del rival y la Zona Extra de monstruos; del otro lado del reloj, el botón de la fase.
    const toolbar = within(guest.container).getByRole('toolbar')
    expect(within(toolbar).getAllByRole('button').map((button) => button.getAttribute('aria-label'))).toEqual(['Deshacer', 'Chat', 'Pensando…', 'Continuá', expect.stringMatching(/^Puntos de vida de/)])
    // Las dos reacciones van en la misma fila que tus vidas y los botones, en el medio (la columna del centro).
    const reactions = within(guest.container).getByRole('group', { name: 'Mensajes rápidos' })
    expect(within(reactions).getAllByRole('button').map((button) => button.getAttribute('aria-label'))).toEqual(['Pensando…', 'Continuá'])
    expect(toolbar).toContainElement(reactions)
    expect(reactions.parentElement).toHaveClass('col-start-2', 'row-start-1')
    expect(within(guest.container).queryByRole('button', { name: 'Pasar turno' })).not.toBeInTheDocument()
    const plus = within(guest.container).getByRole('button', { name: 'Ficha' })
    expect(toolbar).not.toContainElement(plus)
    // El + va al medio del campo (entre las dos Zonas Extra) y el reloj de turnos donde estaba el +.
    expect(plus.parentElement).toHaveStyle({ gridArea: 'p2' })
    expect(phaseChip(guest).parentElement).toHaveStyle({ gridArea: 'p3' })
    expect(within(toolbar).queryByRole('button', { name: 'Moneda, dado y más' })).not.toBeInTheDocument()

    // Beto avisa que continúa: lo suyo se ve como un globo junto a sus vidas; en el celular el de su rival (Ana) sale como un mensaje entrante (el aviso de abajo a la derecha, con su nombre), no en toda la pantalla.
    const custom = vi.spyOn(toast, 'custom').mockReturnValue('t')
    const incoming = () => custom.mock.calls.map(([render]) => (render as (instance: { id: string; visible: boolean }) => ReactElement)({ id: 't', visible: true }).props as { message: string; rival?: string })

    fireEvent.click(within(guest.container).getByRole('button', { name: 'Continuá' }))
    flush()
    expect(bubble(guest, 'mine')).toHaveTextContent('👍')
    expect(bubble(guest, 'mine')).toHaveClass('text-display')
    expect(bubble(host, 'theirs')).toBeNull()
    expect(rivalEmoji(host)).toBeNull()
    expect(incoming()).toEqual([expect.objectContaining({ message: '👍', rival: 'Beto' })])
    expect(custom).toHaveBeenLastCalledWith(expect.any(Function), expect.objectContaining({ position: 'bottom-right' }))
    // Lo tuyo no avisa (ya sale junto a tus vidas), y la mesa no recibe nada encima.
    expect(rivalEmoji(guest)).toBeNull()
    expect(bubble(host, 'mine')).toBeNull()
    // Una señal no es un mensaje sin leer.
    expect(within(host.container).getByRole('button', { name: 'Chat' })).toBeInTheDocument()

    // El globo de Beto se va solo; y «continuá» es un 👍 que le llega a Beto como a Ana.
    act(() => {
      vi.advanceTimersByTime(4000)
    })
    expect(bubble(guest, 'mine')).toBeNull()
    fireEvent.click(within(host.container).getByRole('button', { name: 'Continuá' }))
    flush()
    expect(incoming().at(-1)).toMatchObject({ message: '👍', rival: 'Ana' })
    expect(within(guest.container).getByRole('button', { name: 'Chat' })).toBeInTheDocument()

    // No hay ✋ «Esperá»: ni botón ni cartel.
    expect(within(guest.container).queryByRole('button', { name: 'Esperá' })).not.toBeInTheDocument()
    expect(host.container.querySelector('[data-hold]')).toBeNull()
  })

  it('en escritorio el emoji del rival sale grande en el medio de la pantalla, no tapa la mesa y desaparece al tocarlo (o solo, a los pocos segundos)', () => {
    vi.useFakeTimers({ toFake: ['Date', 'setTimeout', 'clearTimeout'] })
    asDesktop()
    const { host, guest } = startDuel()
    openTable(host, guest)
    const rivalEmoji = (view: RenderResult) => within(view.container).queryByTestId('rival-emoji')
    const bubble = (view: RenderResult, side: 'mine' | 'theirs') => view.container.querySelector(`[data-lp="${side}"] [role="status"]`)

    expect(rivalEmoji(host)).toBeNull()
    fireEvent.click(within(guest.container).getByRole('button', { name: 'Continuá' }))
    flush()

    expect(rivalEmoji(host)).toHaveTextContent('👍')
    expect(rivalEmoji(host)).toHaveTextContent('Beto')
    expect(rivalEmoji(host)?.querySelector('[aria-hidden]')?.getAttribute('style')).toContain('clamp(7rem')
    // El emoji se muestra en el medio y el globo junto a las vidas del rival no se repite.
    expect(bubble(host, 'theirs')).toBeNull()
    expect(rivalEmoji(guest)).toBeNull()
    // Sólo el emoji recibe toques: el resto de la pantalla (la mesa) sigue usable.
    expect(rivalEmoji(host)).toHaveClass('pointer-events-none')
    const emoji = within(rivalEmoji(host)!).getByRole('button', { name: 'Beto: 👍. Tocá para cerrar' })
    expect(emoji).toHaveClass('pointer-events-auto')

    // Al tocarlo, desaparece.
    fireEvent.click(emoji)
    expect(rivalEmoji(host)).toBeNull()

    // Otro (pasados los 3 segundos que hay entre una señal y la siguiente), que nadie toca, se va solo.
    act(() => {
      vi.advanceTimersByTime(3100)
    })
    fireEvent.click(within(guest.container).getByRole('button', { name: 'Continuá' }))
    flush()
    expect(rivalEmoji(host)).toHaveTextContent('👍')
    act(() => {
      vi.advanceTimersByTime(3000)
    })
    expect(rivalEmoji(host)).toBeNull()
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
      expect(mineLife.querySelector('span.font-extrabold.tabular-nums')).toHaveClass('text-accent')
      expect(mineLine).toHaveClass('bg-accent/20')
      expect(mineLine.querySelector('span')).toHaveClass('text-accent')

      // El del rival, celeste, también en sus dos lugares.
      expect(theirLife).toHaveClass('border-info/50')
      expect(theirLife.querySelector('span.font-extrabold.tabular-nums')).toHaveClass('text-info-soft')
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

    closeTab(guest)
    expect(within(guest.container).getByText(/Tenés un duelo en pausa con/)).toBeInTheDocument()

    // Sin duelo en pausa lo principal es crear uno; con uno en pausa lo principal es volver a él (una sola principal en la vista).
    expect(within(guest.container).getByRole('button', { name: 'Jugar ahora' })).not.toHaveClass('bg-primary')
    expect(within(guest.container).getByRole('button', { name: 'Volver al duelo' })).toHaveClass('bg-primary')

    click(guest, 'Dejar ese duelo')
    expect(within(guest.container).getByRole('button', { name: 'Jugar ahora' })).toHaveClass('bg-primary')
    expect(within(guest.container).queryByText(/Tenés un duelo en pausa/)).not.toBeInTheDocument()
    expect(hasSave('guest')).toBe(false)
  })

  it('sin laterales la barra es la de siempre: el turno y la fase en una línea arriba', () => {
    asDesktop()
    const { host, guest } = startDuel()
    openTable(host, guest)

    expect(within(host.container).queryByTestId('duel-rail-notices')).not.toBeInTheDocument()
    expect(within(host.container).getByTestId('duel-phase')).toHaveTextContent('· Draw Phase')
  })

  it('con laterales (escritorio ancho) la barra se reparte a los costados del campo: vidas y reloj a la izquierda; íconos, turno, tus vidas y deshacer a la derecha', () => {
    asDesktop()
    railsOn.value = true
    const { host, guest } = startDuel()
    openTable(host, guest)

    const view = host
    const notices = within(view.container).getByTestId('duel-rail-notices')

    // Lo que rodea al campo está en la misma grilla que él, en las columnas de los costados, y los avisos van por encima de él: agrandado en 3D se mete en el lateral y, sin esto, los cortaría.
    // La caja de los avisos no ataja toques (sólo sus avisos): ocupa todo el lateral, encima del campo, y tapaba el Extra Deck, el Field y el Banish del rival aun vacía.
    expect(notices).toHaveClass('col-start-1', 'z-20', 'pointer-events-none', '*:pointer-events-auto')
    expect(view.container.querySelector('[data-lp="theirs"]')?.parentElement).toHaveClass('col-start-1', 'row-start-1')
    expect(within(view.container).getByRole('button', { name: 'Rendirme' }).closest('.col-start-3')).not.toBeNull()
    expect(within(view.container).getByTestId('duel-phase')).toHaveTextContent(/^Draw Phase$/)
    expect(within(view.container).getByRole('button', { name: 'Deshacer' }).closest('.col-start-3')).not.toBeNull()
    expect(view.container.querySelector('[data-lp="mine"]')?.closest('.col-start-3')).not.toBeNull()
  })

  it('con laterales, el resultado queda en el lateral derecho, con la revancha apilada abajo del texto', () => {
    asDesktop()
    railsOn.value = true
    const { host, guest } = startDuel()
    openTable(host, guest)

    click(guest, 'Rendirme')
    fireEvent.click(within(screen.getByRole('alertdialog')).getByRole('button', { name: 'Rendirme' }))
    flush()
    fireEvent.click(within(within(host.container).getByRole('dialog')).getByRole('button', { name: 'Ver la mesa' }))

    const rematch = within(host.container).getByRole('button', { name: 'Revancha' })

    expect(rematch).toHaveClass('w-full')
    // Su caja tampoco ataja toques, sólo la tira del resultado: el campo agrandado se mete también en el lateral derecho.
    expect(rematch.closest('.col-start-3')).toHaveClass('pointer-events-none', '*:pointer-events-auto')
  })

})
