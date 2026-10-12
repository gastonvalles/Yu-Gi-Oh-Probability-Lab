import { LOCALES, getLocale, setLocale, t, type Locale } from '../../i18n'
import { cx } from './cx'

/** Cada idioma se nombra en su propio idioma: se reconoce aunque la página esté en el otro. */
const NAMES: Record<Locale, string> = { es: 'Español', en: 'English' }

/** ES | EN en la barra (y en el pie en mobile). Elegir otro idioma lo guarda y recarga la página. */
export function LanguageSwitcher({ className }: { className?: string }) {
  const current = getLocale()

  return (
    <div role="group" aria-label={t('common.language')} className={cx('flex items-center gap-0.5 rounded-control bg-lavender p-0.5', className)}>
      {LOCALES.map((locale) => (
        <button
          key={locale}
          type="button"
          lang={locale}
          aria-label={NAMES[locale]}
          aria-pressed={locale === current}
          title={NAMES[locale]}
          className={cx(
            'h-8 min-w-9 rounded-[0.55rem] px-2 text-micro font-semibold uppercase transition-colors duration-150 focus-visible:outline-none focus-visible:shadow-focus',
            locale === current ? 'bg-primary text-primary-foreground shadow-brand' : 'text-foreground/85 hover:bg-tint/10',
          )}
          onClick={() => setLocale(locale)}
        >
          {locale}
        </button>
      ))}
    </div>
  )
}
