import { useEffect, useState } from 'react'

import { TURN_WARNING_MS, formatTurnTime, rivalOf, turnTimeLeft, type TurnClock } from '../../app/duel-clock'
import type { Duelist } from '../../app/life-calculator'
import { t } from '../../i18n'
import { cx } from '../ui/cx'

const RADIUS = 44
const CIRCUMFERENCE = 2 * Math.PI * RADIUS

/** Un reloj por segundo mientras alguno corre (parado, el número no cambia). */
function useSecondTick(active: boolean): number {
  const [now, setNow] = useState(() => Date.now())

  useEffect(() => {
    setNow(Date.now())

    if (!active) {
      return
    }

    const id = setInterval(() => setNow(Date.now()), 1000)

    return () => clearInterval(id)
  }, [active])

  return now
}

interface TurnDialProps {
  clock: TurnClock
  /** Quién tiene el turno (0 = anfitrión, 1 = invitado): su reserva es la que se ve grande. */
  owner: Duelist
  /** Quién soy yo (0 = anfitrión, 1 = invitado), para pintar lo tuyo y lo del rival. Sin esto (quien mira) las dos son del rival. */
  me?: Duelist
  /** Cómo se llama cada uno (0 = anfitrión, 1 = invitado): lo dice el lector de pantalla. */
  names: readonly [string, string]
}

/**
 * El reloj de turnos, en el centro de la mesa (entre las dos Zonas Extra): un círculo que se va vaciando con el tiempo que le queda a quien tiene el turno, y el tiempo en el medio;
 * debajo, lo que le queda al otro (público: lo ven los dos). Cuando faltan 30 segundos el número parpadea en rojo y, en cero, el círculo desaparece y queda el 0:00 en rojo.
 */
export function TurnDial({ clock, owner, me, names }: TurnDialProps) {
  const now = useSecondTick(clock.running !== null)
  const waiting = rivalOf(owner)
  const left = turnTimeLeft(clock, owner, now)
  const waitingLeft = turnTimeLeft(clock, waiting, now)
  const fraction = clock.span > 0 ? Math.min(1, left / clock.span) : 0
  const urgent = left <= TURN_WARNING_MS
  const ended = left <= 0
  const mine = me !== undefined && owner === me
  const label = t('duel.turnClock.label', { turn: names[owner], left: formatTurnTime(left), other: names[waiting], otherLeft: formatTurnTime(waitingLeft) })

  return (
    <div role="timer" aria-label={label} data-testid="turn-dial" data-owner={owner} data-urgent={urgent ? 'true' : undefined} className="pointer-events-none relative grid size-full place-items-center">
      <div className="relative aspect-square h-[78%] max-h-full">
        <svg viewBox="0 0 100 100" className="size-full -rotate-90" aria-hidden="true">
          <circle cx="50" cy="50" r={RADIUS} fill="none" strokeWidth="8" className="stroke-tint/12" />
          {ended ? null : (
            <circle
              cx="50"
              cy="50"
              r={RADIUS}
              fill="none"
              strokeWidth="8"
              strokeLinecap="round"
              strokeDasharray={CIRCUMFERENCE}
              strokeDashoffset={CIRCUMFERENCE * (1 - fraction)}
              className={cx('transition-[stroke-dashoffset] duration-1000 ease-linear motion-reduce:transition-none', urgent ? 'stroke-danger' : mine ? 'stroke-accent' : 'stroke-info')}
            />
          )}
        </svg>
        <span
          data-testid="turn-dial-time"
          className={cx(
            'absolute inset-0 grid place-items-center text-center text-micro font-bold tabular-nums leading-none min-[1101px]:text-body',
            urgent ? 'text-danger-soft' : 'text-foreground',
            urgent && !ended && 'motion-safe:animate-turn-blink',
          )}
        >
          {formatTurnTime(left)}
        </span>
      </div>
      <span data-testid="turn-dial-other" className={cx('absolute inset-x-0 bottom-0 truncate text-center text-micro font-semibold tabular-nums leading-none', mine || me === undefined ? 'text-info-soft' : 'text-accent')}>
        {formatTurnTime(waitingLeft)}
      </span>
    </div>
  )
}
