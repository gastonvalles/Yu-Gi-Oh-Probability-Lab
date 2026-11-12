import { t } from '../../i18n'
import { PALETTES, setPalette, usePalette, type Palette } from '../../app/palette'
import { cx } from './cx'

const LABELS: Record<Palette, () => string> = { carbon: () => t('common.palette.carbon'), indigo: () => t('common.palette.indigo') }

/**
 * Colores: Carbón | Índigo, hermano de `LanguageSwitcher` (mismas dos variantes). Cambia al instante y se recuerda (`app/palette.ts`). La variante `segmented` (el cajón del celular y
 * el menú lateral) ocupa todo el ancho, con botones de 44 px; `chips` es la de la barra de escritorio. Vive en el ☰ de la app y, para el duelo, como fila de ⚙ Opciones.
 */
export function PaletteSwitcher({ className, variant = 'chips' }: { className?: string; variant?: 'chips' | 'segmented' }) {
  const current = usePalette()
  const segmented = variant === 'segmented'

  return (
    <div role="group" aria-label={t('common.palette')} className={cx(segmented ? 'grid w-full grid-cols-2 gap-1 rounded-control border border-border-strong p-1' : 'flex items-center gap-0.5 rounded-control bg-lavender p-0.5', className)}>
      {PALETTES.map((palette) => (
        <button
          key={palette}
          type="button"
          aria-pressed={palette === current}
          className={cx(
            'transition-colors duration-150 focus-visible:outline-none focus-visible:shadow-focus motion-reduce:transition-none',
            segmented ? 'h-11 rounded-tag px-2 text-body font-medium' : 'h-8 rounded-[0.55rem] px-2.5 text-micro font-semibold pointer-coarse:h-11 pointer-coarse:min-w-11',
            // La elegida, en violeta con el texto blanco: como todo lo elegido (el idioma, Segmented, los chips).
            palette === current ? (segmented ? 'bg-primary font-semibold text-white' : 'bg-primary text-white') : 'text-foreground/85 hover:bg-tint/10',
          )}
          onClick={() => setPalette(palette)}
        >
          {LABELS[palette]()}
        </button>
      ))}
    </div>
  )
}
