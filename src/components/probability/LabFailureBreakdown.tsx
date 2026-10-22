import { useId, useState } from 'react'

import type { LabViewResult } from '../../app/probability-lab'
import { formatShortPercent } from '../../app/utils'
import { t, type MessageKey } from '../../i18n'
import { cx } from '../ui/cx'
import { Icon } from '../ui/Icon'
import { ProgressRing } from '../ui/ProgressRing'
import { formatPer100 } from '../ui/ring-shared'
import { judgeTone } from '../ui/tone'
import { overline } from '../ui/typography'

type FailedSegment = 'noOpening' | 'withProblem'

// Los textos de cada fila son claves de mensajes: se arman al dibujar, en el idioma de ese momento. El punto es el color de su tramo en el anillo.
const ROWS = [
  { key: 'noOpening', dot: 'bg-danger-soft', label: 'lab.breakdown.noOpening.label', description: 'lab.breakdown.noOpening.description', empty: 'lab.breakdown.noOpening.empty' },
  { key: 'withProblem', dot: 'bg-warning', label: 'lab.breakdown.withProblem.label', description: 'lab.breakdown.withProblem.description', empty: 'lab.breakdown.withProblem.empty' },
] as const satisfies ReadonlyArray<{ key: FailedSegment; dot: string; label: MessageKey; description: MessageKey; empty: MessageKey }>

const MAX_RULES = 4

/**
 * La leyenda del veredicto: las manos que no son buenas (sin salida y con problema), cada una con su entero «de cada 100».
 * Cada fila se abre y muestra los problemas de esas manos (el % de las manos de ese grupo que cumple cada regla de problema).
 */
export function LabFailureBreakdown({ result }: { result: LabViewResult }) {
  const [open, setOpen] = useState<FailedSegment | null>(null)
  const id = useId()
  const values: Record<FailedSegment, number> = { noOpening: result.noOpeningProbability, withProblem: result.withProblemProbability }

  return (
    <ul className="m-0 grid list-none divide-y divide-border-subtle p-0">
      {ROWS.map((row) => {
        const isOpen = open === row.key
        const panelId = `${id}-${row.key}`
        const rules = result.segmentRules[row.key].filter((rule) => rule.kind === 'problem')

        return (
          <li key={row.key}>
            <button
              type="button"
              aria-expanded={isOpen}
              aria-controls={isOpen ? panelId : undefined}
              className="grid min-h-12 w-full grid-cols-[auto_minmax(0,1fr)_auto_auto] items-center gap-3 rounded-control p-1 text-left transition-colors duration-150 hover:bg-tint/6 focus-visible:outline-none focus-visible:shadow-focus"
              onClick={() => setOpen(isOpen ? null : row.key)}
            >
              <span className={cx('size-2.5 rounded-full', row.dot)} aria-hidden="true" />
              <span className="grid min-w-0">
                <strong className="text-body font-semibold text-foreground">{t(row.label)}</strong>
                <span className="text-body text-muted">{t(row.description)}</span>
              </span>
              <span className="text-lead font-semibold tabular-nums text-foreground">{formatPer100(values[row.key])}</span>
              <Icon name={isOpen ? 'chevron-down' : 'chevron-right'} size={18} className="text-soft" />
            </button>
            {isOpen ? (
              <div id={panelId} className="grid gap-2.5 pb-3.5 pl-6.5 pr-1 pt-1 motion-safe:animate-step-in">
                {rules.length === 0 ? (
                  <p className="m-0 text-body text-muted">{t(row.empty)}</p>
                ) : (
                  <>
                    <p className={cx('m-0', overline)}>{t('lab.breakdown.problems')}</p>
                    <ul className="m-0 grid list-none gap-2 p-0">
                      {rules.slice(0, MAX_RULES).map((rule) => (
                        <li key={rule.patternId} className="flex min-w-0 items-center gap-3">
                          <ProgressRing value={rule.share} tone={judgeTone(false)} size={40} label={`${rule.name}: ${formatShortPercent(rule.share)}`} />
                          <span className="min-w-0 truncate text-body text-foreground">{rule.name}</span>
                        </li>
                      ))}
                    </ul>
                    <p className="m-0 text-body text-muted">{t('lab.breakdown.footnote')}</p>
                  </>
                )}
              </div>
            ) : null}
          </li>
        )
      })}
    </ul>
  )
}
