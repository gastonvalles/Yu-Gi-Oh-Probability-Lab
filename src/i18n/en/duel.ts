import type { duel as es } from '../es/duel'
import type { Translated } from '../types'

export const duel: Translated<typeof es> = {
  'duel.table.label': 'Duel table',
  'duel.table.theirs': "Opponent's field",
  'duel.table.mine': 'Your field',
  'duel.zone.theirs': 'Opponent, {zone}',
  'duel.zone.conflict': '{zone}: both players are using it',
  'duel.hand.theirs': "Opponent's hand: {count}",
  'duel.phase.current': 'Current phase: {phase}',
}
