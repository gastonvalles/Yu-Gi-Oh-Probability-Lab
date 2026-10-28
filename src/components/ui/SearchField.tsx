import { useRef } from 'react'

import { t } from '../../i18n'
import { cx, variants } from './cx'
import { Icon } from './Icon'
import { CloseButton } from './IconButton'
import { fieldSurface } from './surfaces'

interface SearchFieldProps {
  /** El nombre para lectores de pantalla: el campo no lleva rótulo a la vista (la lupa y el `placeholder` dicen qué es). */
  label: string
  value: string
  onChange: (value: string) => void
  /** Corto: lo que no entra a 360 px se corta con «…» (mejor «Deck, torneo o jugador» que una lista). */
  placeholder?: string
  /** field (por defecto): el campo de siempre, con el radio de los controles · pill: la píldora de 48 px de alto que encabeza una lista en el celular (el buscador arriba de los chips). */
  shape?: 'field' | 'pill'
  disabled?: boolean
  /** Del contenedor: dónde va y qué ancho tiene. */
  className?: string
  /** Del campo, sólo en `field`: alto y texto (por defecto, 36 px; 44 con el dedo). */
  inputClassName?: string
}

const input = variants({
  base: 'w-full text-ellipsis text-body [&::-webkit-search-cancel-button]:hidden disabled:cursor-not-allowed disabled:opacity-50',
  variants: {
    shape: { field: 'rounded-control pl-9', pill: 'h-12 rounded-full pl-11' },
  },
  defaults: { shape: 'field' },
})

/**
 * Un campo de búsqueda: siempre con la lupa a la izquierda, como todo lo que busca en la app (el buscador de cartas tiene el suyo, más grande),
 * y con una X para borrar lo escrito mientras haya algo (la del navegador va oculta: no se ve igual en todos y en el celular no está).
 *
 * - **Props:** `label` (nombre accesible), `value`/`onChange`, `placeholder`, `shape` (`field` | `pill`), `disabled`, `className`, `inputClassName` (sólo `field`).
 * - **Estados:** vacío (sin X) · con texto (X de 44 px con el dedo, que borra y vuelve al campo) · hover · foco (borde y halo de `field`) · deshabilitado.
 * - **Accesibilidad:** `type="search"` con `aria-label`; la X dice «Borrar texto». Nunca se enfoca solo al abrir algo con el dedo (`opensKeyboard`): se escribe al tocarlo.
 * - **Hacer:** un placeholder corto, que diga qué se busca. **No hacer:** un `<input type="search">` a mano, ni enfocarlo al entrar a una pantalla.
 * - **Usos:** Decks de torneo (arriba de los puestos), Expansiones (las cartas de un set), Banlists. La píldora, por ahora sólo en `/playground`: la estrena el piloto de Jugar.
 */
export function SearchField({ label, value, onChange, placeholder, shape = 'field', disabled, className, inputClassName = 'h-9 pointer-coarse:h-11' }: SearchFieldProps) {
  const inputRef = useRef<HTMLInputElement>(null)
  const pill = shape === 'pill'
  const clear = () => {
    onChange('')
    inputRef.current?.focus()
  }

  return (
    <div className={cx('relative block', className)}>
      <Icon name="search" size={pill ? 20 : 16} className={cx('pointer-events-none absolute top-1/2 -translate-y-1/2 text-soft', pill ? 'left-4' : 'left-3')} />
      <input
        ref={inputRef}
        type="search"
        aria-label={label}
        value={value}
        placeholder={placeholder}
        disabled={disabled}
        autoComplete="off"
        className={cx(fieldSurface, input({ shape }), value === '' ? (pill ? 'pr-4' : 'pr-3') : pill ? 'pr-12' : 'pr-10', pill ? null : inputClassName)}
        onChange={(event) => onChange(event.target.value)}
      />
      {value === '' || disabled ? null : <CloseButton size={pill ? 'md' : 'sm'} aria-label={t('search.clearText')} className="absolute right-0.5 top-1/2 -translate-y-1/2" onClick={clear} />}
    </div>
  )
}
