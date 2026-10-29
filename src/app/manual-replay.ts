import { duelResult } from './duel-games'
import { buildDuelReplay, passcodeOf, type DuelReplay, type ReplayResult, type ReplayView } from './duel-replay'
import type { DuelSnapshot } from './duel-session'

/**
 * El replay de un duelo manual por enlace, sacado del snapshot de la sesión: mi mesa y mis jugadas, y del rival lo que anotó el registro (`DuelRecord`). Con un corte (se perdió
 * algo del rival) llega hasta ahí y no dice cómo terminó: el final no está en lo grabado.
 */
type Source = Pick<DuelSnapshot, 'record' | 'initial' | 'actions' | 'me' | 'starter' | 'life' | 'conceded' | 'timeUp'>

/** Se puede grabar: hay registro y ya llegaron las dos mesas de arranque. */
export const canReplay = (snap: Source) => Boolean(snap.record?.theirs && snap.initial)

/** Los passcodes de las cartas que el rival mostró: sus nombres se piden aparte (no están en mi deck). */
export function theirCodes(snap: Pick<DuelSnapshot, 'record'>): number[] {
  const theirs = snap.record?.theirs
  const reals = theirs ? [theirs.reveal, ...theirs.acts.map((act) => act.reveal)].flatMap((reveal) => Object.values(reveal)) : []
  return [...new Set(reals.flatMap((real) => passcodeOf(real) ?? []))]
}

function resultOf(snap: Source): ReplayResult | undefined {
  const result = duelResult(snap.life.lp, snap.conceded)
  if (!result) return undefined
  if (result.kind === 'draw') return { winner: 2, reason: 'lp' }
  return { winner: result.loser === snap.me ? 1 : 0, reason: snap.conceded === null ? 'lp' : snap.timeUp ? 'time' : 'concede' }
}

export function replayFromManual(snap: Source, options: { view: ReplayView; players: [string, string]; nameOf: (passcode: number) => string | undefined }): DuelReplay | null {
  const { record, initial } = snap
  if (!record?.theirs || !initial) return null
  const result = record.cut ? undefined : resultOf(snap)

  return buildDuelReplay({
    mode: 'link',
    ...options,
    starter: snap.starter === snap.me ? 0 : 1,
    mine: { initial, actions: snap.actions },
    theirs: record.theirs,
    order: record.order,
    life: record.life,
    ...(result ? { result } : {}),
  })
}
