import { duelTurnNumber } from './duel-turn'
import { encodeAct, mapActionIds, openPublic, type WireAct } from './mat-public'
import { matReducer, type MatAction, type MatState, type Placed } from './practice-mat'

/**
 * El replay de un duelo entero: lo que vería un espectador. Las dos mesas de arranque enmascaradas (ids opacos `cN`, como viajan por la red: `mat-public.ts`) y las jugadas
 * de los dos en orden, cada una con lo que dejó a la vista (`reveal`: id opaco → id real). Lo que nadie mostró queda boca abajo para siempre: lo oculto del rival nunca
 * estuvo en este navegador, y lo propio sólo viaja con `view: 'mine'` (la casilla «Incluir mi mano y mis cartas boca abajo»: `hidden`). No lleva la clave del duelo, las
 * respuestas del núcleo, el chat ni nada del relay: re-simular se rompería con otra versión de los datos, y la clave filtraría los dos decks.
 *
 * El lado 0 es siempre quien lo grabó (va abajo). Puro: el sobre, el enlace, el archivo y la validación están en `duel-replay-share.ts`.
 */

export type ReplaySide = 0 | 1
export type ReplayMode = 'solo-auto' | 'link-auto' | 'link'
export type ReplayView = 'public' | 'mine'
/** Una jugada: de qué lado, la jugada con ids opacos y, si mostró algo, qué (`WireAct`, en una tupla: un duelo largo tiene miles). */
export type ReplayStep = [side: ReplaySide, action: MatAction, reveal?: Record<string, string>]
/** Cómo terminó: quién ganó (2, empate) y por qué. Sin esto, se guardó a mitad del duelo. */
export interface ReplayResult {
  winner: ReplaySide | 2
  reason: 'lp' | 'deck' | 'effect' | 'concede' | 'time'
}

export interface DuelReplay {
  savedAt: string
  mode: ReplayMode
  view: ReplayView
  /** Los nombres tal como se llamaron en el duelo: quien grabó y el rival. */
  players: [string, string]
  /** De quién es el turno en la mesa de arranque (en un duelo nuevo, quien empieza). */
  starter: ReplaySide
  /** La mesa de arranque de cada lado, enmascarada, y lo que ya se veía en ella. */
  sides: [{ initial: MatState; reveal: Record<string, string> }, { initial: MatState; reveal: Record<string, string> }]
  steps: ReplayStep[]
  /** Las vidas: `[at, lado 0, lado 1]` desde `at` jugadas (la primera, con `at` 0). */
  life: [at: number, lp0: number, lp1: number][]
  /** El nombre de cada carta que aparece (por passcode): el replay se lee sin los datos del deck de nadie. */
  cards: Record<string, string>
  /** Sólo con `view: 'mine'`: el id real de las cartas propias que estuvieron en la mano o boca abajo. */
  hidden?: Record<string, string>
  result?: ReplayResult
}

/**
 * Lo que hace falta para armar un replay desde un duelo (el productor del automático y, después, el del manual por enlace): mi mesa con sus ids reales y mis jugadas, la del
 * rival como me llegó (enmascarada, con lo que ya veía y sus `WireAct`), el orden en que pasaron (`order`) y las vidas `[mías, del rival]` con `at` contado en `order`.
 */
export interface ReplayInput {
  mode: ReplayMode
  view: ReplayView
  players: [string, string]
  starter: ReplaySide
  mine: { initial: MatState; actions: readonly MatAction[] }
  theirs: { initial: MatState; reveal?: Readonly<Record<string, string>>; acts: readonly WireAct[] }
  order: readonly ('mine' | 'theirs')[]
  life: readonly { at: number; lp: readonly [number, number] }[]
  /** El nombre de una carta por su passcode (el de los datos del duelo). */
  nameOf: (passcode: number) => string | undefined
  result?: ReplayResult
  now?: Date
}

