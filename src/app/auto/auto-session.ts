import { getLocale } from '../../i18n'
import type { WireAct } from '../mat-public'
import { createMatState, type MatAction, type MatState } from '../practice-mat'
import { copyIds, createAdapter, type Adapter, type AutoOverlay } from './adapter'
import { DataUnavailableError, type DataLoader, type DuelData } from './auto-data'
import type { ChainStep } from './chain-feed'
import type { WorkerData } from './core-host.worker'
import { bagOrder, teamOrder, type DeckList } from './deck-map'
import { handtrapPolicy, passivePolicy, randomLegalPolicy, type RivalPolicy } from './policies'
import { parseAutoEvent, type AutoCommand, type AutoEvent, type CoreAnswer, type CoreAsk, type FaultKind, type Seat } from './protocol'
import { RESUME_FLAGS, setupOf } from './resume'

/**
 * «Jugar solo automático»: la sesión de un duelo contra el rival, sin React (F2b la lee con `useSyncExternalStore`). Junta el
 * cargador de datos, el anfitrión del núcleo (en un Worker o en el mismo proceso: `HostTransport`), un adaptador por asiento (§3.3 del
 * diseño: la mesa es una proyección de lo que cuenta el núcleo) y el rival, que contesta solo lo del asiento que no juega nadie: el
 * pasivo o, con `rival`, el de handtraps (`handtrapPolicy`, que decide con lo que ve su adaptador).
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

/** `waiting`: (sólo con `remote`) la pregunta viva es del otro asiento, una persona en otro navegador. */
export type AutoStatus = 'loading' | 'ready' | 'thinking' | 'waiting' | 'ended' | 'error'
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
  /** Una activación que elegiste fuera de tus jugadas (responder en una cadena, «¿Activás el efecto?»; no una obligatoria): `undo` también vuelve a antes de ésta. */
  activation?: true
}

/**
 * La carta que activás (o invocás de forma especial: las que brillan) con esta respuesta, por código; null si no es eso (pasar, cambiar de fase, invocar de forma normal, una activación
 * obligatoria). Es lo que se avisa con «Deshacer» y, fuera de tus jugadas, lo que `undo` marca (`activation`).
 */
export function activatedCode(ask: CoreAsk, answer: CoreAnswer): number | null {
  if (ask.type === 'select_idlecmd' && answer.type === ask.type && answer.index !== null) return (answer.action === 5 ? ask.activates : answer.action === 1 ? ask.special_summons : [])[answer.index]?.code ?? null
  if (ask.type === 'select_battlecmd' && answer.type === ask.type && answer.action === 0 && answer.index !== null) return ask.chains[answer.index]?.code ?? null
  if (ask.type === 'select_chain' && answer.type === ask.type && !ask.forced && answer.index !== null) return ask.selects[answer.index]?.code ?? null
  if (ask.type === 'select_effectyn' && answer.type === ask.type && answer.yes) return ask.code

  return null
}

/** Una respuesta a la que `undo` vuelve: una jugada (`select_idlecmd` / `select_battlecmd`) o una activación elegida (`activation`). */
export const undoPoint = (item: SessionAnswer) => item.activation === true || item.answer.type === 'select_idlecmd' || item.answer.type === 'select_battlecmd'

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
  /** De quién fue cada jugada (`mineActions` y `theirsActs` intercaladas como pasaron, `adapter.apply().order`): al pasar a manual, Deshacer vuelve atrás la última de cualquiera. */
  order: readonly ('mine' | 'theirs')[]
  /** Los mensajes de la cadena desde `initial`, en orden, con `at` contado en `mineActions` (`adapter.apply().chain`): el aviso de la cadena los muestra de a uno. */
  chainSteps: readonly ChainStep[]
  /** Tu mesa y el espejo de la del rival al final de la última tanda (= `initial` + todas las jugadas). */
  mine: MatState
  theirs: MatState
  overlay: AutoOverlay
  /** La pregunta que espera respuesta, sólo de los asientos que juega una persona: las del rival pasivo no aparecen (las contesta la sesión). */
  ask: PendingAsk | null
  /** La pregunta que espera el asiento remoto (sólo con `remote`): la pantalla dice «X está eligiendo». */
  remoteAsk: PendingAsk | null
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
  /** Los rótulos de los efectos (`str1`…`str16` del `.cdb`), por código: el `desc` de una pregunta nombra la carta y cuál (`splitDesc`). */
  texts: Readonly<Record<number, readonly string[]>>
  /** Lo que el adaptador no pudo proyectar en la mesa, en orden (se vacía al rearmarse). */
  unmapped: readonly string[]
  /** Con el rival de handtraps, su mano como la ve él (códigos, en su orden): la pantalla la muestra salvo «A ciegas». Vacía con el pasivo. */
  rivalHand: readonly number[]
  /**
   * Dónde empieza cada jugada tuya en `mineActions`: cuántas había al llegar cada pregunta de jugada tuya (`select_idlecmd` / `select_battlecmd`) de la tanda vigente, sin
   * repetir (la última es la que espera, si `ask` es una de ésas). Recortar ahí da la mesa de deshacer hasta esa pregunta: «Seguir en manual» vuelve atrás así, sin el núcleo.
   */
  playStarts: readonly number[]
}

