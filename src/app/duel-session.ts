import { addChat, addGame, cleanChat, coinWinner, dieWinner, duelResult, rpsOutcome, type ChatLine, type DuelGame, type GameEntry, type RpsPick, type TossMethod } from './duel-games'
import { DEFAULT_SETTINGS, PROTOCOL_VERSION, cleanName, encodeMessage, parseMessage, type DuelMessage, type DuelSettings, type OpeningWire } from './duel-protocol'
import { createLifeState, lifeReducer, timerElapsed, type Duelist, type LifeState } from './life-calculator'
import { encodeAct, mapMatIds, mirrorApply, mirrorUndo, openMirror, openPublic, senderKnown, type Mirror, type PublicSender } from './mat-public'
import { matReducer, replayMat, type MatAction, type MatState } from './practice-mat'

/**
 * Un duelo por enlace, del lado de uno de los dos jugadores: mi mesa (la real), la del rival (un espejo
 * con ids opacos), los puntos de vida de los dos y el reloj compartido. No sabe de React ni de redes: habla
 * con el otro lado por un `DuelTransport` (el relay en producción, una sala en memoria en las pruebas).
 *
 * Cada uno mueve sólo sus cartas y cambia sólo sus puntos de vida, así que no hay edición simultánea
 * sobre lo mismo. Si algo se pierde (una caída, un mensaje duplicado o fuera de orden), el espejo pide
 * un `sync` y vuelve a quedar igual. Es para jugar con amigos: no está pensado contra quien haga trampa.
 */

export type DuelRole = 'host' | 'guest'

export interface DuelTransport {
  /** Manda un mensaje al otro jugador; si no está, se pierde (el `sync` de cuando vuelva lo repone). */
  send(text: string): void
  /** Mensajes del otro jugador, sin revisar. Devuelve cómo dejar de escuchar. */
  onMessage(listener: (text: string) => void): () => void
  /** El otro jugador entra o sale. Al suscribirse avisa enseguida cómo está ahora. */
  onPeer(listener: (present: boolean) => void): () => void
  /** Cuántos espectadores hay y si alguno pide que repitas tu estado (llegó, o se perdió algo). Sin espectadores (una sala en memoria) no existe. */
  onWatchers?(listener: (count: number, needSync: boolean) => void): () => void
  close(): void
}

export interface DuelSnapshot {
  role: DuelRole
  /** 0 = anfitrión, 1 = invitado: de quién son los puntos de vida `life.lp[me]`. */
  me: Duelist
  settings: DuelSettings
  /** El otro jugador está en la sala ahora. */
  peerPresent: boolean
  peerName: string | null
  /** El otro lado habla otra versión del protocolo o eligió el mismo rol: no se puede jugar con él. */
  incompatible: boolean
  /** Mi mesa, o null hasta `start`. */
  mine: MatState | null
  /** La mesa con la que arranqué y mis jugadas hasta ahora (de acá sale la lista de pasos). */
  initial: MatState | null
  /** id opaco → id real de mis cartas: así se sabe cuál es una mía que el rival nombra (el objetivo de su ataque). Vacío hasta `start`. */
  ownIds: Readonly<Record<string, string>>
  actions: readonly MatAction[]
  /** Cuántas jugadas llevo (para saber si hay algo que deshacer). */
  moves: number
  /** La mesa del rival con ids opacos y lo que ya me mostró, o null hasta que me llegue. */
  theirs: Mirror | null
  /** LP de los dos (0 = anfitrión, 1 = invitado) y reloj de la ronda. */
  life: LifeState
  /** El registro de lo que los dos hicieron además de jugar: moneda, dado, piedra-papel-tijera, quién va primero y señales. */
  games: readonly GameEntry[]
  /** La ronda de piedra-papel-tijera en curso: la elección del rival se guarda pero no debe mostrarse hasta que yo haya elegido. */
  rps: { mine: RpsPick | null; theirs: RpsPick | null }
  /** Quién empieza (0 = anfitrión, 1 = invitado): el anfitrión, hasta que alguien diga otra cosa. */
  starter: Duelist
  /** Quién se rindió (0 = anfitrión, 1 = invitado), si alguien lo hizo. */
  conceded: Duelist | null
  /** Quién pidió la revancha: cuando los dos la piden, la mesa se limpia y se vuelve a repartir. */
  rematch: { mine: boolean; theirs: boolean }
  /** Quién está listo para empezar: hasta que los dos lo están no se define quién va primero. */
  ready: { mine: boolean; theirs: boolean }
  /**
   * Cómo se define quién elige ir primero: con qué (`method`, que fija el primero en elegir, y `caller`, quién lo eligió: pide la cara o cruz de la moneda), los dados de cada uno, quién ganó y por lo tanto elige (`chooser`)
   * y si ya eligió (`ordered`, y entonces cada uno reparte su mano). En una revancha elige quien perdió, sin tirar nada.
   */
  opening: { method: TossMethod | null; caller: Duelist | null; dice: { mine: number | null; theirs: number | null }; chooser: Duelist | null; ordered: boolean }
  /** Lo que se escribieron los dos, de más viejo a más nuevo. */
  chat: readonly ChatLine[]
  /** Cuántos espectadores están mirando (hasta dos): sólo miran, no pueden hacer nada. */
  watchers: number
}

