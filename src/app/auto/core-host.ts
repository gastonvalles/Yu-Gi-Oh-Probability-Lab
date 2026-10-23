import createCore, {
  OcgCoreInternal,
  OcgLocation,
  OcgPosition,
  OcgProcessResult,
  OcgQueryFlags,
  OcgResponseType as R,
  ocgMessageTypeStrings,
  type InitializerSync,
  type OcgAttribute,
  type OcgCardData,
  type OcgCoreSync,
  type OcgDuelHandle,
  type OcgMessage,
  type OcgQueryFlags as QueryFlags,
  type OcgRace,
  type OcgResponse,
  type SelectFieldPlace,
} from 'ocgcore-wasm'
import { deckOrder, needsScript, scriptName } from './deck-map'
import { askFor, eventFor, statsFor } from './referee'
import {
  ASK_SHAPES,
  EVENT_SHAPES,
  IGNORED_MESSAGES,
  readShape,
  type AskType,
  type AutoCommand,
  type AutoEvent,
  type CardStat,
  type CoreAnswer,
  type CoreAsk,
  type EventType,
  type FaultKind,
  type Seat,
  type WireEvent,
} from './protocol'

/**
 * El anfitrión del núcleo: posee una instancia de `ocgcore-wasm` (build sync) y un duelo, recibe `AutoCommand` y emite `AutoEvent` ya
 * filtrados por asiento (`referee.ts`). No toca el DOM ni Node: corre igual en Vitest, en un Worker o en un servidor. Los lectores son
 * síncronos e inyectados: en Node salen de archivos, en el navegador los traerá precargados quien lo use.
 *
 * Lo que el núcleo 11.0 y el paquete 0.1.6 no hacen y se resuelve acá (medido en F0):
 * - `constant.lua` y `utility.lua` no se cargan solos; el deck inicial no se baraja (lo baraja `deckOrder` con la semilla) y siempre
 *   empieza el jugador 0 (el deck que va primero).
 * - `MSG_WIN` no corta el duelo: el fin es el primer `win`.
 * - Una instancia nueva por duelo (y por cada `rewind`). Aun así, entre dos corridas iguales el núcleo puede contar en otro orden las
 *   pistas seguidas (`PLAYER_HINT` y `CARD_HINT`, al vencer un efecto): `canonical` las ordena, así el mismo duelo da los mismos eventos.
 * - El paquete deja fijo `enableUnsafeLibraries: true` (los scripts tienen `io` y `os` de Lua): los scripts son de un clon conocido, no del usuario.
 * - `send` y `freeDuel` arreglan dos defectos del paquete (ver cada una).
 */

export interface HostOptions {
  /** Cómo se carga el wasm. Hay que pasar `wasmBinary` o `locateFile`: si faltan los dos, el paquete baja además el wasm en base64 (+344 KB, +3,5 s). */
  core: Pick<InitializerSync, 'wasmBinary' | 'locateFile' | 'instantiateWasm'>
  cardReader: (code: number) => OcgCardData | null
  /** `constant.lua`, `utility.lua` y sus bibliotecas, y `c<código>.lua`. `null` si no existe (una ficha no tiene script: es normal). */
  scriptReader: (name: string) => string | null
  emit: (event: AutoEvent) => void
  /** Para pruebas: cada mensaje del núcleo tal como llega, antes de filtrarlo (el oráculo de la información oculta lo usa). */
  tap?: (message: OcgMessage) => void
}

export interface AutoHost {
  handle(command: AutoCommand): Promise<void>
  /** Las respuestas aceptadas, en orden: con la semilla y los decks, el duelo entero. */
  readonly answers: readonly CoreAnswer[]
  /** Lo que tardó el núcleo, después de cada respuesta aceptada, en llegar a la pregunta siguiente (ms). */
  readonly timings: readonly number[]
  /** Los scripts que el núcleo pidió después de `startDuel` (las fichas, y lo que un script carga en caliente). */
  readonly hotScripts: readonly string[]
  /** El núcleo y el duelo vivos (para las pruebas que consultan el estado real). */
  readonly live: { lib: OcgCoreSync; handle: OcgDuelHandle } | null
}

