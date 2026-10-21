import { cx } from './cx'
import { TONE } from './tone'

/**
 * Estilos compartidos de la app (superficies, campos, chips). Son strings de utilidades de
 * Tailwind escritos completos (Tailwind sólo detecta clases literales): se combinan con
 * `cx()` o se interpolan en un className. Para bloques nuevos preferí <Card>, <Callout> y <Badge>.
 *
 * Jerarquía: lienzo (fondo) < card < inset (hundido dentro de una card). Las sombras son
 * parejas y suaves; sólo la acción principal lleva brillo violeta y el foco, un aro ámbar.
 */
export const surface = {
  /** Contenedor flotante grande (modal, drawer). */
  panel: 'rounded-panel border border-border-subtle bg-card-background shadow-overlay',
  card: 'rounded-card border border-border-subtle bg-card-background shadow-card',
  /** Contenedor de cada paso: sólo ordena (las tarjetas de adentro son las que tienen fondo). */
  stepShell: '',
  cardSuccess: cx('rounded-card border shadow-card', TONE.success.wash),
  cardWarning: cx('rounded-card border shadow-card', TONE.warning.wash),
  cardDanger: cx('rounded-card border shadow-card', TONE.danger.wash),
} as const

/** Campo de texto, select y textarea: lavanda como los demás controles, con borde fino que se enciende al enfocar. */
export const field =
  'rounded-control border border-tint/12 bg-input text-foreground outline-none transition-[border-color,box-shadow,background-color] duration-150 hover:border-tint/20 hover:bg-input-hover focus:border-info/70 focus:shadow-[0_0_0_3px_rgb(var(--info-rgb)/0.18)] [color-scheme:dark] [&_option]:bg-secondary [&_option]:text-foreground [&_optgroup]:bg-secondary [&_optgroup]:text-foreground'

/** Chips informativos (no interactivos). */
export const chip = {
  base: 'rounded-full border border-border-subtle bg-tint/5 text-muted',
  accent: cx('rounded-full border text-foreground', TONE.brand.tint),
} as const

/**
 * Pastilla de selección (tipo de carta, atributo, nivel): lavanda en reposo y, elegida (aria-pressed), ámbar con el texto oscuro: lo elegido es ámbar en toda la app
 * (el violeta es de los fondos y de la acción principal). Elegida, al pasar el mouse se aclara: tocarla la apaga.
 */
export const choiceChip =
  'inline-flex items-center justify-center rounded-control bg-lavender font-semibold text-foreground transition-[background-color,color] duration-150 hover:bg-lavender-hover focus-visible:outline-none focus-visible:shadow-focus aria-pressed:bg-info aria-pressed:text-info-foreground aria-pressed:hover:bg-info-soft'

/** Chip de un filtro puesto (una carta, un arquetipo, un filtro del buscador): está encendido, así que va en ámbar como lo elegido; se toca para quitarlo. */
export const filterChip =
  'inline-flex max-w-full items-center gap-1.5 rounded-control bg-info px-3 py-1.5 pointer-coarse:min-h-11 text-micro font-semibold leading-none text-info-foreground transition-colors duration-150 hover:bg-info-soft focus-visible:outline-none focus-visible:shadow-focus'

/** Fila clickeable de una lista (cartas, resultados). */
export const listItem =
  'rounded-card transition-colors duration-150 hover:bg-tint/7'
