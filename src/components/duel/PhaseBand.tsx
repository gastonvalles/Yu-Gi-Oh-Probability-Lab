import { useEffect, useEffectEvent, useState, type TransitionEvent } from 'react'

import { PHASES, type MatPhase } from '../../app/practice-mat'
import { t } from '../../i18n'
import { cx } from '../ui/cx'
import type { PlayerSide } from './player-color'

/** Una fase que empieza: cuál y de quién. Cambiar `key` la vuelve a anunciar. `turn`: empieza otro turno (nunca el primero del duelo) y `side` es quien empieza a jugar. */
export interface PhaseCue {
  key: number
  phase: MatPhase
  side: PlayerSide
  turn?: boolean
}

/** Lo que se queda la banda (ya entró) antes de salir, y lo que dura todo con la salida: entra en 200 ms, el nombre llega 100 ms después y sale en otros 200. */
export const PHASE_BAND_HOLD_MS = 600
export const PHASE_BAND_MS = 850
/** «Cambio de turno», con más peso: entra en 250 ms, la frase llega 100 ms después, se queda hasta los 1000 y sale en otros 250. Después, la banda de la fase. */
export const TURN_BAND_HOLD_MS = 1000
export const TURN_BAND_MS = 1250
/**
 * Lo que espera una fase que suele durar menos que su banda antes de entrar: la End Phase (el pase llega ~250 ms después) y la del turno nuevo tras «Cambio de turno» (la siguiente, ~130 ms). Si en
 * ese rato llega otra, entra la otra; nadie espera a la banda, así que el duelo no se demora.
 */
export const PHASE_BAND_SETTLE_MS = 400
const brief = (cue: PhaseCue) => cue.phase === 'end' || Boolean(cue.turn)

/**
 * Los colores de la casa por dueño (los de las chapas de vidas, nada de rojo ni azul): la tuya violeta con el texto claro, la del rival lima con el texto oscuro (AA de sobra: 5,6:1 y 13:1). Los
 * extremos se desvanecen, así la banda no corta el campo con un borde.
 */
const BAND: Record<PlayerSide, string> = {
  mine: 'bg-[linear-gradient(90deg,transparent,var(--color-primary)_14%,var(--color-primary)_86%,transparent)] text-primary-foreground',
  theirs: 'bg-[linear-gradient(90deg,transparent,var(--color-info)_14%,var(--color-info)_86%,transparent)] text-info-foreground',
}
const BOX = 'flex h-full items-center justify-center'
const TEXT = 'truncate px-[14%] text-title font-extrabold uppercase italic leading-none tracking-wide max-[359px]:text-lead min-[1101px]:text-stat'
/** 52 px en el celular y 64 en escritorio; la del turno, una vez y media. */
const HEIGHT = 'h-13 min-[1101px]:h-16'
const TURN_HEIGHT = 'h-20 min-[1101px]:h-24'
const TURN_TEXT = 'whitespace-nowrap text-stat font-extrabold uppercase italic leading-none tracking-tighter text-shadow-lg text-shadow-white/35 max-[389px]:text-title min-[1101px]:text-display'
/** El contorno luminoso de la banda del turno: una línea clara arriba y otra abajo, quietas (se mueven con la banda). */
const EDGE = 'absolute inset-x-0 h-0.5 bg-linear-to-r from-transparent via-white/85 to-transparent'

const nameOf = (phase: MatPhase) => PHASES.find((entry) => entry.id === phase)?.name ?? phase

/** La banda quieta (el catálogo): el nombre de la fase, grande, en mayúsculas e itálica, sobre el color de quien juega. */
export function PhaseStrip({ phase, side }: { phase: MatPhase; side: PlayerSide }) {
  return (
    <div className={cx(BOX, HEIGHT, BAND[side])}>
      <span className={TEXT}>{nameOf(phase)}</span>
    </div>
  )
}

/** «Cambio de turno» quieta (el catálogo), del color de quien empieza a jugar. */
export function TurnStrip({ side }: { side: PlayerSide }) {
  return (
    <div className={cx(BOX, 'relative', TURN_HEIGHT, BAND[side])}>
      <TurnFace />
    </div>
  )
}

