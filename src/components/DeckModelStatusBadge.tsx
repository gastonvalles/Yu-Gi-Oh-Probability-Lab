import type { DeckModelStatus } from '../app/deck-model-status'
import { Badge } from './ui/Badge'
import { Callout } from './ui/Callout'

interface DeckModelStatusBadgeProps {
  modelStatus: DeckModelStatus
  variant: 'compact' | 'full'
}

export function DeckModelStatusBadge({ modelStatus, variant }: DeckModelStatusBadgeProps) {
  const isComplete = modelStatus.status === 'complete'

  if (variant === 'compact') {
    return (
      <Badge tone={isComplete ? 'success' : 'warning'} dot size="md">
        {isComplete ? 'Modelo completo' : 'Modelo incompleto'}
      </Badge>
    )
  }

  if (isComplete) {
    return (
      <Callout tone="success" title="Modelo completo">
        Toda carta tiene grupo, función y fue revisada.
      </Callout>
    )
  }

  return (
    <Callout tone="warning" title="Modelo incompleto">
      <ul className="m-0 grid list-none gap-0.5 p-0">
        {buildDetailMessages(modelStatus).map((message) => (
          <li key={message}>{message}</li>
        ))}
      </ul>
      <span className="text-caption text-soft">Revisá antes de confiar en los porcentajes</span>
    </Callout>
  )
}

function buildDetailMessages(modelStatus: DeckModelStatus): string[] {
  const messages: string[] = []

  if (modelStatus.missingRolesCount > 0) {
    messages.push(`${modelStatus.missingRolesCount} cartas sin función definida`)
  }

  if (modelStatus.missingOriginCount > 0) {
    messages.push(`${modelStatus.missingOriginCount} cartas sin grupo definido`)
  }

  if (modelStatus.needsReviewCount > 0) {
    messages.push(`${modelStatus.needsReviewCount} cartas pendientes de revisión`)
  }

  return messages
}
