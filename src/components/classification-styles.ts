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
  primary: 'brand',
  success: 'success',
}

/** Chip de estado de una carta ("Sin grupo definido", "Revisión"…). */
export function statusChip(tone: StatusTone, compact = false): string {
  const look = TONE[STATUS_TONE[tone]]

  return cx(
    'inline-flex items-center whitespace-nowrap rounded-full border font-semibold leading-none',
    compact ? 'px-1.5 py-1 text-micro' : 'px-2 py-1 text-micro',
    look.tint,
    look.text,
  )
}

/** Referencias de la guía: tarjeta de rol, grupo y punto de color. */
export const ROLE_REFERENCE_CARD = 'rounded-card border border-[rgb(var(--role-rgb)/0.26)] bg-[rgb(var(--role-rgb)/0.07)]'
export const ROLE_REFERENCE_GROUP = 'rounded-card border border-[rgb(var(--role-rgb)/0.24)] bg-[rgb(var(--role-rgb)/0.07)]'
export const ROLE_REFERENCE_MARK = 'size-2.5 shrink-0 rounded-full bg-(--role-color)'

const OPTION_BASE =
  'w-full max-w-full border [overflow-wrap:anywhere] transition-[border-color,background-color] duration-150 focus-visible:outline-none focus-visible:shadow-focus'

/** Opción de origen (Engine / Non-Engine / Híbrida): normal, elegida o apagada. */
export function originOption(state: { active: boolean; muted: boolean }): string {
  if (state.muted) {
    return cx(OPTION_BASE, 'border-border-subtle bg-white/2 opacity-60 grayscale')
  }

  return cx(
    OPTION_BASE,
    state.active
      ? 'border-[rgb(var(--role-rgb)/0.65)] bg-[rgb(var(--role-rgb)/0.16)]'
      : 'border-border-subtle bg-white/3 hover:border-[rgb(var(--role-rgb)/0.45)] hover:bg-[rgb(var(--role-rgb)/0.08)]',
  )
}

/** Botón de rol (Starter, Extender…): normal o elegido. */
export function roleOptionButton(active: boolean): string {
  return cx(
    'rounded-control border text-left [overflow-wrap:anywhere] whitespace-normal transition-[border-color,background-color,color] duration-150 focus-visible:outline-none focus-visible:shadow-focus',
    active
      ? 'border-[rgb(var(--role-rgb)/0.65)] bg-[rgb(var(--role-rgb)/0.2)] text-foreground'
      : 'border-border-subtle bg-white/4 text-muted hover:border-[rgb(var(--role-rgb)/0.45)] hover:bg-[rgb(var(--role-rgb)/0.08)] hover:text-foreground',
  )
}

/** Chip de vista de la cola ("Todas", "Starters"…). */
export function viewChip(state: { active: boolean; empty: boolean }): string {
  return cx(
    'inline-flex items-center gap-2 rounded-control border px-3.5 py-2 text-micro font-semibold leading-none transition-[border-color,background-color,color] duration-150 focus-visible:outline-none focus-visible:shadow-focus',
    state.active
      ? 'border-[rgb(var(--role-rgb)/0.65)] bg-[rgb(var(--role-rgb)/0.18)] text-foreground'
      : 'border-border-subtle bg-white/4 text-muted hover:border-[rgb(var(--role-rgb)/0.45)] hover:bg-[rgb(var(--role-rgb)/0.08)] hover:text-foreground',
    state.empty && 'opacity-50',
  )
}

/** Carta de la cola de clasificación y su miniatura. */
export function queueCard(active: boolean): string {
  return cx(
    'min-h-14 cursor-pointer border transition-[border-color,background-color] duration-150 focus-visible:outline-none focus-visible:shadow-focus',
    active ? 'border-primary/60 bg-primary/12' : 'border-border-subtle bg-white/3 hover:border-white/20 hover:bg-white/6',
  )
}

export function queueArt(active: boolean): string {
  return cx(
    'relative overflow-hidden border leading-[0] transition-[border-color] duration-150',
    active ? 'border-primary/80' : 'border-transparent',
  )
}
