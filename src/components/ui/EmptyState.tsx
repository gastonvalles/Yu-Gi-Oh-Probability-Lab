import type { ReactNode } from 'react'

import { cx } from './cx'
import { Icon, type IconName } from './Icon'

interface EmptyStateProps {
  icon?: IconName
  title: ReactNode
  children?: ReactNode
  action?: ReactNode
  className?: string
}

/** Pantalla o lista vacía: qué falta y qué hacer, sin ruido. */
export function EmptyState({ icon = 'layers', title, children, action, className }: EmptyStateProps) {
  return (
    <div className={cx('grid justify-items-center gap-2 rounded-card border border-dashed border-border px-4 py-8 text-center', className)}>
      <span className="grid size-10 place-items-center rounded-full border border-border bg-foreground/5 text-soft">
        <Icon name={icon} size={20} />
      </span>
      <strong className="text-body font-semibold text-foreground">{title}</strong>
      {children ? <p className="m-0 max-w-md text-body text-muted">{children}</p> : null}
      {action ? <div className="mt-1">{action}</div> : null}
    </div>
  )
}
