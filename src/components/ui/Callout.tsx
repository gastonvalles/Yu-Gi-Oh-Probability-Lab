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
  brand: 'info',
  success: 'check-circle',
  warning: 'alert',
  danger: 'alert',
  info: 'info',
}

/** Aviso o consejo: ícono + título + texto sobre un fondo teñido (sin borde ni cajas adentro). Si la acción no entra al lado de 8rem de texto, baja a su propia línea, a la derecha (en el celular, un botón largo empujaba el aviso fuera de la pantalla). */
export function Callout({ tone = 'info', icon, title, children, action, className }: CalloutProps) {
  return (
    <div className={cx('flex min-w-0 flex-wrap items-start gap-3 rounded-control p-3', TONE[tone].soft, className)} role={tone === 'danger' ? 'alert' : undefined}>
      <Icon name={icon ?? DEFAULT_ICON[tone]} size={18} strokeWidth={2} className={cx('mt-0.5 shrink-0', TONE[tone].text)} />
      <div className="grid min-w-0 flex-[1_1_8rem] gap-0.5">
        {title ? <strong className="text-body font-semibold text-foreground">{title}</strong> : null}
        {children ? <div className="text-body text-muted [&_strong]:font-semibold [&_strong]:text-foreground">{children}</div> : null}
      </div>
      {action ? <div className="ml-auto shrink-0">{action}</div> : null}
    </div>
  )
}
