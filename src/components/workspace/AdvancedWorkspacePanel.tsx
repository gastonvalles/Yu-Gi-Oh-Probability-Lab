import { useState } from 'react'
import type { AppState } from '../../app/model'
import type { SnapshotComparison, WorkspaceSnapshot } from '../../app/workspace'
import { SnapshotSection } from './SnapshotSection'
import { ComparisonView } from '../comparison/ComparisonView'

interface AdvancedWorkspacePanelProps {
  advancedOpen: boolean
  snapshotName: string
  snapshots: WorkspaceSnapshot[]
  comparison: SnapshotComparison | null
  currentAppState: AppState
  onToggleAdvanced: () => void
  onSnapshotNameChange: (value: string) => void
  onSaveSnapshot: () => void
  onLoadSnapshot: (snapshotId: string) => void
  onCompareSnapshot: (snapshotId: string) => void
  onDeleteSnapshot: (snapshotId: string) => void
}

export function AdvancedWorkspacePanel({
  advancedOpen,
  snapshotName,
  snapshots,
  comparison,
  currentAppState,
  onToggleAdvanced,
  onSnapshotNameChange,
  onSaveSnapshot,
  onLoadSnapshot,
  onCompareSnapshot,
  onDeleteSnapshot,
}: AdvancedWorkspacePanelProps) {
  const snapshotCount = snapshots.length
  const [comparisonOpen, setComparisonOpen] = useState(false)

  if (!advancedOpen) {
    return (
      <div className="flex justify-end">
        <button
          type="button"
          className="app-button px-2 py-1 text-[0.8rem]"
          onClick={onToggleAdvanced}
        >
          Herramientas avanzadas
        </button>
      </div>
    )
  }

  return (
    <article className="surface-card p-2">
      <div className="flex items-center justify-between gap-3 max-[760px]:items-start max-[760px]:flex-col">
        <div className="min-w-0">
          <strong className="block text-[0.88rem] leading-none text-[var(--text-main)]">
            Herramientas avanzadas
          </strong>
          {advancedOpen ? (
            <p className="app-muted m-[0.28rem_0_0] text-[0.74rem] leading-[1.16]">
              Snapshots para guardar versiones y compararlas con la build actual.
            </p>
          ) : null}
        </div>

        <div className="flex flex-wrap items-center gap-2 max-[760px]:items-stretch">
          {snapshotCount > 0 ? (
            <span className="app-chip px-2 py-1 text-[0.74rem]">
              {snapshotCount} snapshot{snapshotCount === 1 ? '' : 's'}
            </span>
          ) : null}
          <button
            type="button"
            className="app-button px-2 py-1 text-[0.8rem] max-[760px]:w-full"
            onClick={onToggleAdvanced}
          >
            Ocultar
          </button>
        </div>
      </div>

      <div className="mt-2 grid gap-2 border-t border-[var(--border-subtle)] pt-2">
        <div className="surface-card grid gap-1 p-2">
          <span className="app-muted text-[0.68rem] uppercase tracking-[0.08em]">Guardar versión del deck</span>
          <p className="app-soft m-0 text-[0.72rem] leading-[1.14]">
            Te sirve para comparar después contra otra build sin rehacer el deck actual.
          </p>
          <div className="flex flex-wrap gap-2">
            <input
              type="text"
              value={snapshotName}
              onChange={(event) => onSnapshotNameChange(event.target.value)}
              placeholder="Nombre de la versión"
              className="app-field min-w-[220px] flex-1 px-2 py-[0.45rem] text-[0.84rem]"
            />
            <button
              type="button"
              className="app-button px-2 py-1 text-[0.8rem]"
              onClick={onSaveSnapshot}
            >
              Guardar
            </button>
          </div>
        </div>

        {snapshotCount > 0 ? (
          <SnapshotSection
            snapshots={snapshots}
            comparison={comparison}
            onLoadSnapshot={onLoadSnapshot}
            onCompareSnapshot={onCompareSnapshot}
            onDeleteSnapshot={onDeleteSnapshot}
          />
        ) : null}

        {comparisonOpen ? (
          <article className="surface-panel-soft p-2">
            <div className="mb-2 flex items-center justify-between gap-3">
              <div>
                <p className="app-kicker m-0 mb-0.5 text-[0.68rem] uppercase tracking-widest">Build Comparison</p>
                <h3 className="m-0 text-[0.94rem] leading-none">Comparar builds</h3>
              </div>
              <button
                type="button"
                className="app-button px-2 py-1 text-[0.76rem]"
                onClick={() => setComparisonOpen(false)}
              >
                Cerrar
              </button>
            </div>
            <ComparisonView snapshots={snapshots} currentAppState={currentAppState} />
          </article>
        ) : (
          <button
            type="button"
            className="app-button w-full px-2 py-1.5 text-[0.8rem]"
            onClick={() => setComparisonOpen(true)}
          >
            Comparar builds
          </button>
        )}
      </div>
    </article>
  )
}
