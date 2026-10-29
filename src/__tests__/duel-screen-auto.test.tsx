// @vitest-environment jsdom
import { act, cleanup, fireEvent, within, type RenderResult } from '@testing-library/react'
import '@testing-library/jest-dom'
import { useState } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import type { RoomAutoState } from '../app/auto/online'
import { autoPrefs, setAutoPref } from '../app/auto-prefs'
import { extractRoomCode } from '../app/duel-link'
import type { DuelRole } from '../app/duel-session'
import type { DuelConnect } from '../app/use-duel'
import type { AutoDuelScreenProps } from '../components/auto/AutoDuelScreen'
import { DuelScreen } from '../components/duel/DuelScreen'
import { createMemoryRoom, type MemoryRoom } from './support/memory-room'
import { asSocket, createDuelHarness, effectMonster, fakeRooms, handOf, hasSave, monsters, render, rulesDialog, typeInto } from './support/duel-screen-harness'

// La sala con reglas automáticas (beta), de punta a punta en la sala de siempre: la mesa del núcleo va de mentira (la prueban `auto-screen-*` y el enlace, `auto-online-*`);
// acá importa la sala: quién puede estar listo, que nunca se reparte la mesa manual, quién mira, la sala pública y «Jugar ahora».
vi.setConfig({ testTimeout: 20_000 })

vi.mock('../ygoprodeck', () => ({ fetchCardsByIds: vi.fn(async () => []), fetchCardArts: vi.fn(async () => []) }))

let memory: MemoryRoom
let connect: DuelConnect

const { click, flush, joinByLink, openRules, openTable, screenProps, startDuel } = createDuelHarness(() => ({ memory, connect }))

/** «Automático» de «Modo del duelo», en la hoja de las reglas. */
const AUTO = 'Automático'
const CHECKING = 'Revisando los decks de los dos…'

/** Lo que la mesa de mentira le pasa a la sala, por rol: la prueba lo cambia como lo haría el enlace del núcleo (revisar los decks, dejar estar listo). */
const roomState: Record<DuelRole, (state: RoomAutoState) => void> = { host: () => {}, guest: () => {} }
/** Cada vez que se dibujó la mesa de mentira, con lo que recibió. */
const seen: AutoDuelScreenProps[] = []

/** La mesa automática de mentira: la sala (con lo que dice `roomState`) hasta que se eligió quién empieza; después, una marca. */
function FakeAutoDuel(props: AutoDuelScreenProps) {
  const [state, setState] = useState<RoomAutoState>({ canReady: false, notice: { tone: 'info', text: CHECKING, cards: [{ code: 14558127, name: 'Ash Blossom' }] } })

  roomState[props.snapshot.role] = setState
  seen.push(props)

  if (props.siding) return <>{props.siding}</>

  return props.snapshot.opening.ordered ? <div data-testid="auto-duel" /> : <>{props.room(state)}</>
}

/** jsdom no tiene `Worker`: el navegador «puede» correr el núcleo sólo cuando la prueba le pone uno. */
const withWorker = () => vi.stubGlobal('Worker', class {})
const lastProps = (role: DuelRole) => seen.filter((props) => props.snapshot.role === role).at(-1)!
const optionsOf = (room: string) => JSON.parse(sessionStorage.getItem(`ygo-lab:duel-options:${room}`) ?? '{}') as Record<string, unknown>
/** El dato de un renglón de la ficha de la sala (el rótulo «Reglas» es también el título de la ficha, para el lector de pantalla: se busca el del renglón). */
const rule = (view: RenderResult, label: string) => within(within(view.container).getByTestId('room-summary')).getByText(label, { selector: 'dt' }).nextElementSibling

beforeEach(() => {
  memory = createMemoryRoom()
  connect = () => asSocket(memory.join())
  setAutoPref('duel', false)
  localStorage.clear()
  sessionStorage.clear()
  seen.length = 0
  window.history.replaceState(null, '', '#duel')
  HTMLElement.prototype.setPointerCapture = () => {}
  HTMLElement.prototype.scrollIntoView = () => {}
  window.matchMedia = ((query: string) => ({ matches: query.includes('reduce'), media: query, addEventListener: () => {}, removeEventListener: () => {}, addListener: () => {}, removeListener: () => {}, onchange: null, dispatchEvent: () => false })) as typeof window.matchMedia
})

