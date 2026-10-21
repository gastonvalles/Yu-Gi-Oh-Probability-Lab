interface SwitchProps {
  checked: boolean
  onChange: (checked: boolean) => void
  label: string
}

/** Interruptor accesible (role="switch"); `label` es el nombre para lectores de pantalla. Encendido va en ámbar con el pulgar oscuro, como todo lo elegido. */
export function Switch({ checked, onChange, label }: SwitchProps) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      className={[
        // El ::before invisible agranda el área de toque a ~44 px sin cambiar el tamaño visual.
        'relative inline-flex h-5 w-9 shrink-0 cursor-pointer items-center rounded-full p-0.5 transition-colors before:absolute before:-inset-3 before:content-[""] focus-visible:outline-none focus-visible:shadow-focus',
        checked ? 'bg-info' : 'bg-tint/20',
      ].join(' ')}
      onClick={() => onChange(!checked)}
    >
      <span
        className={[
          'pointer-events-none inline-block size-4 rounded-full transition-[transform,background-color]',
          checked ? 'translate-x-4 bg-info-foreground' : 'translate-x-0 bg-soft',
        ].join(' ')}
      />
    </button>
  )
}
