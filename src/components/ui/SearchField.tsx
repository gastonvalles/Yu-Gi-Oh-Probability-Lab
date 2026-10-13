import { cx } from './cx'
import { Icon } from './Icon'
import { field } from './surfaces'

interface SearchFieldProps {
  /** El nombre para lectores de pantalla: el campo no lleva rótulo a la vista (la lupa y el `placeholder` dicen qué es). */
  label: string
  value: string
  onChange: (value: string) => void
  placeholder?: string
  /** Del contenedor: dónde va y qué ancho tiene. */
  className?: string
  /** Del campo: alto y texto (por defecto, 36 px). */
  inputClassName?: string
}

/** Un campo de búsqueda: siempre con la lupa a la izquierda, como todo lo que busca en la app (el buscador de cartas tiene el suyo, más grande). */
export function SearchField({ label, value, onChange, placeholder, className, inputClassName = 'h-9' }: SearchFieldProps) {
  return (
    <label className={cx('relative block', className)}>
      <span className="sr-only">{label}</span>
      <Icon name="search" size={16} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-soft" />
      <input
        type="search"
        value={value}
        placeholder={placeholder}
        autoComplete="off"
        className={cx(field, 'w-full pl-9 pr-3 text-body [&::-webkit-search-cancel-button]:hidden', inputClassName)}
        onChange={(event) => onChange(event.target.value)}
      />
    </label>
  )
}
