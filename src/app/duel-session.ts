import type { DuelSave } from './duel-save'
import { addChat, addGame, advanceSeries, cleanChat, coinWinner, dieWinner, duelFinished, duelResult, rpsOutcome, type ChatLine, NEW_SERIES, seriesScore, type DuelGame, type GameEntry, type Series, type RpsPick, type TossMethod } from './duel-games'
import { freshTurnClock, runTurnClock, setTurnBank, startTurn, turnTimeLeft, type TurnClock } from './duel-clock'
import { RateLimiter } from './duel-relay-rules'
import { DEFAULT_SETTINGS, MAX_MARKS, NO_MARKS, type Activity, PROTOCOL_VERSION, cleanName, encodeMessage, parseMessage, type DuelMessage, type DuelSettings, type MarkTarget, type Marks, type OpeningWire } from './duel-protocol'
import { duelTurnNumber, whoseTurn } from './duel-turn'
import { createLifeState, lifeReducer, timerElapsed, type Duelist, type LifeState } from './life-calculator'
import { isEmojiSignal } from './duel-signals'
import { CONTROL_ACTIONS, controlReactions } from './mat-control'
import { encodeAct, mapMatIds, mirrorApply, mirrorUndo, openMirror, openPublic, senderKnown, type Mirror, type PublicSender } from './mat-public'
import { allMatIds, locateCard, matReducer, replayMat, type MatAction, type MatPhase, type MatPile, type MatState } from './practice-mat'

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
  /** Esa rendición fue porque se le acabó el tiempo del reloj de turnos. */
  timeUp: boolean
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
  /** El reloj de turnos (5 minutos por jugador y 2 más cada vez que el rival pasa el turno): público, lo que le queda a cada uno sale de `turnTimeLeft`. */
  turnClock: TurnClock
  /** Lo que el rival está haciendo y se ve (mira una pila, elige cómo jugar una carta); null si nada. */
  peerLook: Activity | null
  /** Lo que se escribieron los dos, de más viejo a más nuevo. */
  chat: readonly ChatLine[]
  /** Cuándo (reloj del dispositivo, en ms) puedo mandar otra señal rápida (🤔, 👍): una cada `EMOTE_GAP_MS`, para que nadie las spamee. 0 si todavía no mandé ninguna. */
  emoteReadyAt: number
  /** Cuántos espectadores están mirando (hasta dos): sólo miran, no pueden hacer nada. */
  watchers: number
  /**
   * Deshacer vuelve atrás la última jugada de la mesa, sea de quien sea, y antes se le pide permiso al rival: `asking`, pedí deshacerla y espero la respuesta; `asked`, el rival pide deshacerla y tengo que contestar;
   * `result`, cómo terminó mi último pedido si no se permitió (`n` cuenta los resultados, para avisar una sola vez cada uno); `available`, hay una jugada que deshacer (la última de los dos).
   */
  undo: { asking: boolean; asked: boolean; result: { n: number; kind: 'denied' | 'expired' } | null; available: boolean; /** La última jugada cambió el control de un monstruo: la otra mesa ya la completó y no se puede deshacer. */ blocked: boolean }
  /**
   * Pasar de fase le pregunta al rival si no va a hacer nada más en la que se deja: `asking`, la fase a la que quiero pasar y espero la respuesta; `asked`, la fase a la que el rival quiere pasar (y si es terminar su turno)
   * y tengo que contestar; `result`, las veces que el rival me pidió jugar antes (`n` cuenta, para avisar una sola vez cada una).
   */
  pass: { asking: MatPhase | null; asked: { phase: MatPhase; endsTurn: boolean } | null; result: { n: number } | null }
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
  /** Pasar de fase (con el turno mío): si el rival está, primero se le pregunta si no va a hacer nada más en la fase que dejo; pasa si dice que sí o si no contesta a tiempo (`PHASE_WAIT_MS`), y no si quiere jugar antes. */
  askPhase(action: Extract<MatAction, { type: 'phase' }>): void
  /** Contestar la pregunta del rival: `true`, dejarlo pasar; `false`, voy a jugar antes. */
  answerPhase(allow: boolean): void
  /** Volver atrás la última jugada de la mesa, sea mía o del rival: si el rival está, primero se le pide permiso (si lo permite, se deshace; si no, no). */
  undo(): void
  /** Contestar el pedido del rival de volver atrás la última jugada. */
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
  /** Lo que estoy haciendo y el rival ve (mirar mi deck, mi Extra Deck…), o `null` si nada. Sólo comunica; repetir lo mismo no manda nada. */
  look(at: Activity | null): void
  /** Pedir la revancha (o aceptarla si el rival la pidió). */
  rematch(): void
  /** Marcar (o desmarcar) como objetivo algo del lado del rival: una carta suya (por el id que él le dio) o una de sus pilas, la mano incluida. Él lo ve en lo suyo. */
  toggleMark(target: MarkTarget): void
  /** Marcar varias cartas de su lado de una vez: un solo aviso y un solo plazo para las que se marcan (vencen juntas). Si ya estaban todas, las quita. Lo que no entra en el tope (`MAX_MARKS`) no se marca. */
  markMany(ids: readonly string[]): void
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
/** Cuánto espero la respuesta del rival a si no va a hacer nada más antes de pasar de fase: sin respuesta, la fase pasa (callar es no tener nada que jugar). */
export const PHASE_WAIT_MS = 6000
/** De quién es una jugada de la mesa, vista desde acá. */
type Mover = 'me' | 'peer'
/** Quién deshace: `push`, quien pide (la última jugada es suya); `pull`, quien contesta. */
type UndoKind = 'push' | 'pull'
/** Cada cuánto puedo mandar una señal rápida (un emote: 🤔, 👍): las que lleguen antes no salen. */
export const EMOTE_GAP_MS = 3000
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
  /** Quien está en el lugar del rival ya se anunció con su saludo (sin eso, terminado el duelo, todavía no se sabe si es el rival que volvió o un tercero). */
  let peerGreeted = false
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
  let concededOnTime = false
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
  let emoteAt: number | null = null
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
  // Pasar de fase: mi pregunta en curso (su número, la jugada que espera y su reloj), la que me hace el rival y las veces que me pidió jugar antes.
  let phaseAskN = 0
  let phaseAsking: { id: number; action: Extract<MatAction, { type: 'phase' }> } | null = null
  let phaseTimer: ReturnType<typeof setTimeout> | null = null
  let phaseAsked: { id: number; phase: MatPhase; endsTurn: boolean } | null = null
  let phaseResult: { n: number } | null = null
  // Con `push` la jugada a deshacer es de quien pide; con `pull`, de quien contesta (la última de la mesa es suya).
  let undoAskingKind: UndoKind = 'push'
  let undoAskedKind: UndoKind = 'push'
  // Quién hizo cada jugada de la mesa, en el orden en que pasaron: Deshacer vuelve atrás la última de cualquiera (ver `playOrder`).
  let order: Mover[] = []

  // El lado del rival: lo último que le oí, para descartar repetidos y detectar lo que falta.
  let theirs: Mirror | null = null
  let peerSeq = 0
  let peerLifeN = 0
  let peerClockN = 0
  let peerGameN = 0
  let peerChatN = 0
  let peerPingN = 0
  let awaitingSync = false
  // El reloj de turnos (ver `duel-clock.ts`): en qué turno lo vio por última vez (null hasta que hay dos mesas) y, si llegó antes que las mesas, lo que el rival tenía anotado.
  let turnClock: TurnClock = freshTurnClock()
  let clockTurnNo: number | null = null
  let clockOwner: Duelist = 0
  let pendingBanks: readonly [number, number] | null = null
  // Lo que hace cada uno y se ve (mirar una pila, elegir cómo jugar): lo suyo llega con su mensaje y lo mío se le repone cuando vuelve.
  let peerLook: Activity | null = null
  let myLook: Activity | null = null
  let expiryTimer: ReturnType<typeof setTimeout> | null = null

  const listeners = new Set<() => void>()
  let snapshot: DuelSnapshot

  const seriesView = (): DuelSnapshot['series'] => {
    const score = seriesScore(series, settings.match ? duelResult(life.lp, conceded) : null)

    return { match: settings.match, game: series.played + 1, wins: score.wins, winner: settings.match ? score.winner : null }
  }

  const build = (): DuelSnapshot => ({ role, me, settings, peerPresent: peerPresent && !stranger && (peerGreeted || !finishedForGood()), peerName, incompatible, mine, initial, ownIds, actions, moves: actions.length, theirs, life, games, rps, starter, conceded, timeUp: concededOnTime, series: seriesView(), rematch, ready, opening: { method, caller, dice, chooser, ordered }, chat, emoteReadyAt: emoteAt === null ? 0 : emoteAt + EMOTE_GAP_MS, watchers, undo: { asking: undoAsking !== null, asked: undoAsked !== null, result: undoResult, available: undoTarget() !== null, blocked: undoBlocked() }, pass: { asking: phaseAsking?.action.phase ?? null, asked: phaseAsked, result: phaseResult }, marks: { mine: marksOnMine, theirs: marksOnTheirs }, turnClock, peerLook: peerPresent && !stranger ? peerLook : null, ping: lastPing })

  /**
   * Pone el reloj de turnos al día con la mesa: cuándo cambia el turno (el que pasa publica lo que le queda, y a quien le toca se le suman los 2 minutos), de quién corre y si está parado
   * (sin dos mesas, sin el rival o con el duelo terminado no corre nada). Una mesa nueva (revancha) lo empieza de cero.
   */
  const tickTurnClock = () => {
    const bankMs = (settings.turnMin ?? 0) * 60_000
    const bonusMs = (settings.turnBonusMin ?? 0) * 60_000

    // Sin límite por turno (o sin dos mesas) no hay reloj: nada corre ni se avisa.
    if (bankMs === 0 || !mine || !theirs) {
      if (expiryTimer !== null) {
        clearTimeout(expiryTimer)
        expiryTimer = null
      }

      if (clockTurnNo !== null || turnClock.running !== null || turnClock.banks[0] !== bankMs) {
        turnClock = freshTurnClock(bankMs)
        clockTurnNo = null
        pendingBanks = null
      }

      return
    }

    const at = now()
    const no = duelTurnNumber(mine, theirs.state)
    const owner: Duelist = whoseTurn(me, mine, theirs.state, starter) === 'mine' ? me : peer

    if (clockTurnNo === null) {
      turnClock = startTurn({ ...turnClock, banks: pendingBanks ?? turnClock.banks, running: null, at }, owner, at, 0)
    } else if (no > clockTurnNo) {
      // Pasó el turno: quien lo pasó dice lo que le queda (corrige la cuenta del otro lado) y a quien le toca se le suman los 2 minutos.
      if (clockOwner === me) {
        send({ t: 'turnClock', bank: Math.round(turnTimeLeft(turnClock, me, at)) })
      }

      turnClock = startTurn(turnClock, owner, at, bonusMs)
    } else if (no < clockTurnNo) {
      // Una mesa nueva (el turno vuelve a 1) empieza de cero; volver atrás un pase sólo devuelve el turno (sin sumar nada).
      turnClock = startTurn(no === 1 ? freshTurnClock(bankMs) : turnClock, owner, at, 0)
    }

    clockTurnNo = no
    clockOwner = owner
    pendingBanks = null

    const playing = peerPresent && !stranger && duelResult(life.lp, conceded) === null
    const running = playing ? owner : null

    if (turnClock.running !== running) {
      turnClock = runTurnClock(turnClock, running, at)
    }

    // Quien se queda sin tiempo pierde: el dispositivo de ese jugador se rinde por él (el del rival sólo espera su aviso: cada uno es dueño de su reloj).
    if (expiryTimer !== null) {
      clearTimeout(expiryTimer)
      expiryTimer = null
    }

    if (turnClock.running === me) {
      expiryTimer = setTimeout(expire, turnTimeLeft(turnClock, me, at) + 50)
    }
  }

  const expire = () => {
    expiryTimer = null

    if (turnClock.running === me && turnTimeLeft(turnClock, me, now()) <= 0 && duelResult(life.lp, conceded) === null) {
      playGame({ kind: 'concede', timeout: true })
    }
  }

  const emit = () => {
    tickTurnClock()
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
  /**
   * El plazo de cada marca. Las que se marcan juntas comparten uno (vencen juntas, en un solo aviso). Un plazo sólo quita lo que sigue con él:
   * así no se corta el de las demás al quitar una del lote, y una marca que se quitó y se volvió a poner no la quita el plazo viejo.
   */
  const markTimers = new Map<string, ReturnType<typeof setTimeout>>()

  /** Quita estos objetivos del lado del rival (los que siguen marcados) y se lo avisa al otro en un solo mensaje: lo usan el toque que los desmarca y su plazo. */
  const dropMarks = (targets: readonly MarkTarget[]) => {
    const cards = targets.flatMap((target) => ('card' in target ? [target.card] : []))
    const piles = targets.flatMap((target) => ('pile' in target ? [target.pile] : []))
    const next: Marks = { cards: marksOnTheirs.cards.filter((id) => !cards.includes(id)), piles: marksOnTheirs.piles.filter((pile) => !piles.includes(pile)) }

    for (const target of targets) markTimers.delete(markKey(target))

    if (next.cards.length === marksOnTheirs.cards.length && next.piles.length === marksOnTheirs.piles.length) {
      return
    }

    marksOnTheirs = next
    sendMarks()
    emit()
  }

  /** Un plazo para estos objetivos recién marcados: a los `MARK_MS` vencen todos juntos (un solo aviso). */
  const armMarks = (targets: readonly MarkTarget[]) => {
    const timer: ReturnType<typeof setTimeout> = setTimeout(() => dropMarks(targets.filter((target) => markTimers.get(markKey(target)) === timer)), MARK_MS)

    for (const target of targets) markTimers.set(markKey(target), timer)
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

    send({ t: 'sync', ...table, lp: life.lp[me], lifeN, ready: ready.mine, ...(ordered ? { order: starter } : {}), ...(Object.keys(opening).length > 0 ? { opening } : {}), ...(settings.match ? { series } : {}), ...(role === 'host' ? { clock } : {}), ...(clockTurnNo !== null ? { turnBanks: [Math.round(turnTimeLeft(turnClock, 0, now())), Math.round(turnTimeLeft(turnClock, 1, now()))] as const } : {}) })

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
      concededOnTime = game.timeout === true
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
      concededOnTime = false
      rematch = { mine: false, theirs: false }
      rps = { mine: null, theirs: null }
    }
  }

  /**
   * Las jugadas de los dos, en el orden en que pasaron. Se anota cada una al jugarla o recibirla; si lo anotado no coincide con cuántas tiene cada uno (se recargó la página, el rival empezó de cero, llegó un `sync`),
   * se ajusta: lo que sobra es lo más viejo y lo que falta se supone anterior a todo, con las del rival antes que las mías (así, sin saber, Deshacer vuelve atrás la mía, como antes).
   */
  const playOrder = (): Mover[] => {
    const want = { me: actions.length, peer: peerSeq }
    const seen = { me: 0, peer: 0 }
    const kept: Mover[] = []

    for (let at = order.length - 1; at >= 0; at -= 1) {
      const who = order[at]!

      if (seen[who] < want[who]) {
        seen[who] += 1
        kept.push(who)
      }
    }

    return [...Array<Mover>(want.peer - seen.peer).fill('peer'), ...Array<Mover>(want.me - seen.me).fill('me'), ...kept.reverse()]
  }

  /** Anota una jugada nueva de `who`; va antes de contarla en `actions` (o `peerSeq`). */
  const notePlay = (who: Mover) => {
    order = [...playOrder(), who]
  }

  /** Anota que `who` deshizo su última jugada; también va antes de contarlo. */
  const noteUndo = (who: Mover) => {
    const current = playOrder()
    const at = current.lastIndexOf(who)

    order = at < 0 ? current : [...current.slice(0, at), ...current.slice(at + 1)]
  }

  /** La última jugada de `who` pasó un monstruo de una mesa a la otra: no se deshace (la otra mesa ya la completó por su cuenta). Del rival sólo se sabe si ya me llegó su jugada. */
  const lastIsControl = (who: Mover = 'me') => {
    const last = who === 'me' ? actions.at(-1) : theirs?.acts.at(-1)

    return last !== undefined && CONTROL_ACTIONS.has(last.type)
  }

  /** De quién es la última jugada de la mesa y se puede pedir deshacer; null si no hay ninguna (o la del rival, con él fuera de la sala: no hay a quién pedírsela). */
  const undoTarget = (): Mover | null => {
    const last = playOrder().at(-1)

    if (last === 'me') {
      return initial && actions.length > 0 ? 'me' : null
    }

    return last === 'peer' && peerPresent ? 'peer' : null
  }

  const undoBlocked = () => {
    const target = undoTarget()

    return target !== null && lastIsControl(target)
  }

  /** Juega una jugada en mi mesa y se la cuenta al rival (la usan `play` y las respuestas automáticas del control de un monstruo). */
  const commit = (action: MatAction) => {
    if (!mine || !sender) {
      return
    }

    // Si el rival me pedía deshacer mi última jugada y yo ya jugué otra, el pedido quedó viejo: no se le deshace nada y se entera.
    if (undoAsked !== null && undoAskedKind === 'pull') {
      send({ t: 'undoAnswer', id: undoAsked, ok: false })
      undoAsked = null
    }

    const sent = encodeAct(sender, mine, action)

    notePlay('me')
    sender = sent.sender
    mine = matReducer(mine, action)
    actions = [...actions, action]
    send({ t: 'act', n: actions.length, wire: sent.wire })
  }

  /** Deshace mi última jugada y se lo cuenta al rival; dice si pudo. */
  const applyUndo = (): boolean => {
    if (!initial || actions.length === 0 || lastIsControl()) {
      return false
    }

    noteUndo('me')
    actions = actions.slice(0, -1)
    mine = replayMat(initial, actions)
    send({ t: 'undo', n: actions.length })

    return true
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

  /** Dejo de esperar la respuesta a mi pregunta de pasar de fase (con `notify`, el cartel del rival se va). */
  const dropPhaseAsk = (notify: boolean) => {
    if (phaseAsking === null) {
      return
    }

    if (phaseTimer !== null) {
      clearTimeout(phaseTimer)
      phaseTimer = null
    }

    if (notify) {
      send({ t: 'phaseCancel', id: phaseAsking.id })
    }

    phaseAsking = null
  }

  /** El rival no tiene nada más que hacer (o no contestó, o se fue): la fase pasa. */
  const passPhase = (notify: boolean) => {
    const asking = phaseAsking

    if (asking === null) {
      return
    }

    dropPhaseAsk(notify)
    commit(asking.action)
  }

  /** El rival quiere jugar antes (me lo dijo, o jugó): la fase no pasa y me entero. */
  const holdPhase = (notify: boolean) => {
    if (phaseAsking === null) {
      return
    }

    dropPhaseAsk(notify)
    phaseResult = { n: (phaseResult?.n ?? 0) + 1 }
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
    peerLook = null
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
        peerGreeted = true

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

        // Si recargué, el reloj de turnos sigue desde lo que el rival tenía anotado (si ya tengo el mío, no se pisa).
        if (message.turnBanks && clockTurnNo === null) {
          pendingBanks = message.turnBanks
        }

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

          notePlay('peer')
          theirs = mirrorApply(theirs, message.wire)
          peerSeq = message.n
          pruneMarks()
          // Si el rival juega mientras le pregunto, no había terminado: la fase no pasa.
          holdPhase(true)

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
        if (message.n === peerSeq - 1) {
          noteUndo('peer')
        }

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
      case 'undoPull':
        undoAsked = message.id
        undoAskedKind = message.t === 'undoPull' ? 'pull' : 'push'
        return

      case 'undoAnswer':
        // Sólo vale la respuesta a mi pedido de ahora: una vieja (cancelado, o ya jugué otra cosa) no deshace nada.
        if (message.id === undoAsking) {
          const pulled = undoAskingKind === 'pull'

          dropUndoAsk(false)

          if (!message.ok) {
            undoResult = { n: (undoResult?.n ?? 0) + 1, kind: 'denied' }
          } else if (!pulled) {
            applyUndo()
          }
          // Si pedí deshacer la suya y lo permitió, ya la deshizo él: su `undo` llegó antes que esta respuesta.
        }

        return

      case 'undoCancel':
        if (undoAsked === message.id) {
          undoAsked = null
        }

        return

      case 'phaseAsk':
        phaseAsked = { id: message.id, phase: message.phase, endsTurn: message.phase === 'draw' && theirs?.state.phase === 'end' }
        return

      case 'phaseAnswer':
        // Sólo vale la respuesta a mi pregunta de ahora: una vieja (cancelada, o ya jugué otra cosa) no pasa nada.
        if (phaseAsking !== null && message.id === phaseAsking.id) {
          if (message.ok) {
            passPhase(false)
          } else {
            holdPhase(false)
          }
        }

        return

      case 'phaseCancel':
        if (phaseAsked?.id === message.id) {
          phaseAsked = null
        }

        return

      case 'life':
        if (message.n > peerLifeN) {
          peerLifeN = message.n
          setPeerLp(message.lp)
        }

        return

      case 'turnClock':
        // Lo que el rival dice que le queda al pasar el turno: su palabra corrige mi cuenta.
        turnClock = setTurnBank(turnClock, peer, message.bank, now())
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

      case 'look':
        peerLook = message.at
        return

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

    // Si el lugar quedó libre, el tercero se fue: el siguiente que llegue se vuelve a mirar (y hasta que se anuncie, terminado el duelo, no cuenta como el rival: así su llegada no cancela ni reinicia la cuenta de cierre).
    if (!present) {
      stranger = false
      peerGreeted = false
      peerLook = null
    }
    // Un pedido de volver atrás no sobrevive a que el otro salga o vuelva; una pregunta de pasar de fase tampoco (la fase pasa: no hay a quién esperar).
    undoAsked = null
    dropUndoAsk(false)
    phaseAsked = null
    passPhase(false)

    if (present) {
      sendHello()

      // Si estaba mirando algo, el que llega se entera.
      if (myLook !== null) send({ t: 'look', at: myLook })
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
    if (expiryTimer !== null) clearTimeout(expiryTimer)
    expiryTimer = null
    markTimers.forEach((timer) => clearTimeout(timer))
    markTimers.clear()
    dropUndoAsk(false)
    dropPhaseAsk(false)
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

      // Si estaba esperando permiso para volver atrás, hacer otra jugada lo cancela (el permiso sería para otra jugada que la que se quería deshacer); y si estaba preguntando por pasar de fase, también.
      dropUndoAsk(true)
      dropPhaseAsk(true)

      commit(action)
      emit()
    },

    askPhase(action) {
      if (!mine || !sender) {
        return
      }

      // Sin el rival en la sala, o sin cambiar de fase, no hay a quién preguntarle ni qué: es una jugada más.
      if (!peerPresent || action.phase === mine.phase) {
        dropUndoAsk(true)
        dropPhaseAsk(true)
        commit(action)
        emit()
        return
      }

      dropUndoAsk(true)
      dropPhaseAsk(true)
      phaseAskN += 1

      const id = phaseAskN

      phaseAsking = { id, action }
      send({ t: 'phaseAsk', id, phase: action.phase })
      phaseTimer = setTimeout(() => {
        if (phaseAsking?.id === id) {
          passPhase(true)
          emit()
        }
      }, PHASE_WAIT_MS)
      emit()
    },

    answerPhase(allow) {
      if (phaseAsked === null) {
        return
      }

      send({ t: 'phaseAnswer', id: phaseAsked.id, ok: allow })
      phaseAsked = null
      emit()
    },

    undo() {
      const target = undoTarget()

      if (target === null || undoAsking !== null || lastIsControl(target)) {
        return
      }

      dropPhaseAsk(true)

      // Solo en la sala no hay a quién pedirle permiso; con el rival ahí, se le pregunta y se deshace si lo permite.
      if (!peerPresent) {
        applyUndo()
        emit()
        return
      }

      undoAskN += 1

      const id = undoAskN

      undoAsking = id
      // La última jugada es mía: pido permiso para deshacerla. Es del rival: le pido que la deshaga él (su mesa es suya).
      undoAskingKind = target === 'me' ? 'push' : 'pull'
      send({ t: target === 'me' ? 'undoAsk' : 'undoPull', id })
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

      const id = undoAsked

      undoAsked = null

      // Si me piden deshacer mi última jugada y lo permito, la deshago yo (le llega mi `undo`) y se lo confirmo; si ya no se puede, se lo digo.
      send({ t: 'undoAnswer', id, ok: undoAskedKind === 'pull' && allow ? applyUndo() : allow })
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

    look(at) {
      if (at === myLook) {
        return
      }

      myLook = at

      if (peerPresent) {
        send({ t: 'look', at })
      }
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

      // Las señales rápidas no se spamean: una cada `EMOTE_GAP_MS` (lo que se escribe a mano no tiene tope, salvo el del relay).
      if (isEmojiSignal(line)) {
        if (emoteAt !== null && now() - emoteAt < EMOTE_GAP_MS) {
          return
        }

        emoteAt = now()
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

      // Tocar un objetivo que ya está marcado lo quita.
      if ('card' in target ? marksOnTheirs.cards.includes(target.card) : marksOnTheirs.piles.includes(target.pile)) {
        dropMarks([target])
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

      markSigns = { ...markSigns, [markKey(target)]: signOf(theirs.state, target) }

      sendMarks()
      emit()
      armMarks([target])
    },

    markMany(ids) {
      // Lo mismo que toggleMark, para varias cartas: sin rival o sin su mesa no se marca nada, y no se marca lo que no es suyo.
      if (!peerPresent || !theirs) {
        return
      }

      const cards = [...new Set(ids)]

      // Con todas ya marcadas, se quitan todas (en un solo aviso); si no, se marcan las que faltan, hasta el tope.
      if (cards.length > 0 && cards.every((id) => marksOnTheirs.cards.includes(id))) {
        dropMarks(cards.map((card) => ({ card })))
        return
      }

      const onTheirs = allMatIds(theirs.state)
      const fresh = cards.filter((id) => !marksOnTheirs.cards.includes(id) && onTheirs.includes(id)).slice(0, Math.max(0, MAX_MARKS - marksOnTheirs.cards.length))

      if (fresh.length === 0) {
        return
      }

      const targets = fresh.map((card): MarkTarget => ({ card }))

      marksOnTheirs = { ...marksOnTheirs, cards: [...marksOnTheirs.cards, ...fresh] }

      for (const target of targets) {
        markSigns = { ...markSigns, [markKey(target)]: signOf(theirs.state, target) }
      }

      sendMarks()
      emit()
      armMarks(targets)
    },

    endRoom() {
      shutdown(true)
    },

    close() {
      shutdown(false)
    },
  }

}
