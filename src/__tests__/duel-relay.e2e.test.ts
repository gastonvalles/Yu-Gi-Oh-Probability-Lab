// Prueba de integración contra un relay REAL. Sólo corre si se le pasa la dirección (en el CI se omite):
//   VITE_DUEL_RELAY_URL=ws://127.0.0.1:8788 npm test -- duel-relay.e2e
// con el relay levantado aparte (cd duel-relay && npx wrangler dev; ver docs/duelo-relay.md).
import { beforeAll, describe as rawDescribe, expect, it } from 'vitest'

import { createDuel } from '../app/duel-session'
import { CLOSE_FULL, MAX_MESSAGE_BYTES, PING, PONG, SPECTATOR_RESYNC, createParticipantId, createRoomCode, parseRelayFrame, type ParticipantRole, type RelayFrame } from '../app/duel-relay-rules'
import { createSocketTransport, type SocketLike } from '../app/duel-socket'
import { mapMatIds, openPublic } from '../app/mat-public'
import { createMatState } from '../app/practice-mat'

const RELAY = import.meta.env.VITE_DUEL_RELAY_URL ?? ''
const ORIGIN = 'http://localhost:5173'
// Por internet cada conexión tarda cientos de milisegundos (y la primera de una sala, más): los tiempos son de red real, no de laboratorio.
const describe = (name: string, body: () => void) => rawDescribe.skipIf(!RELAY)(name, { timeout: 30_000 }, body)

const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms))
async function until(check: () => boolean, ms = 10_000, what = 'condición') {
  const end = Date.now() + ms
  while (!check()) {
    if (Date.now() > end) throw new Error(`Se esperó demasiado: ${what}`)
    await wait(20)
  }
}

/** Un cliente crudo: lo que llega (texto y avisos), cómo cerró. */
function raw(room: string, pid = createParticipantId(), origin: string | null = ORIGIN, role: ParticipantRole = 'player') {
  const ws = new WebSocket(`${RELAY}/room/${room}?pid=${pid}${role === 'spectator' ? '&role=spectator' : ''}`, origin ? ({ headers: { Origin: origin } } as never) : undefined)
  ws.binaryType = 'arraybuffer'
  const client = { ws, texts: [] as string[], frames: [] as RelayFrame[], closed: undefined as number | undefined, opened: false, errored: false }
  ws.onopen = () => (client.opened = true)
  ws.onerror = () => (client.errored = true)
  ws.onclose = (event) => (client.closed = event.code)
  ws.onmessage = ({ data }) => {
    if (typeof data === 'string') client.texts.push(data)
    else client.frames.push(parseRelayFrame(data as ArrayBuffer)!)
  }
  return client
}

// Sin esto, los casos de rechazo "pasarían" aunque el relay no estuviera: un rechazo y un servidor caído se ven igual desde un WebSocket.
// (No se usa `fetch`: el setup de los tests lo bloquea.)
beforeAll(async () => {
  if (!RELAY) return
  const probe = raw(createRoomCode())
  await until(() => probe.opened || probe.errored || probe.closed !== undefined, 3000, 'el relay').catch(() => undefined)
  probe.ws.close(1000)
  if (!probe.opened) throw new Error(`No hay un relay que acepte conexiones en ${RELAY}. Levantalo con wrangler dev: docs/duelo-relay.md`)
})

