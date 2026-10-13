import { t } from '../../i18n'
import { cx } from '../ui/cx'
import { SiteCredit, SocialLinks } from '../ui/SocialLinks'

/**
 * Abajo de toda pantalla: la autoría y el aviso de que el sitio no es oficial, las redes del autor y la página de privacidad.
 * Celular: todo centrado en una columna (las redes arriba, la autoría debajo y la privacidad al final). Escritorio: una sola línea,
 * con la autoría a la izquierda y las redes con la privacidad a la derecha (así el pie fijo del builder ocupa poco alto).
 */
export function AppFooter({ className }: { className?: string }) {
  return (
    <footer
      className={cx(
        'flex min-h-(--app-footer-height) shrink-0 flex-col items-center gap-y-1 border-t border-border-subtle px-gutter py-3 text-center',
        'min-[1101px]:flex-row min-[1101px]:flex-wrap min-[1101px]:justify-between min-[1101px]:gap-x-6 min-[1101px]:gap-y-2 min-[1101px]:px-6 min-[1101px]:text-left',
        className,
      )}
    >
      {/* En el celular el texto es una columna angosta y balanceada: queda entre la mascota (abajo a la izquierda) y los botones flotantes (abajo a la derecha) y no lo tapan. */}
      <SiteCredit withDisclaimer className="order-2 max-w-[11rem] text-balance min-[1101px]:order-none min-[1101px]:max-w-prose" />
      {/* En el celular el grupo "desaparece" (`contents`) para que sus piezas se ordenen solas en la columna; en escritorio es una fila. */}
      <div className="contents min-[1101px]:flex min-[1101px]:flex-wrap min-[1101px]:items-center min-[1101px]:gap-x-3 min-[1101px]:gap-y-1">
        <SocialLinks className="order-1 min-[1101px]:order-none" />
        <a
          href={t('shell.legal.page')}
          target="_blank"
          rel="noreferrer"
          className="order-3 rounded-control px-1 text-micro text-muted underline-offset-2 transition-colors duration-150 hover:text-foreground hover:underline focus-visible:outline-none focus-visible:shadow-focus min-[1101px]:order-none"
        >
          {t('shell.legal.label')}
        </a>
      </div>
    </footer>
  )
}
