import { useId, useRef, useState } from 'react'

import { t } from '../../i18n'
import { cx } from './cx'
import { Icon } from './Icon'
import { field } from './surfaces'
import { overline } from './typography'

export interface MultiSelectOption {
  value: string
  label: string
}

interface MultiSelectProps {
  /** El nombre del filtro: se ve arriba del campo y es lo que anuncian los lectores de pantalla. */
  label: string
  options: readonly MultiSelectOption[]
  selected: readonly string[]
  onChange: (values: string[]) => void
  className?: string
}

/** Lo que dice el campo cerrado: un «Elegir» tenue sin nada elegido (no dice «Cualquiera»: parecería una opción marcada), los nombres si son uno o dos y la cuenta si son más. */
function summarize(chosen: readonly MultiSelectOption[]): string {
  if (chosen.length === 0) {
    return t('common.selectPlaceholder')
  }

  return chosen.length <= 2 ? chosen.map((option) => option.label).join(', ') : t('common.selectCount', { count: chosen.length })
}

/**
 * Un selector desplegable de elección múltiple, para un filtro con varios valores posibles: el campo cerrado dice qué hay elegido y, al tocarlo, se despliega la
 * lista de opciones con casillas (se pueden marcar varias; la lista queda abierta hasta cerrarla). Es un botón que despliega (`aria-expanded`) y casillas de
 * verdad: el teclado y los lectores de pantalla ya saben usarlas. Escape cierra la lista (y no lo que la contiene). Dentro de un grupo vale cualquiera de los
 * elegidos; combinar grupos lo decide quien lo usa.
 */
export function MultiSelect({ label, options, selected, onChange, className }: MultiSelectProps) {
  const [open, setOpen] = useState(false)
  const triggerRef = useRef<HTMLButtonElement>(null)
  const id = useId()
  const labelId = `${id}-label`
  const valueId = `${id}-value`
  const panelId = `${id}-panel`
  const chosen = options.filter((option) => selected.includes(option.value))

  return (
    <div
      className={cx('grid gap-1.5', className)}
      onKeyDown={(event) => {
        if (open && event.key === 'Escape') {
          event.stopPropagation()
          setOpen(false)
          triggerRef.current?.focus()
        }
      }}
    >
      <span id={labelId} className={overline}>
        {label}
      </span>
      <button
        ref={triggerRef}
        type="button"
        aria-expanded={open}
        aria-controls={panelId}
        aria-labelledby={`${labelId} ${valueId}`}
        className={cx(field, 'flex min-h-10 w-full items-center justify-between gap-2 px-3 text-left text-body aria-expanded:border-info/70 pointer-coarse:min-h-11')}
        onClick={() => setOpen((current) => !current)}
      >
        <span id={valueId} className={cx('min-w-0 flex-1 truncate', chosen.length === 0 ? 'text-muted' : 'font-semibold text-foreground')}>
          {summarize(chosen)}
        </span>
        <Icon name="chevron-down" size={18} className={cx('shrink-0 text-muted transition-transform duration-150 motion-reduce:transition-none', open && 'rotate-180')} />
      </button>

      {open ? (
        <div id={panelId} role="group" aria-labelledby={labelId} className="max-h-60 overflow-y-auto overscroll-contain rounded-control border border-border-subtle bg-input p-1 [scrollbar-width:thin]">
          {options.map((option) => (
            <label
              key={option.value}
              className="flex min-h-10 cursor-pointer items-center gap-3 rounded-tag px-2.5 text-body text-foreground transition-colors duration-150 hover:bg-tint/7 has-[:focus-visible]:shadow-focus pointer-coarse:min-h-11"
            >
              <input
                type="checkbox"
                className="size-4 shrink-0 cursor-pointer accent-info focus-visible:outline-none"
                checked={selected.includes(option.value)}
                onChange={() => onChange(selected.includes(option.value) ? selected.filter((value) => value !== option.value) : [...selected, option.value])}
              />
              {option.label}
            </label>
          ))}
        </div>
      ) : null}
    </div>
  )
}
