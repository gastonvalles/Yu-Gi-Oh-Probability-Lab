import { describe, expect, it } from 'vitest'

import { MAX_CHAT_LENGTH, MAX_CHAT_LOG, cleanChat, coinWinner, dieWinner } from '../app/duel-games'
import { encodeMessage, parseMessage } from '../app/duel-protocol'
import { createDuel } from '../app/duel-session'
import { createMatState } from '../app/practice-mat'
import { createMemoryRoom } from './support/memory-room'

const hostTable = createMatState(Array.from({ length: 12 }, (_, index) => `card-${1000 + index}-1`), [], 5)
const guestTable = createMatState(Array.from({ length: 12 }, (_, index) => `card-${5000 + index}-1`), [], 5)

/** Dos jugadores en la sala; el azar de la moneda y el dado lo fijan las pruebas (cada uno tira lo que se le dé). */
function setup() {
  const room = createMemoryRoom()
  const hostEnd = room.join()
  const guestEnd = room.join()
  const next = { host: 0.1, guest: 0.9 }
  const host = createDuel(hostEnd, { role: 'host', name: 'Ana', sid: 'host-1', random: () => next.host })
  const guest = createDuel(guestEnd, { role: 'guest', name: 'Beto', sid: 'guest-1', random: () => next.guest })

  room.flush()
  return { room, hostEnd, guestEnd, host, guest, next }
}

type Game = ReturnType<typeof setup>

function bothReady({ room, host, guest }: Game) {
  host.setReady(true)
  guest.setReady(true)
  room.flush()
}

describe('estar listo', () => {
  it('cada uno ve si el otro está listo, y se puede dejar de estarlo', () => {
    const { room, host, guest } = setup()

    expect(host.getSnapshot().ready).toEqual({ mine: false, theirs: false })

    host.setReady(true)
    room.flush()
    expect(host.getSnapshot().ready).toEqual({ mine: true, theirs: false })
    expect(guest.getSnapshot().ready).toEqual({ mine: false, theirs: true })

    guest.setReady(true)
    room.flush()
    expect(host.getSnapshot().ready).toEqual({ mine: true, theirs: true })
    expect(guest.getSnapshot().ready).toEqual({ mine: true, theirs: true })

    host.setReady(false)
    room.flush()
    expect(guest.getSnapshot().ready).toEqual({ mine: true, theirs: false })
  })

  it('si el rival recarga la página, deja de estar listo y se lo ve de nuevo al volver; el listo propio se mantiene', () => {
    const game = setup()
    bothReady(game)

    game.guestEnd.close()
    const reloaded = createDuel(game.room.join(), { role: 'guest', name: 'Beto', sid: 'guest-2' })
    game.room.flush()

    expect(game.host.getSnapshot().ready).toEqual({ mine: true, theirs: false })
    expect(reloaded.getSnapshot().ready).toEqual({ mine: false, theirs: true })

    reloaded.setReady(true)
    game.room.flush()
    expect(game.host.getSnapshot().ready.theirs).toBe(true)
  })

  it('el listo viaja y no se pasa de lo que se puede decir: un valor que no es true o false se descarta', () => {
    expect(parseMessage(encodeMessage({ t: 'ready', ready: true }))).toEqual({ t: 'ready', ready: true })
    expect(parseMessage('{"t":"ready","ready":"si"}')).toBeNull()
    expect(parseMessage('{"t":"ready"}')).toBeNull()
  })
})

