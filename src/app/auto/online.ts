import { RateLimiter } from '../duel-relay-rules'
import type { DuelSnapshot } from '../duel-session'
import { cardData, type DataLoader, type DataSource, type DuelData } from './auto-data'
import { createAutoSession, type AutoSession, type HostTransport, type TransportFactory } from './auto-session'
import type { DeckList, MappedDeck } from './deck-map'
import {
  AUTO_PROTOCOL_VERSION,
  chunkAutoText,
  createPacer,
  createReassembler,
  encodeAutoMessage,
  GUEST_ACCEPTS,
  HOST_ACCEPTS,
  isAutoText,
  MAX_AUTO_BYTES,
  MAX_WHOLE_BYTES,
  parseAutoMessage,
  type AutoCardInfo,
  type AutoMessage,
} from './online-protocol'
import type { AutoCommand, AutoEvent, CoreAnswer, Seat } from './protocol'

/**
 * El enlace del duelo automático por enlace (diseño: `docs/duelos-automaticos.md`, «Duelo online»): lo que une la sala de siempre (`createDuel`: saludo, listos, tirada, chat,
 * vidas, revancha) con la sesión del núcleo. El anfitrión corre `AutoSession` con el asiento del invitado como remoto (sus preguntas salen por la red) y le manda su vista filtrada
 * por el árbitro; el invitado corre la misma sesión sobre ese flujo, sin núcleo, y contesta con la misma `ask-ui`. Los textos viajan por el mismo relay que el protocolo manual.
 *
 * El anfitrión es de confianza (tiene la mano del invitado en memoria: es para jugar con amigos); el invitado no: todo lo que manda pasa por `parseAutoMessage`, sólo vale la
 * respuesta a la pregunta pendiente y lo demás tiene tope de frecuencia. Lo que el anfitrión le manda va por un marcapasos (`createPacer`), en orden, y se anota (`log`) para
 * reponérselo entero si se cae y vuelve. El anfitrión que recarga la página pierde el duelo (la sala sigue): «lost».
 */

/** Lo que el enlace necesita del relay: mandar y escuchar texto (un `DuelTransport` lo cumple; en las pruebas, un par en memoria). */
export interface OnlineTransport {
  send(text: string): void
  onMessage(listener: (text: string) => void): () => void
}

export type OnlinePhase = 'idle' | 'awaitingDeck' | 'outdated' | 'checking' | 'blocked' | 'ready' | 'starting' | 'playing' | 'ended' | 'lost'

export interface OnlineSnapshot {
  phase: OnlinePhase
  /** Lo que impide empezar: los códigos propios sin reglas (para listarlos con nombre), cuántas del otro, o la razón. */
  problems: { mine: number[]; theirs: number; reason: 'version' | 'off' | 'data' | 'lost' | null }
  /**
   * La sesión del duelo que corre (anfitrión o invitado), o null antes de `ordered`. Cambia de objeto en cada revancha (y, en el invitado, cada vez que el anfitrión le repone el
   * duelo). En `ended` y en `lost` queda la última, para ver la mesa.
   */
  session: AutoSession | null
  /** Las cartas del rival que el núcleo dejó ver (invitado) o todas las del `.cdb` del duelo (anfitrión): nombre, tipo y rótulos por código. */
  cards: ReadonlyMap<number, AutoCardInfo>
  /** Mi asiento del núcleo (0 empieza), o null hasta `ordered`. */
  seat: Seat | null
}

export interface OnlineLink {
  getSnapshot(): OnlineSnapshot
  subscribe(listener: () => void): () => void
  /** La sala avanza: el enlace mira `peerPresent`, `ready`, `opening.ordered`, `starter`, `conceded` y `settings.auto` y hace lo suyo. Se llama con cada snapshot de `createDuel`. */
  observe(snapshot: DuelSnapshot): void
  /** El invitado volvió a conectarse (o entró): pide el duelo de nuevo. Lo llama la pantalla en cada `peerPresent` que pasa de false a true después del primero. */
  resync(): void
  destroy(): void
}

