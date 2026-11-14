import { useEffect } from 'react'

import { waveAt } from '../../app/field-impact'
import { cx } from '../ui/cx'

/** Los rayos del estallido, repartidos en la vuelta. */
const RAYS = Array.from({ length: 14 }, (_, at) => (at * 360) / 14)

/**
 * El golpe letal en cámara lenta (Gastón, 2026-11-12: «animacion de golpe letal en camara lenta justo antes del cartel de victoria»; referencia: el impacto de Master Duel):
 * desde el punto del golpe (la mitad del campo de quien cae: arriba el rival, abajo vos) un destello y rayos que crecen despacio y se apagan, y el daño en grande. Dura
 * `LETHAL_MS` (las `--animate-lethal-*` de index.css) mientras la chapa espera; después la chapa baja a 0 y sale el resultado. Sólo `transform`/`opacity`; con movimiento
 * reducido, sin destello ni rayos: el número quieto. No ataja toques. `inline`: dentro de su marco (el catálogo) en vez de la pantalla.
 */
export function LethalBlow({ damage, mine, inline = false }: { damage: number; /** Caés vos (rojo); si no, el rival (lima, el color de ganar). */ mine: boolean; inline?: boolean }) {
  // El golpe fuerte: la onda que cruza la pantalla desde el punto del golpe (`waveAt`; con «Livianos» o movimiento reducido, nada). En el catálogo (`inline`), no: saldría de su marco.
  useEffect(() => {
    if (!inline) waveAt(window.innerWidth / 2, window.innerHeight * (mine ? 2 / 3 : 1 / 3))
  }, [inline, mine])

  return (
    <div aria-hidden="true" data-testid="lethal-blow" data-side={mine ? 'mine' : 'theirs'} className={cx('pointer-events-none inset-0 z-150 overflow-hidden', inline ? 'absolute' : 'fixed')}>
      <div className={cx('absolute left-1/2', mine ? 'top-2/3' : 'top-1/3')}>
        <span className={cx('absolute -left-40 -top-40 size-80 animate-lethal-flash bg-radial from-white/90 to-transparent motion-reduce:hidden', mine ? 'via-danger/40' : 'via-info/40')} />
        {RAYS.map((deg) => (
          <span key={deg} style={{ rotate: `${deg}deg` }} className="absolute left-0 top-0">
            <span className={cx('absolute -left-1 top-0 h-[60vmax] w-2 origin-top animate-lethal-ray bg-linear-to-b from-white to-transparent motion-reduce:hidden', mine ? 'via-danger/70' : 'via-info/70')} />
          </span>
        ))}
        <span className={cx('absolute left-0 top-0 -translate-x-1/2 -translate-y-1/2 animate-lethal-number whitespace-nowrap text-display font-extrabold tabular-nums motion-reduce:animate-none', mine ? 'text-danger-soft' : 'text-info')}>
          −{damage}
        </span>
      </div>
    </div>
  )
}
