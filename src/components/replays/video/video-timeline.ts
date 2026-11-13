import type { ChainStep } from '../../../app/auto/chain-feed'
import { replayChainSteps, type DuelReplay } from '../../../app/duel-replay'
import { safeFileName, type SharedCombo } from '../../../app/combo-share'
import type { MatAction } from '../../../app/practice-mat'
import type { SavedCombo } from '../../../app/saved-combos'
import { chainDwell, stepsUpTo } from '../../auto/ChainNotice'
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
/** En un combo un cambio de fase dura lo que su banda (`MESA.banner`): así no queda debajo de la carta grande de la jugada siguiente, como en la mesa (que espera 1,4 s en todas). */
const COMBO_PHASE_MS = 850
export const INTRO_MS = 2000
export const OUTRO_MS = 3000
/** Desde cuánto se ofrece «Rápido (2×)». */
export const LONG_VIDEO_MS = 6 * 60_000

export const stepMs = (action: MatAction, speed: VideoSpeed = 1, kind: VideoSubject['kind'] = 'duel') => (action.type === 'phase' ? (kind === 'combo' ? COMBO_PHASE_MS : PHASE_MS) : kind === 'combo' ? COMBO_STEP_MS : STEP_MS) / speed

/** La cadena del replay de un duelo, vista desde quien grabó (abajo en el video); un combo no tiene (no hay núcleo que la cuente): vacía. */
export const subjectChain = (subject: VideoSubject): ChainStep[] => (subject.kind === 'duel' ? replayChainSteps(subject.replay, 0) : [])

/** Hasta dónde se muestra la cadena después de `seen` mensajes: el siguiente y los que no se dejan ver solos (`chainDwell` 0), como `nextShown` del reproductor (`DuelReplayScreen`). */
function nextShown(steps: readonly ChainStep[], seen: number, due: number): number {
  let next = Math.min(seen + 1, due)
  while (next < due && chainDwell(steps, next - 1) === 0) next += 1
  return next
}

/** Un momento de la cadena dentro de una jugada: `at` ms después de que empezó (a 1×), se ven los primeros `seen` mensajes; `from`, los que ya se veían antes de ella. */
export interface ChainBeat {
  at: number
  from: number
  seen: number
}

/**
 * La cadena de la jugada `cursor` como la cuenta el reproductor al avanzar de a un paso: sus mensajes de a uno con el ritmo de la mesa (`chainDwell`) y, cuando llegó el último, la
 * jugada sigue su tiempo de siempre. Sin cadena en el replay, ninguno; una jugada sin mensajes, uno solo (lo que ya se veía sigue igual).
 */
export function chainBeats(steps: readonly ChainStep[], cursor: number): ChainBeat[] {
  if (steps.length === 0 || cursor < 1) return []
  const from = stepsUpTo(steps, cursor - 1)
  const due = stepsUpTo(steps, cursor)
  const beats = [{ at: 0, from, seen: nextShown(steps, from, due) }]
  for (let last = beats[0]!; last.seen < due; ) {
    last = { at: last.at + chainDwell(steps, last.seen - 1), from, seen: nextShown(steps, last.seen, due) }
    beats.push(last)
  }
  return beats
}

/** Lo que la cadena le suma a la jugada `cursor` (a 1×): hasta que se ve su último mensaje. */
export const chainMs = (steps: readonly ChainStep[], cursor: number) => chainBeats(steps, cursor).at(-1)?.at ?? 0

/** Cuánto dura cada tramo: la mesa al empezar (con el título), cada jugada (con lo que tarda su cadena, si la hay) y el cierre con el resultado. Sin jugadas, un solo tramo. */
export function frameDurations(subject: VideoSubject, speed: VideoSpeed = 1): number[] {
  const chain = subjectChain(subject)
  const steps = subjectActions(subject).map((action, index) => stepMs(action, speed, subject.kind) + chainMs(chain, index + 1) / speed)
  return steps.length === 0 ? [INTRO_MS + OUTRO_MS] : [INTRO_MS, ...steps, OUTRO_MS]
}

/** La cadena de todo el video: cada momento en que cambia lo que se ve (`t`, ms de video desde el principio), con `starts` el comienzo de cada tramo (`frameDurations` acumulado). */
export function chainTimeline(steps: readonly ChainStep[], starts: readonly number[], speed: VideoSpeed = 1): Array<ChainBeat & { t: number }> {
  // El tramo 0 es la mesa al empezar: la jugada `cursor` es el tramo `cursor`.
  return starts.slice(1, -2).flatMap((start, index) => chainBeats(steps, index + 1).map((beat) => ({ ...beat, t: start + beat.at / speed })))
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
