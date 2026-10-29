import { passcodeOf, type DuelReplay, type ReplayFrame, type ReplayResult, type ReplaySide, type ReplayStep } from '../../app/duel-replay'
import { describeMatAction, type MatState } from '../../app/practice-mat'
import { t } from '../../i18n'

/** El nombre de un jugador del replay; «Jugar solo» no tiene nombres: «Duelista» y «Rival», en el idioma de quien mira. */
export const playerName = (replay: Pick<DuelReplay, 'players'>, side: ReplaySide) => replay.players[side] || (side === 0 ? t('duel.lobby.defaultName') : t('duel.bar.rival'))

/** «Ana vs Beto». */
export const titleOf = (replay: Pick<DuelReplay, 'players'>) => `${playerName(replay, 0)} vs ${playerName(replay, 1)}`

/** «Ganó Ana · sin puntos de vida», «Empate» o «Sin terminar». */
export function replayResultText(replay: Pick<DuelReplay, 'players'> & { result?: ReplayResult | undefined }): string {
  const { result } = replay
  if (!result) return t('meta.duels.unfinished')
  if (result.winner === 2) return t('meta.duels.draw')
  return `${t('meta.duels.won', { name: playerName(replay, result.winner) })} · ${t(`meta.duels.reason.${result.reason}`)}`
}

/** El id real de una carta de un lado: lo que mostró ese lado (o, si es una del otro que controla —`f.c12`—, lo que mostró su dueño) y, con «mi mano», lo oculto de quien grabó. */
export function realOf(replay: DuelReplay, frame: ReplayFrame, side: ReplaySide, id: string): string | undefined {
  const owner = (id.startsWith('f.') ? 1 - side : side) as ReplaySide
  const own = id.startsWith('f.') ? id.slice(2) : id
  return frame.known[owner][own] ?? (owner === 0 ? replay.hidden?.[own] : undefined)
}

/** El nombre de una carta de un lado, con lo que se sabe en `frame` (lo que nadie mostró: «Carta»). */
export const cardName = (replay: DuelReplay, frame: ReplayFrame, side: ReplaySide) => (id: string) => {
  const code = passcodeOf(realOf(replay, frame, side, id) ?? '')
  return (code !== null ? replay.cards[String(code)] : undefined) ?? t('practice.card.unknown')
}

/**
 * «Ana: Invocación Normal de X»: la línea de una jugada, la misma en el reproductor y en el video. `before` es la mesa del lado que jugó antes de la jugada y `after`, el duelo
 * después (lo que mostró ya la nombra). A quién ataca es del otro lado, con el id que le dio su dueño: se nombra con lo que se sabe de ese lado.
 */
export function stepText(replay: DuelReplay, step: ReplayStep, before: MatState, after: ReplayFrame): string {
  const [side, action] = step
  const own = cardName(replay, after, side)
  const other = cardName(replay, after, (1 - side) as ReplaySide)
  const nameOf = (id: string) => (action.type === 'attack' && id === action.target ? other(id) : own(id))
  return `${playerName(replay, side)}: ${describeMatAction(before, action, nameOf)}`
}