describe('definir quién elige ir primero', () => {
  it('hasta que los dos están listos no se define nada', () => {
    const { room, host, guest } = setup()

    host.chooseMethod('die')
    host.setReady(true)
    host.chooseMethod('die')
    room.flush()

    expect(host.getSnapshot().opening.method).toBeNull()
    expect(guest.getSnapshot().opening.method).toBeNull()

    guest.throwDie()
    room.flush()
    expect(host.getSnapshot().opening.dice).toEqual({ mine: null, theirs: null })
  })

  it('el primero en elegir con qué definirlo lo fija para los dos, y si eligen a la vez vale lo del anfitrión', () => {
    const game = setup()
    bothReady(game)

    game.guest.chooseMethod('coin')
    game.room.flush()
    expect(game.host.getSnapshot().opening).toMatchObject({ method: 'coin', caller: 1 })
    expect(game.guest.getSnapshot().opening).toMatchObject({ method: 'coin', caller: 1 })

    // Una vez elegido, el invitado no lo cambia; el anfitrión sí.
    game.guest.chooseMethod('die')
    game.room.flush()
    expect(game.host.getSnapshot().opening.method).toBe('coin')
    game.host.chooseMethod('die')
    game.room.flush()
    expect(game.guest.getSnapshot().opening).toMatchObject({ method: 'die', caller: 0 })

    // A la vez: los dos eligen antes de enterarse del otro.
    const other = setup()
    bothReady(other)
    other.host.chooseMethod('rps')
    other.guest.chooseMethod('coin')
    other.room.flush()
    expect(other.host.getSnapshot().opening).toMatchObject({ method: 'rps', caller: 0 })
    expect(other.guest.getSnapshot().opening).toMatchObject({ method: 'rps', caller: 0 })
  })

  it('moneda: quien la eligió pide cara o cruz; si acierta, elige él, y si no, el otro', () => {
    for (const [call, winner] of [
      [0, 0],
      [1, 1],
    ] as const) {
      const game = setup()
      bothReady(game)

      // La moneda del anfitrión cae cara (0): si pide cara gana, si pide cruz gana el invitado.
      game.host.chooseMethod('coin')
      game.room.flush()
      game.host.callCoin(call)
      game.room.flush()

      expect(game.host.getSnapshot().opening.chooser).toBe(winner === 0 ? 0 : 1)
      expect(game.guest.getSnapshot().opening.chooser).toBe(winner === 0 ? 0 : 1)
      const toss = game.guest.getSnapshot().games.at(-1)!
      expect(toss).toMatchObject({ from: 0, game: { kind: 'coin', face: 0, call } })
    }
  })

  it('dado: gana el número más alto; con el mismo número se vuelve a tirar, y no se tira dos veces seguidas', () => {
    const game = setup()
    bothReady(game)

    game.host.chooseMethod('die')
    game.room.flush()
    game.next.host = 0.5 // 4
    game.host.throwDie()
    game.host.throwDie() // ya tiró: no cuenta otra vez
    game.room.flush()
    expect(game.host.getSnapshot().games.filter((entry) => entry.game.kind === 'die')).toHaveLength(1)
    expect(game.guest.getSnapshot().opening.dice).toEqual({ mine: null, theirs: 4 })
    expect(game.guest.getSnapshot().opening.chooser).toBeNull()

    // Empate: los dos sacaron 4.
    game.next.guest = 0.5
    game.guest.throwDie()
    game.room.flush()
    expect(game.host.getSnapshot().opening).toMatchObject({ dice: { mine: 4, theirs: 4 }, chooser: null })

    // Se vuelve a tirar: el primero que tira borra los dos números.
    game.next.host = 0.2 // 2
    game.host.throwDie()
    game.room.flush()
    expect(game.guest.getSnapshot().opening.dice).toEqual({ mine: null, theirs: 2 })
    game.next.guest = 0.9 // 6
    game.guest.throwDie()
    game.room.flush()
    expect(game.host.getSnapshot().opening).toMatchObject({ dice: { mine: 2, theirs: 6 }, chooser: 1 })
    expect(game.guest.getSnapshot().opening).toMatchObject({ dice: { mine: 6, theirs: 2 }, chooser: 1 })
  })

  it('piedra, papel o tijera: gana quien gana la ronda; con un empate hay otra ronda', () => {
    const game = setup()
    bothReady(game)

    game.host.chooseMethod('rps')
    game.room.flush()
    game.host.pickRps('rock')
    game.guest.pickRps('rock')
    game.room.flush()
    expect(game.host.getSnapshot().opening.chooser).toBeNull()

    game.host.pickRps(null)
    game.room.flush()
    game.host.pickRps('paper')
    game.guest.pickRps('rock')
    game.room.flush()
    expect(game.host.getSnapshot().opening.chooser).toBe(0)
    expect(game.guest.getSnapshot().opening.chooser).toBe(0)
  })

  it('el que gana elige ir primero o segundo: se sabe en los dos lados y recién ahí cada uno puede repartir; la ronda de la sala no queda en el panel', () => {
    const game = setup()
    bothReady(game)

    game.host.chooseMethod('rps')
    game.room.flush()
    game.host.pickRps('rock')
    game.guest.pickRps('scissors')
    game.room.flush()
    expect(game.guest.getSnapshot().opening.ordered).toBe(false)

    game.host.chooseFirst(1)
    game.room.flush()
    for (const duel of [game.host, game.guest]) {
      expect(duel.getSnapshot().starter).toBe(1)
      expect(duel.getSnapshot().opening.ordered).toBe(true)
      expect(duel.getSnapshot().rps).toEqual({ mine: null, theirs: null })
    }
  })

  it('en una revancha elige quien perdió, sin tirar nada; los dos siguen listos', () => {
    const game = setup()
    bothReady(game)
    game.host.chooseMethod('rps')
    game.room.flush()
    game.host.pickRps('rock')
    game.guest.pickRps('scissors')
    game.host.chooseFirst(0)
    game.room.flush()
    game.host.start(hostTable)
    game.guest.start(guestTable)
    game.room.flush()

    // Beto se rinde y los dos piden la revancha.
    game.guest.concede()
    game.host.rematch()
    game.guest.rematch()
    game.room.flush()

    for (const duel of [game.host, game.guest]) {
      expect(duel.getSnapshot().opening).toMatchObject({ method: null, chooser: 1, ordered: false })
      expect(duel.getSnapshot().ready).toEqual({ mine: true, theirs: true })
      expect(duel.getSnapshot().mine).toBeNull()
    }

    game.guest.chooseFirst(0)
    game.room.flush()
    expect(game.host.getSnapshot().opening.ordered).toBe(true)
  })

  it('si pierden los dos a la vez (empate), la revancha vuelve a definirse', () => {
    const game = setup()
    bothReady(game)
    game.host.chooseMethod('die')
    game.room.flush()
    game.host.throwDie()
    game.guest.throwDie()
    game.room.flush()
    game.host.chooseFirst(0)
    game.room.flush()
    game.host.start(hostTable)
    game.guest.start(guestTable)
    game.host.changeLife(-8000)
    game.guest.changeLife(-8000)
    game.room.flush()
    game.host.rematch()
    game.guest.rematch()
    game.room.flush()

    expect(game.host.getSnapshot().opening).toMatchObject({ method: null, chooser: null, ordered: false })
  })

  it('quien recarga la página ya empezado el duelo se entera de quién iba primero y sigue desde ahí', () => {
    const game = setup()
    bothReady(game)
    game.host.chooseMethod('rps')
    game.room.flush()
    game.host.pickRps('paper')
    game.guest.pickRps('rock')
    game.host.chooseFirst(1)
    game.room.flush()
    game.host.start(hostTable)
    game.guest.start(guestTable)
    game.room.flush()

    game.guestEnd.close()
    const reloaded = createDuel(game.room.join(), { role: 'guest', name: 'Beto', sid: 'guest-2' })
    game.room.flush()

    expect(reloaded.getSnapshot()).toMatchObject({ starter: 1, opening: { ordered: true }, ready: { mine: true, theirs: true } })
  })

  it('si el rival recarga en medio de la tirada, se vuelve a definir desde el principio', () => {
    const game = setup()
    bothReady(game)
    game.host.chooseMethod('die')
    game.room.flush()
    game.host.throwDie()
    game.room.flush()

    game.guestEnd.close()
    createDuel(game.room.join(), { role: 'guest', name: 'Beto', sid: 'guest-2' })
    game.room.flush()

    expect(game.host.getSnapshot().opening).toMatchObject({ method: null, caller: null, dice: { mine: null, theirs: null }, chooser: null })
  })

  it('si se pierde un mensaje de la tirada (un celular en segundo plano), al reconectar se repone y no queda trabada', () => {
    const lost = (game: Game) => game.room.queue.splice(0)
    const reconnect = (game: Game) => {
      game.guestEnd.disconnect()
      game.guestEnd.reconnect()
      game.room.flush()
    }

    // El dado del anfitrión se pierde en el camino: el invitado cree que todavía falta.
    const dice = setup()
    bothReady(dice)
    dice.host.chooseMethod('die')
    dice.room.flush()
    dice.next.host = 0.9
    dice.host.throwDie()
    lost(dice)
    dice.next.guest = 0.1
    dice.guest.throwDie()
    dice.room.flush()
    expect(dice.guest.getSnapshot().opening).toMatchObject({ dice: { mine: 1, theirs: null }, chooser: null })
    reconnect(dice)
    for (const duel of [dice.host, dice.guest]) {
      expect(duel.getSnapshot().opening).toMatchObject({ chooser: 0 })
    }
    expect(dice.guest.getSnapshot().opening.dice).toEqual({ mine: 1, theirs: 6 })

    // Se pierde con qué se define.
    const method = setup()
    bothReady(method)
    method.host.chooseMethod('rps')
    lost(method)
    expect(method.guest.getSnapshot().opening.method).toBeNull()
    reconnect(method)
    expect(method.guest.getSnapshot().opening).toMatchObject({ method: 'rps', caller: 0 })

    // Se pierde el resultado de la moneda.
    const coin = setup()
    bothReady(coin)
    coin.host.chooseMethod('coin')
    coin.room.flush()
    coin.host.callCoin(0)
    lost(coin)
    expect(coin.host.getSnapshot().opening.chooser).toBe(0)
    expect(coin.guest.getSnapshot().opening.chooser).toBeNull()
    reconnect(coin)
    expect(coin.guest.getSnapshot().opening.chooser).toBe(0)
  })

  it('el estado de la tirada que viaja en el sync se valida: un dado fuera de rango o un método que no existe se descartan', () => {
    const sync = (opening: unknown) => JSON.stringify({ t: 'sync', n: 0, known: {}, lp: 8000, lifeN: 0, opening })

    expect(parseMessage(sync({ method: 'die', caller: 1, die: 4, chooser: 0 }))).toMatchObject({ opening: { method: 'die', caller: 1, die: 4, chooser: 0 } })
    expect(parseMessage(sync({}))).toMatchObject({ t: 'sync' })
    expect(parseMessage(sync({ die: 7 }))).toBeNull()
    expect(parseMessage(sync({ method: 'dados' }))).toBeNull()
    expect(parseMessage(sync({ chooser: 2 }))).toBeNull()
    expect(parseMessage(sync('dado'))).toBeNull()
  })

  it('las funciones que deciden quién gana', () => {
    expect(dieWinner(5, 3)).toBe(0)
    expect(dieWinner(2, 6)).toBe(1)
    expect(dieWinner(4, 4)).toBeNull()
    // Quien pide la moneda gana si acierta.
    expect(coinWinner(0, 0, 0)).toBe(0)
    expect(coinWinner(0, 1, 0)).toBe(1)
    expect(coinWinner(1, 1, 1)).toBe(1)
    expect(coinWinner(1, 0, 1)).toBe(0)
  })
})

