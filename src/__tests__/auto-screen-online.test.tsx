// @vitest-environment jsdom
import { act, fireEvent, screen, within } from '@testing-library/react'
import '@testing-library/jest-dom'
import { useSyncExternalStore } from 'react'
import { describe, expect, it, vi } from 'vitest'

import type { RoomAutoState } from '../app/auto/online'
import { LOCATION as L, type CoreAsk, type Seat } from '../app/auto/protocol'
import { DEFAULT_SETTINGS } from '../app/duel-protocol'
import { createDuel } from '../app/duel-session'
import type { SocketStatus } from '../app/duel-socket'
import { createMatState, type MatState } from '../app/practice-mat'
import { HOLD_MS } from '../app/use-mat-drag'
import { showToastMessage } from '../app/use-toast-message'
import { AutoDuelScreen } from '../components/auto/AutoDuelScreen'
import { THINKING_CANCEL_MS } from '../components/duel/DuelBar'
import { fakeOnlineLink } from './support/auto-online-fake'
import { core, dispatches, handCard, lane } from './support/auto-screen-harness'
import { CARDS, fakeSession, loc } from './support/auto-session-fake'
import { createMemoryRoom } from './support/memory-room'
import { render, tap } from './support/practice-mat-harness'
import { tapMenu } from './support/mat-menu'

vi.mock(import('../app/use-toast-message'), async (importOriginal) => ({ ...(await importOriginal()), showToastMessage: vi.fn() }))

// El duelo automático por enlace, de la sala a la mesa: «Estoy listo» espera al enlace, la mesa es la de solo con la barra del duelo, las vidas del núcleo son las de la sala,
// el fin dice la razón del núcleo, la pausa tapa la mesa sin moverla y la revancha arma otra mesa. Con la sala de verdad (`createDuel` en memoria) y el enlace y la sesión de mentira.

const DECK = { name: 'Test', mainIds: [...CARDS.keys()].filter((id) => id !== 'card-500-1'), extraIds: ['card-500-1'], cardsById: CARDS }
const IDLE: CoreAsk = { type: 'select_idlecmd', player: 0, summons: [loc(100, L.HAND, 0)], special_summons: [], pos_changes: [], monster_sets: [], spell_sets: [], activates: [], to_bp: false, to_ep: true, shuffle: false }

/** La sala de mentira (la de verdad es `DuelRoom`, de la pantalla del duelo): «Estoy listo» y el aviso, con lo que le pasa la mesa automática. */
function Room({ auto }: { auto: RoomAutoState }) {
  return (
    <section aria-label="Sala">
      <button type="button" disabled={!auto.canReady}>
        Estoy listo
      </button>
      {auto.notice ? (
        <p role="note" data-tone={auto.notice.tone}>
          {auto.notice.text}
          {auto.notice.cards?.map((card) => <span key={card.code}>{` · ${card.name}`}</span>)}
        </p>
      ) : null}
    </section>
  )
}

