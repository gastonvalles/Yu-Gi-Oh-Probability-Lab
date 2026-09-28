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
    <div className="rule-choice-group" role="radiogroup" aria-label={label}>
      {options.map((option) => (
        <button
          key={option.value}
          type="button"
          role="radio"
          aria-checked={value === option.value}
          aria-label={option.label}
          data-active={value === option.value ? 'true' : 'false'}
          data-tone={tone?.(option.value) ?? 'neutral'}
          className="rule-choice"
          onClick={() => onChange(option.value)}
        >
          <strong>{option.label}</strong>
          <small>{option.description}</small>
        </button>
      ))}
    </div>
  )
}
