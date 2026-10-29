import type { DuelReplay } from '../../../app/duel-replay'
import { safeFileName } from '../../../app/combo-share'
import type { MatAction } from '../../../app/practice-mat'

/**
 * Cuánto se ve cada cuadro del video de un replay. Corte seco entre jugadas: un cuadro por jugada que dura lo que dura la jugada (cuadros de duración variable: casi
 * todo el video la imagen está quieta, y un cuadro repetido no agrega nada). Una jugada dura lo del reproductor (`STEP_MS`); un cambio de fase o un barajado, que no
 * mueven nada a la vista, menos. Al principio, la mesa al empezar con los nombres; al final, el resultado.
 */

export const STEP_MS = 900
const QUICK_MS = 400
export const INTRO_MS = 2000
export const OUTRO_MS = 3000

/** Lo que pasa sin que se mueva una carta: va más rápido. */
const quick = (action: MatAction) => action.type === 'phase' || action.type === 'shuffle'

export const stepMs = (action: MatAction) => (quick(action) ? QUICK_MS : STEP_MS)

/** Cuánto dura el cuadro de cada cursor (0 = la mesa al empezar, `steps.length` = la última jugada, que se queda con el resultado). */
export function frameDurations(replay: Pick<DuelReplay, 'steps'>): number[] {
  const steps: number[] = replay.steps.map(([, action]) => stepMs(action))
  if (steps.length === 0) return [INTRO_MS + OUTRO_MS]
  steps[steps.length - 1] = OUTRO_MS
  return [INTRO_MS, ...steps]
}

/** «Ana vs Beto 2026-10-29.mp4», sin lo que un sistema de archivos no acepta (como el nombre del archivo del replay). */
export const videoFileName = (replay: Pick<DuelReplay, 'savedAt'>, title: string) => safeFileName(`${title} ${replay.savedAt.slice(0, 10)}`, 'duelo', '.mp4')
