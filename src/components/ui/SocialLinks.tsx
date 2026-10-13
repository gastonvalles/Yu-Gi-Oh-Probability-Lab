import { t } from '../../i18n'
import { cx } from './cx'
import { Icon, type IconName } from './Icon'

const AUTHOR = 'Gastón Valles' // i18n-ignore: nombre propio

const LINKS: ReadonlyArray<{ href: string; label: string; icon: IconName }> = [
  { href: 'https://www.linkedin.com/in/gastonvalles/', label: 'LinkedIn', icon: 'linkedin' },
  { href: 'https://www.instagram.com/gaston_valles/', label: 'Instagram', icon: 'instagram' },
  { href: 'https://github.com/gastonvalles', label: 'GitHub', icon: 'github' },
]

/** Los íconos de las redes (en el pie): al pasar el mouse se iluminan como el destino abierto del menú: fondo lavanda, verde y resplandor. */
const ICON_LINK = 'group grid size-9 place-items-center rounded-control text-primary-soft/70 transition-colors duration-150 hover:bg-lavender hover:text-success focus-visible:outline-none focus-visible:shadow-focus'
const ICON_GLOW = 'transition-[filter] duration-150 group-hover:drop-shadow-[0_0_8px_rgb(var(--success-rgb)/0.55)]'

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
export function SocialLinks({ className }: { className?: string }) {
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
          className={ICON_LINK}
        >
          <Icon name={link.icon} size={20} className={ICON_GLOW} />
        </a>
      ))}
    </nav>
  )
}
