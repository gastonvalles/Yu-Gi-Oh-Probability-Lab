import { getLocale } from '../../i18n'
import type { WireAct } from '../mat-public'
import type { MatAction, MatState } from '../practice-mat'
import { createAdapter, type Adapter, type AutoOverlay } from './adapter'
import type { DataLoader, DuelData } from './auto-data'
import type { WorkerData } from './core-host.worker'
import { teamOrder, type DeckList } from './deck-map'
import { passivePolicy } from './policies'
import { parseAutoEvent, type AutoCommand, type AutoEvent, type CoreAnswer, type CoreAsk, type FaultKind, type Seat } from './protocol'

/**
 * «Jugar solo automático»: la sesión de un duelo contra el rival pasivo, sin React (F2b la lee con `useSyncExternalStore`). Junta el
 * cargador de datos, el anfitrión del núcleo (en un Worker o en el mismo proceso: `HostTransport`), un adaptador por asiento (§3.3 del
 * diseño: la mesa es una proyección de lo que cuenta el núcleo) y el rival pasivo, que contesta solo lo del asiento que no juega nadie.
 *
 * Deshacer, reiniciar y cancelar re-simulan (§3.6): el anfitrión vuelve a mandar todos los eventos desde cero, así que cada tanda nueva
 * (la marca `loading` con `done` 0) rearma los adaptadores, y las preguntas ya contestadas se saltan hasta la que espera de verdad. Mientras
 * tanto `replaying` está en `true` y no se avisa a nadie: la pantalla recibe el final (y como `initial` cambió de objeto, salta sin animar).
 * Cancelar termina el Worker (una llamada al wasm no se interrumpe) y arma otro con las respuestas de antes, menos la que estaba en vuelo.
 */

export interface HostTransport {
  send(command: AutoCommand): void
  onEvent(listener: (event: AutoEvent) => void): void
  /** Termina el anfitrión y libera el duelo (el Worker muere con él). */
  terminate(): void
}
/**
 * Arma un anfitrión nuevo. Los datos llegan como promesa: el Worker nace (y baja y compila el wasm) mientras se bajan las cartas y los
 * scripts, y los comandos esperan a los datos, en orden.
 */
export type TransportFactory = (data: Promise<Pick<DuelData, 'cards' | 'scripts'>>) => HostTransport

export type AutoStatus = 'loading' | 'ready' | 'thinking' | 'ended' | 'error'
export interface PendingAsk {
  askId: number
  /** Quién contesta: tu asiento (o el del rival, si jugás los dos: `control: 'both'`). */
  seat: Seat
  ask: CoreAsk
  /** El `desc` del título de la pregunta (`HINT_SELECTMSG`), si lo hubo. */
  title?: string
}
export interface SessionFault {
  kind: FaultKind
  message: string
  cards: number[]
}
export interface SessionAnswer {
  seat: Seat
  answer: CoreAnswer
}

