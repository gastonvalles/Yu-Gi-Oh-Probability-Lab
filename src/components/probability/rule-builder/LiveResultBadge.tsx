import type { PatternKind } from '../../../types'
import { formatPercent } from '../../../app/utils'

interface LiveResultBadgeProps {
  probability: number | null
  patternKind: PatternKind
}

interface SemanticLabel {
  text: string
  tone: 'positive' | 'neutral' | 'warning' | 'critical'
}

export function getSemanticLabel(probability: number, kind: PatternKind): SemanticLabel {
  if (kind === 'opening') {
    if (probability >= 0.85) {
      return { text: 'Alta consistencia', tone: 'positive' }
    }

    if (probability >= 0.60) {
      return { text: 'Consistencia media', tone: 'neutral' }
    }

    if (probability >= 0.40) {
      return { text: 'Consistencia baja', tone: 'warning' }
    }

    return { text: 'Muy baja — revisá el deck', tone: 'critical' }
  }

  if (probability < 0.05) {
    return { text: 'Problema mínimo', tone: 'positive' }
  }

  if (probability < 0.15) {
    return { text: 'Problema moderado', tone: 'neutral' }
  }

  if (probability < 0.30) {
    return { text: 'Problema alto', tone: 'warning' }
  }

  return { text: 'Problema crítico — revisá el deck', tone: 'critical' }
}

const TONE_CLASSES: Record<SemanticLabel['tone'], string> = {
  positive: 'text-(--accent)',
  neutral: 'text-(--text-main)',
  warning: 'text-(--warning)',
  critical: 'text-destructive',
}

export function LiveResultBadge({ probability, patternKind }: LiveResultBadgeProps) {
  if (probability === null) {
    return (
      <span className="inline-flex items-center gap-1.5 text-[0.78rem] text-(--text-muted)">
        <span className="text-[0.9rem] leading-none">—</span>
      </span>
    )
  }

  const semantic = getSemanticLabel(probability, patternKind)

  return (
    <span className="inline-flex items-center gap-1.5">
      <strong className="text-[0.9rem] leading-none text-(--text-main)">
        {formatPercent(probability)}
      </strong>
      <span className={`text-[0.72rem] leading-none ${TONE_CLASSES[semantic.tone]}`}>
        {semantic.text}
      </span>
    </span>
  )
}
