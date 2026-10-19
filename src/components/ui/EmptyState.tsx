import type { ReactNode } from 'react'

import { cx } from './cx'
import { Icon, type IconName } from './Icon'

interface EmptyStateProps {
  icon?: IconName
  title: ReactNode
  children?: ReactNode
  className?: string
}

/** Pantalla o lista vacía: qué falta y qué hacer, sin caja ni marcos. */
export function EmptyState({ icon = 'layers', title, children, className }: EmptyStateProps) {
  return (
    <div className={cx('grid justify-items-center gap-2 px-4 py-8 text-center motion-safe:animate-step-in', className)}>
      <Icon name={icon} size={28} className="text-primary-soft/70" />
      <strong className="text-body font-semibold text-foreground">{title}</strong>
      {children ? <p className="m-0 max-w-md text-body text-muted">{children}</p> : null}
    </div>
  )
}
