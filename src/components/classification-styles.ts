import { cx } from './ui/cx'

/**
 * Estilos de la clasificación de cartas (origen y roles). El color de cada grupo llega por las
 * variables `--role-color` / `--role-rgb` que se ponen inline en cada elemento.
 */

type StatusTone = 'warning' | 'primary' | 'success'

const STATUS_TONE: Record<StatusTone, string> = {
  warning: 'border-warning/40 from-warning/16 shadow-[0_0_0_1px_rgb(var(--warning-rgb)/0.06)]',
  primary: 'border-primary/38 from-primary/16 shadow-[0_0_0_1px_rgb(var(--primary-rgb)/0.06)]',
  success: 'border-accent/38 from-accent/16 shadow-[0_0_0_1px_rgb(var(--accent-rgb)/0.06)]',
}

/** Chip de estado de una carta ("Sin grupo definido", "Revisión"…). */
export function statusChip(tone: StatusTone, compact = false): string {
  return cx(
    'inline-flex items-center whitespace-nowrap rounded-full border bg-linear-to-b to-card-background/96 leading-none text-foreground',
    compact ? 'px-[0.36rem] py-[0.14rem] text-[0.58rem]' : 'px-[0.48rem] py-[0.18rem] text-[0.64rem]',
    STATUS_TONE[tone],
  )
}


/** Referencias de la guía: tarjeta de rol, grupo y punto de color. */
export const ROLE_REFERENCE_CARD =
  'rounded-panel border border-[rgb(var(--role-rgb)/0.24)] bg-linear-to-b from-[rgb(var(--role-rgb)/0.08)] to-card-background/96 shadow-[inset_0_1px_0_rgba(255,255,255,0.03),0_0_0_1px_rgb(var(--role-rgb)/0.04)]'
export const ROLE_REFERENCE_GROUP =
  'rounded-panel border border-[rgb(var(--role-rgb)/0.22)] bg-linear-to-b from-[rgb(var(--role-rgb)/0.1)] to-card-background/98 shadow-[inset_0_1px_0_rgba(255,255,255,0.03),0_0_0_1px_rgb(var(--role-rgb)/0.04)]'
export const ROLE_REFERENCE_MARK =
  'size-[0.55rem] shrink-0 rounded-full bg-(--role-color) shadow-[0_0_0_1px_rgb(var(--role-rgb)/0.22),0_0_14px_rgb(var(--role-rgb)/0.14)]'

const OPTION_BASE =
  'w-full max-w-full border [overflow-wrap:anywhere] transition-[border-color,background,box-shadow,transform] duration-150 focus-visible:shadow-[0_0_0_2px_rgb(var(--background-rgb)),0_0_0_4px_rgb(var(--role-rgb)/0.22)] focus-visible:outline-none'

/** Opción de origen (Engine / Non-Engine / Híbrida): normal, elegida o apagada. */
export function originOption(state: { active: boolean; muted: boolean }): string {
  if (state.muted) {
    return cx(OPTION_BASE, 'border-border bg-linear-to-b from-secondary/88 to-background/98 opacity-62 grayscale')
  }

  return cx(
    OPTION_BASE,
    state.active
      ? 'border-[rgb(var(--role-rgb)/0.62)] bg-linear-to-b from-[rgb(var(--role-rgb)/0.18)] to-card-background/98 shadow-[0_0_0_1px_rgb(var(--role-rgb)/0.1),0_16px_30px_rgb(var(--role-rgb)/0.08)]'
      : 'border-[rgb(var(--role-rgb)/0.22)] bg-linear-to-b from-[rgb(var(--role-rgb)/0.08)] to-card-background/98 hover:border-[rgb(var(--role-rgb)/0.46)] hover:from-[rgb(var(--role-rgb)/0.14)] hover:shadow-[0_0_0_1px_rgb(var(--role-rgb)/0.08)]',
    'hover:-translate-y-px',
  )
}

/** Botón de rol (Starter, Extender…): normal o elegido. */
export function roleOptionButton(active: boolean): string {
  return cx(
    'rounded-full border text-left [overflow-wrap:anywhere] whitespace-normal transition-[border-color,background,color,box-shadow] duration-150 focus-visible:shadow-[0_0_0_2px_rgb(var(--background-rgb)),0_0_0_4px_rgb(var(--role-rgb)/0.24)] focus-visible:outline-none',
    active
      ? 'border-[rgb(var(--role-rgb)/0.58)] bg-linear-to-b from-[rgb(var(--role-rgb)/0.2)] to-card-background/98 text-foreground shadow-[0_0_0_1px_rgb(var(--role-rgb)/0.08)]'
      : 'border-[rgb(var(--role-rgb)/0.18)] bg-background/72 text-muted hover:border-[rgb(var(--role-rgb)/0.42)] hover:bg-linear-to-b hover:from-[rgb(var(--role-rgb)/0.08)] hover:to-background/90 hover:text-foreground',
  )
}

/** Chip de vista de la cola ("Todas", "Starters"…). */
export function viewChip(state: { active: boolean; empty: boolean }): string {
  return cx(
    'inline-flex items-center gap-[0.45rem] border bg-linear-to-b to-background/98 text-[0.74rem] leading-none text-foreground px-[0.78rem] py-[0.42rem] transition-[border-color,background,box-shadow,transform] duration-150 hover:-translate-y-px focus-visible:shadow-[0_0_0_2px_rgb(var(--background-rgb)),0_0_0_4px_rgb(var(--role-rgb)/0.22)] focus-visible:outline-none',
    state.active
      ? 'border-[rgb(var(--role-rgb)/0.62)] from-[rgb(var(--role-rgb)/0.18)] shadow-[0_0_0_1px_rgb(var(--role-rgb)/0.1),0_12px_24px_rgb(var(--role-rgb)/0.08)]'
      : 'border-[rgb(var(--role-rgb)/0.22)] from-secondary/94 hover:border-[rgb(var(--role-rgb)/0.42)] hover:from-[rgb(var(--role-rgb)/0.08)] hover:shadow-[0_0_0_1px_rgb(var(--role-rgb)/0.08)]',
    state.empty && 'opacity-50',
  )
}

/** Carta de la cola de clasificación y su miniatura. */
export function queueCard(active: boolean): string {
  return cx(
    'min-h-14 cursor-pointer border transition-[border-color,background,box-shadow] duration-150 focus-visible:shadow-[0_0_0_2px_rgb(var(--background-rgb)),0_0_0_4px_rgb(var(--primary-rgb)/0.2)] focus-visible:outline-none',
    active
      ? 'border-primary/68 bg-linear-to-b from-primary/12 to-card-background/98 shadow-[0_0_0_1px_rgb(var(--primary-rgb)/0.12)]'
      : 'border-border bg-linear-to-b from-secondary/94 to-background/98 hover:border-primary/42 hover:from-primary/8 hover:to-card-background/98 hover:shadow-[0_0_0_1px_rgb(var(--primary-rgb)/0.08)]',
  )
}

export function queueArt(active: boolean): string {
  return cx(
    'relative overflow-hidden border leading-[0] transition-[border-color,box-shadow] duration-150',
    active ? 'border-primary/82 shadow-[0_0_0_1px_rgb(var(--primary-rgb)/0.16)]' : 'border-transparent',
  )
}
