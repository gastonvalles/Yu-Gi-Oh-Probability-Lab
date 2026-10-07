import type { ReactNode } from 'react'

import { cx } from './cx'
import { Icon, type IconName } from './Icon'
import { TONE, type Tone } from './tone'

interface CalloutProps {
  tone?: Tone
  icon?: IconName
  title?: ReactNode
  children?: ReactNode
  /** Acción a la derecha (botón). */
  action?: ReactNode
  className?: string
}

const DEFAULT_ICON: Record<Tone, IconName> = {
  neutral: 'info',
  brand: 'sparkles',
  success: 'check-circle',
  warning: 'alert',
  danger: 'alert',
  info: 'info',
}

/** Aviso o consejo: ícono + título + texto, teñido por tono. Reemplaza a los recuadros sueltos de cada pantalla. */
export function Callout({ tone = 'info', icon, title, children, action, className }: CalloutProps) {
  return (
    <div className={cx('flex min-w-0 items-start gap-3 rounded-control border p-3', TONE[tone].tint, className)} role={tone === 'danger' ? 'alert' : undefined}>
      <span className={cx('mt-px grid size-6 shrink-0 place-items-center rounded-full bg-black/25', TONE[tone].text)}>
        <Icon name={icon ?? DEFAULT_ICON[tone]} size={14} strokeWidth={2} />
      </span>
      <div className="grid min-w-0 flex-1 gap-0.5">
        {title ? <strong className="text-body font-semibold text-foreground">{title}</strong> : null}
        {children ? <div className="text-body text-muted [&_strong]:font-semibold [&_strong]:text-foreground">{children}</div> : null}
      </div>
      {action ? <div className="shrink-0">{action}</div> : null}
    </div>
  )
}
