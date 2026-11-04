import { duelFinished, duelResult } from './duel-games'
import type { DuelSnapshot } from './duel-session'
import type { SocketStatus } from './duel-socket'

/**
 * El único aviso de presencia de la mesa (nunca dos a la vez):
 * - `offline`: la conexión que se cayó es la propia (la barra dice cómo va).
 * - `left`: el duelo terminó y el rival no está: se fue y la sala desaparece en unos segundos (la cuenta de la pantalla del duelo).
 * - `away`: el rival se cayó en pleno duelo (o entre dos duelos de un Match) y puede volver: la mesa se repone sola.
 */
export type PresenceNotice = 'offline' | 'left' | 'away' | null

export function presenceNotice(snapshot: Pick<DuelSnapshot, 'peerPresent' | 'life' | 'conceded' | 'series'>, status: SocketStatus): PresenceNotice {
  if (status !== 'open') return 'offline'
  if (snapshot.peerPresent) return null
  return duelFinished(duelResult(snapshot.life.lp, snapshot.conceded), snapshot.series.match, snapshot.series.winner) ? 'left' : 'away'
}
