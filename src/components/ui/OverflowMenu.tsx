import { Fragment, useEffect, useRef, useState } from 'react'

import { useFocusTrap } from '../../app/use-focus-trap'
import { usePresence } from '../../app/use-presence'
import { cx } from './cx'
import { Icon, type IconName } from './Icon'
import { IconButton } from './IconButton'
import { SwitchMark } from './Switch'

export interface OverflowItem {
  label: string
  icon?: IconName
  /** danger: lo que borra (en rojo). */
  tone?: 'danger'
  onSelect: () => void
  /** Un ajuste que se prende y se apaga (la vista 3D, los sonidos): la fila es un `menuitemcheckbox` con su interruptor a la vista, y el menú no se cierra al tocarla. */
  checked?: boolean
  /** Un dato chico a la derecha («3», «sin jugadas»). */
  meta?: string
  /** Una línea chica debajo del nombre (para qué sirve). */
  hint?: string
  /** Abre otra hoja: lleva la flecha ›. */
  opens?: boolean
  disabled?: boolean
  /** El título del grupo que empieza en esta fila («La mesa», «El duelo»): desde el segundo, con una línea fina arriba. */
  group?: string
}

interface OverflowMenuProps {
  /** El nombre del botón para lectores de pantalla («Más opciones de …»). */
  label: string
  items: ReadonlyArray<OverflowItem>
  /** bar: el ⋯ de la barra de la mesa (blanco de 44 px como los demás íconos de la barra, ámbar con el menú abierto) y un menú más ancho, en grupos. */
  trigger?: 'ghost' | 'bar'
  /** Arranca abierto (la muestra del catálogo): el foco no entra hasta que alguien lo toca. */
  defaultOpen?: boolean
  className?: string
}

/** Las filas, partidas en grupos donde una dice `group` (sin títulos, una sola lista). */
function sections(items: ReadonlyArray<OverflowItem>): Array<{ title?: string; items: OverflowItem[] }> {
  const out: Array<{ title?: string; items: OverflowItem[] }> = []

  for (const item of items) {
    if (item.group !== undefined || out.length === 0) out.push({ ...(item.group === undefined ? {} : { title: item.group }), items: [] })
    out[out.length - 1]!.items.push(item)
  }

  return out
}

/**
 * El menú de los tres puntos (⋯), como el de los videos de YouTube: un botón sin caja que abre una lista corta pegada a su borde derecho. Las acciones que importan van a la vista; acá, las de segundo plano.
 * Se cierra al elegir (un ajuste con interruptor no: se ve cómo cambia), al tocar afuera o con Escape (y el foco vuelve al botón). Al abrirse el foco entra a la primera fila (la trampa común: nunca a un
 * campo de texto, así que en el celular no abre el teclado); ↑ ↓ recorren las filas.
 * - Variantes: `trigger` ghost (el chico de una tarjeta) o bar (el de la barra de la mesa); las filas pueden llevar interruptor (`checked`), dato (`meta`), pista (`hint`), flecha (`opens`), apagarse
 *   (`disabled`) y armar grupos con título (`group`).
 * - Usos: las tarjetas de builds y de replays, la lista de reglas del Lab y el ⋯ de la barra de la mesa (`MatMoreMenu`).
 */