describe('el chat', () => {
  it('lo que uno escribe lo ve el otro, con quién lo dijo y en orden', () => {
    const { room, host, guest } = setup()

    host.sendChat('¿Respondés?')
    room.flush()
    guest.sendChat('  Sí, un segundo  ')
    room.flush()
    host.sendChat('dale')
    room.flush()

    for (const duel of [host, guest]) {
      expect(duel.getSnapshot().chat.map(({ from, text }) => [from, text])).toEqual([
        [0, '¿Respondés?'],
        [1, 'Sí, un segundo'],
        [0, 'dale'],
      ])
    }
  })

  it('un mensaje vacío o hecho sólo de espacios y caracteres de control no se manda, ni tampoco sin el rival en la sala', () => {
    const { room, host, guest, guestEnd } = setup()

    host.sendChat('')
    host.sendChat('   \u0007  ')
    room.flush()
    expect(host.getSnapshot().chat).toHaveLength(0)
    expect(guest.getSnapshot().chat).toHaveLength(0)

    guestEnd.disconnect()
    room.flush()
    host.sendChat('¿estás?')
    expect(host.getSnapshot().chat).toHaveLength(0)
  })

  it('se limpia y se acorta: nada de caracteres de control y un tope de largo; lo que llega mal formado se descarta', () => {
    expect(cleanChat('hola\u0000\n mundo')).toBe('hola mundo')
    expect(cleanChat('a'.repeat(MAX_CHAT_LENGTH + 50))).toHaveLength(MAX_CHAT_LENGTH)

    expect(parseMessage(encodeMessage({ t: 'chat', n: 1, text: 'hola' }))).toEqual({ t: 'chat', n: 1, text: 'hola' })
    expect(parseMessage('{"t":"chat","n":1,"text":"   "}')).toBeNull()
    expect(parseMessage('{"t":"chat","n":0,"text":"hola"}')).toBeNull()
    expect(parseMessage('{"t":"chat","n":1}')).toBeNull()
    expect(parseMessage('{"t":"chat","n":1,"text":5}')).toBeNull()
    // Un mensaje largo llega recortado.
    expect(parseMessage(JSON.stringify({ t: 'chat', n: 1, text: 'b'.repeat(MAX_CHAT_LENGTH + 10) }))).toEqual({ t: 'chat', n: 1, text: 'b'.repeat(MAX_CHAT_LENGTH) })
  })

  it('un mensaje repetido no se muestra dos veces, y el registro no crece sin fin', () => {
    const { room, hostEnd, guestEnd, host, guest } = setup()

    host.sendChat('uno')
    room.flush()
    room.inject(guestEnd, encodeMessage({ t: 'chat', n: 1, text: 'uno' }))
    room.flush()
    expect(guest.getSnapshot().chat).toHaveLength(1)

    for (let index = 0; index < MAX_CHAT_LOG + 20; index += 1) {
      host.sendChat(`mensaje ${index}`)
    }

    room.flush()
    expect(guest.getSnapshot().chat).toHaveLength(MAX_CHAT_LOG)
    expect(guest.getSnapshot().chat.at(-1)!.text).toBe(`mensaje ${MAX_CHAT_LOG + 19}`)
    expect(hostEnd.connected).toBe(true)
  })
})

describe('cambiar el nombre estando en la sala', () => {
  it('el rival lo ve al instante y nadie pierde su "listo"', () => {
    const { room, host, guest } = setup()

    guest.setReady(true)
    room.flush()
    guest.rename('Beto Ramírez')
    room.flush()

    expect(host.getSnapshot().peerName).toBe('Beto Ramírez')
    expect(host.getSnapshot().ready.theirs).toBe(true)
    expect(guest.getSnapshot().ready.mine).toBe(true)
  })

  it('un nombre vacío no pisa el que había, y si el rival recarga ve el nuevo', () => {
    const { room, hostEnd, host, guest } = setup()

    guest.rename('Beto Ramírez')
    guest.rename('   ')
    room.flush()
    expect(host.getSnapshot().peerName).toBe('Beto Ramírez')

    hostEnd.close()
    const reloaded = createDuel(room.join(), { role: 'host', name: 'Ana', sid: 'host-2' })
    room.flush()
    expect(reloaded.getSnapshot().peerName).toBe('Beto Ramírez')
  })
})
