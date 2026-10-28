import { Children, useEffect, useRef, useState, type KeyboardEvent, type ReactNode } from 'react'

import { t } from '../../i18n'
import { cx } from './cx'
import { Icon } from './Icon'
import { IconButton } from './IconButton'

/**
 * `Carousel`: una fila de tarjetas que se desliza de a una (los decks ganadores, las salas de la arena), con **la siguiente asomando** (dice «hay más» sin escribirlo).
 *
 * - **Props:** `label` (el nombre del carrusel para el lector, «Decks ganadores») · `children` (una tarjeta por hijo, cada una una `Card`) · `bleed` (el carril sale
 *   hasta el borde derecho de la pantalla en el celular: va en el lienzo, con `px-gutter`, nunca adentro de una tarjeta).
 * - **Cómo:** CSS (`snap-x snap-mandatory`, cada tarjeta `snap-start` del 80 % del carril, hasta 20 rem): el deslizamiento lo hace el navegador. Los puntos siguen a la
 *   tarjeta que más se ve (`IntersectionObserver`) y cada uno lleva a la suya; en escritorio, flechas a los costados de los puntos y `←` / `→` con el foco adentro.
 *   Con `prefers-reduced-motion` salta sin deslizarse.
 * - **Estados:** la actual, una píldora ámbar (navegación); las demás, puntos `tint/30`; en las puntas, la flecha de ese lado se apaga. Con una sola tarjeta no hay puntos.
 * - **Accesibilidad:** región con `aria-roledescription="carrusel"` y su `label`; cada tarjeta, `role="group"` con «2 de 4»; los puntos son botones con nombre
 *   («Ver la 2 de 4») y `aria-current`: no son el único medio (Tab entra a cada tarjeta y el navegador la trae).
 * - **Hacer:** hasta 5 o 6 tarjetas (Miller); con más, un «Ver las N» en el `SectionHeader`. **No hacer:** pasar solo (autoplay), escribir «deslizá», un carrusel dentro de una tarjeta.
 * - **Por qué no `ScrollRow`:** aquella es una fila de chips que se corta con un degradé y flechas encima; acá cada hijo es una tarjeta que se encaja, con puntos y su «N de M».
 * - **Usos:** los decks ganadores de Torneos, las salas que esperan en Jugar, los duelos en vivo para mirar.
 */

interface CarouselProps {
  label: string
  children: ReactNode
  bleed?: boolean
  className?: string
}

export function Carousel({ label, children, bleed = false, className }: CarouselProps) {
  const slides = Children.toArray(children)
  const count = slides.length
  const track = useRef<HTMLDivElement | null>(null)
  const [current, setCurrent] = useState(0)

  useEffect(() => {
    const element = track.current

    if (!element || typeof IntersectionObserver === 'undefined') {
      return
    }

    const ratios = new Map<Element, number>()
    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) ratios.set(entry.target, entry.intersectionRatio)

        const items = [...element.children]
        const best = items.reduce((top, item, index) => ((ratios.get(item) ?? 0) > (ratios.get(items[top]!) ?? 0) ? index : top), 0)

        setCurrent(best)
      },
      { root: element, threshold: [0, 0.25, 0.5, 0.75, 1] },
    )

    for (const item of element.children) observer.observe(item)

    return () => observer.disconnect()
  }, [count])

  const go = (index: number) => {
    const target = Math.min(count - 1, Math.max(0, index))

    // Sin `behavior`: lo decide el CSS del carril (`motion-safe:scroll-smooth`), así con menos movimiento salta.
    track.current?.children[target]?.scrollIntoView({ block: 'nearest', inline: 'start' })
    setCurrent(target)
  }

  const onKeyDown = (event: KeyboardEvent) => {
    if (event.key === 'ArrowRight' || event.key === 'ArrowLeft') {
      event.preventDefault()
      go(current + (event.key === 'ArrowRight' ? 1 : -1))
    }
  }

  return (
    <section aria-roledescription={t('common.carousel')} aria-label={label} onKeyDown={onKeyDown} className={cx('grid min-w-0 gap-2', className)}>
      {/* El relleno de 4 px deja entrar el aro del foco (el carril recorta lo que sale); el margen negativo lo compensa. */}
      <div
        ref={track}
        className={cx(
          '-my-1 -ml-1 flex snap-x snap-mandatory scroll-pl-1 gap-3 overflow-x-auto overscroll-x-contain py-1 pl-1 motion-safe:scroll-smooth [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden',
          bleed ? '-mr-gutter pr-gutter min-[1101px]:-mr-1 min-[1101px]:pr-1' : '-mr-1 pr-1',
        )}
      >
        {slides.map((slide, index) => (
          <div key={index} role="group" aria-label={t('common.carousel.slide', { index: index + 1, count })} className="flex w-[min(80%,20rem)] shrink-0 snap-start [&>*]:flex-1">
            {slide}
          </div>
        ))}
      </div>
      {count > 1 ? (
        <div className="flex items-center justify-center gap-2">
          <IconButton tone="ghost" size="sm" className="pointer-coarse:hidden" aria-label={t('common.scrollBack')} disabled={current === 0} onClick={() => go(current - 1)}>
            <Icon name="chevron-left" />
          </IconButton>
          <div className="flex items-center">
            {slides.map((_, index) => (
              <button
                key={index}
                type="button"
                aria-label={t('common.carousel.goTo', { index: index + 1, count })}
                aria-current={index === current || undefined}
                onClick={() => go(index)}
                className="group grid h-11 w-6 cursor-pointer place-items-center rounded-full focus-visible:outline-none focus-visible:shadow-focus"
              >
                <span className={cx('block h-2 rounded-full transition-[width,background-color] duration-150 motion-reduce:transition-none', index === current ? 'w-5 bg-info' : 'w-2 bg-tint/30 group-hover:bg-tint/60')} />
              </button>
            ))}
          </div>
          <IconButton tone="ghost" size="sm" className="pointer-coarse:hidden" aria-label={t('common.scrollForward')} disabled={current === count - 1} onClick={() => go(current + 1)}>
            <Icon name="chevron-right" />
          </IconButton>
        </div>
      ) : null}
    </section>
  )
}