export function OverflowMenu({ label, items, trigger = 'ghost', defaultOpen = false, className }: OverflowMenuProps) {
  const [open, setOpen] = useState(defaultOpen)
  const [touched, setTouched] = useState(!defaultOpen)
  const root = useRef<HTMLDivElement | null>(null)
  const menuRef = useRef<HTMLDivElement | null>(null)
  const bar = trigger === 'bar'
  // Lo que hay del borde izquierdo de la ventana al borde derecho del botón: el menú de la barra (que se pega a ese borde) no pasa de ahí, así no se corta a 320 px.
  const [room, setRoom] = useState<number | null>(null)
  const toggle = () => {
    setTouched(true)
    setRoom(root.current ? Math.round(root.current.getBoundingClientRect().right) : null)
    setOpen((current) => !current)
  }

  useFocusTrap(menuRef, open && touched)

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
      } else if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
        const rows = [...(menuRef.current?.querySelectorAll<HTMLElement>('[role^="menuitem"]:not(:disabled)') ?? [])]
        const at = rows.indexOf(document.activeElement as HTMLElement)

        if (rows.length === 0) return
        event.preventDefault()
        rows[(at + (event.key === 'ArrowDown' ? 1 : -1) + rows.length) % rows.length]!.focus()
      }
    }

    document.addEventListener('pointerdown', onPointerDown)
    document.addEventListener('keydown', onKeyDown)

    return () => {
      document.removeEventListener('pointerdown', onPointerDown)
      document.removeEventListener('keydown', onKeyDown)
    }
  }, [open])

  const row = (item: OverflowItem) => (
    <button
      key={item.label}
      type="button"
      role={item.checked === undefined ? 'menuitem' : 'menuitemcheckbox'}
      aria-checked={item.checked}
      disabled={item.disabled}
      className={cx(
        'flex w-full cursor-pointer items-center rounded-tag border-0 bg-transparent px-3 text-left text-body transition-colors duration-100 hover:bg-tint/12 focus-visible:bg-tint/12 focus-visible:outline-none disabled:cursor-default disabled:bg-transparent disabled:text-soft',
        bar ? 'min-h-12 gap-3 font-semibold' : 'min-h-10 gap-2.5 font-medium pointer-coarse:min-h-11',
        item.tone === 'danger' ? 'text-danger-soft' : 'text-foreground',
      )}
      onClick={() => {
        if (item.checked === undefined) setOpen(false)
        item.onSelect()
      }}
    >
      {item.icon ? <Icon name={item.icon} size={bar ? 22 : 18} strokeWidth={bar ? 1.5 : 1.75} className="shrink-0" /> : null}
      <span className="grid min-w-0 flex-1 py-1.5">
        <span>{item.label}</span>
        {item.hint ? <span className="text-micro font-normal text-soft">{item.hint}</span> : null}
      </span>
      {item.meta ? <span className="shrink-0 text-micro font-semibold text-muted">{item.meta}</span> : null}
      {item.checked === undefined ? null : <SwitchMark checked={item.checked} />}
      {item.opens ? <Icon name="chevron-right" size={18} className="shrink-0" /> : null}
    </button>
  )

  // Al cerrarse se achica y se funde, la inversa de su entrada (`usePresence`).
  const menu = usePresence(
    open,
    open ? (
      <div
        ref={menuRef}
        role="menu"
        aria-label={label}
        tabIndex={-1}
        style={bar && room !== null ? { maxWidth: `min(calc(100vw - 1rem), ${room - 8}px)` } : undefined}
        className={cx('absolute right-0 top-full z-70 mt-1 grid animate-pop gap-0.5 border border-border shadow-overlay focus-visible:outline-none motion-reduce:animate-none', bar ? 'w-80 max-w-[calc(100vw-1rem)] rounded-panel bg-card-background p-2' : 'min-w-48 rounded-control bg-surface-raised p-1')}
      >
        {sections(items).map((section, index) =>
          section.title === undefined ? (
            <Fragment key={index}>{section.items.map(row)}</Fragment>
          ) : (
            <div key={section.title} role="group" aria-label={section.title} className={cx('grid gap-0.5', index > 0 && 'mt-1 border-t border-border-subtle pt-1')}>
              <span aria-hidden="true" className="px-3 pb-1 pt-1.5 text-micro font-bold uppercase tracking-wider text-soft">
                {section.title}
              </span>
              {section.items.map(row)}
            </div>
          ),
        )}
      </div>
    ) : null,
    () => [menuRef.current],
  )

  return (
    <div ref={root} className={cx('relative', className)}>
      {bar ? (
        <IconButton tone="flat" size="sm" aria-label={label} title={label} aria-haspopup="menu" aria-expanded={open} className="aria-expanded:bg-tint/12 aria-expanded:text-info" onClick={toggle}>
          <Icon name="more" />
        </IconButton>
      ) : (
        <IconButton tone="ghost" size="sm" aria-label={label} aria-haspopup="menu" aria-expanded={open} onClick={toggle}>
          <Icon name="more" size={20} />
        </IconButton>
      )}
      {menu}
    </div>
  )
}