/** Ana (anfitriona) y Beto en una sala automática en memoria; se ve la pantalla de `role`, con el enlace de mentira. */
function setup(role: 'host' | 'guest' = 'host') {
  const room = createMemoryRoom()
  const ends = { host: room.join(), guest: room.join() }
  const duels = {
    host: createDuel(ends.host, { role: 'host', name: 'Ana', settings: { ...DEFAULT_SETTINGS, auto: true }, sid: 'host-1', random: () => 0.1 }),
    guest: createDuel(ends.guest, { role: 'guest', name: 'Beto', sid: 'guest-1', random: () => 0.9 }),
  }

  room.flush()
  const link = fakeOnlineLink()
  const calls = { leave: 0, abandon: 0, rematch: 0, manual: [] as MatState[] }
  const me = duels[role]
  const connect = () => link
  // La conexión propia con el relay (el `status` de la pantalla): la prueba la corta y la vuelve a abrir.
  const socket = { status: 'open' as SocketStatus, listeners: new Set<() => void>() }
  const subscribeSocket = (listener: () => void) => {
    socket.listeners.add(listener)

    return () => void socket.listeners.delete(listener)
  }
  const setStatus = (status: SocketStatus) =>
    act(() => {
      socket.status = status
      socket.listeners.forEach((listener) => listener())
    })

  function Screen() {
    const snapshot = useSyncExternalStore(me.subscribe, me.getSnapshot)
    const status = useSyncExternalStore(subscribeSocket, () => socket.status)

    return (
      <AutoDuelScreen
        duel={me}
        snapshot={snapshot}
        status={status}
        transport={ends[role]}
        myName={role === 'host' ? 'Ana' : 'Beto'}
        deck={DECK}
        handSize={5}
        room={(auto) => <Room auto={auto} />}
        onLeave={() => (calls.leave += 1)}
        onAbandon={() => (calls.abandon += 1)}
        onRematch={() => {
          calls.rematch += 1
          me.rematch()
        }}
        onManual={(table) => calls.manual.push(table)}
        connect={connect}
      />
    )
  }

  render(<Screen />)
  const flush = () => act(() => room.flush())

  /** De la sala a la mesa: los dos listos, piedra-papel-tijera (gana Ana) y Ana va primera (el asiento 0 del núcleo); el enlace arma la sesión. */
  function start(seat: Seat = role === 'host' ? 0 : 1) {
    act(() => {
      duels.host.setReady(true)
      duels.guest.setReady(true)
      duels.host.chooseMethod('rps')
    })
    flush()
    act(() => {
      duels.host.pickRps('rock')
      duels.guest.pickRps('scissors')
      duels.host.chooseFirst(0)
    })
    flush()
    const session = fakeSession()

    core(() => link.set({ phase: 'playing', session, seat }))

    return session
  }

  return { room, ends, duels, link, calls, flush, start, setStatus }
}

const note = () => screen.queryByRole('note')
const field = () => document.querySelector<HTMLElement>('[aria-label="Campo"]')!

describe('auto-screen-online · la sala', () => {
  it('«Estoy listo» se apaga hasta que el enlace revisó los dos decks; el aviso dice qué pasa: info mientras espera, warning con tus cartas sin reglas, danger si se perdió', () => {
    const { link } = setup()
    const ready = () => screen.getByRole('button', { name: 'Estoy listo' })

    expect(link.room?.settings.auto).toBe(true)
    expect(ready()).toBeDisabled()
    core(() => link.set({ phase: 'awaitingDeck' }))
    expect(note()).toHaveAttribute('data-tone', 'info')
    expect(note()).toHaveTextContent('Esperando el deck de Beto…')
    core(() => link.set({ phase: 'checking' }))
    expect(note()).toHaveTextContent('Revisando que las cartas de los dos tengan reglas…')
    expect(ready()).toBeDisabled()
    core(() => link.set({ phase: 'blocked', problems: { mine: [100, 400], theirs: 1, reason: null } }))
    expect(note()).toHaveAttribute('data-tone', 'warning')
    expect(note()).toHaveTextContent('A 2 cartas tuyas les faltan sus reglas: cambialas en el builder. A 1 carta de Beto le faltan sus reglas. · Ash Blossom · Nibiru')
    core(() => link.set({ problems: { mine: [], theirs: 0, reason: 'off' } }))
    expect(note()).toHaveTextContent('El duelo automático por enlace está apagado por ahora.')
    expect(ready()).toBeDisabled()
    core(() => link.set({ phase: 'ready', problems: { mine: [], theirs: 0, reason: null } }))
    expect(ready()).toBeEnabled()
    expect(note()).toBeNull()
    core(() => link.set({ phase: 'lost', problems: { mine: [], theirs: 0, reason: 'lost' } }))
    expect(note()).toHaveAttribute('data-tone', 'danger')
    expect(note()).toHaveTextContent('El duelo se perdió: el anfitrión recargó la página.')
  })

  it('el invitado que vuelve a ver al anfitrión pide el duelo de nuevo; al entrar, no', () => {
    const { ends, link, flush } = setup('guest')

    expect(link.resyncs).toBe(0)
    act(() => ends.host.disconnect())
    flush()
    act(() => ends.host.reconnect())
    flush()
    expect(link.resyncs).toBe(1)
  })

  it('el anfitrión cuya conexión se cae y vuelve le repone el duelo al invitado (aunque el relay no le haya avisado que se fue); el invitado no, por su conexión', () => {
    const host = setup()

    host.setStatus('reconnecting')
    expect(host.link.resyncs).toBe(0)
    host.setStatus('open')
    expect(host.link.resyncs).toBe(1)

    const guest = setup('guest')

    guest.setStatus('reconnecting')
    guest.setStatus('open')
    expect(guest.link.resyncs).toBe(0)
  })
})

