import { LOCALES, getLocale, setLocale, t, type Locale } from '../../i18n'
import { cx } from './cx'

/** Cada idioma se nombra en su propio idioma: se reconoce aunque la página esté en el otro. */
const NAMES: Record<Locale, string> = { es: 'Español', en: 'English' } // i18n-ignore: cada idioma se nombra en el suyo

/**
 * ES | EN en la barra. Elegir otro idioma lo guarda y recarga la página. La variante `segmented` (el cajón del celular) ocupa todo el ancho, con el nombre completo
 * de cada idioma («Español | English») y botones de 44 px.
 */
export function LanguageSwitcher({ className, variant = 'chips' }: { className?: string; variant?: 'chips' | 'segmented' }) {
  const current = getLocale()
  const segmented = variant === 'segmented'

  return (
    <div role="group" aria-label={t('common.language')} className={cx(segmented ? 'grid w-full grid-cols-2 gap-1 rounded-control border border-border-strong p-1' : 'flex items-center gap-0.5 rounded-control bg-lavender p-0.5', className)}>
      {LOCALES.map((locale) => (
        <button
          key={locale}
          type="button"
          lang={locale}
          aria-label={NAMES[locale]}
          aria-pressed={locale === current}
          title={NAMES[locale]}
          className={cx(
            'transition-colors duration-150 focus-visible:outline-none focus-visible:shadow-focus',
            segmented ? 'h-11 rounded-tag px-2 text-body font-medium' : 'h-8 min-w-9 rounded-[0.55rem] px-2 text-micro font-semibold uppercase',
            locale === current ? (segmented ? 'bg-primary font-semibold text-primary-foreground' : 'bg-primary text-primary-foreground') : 'text-foreground/85 hover:bg-tint/10',
          )}
          onClick={() => setLocale(locale)}
        >
          {segmented ? NAMES[locale] : locale}
        </button>
      ))}
    </div>
  )
}
