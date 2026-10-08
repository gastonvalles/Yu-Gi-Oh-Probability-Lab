import { cx } from './cx'

export interface SegmentedOption<T extends string> {
  value: T
  label: string
  /** Texto secundario bajo la etiqueta (p. ej. "5 cartas · 57%"). */
  detail?: string
  /** Conteo a la derecha de la etiqueta. */
  count?: number
}

/** track: pista lavanda con la opción elegida en violeta · chips: pastillas sueltas · cards: tarjetas (como las fechas del diseño). */
type SegmentedVariant = 'track' | 'chips' | 'cards'

interface SegmentedProps<T extends string> {
  value: T
  onChange: (value: T) => void
  options: ReadonlyArray<SegmentedOption<T>>
  /** Nombre para lectores de pantalla. */
  label: string
  variant?: SegmentedVariant
  size?: 'sm' | 'md'
  /** Color de la opción elegida: violeta de la marca (por defecto) o verde (ajustes que se prenden). */
  tone?: 'brand' | 'success'
  /** Ocupa todo el ancho y reparte las opciones en partes iguales. */
  fullWidth?: boolean
  className?: string
}

const GROUP: Record<SegmentedVariant, string> = {
  track: 'grid auto-cols-fr grid-flow-col gap-1 rounded-control bg-lavender p-1',
  chips: 'flex flex-wrap gap-2',
  cards: 'grid auto-cols-fr grid-flow-col gap-2',
}

const ITEM: Record<SegmentedVariant, { base: string; on: string; off: string }> = {
  track: {
    base: 'rounded-lg px-3',
    on: 'bg-primary text-primary-foreground shadow-brand',
    off: 'text-primary-soft hover:bg-primary/20',
  },
  chips: {
    base: 'rounded-control px-4',
    on: 'bg-primary text-primary-foreground shadow-brand',
    off: 'bg-lavender text-primary-soft hover:bg-primary/28',
  },
  cards: {
    base: 'rounded-card border px-3',
    on: 'border-transparent bg-primary text-primary-foreground shadow-brand',
    off: 'border-border-subtle bg-card-background text-foreground hover:bg-surface-hover',
  },
}

/** Opción elegida en verde (variante track). */
const SUCCESS_ON = 'bg-success text-background shadow-[0_6px_16px_rgb(var(--success-rgb)/0.3)]'

/** Selector de una opción entre pocas (turno, tipo de regla, filtro): mismo control en toda la app. */
export function Segmented<T extends string>({ value, onChange, options, label, variant = 'track', size = 'md', tone = 'brand', fullWidth = false, className }: SegmentedProps<T>) {
  const look = ITEM[variant]

  return (
    <div role="radiogroup" aria-label={label} className={cx(GROUP[variant], fullWidth ? 'w-full' : 'w-fit max-w-full', className)}>
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
              active ? (tone === 'success' && variant === 'track' ? SUCCESS_ON : look.on) : look.off,
              size === 'md' ? 'min-h-10 text-body' : 'min-h-9 text-micro',
              variant === 'cards' && size === 'md' && 'py-2',
            )}
            onClick={() => onChange(option.value)}
          >
            <span className="flex items-center gap-1.5 whitespace-nowrap">
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
