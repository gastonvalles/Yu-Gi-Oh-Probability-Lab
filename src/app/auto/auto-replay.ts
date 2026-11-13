import { buildDuelReplay, passcodeOf, type DuelReplay, type ReplayChainStep, type ReplayMode, type ReplayResult, type ReplaySide, type ReplayView } from '../duel-replay'
import { publicIds } from '../mat-public'
import { matReducer, replayMat, type MatAction, type MatState } from '../practice-mat'
import { comboExtraIds, type ComboExtras, type ComboTheirStep } from '../saved-combos'
import type { AutoSnapshot } from './auto-session'
import type { ChainStep } from './chain-feed'
import { REASON_DECK, REASON_LP, SCRIPT_REASON } from './end-reasons'
import type { Seat } from './protocol'

/**
 * El replay de un duelo automático (solo o por enlace), sacado del snapshot de la sesión: ya viene después de deshacer (lo deshecho no está), con mi mesa de ids reales
 * y la del rival como me la contó el adaptador (sólo lo que el núcleo dejó ver). El ATK/DEF del momento no va: el replay muestra la mesa (sin ATK/DEF antes que el
 * impreso, que podría mentir) y cada jugada dice qué se activó; la cadena sí (`replayChain`: la escena y los medallones).
 */
export interface AutoReplayOptions {
  seat: Seat
  mode: Exclude<ReplayMode, 'link'>
  view: ReplayView
  players: [string, string]
  /** El código de una carta del rival por su id (`adapter.codeOf`): lo que ya se veía de su mesa de arranque (un duelo que sigue de uno manual). */
  theirCode?: (id: string) => number
  /** Cómo terminó si no lo dice el núcleo (el duelo por enlace: alguien se rindió o se acabó el tiempo), por lado (0, quien graba). */
  result?: ReplayResult
}

/** Por qué terminó según el núcleo. */
function coreResult(snap: Pick<AutoSnapshot, 'status' | 'overlay'>, seat: Seat): ReplayResult | undefined {
  const end = snap.status === 'ended' ? snap.overlay.end : null
  if (!end) return undefined
  const winner = end.winner === 2 ? 2 : end.winner === seat ? 0 : 1
  const loser = winner === 2 ? null : winner === 0 ? 1 - seat : seat

  return { winner, reason: end.reason === REASON_LP || (loser !== null && snap.overlay.lp[loser]! <= 0) ? 'lp' : end.reason === REASON_DECK || end.reason < SCRIPT_REASON ? 'deck' : 'effect' }
}

export function replayFromAuto(snap: Pick<AutoSnapshot, 'initial' | 'mineActions' | 'theirsActs' | 'order' | 'lifeSteps' | 'names' | 'status' | 'overlay' | 'chainSteps'>, options: AutoReplayOptions): DuelReplay {
  const { seat, theirCode } = options
  const seen: Record<string, string> = {}

  // Lo que ya se veía de la mesa del rival al arrancar (sólo en un duelo que sigue de uno manual: en uno nuevo todo está en su deck).
  if (theirCode) {
    const counts = new Map<number, number>()
    for (const id of publicIds(snap.initial.theirs)) {
      const code = theirCode(id)
      if (!code) continue
      counts.set(code, (counts.get(code) ?? 0) + 1)
      seen[id] = `card-${code}-${counts.get(code)!}`
    }
  }
  const result = options.result ?? coreResult(snap, seat)

  return buildDuelReplay({
    mode: options.mode,
    view: options.view,
    players: options.players,
    // El asiento 0 es el que tiene el turno al arrancar (el que empieza, o el que seguía de la mesa manual).
    starter: seat === 0 ? 0 : 1,
    mine: { initial: snap.initial.mine, actions: snap.mineActions },
    theirs: { initial: snap.initial.theirs, reveal: seen, acts: snap.theirsActs },
    order: snap.order,
    life: snap.lifeSteps.map(({ at, lp }) => ({ at, lp: [lp[seat]!, lp[1 - seat]!] as const })),
    nameOf: (code) => snap.names[code],
    ...(result ? { result } : {}),
    chain: replayChain(snap.chainSteps),
  })
}

