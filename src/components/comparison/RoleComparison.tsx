import type { RoleDistribution } from '../../app/build-comparison'
import type { CardRole } from '../../types'

interface RoleComparisonProps {
  rolesA: RoleDistribution
  rolesB: RoleDistribution
}

const ROLE_LABELS: Record<CardRole, string> = {
  starter: 'Starter',
  extender: 'Extender',
  enabler: 'Enabler',
  handtrap: 'Handtrap',
  disruption: 'Disruption',
  boardbreaker: 'Board Breaker',
  floodgate: 'Floodgate',
  removal: 'Removal',
  searcher: 'Searcher',
  draw: 'Draw',
  recovery: 'Recovery',
  combo_piece: 'Combo Piece',
  payoff: 'Payoff',
  brick: 'Brick',
  garnet: 'Garnet',
  tech: 'Tech',
}

export function RoleComparison({ rolesA, rolesB }: RoleComparisonProps) {
  const allRoles = Object.keys(ROLE_LABELS) as CardRole[]
  const visibleRoles = allRoles.filter((role) => rolesA[role] > 0 || rolesB[role] > 0)

  if (visibleRoles.length === 0) {
    return (
      <p className="app-muted m-0 text-[0.8rem]">No hay roles asignados en ninguna build.</p>
    )
  }

  return (
    <div className="grid gap-1">
      <div className="grid grid-cols-[minmax(0,1fr)_auto_auto_auto] gap-2 px-2 py-1">
        <span className="app-muted text-[0.68rem] uppercase tracking-[0.08em]">Rol</span>
        <span className="app-muted w-[3rem] text-right text-[0.68rem] uppercase tracking-[0.08em]">A</span>
        <span className="app-muted w-[3rem] text-right text-[0.68rem] uppercase tracking-[0.08em]">B</span>
        <span className="app-muted w-[3rem] text-right text-[0.68rem] uppercase tracking-[0.08em]">Δ</span>
      </div>

      {visibleRoles.map((role) => {
        const delta = rolesA[role] - rolesB[role]
        return (
          <div
            key={role}
            className="surface-card grid grid-cols-[minmax(0,1fr)_auto_auto_auto] items-center gap-2 px-2 py-1.5"
          >
            <span className="text-[0.84rem] text-(--text-main)">{ROLE_LABELS[role]}</span>
            <span className="w-[3rem] text-right text-[0.84rem] tabular-nums text-(--text-main)">{rolesA[role]}</span>
            <span className="w-[3rem] text-right text-[0.84rem] tabular-nums text-(--text-main)">{rolesB[role]}</span>
            <span className={`w-[3rem] text-right text-[0.84rem] tabular-nums ${getDeltaColor(delta)}`}>
              {delta === 0 ? '—' : `${delta > 0 ? '+' : ''}${delta}`}
            </span>
          </div>
        )
      })}
    </div>
  )
}

function getDeltaColor(delta: number): string {
  if (delta === 0) return 'text-(--text-muted)'
  return delta > 0 ? 'text-accent' : 'text-destructive'
}
