interface SwitchProps {
  checked: boolean
  onChange: (checked: boolean) => void
  label: string
  disabled?: boolean
}

/** Interruptor accesible (role="switch"); `label` es el nombre para lectores de pantalla. */
export function Switch({ checked, onChange, label, disabled = false }: SwitchProps) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      disabled={disabled}
      className={[
        // El ::before invisible agranda el área de toque a ~44 px sin cambiar el tamaño visual.
        'relative inline-flex h-5 w-9 shrink-0 cursor-pointer items-center rounded-full p-0.5 transition-colors before:absolute before:-inset-3 before:content-[""] disabled:cursor-not-allowed disabled:opacity-50 focus-visible:outline-none focus-visible:shadow-focus',
        checked ? 'bg-success' : 'bg-tint/20',
      ].join(' ')}
      onClick={() => onChange(!checked)}
    >
      <span
        className={[
          'pointer-events-none inline-block size-4 rounded-full transition-[transform,background-color]',
          checked ? 'translate-x-4 bg-background' : 'translate-x-0 bg-soft',
        ].join(' ')}
      />
    </button>
  )
}
