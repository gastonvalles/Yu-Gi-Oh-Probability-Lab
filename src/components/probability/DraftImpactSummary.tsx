import { formatShortPercent } from '../../app/utils'
import type { PatternKind } from '../../types'
import { cx } from '../ui/cx'
import type { DraftImpact } from './use-draft-impact'

const DRAFT_BOX = 'm-0 grid gap-[0.35rem] rounded-[calc(var(--radius-panel)-0.2rem)] border border-border bg-background/55 px-[0.7rem] py-[0.55rem] text-[0.78rem] text-muted'
const MIN_VISIBLE_CHANGE = 0.0005

/** Estadísticas en vivo del borrador (se actualizan mientras editás, antes de guardar). */
export function DraftImpactSummary({ impact, kind }: { impact: DraftImpact | null; kind: PatternKind }) {
  if (!impact) {
    return <p className={cx(DRAFT_BOX, 'text-soft')}>Completá las condiciones para ver el % en vivo.</p>
  }

  const { rule, clean } = impact
  const change = clean ? clean.after - clean.before : 0
  // Para las manos limpias subir siempre es bueno, sea salida o problema.
  const tone = Math.abs(change) < MIN_VISIBLE_CHANGE ? 'neutral' : change > 0 ? 'positive' : 'negative'

  return (
    <div
      className={cx(DRAFT_BOX, kind === 'opening' ? 'border-success/35' : 'border-danger/35')}
      aria-live="polite"
    >
      <div className="flex flex-wrap items-baseline gap-[0.4rem]">
        <strong className="text-[1.25rem] text-foreground tabular-nums">{rule.main === null ? '—' : formatShortPercent(rule.main)}</strong>
        <span>
          de las manos {rule.scope === 'first' ? 'yendo 1º ' : rule.scope === 'second' ? 'yendo 2º ' : ''}
          {kind === 'opening' ? 'tienen esta salida' : 'tienen este problema'}
        </span>
      </div>
      <div className="flex gap-[0.9rem] tabular-nums">
        <span>1º {rule.first === null ? 'no aplica' : formatShortPercent(rule.first)}</span>
        <span>2º {rule.second === null ? 'no aplica' : formatShortPercent(rule.second)}</span>
      </div>
      {clean ? (
        <div className="flex flex-wrap items-center gap-[0.35rem] border-t border-border pt-[0.35rem] tabular-nums [&_strong]:text-foreground">
          Manos limpias {formatShortPercent(clean.before)} → <strong>{formatShortPercent(clean.after)}</strong>
          <span
            className={cx(
              'rounded-full px-[0.4rem] py-[0.05rem] font-bold',
              tone === 'positive' && 'bg-success/14 text-accent',
              tone === 'negative' && 'bg-danger/14 text-destructive',
            )}
          >
            {tone === 'neutral' ? 'sin cambio' : `${change > 0 ? '+' : ''}${(change * 100).toFixed(1)} pp`}
          </span>
        </div>
      ) : null}
    </div>
  )
}
