import { cx } from '../ui/cx'
import { t } from '../../i18n'
import { RAIL_LABEL } from './rail'

/**
 * La marca de la app: el anillo con una carta y el nombre, YGO·Ultra·Lab (Ultra en ámbar), con el aviso de sitio no oficial. En el menú lateral
 * contraído el nombre se desvanece y el menú lo recorta (no se quita: así el logo no se mueve y el ancho se anima sin saltos).
 */
export function AppBrand({ className }: { className?: string }) {
  return (
    <div className={cx('flex min-w-0 items-center gap-2.5', className)}>
      <svg aria-hidden="true" viewBox="0 0 28 28" fill="none" className="size-9 shrink-0">
        <circle cx="14" cy="14" r="11" stroke="var(--nav-raised)" strokeWidth="3" />
        <path d="M14 3A11 11 0 1 1 3 14" stroke="var(--nav-active)" strokeWidth="3" strokeLinecap="round" />
        <rect x="9.5" y="8" width="9" height="12" fill="var(--foreground)" transform="rotate(-12 14 14)" />
      </svg>
      <span className={cx('grid min-w-0 whitespace-nowrap leading-tight', RAIL_LABEL)}>
        <span className="truncate text-body font-bold tracking-[-0.01em] text-foreground">
          YGO<span className="text-nav-active">Ultra</span>Lab
        </span>
        <span className="text-micro text-muted">{t('shell.brand.unofficial')}</span>
      </span>
    </div>
  )
}
