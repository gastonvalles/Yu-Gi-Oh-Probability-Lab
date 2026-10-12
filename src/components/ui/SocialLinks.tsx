import { cx } from './cx'
import { Icon, type IconName } from './Icon'

const LINKS: ReadonlyArray<{ href: string; label: string; icon: IconName }> = [
  { href: 'https://www.linkedin.com/in/gastonvalles/', label: 'LinkedIn', icon: 'linkedin' },
  { href: 'https://www.instagram.com/gaston_valles/', label: 'Instagram', icon: 'instagram' },
  { href: 'https://github.com/gastonvalles', label: 'GitHub', icon: 'github' },
]

const DISCLAIMER = 'Sitio no oficial. Yu-Gi-Oh! es una marca de Konami.'

/** Los íconos de la derecha de la barra (y del pie en mobile): al pasar el mouse se iluminan como la pestaña activa de la barra: fondo lavanda, verde y resplandor. */
const ICON_LINK = 'group grid size-9 place-items-center rounded-control text-primary-soft/70 transition-colors duration-150 hover:bg-lavender hover:text-success focus-visible:outline-none focus-visible:shadow-focus'
const ICON_GLOW = 'transition-[filter] duration-150 group-hover:drop-shadow-[0_0_8px_rgb(var(--success-rgb)/0.55)]'

/** La línea de autoría, discreta: en desktop sólo el ©, con el descargo en el tooltip; en mobile, completa. */
export function SiteCredit({ withDisclaimer = false, className }: { withDisclaimer?: boolean; className?: string }) {
  return (
    <p className={cx('m-0 text-micro text-soft', className)} title={withDisclaimer ? undefined : DISCLAIMER}>
      © {new Date().getFullYear()} Gastón Valles
      {withDisclaimer ? ` · ${DISCLAIMER}` : null}
    </p>
  )
}

/** Las redes del autor: en desktop viven en la barra de arriba; en mobile, en el pie de la página. */
export function SocialLinks({ className }: { className?: string }) {
  return (
    <nav aria-label="Redes de Gastón Valles" className={cx('flex items-center gap-1', className)}>
      {LINKS.map((link) => (
        <a
          key={link.href}
          href={link.href}
          target="_blank"
          rel="noreferrer"
          aria-label={`Gastón Valles en ${link.label}`}
          title={link.label}
          className={ICON_LINK}
        >
          <Icon name={link.icon} size={20} className={ICON_GLOW} />
        </a>
      ))}
    </nav>
  )
}

/** Privacidad y aviso legal: una página estática aparte (public/privacidad.html), que se abre en otra pestaña como las redes. */
export function LegalLink() {
  return (
    <a href="/privacidad.html" target="_blank" rel="noreferrer" aria-label="Privacidad y aviso legal" title="Privacidad y aviso legal" className={ICON_LINK}>
      <Icon name="info" size={20} className={ICON_GLOW} />
    </a>
  )
}
