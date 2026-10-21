import { useLayoutEffect, useRef, useState, type ReactNode } from 'react'

import { t } from '../../i18n'
import { cx } from './cx'
import { Icon } from './Icon'
import { IconButton } from './IconButton'

interface ScrollRowProps {
  children: ReactNode
  className?: string
}

/**
 * Una fila que scrollea de costado sin barra (los chips de categorías de YouTube): lo que no entra se corta con un degradé y una flecha que lo trae; la flecha de cada lado
 * sólo está mientras hay algo de ese lado. Con el dedo o la rueda del mouse se desliza igual.
 */
export function ScrollRow({ children, className }: ScrollRowProps) {
  const track = useRef<HTMLDivElement | null>(null)
  const [edges, setEdges] = useState({ start: false, end: false })

  useLayoutEffect(() => {
    const element = track.current

    if (!element) {
      return
    }

    const update = () => {
      const start = element.scrollLeft > 4
      const end = element.scrollLeft + element.clientWidth < element.scrollWidth - 4

      setEdges((current) => (current.start === start && current.end === end ? current : { start, end }))
    }

    update()
    element.addEventListener('scroll', update, { passive: true })

    const observer = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(update)

    observer?.observe(element)

    return () => {
      element.removeEventListener('scroll', update)
      observer?.disconnect()
    }
  }, [children])

  const scrollBy = (direction: 1 | -1) => track.current?.scrollBy({ left: direction * Math.max(160, track.current.clientWidth * 0.7), behavior: 'smooth' })

  return (
    <div className={cx('relative min-w-0', className)}>
      {/* El aro de foco (4 px por fuera del chip) cabe en el relleno de 4 px; el margen negativo lo compensa: la fila no cambia de alto ni de lugar. Los hijos no se encogen (si no, un grupo se achica
          al ancho del carril y el relleno final queda a mitad de la fila) y el relleno final no cuenta para el desplazamiento: el `after:` (4 px) deja entrar el aro del último chip al llegar al final. */}
      <div ref={track} className="-m-1 flex gap-2 overflow-x-auto overscroll-x-contain p-1 [&>*]:shrink-0 after:w-1 after:shrink-0 after:content-[''] [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        {children}
      </div>
      {edges.start ? (
        <span className="absolute inset-y-0 left-0 flex items-center bg-linear-to-r from-background from-60% to-transparent pr-6">
          <IconButton tone="ghost" size="sm" aria-label={t('common.scrollBack')} onClick={() => scrollBy(-1)}>
            <Icon name="chevron-left" size={20} />
          </IconButton>
        </span>
      ) : null}
      {edges.end ? (
        <span className="absolute inset-y-0 right-0 flex items-center bg-linear-to-l from-background from-60% to-transparent pl-6">
          <IconButton tone="ghost" size="sm" aria-label={t('common.scrollForward')} onClick={() => scrollBy(1)}>
            <Icon name="chevron-right" size={20} />
          </IconButton>
        </span>
      ) : null}
    </div>
  )
}
