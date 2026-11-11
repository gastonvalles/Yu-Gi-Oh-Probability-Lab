import type { ReactNode } from 'react'

import { cx } from '../ui/cx'
import { Icon, type IconName } from '../ui/Icon'

/**
 * La placa de los carteles del duelo (el turno que te toca, y ganar, perder o empatar): un cuadrado plano, de esquinas rectas como la mesa, con su aro del mismo
 * color separado un poco. El color dice qué pasó: lima si ganaste, rojo si perdiste, violeta si vas primero, lavanda si vas segundo o empataron; el texto va en
 * carbón sobre lima y lavanda, y en blanco sobre violeta y rojo (4,5:1). Entra una vez (crece y se endereza, 700 ms) y se queda quieta: nada gira ni brilla sin
 * fin. Con `prefers-reduced-motion` aparece ya en su lugar. Sin `children` es decorado (`aria-hidden`); con ellos (el título del final) se lee.
 */
export type MedalTone = 'win' | 'lose' | 'draw' | 'first' | 'second'

const LOOK: Record<MedalTone, string> = {
  win: 'bg-info text-info-foreground outline-info',
  lose: 'bg-danger text-primary-foreground outline-danger',
  draw: 'bg-accent text-accent-foreground outline-accent',
  first: 'bg-primary text-primary-foreground outline-primary',
  second: 'bg-accent text-accent-foreground outline-accent',
}

const SIZE = { md: 'size-20 min-[1101px]:size-28', lg: 'size-32 min-[1101px]:size-36' } as const

interface DuelMedalProps {
  tone: MedalTone
  /** Lo que lleva la placa: un ícono (ganar, perder, empatar) o un número (el turno). */
  icon?: IconName
  numeral?: string
  size?: keyof typeof SIZE
  className?: string
  /** El título del final, dentro de la placa. */
  children?: ReactNode
}

export function DuelMedal({ tone, icon, numeral, size = 'lg', className, children }: DuelMedalProps) {
  return (
    <div
      aria-hidden={children ? undefined : true}
      data-medal={tone}
      className={cx('grid shrink-0 animate-plate-in place-content-center justify-items-center gap-1 p-2 outline-4 outline-offset-4 motion-reduce:animate-none', SIZE[size], LOOK[tone], className)}
    >
      {icon ? <Icon name={icon} size={children ? 24 : size === 'lg' ? 56 : 40} /> : null}
      {numeral ? <span className="text-display font-extrabold leading-none">{numeral}</span> : null}
      {children}
    </div>
  )
}
