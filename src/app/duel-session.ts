import type { DuelSave } from './duel-save'
import { addChat, addGame, advanceSeries, cleanChat, coinWinner, dieWinner, duelFinished, duelResult, rpsOutcome, type ChatLine, NEW_SERIES, seriesScore, type DuelGame, type GameEntry, type Series, type RpsPick, type TossMethod } from './duel-games'
import { RateLimiter } from './duel-relay-rules'
import { DEFAULT_SETTINGS, MAX_MARKS, NO_MARKS, PROTOCOL_VERSION, cleanName, encodeMessage, parseMessage, type DuelMessage, type DuelSettings, type MarkTarget, type Marks, type OpeningWire } from './duel-protocol'
import { createLifeState, lifeReducer, timerElapsed, type Duelist, type LifeState } from './life-calculator'
import { CONTROL_ACTIONS, controlReactions } from './mat-control'
import { encodeAct, mapMatIds, mirrorApply, mirrorUndo, openMirror, openPublic, senderKnown, type Mirror, type PublicSender } from './mat-public'
import { allMatIds, locateCard, matReducer, replayMat, type MatAction, type MatPile, type MatState } from './practice-mat'

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
  /** Tirar la conexión de ahora y abrir otra ya (sin esperar el reintento): así el relay vuelve a decir si el rival está. Una sala en memoria no la necesita. */
  reconnect?(): void
  /** El duelo terminó y no queda nada que hacer en la sala: cerrar la conexión avisándole al relay que se la da por terminada (la corta para todos y no deja entrar a nadie). Sin esto, `close`. */
  endRoom?(): void
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
  /** Cómo va el Match (si la sala es un Match): el marcador con el duelo de ahora sumado, el número del duelo y quién ganó el Match, si ya lo ganó alguien. */
  series: { match: boolean; game: number; wins: readonly [number, number]; winner: Duelist | null }
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
  /**
   * El permiso para volver atrás una jugada: `asking`, pedí deshacer la mía y espero la respuesta del rival; `asked`, el rival pide deshacer la suya y tengo que contestar;
   * `result`, cómo terminó mi último pedido si no se permitió (`n` cuenta los resultados, para avisar una sola vez cada uno).
   */
  undo: { asking: boolean; asked: boolean; result: { n: number; kind: 'denied' | 'expired' } | null; /** Mi última jugada cambió el control de un monstruo: la otra mesa ya la completó y no se puede deshacer. */ blocked: boolean }
  /** Lo marcado como objetivo: `mine`, lo que el rival marcó de mi lado (con mis ids reales); `theirs`, lo que yo marqué del suyo (con los ids que él les dio). */
  marks: { mine: Marks; theirs: Marks }
  /**
   * Lo último que alguien señaló (el rival o yo), para mostrarlo un rato: `side` es de qué lado de MI pantalla está (`mine` o `theirs`) y la carta, con los ids de ese lado (los reales si es mío;
   * los que él les dio si es suyo). `n` cuenta los avisos (cambia con cada uno, aunque señale lo mismo). No es estado de la mesa: no se guarda ni se repone.
   */
  ping: { n: number; side: 'mine' | 'theirs'; card?: string; pile?: MatPile } | null
}

export interface Duel {
  getSnapshot(): DuelSnapshot
  subscribe(listener: () => void): () => void
  /** Mi mesa de arranque (deck mezclado y mano repartida); se la mando al rival ya enmascarada. */
  start(initial: MatState): void
  play(action: MatAction): void
  /** Volver atrás mi última jugada: si el rival está, primero se le pide permiso (si lo permite, se deshace; si no, no). */
  undo(): void
  /** Contestar el pedido del rival de volver atrás su jugada. */
  answerUndo(allow: boolean): void
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
  /** Marcar (o desmarcar) como objetivo algo del lado del rival: una carta suya (por el id que él le dio) o una de sus pilas, la mano incluida. Él lo ve en lo suyo. */
  toggleMark(target: MarkTarget): void
  /** Señalar algo un instante, de mi lado (`mine`: una carta mía a la vista) o del suyo (`theirs`): los dos lo ven un rato y nada más (no cambia la mesa ni queda en las jugadas). */
  ping(target: MarkTarget, at: 'mine' | 'theirs'): void
  /** Volver a conectarme a la sala ya: lo que sigue en pausa por un aviso que no llegó se resuelve sin salir del duelo. */
  reconnect(): void
  /** Dar la sala por terminada (el duelo acabó y el rival se fue): se cierra del todo, para todos. */
  endRoom(): void
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
  /** Mi mesa guardada de antes de recargar la página: se sigue desde ahí en vez de repartir de nuevo. */
  restore?: DuelSave
}

