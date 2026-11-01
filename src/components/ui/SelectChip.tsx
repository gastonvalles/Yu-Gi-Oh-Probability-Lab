import { cx } from './cx'
import { Icon, type IconName } from './Icon'

export interface SelectChipOption<T extends string> {
  value: T
  label: string
  /** Lo que se ve en el chip sin su nombre (`showLabel` apagado), si es más corto que `label`: «Código» en vez de «Por código». El selector y el lector dicen `label`. */
  short?: string
}

interface SelectChipProps<T extends string> {
  value: T
  onChange: (value: T) => void
  options: ReadonlyArray<SelectChipOption<T>>
  /** El nombre de la elección («Región», «Orden»): va siempre en el nombre accesible («Región: TCG») y, con `showLabel`, también a la vista. */
  label: string
  showLabel?: boolean
  icon?: IconName
  size?: 'sm' | 'md'
  /** outline: borde fino y sin fondo (en un encabezado o al lado de un buscador) · filled: el fondo de los campos, sin borde (al lado de un `Stepper`, como en una condición). */
  variant?: 'outline' | 'filled'
  disabled?: boolean
  className?: string
}

const SIZE = {
  // md crece a 44 px con el dedo, como `Segmented` y `SearchField` (comparte fila con el buscador); sm no: se toca en 44 por el `<select>`, que crece solo.
  md: { chip: 'h-10 gap-1.5 pl-3 pr-2.5 text-body pointer-coarse:h-11', icon: 16 },
  sm: { chip: 'h-8 gap-1 pl-2.5 pr-2 text-micro', icon: 14 },
} as const

const VARIANT = {
  outline: { base: 'border border-tint/12', hover: 'hover:border-tint/20 hover:bg-tint/10' },
  filled: { base: 'bg-input', hover: 'hover:bg-input-hover' },
} as const

/**
 * Un orden o una región: una elección de fondo que casi no se toca y no recorta nada, así que no merece una barra de pastillas. Es una pastilla con su valor y una
 * flecha, con un `<select>` nativo transparente encima (el truco del navegador de fechas de Banlists): el teclado, el lector de pantalla y el selector del teléfono
 * vienen gratis.
 *
 * - **Props:** `value`/`onChange`, `options` (`value`, `label`, `short?`), `label` (el nombre), `showLabel` (a la vista «Orden Por código»; si no, sólo el valor, o su
 *   `short`), `icon`, `size`, `variant`, `disabled`, `className`.
 * - **Variantes:** `md` (40 px; 44 con el dedo) y `sm` (32 px, que con el dedo se toca en 44: el `<select>` crece por arriba y por abajo, la pastilla no). `outline` y
 *   `filled`.
 * - **Estados:** normal · hover (tinte) · foco con teclado (`shadow-focus`) · apagado (tenue y sin hover). Elegir no tiene estado propio: el valor es el estado.
 * - **Accesibilidad:** el `<select>` es un `combobox` que se llama «{label}: {valor}»; lo de la vista va `aria-hidden` para no leerse dos veces.
 * - **Hacer:** un orden, una región, la palabra con la que empieza una frase («Tiene ▾ · 1 · Starter»). **No hacer:** un filtro que recorta (eso es una fila de
 *   pastillas) ni un ajuste de una hoja (eso es una fila con rótulo); nunca dos seguidos sin nada entre medio.
 * - **Usos:** el orden de las cartas de una expansión, «Tiene / No tiene» de una condición del Lab y la región de Tier lists, Torneos y Banlists.
 */
export function SelectChip<T extends string>({ value, onChange, options, label, showLabel = false, icon, size = 'md', variant = 'outline', disabled = false, className }: SelectChipProps<T>) {
  const current = options.find((option) => option.value === value) ?? options[0]!
  const look = SIZE[size]
  const tone = VARIANT[variant]

  return (
    <span
      className={cx(
        'relative inline-flex max-w-full shrink-0 items-center whitespace-nowrap rounded-control font-semibold text-foreground transition-[background-color,border-color,box-shadow] duration-150 has-[:focus-visible]:shadow-focus',
        look.chip,
        tone.base,
        disabled ? 'opacity-40' : tone.hover,
        className,
      )}
    >
      {icon ? <Icon name={icon} size={look.icon} className="shrink-0 text-muted" /> : null}
      <span aria-hidden="true" className="min-w-0 truncate">
        {showLabel ? <span className="mr-1.5 font-normal text-soft">{label}</span> : null}
        {showLabel ? current.label : (current.short ?? current.label)}
      </span>
      <Icon name="chevron-down" size={look.icon} className="shrink-0 text-muted" />
      <select
        className="absolute inset-x-0 top-1/2 h-full w-full -translate-y-1/2 cursor-pointer appearance-none rounded-control opacity-0 [color-scheme:dark] focus-visible:outline-none disabled:cursor-not-allowed pointer-coarse:h-11 [&_option]:bg-secondary [&_option]:text-foreground"
        value={current.value}
        aria-label={`${label}: ${current.label}`}
        disabled={disabled}
        onChange={(event) => onChange(event.target.value as T)}
      >
        {options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
    </span>
  )
}
