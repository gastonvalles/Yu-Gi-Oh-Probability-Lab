import { formatShortPercent, formatWholePercent } from '../../app/utils'
import { t } from '../../i18n'
import type { PatternKind } from '../../types'
import { ProgressRing } from '../ui/ProgressRing'
import { kindLabel } from './lab-copy'
import type { DraftImpact } from './use-draft-impact'

// La frase cambia con el tipo de regla y con el turno al que vale: una clave por combinación (el orden de las palabras lo decide el idioma).
const SHARE_KEY = {
  opening: { either: 'lab.draft.share.opening', first: 'lab.draft.share.openingFirst', second: 'lab.draft.share.openingSecond' },
  problem: { either: 'lab.draft.share.problem', first: 'lab.draft.share.problemFirst', second: 'lab.draft.share.problemSecond' },
} as const

/** Estadísticas en vivo del borrador (se actualizan mientras editás, antes de guardar). */
export function DraftImpactSummary({ impact, kind }: { impact: DraftImpact | null; kind: PatternKind }) {
  if (!impact) {
    return <p className="m-0 text-body text-soft">{t('lab.draft.empty')}</p>
  }

  const { rule } = impact
  const percentOrNotApplicable = (value: number | null) => (value === null ? t('lab.draft.notApplicable') : formatShortPercent(value))

  return (
    <div className="grid gap-3 text-body text-muted" aria-live="polite">
      <div className="flex items-center gap-3">
        <ProgressRing
          value={rule.main ?? 0}
          tone={kind === 'opening' ? 'success' : 'danger'}
          size={56}
          strokeWidth={5}
          label={t('lab.draft.ringLabel', { kind: kindLabel(kind), value: rule.main === null ? t('lab.draft.noData') : formatShortPercent(rule.main) })}
        >
          {rule.main === null ? '—' : formatWholePercent(rule.main)}
        </ProgressRing>
        <div className="grid min-w-0 gap-0.5">
          <span>{t(SHARE_KEY[kind][rule.scope])}</span>
          <span className="text-micro tabular-nums">
            {t('lab.draft.byTurn', { first: percentOrNotApplicable(rule.first), second: percentOrNotApplicable(rule.second) })}
          </span>
        </div>
      </div>
    </div>
  )
}
