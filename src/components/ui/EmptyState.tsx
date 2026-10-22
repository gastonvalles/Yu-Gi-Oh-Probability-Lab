import type { ReactNode } from 'react'

import { cx } from './cx'
import { Icon, type IconName } from './Icon'

interface EmptyStateProps {
  icon?: IconName
  title: ReactNode
  children?: ReactNode
  /** Las puertas para salir del vacío: uno o dos botones (la principal al final), centrados debajo del texto. */
  actions?: ReactNode
  className?: string
}

/** Pantalla o lista vacía: qué falta y qué hacer, sin caja ni marcos. */
export function EmptyState({ icon = 'layers', title, children, actions, className }: EmptyStateProps) {
  return (
    <div className={cx('grid justify-items-center gap-2 px-4 py-8 text-center motion-safe:animate-step-in', className)}>
      <Icon name={icon} size={28} className="text-foreground" />
      <strong className="text-body font-semibold text-foreground">{title}</strong>
      {children ? <p className="m-0 max-w-md text-body text-muted">{children}</p> : null}
      {actions ? <div className="mt-2 flex flex-wrap justify-center gap-2">{actions}</div> : null}
    </div>
  )
}