export interface SessionOptions {
  loader: DataLoader
  /** Tu deck, como `src/data/meta-decklists.json`. */
  deck: DeckList
  transport: TransportFactory
  /** La semilla del duelo (u32); sin ella, una al azar. */
  seed?: number
  /**
   * El anfitrión del duelo por enlace: la clave del duelo (`duel-key.ts`, 256 bits), de la que salen las barajas y el estado del núcleo en lugar de la semilla, que con clave vale 0
   * y no se usa (32 bits se prueban todos desde la mano de arranque). Va en cada `create`, también al reiniciar, cancelar y deshacer, y nunca en el snapshot.
   */
  key?: string
  /** La mano fija: esas cartas arriba, en ese orden (passcodes del deck). */
  hand?: number[]
  /** Cuántas cartas robás al empezar (la mano de apertura del Lab); el rival, 5. */
  handSize?: number
  /** Tu asiento: 0 (por defecto) empieza; 1 va segundo. */
  seat?: Seat
  /** `seat` (por defecto): contestás vos sólo lo de tu asiento y el rival lo suyo; `both`: las dos (para jugar los dos lados). */
  control?: 'seat' | 'both'
  /**
   * El rival con handtraps (`autoRival` de `handtraps.ts`): esas cartas van en su deck antes del relleno (que lo completa hasta su tamaño), su mano de arranque es
   * `hand(semilla)` y las usa con `handtrapPolicy`, en el orden de `main`. Sin esto, el rival pasivo de 40 Normales.
   */
  rival?: { main: readonly (readonly [number, number])[]; hand: (seed: number) => number[] } | null
  /** Cada evento del anfitrión tal como llega (para un registro). */
  onEvent?: (event: AutoEvent) => void
  thinkingMs?: number
  /**
   * El duelo por enlace: el otro asiento es una persona en otro navegador. Su deck entero va tal cual (sin relleno) y sus preguntas no las contesta ninguna política: quedan en
   * `remoteAsk` hasta que llegue `answerRemote`. `onReplay(skip)` avisa, antes de cada re-emisión (deshacer, cancelar, reiniciar, rearmar), cuántas respuestas de ese asiento vienen ya dadas.
   */
  remote?: { deck: DeckList; onReplay?: (skip: number) => void }
  /** El invitado del duelo por enlace: `loader` no trae las cartas del rival; el tipo de las que el flujo deja ver llega por acá (el adaptador lo necesita al instante). */
  typeOf?: (code: number) => number
  /** Rearmar un duelo guardado: las respuestas ya dadas (de los dos asientos, en orden) se re-simulan antes de la primera pregunta viva. */
  restore?: { answers: readonly SessionAnswer[] }
  /**
   * Pasar de manual a automático (`resume.ts`): el duelo no empieza de cero sino desde estas dos mesas (`mine` con los ids de la mesa manual; `theirs` la del rival con los suyos, o nada en «Jugar solo»: el rival arranca con todo en su deck y, con handtraps, su mano),
   * con `codeOf` para saber el código de cada id (0 = oculta para este asiento) y las vidas de cada lado. Nadie baraja ni roba: el núcleo arranca en el turno 1, Draw Phase de
   * `seat` (el que tiene el turno), y pasa a su Main Phase 1; lo del turno en curso se reinicia (`docs/duelos-automaticos.md`). `rivalHand`: en jugar solo con handtraps, la mano
   * que el rival tenía en la mesa manual (sus códigos), en vez de la que reparte la semilla.
   */
  resume?: {
    mine: MatState
    theirs?: MatState
    codeOf: (side: 'mine' | 'theirs', id: string) => number
    lp: readonly [number, number]
    /** Jugar solo: la mano de handtraps que el rival tenía en la mesa manual (códigos; las usadas ya no están). */
    rivalHand?: number[]
    /** El duelo por enlace: el otro asiento como se ve a sí mismo (lo que el invitado arma de su `autoInit`), para que `viewOf` sea su mesa; sin esto, las mismas dos mesas dadas vuelta. */
    rival?: { mine: MatState; theirs: MatState; codeOf: (side: 'mine' | 'theirs', id: string) => number }
  }
}

