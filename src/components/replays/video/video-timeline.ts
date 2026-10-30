import type { DuelReplay } from '../../../app/duel-replay'
import { safeFileName, type SharedCombo } from '../../../app/combo-share'
import type { MatAction } from '../../../app/practice-mat'
import type { SavedCombo } from '../../../app/saved-combos'
import { titleOf } from '../duel-replay-text'

/**
 * Cuánto se ve cada jugada en el video. El video va a cuadros constantes (`FPS`): lo que se mueve se anima cuadro a cuadro como en la mesa y lo quieto repite el cuadro (en
 * H.264 casi no pesa). Una jugada de un duelo dura lo del reproductor (`STEP_MS`); la de un combo, lo que espera la mesa al reproducirlo (`COMBO_STEP_MS`); un cambio de fase,
 * que no mueve cartas, menos (su cartel sigue encima de lo que viene). Al principio, la mesa al empezar con los nombres; al final, el resultado. «Rápido (2×)»: cada jugada
 * y cada animación a la mitad (el título y el cierre, igual).
 */

export type VideoSpeed = 1 | 2

/** De qué es el video: el replay de un duelo o un combo de la práctica (de un solo jugador). */
export type VideoSubject = { kind: 'duel'; replay: DuelReplay } | { kind: 'combo'; combo: SavedCombo | SharedCombo }

export const subjectActions = (subject: VideoSubject): readonly MatAction[] => (subject.kind === 'duel' ? subject.replay.steps.map(([, action]) => action) : subject.combo.actions)

/** Cuadros por segundo, siempre los mismos: los reproductores (WhatsApp, iOS) se traban con cuadros de duración variable. */
export const FPS = 30
/** El cuadro en el que cae el momento `ms` del video (contado desde el principio, sin que se acumule el redondeo). */
export const frameOf = (ms: number) => Math.round((ms * FPS) / 1000)

export const STEP_MS = 900
/** La mesa al reproducir un combo espera esto entre jugadas (`AUTOPLAY_MS` de `PracticeMat.tsx`). */
export const COMBO_STEP_MS = 1400
const PHASE_MS = 400
export const INTRO_MS = 2000
export const OUTRO_MS = 3000
/** Desde cuánto se ofrece «Rápido (2×)». */
export const LONG_VIDEO_MS = 6 * 60_000

export const stepMs = (action: MatAction, speed: VideoSpeed = 1, kind: VideoSubject['kind'] = 'duel') => (action.type === 'phase' ? PHASE_MS : kind === 'combo' ? COMBO_STEP_MS : STEP_MS) / speed

/** Cuánto dura cada tramo: la mesa al empezar (con el título), cada jugada y el cierre con el resultado. Sin jugadas, un solo tramo. */
export function frameDurations(subject: VideoSubject, speed: VideoSpeed = 1): number[] {
  const steps = subjectActions(subject).map((action) => stepMs(action, speed, subject.kind))
  return steps.length === 0 ? [INTRO_MS + OUTRO_MS] : [INTRO_MS, ...steps, OUTRO_MS]
}

export const videoDurationMs = (subject: VideoSubject, speed: VideoSpeed = 1) => frameDurations(subject, speed).reduce((sum, ms) => sum + ms, 0)

/**
 * «Ana-vs-Beto-2026-10-29.mp4» (en «Jugar solo», «Duelista-vs-Rival-…» en su idioma) o «Linea-basica-2026-10-29.mp4» (el nombre del combo), sin lo que un sistema de archivos no
 * acepta.
 */
export const videoFileName = (subject: VideoSubject) =>
  subject.kind === 'duel'
    ? safeFileName(`${titleOf(subject.replay)} ${subject.replay.savedAt.slice(0, 10)}`, 'duelo', '.mp4')
    : safeFileName(`${subject.combo.name} ${subject.combo.savedAt.slice(0, 10)}`, 'combo', '.mp4')