describe('auto-screen-online · la mesa', () => {
  it('la pregunta del otro es «Beto está eligiendo…» (sin Cancelar); la tuya se contesta en la mesa y va por la sesión', () => {
    vi.useFakeTimers()
    const { start } = setup()
    const session = start()

    core(() => session.set({ status: 'waiting', ask: null }))
    expect(lane()).toHaveAttribute('data-lane', 'thinking')
    expect(lane()).toHaveTextContent('Beto está eligiendo…')
    act(() => vi.advanceTimersByTime(THINKING_CANCEL_MS + 10))
    expect(within(lane()!).queryByRole('button', { name: 'Cancelar' })).toBeNull()
    core(() => session.ask(IDLE))
    expect(lane()).toBeNull()
    tap(handCard('Ash Blossom'))
    fireEvent.click(screen.getByRole('menuitem', { name: 'Invocación Normal' }))
    expect(session.answers).toEqual([{ type: 'select_idlecmd', action: 0, index: 0 }])
    expect(dispatches).toBe(0)
  })

  it('mantener apretado un monstruo no le cambia la posición (no se deshace: un toque largo sin querer sería una jugada); al soltarlo es un toque', () => {
    vi.useFakeTimers()
    const { start } = setup()
    const session = start()

    core(() => session.ask({ ...IDLE, pos_changes: [loc(200, L.MZONE, 0)] }))
    const maxx = screen.getByRole('button', { name: 'Maxx C' })

    fireEvent.pointerDown(maxx, { button: 0, pointerId: 1, clientX: 10, clientY: 10 })
    expect(maxx).not.toHaveAttribute('data-holding')
    act(() => vi.advanceTimersByTime(HOLD_MS))
    fireEvent.pointerUp(maxx, { button: 0, pointerId: 1, clientX: 10, clientY: 10 })
    expect(session.answers).toEqual([])
    expect(screen.getAllByRole('menuitem').map((item) => item.textContent)).toEqual(['Pasar a defensa'])
  })

  it('la mesa del duelo por enlace no lleva los pasos ni los combos de «Jugar solo» (su panel de la derecha es el chat)', () => {
    const { start } = setup()
    const session = start()

    core(() => session.ask(IDLE))
    expect(handCard('Ash Blossom')).toBeInTheDocument()
    expect(screen.queryByRole('region', { name: 'Pasos y combos' })).toBeNull()
    expect(screen.queryByRole('button', { name: 'Pasos y combos' })).toBeNull()
    expect(screen.queryByRole('button', { name: 'Guardar combo' })).toBeNull()
  })

  it('en escritorio sin el detalle, el visor de las pilas es una tira ancha sobre la fila de las Zonas Extra, con renglones que se deslizan de arriba abajo; una casilla que pregunta el núcleo la esconde hasta contestar, y jugar una carta suya la cierra', () => {
    const media = window.matchMedia

    // Desde 1101 px (sin el detalle fijo, que llega a los 1440): a la derecha va el chat.
    window.matchMedia = ((query: string) => ({ ...media(query), matches: query.includes('reduce') || query === '(min-width: 1101px)' })) as typeof window.matchMedia
    const { start } = setup()
    const session = start()
    const withZeus: CoreAsk = { ...IDLE, special_summons: [loc(500, L.EXTRA, 0)] }

    core(() => session.ask(withZeus))
    fireEvent.click(screen.getByRole('button', { name: 'Extra: 1' }))
    const slot = document.querySelector<HTMLElement>('[data-pile-slot]')!
    const list = within(within(slot).getByRole('dialog', { name: 'Extra · 1' })).getByRole('list')

    expect(slot.className).toContain('top-[var(--strip-top,0.5rem)]')
    expect(slot.className).toContain('bottom-[var(--strip-bottom,50%)]')
    expect(list).toHaveClass('flex-wrap')
    expect(list.parentElement).toHaveClass('overflow-y-auto')
    core(() => session.ask({ type: 'select_place', player: 0, count: 1, field_mask: ~0b110 >>> 0 }))
    expect(screen.queryByRole('dialog', { name: 'Extra · 1' })).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: 'Zona de monstruo 3: elegir' }))
    core(() => session.ask(withZeus))
    fireEvent.click(within(screen.getByRole('dialog', { name: 'Extra · 1' })).getByRole('button', { name: /^Zeus/ }))
    fireEvent.click(screen.getByRole('menuitem', { name: 'Invocación Especial' }))
    expect(session.answers.at(-1)).toEqual({ type: 'select_idlecmd', action: 1, index: 0 })
    expect(screen.queryByRole('dialog', { name: 'Extra · 1' })).toBeNull()
    expect(dispatches).toBe(0)
  })

  it('pensando: el anfitrión puede cortar al núcleo; el invitado (seat 1) espera sin Cancelar y ve el turno de Ana', () => {
    vi.useFakeTimers()
    const { start } = setup('guest')
    const session = start()

    core(() => session.thinking())
    act(() => vi.advanceTimersByTime(THINKING_CANCEL_MS + 10))
    expect(lane()).toHaveTextContent('El núcleo está resolviendo…')
    expect(within(lane()!).queryByRole('button', { name: 'Cancelar' })).toBeNull()
    // El núcleo dice que el turno es del asiento 0 (Ana).
    expect(screen.getByText('Turno de Ana')).toBeInTheDocument()
  })

  it('el anfitrión: pasado el plazo, «Cancelar» corta lo que el núcleo piensa', () => {
    vi.useFakeTimers()
    const { start } = setup()
    const session = start()

    core(() => session.thinking())
    act(() => vi.advanceTimersByTime(THINKING_CANCEL_MS + 10))
    fireEvent.click(within(lane()!).getByRole('button', { name: 'Cancelar' }))
    expect(session.cancels).toBe(1)
  })

  it('las vidas del núcleo son las de la sala: tu casilla, la barra y el rival las ven', () => {
    const { start, duels, flush } = setup()
    const session = start()

    core(() => session.set({ overlay: { ...session.getSnapshot().overlay, lp: [6500, 8000] } }))
    flush()
    expect(duels.host.getSnapshot().life.lp).toEqual([6500, 8000])
    expect(duels.guest.getSnapshot().life.lp).toEqual([6500, 8000])
    expect(screen.getByRole('group', { name: 'Puntos de vida de Ana: 6500' })).toBeInTheDocument()
    expect(screen.getByRole('group', { name: 'Puntos de vida de Beto: 8000' })).toBeInTheDocument()
    expect(dispatches).toBe(0)
  })

  it('el fin por deck-out: el que pierde (Beto, asiento 1) pone sus vidas en 0 y el resultado dice la razón del núcleo', () => {
    const { start, duels, flush } = setup('guest')
    const session = start()

    core(() => session.end(0, 2))
    flush()
    expect(duels.guest.getSnapshot().life.lp[1]).toBe(0)
    expect(duels.host.getSnapshot().life.lp[1]).toBe(0)
    expect(screen.getByRole('dialog', { name: 'Perdiste' })).toHaveTextContent('No pudiste robar: te quedaste sin deck.')
    expect(dispatches).toBe(0)
  })

  it('la pausa tapa la mesa mientras falta el rival, y el campo no se mueve entre «sin pregunta», «esperando», «pregunta» y «pausa»', () => {
    const { start, ends, flush } = setup()
    const session = start()
    const board = field()
    const look = () => [board.className, board.getAttribute('style')]
    const before = look()

    core(() => session.set({ status: 'waiting', ask: null }))
    expect(field()).toBe(board)
    expect(look()).toEqual(before)
    core(() => session.ask(IDLE))
    expect(field()).toBe(board)
    expect(look()).toEqual(before)
    act(() => ends.guest.disconnect())
    flush()
    expect(screen.getByRole('alertdialog', { name: 'Duelo en pausa' })).toHaveTextContent('Beto salió del duelo.')
    expect(field()).toBe(board)
    expect(look()).toEqual(before)
    act(() => ends.guest.reconnect())
    flush()
    expect(screen.queryByRole('alertdialog', { name: 'Duelo en pausa' })).toBeNull()
    expect(dispatches).toBe(0)
  })

  it('el duelo que se pierde (el anfitrión recargó) tapa la mesa y deja volver al lobby', () => {
    const { start, link, calls } = setup('guest')

    start()
    core(() => link.set({ phase: 'lost', problems: { mine: [], theirs: 0, reason: 'lost' } }))
    const cover = screen.getByRole('alertdialog', { name: 'El duelo se perdió: el anfitrión recargó la página.' })

    fireEvent.click(within(cover).getByRole('button', { name: 'Volver al lobby' }))
    expect(calls.leave).toBe(1)
  })

  it('la sala sigue tras perder el duelo: «Jugar otro duelo» (con el foco) pide la revancha, espera al rival apagado y, cuando la acepta, vuelve a la sala', () => {
    const { start, link, calls, duels, flush } = setup('guest')

    start()
    core(() => link.set({ phase: 'lost', problems: { mine: [], theirs: 0, reason: 'lost' } }))
    const cover = screen.getByRole('alertdialog', { name: 'El duelo se perdió: el anfitrión recargó la página.' })
    const again = within(cover).getByRole('button', { name: 'Jugar otro duelo' })

    expect(again).toHaveFocus()
    expect(again).toBeEnabled()
    fireEvent.click(again)
    expect(calls.rematch).toBe(1)
    expect(duels.guest.getSnapshot().rematch.mine).toBe(true)
    expect(within(cover).getByRole('button', { name: 'Jugar otro duelo' })).toBeDisabled()
    expect(within(cover).getByRole('status')).toHaveTextContent('Esperando a Ana…')
    // Ana la acepta: la sala vuelve a definir quién empieza y la portada se va.
    flush()
    act(() => duels.host.rematch())
    flush()
    expect(screen.queryByRole('alertdialog')).toBeNull()
    expect(screen.getByRole('region', { name: 'Sala' })).toBeInTheDocument()
  })

  it('perdido el duelo, si el rival la pidió primero «Jugar otro duelo» la acepta; sin rival en la sala, queda apagado', () => {
    const { start, link, duels, ends, flush } = setup()

    start()
    core(() => link.set({ phase: 'lost', problems: { mine: [], theirs: 0, reason: 'lost' } }))
    act(() => duels.guest.rematch())
    flush()
    const cover = screen.getByRole('alertdialog', { name: 'El duelo se perdió: el anfitrión recargó la página.' })

    expect(within(cover).getByRole('status')).toHaveTextContent('Beto quiere la revancha.')
    expect(within(cover).getByRole('button', { name: 'Jugar otro duelo' })).toBeEnabled()
    act(() => ends.guest.disconnect())
    flush()
    expect(within(screen.getByRole('alertdialog')).getByRole('button', { name: 'Jugar otro duelo' })).toBeDisabled()
  })

  it('ganar por deck-out: el resultado dice la razón del núcleo, y queda en la barra al mirar la mesa', () => {
    const { start, duels, flush } = setup()
    const session = start()

    core(() => session.end(0, 2))
    // Beto perdió (en su navegador): pone sus vidas en 0.
    act(() => duels.guest.changeLife(-8000))
    flush()
    const card = screen.getByRole('dialog', { name: '¡Ganaste!' })

    expect(card).toHaveTextContent('Beto no pudo robar.')
    // Las tuyas no cambian (las del núcleo y las de la sala ya son las mismas).
    expect(duels.host.getSnapshot().life.lp[0]).toBe(8000)
    fireEvent.click(within(card).getByRole('button', { name: 'Ver la mesa' }))
    expect(screen.getByText('Beto no pudo robar.')).toBeInTheDocument()
    expect(dispatches).toBe(0)
  })

  it('la revancha: «Revancha» vuelve a la sala, la sesión vieja (perdida) no toca las vidas del duelo nuevo y la nueva arma otra mesa', () => {
    const { start, duels, flush, link, calls } = setup()
    const first = start()

    // Ana pierde sin cartas para robar: sus vidas van a 0.
    core(() => first.end(1, 2))
    flush()
    expect(duels.guest.getSnapshot().life.lp[0]).toBe(0)
    fireEvent.click(within(screen.getByRole('dialog', { name: 'Perdiste' })).getByRole('button', { name: 'Revancha' }))
    expect(calls.rematch).toBe(1)
    act(() => duels.guest.rematch())
    flush()
    // La sala otra vez: elige quien perdió (Ana).
    expect(screen.getByRole('region', { name: 'Sala' })).toBeInTheDocument()
    expect(duels.host.getSnapshot().life.lp).toEqual([8000, 8000])
    act(() => duels.host.chooseFirst(0))
    flush()
    // El enlace todavía tiene la sesión vieja (terminada, perdida): su mesa no pone en 0 las vidas del duelo nuevo.
    expect(duels.host.getSnapshot().life.lp).toEqual([8000, 8000])
    const second = fakeSession()

    core(() => link.set({ session: second, seat: 0 }))
    expect(first.destroyed).toBe(true)
    expect(screen.queryByRole('dialog', { name: 'Perdiste' })).toBeNull()
    expect(handCard('Ash Blossom')).toBeInTheDocument()
    expect(duels.host.getSnapshot().life.lp).toEqual([8000, 8000])
    expect(dispatches).toBe(0)
  })
})