export interface AutoSnapshot {
  /** `loading` hasta la primera pregunta; `ready` con una pregunta en `ask`; `thinking` si el núcleo tarda más de ~400 ms; `error` con `fault`. */
  status: AutoStatus
  seed: number
  /** Las mesas con las que arrancó el duelo (`adapter.initial`). Cambian de objeto sólo cuando la mesa se rearma (deshacer, reiniciar, cancelar). */
  initial: { mine: MatState; theirs: MatState }
  /** Todas las jugadas de tu mesa desde `initial` (`adapter.apply().mine`, acumuladas): la pantalla las reproduce de a una. */
  mineActions: readonly MatAction[]
  /** Lo mismo para el espejo de la mesa del rival (`adapter.apply().theirs`). */
  theirsActs: readonly WireAct[]
  /** Tu mesa y el espejo de la del rival al final de la última tanda (= `initial` + todas las jugadas). */
  mine: MatState
  theirs: MatState
  overlay: AutoOverlay
  /** La pregunta que espera respuesta, sólo de los asientos que juega una persona: las del rival pasivo no aparecen (las contesta la sesión). */
  ask: PendingAsk | null
  /** Lo que cortó la sesión (`status: 'error'`): `rules` (cartas sin reglas, en `cards`, antes de la primera pregunta), `setup`, `crash`, `retry`. */
  fault: SessionFault | null
  /** Lo que salió mal sin cortar el duelo (errores de un script, un `RETRY`). */
  faults: SessionFault[]
  /** Las respuestas aceptadas, de los dos asientos y en orden: con la semilla y los decks, el duelo entero. Deshacer las recorta. */
  answers: readonly SessionAnswer[]
  /** La carga de datos: archivos listos sobre los pedidos hasta ahora. */
  progress: { done: number; total: number }
  /** Re-simulando (deshacer, reiniciar, cancelar): desde el primer evento re-emitido hasta la pregunta que espera de verdad. */
  replaying: boolean
  /** Los nombres del `.cdb` de las cartas del duelo (y de las fichas). */
  names: Readonly<Record<number, string>>
}

export interface SessionOptions {
  loader: DataLoader
  /** Tu deck, como `src/data/meta-decklists.json`. */
  deck: DeckList
  transport: TransportFactory
  /** La semilla del duelo (u32); sin ella, una al azar. */
  seed?: number
  /** La mano fija: esas cartas arriba, en ese orden (passcodes del deck). */
  hand?: number[]
  /** Tu asiento: 0 (por defecto) empieza; 1 va segundo. */
  seat?: Seat
  /** `seat` (por defecto): contestás vos sólo lo de tu asiento y el rival pasivo lo suyo; `both`: las dos (para jugar los dos lados). */
  control?: 'seat' | 'both'
  /** Cada evento del anfitrión tal como llega (para un registro). */
  onEvent?: (event: AutoEvent) => void
  thinkingMs?: number
}

export interface AutoSession {
  getSnapshot(): AutoSnapshot
  subscribe(listener: () => void): () => void
  /** El adaptador vivo de tu asiento (`idAt`, `locationOf`, `codeOf`); cambia al rearmarse la mesa. */
  readonly adapter: Adapter | null
  /** Contesta la pregunta pendiente; `false` si no hay o la respuesta es de otro tipo. */
  answer(answer: CoreAnswer): boolean
  /** Vuelve a antes de tu última jugada (la última respuesta tuya a un `select_idlecmd` o `select_battlecmd`); `false` si no hay. */
  undo(): boolean
  /** Corta lo que el núcleo está pensando: deja la respuesta en vuelo y vuelve a la pregunta de antes. */
  cancel(): void
  /** Empieza de nuevo: con la misma semilla, el mismo duelo. */
  restart(seed?: number): void
  /** Al salir de la pantalla: termina el Worker y libera el duelo. */
  destroy(): void
}

/** `OcgDuelMode.MODE_MR5` del paquete (copia: la sesión corre en el hilo principal y no lo importa; un test los compara). */
export const MR5 = '190464'
const PLAYER = { lp: 8000, hand: 5, draw: 1 }
const FATAL = new Set<FaultKind>(['rules', 'setup', 'crash'])
const MAX_RETRIES = 3

type CreateCommand = Extract<AutoCommand, { t: 'create' }>

