import { createContext, useContext, useLayoutEffect } from 'react'

import { t } from '../../i18n'
import { cx } from '../ui/cx'
import { Icon } from '../ui/Icon'
import { IconButton } from '../ui/IconButton'

/** Lo que `AppShell` le ofrece a una pantalla a pantalla completa: abrir el menú y avisar que ella trae su propio botón (entonces el armazón no dibuja su barra de arriba). */
export interface ShellMenu {
  open: () => void
  isOpen: boolean
  /** Devuelve cómo soltarlo: mientras alguien lo tiene reclamado, la barra de arriba del celular no se dibuja en una pantalla completa. */
  claim: () => () => void
}

export const ShellMenuContext = createContext<ShellMenu | null>(null)

/**
 * La hamburguesa de la mesa a pantalla completa (práctica, duelo, espectador): vive en la primera fila de la propia pantalla, así hay una sola barra arriba y no dos.
 * Sólo en el celular (en escritorio el menú lateral está siempre). Fuera de un `AppShell` no dibuja nada.
 */
export function ShellMenuButton({ className }: { className?: string }) {
  const menu = useContext(ShellMenuContext)
  const claim = menu?.claim

  useLayoutEffect(() => claim?.(), [claim])

  if (!menu) {
    return null
  }

  return (
    <IconButton tone="flat" size="sm" aria-label={t('shell.nav.open')} aria-haspopup="dialog" aria-expanded={menu.isOpen} className={cx('min-[1101px]:hidden', className)} onClick={menu.open}>
      <Icon name="menu" size={22} />
    </IconButton>
  )
}