describe('el relay real', () => {
  it('rechaza orígenes no permitidos y sin origen', async () => {
    const evil = raw(createRoomCode(), undefined, 'https://evil.example')
    await until(() => evil.closed !== undefined || evil.errored, 3000, 'rechazo por origen')
    expect(evil.opened).toBe(false)

    const none = raw(createRoomCode(), undefined, null)
    await until(() => none.closed !== undefined || none.errored, 3000, 'rechazo sin origen')
    expect(none.opened).toBe(false)
  })

  it('une a dos jugadores, avisa y reenvía el texto en los dos sentidos', async () => {
    const room = createRoomCode()
    const a = raw(room)
    await until(() => a.opened && a.frames.length === 1)
    expect(a.frames).toEqual([{ kind: 'peer', present: false }])

    const b = raw(room)
    await until(() => a.frames.length === 2 && b.frames.length === 1)
    expect(a.frames.at(-1)).toEqual({ kind: 'peer', present: true })
    expect(b.frames).toEqual([{ kind: 'peer', present: true }])

    a.ws.send('de A a B')
    b.ws.send('de B a A')
    await until(() => a.texts.length === 1 && b.texts.length === 1)
    expect([a.texts, b.texts]).toEqual([['de B a A'], ['de A a B']])

    // El latido lo contesta el relay y no se reenvía.
    a.ws.send(PING)
    await until(() => a.texts.includes(PONG))
    expect(b.texts).toEqual(['de A a B'])

    // Si uno se va, el otro lo sabe.
    b.ws.close(1000)
    await until(() => a.frames.at(-1)?.kind === 'peer' && (a.frames.at(-1) as { present: boolean }).present === false)
    a.ws.close(1000)
  })

  it('la sala es de dos: el tercero recibe "llena" y lo cierran', async () => {
    const room = createRoomCode()
    const a = raw(room)
    const b = raw(room)
    await until(() => b.frames.length > 0)
    const c = raw(room)
    await until(() => c.closed !== undefined)

    expect(c.frames).toEqual([{ kind: 'full' }])
    expect(c.closed).toBe(CLOSE_FULL)
    expect(a.closed).toBeUndefined()
    a.ws.send('sigue')
    await until(() => b.texts.includes('sigue'))
    expect(c.texts).toEqual([])
    a.ws.close(1000)
    b.ws.close(1000)
  })

  it('una conexión nueva del mismo jugador reemplaza a la vieja', async () => {
    const room = createRoomCode()
    const pid = createParticipantId()
    const a = raw(room, pid)
    const b = raw(room)
    await until(() => a.frames.length > 0 && b.frames.length > 0)

    const again = raw(room, pid)
    await until(() => again.frames.length > 0)

    // La conexión nueva ocupa el lugar (no cuenta como tercera) y el rival sigue viendo a alguien.
    expect(again.closed).toBeUndefined()
    expect(again.frames.at(-1)).toEqual({ kind: 'peer', present: true })
    again.ws.send('hola')
    await until(() => b.texts.includes('hola'))

    // Y lo que manda el rival llega a la nueva, no a la vieja.
    b.ws.send('para la nueva')
    await until(() => again.texts.includes('para la nueva'))
    expect(a.texts).toEqual([])
    again.ws.close(1000)
    b.ws.close(1000)
  })

  it('los espectadores ven el texto de los dos jugadores con quién lo mandó, no pueden mandar nada y son dos', async () => {
    const room = createRoomCode()
    const a = raw(room)
    await until(() => a.frames.length === 1)
    const b = raw(room)
    await until(() => b.frames.length === 1)
    const peerOnly = (client: ReturnType<typeof raw>) => client.frames.filter((frame) => frame.kind === 'peer')

    // Entra uno a mirar: sabe cuántos juegan y los jugadores se enteran de que los miran, con el pedido de que repitan su estado.
    const first = raw(room, undefined, ORIGIN, 'spectator')
    await until(() => first.frames.length >= 1 && a.frames.some((frame) => frame.kind === 'watchers') && b.frames.some((frame) => frame.kind === 'watchers'))
    expect(first.frames).toEqual([{ kind: 'players', count: 2 }])
    expect(a.frames.at(-1)).toEqual({ kind: 'watchers', count: 1, sync: true })
    // Mirar no cambia lo que los jugadores saben entre ellos.
    expect(peerOnly(a)).toEqual([{ kind: 'peer', present: false }, { kind: 'peer', present: true }])

    // Lo que dice cada uno llega al otro de siempre y, al espectador, con su etiqueta (la del orden de llegada).
    a.ws.send('hola desde A')
    b.ws.send('hola desde B')
    await until(() => first.texts.length === 2 && a.texts.length === 1 && b.texts.length === 1)
    expect([a.texts, b.texts]).toEqual([['hola desde B'], ['hola desde A']])
    expect(first.texts.sort()).toEqual(['0hola desde A', '1hola desde B'])

    // El segundo espectador entra; el tercero recibe "llena" y no cambia nada.
    const second = raw(room, undefined, ORIGIN, 'spectator')
    await until(() => second.frames.length >= 1)
    const third = raw(room, undefined, ORIGIN, 'spectator')
    await until(() => third.closed !== undefined)
    expect(third.frames).toEqual([{ kind: 'full' }])
    expect(third.closed).toBe(CLOSE_FULL)
    expect(second.closed).toBeUndefined()
    expect(a.frames.filter((frame) => frame.kind === 'watchers').at(-1)).toEqual({ kind: 'watchers', count: 2, sync: true })

    // Un espectador no puede hacer nada: lo que manda no llega a nadie y lo desconectan.
    a.texts.length = 0
    b.texts.length = 0
    first.ws.send('soy un jugador')
    await until(() => first.closed !== undefined)
    expect(first.closed).toBe(1008)
    await wait(300)
    expect([a.texts, b.texts]).toEqual([[], []])
    await until(() => a.frames.at(-1)?.kind === 'watchers' && (a.frames.at(-1) as { count: number }).count === 1)

    // Lo único que se le acepta es pedir que repitan su estado, y no seguido.
    const before = a.frames.length
    second.ws.send(SPECTATOR_RESYNC)
    await until(() => a.frames.length > before)
    expect(a.frames.at(-1)).toEqual({ kind: 'watchers', count: 1, sync: true })
    const after = a.frames.length
    second.ws.send(SPECTATOR_RESYNC)
    second.ws.send(SPECTATOR_RESYNC)
    await wait(300)
    expect(a.frames.length - after).toBeLessThanOrEqual(1)
    expect(second.closed).toBeUndefined()

    // Si el otro jugador se va, el espectador se entera de cuántos quedan; y un jugador que vuelve conserva su etiqueta.
    b.ws.close(1000)
    await until(() => second.frames.some((frame) => frame.kind === 'players' && frame.count === 1))
    a.ws.close(1000)
    second.ws.close(1000)
  })

  it('un jugador que reconecta con su identidad conserva su etiqueta para los espectadores', async () => {
    const room = createRoomCode()
    const pid = createParticipantId()
    // Uno detrás del otro: la etiqueta es el orden de llegada a la sala, y por internet dos conexiones a la vez pueden llegar en cualquier orden.
    const a = raw(room, pid)
    await until(() => a.frames.length > 0)
    const b = raw(room)
    await until(() => b.frames.length > 0)
    const watcher = raw(room, undefined, ORIGIN, 'spectator')
    await until(() => watcher.frames.length >= 1)

    const again = raw(room, pid)
    await until(() => again.frames.length > 0)
    again.ws.send('sigo siendo A')
    await until(() => watcher.texts.length === 1)
    expect(watcher.texts).toEqual(['0sigo siendo A'])
    again.ws.close(1000)
    b.ws.close(1000)
    watcher.ws.close(1000)
  })

  it('cierra lo que no corresponde: binarios, mensajes enormes y ráfagas', async () => {
    const binary = raw(createRoomCode())
    await until(() => binary.opened)
    binary.ws.send(new Uint8Array([1, 1]))
    await until(() => binary.closed !== undefined)
    expect(binary.closed).toBe(1003)

    const big = raw(createRoomCode())
    await until(() => big.opened)
    big.ws.send('x'.repeat(MAX_MESSAGE_BYTES + 1))
    await until(() => big.closed !== undefined)
    expect(big.closed).toBe(1009)

    const ok = raw(createRoomCode())
    await until(() => ok.opened)
    ok.ws.send('x'.repeat(MAX_MESSAGE_BYTES))
    await wait(300)
    expect(ok.closed).toBeUndefined()
    ok.ws.close(1000)

    const flood = raw(createRoomCode())
    await until(() => flood.opened)
    for (let index = 0; index < 200; index += 1) flood.ws.send('x')
    await until(() => flood.closed !== undefined)
    expect(flood.closed).toBe(1008)
  })

  it('rechaza una sala o una identidad mal formadas', async () => {
    const badRoom = raw('abc')
    await until(() => badRoom.closed !== undefined || badRoom.errored, 3000, 'sala inválida')
    expect(badRoom.opened).toBe(false)

    const badPid = raw(createRoomCode(), 'corto')
    await until(() => badPid.closed !== undefined || badPid.errored, 3000, 'identidad inválida')
    expect(badPid.opened).toBe(false)
  })
})