export interface Duel {
  getSnapshot(): DuelSnapshot
  subscribe(listener: () => void): () => void
  /** Mi mesa de arranque (deck mezclado y mano repartida); se la mando al rival ya enmascarada. */
  start(initial: MatState): void
  play(action: MatAction): void
  undo(): void
  changeLife(delta: number): void
  halveLife(): void
  toggleClock(): void
  throwCoin(): void
  throwDie(): void
  /** Elegir en piedra-papel-tijera (una vez por ronda); `null` empieza otra. */
  pickRps(pick: RpsPick | null): void
  chooseFirst(first: Duelist): void
  /** Estoy listo (o ya no) para empezar. */
  setReady(ready: boolean): void
  /** Cambiarme el nombre estando en la sala: el rival (y quien mira) lo ve al instante. */
  rename(name: string): void
  /** Con qué se define quién va primero: el primero en elegir lo fija para los dos. */
  chooseMethod(method: TossMethod): void
  /** La moneda de quién empieza: pido cara o cruz y se tira; gano si acerté. */
  callCoin(call: 0 | 1): void
  /** Escribirle algo al rival. */
  sendChat(text: string): void
  /** Rendirme: el duelo termina y gana el rival. */
  concede(): void
  /** Pedir la revancha (o aceptarla si el rival la pidió). */
  rematch(): void
  close(): void
}

interface DuelOptions {
  role: DuelRole
  name: string
  /** Sólo los fija el anfitrión; el invitado usa los de él. */
  settings?: DuelSettings
  /** Reloj del dispositivo (para las pruebas). */
  now?: () => number
  /** Identifica esta carga de la página (para las pruebas). */
  sid?: string
  /** De dónde sale el azar de la moneda y el dado (para las pruebas). */
  random?: () => number
}

