// Lo que comparten las pruebas de la pantalla del duelo (repartidas en varios archivos): las salas de mentira, el render con el store y los helpers de la mesa.
import { configureStore } from '@reduxjs/toolkit'
import { act, fireEvent, render as renderBare, screen, within, type RenderResult } from '@testing-library/react'
import type { ReactElement } from 'react'
import { Provider } from 'react-redux'
import { vi } from 'vitest'
import { extractRoomCode } from '../../app/duel-link'
import type { SocketStatus, SocketTransport, SpectatorSocket } from '../../app/duel-socket'
import type { DuelConnect } from '../../app/use-duel'
import type { RoomsApi } from '../../app/duel-rooms'
import type { LiveDuel, PublicRoom } from '../../app/duel-relay-rules'
import { DuelScreen } from '../../components/duel/DuelScreen'
import type { ApiCardReference } from '../../types'
import type { MemoryEnd, MemoryRoom, MemorySpectator } from './memory-room'

const store = configureStore({ reducer: { settings: (state = { handSize: 5, deckFormat: 'unlimited' as const }) => state } })

/** Las salas públicas del relay, de mentira: lo que esperan, lo que se juega y cada aviso del anfitrión. */
export const fakeRooms = (list: PublicRoom[] = [], live: LiveDuel[] = []) => ({
  list: vi.fn(async () => list),
  overview: vi.fn(async () => ({ rooms: list, live })),
  register: vi.fn<RoomsApi['register']>(async () => true),
  live: vi.fn<RoomsApi['live']>(async () => true),
  unlist: vi.fn<RoomsApi['unlist']>(),
})

/** Cada pantalla en su propio contenedor: las dos conviven en el mismo documento, como dos pestañas. */
export const render = (ui: ReactElement): RenderResult => renderBare(<Provider store={store}>{ui}</Provider>, { container: document.body.appendChild(document.createElement('div')) })

export const asSocket = (end: MemoryEnd, status: SocketStatus = 'open'): SocketTransport =>
  Object.assign(end, {
    status,
    onStatus: (listener: (status: SocketStatus) => void) => {
      listener(status)
      return () => {}
    },
  })

export const asSpectatorSocket = (spectator: MemorySpectator, status: SocketStatus = 'open'): SpectatorSocket =>
  Object.assign(spectator, {
    status,
    onStatus: (listener: (status: SocketStatus) => void) => {
      listener(status)
      return () => {}
    },
  })

export const mainIds = Array.from({ length: 40 }, (_, index) => `card-${1000 + index}-1`)
const extraIds = ['card-9001-1']
export const cardsById = new Map([...mainIds, ...extraIds].map((id) => [id, { name: `Carta ${id}`, apiCard: null }]))

// Para jugar de verdad (invocar, atacar) las cartas tienen que ser monstruos: el marco dice qué son.
export const effectMonster = { ygoprodeckId: 1, frameType: 'effect', cardType: 'x', race: null, description: null, attribute: null, level: null, linkValue: null, atk: null, def: null, archetype: null, ygoprodeckUrl: null, imageUrl: null, imageUrlSmall: null } as unknown as ApiCardReference

export const monsters = new Map([...mainIds, ...extraIds].map((id) => [id, { name: `Monstruo ${id.replace(/\D/g, '')}`, apiCard: effectMonster }]))

/**
 * En el celular, Reconectar, Rendirme y Salir del duelo van detrás de «Más opciones del duelo» (en escritorio están a la vista): abre la hoja y devuelve el botón.
 * La hoja queda abierta; `closeMore` la cierra.
 */
const MORE_OPTIONS = ['Reconectar', 'Rendirme', 'Salir del duelo']

export const moreButton = (view: RenderResult, name: string): HTMLElement => {
  const inline = within(view.container).queryByRole('button', { name })

  if (inline) return inline

  fireEvent.click(within(view.container).getByRole('button', { name: 'Más opciones del duelo' }))

  return within(screen.getByRole('dialog', { name: 'Más opciones del duelo' })).getByRole('button', { name })
}

/** La moneda, el dado y los juegos están dentro del + (el botón «Ficha»): se abre su menú y se elige. */
export const openGames = (view: RenderResult) => {
  tap(within(view.container).getByRole('button', { name: 'Ficha' }))
  fireEvent.click(screen.getByRole('menuitem', { name: 'Moneda, dado y más' }))
}

export const closeMore = () => fireEvent.keyDown(document, { key: 'Escape' })

