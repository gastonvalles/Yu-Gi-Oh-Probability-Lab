import type { ElementType, HTMLAttributes } from 'react'

import { cx } from './cx'

interface StepPageProps extends HTMLAttributes<HTMLElement> {
  as?: ElementType
}

/**
 * Contenedor de cada paso: ancho máximo centrado en pantallas grandes, márgenes y separación
 * entre bloques iguales en toda la app. Las tarjetas de adentro son las que tienen fondo.
 */
export function StepPage({ as: Component = 'section', className, ...props }: StepPageProps) {
  return (
    <Component
      className={cx(
        'mx-auto grid w-full min-w-0 max-w-content content-start gap-4 px-4 pb-6 pt-4 min-[1101px]:gap-5 min-[1101px]:px-6 min-[1101px]:pb-8 min-[1101px]:pt-6',
        className,
      )}
      {...props}
    />
  )
}