export function createDuel(transport: DuelTransport, options: DuelOptions): Duel {
  const { role } = options
  const now = options.now ?? Date.now
  const random = options.random ?? Math.random
  const sid = options.sid ?? Math.random().toString(36).slice(2, 12).padEnd(6, '0')
  const me: Duelist = role === 'host' ? 0 : 1
  const peer: Duelist = role === 'host' ? 1 : 0
  let name = cleanName(options.name)

  let settings = role === 'host' && options.settings ? options.settings : DEFAULT_SETTINGS
  let life: LifeState = { ...createLifeState(), lp: [settings.lp, settings.lp] }
  let peerPresent = false
  let peerName: string | null = null
  let peerSid: string | null = null
  let incompatible = false

  // Mi lado.
  let initial: MatState | null = null
  let actions: MatAction[] = []
  let mine: MatState | null = null
  let sender: PublicSender | null = null
  let ownIds: Readonly<Record<string, string>> = {}
  let lifeN = 0
  let clockN = 0
  // Los juegos: lo que cada uno hizo (el registro no viaja en el `sync`: es de esta sesión) y la ronda de piedra-papel-tijera.
  let games: GameEntry[] = []
  let gameId = 0
  let gameN = 0
  let rps: { mine: RpsPick | null; theirs: RpsPick | null } = { mine: null, theirs: null }
  let starter: Duelist = 0
  let conceded: Duelist | null = null
  let rematch = { mine: false, theirs: false }
  // Antes de la mesa: quién está listo, con qué se define quién empieza y cómo va, y el chat.
  let ready = { mine: false, theirs: false }
  let method: TossMethod | null = null
  let caller: Duelist | null = null
  let dice: { mine: number | null; theirs: number | null } = { mine: null, theirs: null }
  let chooser: Duelist | null = null
  let ordered = false
  let chat: ChatLine[] = []
  let chatId = 0
  let chatN = 0
  let watchers = 0

  // El lado del rival: lo último que le oí, para descartar repetidos y detectar lo que falta.
  let theirs: Mirror | null = null
  let peerSeq = 0
  let peerLifeN = 0
  let peerClockN = 0
  let peerGameN = 0
  let peerChatN = 0
  let awaitingSync = false

  const listeners = new Set<() => void>()
  let snapshot: DuelSnapshot

  const build = (): DuelSnapshot => ({ role, me, settings, peerPresent, peerName, incompatible, mine, initial, ownIds, actions, moves: actions.length, theirs, life, games, rps, starter, conceded, rematch, ready, opening: { method, caller, dice, chooser, ordered }, chat, watchers })

  const emit = () => {
    snapshot = build()
    listeners.forEach((listener) => listener())
  }

  const send = (message: DuelMessage) => transport.send(encodeMessage(message))

  const sendHello = () => send({ t: 'hello', v: PROTOCOL_VERSION, sid, role, name, ...(role === 'host' ? { settings } : {}) })

  /** Mi estado de ahora: la mesa (si ya empecé), mis puntos de vida y, del anfitrión, el reloj. */
  const sendSync = () => {
    const clock = { running: life.timer.running, elapsedMs: Math.round(timerElapsed(life.timer, now())) }
    let table: { n: number; state?: MatState; known: Record<string, string> } = { n: 0, known: {} }

    if (mine && sender) {
      const { opaque } = sender
      table = { n: actions.length, state: mapMatIds(mine, (id) => opaque[id] ?? id), known: senderKnown(sender) }
    }

    // Cómo va la tirada de quién empieza, para que un mensaje que se perdió (un celular en segundo plano) no la deje trabada.
    const opening: OpeningWire = ordered ? {} : { ...(method ? { method } : {}), ...(caller !== null ? { caller } : {}), ...(dice.mine !== null ? { die: dice.mine } : {}), ...(chooser !== null ? { chooser } : {}) }

    send({ t: 'sync', ...table, lp: life.lp[me], lifeN, ready: ready.mine, ...(ordered ? { order: starter } : {}), ...(Object.keys(opening).length > 0 ? { opening } : {}), ...(role === 'host' ? { clock } : {}) })

    // Lo mismo con la revancha que ya pedí.
    if (rematch.mine && !rematch.theirs) {
      gameN += 1
      send({ t: 'game', n: gameN, game: { kind: 'rematch' } })
    }

    // Si elegí en piedra-papel-tijera mientras el rival no estaba, mi elección se la mando de nuevo (repetirla no cambia nada del otro lado).
    if (rps.mine !== null) {
      gameN += 1
      send({ t: 'game', n: gameN, game: { kind: 'rps', pick: rps.mine } })
    }
  }

  const sendClock = () => {
    clockN += 1
    send({ t: 'clock', n: clockN, running: life.timer.running, elapsedMs: Math.round(timerElapsed(life.timer, now())) })
  }

  /** Me falta algo del rival: pido un `sync` (uno por vez hasta que llegue). */
  const requestSync = () => {
    if (!awaitingSync) {
      awaitingSync = true
      send({ t: 'resync' })
    }
  }

  /** Lo que un juego cambia (y deja en el registro) cuando lo hace `from`: el mismo efecto de los dos lados. */
  /** Se fija con qué se define quién empieza y quién lo eligió (y se empieza esa tirada de cero). */
  const setMethod = (next: TossMethod, by: Duelist) => {
    method = next
    caller = by
    dice = { mine: null, theirs: null }
    rps = { mine: null, theirs: null }
  }

  /** Un dado de la tirada que define quién empieza: con números iguales se vuelve a tirar (el primero que tira de nuevo borra los dos); si no, gana el más alto. */
  const rollDie = (from: Duelist, value: number) => {
    const tied = dice.mine !== null && dice.theirs !== null

    dice = from === me ? { mine: value, theirs: tied ? null : dice.theirs } : { mine: tied ? null : dice.mine, theirs: value }

    if (dice.mine !== null && dice.theirs !== null) {
      chooser = dieWinner(me === 0 ? dice.mine : dice.theirs, me === 0 ? dice.theirs : dice.mine)
    }
  }

  const applyGame = (from: Duelist, game: DuelGame) => {
    const mineNow = from === me
    const defining = ready.mine && ready.theirs && !ordered && chooser === null

    if (game.kind === 'toss') {
      // Sólo cuando los dos están listos y todavía no hay quien elija: el primero en elegir lo fija para los dos y, si eligen a la vez, vale el del anfitrión.
      if (!defining || method === game.method || (method !== null && from !== 0)) {
        return
      }

      setMethod(game.method, from)
    }

    // Al pedir la moneda que define quién empieza, gana quien acertó.
    if (game.kind === 'coin' && game.call !== undefined && defining && method === 'coin') {
      chooser = coinWinner(from, game.call, game.face)
    }

    if (game.kind === 'die' && defining && method === 'die') {
      rollDie(from, game.value)
    }

    if (game.kind === 'rps') {
      // Repetir la misma elección (al reconectar) no es una jugada nueva.
      if (game.pick !== null && (mineNow ? rps.mine : rps.theirs) === game.pick) {
        return
      }

      rps = game.pick === null ? { mine: null, theirs: null } : mineNow ? { ...rps, mine: game.pick } : { ...rps, theirs: game.pick }

      if (defining && method === 'rps') {
        const outcome = rpsOutcome(rps.mine, rps.theirs)

        if (outcome !== null && outcome !== 'draw') {
          chooser = outcome === 'win' ? me : peer
        }
      }

      // Empezar otra ronda no queda en el registro.
      if (game.pick === null) {
        return
      }
    }

    if (game.kind === 'order') {
      // La ronda de piedra-papel-tijera con que se definió no pasa al panel de juegos: ahí se empieza de cero.
      if (!ordered) {
        rps = { mine: null, theirs: null }
      }

      starter = game.first
      ordered = true
    }

    if (game.kind === 'concede') {
      // Rendirse dos veces no cuenta dos veces.
      if (conceded !== null) {
        return
      }

      conceded = from
    }

    if (game.kind === 'rematch') {
      if (mineNow ? rematch.mine : rematch.theirs) {
        return
      }

      rematch = mineNow ? { ...rematch, mine: true } : { ...rematch, theirs: true }
    }

    gameId += 1
    games = addGame(games, { id: gameId, from, game })

    // Los dos quieren la revancha: se empieza de cero (la mesa, los puntos de vida y el reloj), y cada uno vuelve a repartir su mano.
    if (rematch.mine && rematch.theirs) {
      // Quien perdió elige quién va primero, sin tirar nada (con un empate, se vuelve a definir).
      const result = duelResult(life.lp, conceded)

      chooser = result?.kind === 'loss' ? result.loser : null
      method = null
      caller = null
      dice = { mine: null, theirs: null }
      ordered = false
      initial = null
      actions = []
      mine = null
      sender = null
      ownIds = {}
      theirs = null
      peerSeq = 0
      lifeN = 0
      clockN = 0
      peerLifeN = 0
      peerClockN = 0
      awaitingSync = false
      life = { ...createLifeState(), lp: [settings.lp, settings.lp] }
      conceded = null
      rematch = { mine: false, theirs: false }
      rps = { mine: null, theirs: null }
    }
  }

  /** Un juego mío: se anota en mi registro y viaja. Con el rival ausente no se hace (no lo vería). */
  const playGame = (game: DuelGame) => {
    if (!peerPresent) {
      return
    }

    gameN += 1
    send({ t: 'game', n: gameN, game })
    applyGame(me, game)
    emit()
  }

  const setPeerLp = (lp: number) => {
    life = lifeReducer(life, { type: 'change', player: peer, delta: lp - life.lp[peer], now: now() })
  }

  const setClock = (running: boolean, elapsedMs: number) => {
    life = { ...life, timer: running ? { running: true, startedAt: now(), elapsedMs } : { running: false, startedAt: 0, elapsedMs } }
  }

  /** El rival empezó de cero (recargó la página): sus números vuelven a contar desde el principio. */
  const forgetPeer = () => {
    theirs = null
    peerSeq = 0
    peerLifeN = 0
    peerClockN = 0
    peerGameN = 0
    peerChatN = 0
    rps = { ...rps, theirs: null }
    rematch = { ...rematch, theirs: false }
    ready = { ...ready, theirs: false }
    awaitingSync = false

    // Lo que se estaba definiendo para empezar vuelve a empezar; si ya habían elegido, el rival se entera por mi `sync`.
    if (!ordered) {
      method = null
      caller = null
      dice = { mine: null, theirs: null }
      chooser = null
    }
  }

  const handle = (message: DuelMessage) => {
    switch (message.t) {
      case 'hello': {
        if (message.v !== PROTOCOL_VERSION || message.role === role) {
          incompatible = true
          return
        }

        incompatible = false

        if (peerSid !== message.sid) {
          forgetPeer()
          peerSid = message.sid
        }

        peerName = message.name

        if (message.settings) {
          settings = message.settings

          // Antes de tocar nada, los puntos de vida arrancan con lo que fijó el anfitrión.
          if (life.log.length === 0) {
            life = { ...life, lp: [settings.lp, settings.lp] }
          }
        }

        sendSync()
        return
      }

      case 'sync':
        if (message.state) {
          theirs = openMirror(message.state, message.known)
          peerSeq = message.n
        }

        peerLifeN = message.lifeN
        awaitingSync = false
        setPeerLp(message.lp)

        if (message.ready !== undefined) {
          ready = { ...ready, theirs: message.ready }
        }

        // Cómo iba su tirada de quién empieza: lo que yo no recibí (un mensaje perdido) lo tomo de acá. Con otro método, vale el del anfitrión.
        if (message.opening && ready.mine && ready.theirs && !ordered && chooser === null) {
          const theirsOpening = message.opening

          if (theirsOpening.method !== undefined && (method === null || (method !== theirsOpening.method && peer === 0))) {
            setMethod(theirsOpening.method, theirsOpening.caller ?? peer)
          }

          if (theirsOpening.die !== undefined && method === 'die' && dice.theirs !== theirsOpening.die) {
            rollDie(peer, theirsOpening.die)
          }

          if (theirsOpening.chooser !== undefined && chooser === null) {
            chooser = theirsOpening.chooser
          }
        }

        // Si el rival ya había elegido quién empieza (yo recargué), sigo desde ahí.
        if (message.order !== undefined && !ordered) {
          starter = message.order
          ordered = true
          ready = { mine: true, theirs: true }
        }

        if (message.clock && role === 'guest') {
          setClock(message.clock.running, message.clock.elapsedMs)
        }

        return

      case 'act':
        if (!theirs) {
          requestSync()
        } else if (message.n === peerSeq + 1) {
          theirs = mirrorApply(theirs, message.wire)
          peerSeq = message.n
        } else if (message.n > peerSeq) {
          requestSync()
        }

        return

      case 'undo':
        if (!theirs) {
          requestSync()
        } else if (message.n === peerSeq - 1 && theirs.acts.length > 0) {
          theirs = mirrorUndo(theirs)
          peerSeq = message.n
        } else if (message.n < peerSeq) {
          requestSync()
        }

        return

      case 'life':
        if (message.n > peerLifeN) {
          peerLifeN = message.n
          setPeerLp(message.lp)
        }

        return

      case 'clock':
        if (message.n > peerClockN) {
          peerClockN = message.n
          setClock(message.running, message.elapsedMs)
        }

        return

      case 'game':
        if (message.n > peerGameN) {
          peerGameN = message.n
          applyGame(peer, message.game)
        }

        return

      case 'ready':
        ready = { ...ready, theirs: message.ready }
        return

      case 'chat':
        if (message.n > peerChatN) {
          peerChatN = message.n
          chatId += 1
          chat = addChat(chat, { id: chatId, from: peer, text: message.text })
        }

        return

      case 'resync':
        sendSync()
    }
  }

  const stopMessages = transport.onMessage((text) => {
    const message = parseMessage(text)

    if (message) {
      handle(message)
      emit()
    }
  })

  const stopPeer = transport.onPeer((present) => {
    peerPresent = present
    awaitingSync = false

    if (present) {
      sendHello()
    }

    emit()
  })

  // Quien entra a mirar (o se perdió algo) pide que repita mi estado: mi saludo y mi mesa, que le llegan por el relay a los espectadores (y, repetidos, no le cambian nada al otro jugador).
  const stopWatchers = transport.onWatchers?.((count, needSync) => {
    watchers = count

    if (needSync) {
      sendHello()
      sendSync()
    }

    emit()
  })

  snapshot = build()

  return {
    getSnapshot: () => snapshot,

    subscribe(listener) {
      listeners.add(listener)
      return () => listeners.delete(listener)
    },

    start(table) {
      const open = openPublic(table)

      initial = table
      actions = []
      mine = table
      sender = open.sender
      ownIds = Object.fromEntries(Object.entries(open.sender.opaque).map(([real, opaque]) => [opaque, real]))
      sendSync()
      emit()
    },

    play(action) {
      if (!mine || !sender) {
        return
      }

      const sent = encodeAct(sender, mine, action)

      sender = sent.sender
      mine = matReducer(mine, action)
      actions = [...actions, action]
      send({ t: 'act', n: actions.length, wire: sent.wire })
      emit()
    },

    undo() {
      if (!initial || actions.length === 0) {
        return
      }

      actions = actions.slice(0, -1)
      mine = replayMat(initial, actions)
      send({ t: 'undo', n: actions.length })
      emit()
    },

    changeLife(delta) {
      const next = lifeReducer(life, { type: 'change', player: me, delta, now: now() })

      if (next !== life) {
        life = next
        lifeN += 1
        send({ t: 'life', n: lifeN, lp: life.lp[me] })
        emit()
      }
    },

    halveLife() {
      const next = lifeReducer(life, { type: 'halve', player: me, now: now() })

      if (next !== life) {
        life = next
        lifeN += 1
        send({ t: 'life', n: lifeN, lp: life.lp[me] })
        emit()
      }
    },

    toggleClock() {
      life = lifeReducer(life, { type: 'timer-toggle', now: now() })
      sendClock()
      emit()
    },

    throwCoin() {
      playGame({ kind: 'coin', face: random() < 0.5 ? 0 : 1 })
    },

    throwDie() {
      // Definiendo quién empieza se tira una vez por vuelta: ya tiré y el rival todavía no.
      if (method === 'die' && chooser === null && !ordered && dice.mine !== null && dice.theirs === null) {
        return
      }

      playGame({ kind: 'die', value: 1 + Math.floor(random() * 6) })
    },

    pickRps(pick) {
      // Una elección por ronda: cambiarla después de ver la del rival sería trampa.
      if (pick !== null && rps.mine !== null) {
        return
      }

      playGame({ kind: 'rps', pick })
    },

    concede() {
      playGame({ kind: 'concede' })
    },

    rematch() {
      playGame({ kind: 'rematch' })
    },

    chooseFirst(first) {
      playGame({ kind: 'order', first })
    },

    rename(next) {
      const clean = cleanName(next)

      if (clean !== '' && clean !== name) {
        name = clean
        sendHello()
      }
    },

    setReady(value) {
      if (ready.mine === value) {
        return
      }

      ready = { ...ready, mine: value }
      send({ t: 'ready', ready: value })
      emit()
    },

    chooseMethod(next) {
      playGame({ kind: 'toss', method: next })
    },

    callCoin(call) {
      playGame({ kind: 'coin', face: random() < 0.5 ? 0 : 1, call })
    },

    sendChat(text) {
      const line = cleanChat(text)

      if (line === '' || !peerPresent) {
        return
      }

      chatN += 1
      send({ t: 'chat', n: chatN, text: line })
      chatId += 1
      chat = addChat(chat, { id: chatId, from: me, text: line })
      emit()
    },

    close() {
      stopMessages()
      stopPeer()
      stopWatchers?.()
      listeners.clear()
      transport.close()
    },
  }
}
