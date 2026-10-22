import { useEffect, useRef, useState } from 'react'

import { usePresence } from '../../app/use-presence'
import { cx } from './cx'
import { Icon, type IconName } from './Icon'
import { IconButton } from './IconButton'

export interface OverflowItem {
  label: string
  icon?: IconName
  /** danger: lo que borra (en rojo). */
  tone?: 'danger'
  onSelect: () => void
}

interface OverflowMenuProps {
  /** El nombre del botón para lectores de pantalla («Más opciones de …»). */
  label: string
  items: ReadonlyArray<OverflowItem>
  className?: string
}

/**
 * El menú de los tres puntos (⋯) de una tarjeta, como el de los videos de YouTube: un botón sin caja que abre una lista corta de acciones pegada a su borde derecho.
 * Se cierra al elegir, al tocar afuera o con Escape (y el foco vuelve al botón). Las acciones que importan van a la vista; acá van las de segundo plano.
 */
export function OverflowMenu({ label, items, className }: OverflowMenuProps) {
  const [open, setOpen] = useState(false)
  const root = useRef<HTMLDivElement | null>(null)
  const menuRef = useRef<HTMLDivElement | null>(null)

  useEffect(() => {
    if (!open) {
      return
    }

    const onPointerDown = (event: PointerEvent) => {
      if (!root.current?.contains(event.target as Node)) setOpen(false)
    }
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setOpen(false)
        root.current?.querySelector('button')?.focus()
      }
    }

    document.addEventListener('pointerdown', onPointerDown)
    document.addEventListener('keydown', onKeyDown)

    return () => {
      document.removeEventListener('pointerdown', onPointerDown)
      document.removeEventListener('keydown', onKeyDown)
    }
  }, [open])

  // Al cerrarse se achica y se funde, la inversa de su entrada (`usePresence`).
  const menu = usePresence(
    open,
    open ? (
      <div ref={menuRef} role="menu" aria-label={label} className="absolute right-0 top-full z-30 mt-1 grid min-w-48 animate-pop gap-0.5 rounded-control border border-border bg-surface-raised p-1 shadow-overlay motion-reduce:animate-none">
        {items.map((item) => (
          <button
            key={item.label}
            type="button"
            role="menuitem"
            className={cx('flex min-h-10 w-full cursor-pointer items-center gap-2.5 rounded-tag border-0 bg-transparent px-3 text-left text-body font-medium transition-colors duration-100 hover:bg-tint/12 focus-visible:bg-tint/12 focus-visible:outline-none pointer-coarse:min-h-11', item.tone === 'danger' ? 'text-danger-soft' : 'text-foreground')}
            onClick={() => {
              setOpen(false)
              item.onSelect()
            }}
          >
            {item.icon ? <Icon name={item.icon} size={18} /> : null}
            {item.label}
          </button>
        ))}
      </div>
    ) : null,
    () => [menuRef.current],
  )

  return (
    <div ref={root} className={cx('relative', className)}>
      <IconButton tone="ghost" size="sm" aria-label={label} aria-haspopup="menu" aria-expanded={open} onClick={() => setOpen((current) => !current)}>
        <Icon name="more" size={20} />
      </IconButton>
      {menu}
    </div>
  )
}
