import { useId, type ElementType, type ReactNode } from 'react'

import { cx } from './cx'
import { Icon, type IconName } from './Icon'
import { Skeleton } from './Skeleton'

/**
 * `ShortcutGrid` y `ShortcutTile`: la grilla de atajos (las entradas a lo que más se usa), cuatro por fila, cada uno con su propio borde.
 *
 * - **Props de `ShortcutTile`:** `icon` · `label` (el nombre visible, hasta dos renglones; el inglés es más largo, así que no hay ancho fijo) · `href` (un enlace) u
 *   `onClick` (un botón) · `badge` (`{ text, label }`: la insignia de arriba, «3», y lo que dice el lector, «3 cartas sin rol») · `disabled` · `hint` (qué hace o qué
 *   falta, sólo para el lector: la descripción) · `expanded` / `popup` (abre algo debajo o una hoja).
 * - **Props de `ShortcutGrid`:** `label` (el nombre de la grilla para el lector) · `loading` (cuántos esqueletos del mismo alto, con `aria-busy`).
 * - **La regla del 4 o 2:** cuatro por fila si la grilla mide 19 rem (304 px, unos 70 px por atajo) o más, si no dos por fila (2 × 2): un teléfono de 320 px queda
 *   en dos y uno de 360 en cuatro. Lo mide la grilla (`@container`), no la pantalla: también vale en una columna angosta.
 * - **Estados:** reposo · al pasar el mouse o apretar, la superficie de arriba (`bg-surface-hover`) · foco `shadow-focus` y el ícono en ámbar · apagado al 40 % pero
 *   enfocable (`aria-disabled`): el clic llega, para que quien lo usa diga qué falta · cargando.
 * - **Von Restorff:** un solo tinte para todos los círculos (el lila de siempre, con el ícono blanco); lo único que resalta es la insignia, con aro ámbar sobre el lienzo
 *   (nunca un relleno ámbar con texto blanco), y una sola por grilla.
 * - **Hacer:** 4 u 8 atajos, nombres de una o dos palabras. **No hacer:** una línea de apoyo dentro del atajo (eso es una `ListRow`), colores distintos por atajo, cajas adentro.
 * - **Usos:** las entradas de Online (Retar a un amigo, Entrar con un código, Reglas), los pasos del deck (Deck, Roles, Lab, Comparar), Exportar y Vidas.
 */

interface ShortcutTileProps {
  icon: IconName
  label: string
  href?: string
  onClick?: () => void
  badge?: { text: string; label: string }
  disabled?: boolean
  hint?: string
  expanded?: boolean
  popup?: boolean
}

export function ShortcutTile({ icon, label, href, onClick, badge, disabled = false, hint, expanded, popup = false }: ShortcutTileProps) {
  const Tag: ElementType = href && !disabled ? 'a' : 'button'
  const hintId = useId()

  return (
    <li className="relative flex min-w-0">
      <Tag
        {...(Tag === 'a' ? { href, onClick } : { type: 'button' as const, onClick })}
        aria-label={badge ? `${label}, ${badge.label}` : undefined}
        aria-disabled={disabled || undefined}
        aria-describedby={hint ? hintId : undefined}
        aria-expanded={expanded}
        aria-haspopup={popup ? 'dialog' : undefined}
        className={cx(
          'group grid min-h-23 min-w-0 flex-1 content-start justify-items-center gap-2 rounded-card border border-border-subtle bg-card-background px-1 py-3 text-center transition-colors duration-150 focus-visible:outline-none focus-visible:shadow-focus',
          disabled ? 'cursor-default opacity-40 focus-visible:opacity-100' : 'cursor-pointer hover:bg-surface-hover active:bg-surface-hover',
        )}
      >
        <span className="grid size-11 place-items-center rounded-full bg-tint/14 text-white transition-colors group-focus-visible:text-info">
          <Icon name={icon} size={22} variant="bulk" />
        </span>
        <span className="line-clamp-2 text-micro font-semibold text-foreground [overflow-wrap:anywhere]">{label}</span>
      </Tag>
      {hint ? <span id={hintId} hidden>{hint}</span> : null}
      {badge ? (
        <span data-badge aria-hidden="true" className="pointer-events-none absolute top-0 left-1/2 grid h-6 min-w-6 -translate-x-1/2 -translate-y-1/2 place-items-center rounded-full border-2 border-info bg-background px-1.5 text-micro font-bold text-info">
          {badge.text}
        </span>
      ) : null}
    </li>
  )
}

interface ShortcutGridProps {
  label?: string
  loading?: number
  children?: ReactNode
  className?: string
}

/** La grilla: cuatro por fila (dos si no entran); si un atajo lleva insignia, deja lugar arriba para que no pise la fila de arriba ni el título. */
export function ShortcutGrid({ label, loading = 0, children, className }: ShortcutGridProps) {
  return (
    <div className={cx('@container min-w-0', className)}>
      <ul aria-label={label} aria-busy={loading > 0 || undefined} className="grid grid-cols-2 gap-2 has-[[data-badge]]:gap-y-4 has-[[data-badge]]:pt-3 @min-[19rem]:grid-cols-4">
        {loading > 0 ? Array.from({ length: loading }, (_, index) => <li key={index}><Skeleton radius="panel" className="min-h-23" /></li>) : children}
      </ul>
    </div>
  )
}
