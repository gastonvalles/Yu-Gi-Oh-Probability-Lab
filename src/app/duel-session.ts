import { addGame, type DuelGame, type GameEntry, type RpsPick, type SignalId } from './duel-games'
import { DEFAULT_SETTINGS, PROTOCOL_VERSION, cleanName, encodeMessage, parseMessage, type DuelMessage, type DuelSettings } from './duel-protocol'
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
  resetClock(): void
  throwCoin(): void
  throwDie(): void
  /** Elegir en piedra-papel-tijera (una vez por ronda); `null` empieza otra. */
  pickRps(pick: RpsPick | null): void
  chooseFirst(first: Duelist): void
  signal(signal: SignalId): void
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
  const name = cleanName(options.name)

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

  // El lado del rival: lo último que le oí, para descartar repetidos y detectar lo que falta.
  let theirs: Mirror | null = null
  let peerSeq = 0
  let peerLifeN = 0
  let peerClockN = 0
  let peerGameN = 0
  let awaitingSync = false

  const listeners = new Set<() => void>()
  let snapshot: DuelSnapshot

  const build = (): DuelSnapshot => ({ role, me, settings, peerPresent, peerName, incompatible, mine, initial, ownIds, actions, moves: actions.length, theirs, life, games, rps, starter, conceded, rematch })

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

    send({ t: 'sync', ...table, lp: life.lp[me], lifeN, ...(role === 'host' ? { clock } : {}) })

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
  const applyGame = (from: Duelist, game: DuelGame) => {
    const mineNow = from === me

    if (game.kind === 'rps') {
      // Repetir la misma elección (al reconectar) no es una jugada nueva.
      if (game.pick !== null && (mineNow ? rps.mine : rps.theirs) === game.pick) {
        return
      }

      rps = game.pick === null ? { mine: null, theirs: null } : mineNow ? { ...rps, mine: game.pick } : { ...rps, theirs: game.pick }

      // Empezar otra ronda no queda en el registro.
      if (game.pick === null) {
        return
      }
    }

    if (game.kind === 'order') {
      starter = game.first
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
    rps = { ...rps, theirs: null }
    rematch = { ...rematch, theirs: false }
    awaitingSync = false
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

    resetClock() {
      life = lifeReducer(life, { type: 'timer-reset' })
      sendClock()
      emit()
    },

    throwCoin() {
      playGame({ kind: 'coin', face: random() < 0.5 ? 0 : 1 })
    },

    throwDie() {
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

    signal(signal) {
      playGame({ kind: 'signal', signal })
    },

    close() {
      stopMessages()
      stopPeer()
      listeners.clear()
      transport.close()
    },
  }
}