type CreateCommand = Extract<AutoCommand, { t: 'create' }>

const HINT_SELECTMSG = 3
const LOG_TYPES = ['error', 'script', 'debug', 'undefined']
const ASKS = new Set(Object.keys(ASK_SHAPES))
const EVENTS = new Set(Object.keys(EVENT_SHAPES))
const IGNORED = new Set<string>(IGNORED_MESSAGES)
const STAT_FLAGS = (OcgQueryFlags.CODE | OcgQueryFlags.POSITION | OcgQueryFlags.ATTACK | OcgQueryFlags.DEFENSE | OcgQueryFlags.LEVEL) as QueryFlags

/** `bigint` → texto decimal, en profundidad: lo que el paquete decodifica, listo para JSON. */
const jsonify = (value: unknown): unknown =>
  typeof value === 'bigint' ? value.toString() : Array.isArray(value) ? value.map(jsonify) : value && typeof value === 'object' ? Object.fromEntries(Object.entries(value).map(([key, item]) => [key, jsonify(item)])) : value

/** La semilla del núcleo (Xoshiro256**, nunca toda en 0) a partir de la semilla u32 del duelo. */
const coreSeed = (seed: number): [bigint, bigint, bigint, bigint] => [BigInt(seed) + 1n, 0x9e3779b97f4a7c15n, BigInt(seed) * 0x2545f491n + 7n, 0xd1b54a32d192ed03n]

/** El handle interno del paquete (el puntero del duelo y la entrada de sus lectores). */
function internals(handle: OcgDuelHandle): { handle: number; callback: number } {
  return (handle as unknown as Record<symbol, { handle: number; callback: number }>)[Object.getOwnPropertySymbols(handle)[0]!]!
}

/**
 * Manda la respuesta. Arreglo para el paquete 0.1.6: su codificador de `SORT_CARD` (también el de `SORT_CHAIN`) antepone la cantidad
 * (`i8 n` + n bytes) y el núcleo espera sólo los n bytes (`playerop.cpp`, `sort_card`), así que todo orden explícito vuelve como `RETRY`;
 * se escriben los n bytes a mano. ponytail: parche local, sacarlo cuando el paquete lo corrija.
 */
export function send(lib: OcgCoreSync, handle: OcgDuelHandle, response: OcgResponse): void {
  if (response.type !== R.SORT_CARD || !response.order) return lib.duelSetResponse(handle, response)
  const mod = lib[OcgCoreInternal].module
  const top = mod.stackSave()
  const ptr = mod.stackAlloc(response.order.length)

  ;(mod as unknown as { HEAPU8: Uint8Array }).HEAPU8.set(Uint8Array.from(response.order), ptr)
  mod._ocgapiDuelSetResponse(internals(handle).handle, ptr, response.order.length)
  mod.stackRestore(top)
}

/** Libera el duelo y la entrada de sus lectores, que `destroyDuel` del paquete 0.1.6 deja en su `Map` interno (fuga: crece el heap con cada duelo). */
export function freeDuel(lib: OcgCoreSync, handle: OcgDuelHandle): void {
  const { callback } = internals(handle)

  lib.destroyDuel(handle)
  lib[OcgCoreInternal].callbacks.delete(callback)
}

const HINTS = new Set(['card_hint', 'player_hint'])

/** Los eventos con cada tramo de pistas seguidas (`card_hint`, `player_hint`) en un orden fijo: el núcleo no lo garantiza entre corridas. */
export function canonical(events: readonly WireEvent[]): WireEvent[] {
  const out: WireEvent[] = []

  for (let i = 0; i < events.length; ) {
    let j = i

    while (j < events.length && HINTS.has(events[j]!.type)) j += 1
    if (j === i) out.push(events[i++]!)
    else {
      out.push(...events.slice(i, j).sort((a, b) => (JSON.stringify(a) < JSON.stringify(b) ? -1 : 1)))
      i = j
    }
  }

  return out
}

