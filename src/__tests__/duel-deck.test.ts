import { describe, expect, it } from 'vitest'

import { duelCardIds, parseDuelDeck } from '../app/duel-deck'
import { createMemoryRoom } from './support/memory-room'
import { createDuel } from '../app/duel-session'
import { duelResult } from '../app/duel-games'
import { encodeMessage, parseMessage } from '../app/duel-protocol'
import { createMatState, matReducer, replayMat, type MatAction } from '../app/practice-mat'

/** Un enlace YDKE como lo arma el builder: cada zona son enteros de 32 bits little-endian en base64. */
const zone = (cards: number[]) => {
  const bytes = new Uint8Array(cards.length * 4)
  const view = new DataView(bytes.buffer)
  cards.forEach((card, index) => view.setUint32(index * 4, card, true))
  return btoa(String.fromCharCode(...bytes))
}
const ydke = (main: number[], extra: number[] = [], side: number[] = []) => `ydke://${zone(main)}!${zone(extra)}!${zone(side)}!`

describe('el deck de un duelo', () => {
  it('lee un enlace ydke:// con el Main y el Extra (y deja el Side afuera)', () => {
    expect(parseDuelDeck(ydke([14558127, 14558127, 23434538], [44508094], [5318639]))).toEqual({ main: [14558127, 14558127, 23434538], extra: [44508094] })
    // Con espacios alrededor y en mayúsculas el prefijo.
    expect(parseDuelDeck(`  YDKE://${zone([1, 2])}!${zone([])}!!  `)).toEqual({ main: [1, 2], extra: [] })
  })

  it('lee un .ydk: las zonas se separan con #main, #extra y !side, y los comentarios se ignoran', () => {
    const text = '#created by Ana\r\n#main\r\n14558127\r\n14558127\r\n23434538\r\n#extra\r\n44508094\r\n!side\r\n5318639\r\n'

    expect(parseDuelDeck(text)).toEqual({ main: [14558127, 14558127, 23434538], extra: [44508094] })
    // Sin encabezado, lo primero es el Main.
    expect(parseDuelDeck('1\n2\n3')).toEqual({ main: [1, 2, 3], extra: [] })
  })

  it('rechaza lo que no es un deck: vacío, sin Main, texto, números que no son cartas, enlaces rotos y textos enormes', () => {
    const bad = [
      '',
      '   ',
      ydke([]),
      '#main\n#extra\n44508094',
      'Dark Magician x3',
      '#main\n0\n1',
      '#main\n-5\n1',
      '#main\n1.5',
      '#main\n99999999999',
      'ydke://%%%!!!',
      'ydke://AAAA',
      `ydke://${btoa('abc')}!!!`,
      '#main\n' + Array.from({ length: 121 }, (_, index) => index + 1).join('\n'),
      '#main\n1\n#extra\n' + Array.from({ length: 31 }, (_, index) => index + 1).join('\n'),
      '#main\n' + '1\n'.repeat(60_000),
    ]

    bad.forEach((text) => expect(parseDuelDeck(text)).toBeNull())
  })

  it('arma los ids de copia de la mesa: cada carta cuenta sus copias dentro de la zona', () => {
    expect(duelCardIds([14558127, 23434538, 14558127, 14558127])).toEqual(['card-14558127-1', 'card-23434538-1', 'card-14558127-2', 'card-14558127-3'])
    expect(duelCardIds([])).toEqual([])
  })
})

describe('cómo termina un duelo', () => {
  it('pierde quien se queda sin puntos de vida o se rinde; los dos en cero es empate; mientras haya, sigue', () => {
    expect(duelResult([8000, 8000], null)).toBeNull()
    expect(duelResult([0, 8000], null)).toEqual({ kind: 'loss', loser: 0 })
    expect(duelResult([100, 0], null)).toEqual({ kind: 'loss', loser: 1 })
    expect(duelResult([0, 0], null)).toEqual({ kind: 'draw' })
    // Rendirse manda sobre los puntos: aunque tenga vida, pierde.
    expect(duelResult([8000, 8000], 1)).toEqual({ kind: 'loss', loser: 1 })
  })

  it('el protocolo acepta rendirse y la revancha, y el robo salteado sólo como `true`', () => {
    const game = (kind: string) => JSON.stringify({ t: 'game', n: 1, game: { kind } })
    const phase = (extra: object) => JSON.stringify({ t: 'act', n: 1, wire: { action: { type: 'phase', phase: 'draw', ...extra }, reveal: {} } })

    expect(parseMessage(game('concede'))).toEqual({ t: 'game', n: 1, game: { kind: 'concede' } })
    expect(parseMessage(game('rematch'))).toEqual({ t: 'game', n: 1, game: { kind: 'rematch' } })
    expect(parseMessage(phase({}))).not.toBeNull()
    expect(parseMessage(phase({ skipDraw: true }))).not.toBeNull()
    expect(parseMessage(phase({ skipDraw: false }))).toBeNull()
    expect(parseMessage(phase({ skipDraw: 'yes' }))).toBeNull()
    expect(parseMessage(phase({ skipDraw: true, pass: true }))).not.toBeNull()
    expect(parseMessage(phase({ pass: false }))).toBeNull()
    expect(parseMessage(phase({ pass: 1 }))).toBeNull()
    expect(parseMessage(encodeMessage({ t: 'game', n: 2, game: { kind: 'concede' } }))).toEqual({ t: 'game', n: 2, game: { kind: 'concede' } })
  })
})

