import { t } from '../../i18n'
import { cx } from './cx'
import { Icon, type IconName } from './Icon'

const AUTHOR = 'Gastón Valles' // i18n-ignore: nombre propio

const LINKS: ReadonlyArray<{ href: string; label: string; icon: IconName }> = [
  { href: 'https://www.linkedin.com/in/gastonvalles/', label: 'LinkedIn', icon: 'linkedin' },
  { href: 'https://www.instagram.com/gaston_valles/', label: 'Instagram', icon: 'instagram' },
  { href: 'https://github.com/gastonvalles', label: 'GitHub', icon: 'github' },
]

/** Los íconos de las redes (en el pie): blancos y sin fondo, como todo botón sin texto; al pasar el mouse se ponen violeta claro. */
const ICON_LINK = 'group grid size-9 place-items-center pointer-coarse:size-11 rounded-control text-white transition-[opacity,color] duration-150 hover:text-accent focus-visible:outline-none focus-visible:shadow-focus active:opacity-70'

/** La línea de autoría, discreta: en desktop sólo el ©, con el descargo en el tooltip; en mobile, completa. */
export function SiteCredit({ withDisclaimer = false, className }: { withDisclaimer?: boolean; className?: string }) {
  return (
    <p className={cx('m-0 text-micro text-soft', className)} title={withDisclaimer ? undefined : t('shell.disclaimer')}>
      © {new Date().getFullYear()} {AUTHOR}
      {withDisclaimer ? ` · ${t('shell.disclaimer')}` : null}
    </p>
  )
}

/** Las redes del autor, en el pie de la app. */
export function SocialLinks({ className, size = 'md' }: { className?: string; /** `lg`: botones de 44 px (el cajón del celular). */ size?: 'md' | 'lg' }) {
  return (
    <nav aria-label={t('shell.social.label')} className={cx('flex items-center gap-1', className)}>
      {LINKS.map((link) => (
        <a
          key={link.href}
          href={link.href}
          target="_blank"
          rel="noreferrer"
          aria-label={t('shell.social.link', { network: link.label })}
          title={link.label}
          className={cx(ICON_LINK, size === 'lg' && 'size-11')}
        >
          <Icon name={link.icon} size={size === 'lg' ? 22 : 20} />
        </a>
      ))}
    </nav>
  )
}
