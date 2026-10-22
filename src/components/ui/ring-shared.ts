import { formatWholePercent } from '../../app/utils'

/** Transición común de los anillos: el arco crece con una curva suave que frena al final. */
export const RING_TRANSITION =
  'transition-[stroke-dashoffset,stroke-dasharray] duration-[900ms] ease-(--ease-snap) motion-reduce:transition-none'

/**
 * La pista de todos los anillos: una sola, índigo y neutra (`border`). Es decorativa: el valor lo dicen el arco y el número del centro, así que no lleva el color del arco.
 * Sobre la tarjeta índigo de la navegación (`onBrand`) va el índigo elevado de esa superficie, que es el que se ve ahí.
 */
export const RING_TRACK = 'stroke-border'
export const RING_TRACK_ON_BRAND = 'stroke-nav-raised'

/** La pista de un anillo «sin medir» (falta clasificar): punteada, sin arco y con «?» al centro. */
export const RING_UNMEASURED_DASH = '4 6'

/** Geometría del anillo: grosor según el tamaño (4 en listas y opciones, 8 en una tarjeta, 14 en el protagonista). */
export function ringGeometry(size: number, strokeWidth?: number) {
  const stroke = strokeWidth ?? (size >= 120 ? 14 : size >= 64 ? 8 : 4)
  const radius = (size - stroke) / 2

  return { stroke, radius, circumference: 2 * Math.PI * radius, center: size / 2 }
}

/** Tamaño del número del centro según el diámetro: `display` en el protagonista (140 a 184 px), `body` en una tarjeta (56 a 88) y `micro` en una lista o una opción (36 a 44). */
export function ringCenterText(size: number): string {
  if (size >= 120) {
    return 'text-display font-bold tracking-[-0.02em]'
  }

  return size >= 64 ? 'text-body font-semibold' : 'text-micro font-semibold'
}

/** Más chico que esto un anillo no lleva número (no se lee): lo dice su nombre accesible. */
export const RING_MIN_NUMBER_SIZE = 36

/**
 * El número de un anillo: «de cada 100», entero y sin el «%» (la unidad se dice una vez por bloque, al lado). Nunca miente en las puntas: 99,5 es «>99» y 0,4 es «<1»
 * (`formatWholePercent`); el decimal va en el nombre accesible y en la ficha.
 */
export function formatPer100(value: number): string {
  return formatWholePercent(value).replace('%', '')
}

export function clamp01(value: number): number {
  return Number.isFinite(value) ? Math.max(0, Math.min(1, value)) : 0
}