function TurnFace({ className }: { className?: string }) {
  return (
    <>
      <span className={cx(EDGE, 'top-0')} />
      <span className={cx(EDGE, 'bottom-0')} />
      <span className={cx(TURN_TEXT, className)}>{t('duel.phase.turnChange')}</span>
    </>
  )
}

const idOf = (cue: PhaseCue | null) => (cue ? `${cue.key}:${cue.side}:${cue.phase}` : null)
const LAYER = 'pointer-events-none absolute inset-0 z-30 my-auto overflow-hidden'
const PLACE = { gridRow: 'p2', gridColumn: '1 / -1' }
const fromSide = (fromLeft: boolean, leaving: boolean) =>
  cx(
    fromLeft ? 'motion-safe:starting:-translate-x-full' : 'motion-safe:starting:translate-x-full',
    leaving ? cx('opacity-0 ease-in-out', fromLeft ? 'motion-safe:translate-x-full' : 'motion-safe:-translate-x-full') : 'ease-out',
  )

/**
 * El cartel de una fase nueva, como en Master Duel pero con los colores de la casa: una banda que cruza el campo de borde a borde sobre la fila del medio (la del botón de fase), entra desde el costado
 * de quien juega (la tuya desde la izquierda, la del rival desde la derecha), el nombre llega un instante después, se queda y sale por el otro lado: 850 ms en total. Si llega otra fase mientras se ve, la
 * misma banda cambia de texto y vuelve a contar (no se apilan ni vuelve a entrar); si cambia de dueño, entra la del otro. Un turno nuevo (`turn`) entra antes con «Cambio de turno», más alta y del color
 * de quien empieza (1250 ms), y después, una detrás de la otra, la banda de la fase más nueva (la Draw Phase, o la que ya llegó mientras tanto); si llega con una banda a la vista, la deja salir y
 * entra después (no la corta). Lo que suele durar menos que su banda (la End Phase y la fase de un turno nuevo) espera `PHASE_BAND_SETTLE_MS` y, si llega otra, entra la otra: nada parpadea. Se ubica sola en la fila `p2` de la grilla del campo (va
 * adentro de él, debajo de la cadena y de las preguntas, que son otra capa), no ataja toques y nadie la espera: lleva su propio reloj, así que quien la monta puede sacar `cue` cuando quiera. Con
 * movimiento reducido, sólo aparece y se va. Sólo `translate` y `opacity`.
 */
