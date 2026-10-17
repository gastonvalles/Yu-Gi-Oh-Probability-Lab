import { useRef } from 'react'

import { t } from '../../i18n'
import { cx } from './cx'
import { Icon } from './Icon'
import { CloseButton } from './IconButton'
import { field } from './surfaces'

interface SearchFieldProps {
  /** El nombre para lectores de pantalla: el campo no lleva rótulo a la vista (la lupa y el `placeholder` dicen qué es). */
  label: string
  value: string
  onChange: (value: string) => void
  placeholder?: string
  /** Del contenedor: dónde va y qué ancho tiene. */
  className?: string
  /** Del campo: alto y texto (por defecto, 36 px; 44 con el dedo). */
  inputClassName?: string
}

/**
 * Un campo de búsqueda: siempre con la lupa a la izquierda, como todo lo que busca en la app (el buscador de cartas tiene el suyo, más grande),
 * y con una X para borrar lo escrito mientras haya algo (la del navegador va oculta: no se ve igual en todos y en el celular no está).
 */
export function SearchField({ label, value, onChange, placeholder, className, inputClassName = 'h-9 pointer-coarse:h-11' }: SearchFieldProps) {
  const inputRef = useRef<HTMLInputElement>(null)
  const clear = () => {
    onChange('')
    inputRef.current?.focus()
  }

  return (
    <div className={cx('relative block', className)}>
      <Icon name="search" size={16} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-soft" />
      <input
        ref={inputRef}
        type="search"
        aria-label={label}
        value={value}
        placeholder={placeholder}
        autoComplete="off"
        className={cx(field, 'w-full pl-9 text-body [&::-webkit-search-cancel-button]:hidden', value === '' ? 'pr-3' : 'pr-10', inputClassName)}
        onChange={(event) => onChange(event.target.value)}
      />
      {value === '' ? null : <CloseButton size="sm" aria-label={t('search.clearText')} className="absolute right-0.5 top-1/2 -translate-y-1/2" onClick={clear} />}
    </div>
  )
}
