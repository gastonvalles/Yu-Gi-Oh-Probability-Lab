import { formatShortPercent } from '../../app/utils'
import type { PatternKind } from '../../types'
import type { DraftImpact } from './use-draft-impact'

const MIN_VISIBLE_CHANGE = 0.0005

/** Estadísticas en vivo del borrador (se actualizan mientras editás, antes de guardar). */
export function DraftImpactSummary({ impact, kind }: { impact: DraftImpact | null; kind: PatternKind }) {
  if (!impact) {
    return <p className="draft-impact draft-impact-empty">Completá las condiciones para ver el % en vivo.</p>
  }

  const { rule, clean } = impact
  const change = clean ? clean.after - clean.before : 0
  // Para las manos limpias subir siempre es bueno, sea salida o problema.
  const tone = Math.abs(change) < MIN_VISIBLE_CHANGE ? 'neutral' : change > 0 ? 'positive' : 'negative'

  return (
    <div className="draft-impact" data-kind={kind} aria-live="polite">
      <div className="draft-impact-main">
        <strong>{rule.main === null ? '—' : formatShortPercent(rule.main)}</strong>
        <span>
          de las manos {rule.scope === 'first' ? 'yendo 1º ' : rule.scope === 'second' ? 'yendo 2º ' : ''}
          {kind === 'opening' ? 'tienen esta salida' : 'tienen este problema'}
        </span>
      </div>
      <div className="draft-impact-turns">
        <span>1º {rule.first === null ? 'no aplica' : formatShortPercent(rule.first)}</span>
        <span>2º {rule.second === null ? 'no aplica' : formatShortPercent(rule.second)}</span>
      </div>
      {clean ? (
        <div className="draft-impact-clean">
          Manos limpias {formatShortPercent(clean.before)} → <strong>{formatShortPercent(clean.after)}</strong>
          <span className="draft-impact-delta" data-tone={tone}>
            {tone === 'neutral' ? 'sin cambio' : `${change > 0 ? '+' : ''}${(change * 100).toFixed(1)} pp`}
          </span>
        </div>
      ) : null}
    </div>
  )
}
