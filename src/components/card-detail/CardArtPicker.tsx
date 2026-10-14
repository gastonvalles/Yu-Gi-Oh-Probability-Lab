import { useEffect, useRef } from 'react'

import type { ArtChoice } from '../../app/use-card-art-options'
import { t } from '../../i18n'
import { CardArt } from '../CardArt'
import { cx } from '../ui/cx'

interface CardArtPickerProps {
  arts: readonly ArtChoice[]
  selectedId: string | null
  onSelect: (id: string) => void
  /** En fila (bajo la carta) o en columna (al costado). */
  direction?: 'row' | 'column'
  className?: string
}

/**
 * Las miniaturas de los artes de la carta (los de YGOPRODeck y el escaneo de cada impresión, donde están las overframe, las de arte extendido y las
 * alternativas): tocar una cambia el arte grande; el nombre de la impresión sale al dejar el mouse encima.
 * Con un solo arte no se muestra nada. Sale siempre afuera de la carta que se inclina en 3D, para que no se mueva con ella.
 * Si son más de los que entran, la tira scrollea (con su barra fina a la vista, para que se note y se pueda arrastrar con el mouse): en fila se
 * centra sólo mientras entra, con `auto` en los márgenes de las puntas; con `justify-center` las primeras quedarían cortadas a la izquierda, sin
 * forma de llegar a ellas. Con el mouse, la rueda recorre la fila de costado (es lo que se espera de una tira horizontal).
 */
export function CardArtPicker({ arts, selectedId, onSelect, direction = 'row', className }: CardArtPickerProps) {
  const listRef = useRef<HTMLDivElement>(null)
  const single = arts.length < 2

  useEffect(() => {
    const list = listRef.current

    if (!list || direction !== 'row') return

    // Nativo y no passive (el onWheel de React lo es): hace falta frenar el scroll vertical de la página sólo mientras la fila todavía se puede mover.
    const onWheel = (event: WheelEvent) => {
      const max = list.scrollWidth - list.clientWidth
      const next = Math.min(max, Math.max(0, list.scrollLeft + event.deltaY))

      if (max <= 0 || Math.abs(event.deltaY) < Math.abs(event.deltaX) || next === list.scrollLeft) return

      event.preventDefault()
      list.scrollLeft = next
    }

    list.addEventListener('wheel', onWheel, { passive: false })

    return () => list.removeEventListener('wheel', onWheel)
  }, [direction, single])

  if (single) {
    return null
  }

  return (
    <div
      ref={listRef}
      role="group"
      aria-label={t('search.arts.label')}
      className={cx(
        'flex gap-1.5 overflow-auto overscroll-contain p-0.5',
        direction === 'column' ? 'flex-col' : 'flex-row [&>:first-child]:ml-auto [&>:last-child]:mr-auto',
        className,
      )}
    >
      {arts.map((art, index) => {
        const selected = (selectedId ?? arts[0]!.id) === art.id

        return (
          <button
            key={art.id}
            type="button"
            aria-pressed={selected}
            title={art.label || undefined}
            aria-label={t('search.arts.pick', { n: index + 1, count: arts.length })}
            className={cx(
              'relative aspect-[421/614] w-9 shrink-0 overflow-hidden rounded-tag border bg-input p-0 transition-[opacity,border-color,box-shadow] duration-150 focus-visible:outline-none focus-visible:shadow-focus',
              selected ? 'border-success opacity-100 shadow-[0_0_8px_rgb(var(--success-rgb)/0.55)]' : 'border-tint/25 opacity-70 hover:border-tint/60 hover:opacity-100',
            )}
            onClick={(event) => {
              // Está encima del fondo del detalle, que se cierra al tocarlo: acá sólo se cambia de arte.
              event.stopPropagation()
              onSelect(art.id)
            }}
          >
            <CardArt remoteUrl={art.imageUrlSmall ?? art.imageUrl} name="" className="block h-full w-full object-cover" />
          </button>
        )
      })}
    </div>
  )
}
