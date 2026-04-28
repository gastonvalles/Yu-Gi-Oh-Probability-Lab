import type { Verdict } from '../../app/build-comparison'

interface VerdictCardProps {
  verdict: Verdict
}

export function VerdictCard({ verdict }: VerdictCardProps) {
  return (
    <article className="surface-panel-strong grid gap-2 px-4 py-4">
      <p className="app-kicker m-0 text-[0.68rem] uppercase tracking-widest">Comparación</p>

      <h3 className="m-0 text-[1.08rem] leading-none text-(--text-main)">
        {getMainText(verdict.type)}
      </h3>

      <p className="app-muted m-0 text-[0.84rem] leading-[1.2]">
        Openings: {verdict.openingDeltaFormatted} · Bricks: {verdict.bricksDelta >= 0 ? '+' : ''}{verdict.bricksDelta}
      </p>

      {verdict.recommendation ? (
        <p className="app-muted m-0 text-[0.8rem] italic leading-[1.2]">
          {verdict.recommendation}
        </p>
      ) : null}

      {verdict.type === 'tradeoff' && verdict.tradeoffDetail ? (
        <div className="surface-card-warning mt-1 px-3 py-2">
          <p className="m-0 text-[0.8rem] leading-[1.2] text-(--text-main)">
            {verdict.tradeoffDetail}
          </p>
        </div>
      ) : null}
    </article>
  )
}

function getMainText(type: Verdict['type']): string {
  switch (type) {
    case 'a_better': return 'Build A es mejor'
    case 'b_better': return 'Build B es mejor'
    case 'equivalent': return 'Equivalentes'
    case 'tradeoff': return 'Trade-off'
  }
}
