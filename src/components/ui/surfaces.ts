import { cx } from './cx'
import { TONE } from './tone'

/**
 * Estilos compartidos de la app (superficies, campos, chips). Son strings de utilidades de
 * Tailwind escritos completos (Tailwind sólo detecta clases literales): se combinan con
 * `cx()` o se interpolan en un className. Para bloques nuevos preferí <Card>, <Callout> y <Badge>.
 *
 * Jerarquía: lienzo (fondo) < card < inset (hundido dentro de una card). Las sombras son
 * parejas y suaves; sólo la acción principal y el foco llevan brillo violeta.
 */
export const surface = {
  /** Contenedor flotante grande (modal, drawer). */
  panel: 'rounded-panel border border-border-subtle bg-card-background shadow-overlay',
  /** Panel con énfasis de marca (el resultado principal de una pantalla). */
  panelStrong: 'rounded-card border border-primary/30 bg-card-background bg-linear-to-b from-primary/12 to-transparent shadow-card',
  /** Bloque secundario dentro de una tarjeta o drawer: más claro que el fondo, sin sombra. */
  panelSoft: 'rounded-card border border-border-subtle bg-white/3',
  card: 'rounded-card border border-border-subtle bg-card-background bg-linear-to-b from-white/4 to-transparent shadow-card',
  /** Contenedor de cada paso: sólo ordena (las tarjetas de adentro son las que tienen fondo). */
  stepShell: '',
  cardAccent: cx('rounded-card border shadow-card', TONE.brand.wash),
  cardSuccess: cx('rounded-card border shadow-card', TONE.success.wash),
  cardWarning: cx('rounded-card border shadow-card', TONE.warning.wash),
  cardDanger: cx('rounded-card border shadow-card', TONE.danger.wash),
} as const

/** Campo de texto, select y textarea: hundido (más oscuro que la tarjeta) para que se lea como "escribí acá". */
export const field =
  'rounded-control border border-white/10 bg-black/25 text-foreground outline-none transition-[border-color,box-shadow,background-color] duration-150 hover:border-white/16 focus:border-primary/70 focus:shadow-[0_0_0_3px_rgb(var(--primary-rgb)/0.18)] [color-scheme:dark] [&_option]:bg-secondary [&_option]:text-foreground [&_optgroup]:bg-secondary [&_optgroup]:text-foreground'

/** Chips informativos (no interactivos). */
export const chip = {
  base: 'rounded-full border border-border-subtle bg-white/5 text-muted',
  accent: cx('rounded-full border text-foreground', TONE.brand.tint),
} as const

/** Pastilla de selección (tipo de carta, atributo, nivel): neutra en reposo, violeta si está elegida (aria-pressed). */
export const choiceChip =
  'inline-flex items-center justify-center rounded-full border border-border-subtle bg-white/4 font-semibold text-muted transition-[border-color,background-color,color] duration-150 hover:bg-white/8 hover:text-foreground focus-visible:outline-none focus-visible:shadow-focus aria-pressed:border-primary/55 aria-pressed:bg-primary/20 aria-pressed:text-foreground'

/** Chip de un filtro activo del buscador: se toca para quitarlo. */
export const filterChip =
  'inline-flex max-w-full items-center gap-1.5 rounded-full border border-primary/30 bg-primary/10 px-2.5 py-1 text-micro leading-none text-foreground transition-[border-color,background-color] duration-150 hover:border-primary/55 hover:bg-primary/18 focus-visible:outline-none focus-visible:shadow-focus'

/** Fila clickeable de una lista (cartas, resultados). */
export const listItem =
  'rounded-card border border-border-subtle bg-white/3 transition-[border-color,background-color] duration-150 hover:border-primary/40 hover:bg-primary/8'
