import type { CardDiff } from '../../app/build-comparison'
import { formatInteger } from '../../app/utils'

interface CardDiffListProps {
  diffs: CardDiff[]
  deckSizeA: number
  deckSizeB: number
}

export function CardDiffList({ diffs, deckSizeA, deckSizeB }: CardDiffListProps) {
  return (
    <div className="grid gap-2">
      <div className="flex flex-wrap items-center gap-3">
        <span className="text-[0.84rem] text-(--text-main)">
          Main A: <strong>{formatInteger(deckSizeA)}</strong>
        </span>
        <span className="text-[0.84rem] text-(--text-main)">
          Main B: <strong>{formatInteger(deckSizeB)}</strong>
        </span>
      </div>

      {diffs.length === 0 ? (
        <p className="app-muted m-0 text-[0.8rem]">No hay diferencias en el Main Deck.</p>
      ) : (
        <div className="grid gap-1">
          {diffs.map((diff) => (
            <div
              key={diff.cardName}
              className={`surface-card grid grid-cols-[minmax(0,1fr)_auto_auto_auto] items-center gap-2 px-2 py-1.5 ${getBorderStyle(diff.changeType)}`}
            >
              <span className="truncate text-[0.84rem] text-(--text-main)">{diff.cardName}</span>
              <span className="w-[2.5rem] text-right text-[0.84rem] tabular-nums text-(--text-muted)">{diff.copiesA}</span>
              <span className="w-[2.5rem] text-right text-[0.84rem] tabular-nums text-(--text-muted)">{diff.copiesB}</span>
              <span className={`w-[3rem] text-right text-[0.84rem] tabular-nums ${getChangeColor(diff.changeType)}`}>
                {diff.delta > 0 ? '+' : ''}{diff.delta}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

function getChangeColor(changeType: CardDiff['changeType']): string {
  switch (changeType) {
    case 'added': return 'text-accent'
    case 'removed': return 'text-destructive'
    case 'modified': return 'text-warning'
  }
}

function getBorderStyle(changeType: CardDiff['changeType']): string {
  switch (changeType) {
    case 'added': return 'border-l-2 border-l-[#00ffa3]'
    case 'removed': return 'border-l-2 border-l-[#ef4444]'
    case 'modified': return 'border-l-2 border-l-[#f59e0b]'
  }
}