export interface HostLinkOptions {
  transport: OnlineTransport
  loader: DataLoader
  /** El deck del anfitrión como lo pide la sesión. */
  deck: DeckList
  handSize: number
  /** `workerTransport()` en la app; `localTransport(core)` en las pruebas. */
  makeTransport: TransportFactory
  /** `AUTO_ONLINE` del manifiesto (`features.online`): apagado, se contesta `autoCheck{ok:false, reason:'off'}`. */
  enabled: () => Promise<boolean>
  now?: () => number
  random?: () => number
}

export interface GuestLinkOptions {
  transport: OnlineTransport
  source: DataSource
  deck: DeckList
  now?: () => number
}

/** Lo que la pantalla de la sala le pasa a la mesa online mientras el duelo no empieza (la sala de siempre la dibuja `DuelRoom`; ver `AutoDuelScreen`). */
export interface RoomAutoState {
  /** Con `false`, «Estoy listo» no se puede tocar (todavía no se revisaron los dos decks, o no se puede jugar con ellos). */
  canReady: boolean
  /** Lo que se le dice a quien espera o no puede empezar (debajo del deck): una línea y, si hay cartas sin reglas, su lista. */
  notice: { tone: 'info' | 'warning' | 'danger'; text: string; cards?: { code: number; name: string }[] } | null
}

type Reason = OnlineSnapshot['problems']['reason']
type CreateCommand = Extract<AutoCommand, { t: 'create' }>
type InitMessage = Extract<AutoMessage, { t: 'autoInit' }>

/** Si se puede jugar: `mine` mis códigos sin reglas, `theirs` cuántas del otro. */
interface Check {
  ok: boolean
  mine: number[]
  theirs: number
  reason: Reason
}

const NONE: number[] = []
const NO_PROBLEMS: OnlineSnapshot['problems'] = { mine: NONE, theirs: 0, reason: null }
/** Cuánto espera el anfitrión el deck del invitado: un cliente sin el duelo automático nunca lo manda. */
const DECK_WAIT_MS = 10_000
/** Más que esto de registro y al invitado que vuelve no se le manda: el anfitrión re-simula (el núcleo vuelve a contar todo). Un duelo del fuzz de 2.000 respuestas anda por ahí. */
export const MAX_LOG_BYTES = 2 * 1024 * 1024
/** El invitado no pide el duelo de nuevo más de una vez en este lapso (la pantalla y el enlace se pueden enterar de la misma vuelta). */
const HELLO_GAP_MS = 2000
/** Lo que mide como mucho un `autoBatch`: un poco menos que `MAX_AUTO_BYTES` (el sobre y los nombres de las cartas). */
const BATCH_BYTES = MAX_AUTO_BYTES - 512

const CODE_KEYS = new Set(['code', 'card', 'cards', 'returned_to_extra'])
/** Una pista de efecto (5), carta anunciada (8) o carta (10): su valor es un código. */
const CARD_HINTS = new Set([5, 8, 10])
/** Un rótulo de efecto es carta << 4 | n; menos de esto es un texto del sistema. */
const SYSTEM_STRINGS = 10_000n

/** Los códigos de carta que nombra un evento (los campos de carta, las pistas de carta y la carta de cada rótulo de efecto): de esos, el invitado recibe cómo es cada carta. */
export function codesOf(value: unknown, out: Set<number> = new Set(), key = ''): Set<number> {
  if (Array.isArray(value)) for (const item of value) codesOf(item, out, key)
  else if (typeof value === 'number') {
    if (value > 0 && CODE_KEYS.has(key)) out.add(value)
  } else if (typeof value === 'string') {
    if (key === 'description' && BigInt(value) >= SYSTEM_STRINGS) out.add(Number(BigInt(value) >> 4n))
  } else if (value !== null && typeof value === 'object') {
    const record = value as Record<string, unknown>

    if (record.type === 'hint' && CARD_HINTS.has(record.hint_type as number) && Number(record.hint) > 0) out.add(Number(record.hint))
    for (const [field, item] of Object.entries(record)) codesOf(item, out, field)
  }

  return out
}

