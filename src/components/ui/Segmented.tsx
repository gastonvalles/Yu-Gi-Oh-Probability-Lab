import { useId, type ReactNode } from 'react'

import { cx } from './cx'

export interface SegmentedOption<T extends string> {
  value: T
  label: string
  /** Texto secundario bajo la etiqueta (p. ej. "5 cartas · 57%"). */
  detail?: string
  /** El color del detalle mientras la opción no está elegida: un ▲/▼ que le conviene (verde) o no (rojo) a quien lo lee. Elegida, sigue el color de la opción. */
  detailTone?: 'success' | 'danger'
  /** El detalle en palabras para el lector de pantalla (un «▲7» solo no se entiende): va como descripción de la opción, sin cambiarle el nombre. */
  detailLabel?: string
  /** Conteo a la derecha de la etiqueta. */
  count?: number
  /** Color propio cuando está elegida (variante track): verde para lo bueno, rojo para lo malo. */
  tone?: 'success' | 'danger'
  /** Lo que va arriba de la etiqueta (variante lens: el anillo de esa opción). Es decorativo: lo que dice va en `ariaLabel`. */
  leading?: ReactNode
  /** Nombre para lectores de pantalla, si la opción dice más que su etiqueta (p. ej. «Yendo 1º: 78 de cada 100»). */
  ariaLabel?: string
}

const DETAIL_TONE = { success: 'font-semibold text-success-soft', danger: 'font-semibold text-danger-soft' } as const

/**
 * track: pista lavanda con la opción elegida en ámbar · chips: pastillas sueltas · scroll: las mismas pastillas en una sola fila que no se parte (va en un `ScrollRow`) ·
 * cards: tarjetas (como las fechas del diseño) · lens: la pista lavanda con una tarjeta por opción y su anillo arriba (la lente del Lab: Promedio / Yendo 1º / Yendo 2º). Lo elegido es ámbar, como en toda la app (el violeta es de los fondos y de la acción principal): en la pista y las pastillas,
 * relleno ámbar con el texto oscuro; en `cards`, el borde y el texto ámbar.
 */
type SegmentedVariant = 'track' | 'chips' | 'scroll' | 'cards' | 'lens'

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
  /** Opciones de relleno chico y en un solo renglón: para una pista que comparte la fila con otros controles (Tiene | No tiene en una condición de regla). */
  dense?: boolean
  className?: string
}

const GROUP: Record<SegmentedVariant, string> = {
  track: 'grid auto-cols-fr grid-flow-col gap-1 rounded-control bg-lavender p-1',
  chips: 'flex flex-wrap gap-2',
  scroll: 'flex gap-2',
  cards: 'grid auto-cols-fr grid-flow-col gap-2',
  lens: 'grid auto-cols-fr grid-flow-col gap-1 rounded-card bg-lavender p-1',
}

/** Opción elegida con color propio (verde / rojo) en lugar del ámbar de lo elegido. */
const TONE_ON = {
  success: 'bg-success-solid text-white shadow-[0_6px_16px_rgb(var(--success-rgb)/0.3)]',
  danger: 'bg-danger text-white shadow-[0_6px_16px_rgb(var(--danger-rgb)/0.35)]',
} as const

/** Lo elegido: ámbar con el texto oscuro (sin hover: una opción elegida no se apaga al tocarla). */
const ON = 'bg-info text-info-foreground'

const ITEM: Record<SegmentedVariant, { base: string; on: string; off: string }> = {
  track: {
    base: 'rounded-lg px-3',
    on: ON,
    off: 'text-foreground/85 hover:bg-tint/10',
  },
  chips: {
    base: 'rounded-control px-4',
    on: ON,
    off: 'bg-lavender text-foreground hover:bg-lavender-hover',
  },
  scroll: {
    base: 'shrink-0 rounded-control px-4',
    on: ON,
    off: 'bg-lavender text-foreground hover:bg-lavender-hover',
  },
  cards: {
    base: 'rounded-card border px-3',
    // Una tarjeta elegida dice su estado con el borde (regla G.1 de docs/ux-ui-guidelines.md, como el ganador de Comparar), en ámbar y con el texto ámbar:
    // rellena de ámbar era lo más brillante de la pantalla y le ganaba al número que decide (el anillo del Lab), y teñida se ve marrón (como en `MatSnapshot`).
    on: 'border-info bg-card-background text-info-soft',
    off: 'border-border-subtle bg-card-background text-foreground hover:bg-surface-hover',
  },
  lens: {
    base: 'min-h-14 rounded-control px-1 py-1.5 text-body',
    // La elegida se enmarca en ámbar (no se rellena: el relleno era lo más brillante y le ganaba al número grande) y no repite su anillo: su número es el grande.
    on: 'text-info-soft inset-ring-2 inset-ring-info',
    off: 'text-foreground hover:bg-tint/10',
  },
}

/** Selector de una opción entre pocas (turno, tipo de regla, filtro): mismo control en toda la app. */
export function Segmented<T extends string>({ value, onChange, options, label, variant = 'track', size = 'md', fullWidth = false, dense = false, className }: SegmentedProps<T>) {
  const look = ITEM[variant]
  const id = useId()

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
            aria-label={option.ariaLabel ?? option.label}
            aria-describedby={option.detailLabel ? `${id}-${option.value}` : undefined}
            data-active={active ? 'true' : 'false'}
            className={cx(
              'grid min-w-0 content-center justify-items-center gap-0.5 font-semibold transition-[background-color,color,box-shadow] duration-150 focus-visible:outline-none focus-visible:shadow-focus',
              dense ? 'rounded-lg px-1' : look.base,
              active ? (option.tone && variant === 'track' ? TONE_ON[option.tone] : look.on) : look.off,
              variant === 'lens' ? null : size === 'md' ? 'min-h-10 text-body pointer-coarse:min-h-11' : 'min-h-9 text-micro pointer-coarse:min-h-11',
              variant === 'cards' && size === 'md' && 'py-2',
            )}
            onClick={() => onChange(option.value)}
          >
            {option.leading ? <span className="mb-0.5 grid place-items-center" aria-hidden="true">{option.leading}</span> : null}
            <span className={cx('flex items-center justify-center gap-1.5 text-center', dense ? 'whitespace-nowrap' : 'max-[520px]:whitespace-normal min-[520px]:whitespace-nowrap')}>
              {option.label}
              {option.count !== undefined ? <span className="text-micro font-semibold tabular-nums opacity-70">{option.count}</span> : null}
            </span>
            {option.detail ? (
              // Elegida, el detalle sigue el color del texto de la opción, un poco más tenue (oscuro sobre el ámbar, ámbar en la tarjeta, blanco sobre el verde o el rojo).
              <span aria-hidden={option.detailLabel ? true : undefined} className={cx('whitespace-nowrap text-micro tabular-nums', active ? 'font-normal opacity-80' : option.detailTone ? DETAIL_TONE[option.detailTone] : 'font-normal text-soft')}>
                {option.detail}
              </span>
            ) : null}
            {option.detailLabel ? (
              <span id={`${id}-${option.value}`} className="sr-only">
                {option.detailLabel}
              </span>
            ) : null}
          </button>
        )
      })}
    </div>
  )
}
