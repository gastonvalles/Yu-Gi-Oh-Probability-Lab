import { RateLimiter } from '../duel-relay-rules'
import type { DuelSnapshot } from '../duel-session'
import { allMatIds, isForeignId, type MatState } from '../practice-mat'
import { cardData, type DataLoader, type DataSource, type DuelData } from './auto-data'
import type { AutoSave, AutoSaveStore } from './auto-save'
import { createAutoSession, type AutoSession, type AutoSnapshot, type HostTransport, type SessionAnswer, type TransportFactory } from './auto-session'
import { bagOrder, type DeckList, type MappedDeck } from './deck-map'
import { newDuelKey } from './duel-key'
import {
  AUTO_PROTOCOL_VERSION,
  chunkAutoText,
  createPacer,
  createReassembler,
  encodeAutoMessage,
  GUEST_ACCEPTS,
  HOST_ACCEPTS,
  isAutoText,
  isHostMessage,
  MAX_AUTO_BYTES,
  MAX_WHOLE_BYTES,
  parseAutoMessage,
  type AutoCardInfo,
  type AutoMessage,
  type HostMessage,
} from './online-protocol'
import { splitDesc, type AutoCommand, type AutoEvent, type CoreAnswer, type Seat } from './protocol'

/**
 * El enlace del duelo automático por enlace (diseño: `docs/duelo-automatico-enlace.md`): lo que une la sala de siempre (`createDuel`: saludo, listos, tirada, chat,
 * vidas, revancha) con la sesión del núcleo. El anfitrión corre `AutoSession` con el asiento del invitado como remoto (sus preguntas salen por la red) y le manda su vista filtrada
 * por el árbitro; el invitado corre la misma sesión sobre ese flujo, sin núcleo, y contesta con la misma `ask-ui`. Los textos viajan por el mismo relay que el protocolo manual.
 *
 * El anfitrión es de confianza (tiene la mano del invitado en memoria: es para jugar con amigos); el invitado no: todo lo que manda pasa por `parseAutoMessage`, sólo vale la
 * respuesta a la pregunta pendiente y lo demás tiene tope de frecuencia. Lo que el anfitrión le manda va por un marcapasos (`createPacer`), en orden y numerado (`s`: el invitado
 * nota un hueco y pide el duelo de nuevo), y se anota (`log`) para reponérselo entero si se cae y vuelve. Las barajas y el núcleo salen de una clave de
 * 256 bits por duelo (`duel-key.ts`; la semilla de 32 bits se adivinaba desde la mano de arranque), que no viaja ni se muestra: el invitado tiene su deck como bolsa (sin orden)
 * desde el arranque, y el anfitrión proyecta su vista igual. El anfitrión que recarga la página rearma el duelo con lo guardado (`save`, `auto-save.ts`); sin eso, el duelo se
 * pierde (la sala sigue): «lost».
 *
 * Pasar a manual (`manual`, `autoManual`): lo pide cualquiera y el otro acepta o no. El que corta es el anfitrión, con el núcleo quieto (una pregunta esperando): su `yes` va detrás de
 * todo lo que contó y desde ahí el núcleo no recibe nada más. El invitado pasa a manual al recibirlo (su mesa ya es la del corte) y el anfitrión, con el pase acordado, cuando le
 * llega la mesa manual del invitado (`AutoDuelScreen`): así, si el anfitrión recarga en el medio, rearma el duelo con lo guardado (que dice que cortó: `cut`) y pasa igual.
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
  /** El pedido de seguir en modo manual (ver `ManualState`); sin esto, `idle`. */
  manual?: ManualState
  /** Con `agreed`: al cortar quedó algo a medio jugar (una cadena, una elección), que se descartó. */
  manualDropped?: boolean
}

/**
 * El pedido de seguir en modo manual, visto desde un lado: `asking` lo pedí y espero; `asked` me lo pidieron; `switching` se acordó y falta el corte del anfitrión (el núcleo
 * todavía cuenta, o el invitado espera el `yes`); `agreed` cortado: la mesa de mi sesión es la que sigue a mano. `declined`, `expired` (no contestó) y `blocked` (una carta bajo el
 * control del otro) dicen cómo terminó mi último pedido.
 */
export type ManualState = 'idle' | 'asking' | 'asked' | 'switching' | 'agreed' | 'declined' | 'expired' | 'blocked'

