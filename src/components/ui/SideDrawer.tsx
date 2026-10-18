import { useId, useRef, type ReactNode } from 'react'
import { createPortal } from 'react-dom'

import { useFocusTrap } from '../../app/use-focus-trap'
import { useBodyScrollLock, useEscapeKey } from '../../app/use-overlay'
import { t } from '../../i18n'
import { cx } from './cx'
import { Heading } from './Heading'
import { CloseButton } from './IconButton'
import { surface } from './surfaces'

type SideDrawerSize = 'half' | 'column' | 'sheet'

/**
 * half: la mitad de la pantalla (con un mínimo para que en el celular entre lo que lleva) · column: el ancho de la columna de búsqueda del builder (el 30 % de lo que queda con
 * el menú abierto, con mínimo de 360 px) · sheet: una hoja de formulario, que en el celular ocupa todo el ancho y en escritorio 28 rem (los filtros de la búsqueda).
 */
const PANEL_SIZE: Record<SideDrawerSize, string> = {
  half: 'w-1/2 min-w-[15rem]',
  column: 'w-[max(22.5rem,calc((100vw-15rem)*0.3))] max-w-full',
  sheet: 'w-[min(100vw,28rem)]',
}
/** En `column` y `sheet` lo de adentro trae su propio relleno (el panel del builder, el formulario de filtros). */
const BODY_PADDING: Record<SideDrawerSize, string> = { half: 'p-3', column: 'p-0', sheet: 'p-0' }

interface SideDrawerProps {
  isOpen: boolean
  onClose: () => void
  title: ReactNode
  children: ReactNode
  size?: SideDrawerSize
}

/**
 * Un panel que entra por la derecha y ocupa la mitad de la pantalla (con un mínimo para que en el celular entre lo que lleva), sobre un velo que deja ver lo de atrás:
 * para algo que se consulta mientras se juega, como el chat. Se monta en <body>; se cierra con la X, el velo o Escape.
 */
export function SideDrawer({ isOpen, onClose, title, children, size = 'half' }: SideDrawerProps) {
  const titleId = useId()
  const panelRef = useRef<HTMLDivElement | null>(null)

  useEscapeKey(onClose, isOpen)
  useFocusTrap(panelRef, isOpen)
  useBodyScrollLock(isOpen)

  if (!isOpen || typeof document === 'undefined') {
    return null
  }

  return createPortal(
    <div className="fixed inset-0 z-180 flex justify-end">
      <div aria-hidden="true" className="absolute inset-0 animate-nav-scrim bg-background/45 motion-reduce:animate-none" onClick={onClose} />
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        tabIndex={-1}
        className={cx('relative flex h-full animate-side-drawer flex-col overflow-hidden rounded-r-none border-r-0 outline-none motion-reduce:animate-none', PANEL_SIZE[size], surface.panel)}
      >
        <header className="flex items-start justify-between gap-2 border-b border-border-subtle px-3 py-3">
          <Heading level="card" id={titleId}>
            {title}
          </Heading>
          <CloseButton size="sm" aria-label={t('common.close')} onClick={onClose} />
        </header>
        <div className={cx('min-h-0 flex-1 overflow-hidden', BODY_PADDING[size])}>{children}</div>
      </div>
    </div>,
    document.body,
  )
}
