import { t } from '../../i18n'
import { cx } from '../ui/cx'
import { SiteCredit, SocialLinks } from '../ui/SocialLinks'
import { textLink } from '../ui/typography'

/**
 * Lo último del menú lateral (en lugar del pie de la app): las tres redes del autor arriba y, debajo, la privacidad y el aviso legal, con la autoría al final.
 * Va al final de lo que scrollea, como los vínculos de abajo del menú de YouTube: con el menú contraído se desvanece y no se puede tocar ni enfocar (conserva su alto: nada se corre).
 * Mide siempre lo que el menú abierto (13,5 rem): no se reacomoda mientras el ancho se anima.
 */
export function SidebarLegal({ className }: { className?: string }) {
  return (
    <div
      className={cx(
        'grid w-54 shrink-0 content-start gap-1 border-t border-nav-raised px-3 pb-4 pt-3 transition-[opacity,visibility] duration-150 group-data-[collapsed=true]/sidebar:invisible group-data-[collapsed=true]/sidebar:opacity-0 motion-reduce:transition-none',
        className,
      )}
    >
      <SocialLinks className="-ml-1" />
      <div className="flex flex-wrap items-center gap-x-3">
        <a href={t('shell.legal.page')} target="_blank" rel="noreferrer" className={cx('inline-flex min-h-9 w-fit items-center rounded-control text-micro pointer-coarse:min-h-11', textLink)}>
          {t('shell.legal.label')}
        </a>
      </div>
      <SiteCredit withDisclaimer />
    </div>
  )
}