/**
 * Lo que un combo grabado en «Jugar solo automático» guarda del duelo (`ComboExtras`): las jugadas del combo son las tuyas desde la `skip` (la mano de apertura plegada) y son
 * `count`. El rival, sólo si su campo tuvo algo: su mesa al empezar (con lo de antes del combo aplicado) y sus jugadas hasta que empieza su turno (en el tuyo no cambia de fase),
 * cada una con cuántas tuyas van antes. La cadena, los mensajes del mismo tramo con `at` en jugadas del combo. Los nombres, los de sus cartas que se vieron. Sólo lo que el
 * snapshot ya trae: lo que nunca se mostró queda con su id opaco.
 */
/** Una carta del rival que nadie vio ni nombró (el adaptador numera las suyas desde `c1`). */
const HIDDEN = 'c0'

export function comboExtrasFromAuto(snap: Pick<AutoSnapshot, 'initial' | 'theirsActs' | 'order' | 'chainSteps' | 'names'>, skip: number, count: number): ComboExtras {
  const before: MatAction[] = []
  const reveal: Record<string, string> = {}
  const steps: ComboTheirStep[] = []
  let mine = 0
  let theirs = 0
  let end = snap.order.length

  for (let at = 0; at < snap.order.length; at += 1) {
    if (snap.order[at] === 'mine') {
      mine += 1
      if (mine - skip > count) {
        end = at
        break
      }
      continue
    }
    const wire = snap.theirsActs[theirs++]
    if (!wire) break
    const step = mine - skip
    if (step < 1) {
      before.push(wire.action)
      Object.assign(reveal, wire.reveal)
    } else if (wire.action.type === 'phase') {
      end = at
      break
    } else steps.push(Object.keys(wire.reveal).length > 0 ? [step, wire.action, { ...wire.reveal }] : [step, wire.action])
  }

  const start = replayMat(snap.initial.theirs, before)
  // ponytail: lo boca abajo de su Deck, su mano y su Extra que ninguna jugada del combo nombra va como `HIDDEN` repetido: se ve cuántas tiene, no cuál es (un id opaco no dice nada) y el
  // enlace no carga ~60 ids sueltos. Si un día el combo deja tocar su mano o su Deck, que lo nombrado siga con su id (ya lo hace).
  const named = new Set([...Object.keys(reveal), ...(JSON.stringify(steps).match(/"c\d+"/g) ?? []).map((text) => text.slice(1, -1))])
  const hide = (ids: readonly string[]) => ids.map((id) => (named.has(id) ? id : HIDDEN))
  const initial = { ...start, deck: hide(start.deck), hand: hide(start.hand), extra: hide(start.extra) }
  const onField = (state: MatState) => [...state.mz, ...state.emz, ...state.st, state.field].some(Boolean)
  let state = initial
  let touched = onField(state)
  for (const [, action] of steps) {
    state = matReducer(state, action)
    touched ||= onField(state)
  }
  const chain = replayChain(snap.chainSteps.flatMap((item) => (item.seq !== undefined && item.seq <= end && item.at - skip >= 1 ? [{ ...item, seq: item.at - skip }] : [])))
  const comboTheirs = touched ? { initial, reveal, steps } : undefined
  const names = Object.fromEntries(comboExtraIds({ ...(comboTheirs ? { theirs: comboTheirs } : {}), chain }).flatMap((id) => {
    const name = snap.names[passcodeOf(id) ?? -1]
    return name ? [[id, name] as const] : []
  }))

  return { ...(comboTheirs ? { theirs: comboTheirs } : {}), ...(chain.length > 0 ? { chain } : {}), names }
}

/** La cadena del replay: cada mensaje en su lugar de `order` (`seq`; el adaptador siempre lo anota) y los lados contados desde quien graba (0). */
export function replayChain(steps: readonly ChainStep[]): ReplayChainStep[] {
  const sideOf = (side: 'mine' | 'theirs'): ReplaySide => (side === 'mine' ? 0 : 1)

  return steps.flatMap(({ kind, seq, index, link, by, outcome }) =>
    seq === undefined
      ? []
      : [
          {
            at: seq,
            kind,
            index,
            ...(link ? { link: { code: link.code, side: link.mine ? 0 : 1, ...(link.place ? { place: [sideOf(link.place.side), link.place.location, link.place.sequence] as [ReplaySide, number, number] } : {}) } } : {}),
            ...(by ? { by } : {}),
            ...(outcome ? { outcome } : {}),
          } satisfies ReplayChainStep,
        ],
  )
}
