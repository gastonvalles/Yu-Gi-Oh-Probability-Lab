import type { HTMLAttributes } from 'react'

import { cx } from './cx'

interface SkeletonProps extends HTMLAttributes<HTMLDivElement> {
  radius?: 'control' | 'panel' | 'chip' | 'none'
}

const RADIUS = {
  control: 'rounded-control',
  panel: 'rounded-card',
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
        'relative overflow-hidden bg-tint/6 before:absolute before:inset-0 before:animate-shimmer before:bg-linear-to-r before:from-transparent before:via-tint/10 before:to-transparent motion-reduce:before:animate-none',
        RADIUS[radius],
        className,
      )}
      {...props}
    />
  )
}
