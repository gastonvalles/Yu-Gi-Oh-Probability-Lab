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
  /** field: caja propia (lavanda, redondeada) · inline: sin caja, para ir dentro de otro control. */
  variant?: 'field' | 'inline'
}

const STEP_BUTTON =
  'grid w-8 place-items-center text-muted transition-colors duration-150 hover:bg-tint/10 hover:text-foreground focus-visible:outline-none focus-visible:shadow-focus disabled:opacity-35 disabled:hover:bg-transparent'

/** Número con − y +: se toca sin apuntar fino (táctil) y también se escribe. */
export function Stepper({ value, min, max, onChange, label, variant = 'field' }: StepperProps) {
  const atMin = value <= min
  const atMax = max !== undefined && value >= max

  return (
    <span role="group" aria-label={label} className={cx('inline-flex items-stretch overflow-hidden bg-input', variant === 'field' && 'rounded-control')}>
      <button type="button" className={STEP_BUTTON} aria-label={t('shell.stepper.less')} disabled={atMin} onClick={() => onChange(Math.max(min, value - 1))}>
        <Icon name="minus" size={14} strokeWidth={2.5} />
      </button>
      <NumberField
        value={value}
        min={min}
        max={max}
        onChange={onChange}
        aria-label={label}
        className="w-10 bg-transparent text-center text-body font-semibold text-foreground outline-none [color-scheme:dark] focus:bg-input-hover focus-visible:shadow-focus"
      />
      <button type="button" className={STEP_BUTTON} aria-label={t('shell.stepper.more')} disabled={atMax} onClick={() => onChange(max === undefined ? value + 1 : Math.min(max, value + 1))}>
        <Icon name="plus" size={14} strokeWidth={2.5} />
      </button>
    </span>
  )
}