/** El Worker del navegador: el núcleo corre ahí y la pantalla no se traba (crear un duelo son ~440 ms de CPU en un celular). */
export function workerTransport(): TransportFactory {
  return (data) => {
    // El idioma va como nombre (regla de los workers, i18n-literals.test.ts): el núcleo no arma textos, pero los de `!system` serán por idioma.
    const worker = new Worker(new URL('./core-host.worker.ts', import.meta.url), { type: 'module', name: getLocale() })
    let listener: ((event: AutoEvent) => void) | null = null
    let alive = true

    worker.onmessage = (message: MessageEvent<unknown>) => {
      const event = parseAutoEvent(message.data)

      if (alive && event) listener?.(event)
    }
    worker.onerror = (error) => {
      if (alive) listener?.({ t: 'fault', kind: 'crash', message: `worker error: ${error.message}` })
    }
    // Si los datos no llegan, la sesión ya lo dice (y termina el Worker): acá no hay nada que mandar.
    let ready = data.then(
      (loaded) => worker.postMessage({ t: 'data', cards: loaded.cards, scripts: loaded.scripts } satisfies WorkerData),
      () => {},
    )

    return {
      send: (command) => void (ready = ready.then(() => void (alive && worker.postMessage(command)))),
      onEvent: (next) => void (listener = next),
      terminate: () => {
        alive = false
        worker.terminate()
      },
    }
  }
}

const emptyAdapter = () => createAdapter({ seat: 0, mine: { deck: [], extra: [] }, theirs: { deck: 0, extra: 0 }, typeOf: () => 0 })

