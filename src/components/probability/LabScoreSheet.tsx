import type { LabResults } from '../../app/probability-lab'
import { formatInteger, formatShortPercent } from '../../app/utils'
import { t } from '../../i18n'
import { Heading } from '../ui/Heading'
import { Modal } from '../ui/Modal'

interface LabScoreSheetProps {
  isOpen: boolean
  onClose: () => void
  results: LabResults
  /** Las cartas de la mano yendo primero (yendo segundo roba una más). */
  handSize: number
  /** Abre el aviso de cómo leer los porcentajes. */
  onOpenDisclaimer: () => void
}

/**
 * La ficha del resultado: qué es una mano buena, las cuentas exactas de cada turno (cuántas manos buenas de cuántas posibles) y lo que el número no dice.
 * En el celular sale de abajo. Es lo que se abre con la ⓘ de la tarjeta del resultado; el aviso largo de cómo leer los % queda a un toque, no se repite acá.
 */
export function LabScoreSheet({ isOpen, onClose, results, handSize, onOpenDisclaimer }: LabScoreSheetProps) {
  const counts = [
    { label: t('lab.sheet.first', { hand: handSize }), value: ofTotal(results.first.cleanHands, results.first.totalHands) },
    { label: t('lab.sheet.second', { hand: handSize + 1 }), value: ofTotal(results.second.cleanHands, results.second.totalHands) },
    { label: t('lab.sheet.average'), value: formatShortPercent(results.average.cleanProbability) },
  ]

  return (
    <Modal isOpen={isOpen} onClose={onClose} size="keypad" title={t('lab.sheet.title')}>
      <div className="grid gap-4">
        <div className="grid gap-1">
          <Heading level="card">{t('lab.sheet.goodTitle')}</Heading>
          <p className="m-0 text-body text-muted">{t('lab.sheet.goodText')}</p>
        </div>

        <div className="grid">
          <p className="m-0 mb-1 text-micro font-semibold uppercase tracking-[0.04em] text-soft">{t('lab.sheet.countsTitle')}</p>
          <dl className="m-0 grid">
            {counts.map((line) => (
              <div key={line.label} className="flex items-baseline justify-between gap-3 border-t border-border-subtle py-2">
                <dt className="text-body text-foreground">{line.label}</dt>
                <dd className="m-0 text-body font-semibold tabular-nums text-foreground">{line.value}</dd>
              </div>
            ))}
          </dl>
        </div>

        <div className="grid gap-1">
          <Heading level="card">{t('lab.sheet.notTitle')}</Heading>
          <p className="m-0 text-body text-muted">{t('lab.sheet.notText')}</p>
        </div>

        <button
          type="button"
          className="inline-flex min-h-11 items-center justify-self-start text-body text-accent hover:underline focus-visible:outline-none focus-visible:shadow-focus"
          onClick={() => {
            onClose()
            onOpenDisclaimer()
          }}
        >
          {t('lab.sheet.howToRead')} ›
        </button>
      </div>
    </Modal>
  )
}

/** «556.416 de 658.008»; sin las cuentas (un resultado que no las trae) no se inventan. */
function ofTotal(clean: number | null, total: number | null): string {
  return clean === null || total === null ? '—' : t('lab.sheet.ofTotal', { clean: formatInteger(clean), total: formatInteger(total) })
}
