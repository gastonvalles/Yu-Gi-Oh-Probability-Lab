import { useEffect, useState, type InputHTMLAttributes } from 'react'

interface NumberFieldProps extends Omit<InputHTMLAttributes<HTMLInputElement>, 'value' | 'onChange' | 'type' | 'min' | 'max'> {
  value: number
  min: number
  max?: number
  onChange: (value: number) => void
}

/**
 * Campo numérico que se puede vaciar mientras escribís: aplica el valor recién cuando
 * es válido y, si lo dejás vacío o fuera de rango, al salir vuelve al último valor.
 * Al enfocarlo selecciona el número para escribir encima directamente.
 */
export function NumberField({ value, min, max, onChange, onBlur, onFocus, ...inputProps }: NumberFieldProps) {
  const [text, setText] = useState(String(value))

  useEffect(() => {
    setText(String(value))
  }, [value])

  const parse = (raw: string): number | null => {
    if (!/^\d+$/.test(raw)) {
      return null
    }
    const parsed = Number(raw)
    return parsed >= min && (max === undefined || parsed <= max) ? parsed : null
  }

  return (
    <input
      {...inputProps}
      type="text"
      inputMode="numeric"
      pattern="[0-9]*"
      value={text}
      onFocus={(event) => {
        event.currentTarget.select()
        onFocus?.(event)
      }}
      onChange={(event) => {
        const raw = event.target.value.replace(/\D/g, '')
        setText(raw)
        const parsed = parse(raw)
        if (parsed !== null && parsed !== value) {
          onChange(parsed)
        }
      }}
      onBlur={(event) => {
        if (parse(text) === null) {
          setText(String(value))
        }
        onBlur?.(event)
      }}
    />
  )
}