export function createAutoSession(options: SessionOptions): AutoSession {
  const { loader, transport: makeTransport } = options
  const me: Seat = options.seat ?? 0
  const controlled = (seat: Seat) => options.control === 'both' || seat === me
  const thinkingMs = options.thinkingMs ?? 400
  const passive = passivePolicy()
  const listeners = new Set<() => void>()
  const blank = emptyAdapter()
  let snapshot: AutoSnapshot = {
    status: 'loading',
    seed: (options.seed ?? Math.floor(Math.random() * 2 ** 32)) >>> 0,
    initial: blank.initial,
    mineActions: [],
    theirsActs: [],
    mine: blank.mine,
    theirs: blank.theirs.state,
    overlay: blank.overlay,
    ask: null,
    fault: null,
    faults: [],
    answers: [],
    progress: { done: 0, total: 0 },
    replaying: false,
    names: {},
  }
  let data: DuelData | null = null
  let create: CreateCommand | null = null
  let transport: HostTransport | null = null
  /** Un adaptador por asiento del núcleo; el de `me` es la mesa que se muestra. */
  let adapters: Adapter[] = []
  let typeOf = (_code: number) => 0
  /** Las tandas pedidas (create / rewind) que todavía no empezaron, con cuántas respuestas re-simula cada una. Sólo cuenta la última. */
  let streams: number[] = []
  /** Lo que llega es de la tanda vigente. */
  let current = false
  /** Preguntas de la tanda vigente que ya se contestaron (las re-simula el anfitrión): se saltan. */
  let skip = 0
  let answers: SessionAnswer[] = []
  let inFlight: (SessionAnswer & { askId: number }) | null = null
  let retries = 0
  let timer: ReturnType<typeof setTimeout> | undefined
  let destroyed = false

  function set(patch: Partial<AutoSnapshot>, notify = true) {
    snapshot = { ...snapshot, ...patch }
    if (notify) listeners.forEach((listener) => listener())
  }

  const view = () => ({ mine: adapters[me]!.mine, theirs: adapters[me]!.theirs.state, overlay: adapters[me]!.overlay })

  function stopTimer() {
    clearTimeout(timer)
    timer = undefined
  }

  function startTimer() {
    stopTimer()
    timer = setTimeout(() => set({ status: 'thinking' }), thinkingMs)
  }

  /** La sesión se corta: el anfitrión se termina (nada más se contesta) hasta `restart` o `cancel`, que arman otro. */
  function fail(kind: FaultKind, message: string, cards: number[] = []) {
    stopTimer()
    transport?.terminate()
    set({ status: 'error', fault: { kind, message, cards }, ask: null, replaying: false })
  }

  /** La mesa desde cero (una tanda nueva): adaptadores nuevos y ninguna jugada. Sin avisar: si es una re-simulación, se avisa al final. */
  function project() {
    const command = create!

    adapters = ([0, 1] as const).map((seat) =>
      createAdapter({
        seat,
        mine: { deck: teamOrder(command, seat), extra: command.decks[seat]!.extra },
        theirs: { deck: command.decks[1 - seat]!.main.length, extra: command.decks[1 - seat]!.extra.length },
        lp: [PLAYER.lp, PLAYER.lp],
        typeOf,
      }),
    )
    set({ initial: adapters[me]!.initial, mineActions: [], theirsActs: [], ...view() }, false)
  }

  /** Un anfitrión nuevo (otro Worker): arma el duelo con las primeras `to` respuestas ya dadas. Lo que mande el anterior ya no se escucha. */
  function boot(to: number) {
    transport?.terminate()
    transport = makeTransport(Promise.resolve(data!))
    transport.onEvent(receive)
    streams = [to]
    current = false
    transport.send(to > 0 ? { ...create!, answers: answers.slice(0, to).map((item) => item.answer) } : create!)
  }

  function send(seat: Seat, askId: number, answer: CoreAnswer) {
    inFlight = { seat, askId, answer }
    transport!.send({ t: 'answer', askId, answer })
    startTimer()
  }

  function commit() {
    if (!inFlight) return
    answers = [...answers, { seat: inFlight.seat, answer: inFlight.answer }]
    inFlight = null
    retries = 0
  }

  /** Lo que cuenta el núcleo, a los dos adaptadores; las jugadas de mi asiento se acumulan para la pantalla. */
  function apply(event: AutoEvent) {
    const out = adapters[me]!.apply(event)

    adapters[1 - me]!.apply(event)
    set(
      {
        ...view(),
        ...(out.mine.length > 0 ? { mineActions: snapshot.mineActions.concat(out.mine) } : {}),
        ...(out.theirs.length > 0 ? { theirsActs: snapshot.theirsActs.concat(out.theirs) } : {}),
      },
      !snapshot.replaying,
    )
  }

  function receive(event: AutoEvent) {
    if (destroyed || snapshot.status === 'error') return
    options.onEvent?.(event)

    // Sin datos, sin duelo o con el núcleo caído no hay tanda que esperar (aunque venga de una vieja).
    if (event.t === 'fault' && FATAL.has(event.kind)) return fail(event.kind, event.message, event.cards)
    if (event.t === 'loading') {
      if (event.done !== 0) return
      const to = streams.shift() ?? 0

      current = streams.length === 0
      if (current) {
        project()
        skip = to
      }
      return
    }
    if (!current) return

    switch (event.t) {
      case 'events':
      case 'stats':
        return apply(event)

      case 'end':
        commit()
        stopTimer()
        apply(event)
        return set({ status: 'ended', ask: null, replaying: false, answers })

      case 'ask': {
        if (skip > 0) {
          skip -= 1
          return
        }
        commit()
        stopTimer()
        // El rival pasivo contesta solo; la pantalla se entera recién con la pregunta tuya.
        if (!controlled(event.seat)) return send(event.seat, event.askId, passive(event.ask))

        return set({ status: 'ready', ask: { askId: event.askId, seat: event.seat, ask: event.ask, ...(event.title === undefined ? {} : { title: event.title }) }, replaying: false, answers })
      }

      case 'fault': {
        const fault = { kind: event.kind, message: event.message, cards: event.cards ?? [] }

        // Re-simulando, una respuesta rechazada es que el duelo ya no es el mismo (y el anfitrión deja de re-simular).
        if ((event.kind === 'retry' || event.kind === 'answer') && (skip > 0 || snapshot.replaying)) return fail('crash', `replay diverged: ${event.message}`)
        // En vivo, la respuesta no vale: el anfitrión vuelve a preguntar.
        if (event.kind === 'retry') {
          inFlight = null
          retries += 1
          if (retries >= MAX_RETRIES) return fail('retry', `the core rejected ${MAX_RETRIES} answers in a row: ${event.message}`)
        }

        // Re-simulando vuelven los mismos errores de scripts: ya están anotados.
        return snapshot.replaying ? undefined : set({ faults: [...snapshot.faults, fault] })
      }
    }
  }

  async function start() {
    const loading = (async () => {
      const { filler } = await loader.manifest()
      const rival: DeckList = { main: filler.map((code) => [code, 1] as const) }

      return loader.load([options.deck, rival], (done, total) => set({ progress: { done, total } }))
    })()

    // El anfitrión arranca ya: el Worker baja y compila el wasm mientras llegan los datos.
    transport = makeTransport(loading)
    transport.onEvent(receive)
    try {
      data = await loading
    } catch (error) {
      return fail('setup', `could not load the duel data: ${error instanceof Error ? error.message : String(error)}`)
    }
    if (destroyed) return
    const [mine, theirs] = data.decks as [DuelData['decks'][number], DuelData['decks'][number]]
    const bad = [...new Set([...mine.missing, ...mine.noRules, ...theirs.missing, ...theirs.noRules])]

    // Ante la duda no se automatiza: una carta sin datos o sin script no deja crear el duelo.
    if (bad.length > 0) return fail('rules', `cards without automatic rules: ${mine.missing.length + theirs.missing.length} without data, ${mine.noRules.length + theirs.noRules.length} without a script`, bad)
    const types = new Map(data.cards.map((card) => [card.code, card.type]))
    const decks = [
      { main: mine.main, extra: mine.extra, hand: options.hand ?? [] },
      { main: theirs.main, extra: theirs.extra, hand: [] },
    ]

    typeOf = (code) => types.get(code) ?? 0
    // El asiento 0 del núcleo siempre empieza: tu deck va ahí, salvo que vayas segundo.
    create = { t: 'create', seed: snapshot.seed, flags: MR5, players: [PLAYER, PLAYER], decks: me === 0 ? decks : [decks[1]!, decks[0]!] }
    try {
      teamOrder(create, me)
    } catch (error) {
      return fail('setup', error instanceof Error ? error.message : String(error))
    }
    set({ names: data.names })
    streams = [0]
    transport.send(create)
  }

  void start()

  return {
    getSnapshot: () => snapshot,
    subscribe(listener) {
      listeners.add(listener)

      return () => listeners.delete(listener)
    },
    get adapter() {
      return adapters[me] ?? null
    },
    answer(answer) {
      const pending = snapshot.ask

      if (!pending || snapshot.status !== 'ready' || answer.type !== pending.ask.type) return false
      set({ ask: null })
      send(pending.seat, pending.askId, answer)

      return true
    },
    undo() {
      const all = inFlight ? [...answers, inFlight] : answers
      const to = all.findLastIndex((item) => controlled(item.seat) && (item.answer.type === 'select_idlecmd' || item.answer.type === 'select_battlecmd'))

      if (to < 0 || !transport || snapshot.status === 'error') return false
      answers = all.slice(0, to)
      inFlight = null
      streams.push(to)
      transport.send({ t: 'rewind', to })
      set({ ask: null, replaying: true, status: snapshot.status === 'ended' ? 'thinking' : snapshot.status, answers })
      startTimer()

      return true
    },
    cancel() {
      if (!create || !data || destroyed) return
      inFlight = null
      set({ ask: null, replaying: true, status: 'thinking', fault: null })
      boot(answers.length)
      startTimer()
    },
    restart(seed = snapshot.seed) {
      if (!create || !data || destroyed) return
      create = { ...create, seed: seed >>> 0 }
      answers = []
      inFlight = null
      retries = 0
      stopTimer()
      set({ seed: create.seed, status: 'loading', ask: null, fault: null, faults: [], answers, replaying: true })
      boot(0)
    },
    destroy() {
      destroyed = true
      stopTimer()
      transport?.terminate()
      listeners.clear()
    },
  }
}