/** Lo que el `.cdb` del duelo dice de cada carta (el anfitrión), como lo necesita el invitado. */
function cardsOf(data: DuelData): Map<number, AutoCardInfo> {
  return new Map(
    data.cards.map((card) => {
      const name = data.names[card.code]
      const strs = data.texts?.[card.code]

      return [card.code, { code: card.code, type: card.type, ...(name ? { name } : {}), ...(strs?.length ? { strs: [...strs] } : {}) }]
    }),
  )
}

const badOf = (deck: MappedDeck | undefined) => [...new Set([...(deck?.missing ?? []), ...(deck?.noRules ?? [])])]

function sessionPhase(session: AutoSession, room: DuelSnapshot | null): OnlinePhase {
  const { status } = session.getSnapshot()

  if (status === 'error') return 'lost'
  if (status === 'ended' || (room?.conceded ?? null) !== null) return 'ended'

  return status === 'loading' ? 'starting' : 'playing'
}

/** El snapshot del enlace: el mismo objeto mientras nada cambie (la pantalla lo lee con `useSyncExternalStore`). */
function snapshotStore() {
  let snapshot: OnlineSnapshot = { phase: 'idle', problems: NO_PROBLEMS, session: null, cards: new Map(), seat: null }
  const listeners = new Set<() => void>()

  return {
    get: () => snapshot,
    subscribe(listener: () => void) {
      listeners.add(listener)

      return () => void listeners.delete(listener)
    },
    set(next: OnlineSnapshot) {
      const old = snapshot.problems
      const problems = next.problems.mine === old.mine && next.problems.theirs === old.theirs && next.problems.reason === old.reason ? old : next.problems

      if (problems === old && next.phase === snapshot.phase && next.session === snapshot.session && next.cards === snapshot.cards && next.seat === snapshot.seat) return
      snapshot = { ...next, problems }
      listeners.forEach((listener) => listener())
    },
    clear: () => listeners.clear(),
  }
}