afterEach(() => {
  cleanup()
  setAutoPref('duel', false)
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})

describe('una sala con reglas automáticas', () => {
  it('prendido el modo automático, la hoja deja elegir todo (Match, siding y reloj de turnos) y «Abrir duelo» abre la sala privada que se eligió, que lo dice', () => {
    withWorker()
    const rooms = fakeRooms()
    const host = render(<DuelScreen {...screenProps({ rooms, autoDuel: FakeAutoDuel })} />)
    typeInto(host, 'Tu nombre', 'Ana')
    openRules(host)
    const sheet = within(rulesDialog())
    const toggle = sheet.getByRole('radio', { name: AUTO })

    expect(sheet.getByRole('radio', { name: 'Manual' })).toBeChecked()
    expect(sheet.getByText(/^Movés las cartas vos/)).toBeInTheDocument()
    fireEvent.click(sheet.getByRole('radio', { name: 'Match · mejor de 3' }))
    fireEvent.click(toggle)

    // Es la misma preferencia que la de Solo: prende el modo automático entero.
    expect(toggle).toBeChecked()
    expect(autoPrefs().duel).toBe(true)
    expect(sheet.getByText('Beta: el núcleo aplica las reglas por los dos. Sin espectadores todavía.')).toBeInTheDocument()
    // Match, su siding y el reloj de turnos se siguen eligiendo; Solo también (ahí rige el simulador de handtraps).
    expect(sheet.getByRole('radio', { name: 'Match · mejor de 3' })).toBeChecked()
    expect(sheet.getByRole('switch', { name: 'Sidedeck' })).toBeEnabled()
    expect(sheet.getByRole('radio', { name: 'Solo' })).toBeEnabled()
    expect(sheet.getByRole('switch', { name: 'Límite de tiempo por turno' })).toBeEnabled()
    expect(sheet.getByRole('switch', { name: 'Límite de tiempo por turno' })).toBeChecked()
    // Quién entra se elige como siempre.
    expect(sheet.getByRole('radio', { name: 'Pública' })).toBeChecked()
    expect(sheet.getByRole('radio', { name: 'Privada' })).toBeEnabled()

    fireEvent.click(sheet.getByRole('radio', { name: 'Privada' }))
    fireEvent.click(sheet.getByRole('button', { name: 'Abrir duelo' }))
    const room = extractRoomCode(window.location.hash)!

    expect(optionsOf(room)).toMatchObject({ auto: true, isPublic: false })
    expect(rooms.register).not.toHaveBeenCalled()
    expect(lastProps('host').snapshot.settings).toMatchObject({ auto: true, match: true, siding: false, turnMin: 7, turnBonusMin: 3 })
    expect(rule(host, 'Reglas')).toHaveTextContent('Automáticas (beta)')
    expect(rule(host, 'Tipo')).toHaveTextContent('Match')
    expect(rule(host, 'Quién puede entrar')).toHaveTextContent('Privada')
    expect(rule(host, 'Quién mira')).toHaveTextContent('No disponible')
    expect(within(host.container).queryByRole('button', { name: 'Copiar enlace para mirar' })).toBeNull()
    expect(within(host.container).queryByText(/pueden mirar el duelo/)).toBeNull()
  })

  it('el invitado la ve en la ficha; nadie puede estar listo hasta que la mesa lo diga, y al elegir quién empieza se monta la mesa del núcleo sin repartir (ni guardar) la mesa manual', () => {
    withWorker()
    setAutoPref('duel', true)
    const immersive = vi.fn()
    const { host, guest } = startDuel({ autoDuel: FakeAutoDuel, onImmersiveChange: immersive })
    const ready = (view: RenderResult) => within(view.container).getByRole('button', { name: 'Estoy listo' })

    expect(rule(guest, 'Reglas')).toHaveTextContent('Automáticas (beta)')
    expect(rule(guest, 'Quién mira')).toHaveTextContent('No disponible')
    // Lo que dice la mesa va debajo del deck, con las cartas que nombra (su arte y su nombre).
    expect(within(guest.container).getByText(CHECKING)).toBeInTheDocument()
    expect(within(guest.container).getByText('Ash Blossom')).toBeInTheDocument()
    expect(ready(host)).toBeDisabled()
    expect(ready(guest)).toBeDisabled()

    act(() => {
      roomState.host({ canReady: true, notice: null })
      roomState.guest({ canReady: true, notice: null })
    })
    expect(ready(host)).toBeEnabled()
    expect(ready(guest)).toBeEnabled()
    expect(within(guest.container).queryByText(CHECKING)).toBeNull()

    openTable(host, guest)

    expect(within(host.container).getByTestId('auto-duel')).toBeInTheDocument()
    expect(within(guest.container).getByTestId('auto-duel')).toBeInTheDocument()
    expect(immersive).toHaveBeenLastCalledWith(true)
    for (const role of ['host', 'guest'] as const) {
      const props = lastProps(role)

      expect(props.snapshot.opening.ordered).toBe(true)
      // Nadie llamó a `duel.start`: ni mesa propia ni la del rival (nadie mandó la suya).
      expect(props.snapshot.mine).toBeNull()
      expect(props.snapshot.theirs).toBeNull()
      expect(hasSave(role)).toBe(false)
      expect(props.handSize).toBe(5)
      expect(props.deck.mainIds).toHaveLength(40)
      expect(typeof props.transport.send).toBe('function')
    }
    expect(lastProps('host').myName).toBe('Ana')
    expect(lastProps('guest').myName).toBe('Beto')

    // Se decidió al abrirla: pasar a «Manual» después no la cambia.
    act(() => setAutoPref('duel', false))
    expect(within(host.container).getByTestId('auto-duel')).toBeInTheDocument()

    // El anfitrión recarga: la sala sigue automática (lo guardado en la pestaña) y vuelve a la mesa del núcleo con lo que le repone el invitado, sin repartir nada.
    const room = extractRoomCode(window.location.hash)!

    host.unmount()
    sessionStorage.setItem(`ygo-lab:duel-role:${room}`, 'host')
    window.history.replaceState(null, '', `#duel?room=${room}`)
    seen.length = 0
    const again = render(<DuelScreen {...screenProps({ autoDuel: FakeAutoDuel })} />)
    flush()

    expect(within(again.container).getByTestId('auto-duel')).toBeInTheDocument()
    expect(lastProps('host').snapshot.settings.auto).toBe(true)
    expect(lastProps('host').snapshot.mine).toBeNull()
  })

  it('quien entra a mirar ve que todavía no se puede, suelta la conexión y puede salir', () => {
    withWorker()
    setAutoPref('duel', true)
    startDuel({ autoDuel: FakeAutoDuel })
    const room = extractRoomCode(window.location.hash)!

    window.history.replaceState(null, '', `#duel?room=${room}&watch=1`)
    const watcher = render(<DuelScreen {...screenProps({ mainIds: [], extraIds: [], cardsById: new Map(), autoDuel: FakeAutoDuel })} />)
    flush()
    flush()

    expect(within(watcher.container).getByText('Este duelo usa reglas automáticas: todavía no se puede mirar.')).toBeInTheDocument()
    expect(memory.spectators).toHaveLength(0)
    click(watcher, 'Salir')
    expect(window.location.hash).toBe('#duel')
  })

  it('una sala pública con reglas automáticas se anota mientras espera, sale de la lista al entrar el rival (nunca como duelo en vivo: no se puede mirar) y el rival la ve automática', async () => {
    withWorker()
    setAutoPref('duel', true)
    const rooms = fakeRooms()
    const host = render(<DuelScreen {...screenProps({ rooms, autoDuel: FakeAutoDuel })} />)
    typeInto(host, 'Tu nombre', 'Ana')
    openRules(host)
    fireEvent.click(within(rulesDialog()).getByRole('button', { name: 'Abrir duelo' }))
    const room = extractRoomCode(window.location.hash)!

    expect(optionsOf(room)).toMatchObject({ auto: true, isPublic: true })
    expect(rooms.register).toHaveBeenCalledWith(room, { host: 'Ana', match: false, siding: false, format: 'tcg', limitMin: 50 }, expect.any(String))
    expect(rule(host, 'Quién puede entrar')).toHaveTextContent('Pública')
    const token = rooms.register.mock.calls[0]![2]

    window.history.replaceState(null, '', '#duel')
    const guest = render(<DuelScreen {...screenProps({ autoDuel: FakeAutoDuel })} />)
    typeInto(guest, 'Tu nombre', 'Beto')
    joinByLink(guest, room)
    flush()
    await act(async () => {})

    expect(rooms.unlist).toHaveBeenCalledWith(room, token)
    expect(rooms.live).not.toHaveBeenCalled()
    expect(rooms.register).toHaveBeenCalledTimes(1)
    expect(rule(guest, 'Reglas')).toHaveTextContent('Automáticas (beta)')
    expect(lastProps('guest').snapshot.settings.auto).toBe(true)
  })

  it('«Jugar ahora» sigue al modo automático: prendido, la sala pública que abre es automática', async () => {
    withWorker()
    setAutoPref('duel', true)
    const rooms = fakeRooms()
    const open = render(<DuelScreen {...screenProps({ rooms, autoDuel: FakeAutoDuel })} />)

    click(open, 'Jugar ahora')
    await act(async () => {})

    expect(optionsOf(extractRoomCode(window.location.hash)!)).toMatchObject({ auto: true, isPublic: true })
    expect(rooms.register).toHaveBeenCalledTimes(1)
    expect(within(open.container).queryByRole('button', { name: 'Copiar enlace para mirar' })).toBeNull()
  })

  it('con las reglas automáticas prendidas, «Guardar reglas» guarda el tiempo y el formato, y siguen prendidas', () => {
    withWorker()
    setAutoPref('duel', true)
    const view = render(<DuelScreen {...screenProps({ autoDuel: FakeAutoDuel })} />)

    openRules(view)
    fireEvent.click(within(rulesDialog()).getByRole('radio', { name: 'Sin tiempo' }))
    fireEvent.change(within(rulesDialog()).getByLabelText('Formato'), { target: { value: 'ocg' } })
    fireEvent.click(within(rulesDialog()).getByRole('button', { name: 'Guardar reglas' }))
    openRules(view)

    expect(within(rulesDialog()).getByRole('radio', { name: 'Sin tiempo' })).toBeChecked()
    expect(within(rulesDialog()).getByLabelText('Formato')).toHaveValue('ocg')
    expect(within(rulesDialog()).getByRole('radio', { name: AUTO })).toBeChecked()
  })

  it('sin poder correr el núcleo, o apagado en el despliegue, la fila va apagada y sin tocar, con el porqué, y la sala que se abre es manual', async () => {
    // Prendido de antes, en un navegador sin Worker.
    setAutoPref('duel', true)
    const old = render(<DuelScreen {...screenProps({ autoDuel: FakeAutoDuel })} />)

    openRules(old)
    expect(within(rulesDialog()).getByRole('radio', { name: AUTO })).toBeDisabled()
    expect(within(rulesDialog()).getByRole('radio', { name: AUTO })).not.toBeChecked()
    expect(within(rulesDialog()).getByText('Tu navegador no puede correr las reglas automáticas.')).toBeInTheDocument()
    expect(within(rulesDialog()).getByRole('radio', { name: 'Match · mejor de 3' })).toBeEnabled()
    fireEvent.click(within(rulesDialog()).getByRole('button', { name: 'Abrir duelo' }))
    expect(optionsOf(extractRoomCode(window.location.hash)!)).not.toHaveProperty('auto')
    old.unmount()

    // `AUTO_ONLINE=0` en el despliegue: el manifiesto de los datos lo dice.
    withWorker()
    vi.stubGlobal('fetch', vi.fn(async () => Response.json({ version: 'v', tokens: [], filler: [], features: { online: false } })))
    window.history.replaceState(null, '', '#duel')
    const off = render(<DuelScreen {...screenProps({ autoDuel: FakeAutoDuel })} />)

    openRules(off)
    expect(await within(rulesDialog()).findByText('Las reglas automáticas están apagadas por ahora.', {}, { timeout: 5000 })).toBeInTheDocument()
    expect(within(rulesDialog()).getByRole('radio', { name: AUTO })).toBeDisabled()
    fireEvent.keyDown(document, { key: 'Escape' })
    click(off, 'Retar a un amigo')

    expect(optionsOf(extractRoomCode(window.location.hash)!)).not.toHaveProperty('auto')
    expect(seen).toHaveLength(0)
  })

  it('con el modo automático apagado la sala es la de siempre: se puede mirar y, al elegir quién empieza, cada uno reparte su mesa manual', () => {
    withWorker()
    const { host, guest } = startDuel({ autoDuel: FakeAutoDuel })

    expect(within(host.container).getByRole('button', { name: 'Copiar enlace para mirar' })).toBeInTheDocument()
    expect(rule(host, 'Mirando')).toHaveTextContent('0 de 2')
    openTable(host, guest)

    expect(seen).toHaveLength(0)
    expect(handOf(host).getAllByRole('listitem')).toHaveLength(5)
    expect(handOf(guest).getAllByRole('listitem')).toHaveLength(5)
    expect(hasSave('host')).toBe(true)
  })

  it('un Match con siding: «Siguiente duelo» lleva al siding (en vez de la mesa del núcleo, que sigue montada), el deck que queda le llega a la mesa, recargar vuelve al siding y con los dos listos sigue la sala', () => {
    withWorker()
    setAutoPref('duel', true)
    const withSide = new Map([...monsters, ['card-777-1', { name: 'Carta del Side', apiCard: effectMonster }]])
    const props = { sideIds: ['card-777-1'], cardsById: withSide, autoDuel: FakeAutoDuel }
    const immersive = vi.fn()
    const host = render(<DuelScreen {...screenProps({ ...props, onImmersiveChange: immersive })} />)
    typeInto(host, 'Tu nombre', 'Ana')
    openRules(host)
    fireEvent.click(within(rulesDialog()).getByRole('radio', { name: 'Match · mejor de 3' }))
    fireEvent.click(within(rulesDialog()).getByRole('switch', { name: 'Sidedeck' }))
    fireEvent.click(within(rulesDialog()).getByRole('button', { name: 'Abrir duelo' }))
    const room = extractRoomCode(window.location.hash)!
    window.history.replaceState(null, '', '#duel')
    const guest = render(<DuelScreen {...screenProps(props)} />)
    typeInto(guest, 'Tu nombre', 'Beto')
    joinByLink(guest, room)
    flush()
    act(() => {
      roomState.host({ canReady: true, notice: null })
      roomState.guest({ canReady: true, notice: null })
    })
    openTable(host, guest)
    expect(lastProps('host').snapshot.settings).toMatchObject({ auto: true, match: true, siding: true })

    // Beto se rinde: Ana va 1–0 y «Siguiente duelo» (el de la tarjeta del resultado) lleva al siding, sin pedir todavía la revancha.
    act(() => lastProps('guest').duel.concede())
    flush()
    act(() => lastProps('host').onRematch())
    expect(within(host.container).getByRole('heading', { name: 'Sidedeck' })).toBeInTheDocument()
    expect(lastProps('host').snapshot.rematch.mine).toBe(false)
    expect(immersive).toHaveBeenLastCalledWith(false)
    fireEvent.click(within(host.container).getByRole('button', { name: 'Mover Carta del Side al Main Deck' }))
    click(host, 'Listo')
    flush()
    // El deck del siding es el que recibe la mesa (para el duelo que sigue), y la sala ya sabe que Ana está lista.
    expect(lastProps('host').deck.mainIds).toHaveLength(41)
    expect(lastProps('host').snapshot.rematch.mine).toBe(true)

    // Ana recarga: vuelve al siding (la sala sigue terminada: lo guardado dice quién se rindió), con su deck nuevo.
    host.unmount()
    sessionStorage.setItem(`ygo-lab:duel-role:${room}`, 'host')
    window.history.replaceState(null, '', `#duel?room=${room}`)
    const again = render(<DuelScreen {...screenProps(props)} />)
    flush()
    flush()
    expect(within(again.container).getByRole('heading', { name: 'Sidedeck' })).toBeInTheDocument()
    expect(lastProps('host').snapshot.conceded).toBe(1)
    expect(lastProps('host').deck.mainIds).toHaveLength(41)
    click(again, 'Listo')
    act(() => lastProps('guest').onRematch())
    click(guest, 'Listo')
    flush()
    // Con los dos listos, la sala otra vez (elige Beto, que perdió) y el Match va 1–0 en las dos.
    expect(within(again.container).queryByRole('heading', { name: 'Sidedeck' })).toBeNull()
    expect(within(guest.container).queryByRole('heading', { name: 'Sidedeck' })).toBeNull()
    expect(lastProps('guest').snapshot.series).toMatchObject({ game: 2, wins: [1, 0] })
    expect(lastProps('host').snapshot.series).toMatchObject({ game: 2, wins: [1, 0] })
    expect(lastProps('guest').snapshot.opening).toMatchObject({ ordered: false, chooser: 1 })
  })
})
