import { formatInteger } from '../../app/utils'
import { cx } from './cx'

interface CopiesBadgeProps {
  copies: number
  /** overlay: sobre la esquina de la imagen (como en el buscador); inline: dentro del texto. */
  placement?: 'overlay' | 'inline'
  label?: string
}

/** Indicador de copias "×3", igual en toda la app. */
export function CopiesBadge({ copies, placement = 'inline', label }: CopiesBadgeProps) {
  return (
    <span
      className={cx(
        'inline-flex flex-none items-center rounded-full bg-primary px-1.5 py-px text-micro font-bold leading-4 text-primary-foreground tabular-nums',
        placement === 'overlay' && 'absolute -bottom-1 -right-1 z-1 shadow-[0_0_0_2px_var(--background)]',
      )}
      aria-label={label ?? `${formatInteger(copies)} copias`}>
      ×{formatInteger(copies)}
    </span>
  )
}