/** Cuánto espera mi pedido de volver atrás una respuesta del rival antes de cancelarse. */
const UNDO_WAIT_MS = 30_000
/** Cuánto dura un objetivo que marqué del lado del rival: pasado el plazo se quita solo (en los dos lados). */
const MARK_MS = 5000
/**
 * Cuánto repito mi saludo y mi mesa porque entró un espectador: una ráfaga de `WATCHER_SYNC_BURST` seguidas (entra uno y pide el estado de nuevo) y después una cada `WATCHER_SYNC_MS`.
 * Un espectador que entra y sale a toda velocidad no me hace mandar mi estado sin parar (y el relay, que cuenta mis mensajes, no me corta).
 */
const WATCHER_SYNC_MS = 2000
const WATCHER_SYNC_BURST = 3

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
  /** Un tercero ocupó el lugar del rival cuando el duelo ya terminó: no es quien jugó, y no se le manda nada (ni mi mesa) ni se lo cuenta como rival. */
  let stranger = false
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
  let series: Series = NEW_SERIES
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
  // Lo que se señala: los míos (para no repetir uno), el último que le oí y el último que se muestra (el mío o el suyo). Nada de esto se guarda ni se repone.
  let pingN = 0
  let pingAt = 0
  let pingSeq = 0
  let lastPing: DuelSnapshot['ping'] = null
  // Los objetivos que cada uno marcó del lado del otro. Lo que marqué yo lo repongo cuando el otro vuelve (viaja con mi `sync`); lo suyo llega con su mensaje.
  let marksOnMine: Marks = NO_MARKS
  let marksOnTheirs: Marks = NO_MARKS
  /** Cómo estaba cada cosa que marqué cuando la marqué (`c:<id>` / `p:<pila>`): una marca dura mientras eso siga igual. */
  let markSigns: Record<string, string> = {}
  /** Mis puntos de vida vienen de lo guardado: el saludo del anfitrión no los pisa con los de arranque. */
  let lpRestored = false
  /** Las veces que puedo repetir mi estado porque entró un espectador (ver `WATCHER_SYNC_MS`). */
  const watcherSyncs = new RateLimiter(now(), 1000 / WATCHER_SYNC_MS, WATCHER_SYNC_BURST)
  // El permiso para volver atrás: mi pedido en curso (su número y su reloj de espera), el que me hace el rival y cómo terminó el último que no se permitió.
  let undoAskN = 0
  let undoAsking: number | null = null
  let undoTimer: ReturnType<typeof setTimeout> | null = null
  let undoAsked: number | null = null
  let undoResult: { n: number; kind: 'denied' | 'expired' } | null = null

  // El lado del rival: lo último que le oí, para descartar repetidos y detectar lo que falta.
  let theirs: Mirror | null = null
  let peerSeq = 0
  let peerLifeN = 0
  let peerClockN = 0
  let peerGameN = 0
  let peerChatN = 0
  let peerPingN = 0
  let awaitingSync = false

  const listeners = new Set<() => void>()
  let snapshot: DuelSnapshot

  const seriesView = (): DuelSnapshot['series'] => {
    const score = seriesScore(series, settings.match ? duelResult(life.lp, conceded) : null)

    return { match: settings.match, game: series.played + 1, wins: score.wins, winner: settings.match ? score.winner : null }
  }

  const build = (): DuelSnapshot => ({ role, me, settings, peerPresent: peerPresent && !stranger, peerName, incompatible, mine, initial, ownIds, actions, moves: actions.length, theirs, life, games, rps, starter, conceded, series: seriesView(), rematch, ready, opening: { method, caller, dice, chooser, ordered }, chat, watchers, undo: { asking: undoAsking !== null, asked: undoAsked !== null, result: undoResult, blocked: lastIsControl() }, marks: { mine: marksOnMine, theirs: marksOnTheirs }, ping: lastPing })

  const emit = () => {
    snapshot = build()
    listeners.forEach((listener) => listener())
  }

  /** El duelo terminó para siempre: uno solo, o un Match ya ganado. Nadie tiene nada más que hacer en la sala. */
  const finishedForGood = () => {
    const result = duelResult(life.lp, conceded)

    return duelFinished(result, settings.match, seriesScore(series, result).winner)
  }

  const send = (message: DuelMessage) => {
    if (!stranger) transport.send(encodeMessage(message))
  }

  const sendHello = () => send({ t: 'hello', v: PROTOCOL_VERSION, sid, role, name, ...(role === 'host' ? { settings } : {}) })

  /**
   * Dónde está una carta del rival (su casilla o su pila) o qué tiene una de sus pilas, para saber si lo marcado sigue como estaba. Una marca es de ESA carta
   * en ESE lugar (o de esa pila con ESAS cartas): si se mueve o la pila cambia, el objetivo ya no es el mismo y deja de verse (en los dos lados).
   */
  const signOf = (table: MatState, target: MarkTarget): string => {
    if ('pile' in target) {
      return `p:${target.pile}:${table[target.pile].join(',')}`
    }

    const where = locateCard(table, target.card)

    return where === null ? 'ausente' : where.kind === 'spot' ? `s:${where.spot}:${where.index}` : where.kind === 'pile' ? `p:${where.pile}` : `m:${where.of}`
  }

  /** Todo lo que tengo marcado del lado del rival (siempre el conjunto entero). */
  const sendMarks = () => send({ t: 'marks', cards: [...marksOnTheirs.cards], piles: [...marksOnTheirs.piles] })

  /** Quita lo que marqué del rival y ya no está como estaba (la carta se fue de ahí, la pila cambió) y se lo avisa al otro. */
  const pruneMarks = () => {
    if (!theirs || (marksOnTheirs.cards.length === 0 && marksOnTheirs.piles.length === 0)) {
      return
    }

    const table = theirs.state
    const cards = marksOnTheirs.cards.filter((id) => markSigns[`c:${id}`] === signOf(table, { card: id }))
    const piles = marksOnTheirs.piles.filter((pile) => markSigns[`p:${pile}`] === signOf(table, { pile }))

    if (cards.length !== marksOnTheirs.cards.length || piles.length !== marksOnTheirs.piles.length) {
      marksOnTheirs = { cards, piles }
      sendMarks()
    }
  }

  const markKey = (target: MarkTarget) => ('card' in target ? `c:${target.card}` : `p:${target.pile}`)
  const markTimers = new Map<string, ReturnType<typeof setTimeout>>()

  /** Quita un objetivo que marqué (si sigue marcado) y se lo avisa al otro: lo usa tanto el toque que lo desmarca como su plazo. */
  const dropMark = (target: MarkTarget) => {
    const key = markKey(target)
    clearTimeout(markTimers.get(key))
    markTimers.delete(key)

    if ('card' in target ? !marksOnTheirs.cards.includes(target.card) : !marksOnTheirs.piles.includes(target.pile)) {
      return
    }

    marksOnTheirs = 'card' in target ? { ...marksOnTheirs, cards: marksOnTheirs.cards.filter((id) => id !== target.card) } : { ...marksOnTheirs, piles: marksOnTheirs.piles.filter((pile) => pile !== target.pile) }
    sendMarks()
    emit()
  }

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

    send({ t: 'sync', ...table, lp: life.lp[me], lifeN, ready: ready.mine, ...(ordered ? { order: starter } : {}), ...(Object.keys(opening).length > 0 ? { opening } : {}), ...(settings.match ? { series } : {}), ...(role === 'host' ? { clock } : {}) })

    // Lo que marqué de su lado se repone junto con mi mesa (si recargó, no se acuerda).
    if (marksOnTheirs.cards.length > 0 || marksOnTheirs.piles.length > 0) {
      sendMarks()
    }

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

      if (settings.match) {
        series = advanceSeries(series, result)
      }

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
      marksOnMine = NO_MARKS
      marksOnTheirs = NO_MARKS
      markSigns = {}
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

  /** Mi última jugada pasó un monstruo de una mesa a la otra: no se deshace (la otra mesa ya la completó por su cuenta). */
  const lastIsControl = () => {
    const last = actions.at(-1)

    return last !== undefined && CONTROL_ACTIONS.has(last.type)
  }

  /** Juega una jugada en mi mesa y se la cuenta al rival (la usan `play` y las respuestas automáticas del control de un monstruo). */
  const commit = (action: MatAction) => {
    if (!mine || !sender) {
      return
    }

    const sent = encodeAct(sender, mine, action)

    sender = sent.sender
    mine = matReducer(mine, action)
    actions = [...actions, action]
    send({ t: 'act', n: actions.length, wire: sent.wire })
  }

  /** Deshace mi última jugada y se lo cuenta al rival. */
  const applyUndo = () => {
    if (!initial || actions.length === 0 || lastIsControl()) {
      return
    }

    actions = actions.slice(0, -1)
    mine = replayMat(initial, actions)
    send({ t: 'undo', n: actions.length })
  }

  /** Dejo de esperar la respuesta a mi pedido de volver atrás (si le había preguntado al rival, se lo aviso: su cartel se va). */
  const dropUndoAsk = (notify: boolean) => {
    if (undoAsking === null) {
      return
    }

    if (undoTimer !== null) {
      clearTimeout(undoTimer)
      undoTimer = null
    }

    if (notify) {
      send({ t: 'undoCancel', id: undoAsking })
    }

    undoAsking = null
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

  /**
   * El rival empezó de cero (recargó la página): sus números vuelven a contar desde el principio. Su mesa de antes se sigue mostrando hasta que llegue la nueva
   * (en cuanto me salude me la manda): si no, a quien no recargó se le cerraría la mesa un instante y se le volvería a repartir la mano.
   */
  const forgetPeer = () => {
    undoAsked = null
    dropUndoAsk(false)
    peerSeq = 0
    peerLifeN = 0
    peerClockN = 0
    peerGameN = 0
    peerChatN = 0
    peerPingN = 0
    marksOnMine = NO_MARKS
    // (lo que yo marqué de su lado se queda: sus ids opacos no cambian al recargar con su mesa guardada, y se le repone con mi `sync`)
    // Una ronda terminada no se le repite al que vuelve (le diría que el rival "ya eligió"); una a medias sí, para que la pueda terminar.
    rps = rps.theirs !== null ? { mine: null, theirs: null } : rps
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

        // Terminado el duelo, quien llega con otra identidad no es el rival que se fue (que volvería con la suya): no se le cuenta nada de mi mesa.
        if (peerSid !== null && message.sid !== peerSid && finishedForGood()) {
          stranger = true
          return
        }

        incompatible = false

        if (peerSid !== message.sid) {
          forgetPeer()
          peerSid = message.sid
        }

        peerName = message.name

        // Los ajustes (puntos de vida y mano de arranque) son del anfitrión: un saludo de invitado que los traiga no los cambia.
        if (message.settings && message.role === 'host') {
          settings = message.settings

          // Antes de tocar nada, los puntos de vida arrancan con lo que fijó el anfitrión.
          if (life.log.length === 0 && !lpRestored) {
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
          pruneMarks()
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

        // Cómo va el Match: lo toma de acá quien se perdió algún duelo (recargó); un marcador viejo nunca pisa a uno más nuevo.
        if (message.series && settings.match && message.series.played > series.played) {
          series = message.series
        }

        if (message.clock && role === 'guest') {
          setClock(message.clock.running, message.clock.elapsedMs)
        }

        return

      case 'act':
        if (!theirs) {
          requestSync()
        } else if (message.n === peerSeq + 1) {
          const previous = theirs.state

          theirs = mirrorApply(theirs, message.wire)
          peerSeq = message.n
          pruneMarks()

          // Si cambió de manos un monstruo, mi mesa lo completa sola (tomarlo, soltarlo o recibirlo de vuelta).
          if (mine && sender) {
            for (const reaction of controlReactions({ mine, ownIds, before: previous, after: theirs.state, action: message.wire.action })) {
              commit(reaction)
            }
          }
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
          pruneMarks()
        } else if (message.n < peerSeq) {
          requestSync()
        }

        return

      case 'undoAsk':
        undoAsked = message.id
        return

      case 'undoAnswer':
        // Sólo vale la respuesta a mi pedido de ahora: una vieja (cancelado, o ya jugué otra cosa) no deshace nada.
        if (message.id === undoAsking) {
          dropUndoAsk(false)

          if (message.ok) {
            applyUndo()
          } else {
            undoResult = { n: (undoResult?.n ?? 0) + 1, kind: 'denied' }
          }
        }

        return

      case 'undoCancel':
        if (undoAsked === message.id) {
          undoAsked = null
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

      case 'ping': {
        if (message.n <= peerPingN) {
          return
        }

        peerPingN = message.n

        if (message.at === 'yours') {
          // Algo de mi lado: su id opaco se vuelve mi carta real (si no es mía, no cuenta).
          const real = message.card === undefined ? undefined : ownIds[message.card]

          if (message.card !== undefined && real === undefined) {
            return
          }

          pingSeq += 1
          lastPing = { n: pingSeq, side: 'mine', ...(real !== undefined ? { card: real } : { pile: message.pile! }) }
          return
        }

        // Algo de su lado: una carta sólo si está a la vista en su campo (la de su mano no se señala: no se sabe cuál es), o una pila.
        const where = message.card === undefined || !theirs ? null : locateCard(theirs.state, message.card)

        if (!theirs || (message.card !== undefined && where?.kind !== 'spot')) {
          return
        }

        pingSeq += 1
        lastPing = { n: pingSeq, side: 'theirs', ...(message.card !== undefined ? { card: message.card } : { pile: message.pile! }) }
        return
      }

      case 'marks':
        // Sus ids opacos se vuelven mis cartas reales; los que no son míos no cuentan.
        marksOnMine = { cards: message.cards.flatMap((id) => (ownIds[id] === undefined ? [] : [ownIds[id]!])), piles: message.piles }
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

    // Si el lugar quedó libre, el tercero se fue: el siguiente que llegue se vuelve a mirar.
    if (!present) stranger = false
    // Un pedido de volver atrás no sobrevive a que el otro salga o vuelva.
    undoAsked = null
    dropUndoAsk(false)

    if (present) {
      sendHello()
    }

    emit()
  })

  // Quien entra a mirar (o se perdió algo) pide que repita mi estado: mi saludo y mi mesa, que le llegan por el relay a los espectadores (y, repetidos, no le cambian nada al otro jugador).
  const stopWatchers = transport.onWatchers?.((count, needSync) => {
    watchers = count

    // Quien entra a mirar se pone al día con lo que ya llegó o lo pide de nuevo (el relay le deja pedirlo seguido): no hace falta repetir lo mío más de una vez cada tanto.
    if (needSync && watcherSyncs.allow(now())) {
      sendHello()
      sendSync()
    }

    emit()
  })

  // Volví a abrir la página en pleno duelo: la mesa se arma de nuevo con las mismas jugadas (si lo guardado no sirve, se ignora y se reparte otra).
  if (options.restore) {
    try {
      const saved = options.restore
      const open = openPublic(saved.initial)
      let table = saved.initial
      let tracker = open.sender

      for (const action of saved.actions) {
        tracker = encodeAct(tracker, table, action).sender
        table = matReducer(table, action)
      }

      initial = saved.initial
      actions = [...saved.actions]
      mine = table
      sender = tracker
      ownIds = Object.fromEntries(Object.entries(open.sender.opaque).map(([real, opaque]) => [opaque, real]))
      const elapsed = Math.round(timerElapsed(saved.timer, saved.savedAt))

      life = { ...life, lp: me === 0 ? [saved.lp, life.lp[1]] : [life.lp[0], saved.lp], timer: saved.timer.running ? { running: true, startedAt: now(), elapsedMs: elapsed } : { running: false, startedAt: 0, elapsedMs: elapsed } }
      lpRestored = true
      starter = saved.starter
      ordered = true
      ready = { mine: true, theirs: true }
      conceded = saved.conceded ?? null
      rematch = { mine: saved.rematch === true, theirs: false }
    } catch {
      initial = null
      actions = []
      mine = null
      sender = null
      ownIds = {}
    }
  }

  snapshot = build()

  /** Cierra todo: deja de escuchar y suelta la conexión; con `endRoom`, avisándole al relay que la sala se da por terminada (se cierra para todos). */
  const shutdown = (endRoom: boolean) => {
    markTimers.forEach((timer) => clearTimeout(timer))
    markTimers.clear()
    dropUndoAsk(false)
    stopMessages()
    stopPeer()
    stopWatchers?.()
    listeners.clear()

    if (endRoom && transport.endRoom) {
      transport.endRoom()
    } else {
      transport.close()
    }
  }

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

      // Si estaba esperando permiso para volver atrás, hacer otra jugada lo cancela (el permiso sería para otra jugada que la que se quería deshacer).
      dropUndoAsk(true)

      commit(action)
      emit()
    },

    undo() {
      if (!initial || actions.length === 0 || undoAsking !== null || lastIsControl()) {
        return
      }

      // Solo en la sala no hay a quién pedirle permiso; con el rival ahí, se le pregunta y se deshace si lo permite.
      if (!peerPresent) {
        applyUndo()
        emit()
        return
      }

      undoAskN += 1

      const id = undoAskN

      undoAsking = id
      send({ t: 'undoAsk', id })
      undoTimer = setTimeout(() => {
        if (undoAsking === id) {
          dropUndoAsk(true)
          undoResult = { n: (undoResult?.n ?? 0) + 1, kind: 'expired' }
          emit()
        }
      }, UNDO_WAIT_MS)
      emit()
    },

    answerUndo(allow) {
      if (undoAsked === null) {
        return
      }

      send({ t: 'undoAnswer', id: undoAsked, ok: allow })
      undoAsked = null
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

    reconnect() {
      transport.reconnect?.()
    },

    ping(target, at) {
      // Sin rival no hay a quién señalarle nada; y una carta, sólo si está a la vista en el campo de ese lado (no se señala la mano ni el deck de nadie). Uno cada 300 ms como mucho.
      if (!peerPresent || now() - pingAt < 300) {
        return
      }

      if ('card' in target) {
        const state = at === 'mine' ? mine : theirs?.state

        if (!state || locateCard(state, target.card)?.kind !== 'spot' || (at === 'mine' && !sender)) {
          return
        }
      } else if (at === 'theirs' && !theirs) {
        return
      }

      pingAt = now()
      pingN += 1
      // Mi carta viaja con su id opaco (la identidad nunca viaja en un aviso); lo suyo, con el id que él le dio.
      const card = 'card' in target ? (at === 'mine' ? (sender!.opaque[target.card] ?? target.card) : target.card) : undefined

      send({ t: 'ping', n: pingN, at: at === 'mine' ? 'mine' : 'yours', ...(card !== undefined ? { card } : { pile: (target as { pile: MatPile }).pile }) })
      pingSeq += 1
      lastPing = { n: pingSeq, side: at, ...target }
      emit()
    },

    toggleMark(target) {
      // Sin rival y sin su mesa no hay a qué marcarle nada; y no se marca lo que no es suyo.
      if (!peerPresent || !theirs) {
        return
      }

      const key = markKey(target)

      // Tocar un objetivo que ya está marcado lo quita.
      if ('card' in target ? marksOnTheirs.cards.includes(target.card) : marksOnTheirs.piles.includes(target.pile)) {
        dropMark(target)
        return
      }

      if ('card' in target) {
        if (marksOnTheirs.cards.length >= MAX_MARKS || !allMatIds(theirs.state).includes(target.card)) {
          return
        }

        marksOnTheirs = { ...marksOnTheirs, cards: [...marksOnTheirs.cards, target.card] }
      } else {
        marksOnTheirs = { ...marksOnTheirs, piles: [...marksOnTheirs.piles, target.pile] }
      }

      markSigns = { ...markSigns, [key]: signOf(theirs.state, target) }

      sendMarks()
      emit()
      clearTimeout(markTimers.get(key))
      markTimers.set(key, setTimeout(() => dropMark(target), MARK_MS))
    },

    endRoom() {
      shutdown(true)
    },

    close() {
      shutdown(false)
    },
  }

}
