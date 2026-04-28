import type { Insight } from '../../app/build-comparison'

interface InsightListProps {
  insights: Insight[]
}

export function InsightList({ insights }: InsightListProps) {
  if (insights.length === 0) return null

  return (
    <div className="grid gap-2">
      {insights.slice(0, 3).map((insight, index) => (
        <article key={index} className="surface-card flex items-center gap-3 px-3 py-2">
          <span className="shrink-0 text-[1rem]" aria-hidden="true">
            {getPriorityIcon(insight.priority)}
          </span>

          <span className="min-w-0 flex-1 text-[0.84rem] leading-[1.3] text-(--text-main)">
            {insight.text}
          </span>

          <span className="surface-panel-soft shrink-0 px-2 py-0.5 text-[0.72rem] tabular-nums text-(--text-muted)">
            {insight.delta >= 0 ? '+' : ''}{insight.delta}
          </span>
        </article>
      ))}
    </div>
  )
}

function getPriorityIcon(priority: Insight['priority']): string {
  switch (priority) {
    case 'critical': return '⚠️'
    case 'high': return '📊'
    case 'normal': return 'ℹ️'
  }
}