/** El anfitrión: corre el núcleo con los dos asientos y le manda al invitado lo que el árbitro le deja ver. */
export function createHostLink(options: HostLinkOptions): OnlineLink {
  const { transport, loader } = options
  const now = options.now ?? Date.now
  const random = options.random ?? Math.random
  const store = snapshotStore()
  const pacer = createPacer((text) => transport.send(text), now)
  // Un invitado no puede hacer que el anfitrión baje datos ni re-emita el duelo sin parar.
  const deckLimit = new RateLimiter(now(), 0.5, 2)
  const resyncLimit = new RateLimiter(now(), 0.2, 2)
  let room: DuelSnapshot | null = null
  let here = false
  let destroyed = false
  // El deck del invitado y si se puede jugar con los dos (`bad`: los del invitado sin reglas).
  let guestDeck: DeckList | null = null
  let check: (Check & { bad: number[] }) | null = null
  let checks = 0
  let cards: ReadonlyMap<number, AutoCardInfo> = new Map()
  let outdated = false
  let wait: ReturnType<typeof setTimeout> | undefined
  // El duelo: `armed` = se vio la sala definiendo quién empieza (sin eso, un `ordered` es de antes de recargar y el duelo se perdió).
  let armed = false
  let pending = false
  let lost = false
  let session: AutoSession | null = null
  let unwatch = () => {}
  let seats: { host: Seat; guest: Seat } | null = null
  let init: CreateCommand | null = null
  // Lo mandado al invitado desde la última tanda (`loading` 0), para reponérselo: los códigos de los que ya sabe cómo son, el último `stats` y una respuesta suya rechazada.
  let log: AutoEvent[] = []
  let logBytes = 0
  let sent = new Set<number>()
  let lastStats: string | null = null
  let heldRetry: AutoEvent | null = null
  let resendLater = false
  let partId = 0

  const phase = (): OnlinePhase => {
    if (lost) return 'lost'
    if (session) return sessionPhase(session, room)
    if (!room?.settings.auto) return 'idle'
    if (check) return check.ok ? 'ready' : 'blocked'
    if (guestDeck) return 'checking'
    if (outdated) return 'outdated'

    return room.peerPresent ? 'awaitingDeck' : 'idle'
  }
  const refresh = () =>
    store.set({ phase: phase(), problems: lost ? { mine: NONE, theirs: 0, reason: 'lost' } : check ? { mine: check.mine, theirs: check.theirs, reason: check.reason } : NO_PROBLEMS, session, cards, seat: seats?.host ?? null })

  /** Todo lo que va al invitado pasa por acá, en orden: lo grande se trocea. Devuelve el texto, o null si no entra ni en `MAX_PARTS` partes. */
  function post(message: AutoMessage, key?: string): string | null {
    const text = encodeAutoMessage(message)

    partId = (partId % 1_000_000) + 1
    const parts = chunkAutoText(text, partId)

    if (parts.length === 0) return null
    if (parts[0] === text) pacer.push(text, key)
    else parts.forEach((part) => pacer.push(part))

    return text
  }

  function sendCheck() {
    if (lost) post({ t: 'autoCheck', v: AUTO_PROTOCOL_VERSION, ok: false, bad: [], theirsBad: 0, reason: 'lost' })
    else if (check) post({ t: 'autoCheck', v: AUTO_PROTOCOL_VERSION, ok: check.ok, bad: check.bad, theirsBad: check.mine.length, ...(check.reason ? { reason: check.reason } : {}) })
  }

  function stopWait() {
    clearTimeout(wait)
    wait = undefined
  }

  function waitDeck() {
    stopWait()
    wait = setTimeout(() => {
      wait = undefined
      if (!guestDeck && !check) {
        outdated = true
        refresh()
      }
    }, DECK_WAIT_MS)
  }

  /** Revisa los dos decks contra el núcleo (con los datos y scripts de los dos: la segunda vez, de la caché). */
  async function runCheck(deck: DeckList) {
    const token = ++checks

    check = null
    refresh()
    let next: Check & { bad: number[] }

    try {
      if (!(await options.enabled())) next = { ok: false, mine: NONE, theirs: 0, bad: NONE, reason: 'off' }
      else {
        const data = await loader.load([options.deck, deck])

        if (token !== checks) return
        const mine = badOf(data.decks[0])
        const bad = badOf(data.decks[1])

        cards = cardsOf(data)
        next = { ok: mine.length === 0 && bad.length === 0, mine, theirs: bad.length, bad, reason: null }
      }
    } catch {
      next = { ok: false, mine: NONE, theirs: 0, bad: NONE, reason: 'data' }
    }
    if (token !== checks || destroyed) return
    check = next
    sendCheck()
    if (pending && next.ok && room?.opening.ordered) begin()
    refresh()
  }

  function takeDeck(message: Extract<AutoMessage, { t: 'autoDeck' }>) {
    stopWait()
    outdated = false
    if (message.v !== AUTO_PROTOCOL_VERSION) {
      checks += 1
      guestDeck = null
      check = { ok: false, mine: NONE, theirs: 0, bad: NONE, reason: 'version' }
      sendCheck()
      return refresh()
    }
    guestDeck = { main: message.main, extra: message.extra }
    void runCheck(guestDeck)
  }

  function restartLog() {
    log = []
    logBytes = 0
    lastStats = null
  }

  function sendInit() {
    if (!init || !seats) return
    const { host, guest } = seats

    post({ t: 'autoInit', v: AUTO_PROTOCOL_VERSION, seed: init.seed, seat: guest, players: [init.players[0]!, init.players[1]!], mine: init.decks[guest]!, theirs: { main: init.decks[host]!.main.length, extra: init.decks[host]!.extra.length } })
  }

  /** Las cartas de un evento que el invitado todavía no sabe cómo son (las anota como mandadas). */
  function fresh(event: AutoEvent): AutoCardInfo[] {
    const out: AutoCardInfo[] = []

    for (const code of codesOf(event)) {
      const info = cards.get(code)

      if (info && !sent.has(code)) {
        sent.add(code)
        out.push(info)
      }
    }

    return out
  }

  /** El duelo se perdió (el anfitrión recargó, el núcleo se cayó, algo no se pudo mandar): los dos lo ven y la sala sigue. */
  function lose() {
    if (lost) return
    lost = true
    sendCheck()
    refresh()
  }

  /** Lo que cuenta el núcleo, al invitado: lo de su asiento, el fin, la carga y lo que corta el duelo; cada mensaje en el registro. */
  function forward(event: AutoEvent) {
    if (!seats) return
    if (event.t === 'fault') {
      // Sólo lo que el invitado necesita y sin el detalle (que puede nombrar cartas): que el núcleo rechazó su respuesta (si la pregunta que sigue es suya) o que el duelo se cortó.
      if (event.kind === 'retry') heldRetry = { t: 'fault', kind: 'retry', message: event.message }
      else if (event.kind === 'crash' || event.kind === 'setup') post({ t: 'autoEvent', event: { t: 'fault', kind: event.kind, message: `${event.kind} on the host` } })
      return
    }
    const retry = heldRetry

    heldRetry = null
    if ((event.t === 'events' || event.t === 'ask' || event.t === 'stats') && event.seat !== seats.guest) return
    if (event.t === 'loading' && event.done === 0) restartLog()
    // Un `stats` igual al anterior sólo se ahorra si en el medio no pasó nada en la mesa del invitado: con cartas movidas, lo mismo en el mismo lugar puede ser otra carta.
    if (event.t === 'events') lastStats = null
    if (event.t === 'stats') {
      const key = JSON.stringify(event.cards)

      if (key === lastStats) return
      lastStats = key
    }
    if (retry && event.t === 'ask') post({ t: 'autoEvent', event: retry })
    const more = fresh(event)
    const text = post({ t: 'autoEvent', event, ...(more.length > 0 ? { cards: more } : {}) }, event.t === 'stats' ? 'stats' : undefined)

    if (text === null) return lose()
    log.push(event)
    logBytes += text.length
  }

  /** Re-emite el registro en `autoBatch` (cada evento tal cual, en orden), con las cartas otra vez: quien vuelve puede ser una página nueva. */
  function sendLog() {
    let batch: AutoEvent[] = []
    let infos: AutoCardInfo[] = []
    let size = 0
    const flush = () => {
      if (batch.length > 0) post({ t: 'autoBatch', events: batch, ...(infos.length > 0 ? { cards: infos } : {}) })
      batch = []
      infos = []
      size = 0
    }

    for (const event of log) {
      const more = fresh(event)
      const bytes = JSON.stringify(event).length + JSON.stringify(more).length

      if (batch.length > 0 && size + bytes > BATCH_BYTES) flush()
      batch.push(event)
      infos.push(...more)
      size += bytes
    }
    flush()
  }

  /** El invitado pide el duelo de nuevo: si se puede jugar y, si hay duelo, cómo empezó, cuántas preguntas suyas ya pasaron y todo lo que se le mandó desde la última tanda. */
  function resend() {
    sendCheck()
    sent = new Set()
    if (lost || !session || !init) return
    // Re-simulando, el registro está a medio armar: se manda entero cuando termina.
    if (session.getSnapshot().replaying) {
      resendLater = true
      return
    }
    sendInit()
    // Un registro enorme no se re-emite: el núcleo vuelve a contar todo (y `onReplay` manda el `autoReplay`).
    if (logBytes > MAX_LOG_BYTES) return session.resimulate()
    const asks = log.filter((event) => event.t === 'ask').length

    post({ t: 'autoReplay', skip: Math.max(0, asks - (session.getSnapshot().remoteAsk ? 1 : 0)) })
    sendLog()
  }

  function drop() {
    unwatch()
    unwatch = () => {}
    session?.destroy()
    session = null
    seats = null
    init = null
  }

  /** El `create` que manda la sesión es el duelo que se le cuenta al invitado (`autoInit`): la misma semilla, los mismos decks y el mismo orden. */
  const watch = (inner: HostTransport): HostTransport => ({
    send(command) {
      if (command.t === 'create' && !init) {
        init = command
        sendInit()
      }
      inner.send(command)
    },
    onEvent: (listener) => inner.onEvent(listener),
    terminate: () => inner.terminate(),
  })

  function onSession() {
    const snap = session?.getSnapshot()

    if (snap?.status === 'error') lose()
    if (resendLater && snap && !snap.replaying) {
      resendLater = false
      resend()
    }
    refresh()
  }

  /** Empieza el duelo: el anfitrión es el duelista 0 de la sala y el asiento 0 del núcleo siempre empieza. */
  function begin() {
    if (!room || !guestDeck || !check?.ok) {
      pending = true
      return
    }
    pending = false
    drop()
    lost = false
    const host: Seat = room.starter === 0 ? 0 : 1

    seats = { host, guest: (1 - host) as Seat }
    restartLog()
    sent = new Set()
    heldRetry = null
    resendLater = false
    session = createAutoSession({
      loader,
      deck: options.deck,
      seed: Math.floor(random() * 2 ** 32) >>> 0,
      seat: host,
      handSize: options.handSize,
      remote: { deck: guestDeck, onReplay: (skip) => void post({ t: 'autoReplay', skip }) },
      transport: (data) => watch(options.makeTransport(data)),
      onEvent: forward,
    })
    unwatch = session.subscribe(onSession)
  }

  function receive(text: string) {
    if (destroyed || !isAutoText(text) || !room?.settings.auto) return
    const message = parseAutoMessage(text)

    if (!message || !HOST_ACCEPTS.includes(message.t)) return
    if (message.t === 'autoDeck') {
      if (deckLimit.allow(now())) takeDeck(message)
    } else if (message.t === 'autoAnswer') session?.answerRemote(message.askId, message.answer)
    else if (message.t === 'autoResync' && resyncLimit.allow(now())) resend()
  }

  const off = transport.onMessage(receive)

  return {
    getSnapshot: store.get,
    subscribe: store.subscribe,
    observe(next) {
      const before = room
      const arrived = next.settings.auto === true && next.peerPresent

      room = next
      if (destroyed) return
      if (arrived && !here && !guestDeck && !check) waitDeck()
      // El invitado se fue antes de empezar: su deck se revisa de nuevo cuando vuelva (puede ser otro).
      if (!next.peerPresent && here && !session) {
        checks += 1
        guestDeck = null
        check = null
        outdated = false
        stopWait()
      }
      here = arrived
      if (next.peerPresent && next.ready.mine && next.ready.theirs && !next.opening.ordered) armed = true
      if (next.settings.auto && next.opening.ordered && !before?.opening.ordered) {
        if (armed) {
          armed = false
          begin()
        } else if (!session) lose()
      } else if (!next.opening.ordered && before?.opening.ordered) {
        // La revancha: la sala vuelve a definir quién empieza; el próximo `ordered` arma otra sesión, con otra semilla.
        drop()
        pending = false
        lost = false
        sendCheck()
      }
      refresh()
    },
    resync() {},
    destroy() {
      destroyed = true
      checks += 1
      stopWait()
      drop()
      pacer.destroy()
      off()
      store.clear()
    },
  }
}

