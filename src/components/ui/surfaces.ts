import { cx } from './cx'
import { TONE } from './tone'

/**
 * Estilos compartidos de la app (superficies, campos, chips). Son strings de utilidades de
 * Tailwind escritos completos (Tailwind sólo detecta clases literales): se combinan con
 * `cx()` o se interpolan en un className. Para bloques nuevos preferí <Card>, <Callout> y <Badge>.
 *
 * Jerarquía: lienzo (fondo) < card < inset (hundido dentro de una card). Las sombras son
 * parejas y suaves, sin brillos, y el foco lleva un aro ámbar.
 */
export const surface = {
  /** Contenedor flotante grande (modal, drawer). */
  panel: 'rounded-panel border border-border-subtle bg-card-background shadow-overlay',
  /** El mismo panel sin velo detrás (los menús de la mesa): el borde un punto más marcado lo despega del campo, como la tira del visor de una pila. */
  floating: 'rounded-panel border border-border bg-card-background shadow-overlay',
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
} as const

/**
 * Pastilla de selección (tipo de carta, atributo, nivel): lavanda en reposo y, elegida (aria-pressed), violeta con el texto blanco: lo elegido es violeta en toda la app
 * (el violeta es de los fondos y de la acción principal). Elegida, al pasar el mouse se aclara: tocarla la apaga.
 */
export const choiceChip =
  'inline-flex items-center justify-center rounded-control bg-lavender font-semibold text-foreground transition-[background-color,color] duration-150 hover:bg-lavender-hover focus-visible:outline-none focus-visible:shadow-focus aria-pressed:bg-primary aria-pressed:text-white aria-pressed:hover:bg-primary'

/** Chip de un filtro puesto (una carta, un arquetipo, un filtro del buscador): está encendido, así que va en violeta como lo elegido; se toca para quitarlo. */
export const filterChip =
  'inline-flex max-w-full items-center gap-1.5 rounded-control bg-primary px-3 py-1.5 pointer-coarse:min-h-11 text-micro font-semibold leading-none text-white transition-colors duration-150 hover:bg-primary/85 focus-visible:outline-none focus-visible:shadow-focus'

/** Fila clickeable de una lista (cartas, resultados). */
export const listItem =
  'rounded-card transition-colors duration-150 hover:bg-tint/7'

/**
 * La fila elegida de una lista (el resultado del buscador que se ve en la vista previa, la impresión que se ve en el zoom): lo dice un aro ámbar por dentro, que no
 * corre nada de lugar, y el velo violeta queda de fondo. Nunca un relleno violeta (es de la acción principal) ni un velo ámbar (sobre el índigo se ve marrón).
 */
export const listItemSelected = 'bg-tint/10 inset-ring inset-ring-info/70'

/**
 * El «+» que se repite en cada fila de resultados (sumar la carta al deck): no es la acción principal de la pantalla, así que no va violeta. Es un círculo oscuro (tapa
 * el texto de la fila que quede debajo) con un borde fino y el ícono blanco, que se encienden en ámbar al apuntarlo o con el foco, como el `outline`. Va con `border`
 * y su tamaño; recién agregada, verde (lo pone quien lo usa, en vez de esta clase).
 */
export const rowAddButton = 'border-tint/30 bg-background/85 text-white hover:border-info/80 hover:text-info focus-visible:border-info/80 focus-visible:text-info'
