/**
 * Estilos compartidos de la app (superficies, campos, chips). Son strings de utilidades de
 * Tailwind escritos completos (Tailwind sólo detecta clases literales): se combinan con
 * `cx()` o se interpolan en un className.
 */

/** Paneles y tarjetas: la jerarquía es panel > panelSoft > card. */
export const surface = {
  panel:
    'rounded-panel border border-border bg-linear-to-b from-card-background/96 to-background/98 shadow-[inset_0_1px_0_rgba(255,255,255,0.03),0_12px_28px_rgba(0,0,0,0.28)]',
  panelStrong:
    'rounded-panel border border-border-strong bg-linear-to-b from-primary/15 to-background/96 shadow-[inset_0_1px_0_rgba(255,255,255,0.04),0_16px_36px_rgba(0,0,0,0.32),0_0_0_1px_rgb(var(--primary-rgb)/0.12)]',
  panelSoft: 'rounded-panel border border-border bg-linear-to-b from-secondary/92 to-background/98',
  card: 'rounded-panel border border-border bg-linear-to-b from-card-background/90 to-background/98 shadow-[inset_0_1px_0_rgba(255,255,255,0.02)]',
  /** Contenedor de cada paso: panel en desktop, sin marco en mobile (la página es el panel). */
  stepShell:
    'rounded-panel border border-border bg-linear-to-b from-card-background/96 to-background/98 shadow-[inset_0_1px_0_rgba(255,255,255,0.03),0_12px_28px_rgba(0,0,0,0.28)] max-[1100px]:rounded-none max-[1100px]:border-0 max-[1100px]:bg-none max-[1100px]:shadow-none',
  cardAccent:
    'rounded-panel border border-accent/44 bg-linear-to-b from-accent/16 to-card-background/96 shadow-[0_0_0_1px_rgb(var(--accent-rgb)/0.08)]',
  cardSuccess:
    'rounded-panel border border-success/48 bg-linear-to-b from-success/12 to-card-background/96 shadow-[0_0_0_1px_rgb(var(--success-rgb)/0.08)]',
  cardWarning:
    'rounded-panel border border-warning/48 bg-linear-to-b from-warning/12 to-card-background/96 shadow-[0_0_0_1px_rgb(var(--warning-rgb)/0.08)]',
  cardDanger:
    'rounded-panel border border-danger/50 bg-linear-to-b from-danger/12 to-card-background/96 shadow-[0_0_0_1px_rgb(var(--danger-rgb)/0.08)]',
} as const

/** Campo de texto, select y textarea. */
export const field =
  'rounded-control border border-border bg-linear-to-b from-input/98 to-background text-foreground outline-none transition-[border-color,box-shadow,background] duration-150 hover:from-input-hover/98 focus:border-primary/72 focus:shadow-[0_0_0_1px_rgb(var(--primary-rgb)/0.16)] [color-scheme:dark] [&_option]:bg-secondary [&_option]:text-foreground [&_optgroup]:bg-secondary [&_optgroup]:text-foreground'

/** Campo del encabezado del builder (nombre y formato del deck): más translúcido que `field`. */
export const fieldMeta =
  'rounded-control border border-primary/20 bg-background/34 text-foreground outline-none transition-[border-color,box-shadow,background] duration-150 hover:border-primary/28 hover:bg-background/42 focus:border-[rgb(137_196_255/0.42)] focus:shadow-[0_0_0_1px_rgb(137_196_255/0.16)] [color-scheme:dark] [&_option]:bg-secondary [&_option]:text-foreground'

/** Chips informativos (no interactivos). */
export const chip = {
  base: 'rounded-full border border-border bg-linear-to-b from-secondary/95 to-background/98 text-muted',
  accent: 'rounded-full border border-accent/46 bg-linear-to-b from-accent/18 to-card-background/96 text-foreground',
} as const

/** Chip de un filtro activo del buscador: se toca para quitarlo. */
export const filterChip =
  'inline-flex max-w-full items-center gap-[0.45rem] rounded-full border border-primary/26 bg-linear-to-b from-primary/10 to-card-background/98 px-[0.58rem] py-[0.34rem] text-[0.68rem] leading-none text-foreground transition-[border-color,background,box-shadow] duration-150 hover:border-primary/48 hover:from-primary/16 hover:shadow-[0_0_0_1px_rgb(var(--primary-rgb)/0.08)] focus-visible:shadow-[0_0_0_2px_rgb(var(--background-rgb)),0_0_0_4px_rgb(var(--primary-rgb)/0.24)] focus-visible:outline-none'

/** Fila clickeable de una lista (cartas, resultados). */
export const listItem =
  'rounded-panel border border-border bg-linear-to-b from-secondary/94 to-background/98 transition-[border-color,background,box-shadow] duration-150 hover:border-primary/42 hover:from-primary/15 hover:to-secondary/96 hover:shadow-[0_0_0_1px_rgb(var(--primary-rgb)/0.08)]'
