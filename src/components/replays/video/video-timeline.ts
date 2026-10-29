import type { DuelReplay } from '../../../app/duel-replay'
import { safeFileName } from '../../../app/combo-share'
import type { MatAction } from '../../../app/practice-mat'

/**
 * Cuánto se ve cada jugada en el video de un replay. Una jugada dura lo del reproductor (`STEP_MS`); un cambio de fase o un barajado, que no mueven nada a la vista, menos.
 * Lo que se mueve se desliza al principio de la jugada (`moveFrames` cuadros a 30 por segundo) y el resto es un solo cuadro quieto que dura lo que falta: casi todo el video
 * la imagen está quieta, y un cuadro repetido no agrega nada. Al principio, la mesa al empezar con los nombres; al final, el resultado. «Rápido (2×)»: cada jugada y cada
 * movimiento a la mitad (el título y el cierre, igual).
 */

export type VideoSpeed = 1 | 2

export const STEP_MS = 900
const QUICK_MS = 400
export const INTRO_MS = 2000
export const OUTRO_MS = 3000
/** Un cuadro de una transición, en microsegundos (30 por segundo). */
export const FRAME_US = 33_333
/** Lo que dura el deslizamiento: 10 cuadros (333 ms); a 2×, 5. */
export const moveFrames = (speed: VideoSpeed) => (speed === 2 ? 5 : 10)
/** Desde cuánto se ofrece «Rápido (2×)». */
export const LONG_VIDEO_MS = 6 * 60_000

/** Lo que pasa sin que se mueva una carta: va más rápido. */
const quick = (action: MatAction) => action.type === 'phase' || action.type === 'shuffle'

export const stepMs = (action: MatAction, speed: VideoSpeed = 1) => (quick(action) ? QUICK_MS : STEP_MS) / speed

/** Cuánto dura el cuadro de cada cursor (0 = la mesa al empezar, `steps.length` = la última jugada, que se queda con el resultado). */
export function frameDurations(replay: Pick<DuelReplay, 'steps'>, speed: VideoSpeed = 1): number[] {
  const steps: number[] = replay.steps.map(([, action]) => stepMs(action, speed))
  if (steps.length === 0) return [INTRO_MS + OUTRO_MS]
  steps[steps.length - 1] = OUTRO_MS
  return [INTRO_MS, ...steps]
}

export const videoDurationMs = (replay: Pick<DuelReplay, 'steps'>, speed: VideoSpeed = 1) => frameDurations(replay, speed).reduce((sum, ms) => sum + ms, 0)

/** «Ana-vs-Beto-2026-10-29.mp4», sin lo que un sistema de archivos no acepta; `title` lo arma la pantalla (en «Jugar solo», «Duelista vs Rival» en su idioma). */
export const videoFileName = (replay: Pick<DuelReplay, 'savedAt'>, title: string) => safeFileName(`${title} ${replay.savedAt.slice(0, 10)}`, 'duelo', '.mp4')