const PHASE_NAMES = ['Draw Phase', 'Standby Phase', 'Main Phase 1', 'Battle Phase', 'Main Phase 2', 'End Phase']

/** El botón de la fase de ahora (en el centro del campo): al tocarlo muestra las fases. */
export const phaseChip = (view: RenderResult) => within(view.container).getByRole('button', { name: /^Fases:/ })

export const typeInto = (view: RenderResult, label: string, value: string) => fireEvent.change(within(view.container).getByLabelText(label), { target: { value } })

export const rulesDialog = () => screen.getByRole('dialog', { name: 'Reglas del duelo' })

/** Tus vidas (la casilla de abajo): tocarla abre la calculadora de vidas del duelo. */
export const myLife = (view: RenderResult) => view.container.querySelector<HTMLElement>('[data-lp="mine"]')!

export const openCalculator = (view: RenderResult) => fireEvent.click(myLife(view))

export const calculator = () => within(screen.getByRole('dialog', { name: 'Calculadora de LP' }))

export const closeCalculator = () => {
  const close = screen.queryByRole('button', { name: 'Cerrar la calculadora' })

  if (close) fireEvent.click(close)
}

const pointer = { button: 0, pointerId: 1 }

export const tap = (element: HTMLElement) => {
  fireEvent.pointerDown(element, { ...pointer, clientX: 10, clientY: 10 })
  fireEvent.pointerUp(element, { ...pointer, clientX: 10, clientY: 10 })
}

export const handOf = (view: RenderResult) => within(within(view.container).getByRole('list', { name: 'Mano' }))

export const zoneOf = (view: RenderResult, name: string) => within(within(view.container).getByRole('group', { name }))

/** Invoca la primera carta de la mano en la zona de monstruo 1 y devuelve cómo se llama. */
export function summonFirst(view: RenderResult): string {
  const [card] = handOf(view).getAllByRole('listitem')
  const name = card!.getAttribute('aria-label')!

  tap(card!)
  fireEvent.click(screen.getByRole('menuitem', { name: 'Invocación Normal' }))
  fireEvent.click(within(view.container).getByRole('button', { name: 'Zona de monstruo 1: elegir' }))
  return name
}

/** Sale del duelo desde la mesa (con la confirmación): en un duelo en curso es abandonarlo; terminado, sólo salir. */
export function leaveDuel(view: RenderResult) {
  // La de la barra es la primera (con el resultado en pantalla, la tarjeta tiene la suya debajo).
  fireEvent.click(within(view.container).getAllByRole('button', { name: 'Salir del duelo' })[0]!)
  fireEvent.click(within(screen.getByRole('alertdialog')).getByRole('button', { name: /^(Abandonar y perder|Salir)$/ }))
}

export const hasSave = (role: 'host' | 'guest') => Object.keys(localStorage).some((key) => key.startsWith('ygo-lab:duel-save:') && key.endsWith(`:${role}`))

/** Una pantalla de escritorio (a partir de 1101 px): ahí el chat va fijo a la derecha. */
export const asDesktop = () => {
  window.matchMedia = ((query: string) => ({ matches: query.includes('1101') || query.includes('1440') || query.includes('reduce'), media: query, addEventListener: () => {}, removeEventListener: () => {}, addListener: () => {}, removeListener: () => {}, onchange: null, dispatchEvent: () => false })) as typeof window.matchMedia
}

/**
 * Los helpers que tocan la sala de la prueba en curso: `sala()` devuelve la memoria y la conexión actuales
 * (las pruebas las reasignan, por eso no se capturan al crear el arnés).
 */
