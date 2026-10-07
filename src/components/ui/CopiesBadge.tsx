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
        'inline-flex flex-none items-center rounded-full bg-accent px-[0.34rem] py-[0.05rem] text-micro font-extrabold text-[#06140e] tabular-nums',
        placement === 'overlay' && 'absolute -bottom-[0.3rem] -right-[0.3rem] z-1',
      )}
      aria-label={label ?? `${formatInteger(copies)} copias`}>
      ×{formatInteger(copies)}
    </span>
  )
}
