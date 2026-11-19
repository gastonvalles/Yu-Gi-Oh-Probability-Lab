import type { ChainStep } from '../../../app/auto/chain-feed'
import { FIRST_DEAL_MS, NEXT_DEAL_MS } from '../../../app/deal-flight'
import { duelReplayAt, replayChainSteps, walkReplay, type DuelReplay } from '../../../app/duel-replay'
import { safeFileName, type SharedCombo } from '../../../app/combo-share'
import type { MatAction } from '../../../app/practice-mat'
import { comboChainSteps, type SavedCombo } from '../../../app/saved-combos'
import { ENTRANCE } from '../../../app/summon-entrance'
import { chainDwell, nextShown, stepsUpTo } from '../../auto/ChainNotice'
import { titleOf } from '../duel-replay-text'

/**
 * Cuánto se ve cada jugada en el video. El video va a cuadros constantes (`FPS`): lo que se mueve se anima cuadro a cuadro como en la mesa y lo quieto repite el cuadro (en
 * H.264 casi no pesa). Una jugada de un duelo dura lo del reproductor (`STEP_MS`); la de un combo, lo que espera la mesa al reproducirlo (`COMBO_STEP_MS`); un cambio de fase,
 * que no mueve cartas, menos (su cartel sigue encima de lo que viene). Al principio, la mesa al empezar con los nombres; al final, el resultado. Todo eso (jugadas, vuelos,
 * reparto, cadena, bandas) va a `VIDEO_PACE` del ritmo de la mesa; «Rápido (2×)», al doble de eso (el título y el cierre, igual).
 */

/** El ritmo efectivo: cuántas veces más rápido que la mesa (`paceOf`); cada tiempo del video se divide por él. */
export type VideoSpeed = number
/** Lo que se elige al armar el video: normal o «Rápido (2×)». */
export type VideoChoice = 1 | 2
/** El ritmo de fábrica del video (Gastón, 2026-11-13: «deberia moverse todo en x1.25 mas rapido»). La mesa y el replay de la app no lo usan. */
export const VIDEO_PACE = 1.25
export const paceOf = (choice: VideoChoice): VideoSpeed => choice * VIDEO_PACE

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

/**
 * Lo que dura una jugada. Una Invocación del Extra Deck (o la última carta de una por Péndulo, `long`) lleva la entrada larga de la mesa (`summon-entrance.ts`): en el replay, la jugada
 * siguiente espera a que termine y después su `STEP_MS`; al reproducir un combo, la mesa espera lo que sea más largo.
 */
export const stepMs = (action: MatAction, speed: VideoSpeed = VIDEO_PACE, kind: VideoSubject['kind'] = 'duel', long = action.type === 'summon') => {
  const entrance = long ? ENTRANCE.end : 0
  const base = action.type === 'phase' ? (kind === 'combo' ? COMBO_PHASE_MS : PHASE_MS) : kind === 'combo' ? COMBO_STEP_MS : STEP_MS
  return (kind === 'combo' ? Math.max(base, entrance) : base + entrance) / speed
}

/** Donde la Invocación por Péndulo es segura (`surePendulum`): lo que se jugó a mano (el duelo por enlace, un combo de la práctica) y lo grabado con las marcas del núcleo (`sure`). */
export const pendulumSure = (subject: VideoSubject) =>
  subject.kind === 'duel' ? subject.replay.mode === 'link' || subject.replay.sure === true : (subjectChain(subject).length === 0 && !subject.combo.auto) || subject.combo.sure === true

/** Una carta de una Invocación por Péndulo segura: las de la misma Invocación hasta ella (ids) y si con ella va la escena (`scene`: la última). */
export interface PendulumCue {
  ids: string[]
  scene: boolean
}

/**
 * Cada carta de una Invocación por Péndulo es una jugada; la escena va una sola vez, con todas, en la última (la que no sigue otra por Péndulo del mismo lado), como en el replay
 * (`DuelReplayScreen`). Una por jugada (`null`: no es una carta de una Invocación por Péndulo segura).
 */
export function pendulumCues(subject: VideoSubject): (PendulumCue | null)[] {
  const steps: ReadonlyArray<readonly [number, MatAction, ...unknown[]]> = subject.kind === 'duel' ? subject.replay.steps : subject.combo.actions.map((action) => [0, action] as const)
  const sure = pendulumSure(subject)
  const isPendulum = (step: readonly [number, MatAction, ...unknown[]] | undefined) => step?.[1].type === 'place' && step[1].how === 'pendulum'
  let ids: string[] = []
  return steps.map((step, index) => {
    if (!sure || !isPendulum(step)) {
      ids = []
      return null
    }
    ids = [...ids, (step[1] as Extract<MatAction, { type: 'place' }>).id]
    const next = steps[index + 1]
    const cue = { ids, scene: !(next && next[0] === step[0] && isPendulum(next)) }
    if (cue.scene) ids = []
    return cue
  })
}

