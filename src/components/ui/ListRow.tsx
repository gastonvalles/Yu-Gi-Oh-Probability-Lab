import { Children, useId, type ElementType, type ReactNode } from 'react'

import { cx, variants } from './cx'
import { EmptyState } from './EmptyState'
import { Icon, type IconName } from './Icon'
import { Skeleton } from './Skeleton'
import { surface, listItemSelected } from './surfaces'
import { SwitchMark } from './Switch'
import { TONE, type Tone } from './tone'

/**
 * `ListRow` y `ListGroup`: una lista (salas, duelos en vivo, decks) o un grupo de ajustes, en **una sola tarjeta** con las filas separadas por líneas finas. Nada de una
 * tarjeta por fila ni de cajas adentro (lienzo → tarjeta).
 *
 * - **Props de `ListRow`:** `title` (un renglón, cortado con «…» y entero en el `title` del elemento) · `subtitle` (apoyo, hasta dos renglones) · el inicio, uno solo:
 *   `icon` o `initials` (un círculo de 40 px teñido con el ícono o las letras en blanco; `tone` le da un tinte con significado, si no es el lila de siempre) o `media`
 *   (una carta, recta) · el final, uno solo: `end` (un `Button` secondary si la fila hace algo distinto de abrir, una `Badge`), `toggle` (la fila entera es el
 *   interruptor) o `value` + la flecha (que sale sola si la fila abre algo) · qué es: `href` (un enlace), `onClick` (un botón) o nada (una fila quieta) ·
 *   `selected` (`aria-current`, el aro ámbar de `listItemSelected`) · `disabled` · `wrap` (un registro: el título es una frase entera, en varios renglones y sin negrita, como
 *   «Qué hizo el bot y por qué»).
 * - **`ListGroup`:** `label` (el nombre de la lista para el lector) · `loading` (3 filas de esqueleto y `aria-busy`) · `empty` (lo que se ve sin filas: un `EmptyState`
 *   adentro de la misma tarjeta).
 * - **Estados:** reposo · al pasar el mouse o apretar, el velo `bg-tint/7` de `listItem` · foco `shadow-focus` · elegida · apagada al 40 % · vacía · cargando.
 * - **Accesibilidad:** `ul` / `li`; la fila entera es el objetivo (64 px de alto, sobra para los 44 táctiles), nunca la flecha sola; con `toggle` la fila es un
 *   `role="switch"` con el título de nombre y el apoyo de descripción.
 * - **Hacer:** una acción por fila; la que abre, con la flecha. **No hacer:** dos botones en una fila, una fila con borde propio, una lista de tarjetas sueltas.
 * - **Usos:** las salas que esperan y los duelos en vivo de Jugar (`ArenaPanel`), las reglas de la sala (límite de tiempo, Side Deck, formato), los decks de un torneo.
 */

const LEAD_TINT: Record<Tone, string> = {
  neutral: 'bg-tint/14',
  brand: TONE.brand.soft,
  success: TONE.success.soft,
  warning: TONE.warning.soft,
  danger: TONE.danger.soft,
  info: TONE.info.soft,
}

const rowStyle = variants({
  base: '-mx-2 flex min-h-16 min-w-0 flex-1 items-center gap-3 rounded-control px-2 py-3 text-left transition-colors duration-150 focus-visible:outline-none focus-visible:shadow-focus',
  variants: {
    kind: {
      action: 'cursor-pointer hover:bg-tint/7 active:bg-tint/7 aria-disabled:pointer-events-none disabled:pointer-events-none disabled:opacity-40 aria-disabled:opacity-40',
      still: '',
    },
  },
  defaults: { kind: 'still' },
})

interface ListRowProps {
  title: string
  subtitle?: ReactNode
  icon?: IconName
  initials?: string
  media?: ReactNode
  tone?: Tone
  value?: ReactNode
  end?: ReactNode
  toggle?: { checked: boolean; onChange: (checked: boolean) => void }
  href?: string
  onClick?: () => void
  selected?: boolean
  disabled?: boolean
  wrap?: boolean
}

export function ListRow({ title, subtitle, icon, initials, media, tone = 'neutral', value, end, toggle, href, onClick, selected = false, disabled = false, wrap = false }: ListRowProps) {
  const subtitleId = useId()
  const opens = !toggle && !end && Boolean(href ?? onClick)
  const Tag: ElementType = toggle || (onClick && !href) ? 'button' : href ? 'a' : 'div'
  const interactive = Tag !== 'div'

  const lead = media ?? (icon || initials ? (
    <span aria-hidden="true" className={cx('grid size-10 shrink-0 place-items-center rounded-full text-micro font-semibold text-white', LEAD_TINT[tone])}>
      {icon ? <Icon name={icon} size={20} variant="bulk" /> : initials}
    </span>
  ) : null)

  const props = Tag === 'button'
    ? { type: 'button' as const, disabled, onClick: toggle ? () => toggle.onChange(!toggle.checked) : onClick, ...(toggle ? { role: 'switch', 'aria-checked': toggle.checked, 'aria-label': title } : {}) }
    : Tag === 'a'
      ? { href: disabled ? undefined : href, onClick, 'aria-disabled': disabled || undefined }
      : {}

  return (
    <li className="flex min-w-0">
      <Tag
        {...props}
        title={title}
        aria-current={selected || undefined}
        aria-describedby={toggle && subtitle ? subtitleId : undefined}
        className={rowStyle({ kind: interactive ? 'action' : 'still' }, selected && listItemSelected)}
      >
        {lead ? <span className="flex shrink-0">{lead}</span> : null}
        <span className="grid min-w-0 flex-1 gap-0.5">
          <span className={cx('text-body text-foreground', wrap ? 'text-pretty font-normal' : 'truncate font-semibold')}>{title}</span>
          {subtitle ? <span id={subtitleId} className="line-clamp-2 text-micro text-muted">{subtitle}</span> : null}
        </span>
        {end ? <span className="flex shrink-0 items-center">{end}</span> : null}
        {toggle ? <SwitchMark checked={toggle.checked} size="lg" /> : null}
        {value || opens ? (
          <span className="flex shrink-0 items-center gap-2 text-body text-muted">
            {value}
            {opens ? <Icon name="chevron-right" size={20} className="text-soft" /> : null}
          </span>
        ) : null}
      </Tag>
    </li>
  )
}

interface ListGroupProps {
  label?: string
  loading?: boolean
  empty?: ReactNode
  children?: ReactNode
  className?: string
}

/** La tarjeta de la lista: las filas, con una línea fina entre una y otra (a 16 px de los bordes). */
export function ListGroup({ label, loading = false, empty, children, className }: ListGroupProps) {
  if (!loading && empty && Children.count(children) === 0) {
    return <div className={cx(surface.card, 'min-w-0 p-4', className)}>{typeof empty === 'string' ? <EmptyState title={empty} /> : empty}</div>
  }

  return (
    <ul aria-label={label} aria-busy={loading || undefined} className={cx(surface.card, 'grid min-w-0 divide-y divide-border-subtle px-4', className)}>
      {loading
        ? [0, 1, 2].map((index) => (
            <li key={index} className="flex min-h-16 items-center gap-3 py-3">
              <Skeleton radius="chip" className="size-10 shrink-0" />
              <span className="grid flex-1 gap-2">
                <Skeleton className="h-3.5 w-1/2" />
                <Skeleton className="h-3 w-1/3" />
              </span>
            </li>
          ))
        : children}
    </ul>
  )
}
