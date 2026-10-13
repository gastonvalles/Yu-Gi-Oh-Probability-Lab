import type { ReactNode } from 'react'

import { cx } from '../ui/cx'
import { CardGlare, TILT_ART, TILT_PERSPECTIVE, tiltHandlers } from './card-tilt'

/**
 * La carta de una grilla (expansiones, banlists...): se inclina en 3D hacia el mouse y lleva su brillo, exactamente igual que la carta grande del detalle
 * (`card-tilt.tsx`: la perspectiva afuera, el giro y los eventos en la carta). El que la usa le da el tamaño y las esquinas con `className`; los hijos son la imagen.
 */
export function TiltCard({ className, children }: { className?: string; children: ReactNode }) {
  return (
    <span className={cx('block', TILT_PERSPECTIVE)}>
      <span className={cx('relative block overflow-hidden', TILT_ART, className)} {...tiltHandlers}>
        {children}
        <CardGlare />
      </span>
    </span>
  )
}