/**
 * La primera mano de un lado que arranca vacía (el automático: llega con el robo de 5 de su primera jugada), como `dealOverlays` del video y `useOpeningDeal` del replay: en qué
 * jugada se reparte (`at`, 1 = la primera) y cuántas cartas.
 */
export function openingDeals(replay: DuelReplay): Array<{ at: number; cards: number }> {
  const open = ([0, 1] as const).filter((side) => replay.sides[side].initial.hand.length === 0)
  const shots = open.length > 0 ? walkReplay(replay) : []
  const deals: Array<{ at: number; cards: number }> = []
  for (let at = 1; at <= replay.steps.length && open.length > 0; at += 1) {
    const { states } = duelReplayAt(replay, at, shots)
    for (const side of [...open])
      if (states[side].hand.length > 0) {
        open.splice(open.indexOf(side), 1)
        deals.push({ at, cards: states[side].hand.length })
      }
  }
  return deals
}

/** La cadena, vista desde quien grabó (abajo en el video): la del replay de un duelo o la de un combo grabado en «Jugar solo automático» (sin ella, vacía). */
export const subjectChain = (subject: VideoSubject): ChainStep[] => (subject.kind === 'duel' ? replayChainSteps(subject.replay, 0) : comboChainSteps(subject.combo))

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

/**
 * Cuánto dura cada tramo: la mesa al empezar (con el título), cada jugada (con lo que tarda su cadena, si la hay) y el cierre con el resultado. Sin jugadas, un solo tramo. En un duelo
 * que reparte una mano con una jugada (`openingDeals`), la que sigue espera, como el replay, a que salga la última carta y después su `STEP_MS`; salvo que sea el reparto del otro lado
 * (los dos se pisan, como en la mesa).
 */
export function frameDurations(subject: VideoSubject, speed: VideoSpeed = VIDEO_PACE): number[] {
  const chain = subjectChain(subject)
  const cues = pendulumCues(subject)
  const deals = subject.kind === 'duel' ? openingDeals(subject.replay) : []
  const dealt: number[] = []
  let now = INTRO_MS
  const steps = subjectActions(subject).map((action, index) => {
    const deal = deals.find((each) => each.at === index + 1)
    if (deal) dealt.push(now + (FIRST_DEAL_MS + (deal.cards - 1) * NEXT_DEAL_MS) / speed)
    const own = stepMs(action, speed, subject.kind, action.type === 'summon' || cues[index]?.scene === true) + chainMs(chain, index + 1) / speed
    const wait = deals.some((each) => each.at === index + 2) ? 0 : Math.max(0, ...dealt) - now
    const ms = wait > 0 ? Math.max(own, wait + STEP_MS / speed) : own
    now += ms
    return ms
  })
  return steps.length === 0 ? [INTRO_MS + OUTRO_MS] : [INTRO_MS, ...steps, OUTRO_MS]
}

/** La cadena de todo el video: cada momento en que cambia lo que se ve (`t`, ms de video desde el principio), con `starts` el comienzo de cada tramo (`frameDurations` acumulado). */
export function chainTimeline(steps: readonly ChainStep[], starts: readonly number[], speed: VideoSpeed = VIDEO_PACE): Array<ChainBeat & { t: number }> {
  // El tramo 0 es la mesa al empezar: la jugada `cursor` es el tramo `cursor`.
  return starts.slice(1, -2).flatMap((start, index) => chainBeats(steps, index + 1).map((beat) => ({ ...beat, t: start + beat.at / speed })))
}

export const videoDurationMs = (subject: VideoSubject, speed: VideoSpeed = VIDEO_PACE) => frameDurations(subject, speed).reduce((sum, ms) => sum + ms, 0)

/**
 * «Ana-vs-Beto-2026-10-29.mp4» (en «Jugar solo», «Duelista-vs-Rival-…» en su idioma) o «Linea-basica-2026-10-29.mp4» (el nombre del combo), sin lo que un sistema de archivos no
 * acepta.
 */
export const videoFileName = (subject: VideoSubject) =>
  subject.kind === 'duel'
    ? safeFileName(`${titleOf(subject.replay)} ${subject.replay.savedAt.slice(0, 10)}`, 'duelo', '.mp4')
    : safeFileName(`${subject.combo.name} ${subject.combo.savedAt.slice(0, 10)}`, 'combo', '.mp4')
