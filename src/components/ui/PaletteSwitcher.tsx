import { t } from '../../i18n'
import { EFFECTS, setEffects, useEffects, type Effects } from '../../app/effects'
import { PALETTES, setPalette, usePalette, type Palette } from '../../app/palette'
import { cx } from './cx'

type Variant = 'chips' | 'segmented'

/**
 * Un ajuste de aspecto de dos opciones, hermano de `LanguageSwitcher` (mismas dos variantes): cambia al instante y se recuerda. La variante `segmented` (el cajón del celular y el menú
 * lateral) ocupa todo el ancho, con botones de 44 px; `chips` es la de la barra de escritorio (con `prefix`, el nombre del ajuste a la vista: «Livianos» solo no dice de qué).
 */
function Choice<T extends string>({ label, prefix, options, current, names, onPick, variant, className }: { label: string; prefix?: string; options: readonly T[]; current: T; names: Record<T, () => string>; onPick: (value: T) => void; variant: Variant; className?: string }) {
  const segmented = variant === 'segmented'

  return (
    <div role="group" aria-label={label} className={cx(segmented ? 'grid w-full grid-cols-2 gap-1 rounded-control border border-border-strong p-1' : 'flex items-center gap-0.5 rounded-control bg-lavender p-0.5', className)}>
      {prefix && !segmented ? (
        <span aria-hidden="true" className="px-1.5 text-micro text-muted">
          {prefix}
        </span>
      ) : null}
      {options.map((option) => (
        <button
          key={option}
          type="button"
          aria-pressed={option === current}
          className={cx(
            'transition-colors duration-150 focus-visible:outline-none focus-visible:shadow-focus motion-reduce:transition-none',
            segmented ? 'h-11 rounded-tag px-2 text-body font-medium' : 'h-8 rounded-[0.55rem] px-2.5 text-micro font-semibold pointer-coarse:h-11 pointer-coarse:min-w-11',
            // La elegida, en violeta con el texto blanco: como todo lo elegido (el idioma, Segmented, los chips).
            option === current ? (segmented ? 'bg-primary font-semibold text-white' : 'bg-primary text-white') : 'text-foreground/85 hover:bg-tint/10',
          )}
          onClick={() => onPick(option)}
        >
          {names[option]()}
        </button>
      ))}
    </div>
  )
}

const PALETTE_NAMES: Record<Palette, () => string> = { carbon: () => t('common.palette.carbon'), indigo: () => t('common.palette.indigo') }
const EFFECTS_NAMES: Record<Effects, () => string> = { full: () => t('common.effects.full'), lite: () => t('common.effects.lite') }

/** Colores: Carbón | Índigo (`app/palette.ts`). Vive en el ☰ de la app y, para el duelo, como fila de ⚙ Opciones. */
export function PaletteSwitcher({ className, variant = 'chips' }: { className?: string; variant?: Variant }) {
  return <Choice label={t('common.palette')} options={PALETTES} current={usePalette()} names={PALETTE_NAMES} onPick={setPalette} variant={variant} className={className} />
}

/** Efectos: Completos | Livianos (`app/effects.ts`), al lado de los colores en el ☰ de la app. */
export function EffectsSwitcher({ className, variant = 'chips' }: { className?: string; variant?: Variant }) {
  return <Choice label={t('common.effects')} prefix={t('common.effects')} options={EFFECTS} current={useEffects()} names={EFFECTS_NAMES} onPick={setEffects} variant={variant} className={className} />
}
