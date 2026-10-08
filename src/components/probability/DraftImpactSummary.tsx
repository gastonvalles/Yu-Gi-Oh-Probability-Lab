import { formatShortPercent } from '../../app/utils'
import type { PatternKind } from '../../types'
import { ProgressRing } from '../ui/ProgressRing'
import type { DraftImpact } from './use-draft-impact'

/** Estadísticas en vivo del borrador (se actualizan mientras editás, antes de guardar). */
export function DraftImpactSummary({ impact, kind }: { impact: DraftImpact | null; kind: PatternKind }) {
  if (!impact) {
    return <p className="m-0 text-body text-soft">Completá las condiciones para ver el % en vivo.</p>
  }

  const { rule } = impact

  return (
    <div className="grid gap-3 text-body text-muted" aria-live="polite">
      <div className="flex items-center gap-3">
        <ProgressRing
          value={rule.main ?? 0}
          tone={kind === 'opening' ? 'success' : 'danger'}
          size={56}
          strokeWidth={5}
          label={`${kind === 'opening' ? 'Salida' : 'Problema'}: ${rule.main === null ? 'sin dato' : formatShortPercent(rule.main)}`}
        >
          {rule.main === null ? '—' : `${Math.round(rule.main * 100)}%`}
        </ProgressRing>
        <div className="grid min-w-0 gap-0.5">
          <span>
            de las manos {rule.scope === 'first' ? 'yendo 1º ' : rule.scope === 'second' ? 'yendo 2º ' : ''}
            {kind === 'opening' ? 'tienen esta salida' : 'tienen este problema'}
          </span>
          <span className="text-micro tabular-nums">
            1º {rule.first === null ? 'no aplica' : formatShortPercent(rule.first)} · 2º {rule.second === null ? 'no aplica' : formatShortPercent(rule.second)}
          </span>
        </div>
      </div>
    </div>
  )
}
