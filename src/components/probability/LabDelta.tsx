import { t } from '../../i18n'
import { cx } from '../ui/cx'

interface LabDeltaProps {
  /** Cuánto cambió, en enteros «de cada 100» y con signo (`per100Delta`). En 0 no dibuja nada. */
  diff: number
  /** Si subir le conviene a quien lee (manos buenas, starters) o no (sin salida, con problema, bricks): decide el verde y el rojo. */
  higherIsBetter?: boolean
  /** Para nombrarlo desde afuera (`aria-describedby` de un botón que ya tiene su propio nombre). */
  id?: string
  className?: string
}

/** ▲ / ▼ y cuántos de cada 100: verde si el cambio le conviene a quien lee, rojo si no (nunca el signo solo). El lector de pantalla oye «4 más» o «4 menos». */
export function LabDelta({ diff, higherIsBetter = true, id, className }: LabDeltaProps) {
  if (diff === 0) {
    return null
  }

  const up = diff > 0

  return (
    <span id={id} className={cx('whitespace-nowrap font-semibold tabular-nums', up === higherIsBetter ? 'text-success-soft' : 'text-danger-soft', className)}>
      <span aria-hidden="true">{`${up ? '▲' : '▼'} ${Math.abs(diff)}`}</span>
      <span className="sr-only">{t(up ? 'lab.suggestion.more' : 'lab.suggestion.fewer', { n: Math.abs(diff) })}</span>
    </span>
  )
}
