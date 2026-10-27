import { cx } from './cx'

interface SwitchProps {
  checked: boolean
  onChange: (checked: boolean) => void
  label: string
  /** md: 36 × 20 (una fila de ajustes) · lg: 44 × 26, el de una fila de 60 px que se toca con el dedo (las reglas del Lab). El toque mide 44 px en los dos. */
  size?: 'md' | 'lg'
  /** No se puede usar (por ejemplo, un navegador que no puede correr el duelo automático): se ve apagado y no se toca. Por qué, lo dice el texto de al lado. */
  disabled?: boolean
}

const SIZE = {
  md: { track: 'h-5 w-9 p-0.5', thumb: 'size-4', on: 'translate-x-4' },
  lg: { track: 'h-6.5 w-11 p-0.75', thumb: 'size-5', on: 'translate-x-4.5' },
} as const

const track = (checked: boolean, size: 'md' | 'lg') => cx('inline-flex shrink-0 items-center rounded-full transition-colors', SIZE[size].track, checked ? 'bg-info' : 'bg-tint/20')

function Thumb({ checked, size }: { checked: boolean; size: 'md' | 'lg' }) {
  return <span className={cx('pointer-events-none inline-block rounded-full transition-[transform,background-color]', SIZE[size].thumb, checked ? cx(SIZE[size].on, 'bg-info-foreground') : 'translate-x-0 bg-soft')} />
}

/** Lo que se ve del interruptor, sin ser un botón: para una fila que ya es el control (un `menuitemcheckbox` del menú ⋯ de la mesa dice su estado con `aria-checked`; un botón no va dentro de otro). */
export function SwitchMark({ checked, size = 'md' }: { checked: boolean; size?: 'md' | 'lg' }) {
  return (
    <span aria-hidden="true" className={track(checked, size)}>
      <Thumb checked={checked} size={size} />
    </span>
  )
}

/** Interruptor accesible (role="switch"); `label` es el nombre para lectores de pantalla. Encendido va en ámbar con el pulgar oscuro, como todo lo elegido. */
export function Switch({ checked, onChange, label, size = 'md', disabled = false }: SwitchProps) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      disabled={disabled}
      className={cx(
        // El ::before invisible agranda el área de toque a ~44 px sin cambiar el tamaño visual.
        'relative cursor-pointer before:absolute before:-inset-3 before:content-[""] focus-visible:outline-none focus-visible:shadow-focus disabled:cursor-default disabled:opacity-40',
        track(checked, size),
      )}
      onClick={() => onChange(!checked)}
    >
      <Thumb checked={checked} size={size} />
    </button>
  )
}