/** La respuesta en el formato del paquete. */
export function toResponse(answer: CoreAnswer): OcgResponse {
  switch (answer.type) {
    case 'select_battlecmd':
      return { type: R.SELECT_BATTLECMD, action: answer.action, index: answer.index }
    case 'select_idlecmd':
      return { type: R.SELECT_IDLECMD, action: answer.action, index: answer.index }
    case 'select_effectyn':
      return { type: R.SELECT_EFFECTYN, yes: answer.yes }
    case 'select_yesno':
      return { type: R.SELECT_YESNO, yes: answer.yes }
    case 'select_option':
      return { type: R.SELECT_OPTION, index: answer.index }
    case 'select_card':
      return { type: R.SELECT_CARD, indicies: answer.indices }
    case 'select_chain':
      return { type: R.SELECT_CHAIN, index: answer.index }
    case 'select_place':
      return { type: R.SELECT_PLACE, places: answer.places as SelectFieldPlace[] }
    case 'select_disfield':
      return { type: R.SELECT_DISFIELD, places: answer.places as SelectFieldPlace[] }
    case 'select_position':
      return { type: R.SELECT_POSITION, position: answer.position as OcgPosition }
    case 'select_tribute':
      return { type: R.SELECT_TRIBUTE, indicies: answer.indices }
    case 'sort_card':
    case 'sort_chain':
      return { type: R.SORT_CARD, order: answer.order }
    case 'select_counter':
      return { type: R.SELECT_COUNTER, counters: answer.counters }
    case 'select_sum':
      return { type: R.SELECT_SUM, indicies: answer.indices }
    case 'select_unselect_card':
      return { type: R.SELECT_UNSELECT_CARD, index: answer.index }
    // El codificador junta la lista con OR: la máscara entera va como un solo elemento.
    case 'announce_race':
      return { type: R.ANNOUNCE_RACE, races: [BigInt(answer.races) as OcgRace] }
    case 'announce_attrib':
      return { type: R.ANNOUNCE_ATTRIB, attributes: [answer.attributes as OcgAttribute] }
    case 'announce_card':
      return { type: R.ANNOUNCE_CARD, card: answer.code }
    case 'announce_number':
      return { type: R.ANNOUNCE_NUMBER, value: answer.index }
    case 'rock_paper_scissors':
      return { type: R.ROCK_PAPER_SCISSORS, value: answer.value as 1 | 2 | 3 }
  }
}

