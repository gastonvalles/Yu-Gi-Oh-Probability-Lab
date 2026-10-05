import type { HTMLAttributes } from 'react'

import { cx } from './cx'

interface SkeletonProps extends HTMLAttributes<HTMLDivElement> {
  radius?: 'control' | 'panel' | 'chip' | 'none'
}

const RADIUS = {
  control: 'rounded-control',
  panel: 'rounded-panel',
  chip: 'rounded-full',
  none: 'rounded-none',
} as const

export function Skeleton({
  radius = 'control',
  className = '',
  ...props
}: SkeletonProps) {
  return (
    <div
      aria-hidden="true"
      className={cx(
        'animate-shimmer bg-linear-to-r from-foreground/5 via-foreground/11 to-foreground/5 bg-size-[200%_100%] motion-reduce:animate-none',
        RADIUS[radius],
        className,
      )}
      {...props}
    />
  )
}
