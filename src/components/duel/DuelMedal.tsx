import type { CSSProperties } from 'react'

import { cx } from '../ui/cx'
import { Icon, type IconName } from '../ui/Icon'

/**
 * La medalla en 3D de los carteles del duelo (el turno que te toca, y ganar, perder o empatar): una moneda de metal con grosor (una pila de discos en
 * profundidad), aro y disco de adentro, que entra con su propia animación y, quieta, flota. El color del metal es el que dice qué pasó (ámbar si ganaste, rojo si
 * perdiste, verde si vas primero, lavanda si vas segundo o empataron). Con `prefers-reduced-motion` se ve quieta, ya en su lugar.
 */
export type MedalTone = 'win' | 'lose' | 'draw' | 'first' | 'second'

interface Look {
  /** El color del metal (`--medal-rgb`). */
  rgb: string
  /** Cómo llega y qué hace después. */
  enter: string
  idle: boolean
  /** Rayos que giran detrás (los de ganar). */
  rays: boolean
  /** La grieta de perder. */
  crack: boolean
  /** De qué lado viene (la del turno). */
  from?: string
}

const LOOK: Record<MedalTone, Look> = {
  win: { rgb: 'var(--info-rgb)', enter: 'animate-medal-win', idle: true, rays: true, crack: false },
  lose: { rgb: 'var(--destructive-rgb)', enter: 'animate-medal-lose', idle: false, rays: false, crack: true },
  draw: { rgb: 'var(--accent-rgb)', enter: 'animate-medal-side', idle: true, rays: false, crack: false },
  first: { rgb: 'var(--success-rgb)', enter: 'animate-medal-side', idle: true, rays: false, crack: false, from: '-4rem' },
  second: { rgb: 'var(--accent-rgb)', enter: 'animate-medal-side', idle: true, rays: false, crack: false, from: '4rem' },
}

/** El grosor: siete discos del mismo metal, de atrás para adelante; de canto se ve el borde. */
const THICKNESS = [-3, -2, -1, 0, 1, 2, 3] as const
const STEP_PX = 1.5
const FACE_PX = 5.5

const SIZE = { md: 'size-28', lg: 'size-40' } as const

interface DuelMedalProps {
  tone: MedalTone
  /** Lo que lleva el disco: un ícono (ganar, perder, empatar) o un número (el turno). */
  icon?: IconName
  numeral?: string
  size?: keyof typeof SIZE
  className?: string
}

export function DuelMedal({ tone, icon, numeral, size = 'lg', className }: DuelMedalProps) {
  const look = LOOK[tone]
  const vars = { '--medal-rgb': look.rgb, ...(look.from ? { '--medal-from': look.from } : {}) } as CSSProperties
  const sign = tone === 'lose' ? 'text-danger-soft' : tone === 'win' ? 'text-info-soft' : tone === 'first' ? 'text-success-soft' : 'text-accent'

  return (
    <div aria-hidden="true" data-medal={tone} className={cx('relative grid place-items-center [perspective:900px]', SIZE[size], className)} style={vars}>
      {look.rays ? <span className="medal-rays absolute -inset-16 animate-medal-rays motion-reduce:animate-none" /> : null}
      <span className="absolute inset-2 rounded-full bg-[rgb(var(--medal-rgb)/0.4)] blur-2xl" />
      {/* El golpe de la derrota sacude el piso (esta capa), no la medalla. */}
      <div className={cx('relative size-full', tone === 'lose' && 'animate-medal-shake motion-reduce:animate-none')}>
        <div className={cx('relative size-full [transform-style:preserve-3d] motion-reduce:animate-none', look.enter)}>
          <div className={cx('absolute inset-0 [transform-style:preserve-3d] motion-reduce:animate-none', look.idle && 'animate-medal-idle')}>
            {THICKNESS.map((layer) => (
              <span key={layer} className="medal-rim absolute inset-0" style={{ transform: `translateZ(${layer * STEP_PX}px)`, filter: `brightness(${1 - Math.abs(layer) * 0.05})` }} />
            ))}
            <span className="medal-rim absolute inset-0 [backface-visibility:hidden]" style={{ transform: `translateZ(${FACE_PX}px)` }}>
              <span className="medal-face absolute inset-[7%] grid place-items-center overflow-hidden">
                {icon ? <Icon name={icon} size={size === 'lg' ? 64 : 48} className={sign} /> : null}
                {numeral ? <span className={cx('text-display font-extrabold leading-none', sign)}>{numeral}</span> : null}
                {look.crack ? (
                  <svg viewBox="0 0 100 100" className="absolute inset-0 size-full" fill="none" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M64 6 54 30 63 44 47 60 55 74 44 96" pathLength={1} strokeDasharray={1} strokeWidth={2.4} className="animate-medal-crack stroke-black/80 motion-reduce:animate-none" />
                    <path d="M63 44 78 52 88 70" pathLength={1} strokeDasharray={1} strokeWidth={1.6} className="animate-medal-crack stroke-black/70 motion-reduce:animate-none" />
                  </svg>
                ) : null}
                <span className="absolute inset-0 animate-fx-shine bg-[linear-gradient(105deg,transparent_35%,rgb(255_255_255/0.5)_50%,transparent_65%)] motion-reduce:hidden" style={{ animationDelay: tone === 'win' ? '1.5s' : '0.9s' }} />
              </span>
            </span>
            <span className="medal-rim absolute inset-0 [backface-visibility:hidden]" style={{ transform: `rotateY(180deg) translateZ(${FACE_PX}px)` }}>
              <span className="medal-face absolute inset-[7%]" />
            </span>
          </div>
        </div>
      </div>
    </div>
  )
}

/** Veinte piezas, repartidas con el ángulo áureo para que no queden en línea ni se repitan: [x, y, giro] en rem y grados. */
const PIECES = Array.from({ length: 24 }, (_, index) => {
  const angle = (index * 137.5 * Math.PI) / 180
  const radius = 5 + ((index * 7) % 6)

  return { dx: Math.round(Math.cos(angle) * radius * 12) / 10, dy: Math.round(Math.sin(angle) * radius * 7) / 10 - 4, spin: 360 + ((index * 53) % 540), delay: 1300 + ((index * 37) % 420) }
})
const PIECE_COLORS = ['bg-info', 'bg-success', 'bg-accent', 'bg-white'] as const

/** El confeti de ganar: sale de la medalla justo cuando aterriza. */
export function Confetti({ className }: { className?: string }) {
  return (
    <span aria-hidden="true" data-fx="confetti" className={cx('pointer-events-none absolute left-1/2 top-1/2 size-0 motion-reduce:hidden', className)}>
      {PIECES.map((piece, index) => (
        <span
          key={index}
          className={cx('absolute -ml-1 -mt-1.5 h-3 w-2 animate-confetti opacity-0', PIECE_COLORS[index % PIECE_COLORS.length])}
          style={{ '--dx': `${piece.dx}rem`, '--dy': `${piece.dy}rem`, '--spin': `${piece.spin}deg`, animationDelay: `${piece.delay}ms` } as CSSProperties}
        />
      ))}
    </span>
  )
}

/** El color del metal de una medalla, para teñir lo que va con ella (el título, la banda) con el mismo `--medal-rgb`. */
export const medalVars = (tone: MedalTone) => ({ '--medal-rgb': LOOK[tone].rgb }) as CSSProperties