type Port = { listener: ((event: AutoEvent) => void) | null; open: boolean; alive: boolean; buffer: AutoEvent[] }

/**
 * El «anfitrión del núcleo» del invitado es la red: sus respuestas salen como `autoAnswer` y los eventos llegan del enlace. Lo que llega antes de que la sesión mande su `create`
 * (todavía bajando sus filas) se guarda: la sesión no puede proyectar nada sin él.
 */
function relayTransport(answer: (askId: number, answer: CoreAnswer) => void) {
  let port: Port | null = null
  const factory: TransportFactory = () => {
    const next: Port = { listener: null, open: false, alive: true, buffer: [] }

    port = next

    return {
      send(command) {
        if (command.t === 'answer') answer(command.askId, command.answer)
        else if (command.t === 'create' && !next.open) {
          next.open = true
          for (const event of next.buffer.splice(0)) if (next.alive) next.listener?.(event)
        }
      },
      onEvent: (listener) => void (next.listener = listener),
      terminate: () => void (next.alive = false),
    }
  }

  return {
    factory,
    deliver(event: AutoEvent) {
      if (!port?.alive) return
      if (port.open) port.listener?.(event)
      else port.buffer.push(event)
    },
  }
}

/**
 * Los datos del invitado: su deck ya en códigos del núcleo, como lo puso el anfitrión (`autoInit.mine`: no mapea nada, así un desfase de datos entre despliegues no desalinea las
 * mesas), y del anfitrión sólo cuántas cartas tiene (ceros: el adaptador del rival sólo necesita cuántas). Sus filas, para nombres y rótulos; si no llegan, la pantalla tiene los
 * nombres del builder. Los decks van en el orden de las listas pedidas (la mía y la del rival), como `loader.load`: la sesión los pone en el orden de los asientos.
 */
