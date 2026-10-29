import { buildDuelReplay, type DuelReplay, type ReplayMode, type ReplayResult, type ReplayView } from '../duel-replay'
import { publicIds } from '../mat-public'
import type { AutoSnapshot } from './auto-session'
import { REASON_DECK, REASON_LP, SCRIPT_REASON } from './end-reasons'
import type { Seat } from './protocol'

/**
 * El replay de un duelo automático (solo o por enlace), sacado del snapshot de la sesión: ya viene después de deshacer (lo deshecho no está), con mi mesa de ids reales
 * y la del rival como me la contó el adaptador (sólo lo que el núcleo dejó ver). La cadena y el ATK/DEF del momento no van: el replay muestra la mesa (sin ATK/DEF
 * antes que el impreso, que podría mentir) y cada jugada dice qué se activó.
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

export function replayFromAuto(snap: Pick<AutoSnapshot, 'initial' | 'mineActions' | 'theirsActs' | 'order' | 'lifeSteps' | 'names' | 'status' | 'overlay'>, options: AutoReplayOptions): DuelReplay {
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
  })
}
