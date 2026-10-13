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
 */
export function CardArtPicker({ arts, selectedId, onSelect, direction = 'row', className }: CardArtPickerProps) {
  if (arts.length < 2) {
    return null
  }

  return (
    <div
      role="group"
      aria-label={t('search.arts.label')}
      className={cx('flex gap-1.5 overflow-auto overscroll-contain p-0.5 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden', direction === 'column' ? 'flex-col' : 'flex-row', className)}
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