export interface AutoSession {
  getSnapshot(): AutoSnapshot
  subscribe(listener: () => void): () => void
  /** El adaptador vivo de tu asiento (`idAt`, `locationOf`, `codeOf`); cambia al rearmarse la mesa. */
  readonly adapter: Adapter | null
  /** Contesta la pregunta pendiente; `false` si no hay o la respuesta es de otro tipo. */
  answer(answer: CoreAnswer): boolean
  /**
   * Vuelve a antes de tu última jugada (la última respuesta tuya a un `select_idlecmd` o `select_battlecmd`) o de tu última activación elegida (`activation`: responder en una cadena,
   * también en el turno del rival), también con el núcleo caído o trabado (`crash`, `retry`); `false` si no hay. Con `seat`, la de ese asiento (el anfitrión del duelo por enlace:
   * la del invitado, con su acuerdo).
   */
  undo(seat?: Seat): boolean
  /** Corta lo que el núcleo está pensando: deja la respuesta en vuelo y vuelve a la pregunta de antes. */
  cancel(): void
  /** Empieza de nuevo: con la misma semilla, el mismo duelo. Si los datos no llegaron, los vuelve a pedir. */
  restart(seed?: number): void
  /** La respuesta del asiento remoto a `remoteAsk`; `false` si no es la pendiente o es de otro tipo. */
  answerRemote(askId: number, answer: CoreAnswer): boolean
  /** El invitado: lo que sigue es una re-emisión desde cero con `skip` preguntas mías ya contestadas (no se avisa a nadie hasta la viva). */
  expectReplay(skip: number): void
  /** Sólo para pruebas: la mesa, el espejo y el overlay de `seat` como los proyecta esta sesión (el anfitrión calcula la vista del invitado: tiene que ser la que el invitado arma). */
  viewOf?(seat: Seat): { mine: MatState; theirs: MatState; overlay: AutoOverlay } | null
  /** Al salir de la pantalla: termina el Worker y libera el duelo. */
  destroy(): void
}

/** `OcgDuelMode.MODE_MR5` del paquete (copia: la sesión corre en el hilo principal y no lo importa; un test los compara). */
export const MR5 = '190464'
const PLAYER = { lp: 8000, hand: 5, draw: 1 }
/** `PHASE_*` del núcleo por fase de la mesa (el primer paso de la Battle Phase). */
const CORE_PHASE: Record<MatState['phase'], number> = { draw: 1, standby: 2, main1: 4, battle: 8, main2: 0x100, end: 0x200 }
const FATAL = new Set<FaultKind>(['rules', 'setup', 'crash'])
const MAX_RETRIES = 3
/** Las preguntas cuya respuesta es una jugada (`playStarts`). */
const PLAY_ASKS = new Set<string>(['select_idlecmd', 'select_battlecmd'])

type CreateCommand = Extract<AutoCommand, { t: 'create' }>

