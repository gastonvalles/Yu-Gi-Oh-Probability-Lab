import type { ElementType, ReactNode } from 'react'

import { cx } from './cx'
import { Icon, type IconName } from './Icon'
import { supportText, textLink } from './typography'
import { Heading } from './Heading'

interface SectionHeaderProps {
  title: ReactNode
  description?: ReactNode
  /** Ícono suelto (sin recuadro) a la izquierda del título. */
  icon?: IconName
  /** Controles a la derecha (filtros, botones). */
  actions?: ReactNode
  /**
   * Una acción corta a la derecha que se lee como enlace («Ver las 12», «Actualizar»): ámbar como todo hipervínculo (`textLink`), con la flecha si lleva a otra vista
   * (`chevron`, por defecto sí). Toca en 44 px de alto sin agrandar el renglón: el margen negativo deja que ocupe el alto del título. Una por encabezado.
   */
  link?: { label: ReactNode; href?: string; onClick?: () => void; chevron?: boolean }
  as?: 'h2' | 'h3'
  className?: string
}

/** Encabezado de tarjeta o sección: ícono + título + descripción a la izquierda, acciones (o una acción-enlace) a la derecha. */
export function SectionHeader({ title, description, icon, actions, link, as = 'h2', className }: SectionHeaderProps) {
  const LinkTag: ElementType = link?.href ? 'a' : 'button'

  return (
    <header className={cx('flex flex-wrap items-start justify-between gap-x-4 gap-y-2', className)}>
      {/* Con `link`, el título cede el ancho (corta en renglones) y el enlace queda a su altura, sin bajar de renglón. */}
      <div className={cx('flex min-w-0 items-start gap-3', link && 'flex-1')}>
        {icon ? <Icon name={icon} size={20} className="mt-0.5 shrink-0 text-foreground" /> : null}
        <div className="grid min-w-0 gap-0.5">
          <Heading level="section" as={as}>
            {title}
          </Heading>
          {description ? <p className={supportText}>{description}</p> : null}
        </div>
      </div>
      {actions ? <div className="flex flex-wrap items-center gap-2">{actions}</div> : null}
      {link ? (
        <LinkTag
          {...(link.href ? { href: link.href, onClick: link.onClick } : { type: 'button' as const, onClick: link.onClick })}
          className={cx('-my-2.25 inline-flex min-h-11 shrink-0 items-center gap-0.5 rounded-control text-body', textLink)}
        >
          {link.label}
          {(link.chevron ?? true) ? <Icon name="chevron-right" size={16} /> : null}
        </LinkTag>
      ) : null}
    </header>
  )
}
