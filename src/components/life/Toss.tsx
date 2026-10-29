import type { CSSProperties } from 'react'

import { currentCoin } from '../../app/cosmetics'
import { cx } from '../ui/cx'

/** La moneda y el dado dorados que se tiran con animación: los usan la calculadora de LP y el duelo. */

/**
 * El salto (con su sombra en el piso) va aparte del giro: cada uno es una animación continua y el conjunto se ve fluido. El piso de abajo mide un 30 % del dado (`--die`: 1,5 rem con los 5 rem de siempre) para que
 * un dado chico (`[--die:3.5rem]` en un padre) no deje el mismo hueco.
 */
function Toss({ shadowWidth, still, children }: { shadowWidth: string; still: boolean; children: React.ReactNode }) {
  return (
    <div className="relative grid place-items-center pb-[calc(var(--die,5rem)*0.3)]">
      {/* Sobre el fondo oscuro una sombra sola no se ve: va una mesa tenue y, encima, la sombra que se achica en el aire. */}
      <span aria-hidden="true" className="absolute bottom-0 h-6 w-40 max-w-full rounded-[50%] bg-tint/10" />
      <span aria-hidden="true" className={cx('absolute bottom-1.5 h-3 rounded-[50%] bg-black/75 blur-[3px]', !still && 'animate-toss-shadow motion-reduce:animate-none', shadowWidth)} />
      <div className={cx('[transform-style:preserve-3d]', !still && 'animate-toss-hop motion-reduce:animate-none')}>{children}</div>
    </div>
  )
}

/** La moneda King of Games: cara adelante, cruz atrás; gira cinco vueltas frenando suave y cae del lado que salió (`still`: quieta, sin tirar). Mide `--coin` (7 rem si nadie lo cambia). */
export function Coin({ face, still = false }: { face: 0 | 1; still?: boolean }) {
  const coin = currentCoin()

  return (
    <Toss shadowWidth="w-20" still={still}>
      <div
        className={cx('relative size-[var(--coin,7rem)] [transform-style:preserve-3d]', !still && 'animate-coin-spin motion-reduce:animate-none')}
        style={{ transform: `rotateY(${face * 180}deg)`, '--coin-turns': `${1800 + face * 180}deg` } as CSSProperties}
      >
        <img src={coin.heads} alt="" draggable={false} className="absolute inset-0 size-full rounded-full object-cover [backface-visibility:hidden]" />
        <img src={coin.tails} alt="" draggable={false} className="absolute inset-0 size-full rounded-full object-cover [backface-visibility:hidden] [transform:rotateY(180deg)]" />
      </div>
    </Toss>
  )
}

/** Puntos de cada cara (celdas de una grilla de 3×3) y cómo se ubica cada cara en el cubo. */
const PIPS: Record<number, number[]> = { 2: [2, 6], 3: [2, 4, 6], 4: [0, 2, 6, 8], 5: [0, 2, 4, 6, 8], 6: [0, 2, 3, 5, 6, 8] }
const FACE_PLACEMENT: Record<number, string> = { 1: 'rotateY(0deg)', 2: 'rotateX(90deg)', 3: 'rotateY(90deg)', 4: 'rotateY(-90deg)', 5: 'rotateX(-90deg)', 6: 'rotateY(180deg)' }
/** Giro del cubo (X, Y) que deja esa cara mirando al frente. */
const FACE_UP: Record<number, [number, number]> = { 1: [0, 0], 2: [-90, 0], 3: [0, -90], 4: [0, 90], 5: [90, 0], 6: [0, 180] }
/** Dado dorado como el de la referencia: caras con degradé metálico y puntos tallados; el 1 es el Ojo Milenario. */
const FACE =
  'absolute inset-0 grid grid-cols-3 grid-rows-3 gap-1 p-[calc(var(--die,5rem)*0.15)] [backface-visibility:hidden] bg-[linear-gradient(145deg,#fbe48f_0%,#dcb345_48%,#b5841c_100%)] shadow-[inset_0_0_0_2px_rgba(255,244,196,0.8),inset_0_-8px_14px_rgba(110,70,0,0.4)]'
const PIP = 'rounded-full bg-[radial-gradient(circle_at_35%_35%,#ffeaa8,#d68a0e_55%,#6e4100)] shadow-[inset_0_1px_2px_rgba(0,0,0,0.5)]'

/** El dado: mide `--die` (5 rem si nadie lo cambia); `still`, quieto. */
export function Die({ value, still = false }: { value: number; still?: boolean }) {
  const [x, y] = FACE_UP[value] ?? [0, 0]

  return (
    <Toss shadowWidth="w-16" still={still}>
      <div
        className={cx('relative size-[var(--die,5rem)] [transform-style:preserve-3d]', !still && 'animate-die-spin motion-reduce:animate-none')}
        style={{ transform: `rotateX(${x}deg) rotateY(${y}deg)`, '--die-x': `${x + 720}deg`, '--die-y': `${y + 1080}deg` } as CSSProperties}
      >
        {[1, 2, 3, 4, 5, 6].map((face) => (
          <span key={face} className={FACE} style={{ transform: `${FACE_PLACEMENT[face]} translateZ(calc(var(--die, 5rem) / 2))` }}>
            {face === 1 ? (
              <MillenniumEye className="col-span-3 row-span-3 h-[72%] w-auto place-self-center" />
            ) : (
              Array.from({ length: 9 }, (_, cell) => <span key={cell} className={cx(PIPS[face]?.includes(cell) && PIP)} />)
            )}
          </span>
        ))}
      </div>
    </Toss>
  )
}

/** El símbolo Milenario: un triángulo invertido con el ojo adentro. */
function MillenniumEye({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 64 46" className={className} aria-hidden="true">
      <path d="M5 7h54L32 43Z" fill="#f3d26b" stroke="#6b4300" strokeWidth="2.5" strokeLinejoin="round" />
      <path d="M14 17q18-15 36 0q-18 15-36 0Z" fill="#fff4c4" stroke="#6b4300" strokeWidth="2" />
      <circle cx="32" cy="17" r="6" fill="#6b4300" />
      <circle cx="33.5" cy="15.5" r="2" fill="#ffeaa8" />
    </svg>
  )
}