export interface OnlineLink {
  getSnapshot(): OnlineSnapshot
  subscribe(listener: () => void): () => void
  /** La sala avanza: el enlace mira `peerPresent`, `ready`, `opening.ordered`, `starter`, `conceded` y `settings.auto` y hace lo suyo. Se llama con cada snapshot de `createDuel`. */
  observe(snapshot: DuelSnapshot): void
  /**
   * El invitado volvió a conectarse (o entró): pide el duelo de nuevo. Lo llama la pantalla en cada `peerPresent` que pasa de false a true después del primero. El anfitrión
   * que se reconectó (cambió de red: lo que mandó con la conexión caída se perdió y el relay puede no haberle avisado al invitado) se lo repone: lo llama la pantalla cuando su
   * conexión vuelve a abrirse.
   */
  resync(): void
  /** Seguir en modo manual: `true` lo pide (o acepta el pedido del otro); `false` lo rechaza o retira el mío. Sólo con el duelo en juego y el otro en la sala. */
  manual?(yes: boolean): void
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
  /** El guardado del duelo de esta sala (`autoSaveStore(sala)`): el enlace lo escribe con cada respuesta, lo borra al terminar y lo usa si la página se recargó a mitad de duelo. Abandonar lo borra la pantalla. */
  save?: AutoSaveStore
  now?: () => number
  /** La clave de cada duelo nuevo (y de cada revancha): `newDuelKey` (256 bits de `crypto.getRandomValues`); las pruebas la fijan. */
  newKey?: () => string
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
/** El invitado no pide el duelo de nuevo más de una vez en este lapso (la pantalla y el enlace se pueden enterar de la misma vuelta). */
const HELLO_GAP_MS = 2000
/** Mientras le falta algo (`stale`), el invitado lo vuelve a pedir cada tanto: lo que el anfitrión le permite (`resyncLimit`, 0,2 por segundo). */
const STALE_PING_MS = 5000
/** Lo que mide como mucho un `autoBatch`: un poco menos que `MAX_AUTO_BYTES` (el sobre y los nombres de las cartas). */
const BATCH_BYTES = MAX_AUTO_BYTES - 512

const CODE_KEYS = new Set(['code', 'card', 'cards', 'returned_to_extra'])
/** Una pista de efecto (5), carta anunciada (8) o carta (10): su valor es un código. */
const CARD_HINTS = new Set([5, 8, 10])

/** Los códigos de carta que nombra un evento (los campos de carta, las pistas de carta y la carta de cada rótulo de efecto): de esos, el invitado recibe cómo es cada carta. */
export function codesOf(value: unknown, out: Set<number> = new Set(), key = ''): Set<number> {
  if (Array.isArray(value)) for (const item of value) codesOf(item, out, key)
  else if (typeof value === 'number') {
    if (value > 0 && CODE_KEYS.has(key)) out.add(value)
  } else if (typeof value === 'string') {
    // Un rótulo de efecto (`splitDesc`); con carta 0 es un texto del sistema.
    const code = key === 'description' ? splitDesc(value).code : 0

    if (code > 0) out.add(code)
  } else if (value !== null && typeof value === 'object') {
    const record = value as Record<string, unknown>

    if (record.type === 'hint' && CARD_HINTS.has(record.hint_type as number) && Number(record.hint) > 0) out.add(Number(record.hint))
    // Las opciones de `select_option` también son rótulos (las de `announce_number` son números).
    if (record.type === 'select_option') codesOf(record.options, out, 'description')
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

/** Cuánto espera un pedido de seguir en modo manual la respuesta del otro (sin ella, sigue el automático) y el invitado que aceptó, el corte del anfitrión. */
export const MANUAL_WAIT_MS = 30_000

/** Una carta del otro jugador bajo tu control (`f.…`, o una tuya en su espejo): la mesa manual no la puede seguir al pasar (los ids opacos de cada lado no coinciden). */
export const underControl = (state: MatState) => allMatIds(state).some(isForeignId)

/** Las preguntas de «qué hacés ahora»: cortar en ellas no deja nada a medio jugar (con la cadena vacía y si responder no es obligatorio). */
const CALM = new Set(['select_idlecmd', 'select_battlecmd', 'select_chain'])

function midPlay(snap: AutoSnapshot): boolean {
  const pending = snap.ask ?? snap.remoteAsk

  return snap.overlay.chain.length > 0 || (pending !== null && (!CALM.has(pending.ask.type) || (pending.ask.type === 'select_chain' && pending.ask.forced)))
}

type ManualMessage = Extract<HostMessage, { t: 'autoManual' }>

/**
 * El pedido de seguir en modo manual de un lado (lo usan los dos enlaces; ver `ManualState`). Lo que hace el anfitrión al acordarse (el corte) es `onAgree`: termina en `agreed`
 * o `refused`. El invitado que acepta manda `yes` y espera el `yes` del anfitrión, que lo pasa a `agreed` aunque haya llegado tarde.
 */
function manualRequest(host: boolean, say: (message: ManualMessage) => void, changed: () => void, onAgree: () => void = () => {}) {
  let state: ManualState = 'idle'
  let dropped = false
  let timer: ReturnType<typeof setTimeout> | undefined
  const go = (next: ManualState, onWait?: () => void) => {
    clearTimeout(timer)
    timer = onWait ? setTimeout(onWait, MANUAL_WAIT_MS) : undefined
    state = next
    changed()
  }
  const busy = () => state === 'switching' || state === 'agreed'
  const agree = () => {
    go('switching')
    onAgree()
  }
  const yes = () => say({ t: 'autoManual', step: 'yes', ...(dropped ? { dropped: true } : {}) })

  return {
    get state() {
      return state
    },
    get dropped() {
      return dropped
    },
    /** Acordado: desde acá el núcleo no recibe respuestas de este lado. */
    get frozen() {
      return busy()
    },
    want(wanted: boolean) {
      if (state === 'asked') {
        if (!wanted) {
          say({ t: 'autoManual', step: 'no' })
          return go('idle')
        }
        if (host) return agree()
        say({ t: 'autoManual', step: 'yes' })
        // Si el corte no llega (el anfitrión recargó antes), el duelo sigue en automático.
        return go('switching', () => go('idle'))
      }
      if (state === 'asking') {
        if (!wanted) {
          say({ t: 'autoManual', step: 'cancel' })
          go('idle')
        }
        return
      }
      if (wanted && !busy()) {
        say({ t: 'autoManual', step: 'ask' })
        go('asking', () => {
          say({ t: 'autoManual', step: 'cancel' })
          go('expired')
        })
      }
    },
    receive(message: ManualMessage) {
      switch (message.step) {
        case 'ask':
          // Los dos lo pidieron a la vez: es un sí (lo corta el anfitrión).
          if (state === 'asking') {
            if (host) agree()
          } else if (!busy()) go('asked')
          return
        case 'yes':
          if (!host) {
            dropped = message.dropped === true
            return go('agreed')
          }
          if (state === 'asking') agree()
          // Un sí a un pedido que ya no está (lo retiré o venció): que el invitado no se quede esperando.
          else if (!busy()) say({ t: 'autoManual', step: 'cancel' })
          return
        case 'no':
          if (state === 'asking' || (!host && state === 'switching')) go(message.why ? 'blocked' : state === 'asking' ? 'declined' : 'idle')
          return
        case 'cancel':
          if (state === 'asked' || (!host && state === 'switching')) go('idle')
      }
    },
    /** El otro se fue: lo que estaba pendiente se cae (no el corte del anfitrión, que se le repite al invitado que vuelve). */
    drop() {
      if (state === 'asking' || state === 'asked' || (!host && state === 'switching')) go('idle')
    },
    /** Otro duelo (la revancha): de cero. */
    reset() {
      dropped = false
      if (state !== 'idle') go('idle')
    },
    /** El anfitrión cortó: el `yes` (con lo que quedó a medio jugar) va detrás de todo lo que contó el núcleo. */
    agreed(midway: boolean) {
      dropped = midway
      yes()
      go('agreed')
    },
    /** El anfitrión rearma un duelo que ya había cortado (lo dice lo guardado): sigue cortado, sin repetir el `yes` (al invitado que vuelve se le repite con el duelo). */
    restore(midway: boolean) {
      dropped = midway
      go('agreed')
    },
    /** El anfitrión no pudo cortar (el duelo terminó, o una carta está bajo el control del otro). */
    refused(why?: 'control') {
      say({ t: 'autoManual', step: 'no', ...(why ? { why } : {}) })
      go(why ? 'blocked' : 'idle')
    },
    /** El anfitrión le repone el duelo al invitado que vuelve: después, otra vez el corte. */
    repeat() {
      if (state === 'agreed') yes()
    },
    destroy: () => clearTimeout(timer),
  }
}

/** El snapshot del enlace: el mismo objeto mientras nada cambie (la pantalla lo lee con `useSyncExternalStore`). */
function snapshotStore() {
  let snapshot: OnlineSnapshot = { phase: 'idle', problems: NO_PROBLEMS, session: null, cards: new Map(), seat: null, manual: 'idle', manualDropped: false }
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

      if (problems === old && next.phase === snapshot.phase && next.session === snapshot.session && next.cards === snapshot.cards && next.seat === snapshot.seat && next.manual === snapshot.manual && next.manualDropped === snapshot.manualDropped) return
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
  const newKey = options.newKey ?? newDuelKey
  const store = snapshotStore()
  const pacer = createPacer((text) => transport.send(text), now)
  // Un invitado no puede hacer que el anfitrión baje datos ni re-emita el duelo sin parar (ni que le pregunte sin parar).
  const deckLimit = new RateLimiter(now(), 0.5, 2)
  const resyncLimit = new RateLimiter(now(), 0.2, 2)
  const manualLimit = new RateLimiter(now(), 1, 4)
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
  let sent = new Set<number>()
  let lastStats: string | null = null
  let heldRetry: AutoEvent | null = null
  let resendLater = false
  let partId = 0
  // El número de orden de lo que va al invitado: vuelve a 0 (el próximo sale con 1) donde empieza un flujo nuevo, `sendInit` y `resend`.
  let seq = 0
  // El lote que se arma mientras se re-simula (o se re-emite el registro): sale entero en un `autoBatch` al llenarse, antes de cualquier otro mensaje y al terminar.
  let batch: AutoEvent[] = []
  let batchCards: AutoCardInfo[] = []
  let batchBytes = 0
  // El duelo guardado: el deck y la mano con que se juega (los de lo guardado, si se rearma), lo que se va a rearmar y lo último escrito (`saving`: mientras el duelo sigue).
  let hostDeck = options.deck
  let hand = options.handSize
  let restoring: AutoSave | null = null
  let remoteDeck: DeckList | null = null
  let saving = false
  let savedAnswers: readonly SessionAnswer[] | null = null
  // La clave del duelo que corre (la de lo guardado, si se rearma): sólo va a la sesión y a lo guardado, nunca al invitado ni a `refresh`.
  let duelKey = ''

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
    store.set({
      phase: phase(),
      // Perdido por otra versión del invitado: la pantalla no dice «el anfitrión recargó» (y en la revancha, «versión»).
      problems: lost ? { mine: NONE, theirs: 0, reason: check?.reason === 'version' ? 'version' : 'lost' } : check ? { mine: check.mine, theirs: check.theirs, reason: check.reason } : NO_PROBLEMS,
      session,
      cards,
      seat: seats?.host ?? null,
      manual: request.state,
      manualDropped: request.dropped,
    })
  const request = manualRequest(true, post, refresh, cut)

  /**
   * Todo lo que va al invitado pasa por acá, en orden (detrás del lote pendiente) y numerado (`s`, antes de trocear: las partes no lo llevan); lo grande se trocea. Antes se lee
   * como lo leería el invitado: lo que él tiraría sin avisar (algo que `parseAutoMessage` no acepta, o que no entra ni en `MAX_PARTS` partes) no se manda y el duelo se pierde.
   */
  function post(message: HostMessage) {
    flush()
    const text = encodeAutoMessage({ ...message, s: seq + 1 })

    partId = (partId % 1_000_000) + 1
    const parts = parseAutoMessage(text, MAX_WHOLE_BYTES) ? chunkAutoText(text, partId) : []

    // Lo que no se manda no gasta número: el aviso de que se perdió sale sin hueco.
    if (parts.length === 0) return lose()
    seq += 1
    parts.forEach((part) => pacer.push(part))
  }

  /** Suma un evento (y las cartas que estrena) al lote; si no entra, sale el que había. */
  function enqueue(event: AutoEvent, more: AutoCardInfo[]) {
    const bytes = JSON.stringify(event).length + JSON.stringify(more).length

    if (batchBytes + bytes > BATCH_BYTES) flush()
    batch.push(event)
    batchCards.push(...more)
    batchBytes += bytes
  }

  function flush() {
    if (batch.length === 0) return
    const message: HostMessage = { t: 'autoBatch', events: batch, ...(batchCards.length > 0 ? { cards: batchCards } : {}) }

    batch = []
    batchCards = []
    batchBytes = 0
    post(message)
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
        const data = await loader.load([hostDeck, deck])

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
    // Lo guardado ya no se puede jugar (otros datos en el despliegue, cartas sin reglas): el duelo se perdió.
    if (restoring && !next.ok) {
      restoring = null
      pending = false
      return lose()
    }
    sendCheck()
    if (pending && next.ok && room?.opening.ordered) begin()
    refresh()
  }

  /** La página se recargó con el duelo empezado (la sala ya eligió quién empieza): con lo guardado se rearma (primero se revisan los decks, que bajan los datos); sin eso, se perdió. */
  function recover() {
    const saved = options.save?.read() ?? null

    if (!saved) return lose()
    restoring = saved
    hostDeck = saved.decks.mine
    hand = saved.hand
    guestDeck = saved.decks.theirs
    pending = true
    stopWait()
    outdated = false
    void runCheck(guestDeck)
  }

  /** Lo que se guarda para rearmar el duelo: con cada respuesta aceptada (no mientras se re-simula) y con el corte del pase a manual; terminado el duelo, se borra. */
  function persist() {
    if (!options.save || !saving || !session || !seats) return
    const snap = session.getSnapshot()

    if (snap.status === 'ended' || snap.status === 'error' || (room?.conceded ?? null) !== null) {
      saving = false
      return options.save.clear()
    }
    if (snap.replaying || snap.answers === savedAnswers) return
    savedAnswers = snap.answers
    options.save.write({ v: 2, key: duelKey, seat: seats.host, hand, decks: { mine: hostDeck, theirs: remoteDeck! }, answers: [...snap.answers], savedAt: now(), ...(request.state === 'agreed' ? { cut: { dropped: request.dropped } } : {}) })
  }

  function takeDeck(message: Extract<AutoMessage, { t: 'autoDeck' }>) {
    stopWait()
    outdated = false
    if (message.v !== AUTO_PROTOCOL_VERSION) {
      checks += 1
      guestDeck = null
      check = { ok: false, mine: NONE, theirs: 0, bad: NONE, reason: 'version' }
      // A mitad de duelo (el invitado volvió con otra versión) no puede seguir jugándolo: se pierde, y en la revancha los dos ven «versión».
      if (session) lose()
      else sendCheck()
      return refresh()
    }
    guestDeck = { main: message.main, extra: message.extra }
    void runCheck(guestDeck)
  }

  function restartLog() {
    log = []
    lastStats = null
  }

  /** Cómo empieza el duelo abre un flujo nuevo (`s` 1). Sin la clave y con el Main del invitado por código: su orden es del anfitrión. */
  function sendInit() {
    if (!init || !seats) return
    const { host, guest } = seats
    const mine = init.decks[guest]!

    seq = 0
    post({ t: 'autoInit', v: AUTO_PROTOCOL_VERSION, seat: guest, players: [init.players[0]!, init.players[1]!], mine: { main: bagOrder(mine.main), extra: mine.extra }, theirs: { main: init.decks[host]!.main.length, extra: init.decks[host]!.extra.length } })
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

  /**
   * El duelo se perdió (el anfitrión recargó, el núcleo se cayó, algo no se pudo mandar): los dos lo ven y la sala sigue. El núcleo se para (la mesa queda a la vista) y lo
   * guardado se borra: rearmarlo al recargar volvería a perderlo.
   */
  function lose() {
    if (lost) return
    lost = true
    saving = false
    session?.destroy()
    options.save?.clear()
    sendCheck()
    refresh()
  }

  /**
   * Lo que cuenta el núcleo, al invitado: lo de su asiento, el fin, la carga y lo que corta el duelo; cada evento en el registro. Re-simulando (cancelar, rearmar lo guardado)
   * va en lotes, como la reposición. La sesión avisa antes de procesar cada evento: el que cierra la re-emisión (una pregunta) entra al lote, que sale al terminar (`onSession`);
   * si la cierra el `waiting` del asiento del anfitrión, la pregunta del invitado ya va suelta, detrás.
   */
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

    log.push(event)
    if (session?.getSnapshot().replaying) enqueue(event, more)
    else post({ t: 'autoEvent', event, ...(more.length > 0 ? { cards: more } : {}) })
  }

  /** Re-emite el registro en `autoBatch` (cada evento tal cual, en orden), con las cartas otra vez: quien vuelve puede ser una página nueva. */
  function sendLog() {
    for (const event of log) enqueue(event, fresh(event))
    flush()
  }

  /** El invitado pide el duelo de nuevo: si se puede jugar y, si hay duelo, cómo empezó, cuántas preguntas suyas ya pasaron y todo lo que se le mandó desde la última tanda. */
  function resend() {
    // Re-simulando, el registro está a medio armar: se manda entero cuando termina.
    if (!lost && session?.getSnapshot().replaying) {
      resendLater = true
      return sendCheck()
    }
    // Lo que todavía no salió se repite entero: dos pedidos seguidos no apilan el registro dos veces. La reposición es un flujo nuevo (`s` desde 1), haya duelo o no.
    flush()
    pacer.clear()
    seq = 0
    sendCheck()
    sent = new Set()
    if (lost || !session || !init) return
    sendInit()
    const asks = log.filter((event) => event.t === 'ask').length

    post({ t: 'autoReplay', skip: Math.max(0, asks - (session.getSnapshot().remoteAsk ? 1 : 0)) })
    sendLog()
    request.repeat()
  }

  /**
   * El corte del pase a manual: con el núcleo quieto (una pregunta esperando) el `yes` va detrás de todo lo que contó y desde ahí no recibe nada más (`watch`). Lo que quedó a medio
   * jugar se descarta. Pensando todavía, se espera a la próxima pregunta (`onSession`). No se corta con el duelo terminado ni con una carta bajo el control del otro.
   */
  function cut() {
    const snap = session?.getSnapshot()

    if (request.state !== 'switching') return
    if (!snap || lost || snap.status === 'ended' || snap.status === 'error' || (room?.conceded ?? null) !== null) return request.refused()
    if (snap.replaying || (!snap.ask && !snap.remoteAsk)) return
    if (underControl(snap.mine) || underControl(snap.theirs)) return request.refused('control')
    request.agreed(midPlay(snap))
    // Lo guardado dice que se cortó: si el anfitrión recarga antes de pasar, rearma el duelo cortado.
    savedAnswers = null
    persist()
  }

  function drop() {
    unwatch()
    unwatch = () => {}
    session?.destroy()
    session = null
    seats = null
    init = null
    batch = []
    batchCards = []
    batchBytes = 0
  }

  /** El `create` que manda la sesión es el duelo que se le cuenta al invitado (`autoInit`, sin la clave): los mismos decks y el mismo orden. Pasando a manual, el núcleo no recibe más respuestas. */
  const watch = (inner: HostTransport): HostTransport => ({
    send(command) {
      if (command.t === 'answer' && request.frozen) return
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

    // Terminó la re-emisión: sale lo que quedó en el lote.
    if (snap && !snap.replaying) flush()
    if (snap?.status === 'error') lose()
    if (resendLater && snap && !snap.replaying) {
      resendLater = false
      resend()
    }
    cut()
    if (phase() === 'ended' || phase() === 'lost') request.drop()
    persist()
    refresh()
  }

  /** Empieza el duelo (o lo rearma con lo guardado): el anfitrión es el duelista 0 de la sala y el asiento 0 del núcleo siempre empieza. */
  function begin() {
    if (!room || !guestDeck || !check?.ok) {
      pending = true
      return
    }
    const saved = restoring

    pending = false
    restoring = null
    drop()
    lost = false
    request.reset()
    if (saved?.cut) request.restore(saved.cut.dropped)
    const host: Seat = saved?.seat ?? (room.starter === 0 ? 0 : 1)

    seats = { host, guest: (1 - host) as Seat }
    remoteDeck = saved?.decks.theirs ?? guestDeck
    restartLog()
    sent = new Set()
    heldRetry = null
    resendLater = false
    saving = true
    savedAnswers = null
    // Una clave nueva por duelo y por revancha; rearmando, la de lo guardado (el mismo duelo).
    duelKey = saved?.key ?? newKey()
    session = createAutoSession({
      loader,
      deck: hostDeck,
      key: duelKey,
      seat: host,
      handSize: hand,
      remote: { deck: remoteDeck, onReplay: (skip) => void post({ t: 'autoReplay', skip }) },
      transport: (data) => watch(options.makeTransport(data)),
      onEvent: forward,
      ...(saved ? { restore: { answers: saved.answers } } : {}),
    })
    unwatch = session.subscribe(onSession)
  }

  function receive(text: string) {
    if (destroyed || !isAutoText(text) || !room?.settings.auto) return
    const message = parseAutoMessage(text)

    if (!message || !HOST_ACCEPTS.includes(message.t)) return
    if (message.t === 'autoDeck') {
      if (deckLimit.allow(now())) takeDeck(message)
    } else if (message.t === 'autoAnswer') {
      if (!request.frozen) session?.answerRemote(message.askId, message.answer)
    } else if (message.t === 'autoResync') {
      if (resyncLimit.allow(now())) resend()
    } else if (message.t === 'autoManual' && manualLimit.allow(now()) && (message.step !== 'ask' || phase() === 'playing')) request.receive(message)
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
      if (!next.peerPresent && before?.peerPresent) request.drop()
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
        } else if (!session) recover()
      } else if (!next.opening.ordered && before?.opening.ordered) {
        // La revancha: la sala vuelve a definir quién empieza; el próximo `ordered` arma otra sesión, con otra clave.
        drop()
        pending = false
        lost = false
        request.reset()
        sendCheck()
      }
      // Rendirse termina el duelo para la sala: lo guardado ya no sirve (y un pedido de pasar a manual tampoco: no se corta un duelo terminado).
      cut()
      if (phase() === 'ended' || phase() === 'lost') request.drop()
      persist()
      refresh()
    },
    resync() {
      if (!destroyed && room?.settings.auto) resend()
    },
    manual(yes) {
      if (!destroyed && (!yes || (phase() === 'playing' && room?.peerPresent))) request.want(yes)
    },
    destroy() {
      destroyed = true
      checks += 1
      stopWait()
      request.destroy()
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
 * mesas; el Main por código, sin orden), y del anfitrión sólo cuántas cartas tiene (ceros: el adaptador del rival sólo necesita cuántas). Sus filas, para nombres y rótulos; si
 * no llegan, la pantalla tiene los nombres del builder. Los decks van en el orden de las listas pedidas (la mía y la del rival), como `loader.load`: la sesión los pone en el
 * orden de los asientos.
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
  // El número de orden del último mensaje aplicado (0: ninguno todavía) y si falta algo (`stale`: nada se aplica hasta el próximo flujo, que se pide cada `STALE_PING_MS`).
  let last = 0
  let stale = false
  let ping: ReturnType<typeof setTimeout> | undefined
  // Un anfitrión modificado tampoco puede preguntar sin parar.
  const manualLimit = new RateLimiter(now(), 1, 4)

  const phase = (): OnlinePhase => {
    if (lost) return 'lost'
    if (session) return sessionPhase(session, room)
    if (!room?.settings.auto) return 'idle'
    if (check) return !check.ok ? 'blocked' : room.opening.ordered ? 'starting' : 'ready'

    return asked ? 'checking' : 'idle'
  }
  const refresh = () =>
    store.set({
      phase: phase(),
      problems: lost ? { mine: NONE, theirs: 0, reason: 'lost' } : check ? { mine: check.mine, theirs: check.theirs, reason: check.reason } : NO_PROBLEMS,
      session,
      cards,
      seat,
      manual: request.state,
      manualDropped: request.dropped,
    })
  const send = (message: AutoMessage) => transport.send(encodeAutoMessage(message))
  const request = manualRequest(false, send, refresh)

  /** Al entrar o volver: mi deck (lo revisa el anfitrión) y el duelo, si hay uno. */
  function hello() {
    if (now() - lastHello < HELLO_GAP_MS) return
    lastHello = now()
    asked = true
    const rows = (list: DeckList['main'] = []) => list.map(([code, copies]): [number, number] => [code, copies])

    send({ t: 'autoDeck', v: AUTO_PROTOCOL_VERSION, main: rows(options.deck.main), extra: rows(options.deck.extra) })
    send({ t: 'autoResync' })
  }

  /** Falta algo: pide el duelo de nuevo (sin el deck) ahora y cada `STALE_PING_MS`, hasta que llegue otro flujo. Con el mismo respiro que `hello`. */
  function nudge() {
    clearTimeout(ping)
    ping = setTimeout(nudge, STALE_PING_MS)
    if (now() - lastHello < HELLO_GAP_MS) return
    lastHello = now()
    send({ t: 'autoResync' })
  }

  function caughtUp() {
    stale = false
    clearTimeout(ping)
    ping = undefined
  }

  /**
   * Si el mensaje viene en orden (ver `s` en `online-protocol.ts`): `1` abre un flujo y es la base nueva; el que sigue al último se aplica; otro (un hueco, uno repetido o
   * de un flujo viejo; sin número) deja al invitado sin aplicar nada hasta el próximo `1`. Un websocket no duplica ni desordena: lo que llega fuera de orden no se aplica nunca.
   */
  function inOrder(s: number | undefined): boolean {
    if (s === 1) {
      last = 1
      caughtUp()
      return true
    }
    if (!stale && s === last + 1) {
      last = s
      return true
    }
    if (!stale) {
      stale = true
      nudge()
    }
    return false
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
    // Pasando a manual, el anfitrión ya no las recibe (cortó): tampoco se mandan.
    const port = relayTransport((askId, answer) => {
      if (!request.frozen) send({ t: 'autoAnswer', askId, answer })
    })

    relay = port
    // Sin la clave: el deck propio es bolsa desde el arranque (`typeOf` lo dice: es el invitado).
    session = createAutoSession({
      loader: guestLoader(init, source),
      deck: options.deck,
      seat: init.seat,
      handSize: init.players[init.seat].hand,
      typeOf: (code) => cards.get(code)?.type ?? 0,
      transport: port.factory,
    })
    unwatch = session.subscribe(onSession)
    refresh()
  }

  /** Terminado el duelo, un pedido de pasar a manual ya no va. */
  function onSession() {
    if (phase() === 'ended' || phase() === 'lost') request.drop()
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
    if (message.t === 'autoPart') {
      const whole = parts.push(message)
      const inner = whole === null ? null : parseAutoMessage(whole, MAX_WHOLE_BYTES)

      if (inner && inner.t !== 'autoPart') handle(inner)
      return
    }
    if (!isHostMessage(message)) return
    // Un anfitrión de otra versión no numera (o numera distinto): lo único que se le lee es que no es la misma versión.
    if (message.t === 'autoCheck' && message.v !== AUTO_PROTOCOL_VERSION) {
      check = { ok: false, mine: NONE, theirs: 0, reason: 'version' }
      return refresh()
    }
    if (!inOrder(message.s)) return
    switch (message.t) {
      case 'autoCheck':
        // El anfitrión perdió el duelo: la revisión de los decks sigue valiendo para el próximo.
        if (message.reason === 'lost') lost = true
        else check = { ok: message.ok, mine: message.bad, theirs: message.theirsBad, reason: message.reason ?? null }
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

      case 'autoManual':
        if (manualLimit.allow(now()) && (message.step !== 'ask' || phase() === 'playing')) request.receive(message)
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
      if (!next.peerPresent && before?.peerPresent) request.drop()
      if (arrived && !here) hello()
      here = arrived
      // La revancha: el anfitrión arma otra sesión al próximo `ordered` y la cuenta con otro `autoInit`.
      if (!next.opening.ordered && before?.opening.ordered) {
        drop()
        // El anfitrión que perdió el duelo pudo haber recargado sin revisar mi deck: se lo mando de nuevo (aunque recién lo haya hecho al volver).
        if (lost) {
          lastHello = -Infinity
          hello()
        }
        lost = false
        request.reset()
      }
      onSession()
    },
    resync() {
      if (!destroyed && room?.settings.auto) hello()
    },
    manual(yes) {
      if (!destroyed && (!yes || (phase() === 'playing' && room?.peerPresent))) request.want(yes)
    },
    destroy() {
      destroyed = true
      request.destroy()
      caughtUp()
      drop()
      off()
      store.clear()
    },
  }
}
