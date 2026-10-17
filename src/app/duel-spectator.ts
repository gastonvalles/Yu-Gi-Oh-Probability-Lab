import { addChat, addGame, type ChatLine, type DuelGame, type GameEntry } from './duel-games'
import { PROTOCOL_VERSION, parseMessage, type DuelMessage, type DuelSettings } from './duel-protocol'
import { sharedPhase, whoseTurn } from './duel-turn'
import type { Duelist, LifeTimer } from './life-calculator'
import { mirrorApply, mirrorUndo, openMirror, type Mirror } from './mat-public'
import type { MatPhase } from './practice-mat'

/**
 * Un duelo visto por un espectador: las dos mesas (cada una con los ids opacos y lo que su dueño mostró, igual que las ve el rival), los puntos de vida,
 * el reloj, el turno y la fase, el chat y lo que tiraron. Sólo mira: no manda nada (el relay lo desconectaría), salvo pedir que los jugadores repitan su estado
 * cuando llega o se le pierde algo (`requestSync`, que el relay deja pasar de a una cada dos segundos).
 *
 * Recibe el texto de los dos jugadores con quién lo mandó (0 o 1, lo asigna el relay); cuál es el anfitrión y cuál el invitado lo dice el saludo (`hello`) de cada uno.
 * Los lados se llevan por rol: 0 = anfitrión, 1 = invitado. Cada lado se lleva como el rival lo lleva del otro: un `sync` abre su mesa, las jugadas se aplican en orden y,
 * si falta alguna, se pide el estado de nuevo.
 */

/** Lo que se sabe de cada jugador. */
export interface SpectatorSide {
  name: string | null
  /** Su mesa, con ids opacos y lo que mostró; null hasta que llegue su estado. */
  mirror: Mirror | null
  /** Sus puntos de vida (null hasta saberlos). */
  lp: number | null
  /** Tocó "Estoy listo". */
  ready: boolean
}

/** Una línea del registro que ve quien mira: lo que escribieron los jugadores y lo que tiraron (moneda, dado, piedra-papel-tijera, quién empieza), en el orden en que pasó. */
export type FeedItem = { kind: 'chat'; line: ChatLine } | { kind: 'game'; entry: GameEntry }

/** Cuántas líneas del registro se guardan. */
export const MAX_FEED = 150

export interface SpectatorSnapshot {
  /** Los ajustes del duelo (puntos de vida y mano), del saludo del anfitrión. */
  settings: DuelSettings | null
  /** 0 = anfitrión, 1 = invitado. */
  sides: readonly [SpectatorSide, SpectatorSide]
  /** Cuántos jugadores hay conectados ahora. */
  players: number
  /** Quién empezó (0 = anfitrión, 1 = invitado), si ya se eligió. */
  starter: Duelist
  /** El reloj de la ronda (el que arma el anfitrión). */
  clock: LifeTimer
  games: readonly GameEntry[]
  chat: readonly ChatLine[]
  /** El chat y lo que tiraron, juntos y en orden (lo que se ve en la hoja del chat y en la pantalla de espera). */
  feed: readonly FeedItem[]
  /** Quién se rindió, si alguien lo hizo. */
  conceded: Duelist | null
  /** Las dos mesas ya llegaron: se puede mirar el duelo. */
  live: boolean
  /** De quién es el turno (0 = anfitrión, 1 = invitado) y en qué fase va, mientras haya mesas. */
  turn: Duelist | null
  phase: MatPhase | null
}

/** Lo que el espectador necesita de su conexión (el socket de verdad, o uno falso en las pruebas). */
export interface SpectatorTransport {
  onTagged(listener: (tag: 0 | 1, text: string) => void): () => void
  onPlayers(listener: (count: number) => void): () => void
  requestSync(): void
  close(): void
}

export interface Spectator {
  getSnapshot(): SpectatorSnapshot
  subscribe(listener: () => void): () => void
  close(): void
}

