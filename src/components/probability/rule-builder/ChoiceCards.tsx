import { cx } from '../../ui/cx'

const CHOICE_RGB = {
  positive: '[--lab-kind-rgb:var(--success-rgb)]',
  negative: '[--lab-kind-rgb:var(--danger-rgb)]',
  neutral: '[--lab-kind-rgb:var(--primary-rgb)]',
} as const

interface ChoiceOption<Value extends string> {
  value: Value
  label: string
  description: string
}

interface ChoiceCardsProps<Value extends string> {
  label: string
  value: Value
  options: ReadonlyArray<ChoiceOption<Value>>
  tone?: (value: Value) => 'positive' | 'negative' | 'neutral'
  onChange: (value: Value) => void
}

/** Grupo de opciones grandes con descripción: más claro que un toggle sin rótulo. */
export function ChoiceCards<Value extends string>({ label, value, options, tone, onChange }: ChoiceCardsProps<Value>) {
  return (
    <div className="grid grid-cols-[repeat(auto-fit,minmax(9rem,1fr))] gap-[0.45rem]" role="radiogroup" aria-label={label}>
      {options.map((option) => (
        <button
          key={option.value}
          type="button"
          role="radio"
          aria-checked={value === option.value}
          aria-label={option.label}
          className={cx(
            'grid gap-[0.15rem] rounded-[calc(var(--radius-panel)-0.2rem)] border px-[0.7rem] py-[0.55rem] text-left transition-[border-color,background] duration-150 focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-primary/70',
            CHOICE_RGB[tone?.(option.value) ?? 'neutral'],
            value === option.value
              ? 'border-[rgb(var(--lab-kind-rgb)/0.8)] bg-[rgb(var(--lab-kind-rgb)/0.12)]'
              : 'border-border bg-background/40 hover:border-[rgb(var(--lab-kind-rgb)/0.45)]',
          )}
          onClick={() => onChange(option.value)}
        >
          <strong className="text-[0.86rem] text-foreground">{option.label}</strong>
          <small className="text-[0.72rem] leading-[1.25] text-muted">{option.description}</small>
        </button>
      ))}
    </div>
  )
}
