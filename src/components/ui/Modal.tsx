import { useId, type ReactNode } from 'react'
import { createPortal } from 'react-dom'

import { useBodyScrollLock, useEscapeKey } from '../../app/use-overlay'
import { CloseButton } from './IconButton'

export type ModalSize = 'sm' | 'md' | 'lg' | 'xl'

interface ModalProps {
  isOpen: boolean
  onClose: () => void
  size?: ModalSize
  kicker?: ReactNode
  title?: ReactNode
  subtitle?: ReactNode
  /** Acciones a la derecha del título (además de cerrar). */
  headerActions?: ReactNode
  footer?: ReactNode
  /** Sin encabezado estándar: el contenido trae el suyo (se mantiene la X). */
  bare?: boolean
  /** Sin padding en el cuerpo: el contenido arma sus propias secciones. */
  flush?: boolean
  /** El contenido trae su propia X (p. ej. el detalle de carta). */
  hideCloseButton?: boolean
  /** false = sólo se cierra con un botón propio (avisos que requieren confirmación). */
  dismissible?: boolean
  role?: 'dialog' | 'alertdialog'
  ariaLabel?: string
  /** Ajuste puntual del panel (p. ej. un alto fijo propio para ese modal). */
  className?: string
  children: ReactNode
}

/**
 * Modal único de la app: se monta en <body> (así nunca queda atrapado dentro de un
 * contenedor con transform), centrado, con el mismo fondo, animación, cierre y scroll.
 */
export function Modal({
  isOpen,
  onClose,
  size = 'md',
  kicker,
  title,
  subtitle,
  headerActions,
  footer,
  bare = false,
  flush = false,
  hideCloseButton = false,
  dismissible = true,
  role = 'dialog',
  ariaLabel,
  className,
  children,
}: ModalProps) {
  const id = useId()
  const titleId = `${id}-title`

  useBodyScrollLock(isOpen)
  useEscapeKey(onClose, isOpen && dismissible)

  if (!isOpen || typeof document === 'undefined') {
    return null
  }

  const hasHeader = !bare && (kicker || title || subtitle || headerActions)

  return createPortal(
    <div className="app-modal-root" onClick={dismissible ? onClose : undefined}>
      <div
        role={role}
        aria-modal="true"
        aria-labelledby={hasHeader && title ? titleId : undefined}
        aria-label={hasHeader && title ? undefined : ariaLabel}
        className={['app-modal-panel app-dialog-enter surface-panel', className].filter(Boolean).join(' ')}
        data-size={size}
        onClick={(event) => event.stopPropagation()}
      >
        {hasHeader ? (
          <header className="app-modal-header">
            <div className="app-modal-heading">
              {kicker ? <p className="app-kicker m-0 text-[0.68rem] uppercase tracking-widest">{kicker}</p> : null}
              {title ? (
                <h3 id={titleId} className="app-modal-title">
                  {title}
                </h3>
              ) : null}
              {subtitle ? <p className="app-modal-subtitle">{subtitle}</p> : null}
            </div>
            <div className="app-modal-header-actions">
              {headerActions}
              {dismissible ? <CloseButton size="sm" aria-label="Cerrar" onClick={onClose} /> : null}
            </div>
          </header>
        ) : dismissible && !hideCloseButton ? (
          <CloseButton size="md" aria-label="Cerrar" className="app-modal-floating-close" onClick={onClose} />
        ) : null}

        <div className="app-modal-body" data-flush={flush ? 'true' : 'false'}>
          {children}
        </div>

        {footer ? <footer className="app-modal-footer">{footer}</footer> : null}
      </div>
    </div>,
    document.body,
  )
}
