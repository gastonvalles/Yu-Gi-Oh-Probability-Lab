import { createElement, useEffect, useRef, type CSSProperties } from 'react'

import { FLIP_FRAME, playFlipbook, restOf, type FlipbookArt } from '../../app/flipbooks'
import { cx } from './cx'

interface FlipbookProps {
  /** Cuál (`SPARK`, `CUT`, `BURST` de `app/flipbooks.ts`). */
  book: FlipbookArt
  /** Cuánto espera antes de correr (ms): quieto no se ve nada. */
  delay?: number
  /** Cambiarlo lo corre de nuevo (una muestra que se repite). Corre una vez al montarse. */
  play?: number
  /** Centrado en su punto (`left`/`top` del `style`) en vez de en la esquina. */
  center?: boolean
  /** El tamaño y el lugar (`absolute`, `w-1/4 aspect-square`, `-inset-2`). */
  className?: string
  style?: CSSProperties
}

/**
 * Un flipbook de «Impacto Ligero» (8 a 12 cuadros dibujados en SVG, `app/flipbooks.ts`): una ventana recortada con la tira adentro, que corre una vez con `steps()` sobre su `translate`
 * (compositor) y vuelve a su cuadro vacío. No ataja toques y es `aria-hidden` (adorna lo que ya dice otro lado: la cadena, el medallón).
 * - **Estados:** quieto (sin nada a la vista), corriendo. Con «Efectos: Livianos» (`fx-lite:`) o movimiento reducido no está.
 * - **Hacer:** pocos y con sentido (activar, negar, destruir). **No hacer:** uno en cada movimiento, ni en bucle.
 * - **Usos:** la chispa donde la línea de energía toca la carta que se encadena (`ChainStage`), el corte en el medallón negado (`ChainBadge`) y la muestra 5 de /playground. El estallido
 *   de la mesa va por el DOM (`flipbookAt`), sin React.
 */
export function Flipbook({ book, delay = 0, play = 0, center = false, className, style }: FlipbookProps) {
  const strip = useRef<HTMLSpanElement | null>(null)

  useEffect(() => {
    const run = strip.current ? playFlipbook(strip.current, book, delay) : null

    return () => run?.cancel()
  }, [book, delay, play])

  return (
    <span aria-hidden="true" data-flipbook="" style={style} className={cx('pointer-events-none block overflow-hidden fx-lite:hidden motion-reduce:hidden', center && '-translate-1/2', className)}>
      <span ref={strip} className="block h-full" style={{ width: `${(book.frames + 1) * 100}%`, translate: restOf(book) }}>
        <FlipbookFrames book={book} />
      </span>
    </span>
  )
}

/** La tira entera, cuadro al lado de cuadro (el «atlas»): la usa `Flipbook` y la muestra la enseña quieta. */
export function FlipbookFrames({ book, className = 'block size-full' }: { book: FlipbookArt; className?: string }) {
  return (
    <svg viewBox={`0 0 ${(book.frames + 1) * FLIP_FRAME} ${FLIP_FRAME}`} className={className} aria-hidden="true">
      {Array.from({ length: book.frames }, (_, index) => (
        <g key={index} transform={`translate(${index * FLIP_FRAME} 0)`}>
          {book.draw(index).map(({ tag, attrs, className: tone }, shape) => createElement(tag, { key: shape, ...attrs, className: tone }))}
        </g>
      ))}
    </svg>
  )
}
