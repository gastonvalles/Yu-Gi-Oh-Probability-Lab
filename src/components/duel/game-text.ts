import type { GameEntry, RpsPick, TossMethod } from '../../app/duel-games'
import type { Duelist } from '../../app/life-calculator'
import { t } from '../../i18n'

/** Los textos de los juegos de la mesa: cada elección, y cómo se cuenta cada cosa en el registro. */

const RPS_NAME: Record<RpsPick, () => string> = {
  rock: () => t('duel.games.rps.rock'),
  paper: () => t('duel.games.rps.paper'),
  scissors: () => t('duel.games.rps.scissors'),
}

const METHOD_NAME: Record<TossMethod, () => string> = {
  coin: () => t('duel.opening.method.coin'),
  die: () => t('duel.opening.method.die'),
  rps: () => t('duel.opening.method.rps'),
}

export const rpsName = (pick: RpsPick) => RPS_NAME[pick]()
/** La mano de cada elección: en los botones para elegir y cuando se muestran las dos. */
export const RPS_GLYPH: Record<RpsPick, string> = { rock: '✊', paper: '✋', scissors: '✌️' }
export const methodName = (method: TossMethod) => METHOD_NAME[method]()

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
    case 'toss':
      return t('duel.games.log.toss', { name, method: methodName(game.method).toLowerCase() })
    case 'concede':
      return t(game.timeout ? 'duel.games.log.timeout' : 'duel.games.log.concede', { name })
    case 'rematch':
      return t('duel.games.log.rematch', { name })
  }
}
