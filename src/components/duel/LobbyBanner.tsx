import type { ReactNode } from 'react'

import { cx } from '../ui/cx'
import { TONE } from '../ui/tone'

interface LobbyBannerProps {
  /** El titular: «Entrá a un duelo en segundos.» en el inicio de Jugar, «Tu duelo» en la sala. */
  title: string
  /** Lo de arriba a la derecha (los botones de la sala: el chat y salir). */
  actions?: ReactNode
  /** Lo de abajo del titular: lo que va a pasar, los pasos y la acción principal. */
  children?: ReactNode
  /** Las cartas de adorno de la derecha: están en el inicio de Jugar, donde sobra lugar; en la sala (con el enlace, los pasos y botones) no, para no pisar el texto. */
  art?: boolean
  className?: string
}

/**
 * La portada de Jugar y de la sala, como el banner de un lobby de juego: una tarjeta violeta grande con el titular, tres cartas en abanico de adorno (lo que se juega, sin ocupar lugar)
 * y, abajo, lo que toca hacer. Las dos pantallas comparten esta pieza para verse y estructurarse igual: portada arriba y baldosas debajo.
 */
export function LobbyBanner({ title, actions, children, art = true, className }: LobbyBannerProps) {
  return (
    <section aria-label={title} className={cx('relative isolate grid gap-3 overflow-hidden rounded-panel border p-4 min-[1101px]:p-5', TONE.brand.wash, className)}>
      {art ? (
        <span aria-hidden="true" className="parallax-slow pointer-events-none absolute -right-3 -top-2 -z-10 flex h-full items-center opacity-60">
          <i className="-mr-8 h-24 w-16 -rotate-12 rounded-tag border border-primary/50 bg-primary/20" />
          <i className="-mr-8 h-24 w-16 rotate-0 rounded-tag border border-info/50 bg-info/15" />
          <i className="h-24 w-16 rotate-12 rounded-tag border border-success/50 bg-success/15" />
        </span>
      ) : null}
      <div className="flex items-start justify-between gap-3">
        <h2 className="m-0 max-w-[16rem] text-title font-extrabold leading-tight text-foreground">{title}</h2>
        {actions ? <div className="relative flex shrink-0 items-center gap-2">{actions}</div> : null}
      </div>
      {children}
    </section>
  )
}
