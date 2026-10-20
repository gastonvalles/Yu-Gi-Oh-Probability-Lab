import { Fragment } from 'react'

import { segmentCardText, type TextRange, type TextTone } from '../../app/card-text'
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

/** El fondo del pedazo que se está señalando (`highlight`): claro y parejo, sin color propio, para no pisar el de la condición, el costo o el objetivo que lleva adentro. */
const HIGHLIGHT = 'rounded-sm bg-tint/25 text-inherit box-decoration-clone'

/** El pedazo `text`, que empieza en `start` del texto entero, partido en lo que cae adentro de `range` y lo que no. */
function splitAt(text: string, start: number, range: TextRange | undefined): Array<{ text: string; on: boolean }> {
  const from = range ? Math.max(range.start - start, 0) : 0
  const to = range ? Math.min(range.end - start, text.length) : 0

  if (!range || from >= to) return [{ text, on: false }]

  return [
    { text: text.slice(0, from), on: false },
    { text: text.slice(from, to), on: true },
    { text: text.slice(to), on: false },
  ].filter((piece) => piece.text !== '')
}

/**
 * El texto del efecto de una carta con sus partes resaltadas (condición, velocidad, costo, objetivo y límite): lo que no es seguro que sea una de ellas queda como texto común. Con `highlight`, un pedazo del texto (la frase
 * de un efecto, desde `start` hasta `end`) lleva además un fondo claro: así se ve cuál es el efecto que se está eligiendo, sin cambiar de color lo que tiene adentro.
 */
export function CardEffectText({ text, className, highlight }: { text: string; className?: string; highlight?: TextRange }) {
  let offset = 0

  return (
    <p className={cx('m-0 whitespace-pre-wrap [overflow-wrap:anywhere]', className)}>
      {segmentCardText(text).map((segment, index) => {
        const start = offset

        offset += segment.text.length

        const content = splitAt(segment.text, start, highlight).map((piece, at) =>
          piece.on ? (
            <mark key={at} className={HIGHLIGHT} data-highlight="true">
              {piece.text}
            </mark>
          ) : (
            <Fragment key={at}>{piece.text}</Fragment>
          ),
        )

        if (segment.tone === 'plain') return <Fragment key={index}>{content}</Fragment>

        const { className: toneClass, label } = TONE_STYLE[segment.tone]

        return (
          <span key={index} className={toneClass} title={label()} data-tone={segment.tone}>
            {content}
          </span>
        )
      })}
    </p>
  )
}
