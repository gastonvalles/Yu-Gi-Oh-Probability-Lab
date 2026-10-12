import { wilsonInterval, type HandRating, type HandTally } from '../../app/hand-samples'
import { formatInteger, formatShortPercent } from '../../app/utils'
import { t } from '../../i18n'
import { cx } from '../ui/cx'
import { RULE_BUTTON } from './PracticeBoard'
import { RULE_COLOR } from './practice-styles'

/** Con menos manos calificadas el intervalo es tan ancho que no dice nada: se avisa "muestra chica". */
const MIN_SAMPLE = 10

interface HandSamplingProps {
  /** Qué se calificó esta mano (null: todavía nada). */
  rating: HandRating | null
  tally: HandTally
  /** Manos limpias del Lab para este turno (null mientras calcula). */
  labClean: number | null
  turn: 'first' | 'second'
  onRate: (rating: HandRating) => void
  onReset: () => void
}

/**
 * Muestreo de manos: se califica cada mano "jugable" o "muerta" y la cuenta se compara con el % de manos
 * limpias del Lab. Si el Lab queda afuera del intervalo de Wilson, las reglas no reflejan el criterio.
 */
export function HandSampling({ rating, tally, labClean, turn, onRate, onReset }: HandSamplingProps) {
  const total = tally.playable + tally.dead
  const [low, high] = wilsonInterval(tally.playable, total)
  const enough = total >= MIN_SAMPLE
  const disagree = enough && labClean !== null && (labClean < low || labClean > high)
  // El resumen son hasta tres frases (lo calificado, lo que da el Lab y el aviso): cada idioma arma las suyas y se unen con ". ".
  const percent = total > 0 ? formatShortPercent(tally.playable / total) : ''
  const summary = [
    enough
      ? t('practice.sampling.headline', { count: total, total: formatInteger(total), percent, low: formatShortPercent(low), high: formatShortPercent(high) })
      : t('practice.sampling.headlineSmall', { count: total, total: formatInteger(total), percent }),
    labClean !== null ? t(turn === 'first' ? 'practice.sampling.labFirst' : 'practice.sampling.labSecond', { percent: formatShortPercent(labClean) }) : null,
    disagree ? t('practice.sampling.disagree') : null,
  ]
    .filter((part): part is string => part !== null)
    .join('. ')

  return (
    <div className="grid gap-1 text-micro text-muted" aria-label={t('practice.sampling.label')}>
      <div className="flex flex-wrap items-center gap-1.5 max-[1100px]:justify-center">
        <span>{t('practice.sampling.question')}</span>
        <button type="button" className={cx(RULE_BUTTON, RULE_COLOR.opening)} aria-pressed={rating === 'playable'} onClick={() => onRate('playable')}>
          {t('practice.sampling.playable')}
        </button>
        <button type="button" className={cx(RULE_BUTTON, RULE_COLOR.problem)} aria-pressed={rating === 'dead'} onClick={() => onRate('dead')}>
          {t('practice.sampling.dead')}
        </button>
      </div>
      {total > 0 ? (
        <p className="m-0 [overflow-wrap:anywhere] max-[1100px]:text-center" aria-live="polite">
          {summary}.{' '}
          <button type="button" className="font-semibold text-primary-soft underline-offset-2 hover:underline" onClick={onReset}>
            {t('practice.sampling.reset')}
          </button>
        </p>
      ) : null}
    </div>
  )
}