function guestLoader(init: InitMessage, source: DataSource): DataLoader {
  return {
    manifest: async () => ({ version: 'remote', tokens: [], filler: [] }),
    async load() {
      const rows = await source.cards([...new Set([...init.mine.main, ...init.mine.extra])]).catch(() => [])
      const zeros = (count: number) => Array<number>(count).fill(0)

      return {
        decks: [
          { main: init.mine.main, extra: init.mine.extra, missing: [], noRules: [] },
          { main: zeros(init.theirs.main), extra: zeros(init.theirs.extra), missing: [], noRules: [] },
        ],
        cards: rows.map(cardData),
        scripts: {},
        names: Object.fromEntries(rows.flatMap((row) => (row.name ? [[row.id, row.name]] : []))),
        texts: Object.fromEntries(rows.flatMap((row) => (row.strs?.length ? [[row.id, row.strs]] : []))),
        version: 'remote',
      }
    },
  }
}

/** El invitado: no corre el núcleo; proyecta lo que el anfitrión le cuenta y contesta sus preguntas. */
export function createGuestLink(options: GuestLinkOptions): OnlineLink {
  const { transport, source } = options
  const now = options.now ?? Date.now
  const store = snapshotStore()
  const parts = createReassembler(now)
  let room: DuelSnapshot | null = null
  let here = false
  let destroyed = false
  let asked = false
  let lastHello = -Infinity
  let check: Check | null = null
  let lost = false
  let session: AutoSession | null = null
  let unwatch = () => {}
  let relay: ReturnType<typeof relayTransport> | null = null
  let seat: Seat | null = null
  let cards: ReadonlyMap<number, AutoCardInfo> = new Map()

  const phase = (): OnlinePhase => {
    if (lost) return 'lost'
    if (session) return sessionPhase(session, room)
    if (!room?.settings.auto) return 'idle'
    if (check) return !check.ok ? 'blocked' : room.opening.ordered ? 'starting' : 'ready'

    return asked ? 'checking' : 'idle'
  }
  const refresh = () => store.set({ phase: phase(), problems: lost ? { mine: NONE, theirs: 0, reason: 'lost' } : check ? { mine: check.mine, theirs: check.theirs, reason: check.reason } : NO_PROBLEMS, session, cards, seat })
  const send = (message: AutoMessage) => transport.send(encodeAutoMessage(message))

  /** Al entrar o volver: mi deck (lo revisa el anfitrión) y el duelo, si hay uno. */
  function hello() {
    if (now() - lastHello < HELLO_GAP_MS) return
    lastHello = now()
    asked = true
    const rows = (list: DeckList['main'] = []) => list.map(([code, copies]): [number, number] => [code, copies])

    send({ t: 'autoDeck', v: AUTO_PROTOCOL_VERSION, main: rows(options.deck.main), extra: rows(options.deck.extra) })
    send({ t: 'autoResync' })
  }

  function drop() {
    unwatch()
    unwatch = () => {}
    session?.destroy()
    session = null
    relay = null
    seat = null
  }

  function begin(init: InitMessage) {
    drop()
    lost = false
    seat = init.seat
    const port = relayTransport((askId, answer) => send({ t: 'autoAnswer', askId, answer }))

    relay = port
    session = createAutoSession({
      loader: guestLoader(init, source),
      deck: options.deck,
      seed: init.seed,
      seat: init.seat,
      hand: init.mine.hand,
      handSize: init.players[init.seat].hand,
      typeOf: (code) => cards.get(code)?.type ?? 0,
      transport: port.factory,
    })
    unwatch = session.subscribe(refresh)
    refresh()
  }

  function learn(infos: readonly AutoCardInfo[] | undefined) {
    if (!infos?.length) return
    const next = new Map(cards)

    for (const info of infos) next.set(info.code, info)
    cards = next
  }

  function handle(message: AutoMessage | null) {
    if (!message || !GUEST_ACCEPTS.includes(message.t)) return
    switch (message.t) {
      case 'autoPart': {
        const whole = parts.push(message)
        const inner = whole === null ? null : parseAutoMessage(whole, MAX_WHOLE_BYTES)

        if (inner && inner.t !== 'autoPart') handle(inner)
        return
      }

      case 'autoCheck':
        // El anfitrión perdió el duelo: la revisión de los decks sigue valiendo para el próximo.
        if (message.reason === 'lost') lost = true
        else check = message.v === AUTO_PROTOCOL_VERSION ? { ok: message.ok, mine: message.bad, theirs: message.theirsBad, reason: message.reason ?? null } : { ok: false, mine: NONE, theirs: 0, reason: 'version' }
        return refresh()

      case 'autoInit':
        if (message.v === AUTO_PROTOCOL_VERSION) begin(message)
        return

      case 'autoReplay':
        return session?.expectReplay(message.skip)

      case 'autoEvent':
        learn(message.cards)
        relay?.deliver(message.event)
        return refresh()

      case 'autoBatch':
        learn(message.cards)
        for (const event of message.events) relay?.deliver(event)
        return refresh()
    }
  }

  // Lo que manda el anfitrión sólo vale en una sala automática.
  const off = transport.onMessage((text) => {
    if (!destroyed && isAutoText(text) && room?.settings.auto) handle(parseAutoMessage(text))
  })

  return {
    getSnapshot: store.get,
    subscribe: store.subscribe,
    observe(next) {
      const before = room
      const arrived = next.settings.auto === true && next.peerPresent

      room = next
      if (destroyed) return
      if (arrived && !here) hello()
      here = arrived
      // La revancha: el anfitrión arma otra sesión al próximo `ordered` y la cuenta con otro `autoInit`.
      if (!next.opening.ordered && before?.opening.ordered) {
        drop()
        lost = false
      }
      refresh()
    },
    resync() {
      if (!destroyed && room?.settings.auto) hello()
    },
    destroy() {
      destroyed = true
      drop()
      off()
      store.clear()
    },
  }
}
