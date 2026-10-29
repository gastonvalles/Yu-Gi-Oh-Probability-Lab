import { t } from '../../i18n'
import { cx } from './cx'
import { Icon } from './Icon'
import { NumberField } from './NumberField'

interface StepperProps {
  value: number
  min: number
  max?: number
  onChange: (value: number) => void
  /** Nombre para lectores de pantalla ("Cantidad", "Mínimo de condiciones"). */
  label: string
  /** De a cuánto suman y restan los botones (1 si no se pide). */
  step?: number
  /** field: caja propia (lavanda, redondeada) · inline: sin caja, para ir dentro de otro control. */
  variant?: 'field' | 'inline'
  /** md: botones de 32 px (una fila de controles chicos; 44 con el dedo) · lg: botones de 44 px y el número más grande, para tocarlo con el dedo (las condiciones de una regla). */
  size?: 'md' | 'lg'
}

const STEP_BUTTON =
  'grid place-items-center text-muted transition-colors duration-150 hover:bg-tint/10 hover:text-foreground focus-visible:outline-none focus-visible:shadow-focus disabled:opacity-35 disabled:hover:bg-transparent'

const SIZE = {
  md: { button: 'w-8 pointer-coarse:w-11 pointer-coarse:min-h-11', icon: 14, field: 'w-10 text-body' },
  lg: { button: 'size-11', icon: 16, field: 'w-7 text-lead' },
} as const

/** Número con − y +: se toca sin apuntar fino (táctil) y también se escribe. */
export function Stepper({ value, min, max, onChange, label, step = 1, variant = 'field', size = 'md' }: StepperProps) {
  const atMin = value <= min
  const atMax = max !== undefined && value >= max
  const look = SIZE[size]

  return (
    <span role="group" aria-label={label} className={cx('inline-flex items-stretch overflow-hidden bg-input', variant === 'field' && 'rounded-control')}>
      <button type="button" className={cx(STEP_BUTTON, look.button)} aria-label={step === 1 ? t('shell.stepper.less') : t('shell.stepper.lessBy', { step })} disabled={atMin} onClick={() => onChange(Math.max(min, value - step))}>
        <Icon name="minus" size={look.icon} strokeWidth={2.5} />
      </button>
      <NumberField
        value={value}
        min={min}
        max={max}
        onChange={onChange}
        aria-label={label}
        className={cx('bg-transparent text-center font-semibold text-foreground tabular-nums outline-none [color-scheme:dark] focus:bg-input-hover focus-visible:shadow-focus', look.field)}
      />
      <button type="button" className={cx(STEP_BUTTON, look.button)} aria-label={step === 1 ? t('shell.stepper.more') : t('shell.stepper.moreBy', { step })} disabled={atMax} onClick={() => onChange(max === undefined ? value + step : Math.min(max, value + step))}>
        <Icon name="plus" size={look.icon} strokeWidth={2.5} />
      </button>
    </span>
  )
}