describe('el robo del turno en un duelo', () => {
  const main = Array.from({ length: 12 }, (_, index) => `card-${1000 + index}-1`)
  const table = createMatState(main, [], 5)
  const wrap: MatAction[] = [
    { type: 'phase', phase: 'end' },
    { type: 'phase', phase: 'draw' },
  ]

  it('de la End Phase a la Draw Phase la mesa roba sola (la práctica) y con `skipDraw` no (el duelo)', () => {
    const practice = replayMat(table, wrap)
    const duel = replayMat(table, [wrap[0]!, { type: 'phase', phase: 'draw', skipDraw: true }])

    expect(practice.hand).toHaveLength(6)
    expect(practice.turn).toBe(2)
    expect(duel.hand).toHaveLength(5)
    expect(duel.turn).toBe(2)
    expect(matReducer(duel, { type: 'draw', count: 1 }).hand).toHaveLength(6)
  })

  it('terminar el turno de un toque (`pass`): desde la fase que sea se pasa al turno siguiente, también desde la Draw Phase; sin `pass` no', () => {
    const pass: MatAction = { type: 'phase', phase: 'draw', skipDraw: true, pass: true }
    const fromMain = replayMat(table, [{ type: 'phase', phase: 'main1' }, pass])

    expect(fromMain).toMatchObject({ turn: 2, phase: 'draw' })
    expect(fromMain.hand).toHaveLength(5)
    // Recién empezado el turno (ya en la Draw Phase) también termina.
    expect(replayMat(table, [pass])).toMatchObject({ turn: 2, phase: 'draw' })
    // Sin `pass`, ir a la Draw Phase desde otra fase no cambia de turno ni desde la propia Draw Phase.
    expect(replayMat(table, [{ type: 'phase', phase: 'main1' }, { type: 'phase', phase: 'draw' }])).toMatchObject({ turn: 1, phase: 'draw' })
    expect(replayMat(table, [{ type: 'phase', phase: 'draw' }])).toMatchObject({ turn: 1, phase: 'draw' })
  })
})

describe('rendirse y la revancha entre dos jugadores', () => {
  const hostTable = createMatState(Array.from({ length: 12 }, (_, index) => `card-${1000 + index}-1`), [], 5)
  const guestTable = createMatState(Array.from({ length: 12 }, (_, index) => `card-${5000 + index}-1`), [], 5)

  function setup() {
    const room = createMemoryRoom()
    const hostEnd = room.join()
    const guestEnd = room.join()
    const host = createDuel(hostEnd, { role: 'host', name: 'Ana', sid: 'host-1' })
    const guest = createDuel(guestEnd, { role: 'guest', name: 'Beto', sid: 'guest-1' })

    room.flush()
    host.start(hostTable)
    guest.start(guestTable)
    room.flush()
    return { room, hostEnd, guestEnd, host, guest }
  }

  it('rendirse termina el duelo para los dos, una sola vez', () => {
    const { room, host, guest } = setup()

    guest.concede()
    guest.concede()
    room.flush()

    expect(host.getSnapshot().conceded).toBe(1)
    expect(guest.getSnapshot().conceded).toBe(1)
    expect(host.getSnapshot().games.filter((entry) => entry.game.kind === 'concede')).toHaveLength(1)
    expect(duelResult(host.getSnapshot().life.lp, host.getSnapshot().conceded)).toEqual({ kind: 'loss', loser: 1 })
  })

  it('con la revancha de uno solo, nada cambia; cuando la piden los dos la mesa se limpia y los puntos y el reloj vuelven al principio', () => {
    const { room, host, guest } = setup()

    host.changeLife(-3000)
    guest.changeLife(-8000)
    host.toggleClock()
    guest.concede()
    room.flush()

    host.rematch()
    host.rematch()
    room.flush()
    expect(host.getSnapshot().rematch).toEqual({ mine: true, theirs: false })
    expect(guest.getSnapshot().rematch).toEqual({ mine: false, theirs: true })
    expect(host.getSnapshot().mine).not.toBeNull()

    guest.rematch()
    room.flush()

    for (const duel of [host, guest]) {
      const snapshot = duel.getSnapshot()

      expect(snapshot.mine).toBeNull()
      expect(snapshot.theirs).toBeNull()
      expect(snapshot.conceded).toBeNull()
      expect(snapshot.rematch).toEqual({ mine: false, theirs: false })
      expect(snapshot.life.lp).toEqual([8000, 8000])
      expect(snapshot.life.timer.running).toBe(false)
      expect(snapshot.moves).toBe(0)
    }

    // Y se puede volver a jugar: cada uno reparte y los dos se ven, con los números de las jugadas desde cero.
    host.start(hostTable)
    guest.start(guestTable)
    room.flush()
    host.play({ type: 'place', id: 'card-1000-1', zone: 'mz', index: 0, pos: 'atk' })
    room.flush()

    expect(guest.getSnapshot().theirs?.state.mz[0]).not.toBeNull()
    expect(host.getSnapshot().theirs).not.toBeNull()
  })

  it('si el rival recarga después de pedir yo la revancha, se la repito al volver', () => {
    const room = createMemoryRoom()
    const host = createDuel(room.join(), { role: 'host', name: 'Ana', sid: 'host-1' })
    const first = createDuel(room.join(), { role: 'guest', name: 'Beto', sid: 'guest-1' })

    room.flush()
    host.rematch()
    room.flush()
    expect(first.getSnapshot().rematch.theirs).toBe(true)

    first.close()
    const again = createDuel(room.join(), { role: 'guest', name: 'Beto', sid: 'guest-2' })

    room.flush()
    expect(again.getSnapshot().rematch).toEqual({ mine: false, theirs: true })
    again.rematch()
    room.flush()
    expect(again.getSnapshot().rematch).toEqual({ mine: false, theirs: false })
    expect(host.getSnapshot().rematch).toEqual({ mine: false, theirs: false })
  })
})