describe('el duelo completo por el relay real', () => {
  const hostTable = createMatState(Array.from({ length: 20 }, (_, i) => `card-${1000 + i}-1`), ['card-1900-1'], 5)
  const guestTable = createMatState(Array.from({ length: 20 }, (_, i) => `card-${5000 + i}-1`), ['card-5900-1'], 5)
  const masked = (initial: typeof hostTable, state: typeof hostTable) => {
    const { opaque } = openPublic(initial).sender
    return mapMatIds(state, (id) => opaque[id] ?? id)
  }

  it('dos jugadores juegan, y una caída de la conexión se repone sola', { timeout: 30_000 }, async () => {
    const room = createRoomCode()
    const sockets: SocketLike[][] = [[], []]
    const make = (index: number) =>
      createSocketTransport({
        url: RELAY,
        room,
        participant: createParticipantId(),
        createSocket: (target) => {
          const socket = new WebSocket(target, { headers: { Origin: ORIGIN } } as never) as unknown as SocketLike
          sockets[index]!.push(socket)
          return socket
        },
      })

    const hostTransport = make(0)
    const guestTransport = make(1)
    const host = createDuel(hostTransport, { role: 'host', name: 'Ana', settings: { lp: 4000, hand: 5 } })
    const guest = createDuel(guestTransport, { role: 'guest', name: 'Beto' })

    await until(() => host.getSnapshot().peerName === 'Beto' && guest.getSnapshot().peerName === 'Ana', 15_000, 'apretón de manos')
    expect(guest.getSnapshot().settings).toEqual({ lp: 4000, hand: 5 })

    host.start(hostTable)
    guest.start(guestTable)
    host.play({ type: 'draw', count: 1 })
    host.play({ type: 'place', id: 'card-1000-1', zone: 'mz', index: 0, pos: 'atk' })
    guest.play({ type: 'move', id: 'card-5001-1', to: 'gy' })
    host.changeLife(-1200)
    guest.halveLife()
    host.toggleClock()

    await until(() => guest.getSnapshot().theirs?.acts.length === 2 && host.getSnapshot().theirs?.acts.length === 1 && guest.getSnapshot().life.lp[0] === 2800)
    expect(guest.getSnapshot().theirs?.state).toEqual(masked(hostTable, host.getSnapshot().mine!))
    expect(host.getSnapshot().theirs?.state).toEqual(masked(guestTable, guest.getSnapshot().mine!))
    expect(host.getSnapshot().life.lp).toEqual([2800, 2000])
    await until(() => guest.getSnapshot().life.timer.running)

    // Se corta la conexión del invitado (de golpe, sin avisar con un cierre normal) mientras el anfitrión sigue jugando.
    sockets[1]![0]!.close(4999)
    host.play({ type: 'move', id: 'card-1001-1', to: 'gy' })
    host.changeLife(-300)

    await until(() => guestTransport.status === 'open' && guest.getSnapshot().peerPresent && guest.getSnapshot().theirs?.state.gy.length === 1, 25_000, 'reconexión y sync')
    await until(() => guest.getSnapshot().life.lp[0] === 2500)

    expect(sockets[1]!.length).toBeGreaterThan(1)
    expect(guest.getSnapshot().theirs?.state).toEqual(masked(hostTable, host.getSnapshot().mine!))

    host.close()
    guest.close()
  })
})
