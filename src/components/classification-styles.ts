import { cx } from './ui/cx'
import { TONE, type Tone } from './ui/tone'

/**
 * Estilos de la clasificación de cartas (origen y roles). El color de cada grupo llega por las
 * variables `--role-color` / `--role-rgb` que se ponen inline en cada elemento: los roles tienen
 * su propia paleta (no usan los tonos de estado).
 */

type StatusTone = 'warning' | 'primary' | 'success'

const STATUS_TONE: Record<StatusTone, Tone> = {
  warning: 'warning',
  primary: 'info',
  success: 'success',
}

/** Chip de estado de una carta ("Sin grupo definido", "Revisión"…). */
export function statusChip(tone: StatusTone, compact = false): string {
  const look = TONE[STATUS_TONE[tone]]

  return cx(
    'inline-flex items-center whitespace-nowrap rounded-full font-semibold leading-none',
    compact ? 'px-1.5 py-1 text-micro' : 'px-2 py-1 text-micro',
    look.soft,
    look.text,
  )
}

/** Punto de color de un rol u origen en la guía (la guía se ordena con líneas finas, sin cajas). */
export const ROLE_REFERENCE_MARK = 'size-2.5 shrink-0 rounded-full bg-(--role-color)'

const OPTION_BASE =
  'w-full max-w-full [overflow-wrap:anywhere] transition-[background-color,opacity] duration-150 focus-visible:outline-none focus-visible:shadow-focus'

/** Opción de origen (Engine / Non-Engine / Híbrida): normal, elegida o apagada. */
export function originOption(state: { active: boolean; muted: boolean }): string {
  if (state.muted) {
    return cx(OPTION_BASE, 'bg-tint/4 opacity-60 grayscale')
  }

  return cx(
    OPTION_BASE,
    state.active
      ? 'bg-[rgb(var(--role-rgb)/0.28)]'
      : 'bg-tint/6 hover:bg-[rgb(var(--role-rgb)/0.14)]',
  )
}

/** Botón de rol (Starter, Extender…): normal o elegido. */
export function roleOptionButton(active: boolean): string {
  return cx(
    'rounded-control text-left [overflow-wrap:anywhere] whitespace-normal transition-[background-color,color] duration-150 focus-visible:outline-none focus-visible:shadow-focus',
    active
      ? 'bg-[rgb(var(--role-rgb)/0.3)] text-foreground'
      : 'bg-tint/7 text-muted hover:bg-[rgb(var(--role-rgb)/0.16)] hover:text-foreground',
  )
}

/** Chip de vista de la cola ("Todas", "Starters"…): lavanda en reposo, con el color del grupo al elegirlo. Sobre la tarjeta violeta (`onBrand`) va translúcido y, elegido, claro. */
export function viewChip(state: { active: boolean; onBrand?: boolean }): string {
  return cx(
    'inline-flex items-center gap-2 rounded-control px-3.5 py-2 text-micro font-semibold leading-none transition-[background-color,color] duration-150 focus-visible:outline-none focus-visible:shadow-focus',
    state.onBrand
      ? state.active
        ? 'bg-warning-solid text-white'
        : 'bg-primary-foreground/15 text-primary-foreground hover:bg-primary-foreground/25'
      : state.active
        ? 'bg-[rgb(var(--role-rgb)/0.3)] text-foreground'
        : 'bg-lavender text-foreground hover:bg-[rgb(var(--role-rgb)/0.2)]',
  )
}

/** Carta de la cola de clasificación: sin caja en reposo; sólo se marca al pasar el mouse o al elegirla. */
export function queueCard(active: boolean): string {
  return cx(
    'min-h-14 cursor-pointer transition-colors duration-150 focus-visible:outline-none focus-visible:shadow-focus',
    active ? 'bg-tint/10' : 'bg-transparent hover:bg-tint/7',
  )
}

export function queueArt(active: boolean): string {
  return cx('relative overflow-hidden leading-[0] transition-shadow duration-150', active && 'ring-2 ring-info/80')
}
