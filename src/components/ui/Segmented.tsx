import { cx } from './cx'

export interface SegmentedOption<T extends string> {
  value: T
  label: string
  /** Texto secundario bajo la etiqueta (p. ej. "5 cartas · 57%"). */
  detail?: string
  /** Conteo a la derecha de la etiqueta. */
  count?: number
  /** Color propio cuando está elegida (variante track): verde para lo bueno, rojo para lo malo. */
  tone?: 'success' | 'danger'
}

/** track: pista lavanda con la opción elegida en violeta · chips: pastillas sueltas · scroll: las mismas pastillas en una sola fila que no se parte (va en un `ScrollRow`) · cards: tarjetas (como las fechas del diseño). */
type SegmentedVariant = 'track' | 'chips' | 'scroll' | 'cards'

interface SegmentedProps<T extends string> {
  value: T
  onChange: (value: T) => void
  options: ReadonlyArray<SegmentedOption<T>>
  /** Nombre para lectores de pantalla. */
  label: string
  variant?: SegmentedVariant
  size?: 'sm' | 'md'
  /** Ocupa todo el ancho y reparte las opciones en partes iguales. */
  fullWidth?: boolean
  className?: string
}

const GROUP: Record<SegmentedVariant, string> = {
  track: 'grid auto-cols-fr grid-flow-col gap-1 rounded-control bg-lavender p-1',
  chips: 'flex flex-wrap gap-2',
  scroll: 'flex gap-2',
  cards: 'grid auto-cols-fr grid-flow-col gap-2',
}

/** Opción elegida con color propio (verde / rojo) en lugar del violeta de la marca. */
const TONE_ON = {
  success: 'bg-success text-background shadow-[0_6px_16px_rgb(var(--success-rgb)/0.3)]',
  danger: 'bg-danger text-white shadow-[0_6px_16px_rgb(var(--danger-rgb)/0.35)]',
} as const

const ITEM: Record<SegmentedVariant, { base: string; on: string; off: string }> = {
  track: {
    base: 'rounded-lg px-3',
    on: 'bg-primary text-primary-foreground',
    off: 'text-foreground/85 hover:bg-tint/10',
  },
  chips: {
    base: 'rounded-control px-4',
    on: 'bg-primary text-primary-foreground',
    off: 'bg-lavender text-foreground hover:bg-lavender-hover',
  },
  scroll: {
    base: 'shrink-0 rounded-control px-4',
    on: 'bg-primary text-primary-foreground',
    off: 'bg-lavender text-foreground hover:bg-lavender-hover',
  },
  cards: {
    base: 'rounded-card border px-3',
    on: 'border-transparent bg-primary text-primary-foreground',
    off: 'border-border-subtle bg-card-background text-foreground hover:bg-surface-hover',
  },
}

/** Selector de una opción entre pocas (turno, tipo de regla, filtro): mismo control en toda la app. */
export function Segmented<T extends string>({ value, onChange, options, label, variant = 'track', size = 'md', fullWidth = false, className }: SegmentedProps<T>) {
  const look = ITEM[variant]

  return (
    <div role="radiogroup" aria-label={label} className={cx(GROUP[variant], variant === 'scroll' ? 'w-max' : fullWidth ? 'w-full' : 'w-fit max-w-full', className)}>
      {options.map((option) => {
        const active = option.value === value

        return (
          <button
            key={option.value}
            type="button"
            role="radio"
            aria-checked={active}
            aria-label={option.label}
            data-active={active ? 'true' : 'false'}
            className={cx(
              'grid min-w-0 content-center justify-items-center gap-0.5 font-semibold transition-[background-color,color,box-shadow] duration-150 focus-visible:outline-none focus-visible:shadow-focus',
              look.base,
              active ? (option.tone && variant === 'track' ? TONE_ON[option.tone] : look.on) : look.off,
              size === 'md' ? 'min-h-10 text-body pointer-coarse:min-h-11' : 'min-h-9 text-micro pointer-coarse:min-h-11',
              variant === 'cards' && size === 'md' && 'py-2',
            )}
            onClick={() => onChange(option.value)}
          >
            <span className="flex items-center justify-center gap-1.5 text-center max-[519px]:whitespace-normal min-[520px]:whitespace-nowrap">
              {option.label}
              {option.count !== undefined ? <span className="text-micro font-semibold tabular-nums opacity-70">{option.count}</span> : null}
            </span>
            {option.detail ? (
              <span className={cx('whitespace-nowrap text-micro font-normal tabular-nums', active ? 'text-primary-foreground/80' : 'text-soft')}>{option.detail}</span>
            ) : null}
          </button>
        )
      })}
    </div>
  )
}
