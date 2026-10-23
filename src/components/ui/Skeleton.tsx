import type { HTMLAttributes } from 'react'

import { cx } from './cx'

interface SkeletonProps extends HTMLAttributes<HTMLDivElement> {
  radius?: 'control' | 'panel' | 'chip' | 'none'
  /**
   * Sin el brillo que se mueve: queda como lo ve quien pidió menos movimiento. Para cuando hay muchos a la vez, como las imágenes de las cartas (`CardArt`): con las ~70 fichas
   * del deck cargando, el brillo de cada una recalculaba los estilos en cada cuadro (medido: ~340 ms de estilos en los primeros 6 s de un celular simulado; en una página
   * aislada el mismo brillo no cuesta nada, así que el problema es el brillo dentro de la app y todavía no se sabe por qué).
   */
  still?: boolean
}

const RADIUS = {
  control: 'rounded-control',
  panel: 'rounded-card',
  chip: 'rounded-full',
  none: 'rounded-none',
} as const

export function Skeleton({
  radius = 'control',
  still = false,
  className = '',
  ...props
}: SkeletonProps) {
  return (
    <div
      aria-hidden="true"
      className={cx(
        'relative overflow-hidden bg-tint/6 before:absolute before:inset-0 before:bg-linear-to-r before:from-transparent before:via-tint/10 before:to-transparent',
        !still && 'before:animate-shimmer motion-reduce:before:animate-none',
        RADIUS[radius],
        className,
      )}
      {...props}
    />
  )
}
