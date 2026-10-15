// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { CLOSE_FULL, PING, PONG, encodeRelayFrame, type RelayFrame } from '../app/duel-relay-rules'
import { createSocketTransport, type SocketLike, type SocketStatus, type SocketTransport, type SpectatorSocket } from '../app/duel-socket'

class FakeSocket implements SocketLike {
  static all: FakeSocket[] = []

  binaryType = ''
  readyState = 0
  sent: string[] = []
  closedWith: number | undefined
  onopen: SocketLike['onopen'] = null
  onmessage: SocketLike['onmessage'] = null
  onclose: SocketLike['onclose'] = null
  onerror: SocketLike['onerror'] = null

  constructor(readonly url: string) {
    FakeSocket.all.push(this)
  }

  send(data: string) {
    this.sent.push(data)
  }

  close(code?: number) {
    this.closedWith = code
    this.readyState = 3
  }

  // Lo que hace el servidor.
  open() {
    this.readyState = 1
    this.onopen?.({})
  }

  text(data: string) {
    this.onmessage?.({ data })
  }

  frame(frame: RelayFrame) {
    this.onmessage?.({ data: encodeRelayFrame(frame).buffer })
  }

  serverClose(code = 1006) {
    this.readyState = 3
    this.onclose?.({ code })
  }
}

const current = () => FakeSocket.all.at(-1)!

// Un transporte escucha la pestaña y la red de todo el documento: hay que cerrarlo (como hará la pantalla al desmontarse) o sigue vivo en las demás pruebas.
const opened: Array<SocketTransport & SpectatorSocket> = []

function connect(): SocketTransport & SpectatorSocket {
  const transport = createSocketTransport({ url: 'wss://relay.test', room: 'ABCD2345', participant: 'participant01', createSocket: (url) => new FakeSocket(url), random: () => 0.5 })
  opened.push(transport)
  return transport
}

beforeEach(() => {
  FakeSocket.all = []
  vi.useFakeTimers()
})

afterEach(() => {
  opened.splice(0).forEach((transport) => transport.close())
  vi.useRealTimers()
})

describe('el transporte por WebSocket', () => {
  it('se conecta a la sala con su identidad y pasa de conectando a abierto', () => {
    const transport = connect()

    expect(current().url).toBe('wss://relay.test/room/ABCD2345?pid=participant01')
    expect(current().binaryType).toBe('arraybuffer')
    expect(transport.status).toBe('connecting')

    current().open()
    expect(transport.status).toBe('open')
  })

  it('los mensajes del rival llegan; los avisos del relay y el latido no', () => {
    const transport = connect()
    const received: string[] = []
    transport.onMessage((text) => received.push(text))
    current().open()

    current().text('{"t":"resync"}')
    current().text(PONG)
    current().frame({ kind: 'peer', present: true })
    // Un jugador no puede hacerse pasar por el relay: lo que llega como texto es siempre del rival.
    current().text('{"r":"peer","present":false}')

    expect(received).toEqual(['{"t":"resync"}', '{"r":"peer","present":false}'])
  })

  it('el rival figura ausente hasta que el relay avisa, y de nuevo ausente cuando se corta', () => {
    const transport = connect()
    const events: boolean[] = []
    transport.onPeer((present) => events.push(present))
    current().open()

    current().frame({ kind: 'peer', present: true })
    current().frame({ kind: 'peer', present: true })
    current().frame({ kind: 'peer', present: false })
    current().frame({ kind: 'peer', present: true })
    current().serverClose()

    expect(events).toEqual([false, true, false, true, false])
  })

  it('onPeer y onStatus avisan enseguida cómo están ahora', () => {
    const transport = connect()
    current().open()
    current().frame({ kind: 'peer', present: true })

    const peers: boolean[] = []
    const statuses: SocketStatus[] = []
    transport.onPeer((present) => peers.push(present))
    transport.onStatus((status) => statuses.push(status))

    expect([peers, statuses]).toEqual([[true], ['open']])
  })

  it('sólo manda con la conexión abierta', () => {
    const transport = connect()

    transport.send('antes')
    current().open()
    transport.send('durante')
    current().serverClose()
    transport.send('después')

    expect(FakeSocket.all[0]!.sent).toEqual(['durante'])
  })
})

