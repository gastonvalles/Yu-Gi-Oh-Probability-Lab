import type { ReactNode } from 'react'

import { cx } from '../ui/cx'
import { Heading } from '../ui/Heading'
import { supportText } from '../ui/typography'

interface SpecimenProps {
  title: string
  /** Para qué sirve, cuándo usarlo y qué se toca para cambiarlo (el archivo). */
  note?: ReactNode
  children: ReactNode
  className?: string
  /** Cómo se acomodan las muestras de adentro: en fila que baja de renglón (por defecto) o en una columna. */
  layout?: 'row' | 'column' | 'free'
}

/**
 * Una muestra del catálogo: su nombre, una nota de uso y el componente real (nunca una copia) debajo. Las columnas son `minmax(0,1fr)`: con la pista automática, una fila que
 * se desliza (`ScrollRow`) ensanchaba la muestra y la nota y lo de adentro se metían en la muestra de al lado.
 */
export function Specimen({ title, note, children, className, layout = 'row' }: SpecimenProps) {
  return (
    <div className={cx('grid min-w-0 grid-cols-[minmax(0,1fr)] content-start gap-3 rounded-card border border-border-subtle bg-card-background/60 p-4', className)}>
      <div className="grid gap-0.5">
        <Heading level="card" as="h3">
          {title}
        </Heading>
        {note ? <p className={cx(supportText, 'text-micro text-soft')}>{note}</p> : null}
      </div>
      <div className={cx(layout === 'row' && 'flex flex-wrap items-center gap-3', layout === 'column' && 'grid grid-cols-[minmax(0,1fr)] gap-3')}>{children}</div>
    </div>
  )
}

/** Rótulo chico de un renglón o una columna de muestras ("sm", "primary"). */
export function Tag({ children }: { children: ReactNode }) {
  return <code className="rounded-tag bg-tint/8 px-1.5 py-0.5 text-micro text-muted">{children}</code>
}

/** Una grilla de muestras que se acomoda al ancho disponible. */
export function SpecimenGrid({ children, min = '18rem' }: { children: ReactNode; min?: string }) {
  return (
    <div className="grid gap-4" style={{ gridTemplateColumns: `repeat(auto-fill, minmax(min(${min}, 100%), 1fr))` }}>
      {children}
    </div>
  )
}
