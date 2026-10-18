import { formatInteger } from '../../app/utils'
import { t } from '../../i18n'
import { Icon } from '../ui/Icon'
import { cx } from '../ui/cx'

interface SearchFiltersToggleProps {
  open: boolean
  /** Cuántos filtros hay puestos: se dice en una insignia sobre el botón (y el botón se pinta de violeta aunque esté cerrado). */
  activeCount: number
  onToggle: () => void
  /** El tamaño lo da el que lo usa (`size-10` en escritorio, `size-11` en el celular). */
  className: string
}

/** El botón que abre el cajón de filtros, al lado del campo de búsqueda (el mismo en escritorio y en el celular): un ícono con la cuenta de filtros puestos. */
export function SearchFiltersToggle({ open, activeCount, onToggle, className }: SearchFiltersToggleProps) {
  return (
    <button
      type="button"
      title={t('search.filters.title')}
      aria-haspopup="dialog"
      aria-expanded={open}
      className={cx(
        'relative grid shrink-0 place-items-center rounded-control border text-foreground focus-visible:outline-none focus-visible:shadow-focus',
        open || activeCount > 0 ? 'border-primary/55 bg-primary/20' : 'border-border-subtle bg-surface-raised',
        className,
      )}
      onClick={onToggle}
    >
      <Icon name="sliders" />
      <span className="sr-only">{t('search.filters.title')}</span>
      {activeCount > 0 ? (
        <span className="absolute -right-1.5 -top-1.5 grid h-4.5 min-w-4.5 place-items-center rounded-full bg-primary px-1 text-micro font-bold text-white">{formatInteger(activeCount)}</span>
      ) : null}
    </button>
  )
}
