import type { DeckModelStatus } from '../app/deck-model-status'

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
    <span className="inline-flex items-center gap-1.5">
      <span
        aria-hidden="true"
        className={[
          'h-2 w-2 shrink-0 rounded-full',
          isComplete ? 'bg-accent' : 'bg-(--warning)',
        ].join(' ')}
      />
      <span className="text-[0.78rem] leading-none text-(--text-muted)">
        {isComplete ? 'Modelo completo' : 'Modelo incompleto'}
      </span>
    </span>
  )
}

function FullBadge({ modelStatus }: { modelStatus: DeckModelStatus }) {
  const isComplete = modelStatus.status === 'complete'

  if (isComplete) {
    return (
      <div className={['surface-card-success grid gap-2 px-3 py-2.5'].join(' ')}>
        <div className="flex items-center gap-2">
          <span
            aria-hidden="true"
            className="h-2 w-2 shrink-0 rounded-full bg-accent"
          />
          <strong className="text-[0.88rem] leading-none text-(--text-main)">
            Modelo completo
          </strong>
        </div>
        <p className="m-0 text-[0.78rem] leading-[1.3] text-(--text-muted)">
          Toda carta tiene grupo, función y fue revisada.
        </p>
      </div>
    )
  }

  const details = buildDetailMessages(modelStatus)

  return (
    <div className={['surface-card-warning grid gap-2 px-3 py-2.5'].join(' ')}>
      <div className="flex items-center gap-2">
        <span
          aria-hidden="true"
          className="h-2 w-2 shrink-0 rounded-full bg-(--warning)"
        />
        <strong className="text-[0.88rem] leading-none text-(--text-main)">
          Modelo incompleto
        </strong>
      </div>
      <ul className="m-0 grid gap-1 p-0 list-none">
        {details.map((msg) => (
          <li key={msg} className="text-[0.78rem] leading-[1.3] text-(--text-muted)">
            {msg}
          </li>
        ))}
      </ul>
      <p className="m-0 text-[0.74rem] leading-none text-(--text-soft)">
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
