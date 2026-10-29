import { useId, useRef, type ReactNode } from 'react'
import { createPortal } from 'react-dom'

import { useFocusTrap } from '../../app/use-focus-trap'
import { useBodyScrollLock, useEscapeKey } from '../../app/use-overlay'
import { usePresence } from '../../app/use-presence'
import { t } from '../../i18n'
import { cx } from './cx'
import { Heading } from './Heading'
import { CloseButton } from './IconButton'
import { surface } from './surfaces'

type SideDrawerSize = 'half' | 'column'

/**
 * Dos anchos y nada más, así dos cajones que se abren uno sobre otro (la búsqueda y sus filtros) se cubren justo.
 * column: el ancho de la columna de búsqueda del builder (el 30 % de lo que queda con el menú abierto, con mínimo de 360 px; en el celular, todo el ancho): la búsqueda global,
 * sus filtros y todo lo que se arma como un formulario · half: la mitad de la pantalla (con un mínimo para que en el celular entre lo que lleva): el chat.
 */
const PANEL_SIZE: Record<SideDrawerSize, string> = {
  half: 'w-1/2 min-w-[15rem]',
  column: 'w-[max(22.5rem,calc((100vw-15rem)*0.3))] max-w-full max-sm:w-full',
}
/** En `column` lo de adentro trae su propio relleno (el panel del builder, el formulario de filtros). */
const BODY_PADDING: Record<SideDrawerSize, string> = { half: 'p-3', column: 'p-0' }

interface SideDrawerProps {
  isOpen: boolean
  onClose: () => void
  title: ReactNode
  children: ReactNode
  size?: SideDrawerSize
  /** false = sin velo (el chat de la mesa): lo de atrás no se oscurece y tocarlo igual cierra el panel, como en `Modal`. */
  veil?: boolean
}

/**
 * Un panel que entra por la derecha y ocupa la mitad de la pantalla (con un mínimo para que en el celular entre lo que lleva), sobre un velo que deja ver lo de atrás:
 * para algo que se consulta mientras se juega, como el chat. Se monta en <body>; se cierra con la X, el velo o Escape.
 */
export function SideDrawer({ isOpen, onClose, title, children, size = 'half', veil = true }: SideDrawerProps) {
  const titleId = useId()
  const rootRef = useRef<HTMLDivElement | null>(null)
  const panelRef = useRef<HTMLDivElement | null>(null)

  useEscapeKey(onClose, isOpen)
  useFocusTrap(panelRef, isOpen)
  useBodyScrollLock(isOpen)

  // Al cerrarse sale por donde entró (`usePresence`): el panel vuelve a la derecha y el velo se funde.
  return usePresence(isOpen, isOpen && typeof document !== 'undefined' ? createPortal(
    <div ref={rootRef} className="fixed inset-0 z-180 flex justify-end">
      <div aria-hidden="true" className={cx('absolute inset-0', veil && 'animate-nav-scrim bg-background/45 motion-reduce:animate-none')} onClick={onClose} />
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        tabIndex={-1}
        className={cx('relative flex h-full animate-side-drawer flex-col overflow-hidden rounded-r-none border-r-0 outline-none motion-reduce:animate-none', PANEL_SIZE[size], veil ? surface.panel : surface.floating)}
      >
        <header className="flex items-center justify-between gap-2 border-b border-border-subtle px-3 py-3">
          <Heading level="card" id={titleId}>
            {title}
          </Heading>
          <CloseButton size="sm" aria-label={t('common.close')} onClick={onClose} />
        </header>
        <div className={cx('min-h-0 flex-1 overflow-hidden', BODY_PADDING[size])}>{children}</div>
      </div>
    </div>,
    document.body,
  ) : null, () => [rootRef.current])
}
