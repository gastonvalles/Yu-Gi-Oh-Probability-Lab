import { cx } from './cx'

export interface SegmentedOption<T extends string> {
  value: T
  label: string
  /** Texto secundario bajo la etiqueta (p. ej. "5 cartas · 57%"). */
  detail?: string
  /** Conteo a la derecha de la etiqueta. */
  count?: number
}

interface SegmentedProps<T extends string> {
  value: T
  onChange: (value: T) => void
  options: ReadonlyArray<SegmentedOption<T>>
  /** Nombre para lectores de pantalla. */
  label: string
  size?: 'sm' | 'md'
  /** Ocupa todo el ancho y reparte las opciones en partes iguales. */
  fullWidth?: boolean
  className?: string
}

/** Selector de una opción entre pocas (turno, tipo de regla, filtro): mismo control en toda la app. */
export function Segmented<T extends string>({ value, onChange, options, label, size = 'md', fullWidth = false, className }: SegmentedProps<T>) {
  return (
    <div
      role="radiogroup"
      aria-label={label}
      className={cx(
        'grid auto-cols-fr grid-flow-col gap-1 rounded-control border border-border-subtle bg-black/25 p-1',
        fullWidth ? 'w-full' : 'w-fit max-w-full',
        className,
      )}
    >
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
              'grid min-w-0 content-center justify-items-center gap-0.5 rounded-lg px-3 font-semibold text-muted transition-[background,color,box-shadow] duration-150 hover:bg-white/5 hover:text-foreground focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-primary/70 data-[active=true]:bg-primary/20 data-[active=true]:text-foreground data-[active=true]:shadow-[inset_0_0_0_1px_rgb(var(--primary-rgb)/0.55)]',
              size === 'md' ? 'min-h-10 text-small' : 'min-h-8 text-caption',
              option.detail && 'py-1.5',
            )}
            onClick={() => onChange(option.value)}
          >
            <span className="flex items-center gap-1.5 whitespace-nowrap">
              {option.label}
              {option.count !== undefined ? <span className="text-micro font-semibold text-soft tabular-nums">{option.count}</span> : null}
            </span>
            {option.detail ? <span className="whitespace-nowrap text-micro font-medium text-soft tabular-nums">{option.detail}</span> : null}
          </button>
        )
      })}
    </div>
  )
}
