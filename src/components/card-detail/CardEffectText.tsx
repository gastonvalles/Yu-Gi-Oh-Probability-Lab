import { segmentCardText, type TextTone } from '../../app/card-text'
import { t } from '../../i18n'
import { TONE } from '../ui/tone'
import { cx } from '../ui/cx'

/**
 * Cómo se ve cada parte del efecto (capa 0 del motor de cartas, `docs/motor-de-cartas.md`). El color significa algo: verde = cuándo se activa, ámbar = se puede activar en respuesta, rojo = lo que pagás, violeta = a quién apunta;
 * el límite («una vez por turno») va subrayado y no lleva color. El texto es el mismo con o sin color (un lector de pantalla lo lee igual) y cada parte lleva su nombre en `title`.
 */
const TONE_STYLE: Record<Exclude<TextTone, 'plain'>, { className: string; label: () => string }> = {
  condition: { className: TONE.success.text, label: () => t('search.cardText.condition') },
  speed: { className: cx(TONE.warning.text, 'font-semibold'), label: () => t('search.cardText.speed') },
  cost: { className: TONE.danger.text, label: () => t('search.cardText.cost') },
  target: { className: TONE.brand.text, label: () => t('search.cardText.target') },
  limit: { className: 'underline decoration-dotted decoration-soft underline-offset-4', label: () => t('search.cardText.limit') },
}

/** El texto del efecto de una carta con sus partes resaltadas (condición, velocidad, costo, objetivo y límite): lo que no es seguro que sea una de ellas queda como texto común. */
export function CardEffectText({ text, className }: { text: string; className?: string }) {
  return (
    <p className={cx('m-0 whitespace-pre-wrap [overflow-wrap:anywhere]', className)}>
      {segmentCardText(text).map((segment, index) => {
        if (segment.tone === 'plain') return segment.text

        const { className: toneClass, label } = TONE_STYLE[segment.tone]

        return (
          <span key={index} className={toneClass} title={label()} data-tone={segment.tone}>
            {segment.text}
          </span>
        )
      })}
    </p>
  )
}
