import type { DuelReplay, ReplayResult, ReplaySide } from '../../app/duel-replay'
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