describe('auto-screen-online · pasar a manual', () => {
  const moreOptions = () => {
    tapMenu('Opciones del duelo')

    return within(screen.getByRole('dialog', { name: 'Más opciones del duelo' }))
  }
  const prompt = () => screen.getByText(/quiere seguir el duelo en modo manual/).closest<HTMLElement>('[data-prompt]')!

  it('«Más opciones» lo pide; mientras espera, la línea lo dice con «Cancelar pedido» (y la fila también lo ofrece)', () => {
    vi.useFakeTimers()
    const { start, link } = setup('guest')

    start()
    const more = moreOptions()

    expect(more.getByText('Modo manual')).toBeInTheDocument()
    expect(more.getByText('Le preguntás a Ana: si acepta, siguen a mano los dos, con la mesa como está. El automático vuelve en la revancha.')).toBeInTheDocument()
    fireEvent.click(more.getByRole('button', { name: 'Pasar a manual' }))
    expect(link.manuals).toEqual([true])
    core(() => link.set({ manual: 'asking' }))
    expect(more.getByText('Esperando a que Ana acepte seguir en modo manual…')).toBeInTheDocument()
    fireEvent.click(more.getByRole('button', { name: 'Cancelar pedido' }))
    expect(link.manuals).toEqual([true, false])
    fireEvent.keyDown(document, { key: 'Escape' })
    expect(lane()).toHaveAttribute('data-lane', 'thinking')
    expect(lane()).toHaveTextContent('Esperando a que Ana acepte seguir en modo manual…')
    act(() => vi.advanceTimersByTime(THINKING_CANCEL_MS + 10))
    fireEvent.click(within(lane()!).getByRole('button', { name: 'Cancelar pedido' }))
    expect(link.manuals).toEqual([true, false, false])
  })

  it('el pedido del rival va en el medio, como una pregunta: «Pasar a manual» lo acepta y «Seguir en automático» lo rechaza', () => {
    const { start, link } = setup()

    start()
    core(() => link.set({ manual: 'asked' }))
    expect(prompt()).toHaveTextContent('Beto quiere seguir el duelo en modo manual: cada uno mueve sus cartas a mano, con la mesa como está.')
    fireEvent.click(within(prompt()).getByRole('button', { name: 'Seguir en automático' }))
    fireEvent.click(within(prompt()).getByRole('button', { name: 'Pasar a manual' }))
    expect(link.manuals).toEqual([false, true])
    core(() => link.set({ manual: 'idle' }))
    expect(screen.queryByText(/quiere seguir el duelo en modo manual/)).toBeNull()
  })

  it('cómo terminó mi pedido es un aviso: rechazado, sin respuesta o con una carta bajo el control del otro (y entonces la fila no deja pedirlo y dice por qué)', () => {
    const { start, link } = setup()
    const session = start()

    vi.mocked(showToastMessage).mockClear()
    core(() => link.set({ manual: 'asking' }))
    core(() => link.set({ manual: 'declined' }))
    expect(showToastMessage).toHaveBeenLastCalledWith('Beto prefirió seguir en automático.', 'info')
    core(() => link.set({ manual: 'asking' }))
    core(() => link.set({ manual: 'expired' }))
    expect(showToastMessage).toHaveBeenLastCalledWith('Beto no contestó: el duelo sigue en automático.', 'info')
    core(() => link.set({ manual: 'blocked' }))
    expect(showToastMessage).toHaveBeenLastCalledWith('No se pudo pasar a manual: hay una carta bajo el control del otro jugador.', 'warning')

    // Una carta de Beto bajo tu control (`f.c1`): la mesa manual no podría seguirla.
    const mine = session.getSnapshot().mine

    core(() => session.set({ mine: { ...mine, mz: [mine.mz[0]!, { id: 'f.c1', pos: 'atk', counters: 0, materials: [] }, null, null, null] } }))
    const more = moreOptions()

    expect(more.getByRole('button', { name: 'Pasar a manual' })).toBeDisabled()
    expect(more.getByText('Ahora no se puede: hay una carta bajo el control del otro jugador.')).toBeInTheDocument()
  })

  it('acordado, la mesa queda quieta («Pasando a modo manual…»); el invitado sigue a mano con el corte y la mesa del corte', () => {
    const { start, link, calls } = setup('guest')
    const session = start()

    core(() => session.ask(IDLE))
    core(() => link.set({ manual: 'switching' }))
    expect(lane()).toHaveTextContent('Pasando a modo manual…')
    tap(handCard('Ash Blossom'))
    expect(screen.queryByRole('menuitem', { name: 'Invocación Normal' })).toBeNull()
    expect(calls.manual).toEqual([])
    vi.mocked(showToastMessage).mockClear()
    core(() => link.set({ manual: 'agreed', manualDropped: true }))
    expect(calls.manual).toEqual([session.getSnapshot().mine])
    expect(showToastMessage).toHaveBeenLastCalledWith('Siguen en modo manual. Lo que estaba a medio jugar se descartó: la mesa quedó como estaba.', 'info')
    expect(session.answers).toEqual([])
    expect(dispatches).toBe(0)
  })

  it('sin acuerdo, una mesa manual del invitado (un cliente modificado) no saca al anfitrión del automático', () => {
    const { start, duels, flush, calls, link } = setup()

    start()
    act(() => duels.guest.start(createMatState(['card-1-1', 'card-2-1'], [], 1)))
    flush()
    expect(duels.host.getSnapshot().theirs).not.toBeNull()
    core(() => link.set({ manual: 'asked' }))
    expect(calls.manual).toEqual([])
  })

  it('con el pase acordado (o rearmado ya cortado tras recargar), el anfitrión sigue a mano cuando le llega la mesa manual del invitado', () => {
    const { start, duels, flush, calls, link } = setup()
    const session = start()

    core(() => link.set({ manual: 'agreed' }))
    expect(calls.manual).toEqual([])
    act(() => duels.guest.start(createMatState(['card-1-1', 'card-2-1'], [], 1)))
    flush()
    expect(calls.manual).toEqual([session.getSnapshot().mine])
  })
})
