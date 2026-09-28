import { formatInteger } from '../../app/utils'

interface CopiesBadgeProps {
  copies: number
  /** overlay: sobre la esquina de la imagen (como en el buscador); inline: dentro del texto. */
  placement?: 'overlay' | 'inline'
  label?: string
}

/** Indicador de copias "×3", igual en toda la app. */
export function CopiesBadge({ copies, placement = 'inline', label }: CopiesBadgeProps) {
  return (
    <span className="copies-badge" data-placement={placement} aria-label={label ?? `${formatInteger(copies)} copias`}>
      ×{formatInteger(copies)}
    </span>
  )
}
