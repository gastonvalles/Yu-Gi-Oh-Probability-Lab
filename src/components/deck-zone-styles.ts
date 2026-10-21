import type { DeckZone as DeckZoneType } from '../app/model'
import { cx } from './ui/cx'

/**
 * Cartas de una zona del deck. Las comparten la vista mobile (zonas con grilla propia) y la
 * clásica de desktop (filas superpuestas). El estado llega por data-selected / data-dragging.
 */

/** Marco punteado "hormigas": aparece al pasar el mouse (sólo con puntero fino). */
const MARCHING_ANTS = [
  'after:pointer-events-none after:absolute after:inset-0 after:z-1 after:opacity-0 after:transition-opacity after:duration-120',
  'after:[background-image:linear-gradient(90deg,#000_50%,#fff_50%),linear-gradient(90deg,#000_50%,#fff_50%),linear-gradient(0deg,#000_50%,#fff_50%),linear-gradient(0deg,#000_50%,#fff_50%)]',
  'after:[background-repeat:repeat-x,repeat-x,repeat-y,repeat-y] after:[background-size:9px_2px,9px_2px,2px_9px,2px_9px] after:[background-position:0_0,0_100%,0_0,100%_0]',
  '[@media(hover:hover)_and_(pointer:fine)]:hover:after:animate-marching-ants [@media(hover:hover)_and_(pointer:fine)]:hover:after:opacity-100 motion-reduce:hover:after:animate-none',
].join(' ')

/** Táctil: sin menú nativo del long-press; la imagen no recibe el toque. */
const TOUCH = [
  'relative min-w-0 touch-pan-y select-none bg-transparent p-0 [-webkit-tap-highlight-color:transparent] [-webkit-touch-callout:none]',
  '[&_img]:pointer-events-none [&_img]:select-none [&_img]:[-webkit-user-drag:none]',
  'data-[drag-armed=true]:animate-card-armed',
].join(' ')

/** Carta en la vista mobile. */
/** Marco verde para destacar cartas (p. ej. las hand traps de un deck del meta). */
const HIGHLIGHTED = 'data-[highlighted=true]:inset-ring-2 data-[highlighted=true]:inset-ring-success/90'

/** Con el teclado, la carta enfocada lleva un marco claro hacia adentro (la zona recorta lo que sobra: un anillo de afuera se perdería) y pasa al frente de las que se le solapan. */
const KEYBOARD_FOCUS = 'focus-visible:z-1 focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-solid focus-visible:outline-foreground'

export function deckCardMobile(dragging: boolean): string {
  return cx(TOUCH, MARCHING_ANTS, HIGHLIGHTED, KEYBOARD_FOCUS, 'cursor-grab motion-safe:animate-card-in', dragging && 'opacity-35')
}

/** Carta en el builder clásico de desktop: contorno punteado al pasar / arrastrar y marco al elegirla. */
export const DECK_CARD_CLASSIC = [
  TOUCH,
  MARCHING_ANTS,
  HIGHLIGHTED,
  KEYBOARD_FOCUS,
  'motion-safe:animate-card-in',
  'cursor-pointer outline-2 -outline-offset-2 outline-dashed outline-foreground/0 transition-[outline-color] duration-150 hover:z-1 hover:outline-foreground/75',
  'data-[selected=true]:shadow-[inset_0_0_0_1.5px_rgb(var(--info-rgb)/0.56)] data-[selected=true]:hover:outline-info/85',
  'data-[dragging=true]:bg-tint/6 data-[dragging=true]:outline-foreground/75',
  'data-[dragging=true]:[&_[data-card-art]]:opacity-0 data-[dragging=true]:[&_[data-card-limit]]:opacity-0',
].join(' ')

/**
 * Color del punto de cada tipo de carta en el encabezado de la zona: los del marco de la carta (Gastón, 2026-10-19: «la idea es respetar los colores de las cartas para los puntos»). Los del Extra Deck van cada uno
 * del suyo —Fusión violeta, Sincronía blanca, Xyz negra y Enlace azul—; la Xyz lleva un aro claro porque el negro solo se pierde en el fondo oscuro. El export a imagen usa los mismos (`TYPE_SWATCH` en `deck-image-export-render.ts`).
 */
export const ZONE_TYPE_SWATCH: Record<string, string> = {
  monster: 'bg-warning',
  spell: 'bg-success',
  trap: 'bg-[rgb(236_72_153)]',
  fusion: 'bg-[rgb(167_110_205)]',
  synchro: 'bg-[rgb(245_245_250)]',
  xyz: 'bg-[rgb(12_10_18)] ring-1 ring-foreground/60',
  link: 'bg-[rgb(37_99_235)]',
}

/** Superficie de una zona en la vista mobile (grilla de cartas con el color de la zona). */
export const ZONE_SURFACE_MOBILE =
  'relative grid w-full grid-cols-5 content-start gap-1.5 rounded-card border border-(--zone-border) p-2 transition-[border-color,box-shadow] duration-150 [background:linear-gradient(180deg,var(--zone-background),transparent),rgb(var(--card-background-rgb)/0.6)] min-[520px]:grid-cols-8 min-[980px]:grid-cols-10'

/** Filas de cartas del Main en el builder clásico. */
export const MAIN_ROW_GRID =
  'grid w-full [grid-template-columns:repeat(var(--main-deck-columns),minmax(0,1fr))] [min-height:calc(100%/var(--main-deck-columns)/0.72)]'
export const MAIN_ROW_OVERLAP =
  'flex min-h-0 w-full items-start overflow-hidden [&>*]:w-[10%] [&>*]:flex-none [&>*+*]:ml-[calc((100%-10%*var(--classic-main-row-slot-count))/(var(--classic-main-row-slot-count)-1))]'
export const RAIL_ROW =
  'flex h-full min-h-0 items-start overflow-hidden [&>*]:w-[10%] [&>*]:flex-none'
export const RAIL_ROW_OVERLAP =
  '[&>*+*]:ml-[calc((100%-10%*var(--classic-rail-card-count))/(var(--classic-rail-card-count)-1))]'

/** Los colores de cada zona del deck (fondo, borde y el punto del título). */
export const ZONE_STYLES: Record<DeckZoneType, { background: string; border: string; dot: string }> = {
  main: {
    background: 'var(--zone-main-background)',
    border: 'var(--zone-main-border)',
    dot: 'rgb(var(--primary-rgb))',
  },
  extra: {
    background: 'var(--zone-extra-background)',
    border: 'var(--zone-extra-border)',
    dot: 'rgb(var(--handtrap-rgb))',
  },
  side: {
    background: 'var(--zone-side-background)',
    border: 'var(--zone-side-border)',
    dot: 'rgb(var(--success-rgb))',
  },
}
