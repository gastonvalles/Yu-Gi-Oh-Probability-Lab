import type { HTMLAttributes } from 'react'

interface SkeletonProps extends HTMLAttributes<HTMLDivElement> {
  radius?: 'control' | 'panel' | 'chip' | 'none'
}

export function Skeleton({
  radius = 'control',
  className = '',
  ...props
}: SkeletonProps) {
  return (
    <div
      aria-hidden="true"
      className={[
        'app-skeleton',
        radius === 'panel'
          ? 'app-skeleton-panel'
          : radius === 'chip'
            ? 'app-skeleton-chip'
            : radius === 'none'
              ? 'app-skeleton-none'
              : '',
        className,
      ].join(' ').trim()}
      {...props}
    />
  )
}
