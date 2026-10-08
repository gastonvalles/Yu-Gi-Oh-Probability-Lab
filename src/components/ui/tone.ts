/**
 * Tonos semánticos de la app. El color siempre significa algo:
 * brand = lo tuyo (selección, acción principal) · success = bien/listo · warning = ojo ·
 * danger = mal/peligro · info = dato destacado · neutral = sin énfasis.
 * Los roles de las cartas (starter, disruption…) tienen su propia paleta y no usan estos tonos.
 */
export type Tone = 'neutral' | 'brand' | 'success' | 'warning' | 'danger' | 'info'

interface ToneStyle {
  /** Texto e íconos del tono (versión clara: legible sobre fondos teñidos y sobre el fondo de la app). */
  text: string
  /** Borde + fondo suave: chips, avisos, filas destacadas. */
  tint: string
  /** Sólo fondo teñido (sin borde): avisos y filas destacadas dentro de una tarjeta. */
  soft: string
  /** Tarjeta grande teñida: mismo fondo que una tarjeta común con un velo del color arriba. */
  wash: string
  /** Relleno sólido: puntos, barras, indicadores. */
  fill: string
  /** Publica `--tone-rgb` para componer degradés y brillos (`rgb(var(--tone-rgb)/0.3)`). */
  rgb: string
}

export const TONE: Record<Tone, ToneStyle> = {
  neutral: {
    text: 'text-muted',
    tint: 'border-border bg-tint/5',
    soft: 'bg-tint/7',
    wash: 'border-border-subtle bg-card-background bg-linear-to-b from-tint/6 to-tint/1',
    fill: 'bg-soft',
    rgb: '[--tone-rgb:var(--foreground-rgb)]',
  },
  brand: {
    text: 'text-primary-soft',
    tint: 'border-primary/40 bg-primary/14',
    soft: 'bg-primary/14',
    wash: 'border-primary/30 bg-card-background bg-linear-to-b from-primary/12 to-primary/4',
    fill: 'bg-primary',
    rgb: '[--tone-rgb:var(--primary-rgb)]',
  },
  success: {
    text: 'text-success-soft',
    tint: 'border-success/34 bg-success/12',
    soft: 'bg-success/10',
    wash: 'border-success/26 bg-card-background bg-linear-to-b from-success/10 to-success/3',
    fill: 'bg-success',
    rgb: '[--tone-rgb:var(--success-rgb)]',
  },
  warning: {
    text: 'text-warning-soft',
    tint: 'border-warning/38 bg-warning/12',
    soft: 'bg-warning/10',
    wash: 'border-warning/28 bg-card-background bg-linear-to-b from-warning/10 to-warning/3',
    fill: 'bg-warning',
    rgb: '[--tone-rgb:var(--warning-rgb)]',
  },
  danger: {
    text: 'text-danger-soft',
    tint: 'border-danger/40 bg-danger/12',
    soft: 'bg-danger/10',
    wash: 'border-danger/30 bg-card-background bg-linear-to-b from-danger/10 to-danger/3',
    fill: 'bg-danger',
    rgb: '[--tone-rgb:var(--danger-rgb)]',
  },
  info: {
    text: 'text-info-soft',
    tint: 'border-info/38 bg-info/12',
    soft: 'bg-info/10',
    wash: 'border-info/28 bg-card-background bg-linear-to-b from-info/10 to-info/3',
    fill: 'bg-info',
    rgb: '[--tone-rgb:var(--info-rgb)]',
  },
}
