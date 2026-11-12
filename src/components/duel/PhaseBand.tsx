import { useEffect, useState } from 'react'

import { PHASES, type MatPhase } from '../../app/practice-mat'
import { cx } from '../ui/cx'
import type { PlayerSide } from './player-color'

/** Una fase que empieza: cuál y de quién. Cambiar `key` la vuelve a anunciar. */
export interface PhaseCue {
  key: number
  phase: MatPhase
  side: PlayerSide
}

/** Lo que se queda la banda (ya entró) antes de salir, y lo que dura todo con la salida: entra en 200 ms, el nombre llega 100 ms después y sale en otros 200. */
export const PHASE_BAND_HOLD_MS = 600
export const PHASE_BAND_MS = 850

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
/** 52 px en el celular y 64 en escritorio. */
const HEIGHT = 'h-13 min-[1101px]:h-16'

const nameOf = (phase: MatPhase) => PHASES.find((entry) => entry.id === phase)?.name ?? phase

/** La banda quieta (el catálogo): el nombre de la fase, grande, en mayúsculas e itálica, sobre el color de quien juega. */
export function PhaseStrip({ phase, side }: { phase: MatPhase; side: PlayerSide }) {
  return (
    <div className={cx(BOX, HEIGHT, BAND[side])}>
      <span className={TEXT}>{nameOf(phase)}</span>
    </div>
  )
}

const idOf = (cue: PhaseCue | null) => (cue ? `${cue.key}:${cue.side}:${cue.phase}` : null)

/**
 * El cartel de una fase nueva, como en Master Duel pero con los colores de la casa: una banda que cruza el campo de borde a borde sobre la fila del medio (la del botón de fase), entra desde el costado
 * de quien juega (la tuya desde la izquierda, la del rival desde la derecha), el nombre llega un instante después, se queda y sale por el otro lado: 850 ms en total. Si llega otra fase mientras se ve, la
 * misma banda cambia de texto y vuelve a contar (no se apilan ni vuelve a entrar); si cambia de dueño, entra la del otro. Se ubica sola en la fila `p2` de la grilla del campo (va adentro de él, debajo
 * de la cadena y de las preguntas, que son otra capa), no ataja toques y nadie la espera: lleva su propio reloj, así que quien la monta puede sacar `cue` cuando quiera. Con movimiento reducido, sólo
 * aparece y se va. Sólo `translate` y `opacity`.
 */
export function PhaseBand({ cue, hold = false }: { cue: PhaseCue | null; hold?: boolean }) {
  const [shown, setShown] = useState<PhaseCue | null>(null)
  const [leaving, setLeaving] = useState(false)
  const [last, setLast] = useState<string | null>(null)
  const id = idOf(cue)

  // Una fase nueva se toma en el mismo dibujo (el patrón de React para seguir una prop): con un efecto, se vería un cuadro la anterior. Que `cue` se vaya no la saca: tiene su reloj.
  if (id !== last) {
    setLast(id)
    if (cue) {
      setShown(cue)
      setLeaving(false)
    }
  }

  useEffect(() => {
    if (!shown) return
    const leave = window.setTimeout(() => setLeaving(true), PHASE_BAND_HOLD_MS)
    const gone = window.setTimeout(() => setShown(null), PHASE_BAND_MS)

    return () => {
      window.clearTimeout(leave)
      window.clearTimeout(gone)
    }
  }, [shown])

  // Mientras una carta grande ocupa el centro (`hold`), la banda espera: no se dibuja, y su reloj sigue (si la carta se va antes, se ve lo que quede; si no, ya pasó).
  if (!shown || hold) return null
  const fromLeft = shown.side === 'mine'

  return (
    <div aria-hidden="true" data-fx="banner" data-side={shown.side} className={cx('pointer-events-none absolute inset-0 z-30 my-auto overflow-hidden', HEIGHT)} style={{ gridRow: 'p2', gridColumn: '1 / -1' }}>
      <div
        key={shown.side}
        className={cx(
          BOX,
          BAND[shown.side],
          'transition-[translate,opacity] duration-200 starting:opacity-0 motion-reduce:transition-opacity',
          fromLeft ? 'motion-safe:starting:-translate-x-full' : 'motion-safe:starting:translate-x-full',
          leaving ? cx('opacity-0 ease-in-out', fromLeft ? 'motion-safe:translate-x-full' : 'motion-safe:-translate-x-full') : 'ease-out',
        )}
      >
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