export function createDuelHarness(sala: () => { memory: MemoryRoom; connect: DuelConnect }) {
  const screenProps = (overrides: Partial<Parameters<typeof DuelScreen>[0]> = {}) => ({ handSize: 5, mainIds, extraIds, cardsById, deckName: 'Mi deck', connect: sala().connect, connectSpectator: () => asSpectatorSocket(sala().memory.spectate()), ...overrides })
  const flush = () => act(() => sala().memory.flush())

  /** El rival de quien tocó Deshacer ve el cartel y permite volver atrás la jugada. */
  const allowUndo = () => {
    fireEvent.click(screen.getByRole('button', { name: 'Permitir' }))
    flush()
  }

  /** Pasar de fase le pregunta al rival si no va a hacer nada más: acá lo deja pasar (si no hay pregunta, no hace nada). */
  const letPass = () => {
    flush()

    const allow = screen.queryByRole('button', { name: 'Dejar pasar' })

    if (allow) {
      fireEvent.click(allow)
      flush()
    }
  }

  const click = (view: RenderResult, name: string | RegExp, role: 'button' | 'menuitem' = 'button') =>
    typeof name === 'string' && role === 'button' && PHASE_NAMES.includes(name)
      ? (fireEvent.click(phaseChip(view)), fireEvent.click(screen.getByRole('menuitem', { name: new RegExp(`^(Ir a |Fase actual: )?${name}`) })), letPass())
      : fireEvent.click(typeof name === 'string' && role === 'button' && MORE_OPTIONS.includes(name) ? moreButton(view, name) : within(view.container).getByRole(role, { name }))

  /** La hoja «Reglas del duelo» (está en un portal, fuera de la pantalla): se abre desde el renglón de las reglas del inicio de Jugar. */
  const openRules = (view: RenderResult) => click(view, /^Reglas del duelo/)

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

  /** Entrar con un enlace o un código: el campo está detrás de «Tengo un código». */
  const joinByLink = (view: RenderResult, link: string) => {
    if (!within(view.container).queryByRole('textbox', { name: 'Enlace o código' })) click(view, 'Tengo un código')

    typeInto(view, 'Enlace o código', link)
    click(view, 'Unirme')
  }

  /** Cambiar mis vidas con la calculadora: se tocan las teclas, se aplica con «=» y se cierra (con las vidas en cero la mesa la cierra sola). */
  const changeLife = (view: RenderResult, keys: string[], apply: RegExp = /^Aplicar: restar/) => {
    openCalculator(view)
    const pad = within(screen.getByRole('group', { name: 'Teclado' }))

    for (const key of keys) fireEvent.click(pad.getByRole('button', { name: key }))
    fireEvent.click(screen.getByRole('button', { name: apply }))
    flush()
    closeCalculator()
  }

  /** En el celular, el botón de la End Phase pregunta si se termina el turno: «Terminar turno» lo pasa. */
  const confirmEndTurn = () => {
    fireEvent.click(within(screen.getByRole('alertdialog', { name: '¿Terminar tu turno?' })).getByRole('button', { name: 'Terminar turno' }))
    letPass()
  }

  /** Pasar el turno como se hace: llegar a la End Phase y, en escritorio, tocar «Pasar turno» (aparece ahí, debajo del botón de las fases); en el celular, contestar la pregunta. */
  const passTurn = (view: RenderResult) => {
    click(view, 'End Phase')
    flush()
    const pass = within(view.container).queryByRole('button', { name: 'Pasar turno' })

    if (pass) {
      fireEvent.click(pass)
      letPass()
    } else {
      confirmEndTurn()
    }
  }

  /** Pasar el turno estando ya en la End Phase (por ejemplo, después de deshacer): tocar de nuevo el botón de la End Phase. */
  const passTurnFromEnd = (view: RenderResult) => {
    const pass = within(view.container).queryByRole('button', { name: 'Pasar turno' })

    if (pass) {
      fireEvent.click(pass)
      letPass()
    } else {
      fireEvent.click(phaseChip(view))
      confirmEndTurn()
    }
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

  /** Un Match con siding hasta la pantalla del siding de Ana (la anfitriona): Beto se rindió y los dos tocaron «Siguiente duelo». */
  function startSiding() {
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
    click(guest, 'Siguiente duelo')

    const zone = (view: RenderResult, name: 'main' | 'extra' | 'side') => view.container.querySelector<HTMLElement>(`[data-deck-zone="${name}"][data-deck-count]`)!
    const counts = (view: RenderResult) => (['main', 'extra', 'side'] as const).map((name) => zone(view, name).dataset.deckCount)

    return { host, guest, props, counts }
  }

  /** Los dos adentro de la sala, con su nombre. */
  let startedWith: Partial<Parameters<typeof DuelScreen>[0]> = {}

  function startDuel(props: Partial<Parameters<typeof DuelScreen>[0]> = {}) {
    startedWith = props
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

  /** Cierra la pestaña en pleno duelo (o se cae la conexión) y vuelve a abrir la app: el duelo queda en pausa, con lo guardado, y se retoma desde el inicio del duelo. */
  function closeTab(view: RenderResult) {
    view.unmount()
    window.history.replaceState(null, '', '#duel')
    Object.assign(view, render(<DuelScreen {...screenProps(startedWith)} />))
  }

  return { allowUndo, arriveByLink, changeLife, click, closeTab, confirmEndTurn, createRoom, flush, joinByLink, letPass, openDeck, openRules, openTable, passTurn, passTurnFromEnd, screenProps, startDuel, startSiding }
}