/** El Worker del navegador: el núcleo corre ahí y la pantalla no se traba (crear un duelo son ~440 ms de CPU en un celular). */
export function workerTransport(): TransportFactory {
  return (data) => {
    // El idioma va como nombre (regla de los workers, i18n-literals.test.ts): el núcleo no arma textos, pero los de `!system` serán por idioma.
    const worker = new Worker(new URL('./core-host.worker.ts', import.meta.url), { type: 'module', name: getLocale() })
    let listener: ((event: AutoEvent) => void) | null = null
    let alive = true

    worker.onmessage = (message: MessageEvent<unknown>) => {
      // Un evento que no se lee deja un hueco (una pregunta, una tanda): con él el duelo no puede seguir, y tirarlo callado dejaría la mesa «pensando».
      if (alive) listener?.(parseAutoEvent(message.data) ?? { t: 'fault', kind: 'crash', message: 'unreadable event from the core worker' })
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
  /** El duelo por enlace (el anfitrión con `remote`, el invitado con `typeOf`): el otro asiento es una persona, y cuando elige ella se espera (`waiting`). */
  const online = options.remote !== undefined || options.typeOf !== undefined
  /**
   * El asiento del invitado del duelo por enlace (el remoto para el anfitrión, el mío para el invitado): su deck es bolsa desde el arranque y va por código, porque la semilla no
   * viaja y el invitado no sabe su orden; el anfitrión lo proyecta igual, así la vista que calcula para él es la que él arma.
   */
  const bagged: Seat | null = options.remote ? ((1 - me) as Seat) : options.typeOf ? me : null
  const thinkingMs = options.thinkingMs ?? 400
  // En el duelo por enlace el otro asiento es una persona: ni handtraps ni relleno.
  const rival = options.remote ? null : (options.rival ?? null)
  const resume = options.resume ?? null
  /** Con la mesa rearmada, el núcleo todavía va por una fase anterior a la de la mesa (las pasa al empezar; las fases del núcleo crecen con la del turno). */
  const catchingUp = () => adapters[me] !== undefined && adapters[me]!.overlay.phase < (CORE_PHASE[adapters[me]!.mine.phase] ?? 0)
  const policy: RivalPolicy = rival ? handtrapPolicy(rival.main.map(([code]) => code)) : passivePolicy()
  const listeners = new Set<() => void>()
  const blank = emptyAdapter()
  // La mesa del rival rearmada y el código de cada id suyo (`resume.theirs`, o la que arma `build` en jugar solo).
  let theirsState: MatState = resume?.theirs ?? blank.initial.theirs
  let theirsCode = (id: string) => resume?.codeOf('theirs', id) ?? 0
  let snapshot: AutoSnapshot = {
    status: 'loading',
    seed: options.key !== undefined ? 0 : (options.seed ?? Math.floor(Math.random() * 2 ** 32)) >>> 0,
    initial: blank.initial,
    mineActions: [],
    theirsActs: [],
    order: [],
    chainSteps: [],
    mine: blank.mine,
    theirs: blank.theirs.state,
    overlay: blank.overlay,
    ask: null,
    remoteAsk: null,
    fault: null,
    faults: [],
    answers: [],
    progress: { done: 0, total: 0 },
    replaying: false,
    names: {},
    texts: {},
    unmapped: [],
    rivalHand: [],
    playStarts: [],
  }
  let data: DuelData | null = null
  let create: CreateCommand | null = null
  /** El `create` de una semilla (reiniciar con otra semilla le reparte otra mano al rival de handtraps). */
  let build: ((seed: number) => CreateCommand) | null = null
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
  /** La última respuesta que el núcleo rechazó (en JSON): la de reserva del rival no la repite. */
  let rejected: string | null = null
  let timer: ReturnType<typeof setTimeout> | undefined
  let destroyed = false
  /** El último snapshot que se avisó: lo que llega sin cambiar nada (los `stats` y los `events` del rival, casi la mitad) no avisa, porque cada aviso es un render. */
  let published = snapshot

  /** Sin nada distinto (`Object.is`) el snapshot sigue siendo el mismo objeto (`useSyncExternalStore` compara por referencia); se avisa si cambió desde el último aviso. */
  function set(patch: Partial<AutoSnapshot>, notify = true) {
    if ((Object.keys(patch) as (keyof AutoSnapshot)[]).some((key) => !Object.is(patch[key], snapshot[key]))) snapshot = { ...snapshot, ...patch }
    if (!notify || snapshot === published) return
    published = snapshot
    listeners.forEach((listener) => listener())
  }

  const view = () => {
    const theirs = adapters[1 - me]!
    const hand = rival ? theirs.mine.hand.map((id) => theirs.codeOf({ side: 'mine', id })) : []
    const same = hand.length === snapshot.rivalHand.length && hand.every((code, i) => code === snapshot.rivalHand[i])

    return { mine: adapters[me]!.mine, theirs: adapters[me]!.theirs.state, overlay: adapters[me]!.overlay, rivalHand: same ? snapshot.rivalHand : hand }
  }

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
    // El detalle (en inglés, técnico) va a la consola (`warn`: el `[auto]` de `error` es el centinela de la mesa); la portada dice qué pasó con sus textos.
    console.warn(`[auto] ${kind}: ${message}`)
    stopTimer()
    transport?.terminate()
    set({ status: 'error', fault: { kind, message, cards }, ask: null, remoteAsk: null, replaying: false })
  }

  /** El duelo por enlace: antes de cada re-emisión, cuántas respuestas del asiento remoto vienen ya dadas en las primeras `to` (el invitado se salta esas preguntas). */
  const replayed = (to: number) => options.remote?.onReplay?.(answers.slice(0, to).filter((item) => item.seat !== me).length)

  /** La mesa desde cero (una tanda nueva): adaptadores nuevos y ninguna jugada. Sin avisar: si es una re-simulación, se avisa al final. */
  function project() {
    const command = create!

    adapters = ([0, 1] as const).map((seat) =>
      createAdapter({
        seat,
        mine: { deck: seat === bagged ? bagOrder(command.decks[seat]!.main) : teamOrder(command, seat), extra: command.decks[seat]!.extra },
        theirs: { deck: command.decks[1 - seat]!.main.length, extra: command.decks[1 - seat]!.extra.length },
        lp: resume ? (seat === me ? [...resume.lp] : [resume.lp[1], resume.lp[0]]) : [PLAYER.lp, PLAYER.lp],
        ...(resume ? { setup: seat === me ? { mine: resume.mine, theirs: theirsState, codeOf: (side, id) => (side === 'mine' ? resume.codeOf('mine', id) : theirsCode(id)) } : (resume.rival ?? { mine: theirsState, theirs: resume.mine, codeOf: (side, id) => (side === 'mine' ? theirsCode(id) : resume.codeOf('mine', id)) }) } : {}),
        typeOf,
        bag: seat === bagged,
      }),
    )
    set({ initial: adapters[me]!.initial, mineActions: [], theirsActs: [], order: [], chainSteps: [], unmapped: [], playStarts: [], ...view() }, false)
  }

  /** Un anfitrión nuevo (otro Worker): arma el duelo con las primeras `to` respuestas ya dadas. Lo que mande el anterior ya no se escucha. */
  function boot(to: number) {
    transport?.terminate()
    transport = makeTransport(Promise.resolve(data!))
    transport.onEvent(receive)
    streams = [to]
    current = false
    replayed(to)
    transport.send(to > 0 ? { ...create!, answers: answers.slice(0, to).map((item) => item.answer) } : create!)
  }

  function send(seat: Seat, askId: number, answer: CoreAnswer, activation = false) {
    inFlight = { seat, askId, answer, ...(activation ? { activation } : {}) }
    transport!.send({ t: 'answer', askId, answer })
    startTimer()
  }

  /**
   * El rival, cuando el núcleo le rechazó la respuesta (`retry`): su política es determinista y repetiría la misma (un `announce_card` sin candidatas, una suma que agota
   * la búsqueda), así que contesta una legal al azar (`randomLegalPolicy`, con la semilla del duelo, las respuestas que van y los rechazos: el mismo duelo, la misma),
   * distinta de la rechazada si la encuentra. Los `MAX_RETRIES` rechazos seguidos siguen cortando el duelo.
   */
  function fallback(ask: CoreAsk): CoreAnswer {
    const random = randomLegalPolicy((snapshot.seed ^ Math.imul(answers.length + 1, 0x9e3779b1) ^ retries) >>> 0)
    let answer = random(ask)

    for (let tries = 0; tries < 8 && JSON.stringify(answer) === rejected; tries += 1) answer = random(ask)
    return answer
  }

  function commit() {
    if (!inFlight) return
    answers = [...answers, { seat: inFlight.seat, answer: inFlight.answer, ...(inFlight.activation ? { activation: true as const } : {}) }]
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
        ...(out.order.length > 0 ? { order: snapshot.order.concat(out.order) } : {}),
        ...(out.chain.length > 0 ? { chainSteps: snapshot.chainSteps.concat(out.chain.map((step) => ({ ...step, at: step.at + snapshot.mineActions.length }))) } : {}),
        ...(out.unmapped.length > 0 ? { unmapped: snapshot.unmapped.concat(out.unmapped) } : {}),
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
        // Lo que estaba en vuelo era de una tanda vieja (el anfitrión ya la descartó): no se suma en la primera pregunta viva.
        inFlight = null
      }
      return
    }
    if (!current) return

    switch (event.t) {
      case 'events':
        apply(event)
        // La pregunta viva es del otro asiento: sin esto el invitado (que no recibe las preguntas del anfitrión) se queda «pensando» o re-simulando.
        if (online && skip === 0 && event.seat === me && event.events.some((item) => item.type === 'waiting')) {
          stopTimer()
          set({ status: 'waiting', replaying: false })
        }
        return

      case 'stats':
        return apply(event)

      case 'end':
        commit()
        stopTimer()
        apply(event)
        return set({ status: 'ended', ask: null, remoteAsk: null, replaying: false, answers })

      case 'ask': {
        const at = snapshot.mineActions.length

        // También las ya contestadas que se re-simulan: se rearman con la mesa.
        if (controlled(event.seat) && PLAY_ASKS.has(event.ask.type) && snapshot.playStarts.at(-1) !== at) set({ playStarts: [...snapshot.playStarts, at] }, false)
        if (skip > 0) {
          skip -= 1
          return
        }
        commit()
        stopTimer()
        // El duelo por enlace: la contesta una persona en otro navegador (`answerRemote`).
        if (!controlled(event.seat) && options.remote) return set({ status: 'waiting', remoteAsk: { askId: event.askId, seat: event.seat, ask: event.ask, ...(event.title === undefined ? {} : { title: event.title }) }, ask: null, replaying: false, answers })
        // El rival contesta solo, con lo que ve su adaptador (o, si el núcleo le rechazó la de recién, con la de reserva); la pantalla se entera recién con la pregunta tuya.
        if (!controlled(event.seat)) return send(event.seat, event.askId, retries > 0 ? fallback(event.ask) : policy(event.ask, adapters[event.seat]!))
        // La mesa rearmada: las ventanas de cadena de las fases que el núcleo pasa hasta alcanzar la de la mesa (Draw, Standby) no se preguntan (una forzada, sí).
        if (resume && event.ask.type === 'select_chain' && !event.ask.forced && catchingUp()) return send(event.seat, event.askId, { type: 'select_chain', index: null })

        return set({ status: 'ready', ask: { askId: event.askId, seat: event.seat, ask: event.ask, ...(event.title === undefined ? {} : { title: event.title }) }, replaying: false, answers })
      }

      case 'fault': {
        const fault = { kind: event.kind, message: event.message, cards: event.cards ?? [] }

        // Re-simulando, una respuesta rechazada es que el duelo ya no es el mismo (y el anfitrión deja de re-simular).
        if ((event.kind === 'retry' || event.kind === 'answer') && (skip > 0 || snapshot.replaying)) return fail('crash', `replay diverged: ${event.message}`)
        // En vivo, la respuesta no vale: el anfitrión vuelve a preguntar.
        if (event.kind === 'retry') {
          const remote = options.remote !== undefined && inFlight !== null && inFlight.seat !== me

          rejected = inFlight && JSON.stringify(inFlight.answer)
          inFlight = null
          retries += 1
          if (retries >= MAX_RETRIES) return fail('retry', `the core rejected ${MAX_RETRIES} answers in a row${remote ? ' from the remote seat' : ''}: ${event.message}`)
        }

        // Re-simulando vuelven los mismos errores de scripts: ya están anotados.
        return snapshot.replaying ? undefined : set({ faults: [...snapshot.faults, fault] })
      }
    }
  }

  async function start() {
    const loading = (async () => {
      const { filler } = await loader.manifest()
      // Las handtraps del rival y el relleno hasta el tamaño del deck pasivo (así roba sin quedarse sin cartas).
      const own = rival?.main ?? []
      const room = Math.max(0, filler.length - own.reduce((sum, [, copies]) => sum + copies, 0))
      const theirs: DeckList = { main: [...own, ...filler.slice(0, room).map((code) => [code, 1] as const)] }

      // En el duelo por enlace, el deck del otro (entero, sin relleno).
      return loader.load([options.deck, options.remote?.deck ?? theirs], (done, total) => set({ progress: { done, total } }))
    })()

    // El anfitrión arranca ya: el Worker baja y compila el wasm mientras llegan los datos.
    transport = makeTransport(loading)
    transport.onEvent(receive)
    try {
      data = await loading
    } catch (error) {
      // El código del servidor (`{ error }`: un despliegue sin los datos de la beta) va tal cual, y la portada lo traduce; lo demás, con el contexto.
      return fail('setup', error instanceof DataUnavailableError ? error.message : `could not load the duel data: ${error instanceof Error ? error.message : String(error)}`)
    }
    if (destroyed) return
    const [mine, theirs] = data.decks as [DuelData['decks'][number], DuelData['decks'][number]]
    const bad = [...new Set([...mine.missing, ...mine.noRules, ...theirs.missing, ...theirs.noRules])]

    // Ante la duda no se automatiza: una carta sin datos o sin script no deja crear el duelo.
    if (bad.length > 0) return fail('rules', `cards without automatic rules: ${mine.missing.length + theirs.missing.length} without data, ${mine.noRules.length + theirs.noRules.length} without a script`, bad)
    const types = new Map(data.cards.map((card) => [card.code, card.type]))
    const own = { main: mine.main, extra: mine.extra, hand: options.hand ?? [] }
    const mine_ = { ...PLAYER, hand: options.handSize ?? PLAYER.hand }

    // El invitado no tiene las cartas del rival: el tipo de las que el flujo le deja ver llega aparte.
    typeOf = (code) => types.get(code) ?? options.typeOf?.(code) ?? 0
    build = (seed) => {
      // Con handtraps, el rival roba al empezar justo su mano (la del simulador con esa semilla), que va arriba de su deck.
      const hand = resume?.rivalHand ?? rival?.hand(seed) ?? []
      const other = { main: theirs.main, extra: theirs.extra, hand }
      // En el duelo por enlace los dos roban la mano de la sala.
      const player = options.remote ? mine_ : hand.length > 0 ? { ...PLAYER, hand: hand.length } : PLAYER

      // El asiento 0 del núcleo siempre empieza: tu deck va ahí, salvo que vayas segundo.
      if (resume) {
        // Sin la mesa del rival (jugar solo), su deck entero (con las handtraps de su mano, si las hay, en la mano).
        if (!resume.theirs) {
          const ids = copyIds([...other.main, ...other.extra])
          const inHand = new Set<string>()

          for (const code of hand) {
            const id = ids.find((item, i) => i < other.main.length && !inHand.has(item) && item.startsWith(`card-${code}-`))

            if (id) inHand.add(id)
          }
          theirsState = { ...createMatState(ids.slice(0, other.main.length).filter((id) => !inHand.has(id)), ids.slice(other.main.length), 0), hand: [...inHand] }
          theirsCode = (id) => Number(id.split('-')[1] ?? 0)
        }
        // La mesa rearmada: nadie roba al empezar; las vidas van en el `setup` (y en `players`, por si acaso) y el asiento de cada mesa es el de cada uno.
        const sides = { mine: { state: resume.mine, codeOf: (id: string) => resume.codeOf('mine', id) }, theirs: { state: theirsState, codeOf: (id: string) => theirsCode(id) } }
        const lp: [number, number] = me === 0 ? [resume.lp[0], resume.lp[1]] : [resume.lp[1], resume.lp[0]]
        const still = (lifePoints: number) => ({ lp: lifePoints, hand: 0, draw: 1 })

        return { t: 'create', seed, ...(options.key === undefined ? {} : { key: options.key }), flags: RESUME_FLAGS, players: [still(lp[0]), still(lp[1])], decks: me === 0 ? [own, other] : [other, own], setup: setupOf(me === 0 ? [sides.mine, sides.theirs] : [sides.theirs, sides.mine], lp) }
      }
      return { t: 'create', seed, ...(options.key === undefined ? {} : { key: options.key }), flags: MR5, players: me === 0 ? [mine_, player] : [player, mine_], decks: me === 0 ? [own, other] : [other, own] }
    }
    create = build(snapshot.seed)
    try {
      teamOrder(create, 0)
      teamOrder(create, 1)
    } catch (error) {
      return fail('setup', error instanceof Error ? error.message : String(error))
    }
    // Rearmar un duelo guardado: el núcleo re-simula las respuestas de antes y la sesión las salta hasta la primera pregunta viva. Sin eso, `streams` queda como está:
    // vacío es la tanda del `create`, y el invitado que entra a un duelo empezado ya pidió la suya (`expectReplay`).
    answers = [...(options.restore?.answers ?? [])]
    if (answers.length > 0) streams = [answers.length]
    set({ names: data.names, texts: data.texts ?? {}, ...(answers.length > 0 ? { answers, replaying: true } : {}) })
    transport.send(answers.length > 0 ? { ...create, answers: answers.map((item) => item.answer) } : create)
    // Después del `create` (que el enlace le cuenta al invitado) y antes del primer evento, que llega después.
    if (answers.length > 0) replayed(answers.length)
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
      // Fuera de tus jugadas (que ya se deshacen por su tipo), una activación elegida también es adonde vuelve `undo`.
      send(pending.seat, pending.askId, answer, !PLAY_ASKS.has(answer.type) && activatedCode(pending.ask, answer) !== null)

      return true
    },
    undo(seat) {
      const all = inFlight ? [...answers, inFlight] : answers
      const to = all.findLastIndex((item) => (seat === undefined ? controlled(item.seat) : item.seat === seat) && undoPoint(item))

      const stuck = snapshot.status === 'error'

      // Con el duelo cortado sólo si el núcleo se cayó o se trabó (`crash`, `retry`): sin datos, sin duelo o sin reglas no hay jugada a la que volver.
      if (to < 0 || !transport || (stuck && snapshot.fault?.kind !== 'crash' && snapshot.fault?.kind !== 'retry')) return false
      answers = all.slice(0, to)
      inFlight = null
      // El anfitrión de antes se terminó (`fail`): uno nuevo, que re-simula hasta antes de esa jugada (y rearma el Worker si murió).
      if (stuck) {
        retries = 0
        set({ ask: null, remoteAsk: null, replaying: true, status: 'thinking', fault: null, answers })
        boot(to)
        startTimer()
        return true
      }
      // Lo que queda de la tanda de ahora hasta el `loading` del rewind ya no cuenta (ni se contesta: el rival sumaría una respuesta fantasma).
      current = false
      streams.push(to)
      replayed(to)
      transport.send({ t: 'rewind', to })
      // La pregunta del asiento remoto también se va: una respuesta suya que llegue tarde no cuenta.
      set({ ask: null, remoteAsk: null, replaying: true, status: snapshot.status === 'ended' ? 'thinking' : snapshot.status, answers })
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
      if (destroyed) return
      // Los datos no llegaron (`setup`): se vuelven a pedir desde el principio (el cargador no guarda lo que falló).
      if (!data && snapshot.status === 'error') {
        set({ seed: seed >>> 0, status: 'loading', fault: null, progress: { done: 0, total: 0 } })
        return void start()
      }
      if (!create || !build || !data) return
      create = build(seed >>> 0)
      answers = []
      inFlight = null
      retries = 0
      stopTimer()
      set({ seed: create.seed, status: 'loading', ask: null, fault: null, faults: [], answers, replaying: true })
      boot(0)
    },
    answerRemote(askId, answer) {
      const pending = snapshot.remoteAsk

      if (!pending || snapshot.status !== 'waiting' || askId !== pending.askId || answer.type !== pending.ask.type) return false
      set({ remoteAsk: null })
      // Como `answer`: una activación elegida del invitado es adonde vuelve deshacer su jugada.
      send(pending.seat, askId, answer, !PLAY_ASKS.has(answer.type) && activatedCode(pending.ask, answer) !== null)

      return true
    },
    expectReplay(skip) {
      streams.push(skip)
      inFlight = null
      // Como al deshacer: lo que llegue antes del `loading` de la re-emisión es de la tanda vieja.
      current = false
      set({ ask: null, replaying: true })
    },
    viewOf(seat) {
      const adapter = adapters[seat]

      return adapter ? { mine: adapter.mine, theirs: adapter.theirs.state, overlay: adapter.overlay } : null
    },
    destroy() {
      destroyed = true
      stopTimer()
      transport?.terminate()
      listeners.clear()
    },
  }
}
