import type { ElementType, HTMLAttributes } from 'react'

import { cx } from './cx'

interface StepPageProps extends HTMLAttributes<HTMLElement> {
  as?: ElementType
  /** Más ancho que el resto: para las vistas que son una grilla de cartas y aprovechan la pantalla entera. */
  wide?: boolean
}

/**
 * Contenedor de cada paso: ancho máximo centrado en pantallas grandes, márgenes y separación
 * entre bloques iguales en toda la app. Las tarjetas de adentro son las que tienen fondo.
 */
export function StepPage({ as: Component = 'section', wide = false, className, ...props }: StepPageProps) {
  return (
    <Component
      className={cx(
        'mx-auto grid w-full min-w-0 content-start gap-4 px-gutter pb-6 pt-4 min-[1101px]:gap-5 min-[1101px]:px-6 min-[1101px]:pb-8 min-[1101px]:pt-6',
        wide ? 'max-w-[112rem]' : 'max-w-content',
        className,
      )}
      {...props}
    />
  )
}