interface SpectatorOptions {
  /** Reloj del dispositivo (para las pruebas). */
  now?: () => number
}

/** Lo que se lleva por cada jugador además de lo que se muestra: de qué carga de página es y hasta qué mensaje llegó cada contador. */
interface Counters {
  sid: string | null
  seq: number
  lifeN: number
  clockN: number
  gameN: number
  chatN: number
}

const freshCounters = (): Counters => ({ sid: null, seq: 0, lifeN: 0, clockN: 0, gameN: 0, chatN: 0 })
const freshSide = (): SpectatorSide => ({ name: null, mirror: null, lp: null, ready: false })

/** Cada cuánto, como mucho, se pide el estado de nuevo (el relay también lo limita). */
const RESYNC_MS = 2500

export function createSpectator(transport: SpectatorTransport, options: SpectatorOptions = {}): Spectator {
  const now = options.now ?? Date.now

  let sides: [SpectatorSide, SpectatorSide] = [freshSide(), freshSide()]
  const counters: [Counters, Counters] = [freshCounters(), freshCounters()]
  /** Qué rol es cada etiqueta del relay (se sabe al recibir su saludo). */
  const roleOfTag: [Duelist | null, Duelist | null] = [null, null]
  let settings: DuelSettings | null = null
  let players = 0
  let starter: Duelist = 0
  let clock: LifeTimer = { running: false, startedAt: 0, elapsedMs: 0 }
  let games: GameEntry[] = []
  let gameId = 0
  let chat: ChatLine[] = []
  let chatId = 0
  let feed: FeedItem[] = []
  let conceded: Duelist | null = null
  const rematch: [boolean, boolean] = [false, false]
  let lastRequest = -Infinity

  const listeners = new Set<() => void>()
  let snapshot: SpectatorSnapshot

  const build = (): SpectatorSnapshot => {
    const [host, guest] = sides
    const live = host.mirror !== null && guest.mirror !== null
    const turn: Duelist | null = live ? (whoseTurn(0, host.mirror!.state, guest.mirror!.state, starter) === 'mine' ? 0 : 1) : null

    return {
      settings,
      sides,
      players,
      starter,
      clock,
      games,
      chat,
      feed,
      conceded,
      live,
      turn,
      phase: live && turn !== null ? (sharedPhase(turn === 0 ? 'mine' : 'theirs', host.mirror!.state, guest.mirror!.state) ?? null) : null,
    }
  }

  const emit = () => {
    snapshot = build()
    listeners.forEach((listener) => listener())
  }

  /** Falta algo (llegó una jugada que no sigue a la última, o de alguien que todavía no saludó): se pide el estado, sin insistir. */
  const requestSync = () => {
    if (now() - lastRequest >= RESYNC_MS) {
      lastRequest = now()
      transport.requestSync()
    }
  }

  const setSide = (role: Duelist, change: Partial<SpectatorSide>) => {
    sides = role === 0 ? [{ ...sides[0], ...change }, sides[1]] : [sides[0], { ...sides[1], ...change }]
  }

  const log = (from: Duelist, game: DuelGame) => {
    gameId += 1
    games = addGame(games, { id: gameId, from, game })
    feed = [...feed, { kind: 'game' as const, entry: games.at(-1)! }].slice(-MAX_FEED)
  }

  const applyGame = (from: Duelist, game: DuelGame) => {
    if (game.kind === 'rps' && game.pick === null) {
      return
    }

    if (game.kind === 'order') {
      starter = game.first
    }

    if (game.kind === 'concede') {
      if (conceded !== null) {
        return
      }

      conceded = from
    }

    if (game.kind === 'rematch') {
      if (rematch[from]) {
        return
      }

      rematch[from] = true
    }

    log(from, game)

    // Los dos quieren la revancha: se empieza de cero (las mesas nuevas llegan en sus `sync`).
    if (rematch[0] && rematch[1]) {
      rematch[0] = false
      rematch[1] = false
      conceded = null
    }
  }

  const handle = (tag: 0 | 1, message: DuelMessage) => {
    if (message.t === 'hello') {
      if (message.v !== PROTOCOL_VERSION) {
        return
      }

      const role: Duelist = message.role === 'host' ? 0 : 1

      roleOfTag[tag] = role

      // Otra carga de página de ese jugador (recargó): sus números vuelven a contar desde el principio.
      if (counters[role].sid !== message.sid) {
        counters[role] = { ...freshCounters(), sid: message.sid }
        setSide(role, { mirror: null, lp: null, ready: false })
      }

      setSide(role, { name: message.name })

      if (message.settings) {
        settings = message.settings
      }

      return
    }

    const role = roleOfTag[tag]

    // De alguien que todavía no saludó: no se sabe quién es. Se pide el estado para que salude.
    if (role === null) {
      requestSync()
      return
    }

    const mine = counters[role]
    const side = sides[role]

    switch (message.t) {
      case 'sync':
        if (message.state) {
          setSide(role, { mirror: openMirror(message.state, message.known) })
          mine.seq = message.n
        }

        mine.lifeN = message.lifeN
        setSide(role, { lp: message.lp, ...(message.ready === undefined ? {} : { ready: message.ready }) })

        // El reloj de la ronda es el del anfitrión.
        if (message.clock && role === 0) {
          clock = message.clock.running ? { running: true, startedAt: now(), elapsedMs: message.clock.elapsedMs } : { running: false, startedAt: 0, elapsedMs: message.clock.elapsedMs }
        }

        if (message.order !== undefined) {
          starter = message.order
        }

        return

      case 'act':
        if (!side.mirror) {
          requestSync()
        } else if (message.n === mine.seq + 1) {
          setSide(role, { mirror: mirrorApply(side.mirror, message.wire) })
          mine.seq = message.n
        } else if (message.n > mine.seq) {
          requestSync()
        }

        return

      case 'undo':
        if (!side.mirror) {
          requestSync()
        } else if (message.n === mine.seq - 1 && side.mirror.acts.length > 0) {
          setSide(role, { mirror: mirrorUndo(side.mirror) })
          mine.seq = message.n
        } else if (message.n < mine.seq) {
          requestSync()
        }

        return

      case 'life':
        if (message.n > mine.lifeN) {
          mine.lifeN = message.n
          setSide(role, { lp: message.lp })
        }

        return

      case 'clock':
        // Los dos pueden pausar o seguir el reloj: vale lo último que llegó de cualquiera.
        if (message.n > mine.clockN) {
          mine.clockN = message.n
          clock = message.running ? { running: true, startedAt: now(), elapsedMs: message.elapsedMs } : { running: false, startedAt: 0, elapsedMs: message.elapsedMs }
        }

        return

      case 'game':
        if (message.n > mine.gameN) {
          mine.gameN = message.n
          applyGame(role, message.game)
        }

        return

      case 'ready':
        setSide(role, { ready: message.ready })
        return

      case 'chat':
        if (message.n > mine.chatN) {
          mine.chatN = message.n
          chatId += 1
          chat = addChat(chat, { id: chatId, from: role, text: message.text })
          feed = [...feed, { kind: 'chat' as const, line: chat.at(-1)! }].slice(-MAX_FEED)
        }

        return

      case 'resync':
        return
    }
  }

  const stopTagged = transport.onTagged((tag, text) => {
    const message = parseMessage(text)

    if (message) {
      handle(tag, message)
      emit()
    }
  })

  const stopPlayers = transport.onPlayers((count) => {
    players = count

    // Sin jugadores no hay quien mande el estado: lo que se muestra queda como estaba hasta que vuelvan.
    emit()
  })

  snapshot = build()

  return {
    getSnapshot: () => snapshot,

    subscribe(listener) {
      listeners.add(listener)
      return () => listeners.delete(listener)
    },

    close() {
      stopTagged()
      stopPlayers()
      listeners.clear()
      transport.close()
    },
  }
}
