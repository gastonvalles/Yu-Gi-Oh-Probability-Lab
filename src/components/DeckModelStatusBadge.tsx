import type { DeckModelStatus } from '../app/deck-model-status'
import { surface } from './ui/surfaces'

interface DeckModelStatusBadgeProps {
  modelStatus: DeckModelStatus
  variant: 'compact' | 'full'
}

export function DeckModelStatusBadge({
  modelStatus,
  variant,
}: DeckModelStatusBadgeProps) {
  if (variant === 'compact') {
    return <CompactBadge modelStatus={modelStatus} />
  }

  return <FullBadge modelStatus={modelStatus} />
}

function CompactBadge({ modelStatus }: { modelStatus: DeckModelStatus }) {
  const isComplete = modelStatus.status === 'complete'

  return (
    <span className="inline-flex items-center gap-1.5 whitespace-nowrap">
      <span
        aria-hidden="true"
        className={[
          'h-2 w-2 shrink-0 rounded-full',
          isComplete ? 'bg-accent' : 'bg-warning',
        ].join(' ')}
      />
      <span className="text-small leading-none text-muted">
        {isComplete ? 'Modelo completo' : 'Modelo incompleto'}
      </span>
    </span>
  )
}

function FullBadge({ modelStatus }: { modelStatus: DeckModelStatus }) {
  const isComplete = modelStatus.status === 'complete'

  if (isComplete) {
    return (
      <div className={[`${surface.cardSuccess} grid gap-2 px-3 py-2.5`].join(' ')}>
        <div className="flex items-center gap-2">
          <span
            aria-hidden="true"
            className="h-2 w-2 shrink-0 rounded-full bg-accent"
          />
          <strong className="text-body leading-none text-foreground">
            Modelo completo
          </strong>
        </div>
        <p className="m-0 text-small text-muted">
          Toda carta tiene grupo, función y fue revisada.
        </p>
      </div>
    )
  }

  const details = buildDetailMessages(modelStatus)

  return (
    <div className={[`${surface.cardWarning} grid gap-2 px-3 py-2.5`].join(' ')}>
      <div className="flex items-center gap-2">
        <span
          aria-hidden="true"
          className="h-2 w-2 shrink-0 rounded-full bg-warning"
        />
        <strong className="text-body leading-none text-foreground">
          Modelo incompleto
        </strong>
      </div>
      <ul className="m-0 grid gap-1 p-0 list-none">
        {details.map((msg) => (
          <li key={msg} className="text-small text-muted">
            {msg}
          </li>
        ))}
      </ul>
      <p className="m-0 text-caption leading-none text-soft">
        Revisá antes de confiar en los porcentajes
      </p>
    </div>
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