describe('cuando se corta', () => {
  it('reintenta con espera creciente y vuelve a empezar de cero al conectar', () => {
    const transport = connect()
    current().open()

    const waits: number[] = []

    for (let attempt = 0; attempt < 6; attempt += 1) {
      const before = FakeSocket.all.length
      current().serverClose()
      expect(transport.status).toBe('reconnecting')

      let waited = 0
      while (FakeSocket.all.length === before) {
        vi.advanceTimersByTime(100)
        waited += 100
      }

      waits.push(waited)
    }

    expect(waits).toEqual([500, 1000, 2000, 4000, 8000, 8000])

    current().open()
    expect(transport.status).toBe('open')
    current().serverClose()
    const before = FakeSocket.all.length
    vi.advanceTimersByTime(500)
    expect(FakeSocket.all.length).toBe(before + 1)
  })

  it('si la sala está llena no reintenta', () => {
    const transport = connect()
    current().open()
    current().serverClose(CLOSE_FULL)

    vi.advanceTimersByTime(60_000)

    expect(transport.status).toBe('full')
    expect(FakeSocket.all).toHaveLength(1)
  })

  it('el aviso de sala llena corta sin esperar el cierre del relay, y no reintenta', () => {
    const transport = connect()
    current().open()

    current().frame({ kind: 'full' })
    expect(transport.status).toBe('full')
    expect(current().readyState).toBe(3)

    // El cierre del relay puede llegar después, o no llegar: da igual.
    current().serverClose(1000)
    vi.advanceTimersByTime(60_000)

    expect(transport.status).toBe('full')
    expect(FakeSocket.all).toHaveLength(1)
  })

  it('los eventos de una conexión vieja no pisan a la nueva', () => {
    const transport = connect()
    const received: string[] = []
    transport.onMessage((text) => received.push(text))
    const old = current()
    old.open()
    old.serverClose()
    vi.advanceTimersByTime(500)
    const fresh = current()
    fresh.open()

    old.text('tarde')
    old.serverClose()
    fresh.text('al día')

    expect(received).toEqual(['al día'])
    expect(transport.status).toBe('open')
  })
})

describe('conexiones que mueren sin avisar', () => {
  it('el latido manda ping y, si nadie contesta, da la conexión por muerta y reconecta', () => {
    const transport = connect()
    const statuses: SocketStatus[] = []
    transport.onStatus((status) => statuses.push(status))
    const dead = current()
    dead.open()

    vi.advanceTimersByTime(20_000)
    expect(dead.sent).toEqual([PING])

    vi.advanceTimersByTime(8000)
    expect(transport.status).toBe('reconnecting')
    expect(dead.closedWith).toBeUndefined()

    vi.advanceTimersByTime(500)
    expect(FakeSocket.all).toHaveLength(2)
    expect(statuses).toEqual(['connecting', 'open', 'reconnecting'])
  })

  it('si contestan a tiempo, la conexión sigue', () => {
    const transport = connect()
    const socket = current()
    socket.open()

    // Cada ping tiene su pong: la conexión aguanta lo que dure.
    for (let beat = 0; beat < 6; beat += 1) {
      vi.advanceTimersByTime(20_000)
      socket.text(PONG)
    }

    expect(transport.status).toBe('open')
    expect(FakeSocket.all).toHaveLength(1)
    expect(socket.sent.filter((text) => text === PING)).toHaveLength(6)
  })

  it('cualquier mensaje del rival también prueba que la conexión vive', () => {
    const transport = connect()
    const socket = current()
    socket.open()

    vi.advanceTimersByTime(20_000)
    socket.text('{"t":"resync"}')
    vi.advanceTimersByTime(8000)

    expect(transport.status).toBe('open')
  })

  it('al volver a la pestaña reconecta enseguida, sin esperar el reintento', () => {
    const transport = connect()
    current().open()
    current().serverClose()
    expect(FakeSocket.all).toHaveLength(1)

    document.dispatchEvent(new Event('visibilitychange'))

    expect(FakeSocket.all).toHaveLength(2)
    expect(transport.status).toBe('reconnecting')
  })

  it('al volver a la pestaña con una conexión que parece abierta, la comprueba con un ping', () => {
    connect()
    const socket = current()
    socket.open()

    document.dispatchEvent(new Event('visibilitychange'))

    expect(socket.sent).toEqual([PING])
  })

  it('al recuperar la red también reconecta enseguida', () => {
    connect()
    current().open()
    current().serverClose()

    window.dispatchEvent(new Event('online'))

    expect(FakeSocket.all).toHaveLength(2)
  })
})

