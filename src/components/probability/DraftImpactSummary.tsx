import { formatShortPercent } from '../../app/utils'
import type { PatternKind } from '../../types'
import { Badge } from '../ui/Badge'
import { Icon } from '../ui/Icon'
import { ProgressRing } from '../ui/ProgressRing'
import type { DraftImpact } from './use-draft-impact'

const MIN_VISIBLE_CHANGE = 0.0005

/** Estadísticas en vivo del borrador (se actualizan mientras editás, antes de guardar). */
export function DraftImpactSummary({ impact, kind }: { impact: DraftImpact | null; kind: PatternKind }) {
  if (!impact) {
    return <p className="m-0 text-body text-soft">Completá las condiciones para ver el % en vivo.</p>
  }

  const { rule, clean } = impact
  const change = clean ? clean.after - clean.before : 0
  // Para las manos limpias subir siempre es bueno, sea salida o problema.
  const tone = Math.abs(change) < MIN_VISIBLE_CHANGE ? 'neutral' : change > 0 ? 'positive' : 'negative'

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
      {clean ? (
        <div className="flex flex-wrap items-center gap-2 border-t border-border-subtle pt-3 tabular-nums">
          <span>Manos limpias</span>
          <ProgressRing value={clean.before} tone="neutral" size={44} strokeWidth={4} label={`Manos limpias hoy: ${formatShortPercent(clean.before)}`}>
            {Math.round(clean.before * 100)}%
          </ProgressRing>
          <Icon name="arrow-right" size={14} className="text-soft" />
          <ProgressRing value={clean.after} tone="success" size={44} strokeWidth={4} delay={250} label={`Manos limpias con la regla: ${formatShortPercent(clean.after)}`}>
            {Math.round(clean.after * 100)}%
          </ProgressRing>
          <Badge tone={tone === 'positive' ? 'success' : tone === 'negative' ? 'danger' : 'neutral'} size="sm">
            {tone === 'neutral' ? 'sin cambio' : `${change > 0 ? '+' : ''}${(change * 100).toFixed(1)} pp`}
          </Badge>
        </div>
      ) : null}
    </div>
  )
}
