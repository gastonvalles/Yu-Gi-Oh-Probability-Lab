import { useContext, useEffect, useRef } from 'react'

import { isEmojiSignal } from '../../app/duel-signals'
import { DELTA_MS, LifeHold, useHeldValue, useLifeNumber, useLpDelta, useLpFlash } from '../../app/life-effects'
import { t } from '../../i18n'
import { sacudir } from '../probability/AttackFx'
import { cx } from '../ui/cx'
import { PLAYER_COLOR, type PlayerSide } from './player-color'

/** Cuánto se queda el globo de una señal (pensando, todo bien, un 👍) junto a las vidas: el temporizador de `useSignals` (use-duel-table) lo quita a esta misma duración. */
export const SIGNAL_MS = 3500

/**
 * Las vidas de un jugador, planas (Gastón, 2026-10-27, opción A «Marcador arriba»: las placas «no le gustan»): sin caja, chapa ni barra de 8000. Arriba el nombre chico en el color del dueño
 * (`PLAYER_COLOR`), abajo el número grande y blanco, que es lo que decide. Hace lo mismo que la placa (`LifeTile`): cuenta hasta el valor nuevo, se tiñe de verde o de rojo un instante al subir o bajar
 * (en 0, rojo), muestra la diferencia («−1000») debajo del número sin ocupar lugar y se sacude al bajar.
 * - `align`: «start» la tuya (a la izquierda del marcador), «end» la del rival (a la derecha).
 * - `size`: «sm» el número de 24 px (el marcador de la barra, hasta 1100 px); «lg» el de 33 px (escritorio, opción D2: cada vida en su esquina del campo o en su lateral).
 * - `onClick` (el duelo por enlace manual): es un botón de 44 × 44 como mínimo que abre la calculadora, con el aro de foco de siempre y un fondo tenue al apuntarlo. Sin él, `role="group"` (el automático:
 *   las vidas las lleva el núcleo).
 * - `bubble`: la señal de su dueño (🤔, «Pensando…»), un instante, con el borde de su color: debajo del número; tus vidas grandes (abajo de la pantalla, en tu esquina o tu lateral), arriba.
 * - Accesibilidad: «Puntos de vida de …: N» (con el botón, «… Abrir la calculadora de vidas»); el globo es `role="status"`.
 * - Usos: «Jugar solo automático» y los duelos por enlace en todos los anchos (el marcador de la barra hasta 1100 px; las esquinas del campo o los laterales en escritorio) y quien mira.
 */
export function LifeScore({
  name,
  label,
  life: real,
  mine = false,
  color,
  align = mine ? 'start' : 'end',
  size = 'sm',
  onClick,
  bubble = null,
  bubbleKey,
}: {
  name: string
  /** Lo que dice arriba, si no es el nombre (tus vidas: «Vos»). */
  label?: string
  life: number
  mine?: boolean
  /** De qué jugador es el color (por defecto, el tuyo si es `mine`): quien mira pone el suyo a cada uno. */
  color?: PlayerSide
  align?: 'start' | 'end'
  size?: 'sm' | 'lg'
  /** Abre la calculadora de vidas del duelo: con esto es un botón. */
  onClick?: (() => void) | undefined
  /** Un aviso que sale un instante junto a las vidas, con el color de su dueño. */
  bubble?: string | null
  /** Cambia con cada señal (aunque diga lo mismo): el globo vuelve a entrar. */
  bubbleKey?: number | undefined
}) {
  const side = mine ? 'mine' : 'theirs'
  const tone = PLAYER_COLOR[color ?? side]
  // Las que se ven: las de verdad, salvo mientras un ataque todavía no golpeó (`LifeHold`: igual que la placa).
  const life = useHeldValue(real, useContext(LifeHold))
  const shown = useLifeNumber(life)
  const flash = useLpFlash(life)
  const change = useLpDelta(life)
  const box = useRef<HTMLElement | null>(null)
  const setBox = (node: HTMLElement | null) => {
    box.current = node
  }

  useEffect(() => {
    const shake = change && change.delta < 0 && box.current ? sacudir(box.current, 'life') : null

    return () => shake?.cancel()
  }, [change])

  const lifeOf = `${t('duel.bar.lifeOf', { name })}: ${life}`
  const body = (
    <>
      {/* Un nombre largo se corta con «…»: no le quita lugar al turno del marcador. */}
      <span aria-hidden="true" className={cx('max-w-28 truncate text-micro font-bold uppercase leading-none tracking-wider', tone.text)}>{label ?? name}</span>
      <span aria-hidden="true" className={cx(size === 'lg' ? 'text-stat' : 'text-title', 'font-bold leading-none tabular-nums transition-colors duration-200', flash === 'up' ? 'text-success' : flash === 'down' ? 'text-danger' : life === 0 ? 'text-danger-soft' : 'text-foreground')}>
        {shown}
      </span>
      {/* La diferencia flota debajo del número (no ensancha el marcador ni corre el turno). */}
      {change ? (
        <span key={change.key} aria-hidden="true" style={{ animationDuration: `${DELTA_MS}ms` }} className={cx('pointer-events-none absolute top-full mt-1 animate-linger text-micro font-extrabold leading-none tabular-nums motion-reduce:animate-none', align === 'end' ? 'right-0' : 'left-0', change.delta < 0 ? 'text-danger-soft' : 'text-success-soft')}>
          {change.delta < 0 ? '−' : '+'}
          {Math.abs(change.delta)}
        </span>
      ) : null}
      {bubble ? (
        <span
          key={bubbleKey}
          role="status"
          style={{ animationDuration: `${SIGNAL_MS}ms` }}
          className={cx(
            'pointer-events-none absolute z-30 w-max max-w-[16rem] animate-linger rounded-card border bg-card-background normal-case tracking-normal text-foreground shadow-[0_8px_20px_rgba(0,0,0,0.4)] motion-reduce:animate-none',
            isEmojiSignal(bubble) ? 'px-3 py-1 text-display leading-none' : 'truncate px-2.5 py-1 text-body font-semibold',
            tone.border,
            align === 'end' ? 'right-0' : 'left-0',
            mine && size === 'lg' ? 'bottom-full mb-1.5' : 'top-full mt-1.5',
          )}
        >
          {bubble}
        </span>
      ) : null}
    </>
  )
  // `data-lp`: a qué casilla va la espada de un ataque directo (ver `measureStrike`).
  const place = cx('relative grid shrink-0 gap-1', align === 'end' ? 'justify-items-end text-right' : 'justify-items-start text-left')

  return onClick ? (
    <button ref={setBox} type="button" data-lp={side} data-life-score="" aria-label={`${lifeOf}. ${t('duel.bar.openCalculator')}`} className={cx(place, '-mx-1 min-h-11 min-w-11 cursor-pointer content-center rounded-control px-1 transition-colors hover:bg-tint/8 focus-visible:outline-none focus-visible:shadow-focus')} onClick={onClick}>
      {body}
    </button>
  ) : (
    <div ref={setBox} role="group" data-lp={side} data-life-score="" aria-label={lifeOf} className={place}>
      {body}
    </div>
  )
}
