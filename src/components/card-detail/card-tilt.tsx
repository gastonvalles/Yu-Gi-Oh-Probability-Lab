import type { PointerEvent as ReactPointerEvent } from 'react'

import { prefersReducedMotion } from '../../app/motion'

/** Cuánto se inclina la carta (en grados, en el borde) hacia donde está el puntero. */
const TILT_DEGREES = 12

/**
 * Lo que necesita una carta grande para inclinarse en 3D hacia el mouse, como una carta de verdad que se apoya con el dedo (y un brillo que
 * sigue al puntero): la perspectiva en el contenedor, `TILT_ART` en el elemento que se inclina, `tiltHandlers()` en sus eventos y `CardGlare`
 * adentro. Lo usan el detalle de una carta (`CardOverlay`) y la carta grande del builder (`DeckBuilderClassicPreview`).
 */
export const TILT_PERSPECTIVE = '[perspective:900px]'

/** El elemento que se inclina (va por `rotate`, aparte de `transform`, que usa el vuelo al abrir y cerrar el detalle) y marca a su brillo. */
export const TILT_ART = 'group/art transition-[rotate] duration-(--motion-duration) ease-[cubic-bezier(0.2,0.9,0.25,1)]'

/**
 * Inclina la carta hacia el puntero. Sin tocar el estado de React: cada movimiento sólo escribe estilos.
 */
function tiltTowards(art: HTMLElement, event: ReactPointerEvent<HTMLElement>) {
  const rect = art.getBoundingClientRect()
  const x = ((event.clientX - rect.left) / Math.max(1, rect.width) - 0.5) * 2
  const y = ((event.clientY - rect.top) / Math.max(1, rect.height) - 0.5) * 2
  const strength = Math.min(1, Math.hypot(x, y))

  // Se hunde del lado del puntero: el eje es perpendicular a su desplazamiento desde el centro.
  art.style.rotate = strength < 0.01 ? 'none' : `${-y} ${x} 0 ${strength * TILT_DEGREES}deg`
  art.style.setProperty('--glare-x', `${(x + 1) * 50}%`)
  art.style.setProperty('--glare-y', `${(y + 1) * 50}%`)
  art.dataset.tilting = 'true'
}

/** Vuelve la carta a su lugar (al irse el puntero o al tocarla). */
export function levelOut(art: HTMLElement) {
  art.style.rotate = ''
  art.dataset.tilting = 'false'
}

/**
 * Los eventos del elemento que se inclina. La inclinación es sólo para el mouse (con el dedo sería tirar de la carta) y se apaga con movimiento
 * reducido.
 */
export const tiltHandlers = {
  onPointerMove: (event: ReactPointerEvent<HTMLElement>) => {
    if (event.pointerType !== 'mouse' || prefersReducedMotion()) return
    tiltTowards(event.currentTarget, event)
  },
  onPointerLeave: (event: ReactPointerEvent<HTMLElement>) => levelOut(event.currentTarget),
}

/** El brillo que sigue al puntero mientras la carta se inclina (va adentro del elemento con `TILT_ART`). */
export function CardGlare() {
  return (
    <span
      aria-hidden="true"
      className="pointer-events-none absolute inset-0 opacity-0 transition-opacity duration-(--motion-duration) [background:radial-gradient(circle_at_var(--glare-x,50%)_var(--glare-y,50%),rgb(255_255_255/0.34),transparent_58%)] mix-blend-overlay group-data-[tilting=true]/art:opacity-100 motion-reduce:hidden"
    />
  )
}