const REAL_ID = /^card-(\d{1,12})-\d{1,4}$/
export const passcodeOf = (realId: string): number | null => {
  const match = REAL_ID.exec(realId)
  return match ? Number(match[1]) : null
}

const placedOf = (state: MatState) => [...state.mz, ...state.emz, ...state.st, state.field].filter((placed): placed is Placed => placed !== null)

/** Las cartas propias que nadie más ve: la mano, lo boca abajo del campo y del destierro. */
const secretIds = (state: MatState) => [...state.hand, ...placedOf(state).flatMap((placed) => (placed.pos === 'set' ? [placed.id] : [])), ...state.facedown]

export function buildDuelReplay(input: ReplayInput): DuelReplay {
  const { mine, theirs } = input
  const opened = openPublic(mine.initial)
  const { opaque } = opened.sender
  // Mis cartas, por el id opaco que tienen en el replay; las del rival que controlo (`f.c12`) y las suyas (`c12`) quedan como están.
  const toOpaque = (id: string) => (id.startsWith('f.') && opaque[id.slice(2)] ? `f.${opaque[id.slice(2)]}` : (opaque[id] ?? id))
  const secret = new Set<string>(input.view === 'mine' ? secretIds(mine.initial) : [])
  const steps: ReplayStep[] = []
  let sender = opened.sender
  let state = mine.initial
  let mineAt = 0
  let theirsAt = 0
  const push = (side: ReplaySide, wire: WireAct) => steps.push(Object.keys(wire.reveal).length > 0 ? [side, wire.action, { ...wire.reveal }] : [side, wire.action])

  for (const who of input.order) {
    if (who === 'mine') {
      const action = mine.actions[mineAt++]
      if (!action) break
      const encoded = encodeAct(sender, state, action)

      sender = encoded.sender
      state = matReducer(state, action)
      push(0, encoded.wire)
      if (input.view === 'mine') secretIds(state).forEach((id) => secret.add(id))
    } else {
      const wire = theirs.acts[theirsAt++]
      if (!wire) break
      // Lo del rival que toca mis cartas (mi monstruo que controla, al que ataca) las nombra con su id real: en el replay, con el opaco.
      const action = mapActionIds(wire.action, toOpaque)

      push(1, { action: action.type === 'attack' && action.target ? { ...action, target: toOpaque(action.target) } : action, reveal: wire.reveal })
    }
  }

  const hidden = Object.fromEntries([...secret].flatMap((id) => (opaque[id] && REAL_ID.test(id) ? [[opaque[id], id] as const] : [])))
  const reveals = [opened.reveal, theirs.reveal ?? {}, ...steps.map((step) => step[2] ?? {}), hidden]
  const cards: Record<string, string> = {}

  for (const reveal of reveals) {
    for (const real of Object.values(reveal)) {
      const code = passcodeOf(real)
      const name = code === null ? undefined : input.nameOf(code)
      if (code !== null && name) cards[String(code)] = name
    }
  }

  const life: DuelReplay['life'] = []
  for (const { at, lp } of input.life) {
    const last = life.at(-1)
    const entry: [number, number, number] = [Math.min(at, steps.length), lp[0], lp[1]]
    if (last && last[0] === entry[0]) life[life.length - 1] = entry
    else if (!last || last[1] !== entry[1] || last[2] !== entry[2]) life.push(entry)
  }
  if (life[0]?.[0] !== 0) life.unshift([0, 8000, 8000])

  return {
    savedAt: (input.now ?? new Date()).toISOString(),
    mode: input.mode,
    view: input.view,
    players: input.players,
    starter: input.starter,
    sides: [
      { initial: opened.masked, reveal: opened.reveal },
      { initial: theirs.initial, reveal: { ...(theirs.reveal ?? {}) } },
    ],
    steps,
    life,
    cards,
    ...(input.view === 'mine' ? { hidden } : {}),
    ...(input.result ? { result: input.result } : {}),
  }
}

