import { matEffects } from '../../app/mat-effects'
import type { MatAction, MatState } from '../../app/practice-mat'
import { SPOTLIGHT_TONE, STAGE_TONE } from './MatFx'
import type { FxTone } from './practice-styles'

/**
 * El color de un paso del replay (Gastón, 2026-10-20: «nuestro reproductor solo tiene pasos violetas»): el del destello que ese paso hace en la mesa, el mismo que ya conoce quien mira
 * (`matEffects` decide qué le toca a cada jugada): activar y la Invocación Normal, dorado; la Especial, lo que se muestra y lo que va a la mano, al deck o al Extra, celeste; marcar un objetivo
 * y atacar, rojo; declarar, la Fusión y el cementerio, violeta; la Sincronía, blanco; Xyz y acoplar un material, azul índigo; el Enlace, verde agua; el destierro, ámbar.
 * Un paso sin destello (colocar boca abajo, cambiar de posición, un contador, barajar) y los cambios de fase y de turno no tienen color: `null`, gris.
 *
 * `before` es el estado de antes del paso (de eso depende si una carta se invoca o sólo cambia de lugar).
 */
export function stepTone(before: MatState, action: MatAction): FxTone | null {
  // Un cambio de fase (y el turno que empieza con él) es una marca de la línea de tiempo, no un paso con color.
  if (action.type === 'phase') return null

  const effects = matEffects(before, action)

  if (effects.spotlight) return SPOTLIGHT_TONE[effects.spotlight.kind]
  if (effects.landing) return STAGE_TONE[effects.landing.tone]
  if (effects.showcase) return STAGE_TONE[effects.showcase.kind]
  if (effects.quiet) return STAGE_TONE[effects.quiet.kind]

  return null
}
