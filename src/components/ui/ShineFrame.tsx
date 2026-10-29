import type { ReactNode } from 'react'

import { cx } from './cx'

interface ShineFrameProps {
  /** Con false, queda el marco sin animar (el mismo alto y ancho: el botón no se corre de lugar). */
  active?: boolean
  /** Del contenedor: dónde va (`ml-auto`). */
  className?: string
  /** Un solo botón: el principal de la pantalla. */
  children: ReactNode
}

/**
 * El marco de la acción principal de una pantalla (la «Jugar ahora» de la portada): un hilo ámbar que le da la vuelta al botón y, de a ratos, un brillo que lo barre. Es lo único que se
 * mueve de la portada, así que se distingue (Von Restorff); va en **un solo botón por pantalla**.
 *
 * - **Rendimiento:** las dos capas sólo mueven `transform`/`translate` (el hilo es un degradé cónico grande que gira, `animate-spin`; el brillo, una barra que cruza con `animate-shine`):
 *   corren en el compositor, sin repintar y sin JavaScript. Con `active` en false no se dibuja ninguna.
 * - **Movimiento reducido:** con `motion-reduce` las dos capas se esconden y queda sólo el botón.
 * - **Props:** `active`, `className`, `children` (el `Button`). **Estados:** activo, quieto (`active={false}`: en pausa, ocupado o sin deck). **Accesibilidad:** las capas son `aria-hidden` y no reciben toques;
 *   el foco del botón no se recorta (el marco no lleva `overflow-hidden`: lo recortan las capas).
 * - **Usos:** «Jugar ahora» de la portada de Jugar.
 */
export function ShineFrame({ active = true, className, children }: ShineFrameProps) {
  return (
    <span className={cx('relative isolate inline-flex rounded-control p-0.5', className)}>
      {active ? (
        <>
          <span aria-hidden="true" className="pointer-events-none absolute inset-0 -z-10 overflow-hidden rounded-[inherit] motion-reduce:hidden">
            <span className="absolute -inset-[150%] animate-spin bg-[conic-gradient(from_0deg,transparent_0_58%,var(--color-info)_100%)] [animation-duration:3.6s] [animation-timing-function:linear]" />
          </span>
          {children}
          <span aria-hidden="true" className="pointer-events-none absolute inset-0.5 overflow-hidden rounded-[calc(var(--radius-control)-2px)] motion-reduce:hidden">
            <span className="absolute inset-y-0 left-0 w-1/3 -skew-x-12 animate-shine bg-linear-to-r from-transparent via-info/40 to-transparent" />
          </span>
        </>
      ) : (
        children
      )}
    </span>
  )
}