export function PhaseBand({ cue, hold = false }: { cue: PhaseCue | null; hold?: boolean }) {
  const [shown, setShown] = useState<PhaseCue | null>(null)
  const [leaving, setLeaving] = useState(false)
  const [turn, setTurn] = useState<PhaseCue | null>(null)
  const [turnLeaving, setTurnLeaving] = useState(false)
  // La fase que espera: detrás de «Cambio de turno» (la más nueva) o, si suele durar menos que su banda (`brief`), su rato por si llega la siguiente.
  const [next, setNext] = useState<PhaseCue | null>(null)
  const [last, setLast] = useState<string | null>(null)
  const id = idOf(cue)

  // Una fase nueva se toma en el mismo dibujo (el patrón de React para seguir una prop): con un efecto, se vería un cuadro la anterior. Que `cue` se vaya no la saca: tiene su reloj.
  if (id !== last) {
    setLast(id)
    if (cue?.turn) {
      // «Cambio de turno» no corta la banda que se ve: la deja salir y entra después.
      setTurn(cue)
      setTurnLeaving(false)
      setNext(cue)
      if (shown) setLeaving(true)
    } else if (cue && (turn || next || brief(cue))) {
      setNext(cue)
    } else if (cue) {
      setShown(cue)
      setLeaving(false)
      setNext(null)
    }
  }

  // Lo que espera sin turno delante es una fase breve: a los `PHASE_BAND_SETTLE_MS` entra la más nueva (la End Phase y el pase llegan casi juntos: sale sólo «Cambio de turno»; tras él, la Draw y
  // la Standby pasan en un instante: entra la Main Phase 1). El plazo cuenta desde que empieza a esperar: lo que llega en el medio no lo alarga.
  const settled = useEffectEvent(() => {
    setShown(next)
    setLeaving(false)
    setNext(null)
  })
  const settling = next !== null && turn === null
  useEffect(() => {
    if (!settling) return
    const settle = window.setTimeout(settled, PHASE_BAND_SETTLE_MS)

    return () => window.clearTimeout(settle)
  }, [settling])

  // Se va «Cambio de turno»: entra la fase más nueva que esperaba, salvo que sea breve (la del mismo turno que nadie siguió todavía), que hace su espera.
  const endTurn = () => {
    setTurn(null)
    if (next && !brief(next)) {
      setShown(next)
      setLeaving(false)
      setNext(null)
    }
  }

  // «Cambio de turno» cuenta desde que se ve: con una banda saliendo, espera a que se vaya.
  const turnUp = turn !== null && shown === null
  useEffect(() => {
    if (!turnUp) return
    const leave = window.setTimeout(() => setTurnLeaving(true), TURN_BAND_HOLD_MS)

    return () => window.clearTimeout(leave)
  }, [turn, turnUp])

  // La salida termina con su transición (`transitionend` de la opacidad); el reloj es sólo la red, y cuenta desde que empieza a salir: si el hilo principal se atrasa (al cambiar de turno, cuando
  // la mesa se redibuja), los dos plazos ya no pasan juntos y la banda no se va sin salida.
  const endTurnNow = useEffectEvent(endTurn)
  useEffect(() => {
    if (!turnLeaving) return
    const gone = window.setTimeout(endTurnNow, TURN_BAND_MS - TURN_BAND_HOLD_MS)

    return () => window.clearTimeout(gone)
  }, [turnLeaving])

  useEffect(() => {
    if (!shown || leaving) return
    const leave = window.setTimeout(() => setLeaving(true), PHASE_BAND_HOLD_MS)

    return () => window.clearTimeout(leave)
  }, [shown, leaving])

  useEffect(() => {
    if (!leaving) return
    const gone = window.setTimeout(() => setShown(null), PHASE_BAND_MS - PHASE_BAND_HOLD_MS)

    return () => window.clearTimeout(gone)
  }, [leaving])

  const gone = (out: boolean, done: () => void) => (event: TransitionEvent<HTMLDivElement>) => {
    if (out && event.target === event.currentTarget && event.propertyName === 'opacity') done()
  }
  // Mientras una carta grande ocupa el centro (`hold`), la banda espera montada e invisible (se funde; no se corta ni vuelve a entrar desde cero al soltarse), y su reloj sigue.
  const layer = cx(LAYER, 'transition-opacity duration-200 motion-reduce:transition-none', hold && 'opacity-0')

  if (turn && turnUp) {
    const fromLeft = turn.side === 'mine'

    return (
      <div aria-hidden="true" data-fx="banner" data-turn="" data-side={turn.side} className={cx(layer, TURN_HEIGHT)} style={PLACE}>
        <div key={turn.key} className={cx(BOX, 'relative', BAND[turn.side], 'transition-[translate,opacity] duration-250 starting:opacity-0 motion-reduce:transition-opacity', fromSide(fromLeft, turnLeaving))} onTransitionEnd={gone(turnLeaving, endTurn)}>
          <TurnFace className={cx('transition-[translate,opacity] delay-100 duration-250 ease-out starting:opacity-0 motion-reduce:transition-opacity', fromLeft ? 'motion-safe:starting:-translate-x-12' : 'motion-safe:starting:translate-x-12')} />
        </div>
      </div>
    )
  }
  if (!shown) return null
  const fromLeft = shown.side === 'mine'

  return (
    <div aria-hidden="true" data-fx="banner" data-side={shown.side} className={cx(layer, HEIGHT)} style={PLACE}>
      <div key={shown.side} className={cx(BOX, BAND[shown.side], 'transition-[translate,opacity] duration-200 starting:opacity-0 motion-reduce:transition-opacity', fromSide(fromLeft, leaving))} onTransitionEnd={gone(leaving, () => setShown(null))}>
        <span
          key={shown.key}
          className={cx(TEXT, 'transition-[translate,opacity] delay-100 duration-200 ease-out starting:opacity-0 motion-reduce:transition-opacity', fromLeft ? 'motion-safe:starting:-translate-x-8' : 'motion-safe:starting:translate-x-8')}
        >
          {nameOf(shown.phase)}
        </span>
      </div>
    </div>
  )
}
