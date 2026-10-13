import { t } from '../../i18n'
import { cx } from '../ui/cx'
import { SiteCredit, SocialLinks } from '../ui/SocialLinks'

/** Abajo de toda pantalla: la autoría y el aviso de que el sitio no es oficial, las redes del autor y la página de privacidad. */
export function AppFooter({ className }: { className?: string }) {
  return (
    <footer className={cx('flex shrink-0 flex-wrap items-center justify-between gap-x-6 gap-y-2 border-t border-border-subtle px-gutter py-3 min-[1101px]:px-6', className)}>
      <SiteCredit withDisclaimer className="max-w-prose" />
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
        <SocialLinks />
        <a
          href={t('shell.legal.page')}
          target="_blank"
          rel="noreferrer"
          className="rounded-control px-1 text-micro text-muted underline-offset-2 transition-colors duration-150 hover:text-foreground hover:underline focus-visible:outline-none focus-visible:shadow-focus"
        >
          {t('shell.legal.label')}
        </a>
      </div>
    </footer>
  )
}
