import type { ReactNode } from 'react'

import { cx } from './cx'
import { Icon, type IconName } from './Icon'
import { TONE, type Tone } from './tone'
import { sectionTitle, supportText } from './typography'

interface SectionHeaderProps {
  title: ReactNode
  description?: ReactNode
  /** Ícono suelto (sin recuadro) a la izquierda del título. */
  icon?: IconName
  tone?: Tone
  /** Controles a la derecha (filtros, botones). */
  actions?: ReactNode
  as?: 'h2' | 'h3'
  className?: string
}

/** Encabezado de tarjeta o sección: ícono + título + descripción a la izquierda, acciones a la derecha. */
export function SectionHeader({ title, description, icon, tone = 'brand', actions, as: Heading = 'h3', className }: SectionHeaderProps) {
  return (
    <header className={cx('flex flex-wrap items-start justify-between gap-x-4 gap-y-2', className)}>
      <div className="flex min-w-0 items-start gap-3">
        {icon ? (
          <Icon name={icon} size={20} className={cx('mt-0.5 shrink-0', TONE[tone].text)} />
        ) : null}
        <div className="grid min-w-0 gap-0.5">
          <Heading className={sectionTitle}>{title}</Heading>
          {description ? <p className={supportText}>{description}</p> : null}
        </div>
      </div>
      {actions ? <div className="flex flex-wrap items-center gap-2">{actions}</div> : null}
    </header>
  )
}