// ── Mirarlo ──

export interface ReplayFrame {
  /** Las dos mesas, por lado. */
  states: [MatState, MatState]
  /** Lo que se sabe de cada lado: id opaco → id real. */
  known: [Record<string, string>, Record<string, string>]
  lp: [number, number]
  /** De quién es el turno y cuál es (contado con las dos mesas, como en el duelo). */
  turn: ReplaySide
  turnNumber: number
}

/** Cada cuántas jugadas se guarda una foto para saltar sin aplicar todo desde el principio. */
const CHECKPOINT_EVERY = 100

function lifeAt(replay: DuelReplay, cursor: number): [number, number] {
  let lp: [number, number] = [replay.life[0]?.[1] ?? 0, replay.life[0]?.[2] ?? 0]
  for (const [at, a, b] of replay.life) {
    if (at > cursor) break
    lp = [a, b]
  }
  return lp
}

/** El turno según las dos mesas: el de arranque es de `starter`, y cambia cada vez que la cuenta de `duel-turn.ts` sube. */
function turnOf(replay: DuelReplay, states: [MatState, MatState]): { turn: ReplaySide; turnNumber: number } {
  const turnNumber = duelTurnNumber(states[0], states[1])
  const passed = turnNumber - duelTurnNumber(replay.sides[0].initial, replay.sides[1].initial)
  return { turn: (passed % 2 === 0 ? replay.starter : 1 - replay.starter) as ReplaySide, turnNumber }
}

type Walk = { at: number; states: [MatState, MatState]; known: [Record<string, string>, Record<string, string>] }

function step(walk: Walk, [side, action, reveal]: ReplayStep): void {
  walk.states[side] = matReducer(walk.states[side], action)
  if (reveal) {
    const known = walk.known[side]
    // La primera revelación manda (como en el espejo del duelo).
    for (const [opaque, real] of Object.entries(reveal)) if (!Object.hasOwn(known, opaque)) known[opaque] = real
  }
  walk.at += 1
}

const start = (replay: DuelReplay): Walk => ({ at: 0, states: [replay.sides[0].initial, replay.sides[1].initial], known: [{ ...replay.sides[0].reveal }, { ...replay.sides[1].reveal }] })
const copy = (walk: Walk): Walk => ({ at: walk.at, states: [walk.states[0], walk.states[1]], known: [{ ...walk.known[0] }, { ...walk.known[1] }] })

/**
 * Las fotos para saltar (`duelReplayAt`), una cada `CHECKPOINT_EVERY` jugadas, y `visit` en cada jugada con la mesa de su lado antes de jugarla y el número de turno
 * en que cae (para la línea de tiempo y el texto de cada paso). Una sola pasada.
 */
export function walkReplay(replay: DuelReplay, visit?: (index: number, before: MatState, turnNumber: number) => void): Walk[] {
  const walk = start(replay)
  const shots: Walk[] = [copy(walk)]

  replay.steps.forEach((item, index) => {
    visit?.(index, walk.states[item[0]], duelTurnNumber(walk.states[0], walk.states[1]))
    step(walk, item)
    if (walk.at % CHECKPOINT_EVERY === 0) shots.push(copy(walk))
  })
  return shots
}

/** Cómo está el duelo después de `cursor` jugadas: aplica las jugadas con `matReducer` desde el arranque (o desde la foto más cercana de `walkReplay`). */
export function duelReplayAt(replay: DuelReplay, cursor: number, shots?: readonly Walk[]): ReplayFrame {
  const to = Math.max(0, Math.min(cursor, replay.steps.length))
  const shot = shots?.[Math.floor(to / CHECKPOINT_EVERY)]
  const walk = shot && shot.at <= to ? copy(shot) : start(replay)

  while (walk.at < to) step(walk, replay.steps[walk.at]!)

  return { states: walk.states, known: walk.known, lp: lifeAt(replay, to), ...turnOf(replay, walk.states) }
}
