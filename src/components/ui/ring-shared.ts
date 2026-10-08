/** Transición común de los anillos: el arco crece con una curva suave que frena al final. */
export const RING_TRANSITION =
  'transition-[stroke-dashoffset,stroke-dasharray] duration-[900ms] ease-[cubic-bezier(0.22,1,0.36,1)] motion-reduce:transition-none'

/** Geometría del anillo: grosor según el tamaño (4 en listas, 8 medianos, 14 en el protagonista). */
export function ringGeometry(size: number, strokeWidth?: number) {
  const stroke = strokeWidth ?? (size >= 120 ? 14 : size >= 64 ? 8 : 4)
  const radius = (size - stroke) / 2

  return { stroke, radius, circumference: 2 * Math.PI * radius, center: size / 2 }
}

/** Tamaño del número del centro según el diámetro del anillo. */
export function ringCenterText(size: number): string {
  if (size >= 120) {
    return 'text-stat font-bold tracking-[-0.02em]'
  }

  return size >= 64 ? 'text-body font-semibold' : 'text-micro font-semibold'
}

export function clamp01(value: number): number {
  return Number.isFinite(value) ? Math.max(0, Math.min(1, value)) : 0
}
