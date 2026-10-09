import { cx } from './cx'
import { Icon, type IconName } from './Icon'

const LINKS: ReadonlyArray<{ href: string; label: string; icon: IconName }> = [
  { href: 'https://www.linkedin.com/in/gastonvalles/', label: 'LinkedIn', icon: 'linkedin' },
  { href: 'https://www.instagram.com/gaston_valles/', label: 'Instagram', icon: 'instagram' },
  { href: 'https://github.com/gastonvalles', label: 'GitHub', icon: 'github' },
]

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
          className="grid size-9 place-items-center rounded-control text-primary-soft/70 transition-colors duration-150 hover:bg-tint/10 hover:text-foreground focus-visible:outline-none focus-visible:shadow-focus"
        >
          <Icon name={link.icon} size={20} />
        </a>
      ))}
    </nav>
  )
}
