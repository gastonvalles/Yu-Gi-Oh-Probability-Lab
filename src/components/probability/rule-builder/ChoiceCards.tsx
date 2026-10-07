import { cx } from '../../ui/cx'
import { TONE } from '../../ui/tone'

const CHOICE_RGB = {
  positive: TONE.success.rgb,
  negative: TONE.danger.rgb,
  neutral: TONE.brand.rgb,
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
    <div className="grid grid-cols-[repeat(auto-fit,minmax(9rem,1fr))] gap-2" role="radiogroup" aria-label={label}>
      {options.map((option) => (
        <button
          key={option.value}
          type="button"
          role="radio"
          aria-checked={value === option.value}
          aria-label={option.label}
          className={cx(
            'grid gap-0.5 rounded-control border px-3 py-2.5 text-left transition-[border-color,background-color] duration-150 focus-visible:outline-none focus-visible:shadow-focus',
            CHOICE_RGB[tone?.(option.value) ?? 'neutral'],
            value === option.value
              ? 'border-[rgb(var(--tone-rgb)/0.7)] bg-[rgb(var(--tone-rgb)/0.14)]'
              : 'border-border-subtle bg-white/3 hover:border-[rgb(var(--tone-rgb)/0.45)] hover:bg-white/5',
          )}
          onClick={() => onChange(option.value)}
        >
          <strong className="text-body font-semibold text-foreground">{option.label}</strong>
          <small className="text-micro text-muted">{option.description}</small>
        </button>
      ))}
    </div>
  )
}