export function createAutoHost(options: HostOptions): AutoHost {
  if (!options.core.wasmBinary && !options.core.locateFile) throw new Error('core-host: pass wasmBinary or locateFile (without them the package also downloads the base64 wasm)')
  const { emit } = options
  const answers: CoreAnswer[] = []
  const timings: number[] = []
  const hotScripts: string[] = []
  let live: { lib: OcgCoreSync; handle: OcgDuelHandle } | null = null
  let setup: CreateCommand | null = null
  let pending: { askId: number; seat: Seat; ask: CoreAsk; title?: string } | null = null
  let nextAskId = 1
  let started = false
  let ended = false

  const fault = (kind: FaultKind, message: string, cards?: number[]) => emit({ t: 'fault', kind, message, ...(cards ? { cards } : {}) })

  function free() {
    if (live) freeDuel(live.lib, live.handle)
    live = null
    pending = null
    started = false
    ended = false
  }

  function ask(next: { seat: Seat; ask: CoreAsk; title?: string }) {
    pending = { askId: nextAskId++, ...next }
    emit({ t: 'ask', seat: next.seat, askId: pending.askId, ask: askFor(next.seat, next.ask), ...(next.title === undefined ? {} : { title: next.title }) })
  }

  function stats(lib: OcgCoreSync, handle: OcgDuelHandle) {
    const cards: CardStat[] = []

    for (const controller of [0, 1] as const) {
      for (const location of [OcgLocation.MZONE, OcgLocation.SZONE]) {
        lib.duelQueryLocation(handle, { flags: STAT_FLAGS, controller, location }).forEach((card, sequence) => {
          if (card?.code) cards.push({ code: card.code, controller, location, sequence, position: card.position ?? 0, attack: card.attack ?? 0, defense: card.defense ?? 0, level: card.level ?? 0 })
        })
      }
    }
    for (const seat of [0, 1] as const) emit({ t: 'stats', seat, cards: statsFor(seat, cards) })
  }

  /** Corre el núcleo hasta la próxima pregunta o el fin, reparte lo que contó y pregunta. Devuelve si el núcleo rechazó la última respuesta. */
  function run(previous: typeof pending): boolean {
    const { lib, handle } = live!
    const events: [WireEvent[], WireEvent[]] = [[], []]
    let question: { seat: Seat; ask: CoreAsk } | null = null
    const titles: (string | undefined)[] = []
    let retry = false
    let win: { player: number; reason: number } | null = null
    let status: number = OcgProcessResult.CONTINUE

    try {
      while (status === OcgProcessResult.CONTINUE && !win) {
        status = lib.duelProcess(handle)
        for (const message of lib.duelGetMessage(handle)) {
          // El fin es el primer WIN: lo que el núcleo cuente después (más WIN, pistas, otra pregunta) no viaja.
          if (win) break
          const name = ocgMessageTypeStrings.get(message.type as never) as string | undefined
          const raw = message as OcgMessage & Record<string, unknown>

          options.tap?.(message)

          if (name === 'retry') retry = true
          else if (name === 'win') win ??= { player: raw.player as number, reason: raw.reason as number }
          else if (name === 'hint' && raw.hint_type === HINT_SELECTMSG) titles[raw.player as number] = String(raw.hint)
          else if (name && ASKS.has(name)) {
            const parsed = readShape(ASK_SHAPES[name as AskType], jsonify(raw))

            if (parsed) question = { seat: (raw.player as Seat) ?? 0, ask: { type: name, ...parsed } as CoreAsk }
            else fault('unhandled', `question with an unknown shape: ${name}`)
          } else if (name && EVENTS.has(name)) {
            const parsed = readShape(EVENT_SHAPES[name as EventType], jsonify(raw))

            if (!parsed) fault('unhandled', `message with an unknown shape: ${name}`)
            else {
              const event = { type: name, ...parsed } as WireEvent

              for (const seat of [0, 1] as const) {
                const seen = eventFor(seat, event)

                if (seen) events[seat].push(seen)
              }
            }
          } else if (!name || !IGNORED.has(name)) fault('unhandled', `unhandled message: ${name ?? message.type}`)
        }
      }
    } catch (error) {
      ended = true
      fault('crash', `core crashed: ${error instanceof Error ? error.message : String(error)}`)
      return false
    }

    if (question) events[1 - question.seat]!.push({ type: 'waiting' })
    for (const seat of [0, 1] as const) {
      if (events[seat].length > 0) emit({ t: 'events', seat, n: answers.length, events: canonical(events[seat]) })
    }
    stats(lib, handle)

    if (win || status === OcgProcessResult.END) {
      ended = true
      emit({ t: 'end', winner: win ? win.player : 2, reason: win ? win.reason : 0 })
    } else if (question) {
      const asked: { seat: Seat; ask: CoreAsk } = question
      const title = titles[asked.seat]

      ask({ ...asked, ...(title === undefined ? {} : { title }) })
    } else if (retry && previous) {
      fault('retry', `RETRY: the core rejected the answer to ${previous.ask.type}`)
      ask(previous)
    } else {
      ended = true
      fault('crash', 'the core is waiting without a question')
    }
    return retry && !question
  }

  function give(answer: CoreAnswer) {
    const asked = pending

    if (!asked || ended || !live) return
    if (answer.type !== asked.ask.type) {
      fault('answer', `answer ${answer.type} to a ${asked.ask.type} question`)
      return
    }
    pending = null
    answers.push(answer)
    const start = performance.now()

    send(live.lib, live.handle, toResponse(answer))
    if (run(asked)) answers.pop()
    else timings.push(performance.now() - start)
  }

  async function start(command: CreateCommand, replay: readonly CoreAnswer[]) {
    free()
    const codes = [...new Set(command.decks.flatMap((deck) => [...deck.main, ...deck.extra]))]
    const missing = codes.filter((code) => !options.cardReader(code))
    const noRules = codes.filter((code) => {
      const card = options.cardReader(code)

      return card !== null && needsScript(card) && options.scriptReader(scriptName(card)) === null
    })

    if (missing.length > 0 || noRules.length > 0) {
      fault('rules', `cards without automatic rules: ${missing.length} without data, ${noRules.length} without a script`, [...missing, ...noRules])
      return
    }

    let orders: number[][]

    try {
      orders = command.decks.map((deck, team) => deckOrder(deck.main, (command.seed + team) >>> 0, deck.hand))
    } catch (error) {
      fault('setup', error instanceof Error ? error.message : String(error))
      return
    }

    emit({ t: 'loading', done: 0, total: codes.length })
    const lib = await createCore({ sync: true, ...options.core })
    const team = (player: CreateCommand['players'][number]) => ({ startingLP: player.lp, startingDrawCount: player.hand, drawCountPerTurn: player.draw })
    const handle = lib.createDuel({
      flags: BigInt(command.flags),
      seed: coreSeed(command.seed),
      team1: team(command.players[0]!),
      team2: team(command.players[1]!),
      cardReader: (code) => options.cardReader(code),
      scriptReader: (name) => {
        if (started) hotScripts.push(name)

        return options.scriptReader(name)
      },
      errorHandler: (type, text) => fault('script', `${LOG_TYPES[type] ?? type}: ${text}`),
    })

    if (!handle) {
      fault('setup', 'createDuel returned null')
      return
    }
    live = { lib, handle }
    for (const name of ['constant.lua', 'utility.lua']) {
      const text = options.scriptReader(name)

      if (text === null || !lib.loadScript(handle, name, text)) {
        fault('setup', `could not load ${name}`)
        free()
        return
      }
    }
    // Cada carta del Main va arriba (sequence 0): se agregan al revés, así `orders[team][0]` queda arriba de todo.
    orders.forEach((order, team) => {
      for (const code of [...order].reverse()) lib.duelNewCard(handle, { team: team as Seat, duelist: 0, code, controller: team as Seat, location: OcgLocation.DECK, sequence: 0, position: OcgPosition.FACEDOWN_DEFENSE })
      for (const code of command.decks[team]!.extra) lib.duelNewCard(handle, { team: team as Seat, duelist: 0, code, controller: team as Seat, location: OcgLocation.EXTRA, sequence: 0, position: OcgPosition.FACEDOWN_DEFENSE })
    })
    lib.startDuel(handle)
    started = true
    emit({ t: 'loading', done: codes.length, total: codes.length })
    run(null)
    for (const answer of replay) give(answer)
  }

  return {
    answers,
    timings,
    hotScripts,
    get live() {
      return live
    },
    async handle(command) {
      switch (command.t) {
        case 'create':
          setup = command
          answers.length = 0
          timings.length = 0
          hotScripts.length = 0
          await start(command, [])
          break
        // Una respuesta vieja (dos toques, una reconexión) se descarta en `give`: no es la de la pregunta pendiente.
        case 'answer':
          if (pending && command.askId === pending.askId) give(command.answer)
          break
        case 'rewind':
          if (setup && command.to <= answers.length) {
            const keep = answers.slice(0, command.to)

            answers.length = 0
            timings.length = 0
            hotScripts.length = 0
            await start(setup, keep)
          }
          break
        case 'destroy':
          free()
          setup = null
          break
      }
    },
  }
}
