import { t } from '../../i18n'
import type { MatCardKind, MatState } from '../practice-mat'
import type { NormalPlay } from './adapter'

/**
 * Por qué una carta tuya no tiene jugadas ahora, con lo que la mesa sabe con certeza (`docs/motor-de-cartas.md`: sólo lo comprobado al 100 %). Cada razón es un hecho, no una
 * suposición: el turno es del rival; en tus jugadas del turno, ya hiciste la Invocación Normal (un monstruo de la mano) o tus cinco zonas de esa clase están ocupadas. Lo que
 * no se sabe (un costo, una condición, el nivel) no se dice: la pantalla dice entonces que el automático no la ofrece. Las restricciones del núcleo van aparte (`overlay.limits`).
 */
export interface NoPlaysInput {
  state: MatState
  id: string
  kind: Pick<MatCardKind, 'monster' | 'fieldSpell'>
  turnMine: boolean
  /** La pregunta que se te muestra ahora (`select_idlecmd`: tus jugadas del turno), o null. */
  ask: string | null
  /** Tu primera Invocación Normal o Colocación de un monstruo de este turno (`overlay.normal`). */
  normal: NormalPlay | null
}

export function turnReasons({ state, id, kind, turnMine, ask, normal }: NoPlaysInput): string[] {
  if (!turnMine) return [t('auto.why.rivalTurn')]
  if (ask !== 'select_idlecmd' || !state.hand.includes(id)) return []
  if (kind.monster) return [...(normal ? [t(normal === 'summon' ? 'auto.why.summoned' : 'auto.why.set')] : []), ...(state.mz.every(Boolean) ? [t('auto.why.monsterZones')] : [])]

  return !kind.fieldSpell && state.st.every(Boolean) ? [t('auto.why.spellZones')] : []
}
