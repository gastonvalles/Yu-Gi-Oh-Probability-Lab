import { useMemo, useState } from 'react'
import type { AppState, PortableConfig } from '../../app/model'
import type { WorkspaceSnapshot } from '../../app/workspace'
import type { DeckSource } from '../../app/build-comparison'
import { compareBuild, interpretComparison } from '../../app/build-comparison'
import { toPortableConfig } from '../../app/app-state-codec'
import { VerdictCard } from './VerdictCard'
import { InsightList } from './InsightList'
import { ProbabilityComparison } from './ProbabilityComparison'
import { RoleComparison } from './RoleComparison'
import { CardDiffList } from './CardDiffList'

interface ComparisonViewProps {
  snapshots: WorkspaceSnapshot[]
  currentAppState: AppState
}

export function ComparisonView({ snapshots, currentAppState }: ComparisonViewProps) {
  const [sourceA, setSourceA] = useState<DeckSource>({ type: 'workspace' })
  const [sourceB, setSourceB] = useState<DeckSource>(
    snapshots.length > 0 ? { type: 'snapshot', snapshotId: snapshots[0].id } : { type: 'workspace' },
  )

  const configA = useMemo(() => resolveConfig(sourceA, currentAppState, snapshots), [sourceA, currentAppState, snapshots])
  const configB = useMemo(() => resolveConfig(sourceB, currentAppState, snapshots), [sourceB, currentAppState, snapshots])

  const sameSources = sourceA.type === sourceB.type &&
    (sourceA.type === 'workspace' || (sourceA.type === 'snapshot' && sourceB.type === 'snapshot' && sourceA.snapshotId === sourceB.snapshotId))

  const comparisonResult = useMemo(() => compareBuild(configA, configB), [configA, configB])
  const interpretation = useMemo(() => interpretComparison(comparisonResult), [comparisonResult])

  if (snapshots.length === 0) {
    return (
      <div className="surface-card px-4 py-4">
        <p className="app-muted m-0 text-[0.84rem]">
          Necesitás al menos un snapshot guardado para comparar builds. Guardá una versión del deck primero.
        </p>
      </div>
    )
  }

  return (
    <div className="grid gap-3">
      <div className="grid gap-2 min-[720px]:grid-cols-2">
        <SourceSelector
          label="Build A"
          value={sourceA}
          onChange={setSourceA}
          snapshots={snapshots}
        />
        <SourceSelector
          label="Build B"
          value={sourceB}
          onChange={setSourceB}
          snapshots={snapshots}
        />
      </div>

      {sameSources ? (
        <div className="surface-card-warning px-3 py-2">
          <p className="m-0 text-[0.8rem] text-(--text-main)">
            Ambas fuentes son iguales — las builds son idénticas.
          </p>
        </div>
      ) : null}

      <VerdictCard verdict={interpretation.verdict} />
      <InsightList insights={interpretation.insights} />

      <details className="surface-panel-soft rounded-(--radius-panel)">
        <summary className="cursor-pointer px-3 py-2 text-[0.84rem] text-(--text-main)">
          Datos detallados
        </summary>
        <div className="grid gap-4 px-3 pb-3 pt-2">
          <ProbabilityComparison
            patterns={comparisonResult.patternComparisons}
            totalOpeningsA={comparisonResult.totalOpeningProbabilityA}
            totalOpeningsB={comparisonResult.totalOpeningProbabilityB}
            totalProblemsA={comparisonResult.totalProblemProbabilityA}
            totalProblemsB={comparisonResult.totalProblemProbabilityB}
          />
          <RoleComparison
            rolesA={comparisonResult.rolesA}
            rolesB={comparisonResult.rolesB}
          />
          <CardDiffList
            diffs={comparisonResult.cardDiffs}
            deckSizeA={comparisonResult.deckSizeA}
            deckSizeB={comparisonResult.deckSizeB}
          />
        </div>
      </details>
    </div>
  )
}


interface SourceSelectorProps {
  label: string
  value: DeckSource
  onChange: (source: DeckSource) => void
  snapshots: WorkspaceSnapshot[]
}

function SourceSelector({ label, value, onChange, snapshots }: SourceSelectorProps) {
  const currentValue = value.type === 'workspace' ? 'workspace' : value.snapshotId

  function handleChange(event: React.ChangeEvent<HTMLSelectElement>) {
    const selected = event.target.value
    if (selected === 'workspace') {
      onChange({ type: 'workspace' })
    } else {
      onChange({ type: 'snapshot', snapshotId: selected })
    }
  }

  return (
    <div className="grid gap-1">
      <span className="app-muted text-[0.68rem] uppercase tracking-[0.08em]">{label}</span>
      <select
        className="app-field px-2 py-[0.45rem] text-[0.84rem]"
        value={currentValue}
        onChange={handleChange}
      >
        <option value="workspace">Workspace actual</option>
        {snapshots.map((snapshot) => (
          <option key={snapshot.id} value={snapshot.id}>
            {snapshot.name}
          </option>
        ))}
      </select>
    </div>
  )
}

function resolveConfig(
  source: DeckSource,
  currentAppState: AppState,
  snapshots: WorkspaceSnapshot[],
): PortableConfig {
  if (source.type === 'workspace') {
    return toPortableConfig(currentAppState)
  }

  const snapshot = snapshots.find((s) => s.id === source.snapshotId)
  if (snapshot) {
    return snapshot.config
  }

  // Fallback to workspace if snapshot not found
  return toPortableConfig(currentAppState)
}
