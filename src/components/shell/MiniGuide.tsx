import { useEffect, useRef, useState, type MouseEvent } from 'react'
import { createPortal } from 'react-dom'

import { SIDEBAR_PX } from '../../app/shell-layout'
import { useEscapeKey } from '../../app/use-overlay'
import { Presence, useLeaving, usePresence } from '../../app/use-presence'
import { t } from '../../i18n'
import { cx } from '../ui/cx'
import { Icon, type IconName } from '../ui/Icon'
import { mascotsNavItem, searchNavItem, type NavGroup } from './nav-model'
import { NAV_OVERLINE } from './rail'
import { NavButton } from './SidebarNav'

interface MiniGuideProps {
  groups: NavGroup[]
  activeKey: string | null
  onSelect: (key: string) => void
  /** Hay buscador de cartas en esta pantalla: la fila de «Buscar» va arriba de los grupos. */
  searchAvailable?: boolean
  /** Las mascotas van en la mini guía (sin barra de arriba); con ella, viven en la barra. */
  mascots?: boolean
}

/** Un botón de la mini guía: el ícono arriba y su nombre abajo, como la guía contraída de YouTube. El grupo en el que estás va en ámbar con el ícono relleno. */
function MiniItem({ icon, label, active = false, expanded, onClick }: { icon: IconName; label: string; active?: boolean; expanded?: boolean; onClick: (event: MouseEvent<HTMLButtonElement>) => void }) {
  return (
    <button
      type="button"
      aria-haspopup={expanded === undefined ? undefined : 'menu'}
      aria-expanded={expanded}
      aria-current={active ? 'true' : undefined}
      className={cx(
        'group/mini -mx-1 grid h-16 w-[calc(100%+0.5rem)] cursor-pointer place-items-center content-center gap-1.5 rounded-control border-0 px-0 transition-[background-color,color] duration-150 focus-visible:outline-none focus-visible:shadow-focus motion-reduce:transition-none',
        active || expanded ? 'bg-nav-raised text-nav-active' : 'bg-transparent text-foreground hover:bg-nav-raised/60',
      )}
      onClick={onClick}
    >
      <Icon name={icon} size={24} variant={active ? 'bold' : 'bulk'} className={cx('transition-colors duration-150 [--icon-cut:var(--nav-raised)]', active || expanded ? 'text-nav-active' : 'text-white group-hover/mini:text-nav-active')} />
      <span className={cx('max-w-full truncate text-micro leading-none tracking-tight', active || expanded ? 'font-semibold' : 'font-medium')}>{label}</span>
    </button>
  )
}

/**
 * Lo que se ve del menú lateral contraído, como la guía contraída de YouTube: pocos botones grandes con su nombre debajo (Buscar, los cuatro grupos y las mascotas) en lugar de una fila de íconos sin rótulo.
 * Tocar un grupo abre a su derecha una lista con sus destinos (`GroupFlyout`); elegir uno cierra la lista y va a él.
 */
export function MiniGuide({ groups, activeKey, onSelect, searchAvailable = false, mascots: showMascots = true }: MiniGuideProps) {
  const [open, setOpen] = useState<{ key: string; top: number } | null>(null)
  const group = open ? groups.find((entry) => entry.key === open.key) : undefined
  const search = searchNavItem()
  const mascots = mascotsNavItem()

  return (
    <>
      <nav aria-label={t('shell.nav.main')} className="grid content-start gap-1 pb-3">
        {searchAvailable ? <MiniItem icon={search.icon} label={t('shell.nav.searchShort')} onClick={() => onSelect(search.key)} /> : null}
        {groups.map((entry) => (
          <MiniItem
            key={entry.key}
            icon={entry.icon}
            label={entry.label}
            active={entry.items.some((item) => item.key === activeKey)}
            expanded={open?.key === entry.key}
            onClick={(event) => {
              const top = event.currentTarget.getBoundingClientRect().top

              setOpen((current) => (current?.key === entry.key ? null : { key: entry.key, top }))
            }}
          />
        ))}
        {showMascots ? <MiniItem icon={mascots.icon} label={mascots.label} onClick={() => onSelect(mascots.key)} /> : null}
      </nav>
      {/* Al cerrarse, la lista sigue mientras sale (`Presence`); pasar a otro grupo es la misma lista, sin salida. */}
      <Presence>
        {group && open ? (
          <GroupFlyout
            group={group}
            top={open.top}
            activeKey={activeKey}
            onSelect={(key) => {
              setOpen(null)
              onSelect(key)
            }}
            onClose={() => setOpen(null)}
          />
        ) : null}
      </Presence>
    </>
  )
}

/**
 * La lista de destinos de un grupo, pegada a la derecha de la mini guía (como el menú que se abre al lado de un botón): el nombre del grupo y sus destinos con el que estás en ámbar.
 * Se cierra al elegir, al tocar afuera y con Escape; al cerrarse se achica y se funde, la inversa de su entrada.
 */
function GroupFlyout({ group, top, activeKey, onSelect, onClose }: { group: NavGroup; top: number; activeKey: string | null; onSelect: (key: string) => void; onClose: () => void }) {
  const panel = useRef<HTMLDivElement | null>(null)
  // Ya cerrada, mientras sale: Escape y el toque afuera se sueltan enseguida.
  const leaving = useLeaving()

  useEscapeKey(onClose, !leaving)

  useEffect(() => {
    if (leaving) return

    const onPointerDown = (event: PointerEvent) => {
      const target = event.target as Node

      // Tocar el botón del mismo grupo lo cierra por su cuenta (alterna): acá sólo lo de afuera de la lista y de la mini guía.
      if (!panel.current?.contains(target) && !(target as Element).closest?.('[aria-haspopup="menu"]')) onClose()
    }

    document.addEventListener('pointerdown', onPointerDown)

    return () => document.removeEventListener('pointerdown', onPointerDown)
  }, [onClose, leaving])

  return usePresence(!leaving, typeof document === 'undefined' ? null : createPortal(
    <div
      ref={panel}
      role="menu"
      aria-label={group.label}
      className="fixed z-150 grid w-64 animate-pop gap-1 rounded-card border border-nav-raised bg-nav p-2 shadow-overlay motion-reduce:animate-none"
      style={{ left: SIDEBAR_PX.collapsed + 8, top: Math.max(8, Math.min(top, window.innerHeight - 56 - group.items.length * 46)) }}
    >
      <p className={cx(NAV_OVERLINE, 'm-0 px-3 pb-1 pt-1')}>{group.label}</p>
      {group.items
        .filter((item) => !item.hidden)
        .map((item) => (
          <NavButton key={item.key} item={item} active={item.key === activeKey} onSelect={onSelect} />
        ))}
    </div>,
    document.body,
  ), () => [panel.current])
}