describe('al cerrarlo', () => {
  it('deja todo quieto: sin reintentos, sin latido y sin escuchar la pestaña ni la red', () => {
    const transport = connect()
    const events: string[] = []
    transport.onPeer((present) => events.push(`peer:${present}`))
    transport.onStatus((status) => events.push(`status:${status}`))
    current().open()
    current().frame({ kind: 'peer', present: true })
    const socket = current()

    transport.close()
    vi.advanceTimersByTime(120_000)
    document.dispatchEvent(new Event('visibilitychange'))
    window.dispatchEvent(new Event('online'))

    expect(socket.closedWith).toBe(1000)
    expect(socket.sent).toEqual([])
    expect(FakeSocket.all).toHaveLength(1)
    expect(transport.status).toBe('closed')
    expect(events.slice(-2)).toEqual(['peer:false', 'status:closed'])
  })

  it('cerrarlo cuando estaba esperando para reintentar cancela el reintento', () => {
    const transport = connect()
    current().open()
    current().serverClose()

    transport.close()
    vi.advanceTimersByTime(60_000)

    expect(FakeSocket.all).toHaveLength(1)
  })
})

describe('mirando como espectador', () => {
  function watch() {
    const transport = createSocketTransport({ url: 'wss://relay.test', room: 'ABCD2345', participant: 'participant02', role: 'spectator', createSocket: (url) => new FakeSocket(url), random: () => 0.5 })
    opened.push(transport)
    return transport
  }

  it('entra a la sala como espectador, recibe el texto de cada jugador con quién lo mandó y los avisos de cuántos juegan', () => {
    const transport = watch()
    const tagged: Array<[number, string]> = []
    const players: number[] = []

    transport.onTagged((tag, text) => tagged.push([tag, text]))
    transport.onPlayers((count) => players.push(count))
    expect(current().url).toBe('wss://relay.test/room/ABCD2345?pid=participant02&role=spectator')
    current().open()

    current().frame({ kind: 'players', count: 2 })
    current().text('0{"t":"chat"}')
    current().text('1hola')
    current().text(PONG)
    current().text('sin etiqueta')
    expect(players).toEqual([2])
    expect(tagged).toEqual([
      [0, '{"t":"chat"}'],
      [1, 'hola'],
    ])
  })

  it('no manda nada, salvo pedir que los jugadores repitan su estado', () => {
    const transport = watch()

    current().open()
    transport.send('jugada')
    transport.requestSync()
    expect(current().sent).toEqual(['resync'])
  })

  it('un jugador que pide el estado no manda "resync": eso es sólo de los espectadores', () => {
    const transport = connect()

    current().open()
    transport.requestSync()
    expect(current().sent).toEqual([])
  })

  it('si el relay lo trata como a un jugador (un relay anterior), lo da por no disponible y no lo reintenta', () => {
    const transport = watch()
    const statuses: SocketStatus[] = []

    transport.onStatus((status) => statuses.push(status))
    current().open()
    current().frame({ kind: 'peer', present: false })
    expect(transport.status).toBe('unsupported')
    expect(current().readyState).toBe(3)

    current().serverClose(1006)
    vi.advanceTimersByTime(60_000)
    expect(FakeSocket.all).toHaveLength(1)
    expect(statuses.at(-1)).toBe('unsupported')
  })

  it('con dos espectadores ya, el tercero recibe "llena" y no reintenta', () => {
    const transport = watch()

    current().open()
    current().frame({ kind: 'full' })
    expect(transport.status).toBe('full')
    vi.advanceTimersByTime(60_000)
    expect(FakeSocket.all).toHaveLength(1)
  })

  it('quien juega se entera de cuántos lo miran y de quién pide el estado, y el texto de su rival le llega igual', () => {
    const transport = connect()
    const seen: Array<[number, boolean]> = []
    const texts: string[] = []

    transport.onWatchers?.((count, needSync) => seen.push([count, needSync]))
    transport.onMessage((text) => texts.push(text))
    current().open()
    current().frame({ kind: 'watchers', count: 1, sync: true })
    current().frame({ kind: 'watchers', count: 0, sync: false })
    current().text('0{"t":"hello"}')
    expect(seen).toEqual([
      [1, true],
      [0, false],
    ])
    // Para quien juega no hay etiquetas: lo suyo es lo de siempre.
    expect(texts).toEqual(['0{"t":"hello"}'])
  })
})
