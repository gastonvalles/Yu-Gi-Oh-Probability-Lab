import type { GameEntry, RpsPick, SignalId } from '../../app/duel-games'
import type { Duelist } from '../../app/life-calculator'
import { t } from '../../i18n'

/** Los textos de los juegos de la mesa: cada elección y cada señal, y cómo se cuenta cada cosa en el registro. */

const RPS_NAME: Record<RpsPick, () => string> = {
  rock: () => t('duel.games.rps.rock'),
  paper: () => t('duel.games.rps.paper'),
  scissors: () => t('duel.games.rps.scissors'),
}

const SIGNAL_TEXT: Record<SignalId, () => string> = {
  think: () => t('duel.games.signal.think'),
  respond: () => t('duel.games.signal.respond'),
  pass: () => t('duel.games.signal.pass'),
  thanks: () => t('duel.games.signal.thanks'),
}

export const rpsName = (pick: RpsPick) => RPS_NAME[pick]()
export const signalText = (signal: SignalId) => SIGNAL_TEXT[signal]()

/** Cómo salió una ronda para mí. */
export const outcomeText = (outcome: 'win' | 'lose' | 'draw') => t(outcome === 'win' ? 'duel.games.rps.win' : outcome === 'lose' ? 'duel.games.rps.lose' : 'duel.games.rps.draw')

/** Qué salió al tirar la moneda o el dado (con las palabras de la calculadora de LP). */
export const tossResult = (game: Extract<GameEntry['game'], { kind: 'coin' | 'die' }>) =>
  game.kind === 'coin' ? t(game.face === 0 ? 'shell.life.coin.heads' : 'shell.life.coin.tails') : t('shell.life.die.rolled', { value: game.value })

/** Una línea del registro. La elección de piedra-papel-tijera no dice cuál fue: el resultado se cuenta cuando elijen los dos. */
export function gameText(entry: GameEntry, nameOf: (player: Duelist) => string): string {
  const name = nameOf(entry.from)
  const { game } = entry

  switch (game.kind) {
    case 'coin':
      return t('duel.games.log.coin', { name, result: tossResult(game) })
    case 'die':
      return t('duel.games.log.die', { name, value: game.value })
    case 'rps':
      return t('duel.games.log.rps', { name })
    case 'order':
      return t('duel.games.log.order', { name: nameOf(game.first) })
    case 'signal':
      return t('duel.games.log.signal', { name, signal: signalText(game.signal) })
  }
}
