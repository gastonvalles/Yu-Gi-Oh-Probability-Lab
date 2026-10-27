import { useContext, useEffect, useRef } from 'react'

import { DELTA_MS, LifeHold, useHeldValue, useLifeNumber, useLpDelta, useLpFlash } from '../../app/life-effects'
import { t } from '../../i18n'
import { sacudir } from '../probability/AttackFx'
import { cx } from '../ui/cx'
import { PLAYER_COLOR, type PlayerSide } from './player-color'

/**
 * Las vidas de un jugador en el marcador de la barra (Gastón, 2026-10-27, opción A «Marcador arriba» de «Jugar solo automático» en el celular: las placas «no le gustan»): plano, sin caja, chapa ni barra de
 * 8000. Arriba el nombre chico en el color del dueño (`PLAYER_COLOR`), abajo el número grande y blanco, que es lo que decide. Hace lo mismo que la placa (`LifeTile`): cuenta hasta el valor nuevo, se tiñe
 * de verde o de rojo un instante al subir o bajar (en 0, rojo), muestra la diferencia («−1000») debajo del número sin ocupar lugar y se sacude al bajar.
 * - `align`: «start» la tuya (a la izquierda del marcador), «end» la del rival (a la derecha).
 * - `size`: «sm» el número de 24 px (el marcador de la barra, hasta 1100 px); «lg» el de 33 px (escritorio, opción D2: cada vida en su esquina del campo o en su lateral).
 * - Accesibilidad: `role="group"` con «Puntos de vida de …: N»; no se toca (en el automático las vidas las lleva el núcleo).
 * - Usos: «Jugar solo automático» en todos los anchos (el marcador de `AutoBar` hasta 1100 px; las esquinas del campo o los laterales en escritorio). Las placas (`LifeTile`) siguen en los duelos por enlace.
 */
export function LifeScore({ name, label, life: real, mine = false, color, align = mine ? 'start' : 'end', size = 'sm' }: { name: string; /** Lo que dice arriba, si no es el nombre (tus vidas: «Vos»). */ label?: string; life: number; mine?: boolean; color?: PlayerSide; align?: 'start' | 'end'; size?: 'sm' | 'lg' }) {
  const side = mine ? 'mine' : 'theirs'
  // Las que se ven: las de verdad, salvo mientras un ataque todavía no golpeó (`LifeHold`: igual que la placa).
  const life = useHeldValue(real, useContext(LifeHold))
  const shown = useLifeNumber(life)
  const flash = useLpFlash(life)
  const change = useLpDelta(life)
  const box = useRef<HTMLDivElement | null>(null)

  useEffect(() => {
    const shake = change && change.delta < 0 && box.current ? sacudir(box.current, 'life') : null

    return () => shake?.cancel()
  }, [change])

  return (
    // `data-lp`: a qué casilla va la espada de un ataque directo (ver `measureStrike`).
    <div ref={box} role="group" data-lp={side} data-life-score="" aria-label={`${t('duel.bar.lifeOf', { name })}: ${life}`} className={cx('relative grid shrink-0 gap-1', align === 'end' ? 'justify-items-end text-right' : 'justify-items-start')}>
      <span aria-hidden="true" className={cx('text-micro font-bold uppercase leading-none tracking-wider', PLAYER_COLOR[color ?? side].text)}>{label ?? name}</span>
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
    </div>
  )
}
