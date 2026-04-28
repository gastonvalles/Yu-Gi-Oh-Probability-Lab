import { useMemo, useState } from 'react'

import type { SnapshotComparison, WorkspaceSnapshot } from '../app/workspace'
import { selectAppState } from '../app/store'
import { useAppSelector } from '../app/store-hooks'
import { AdvancedWorkspacePanel } from './workspace/AdvancedWorkspacePanel'

interface WorkspacePanelProps {
  snapshots: WorkspaceSnapshot[]
  comparison: SnapshotComparison | null
  onSaveSnapshot: (name: string) => string
  onLoadSnapshot: (snapshotId: string) => string
  onCompareSnapshot: (snapshotId: string) => void
  onDeleteSnapshot: (snapshotId: string) => string
}

export function WorkspacePanel({
  snapshots,
  comparison,
  onSaveSnapshot,
  onLoadSnapshot,
  onCompareSnapshot,
  onDeleteSnapshot,
}: WorkspacePanelProps) {
  const [advancedOpen, setAdvancedOpen] = useState(false)
  const [snapshotName, setSnapshotName] = useState('')
  const [statusMessage, setStatusMessage] = useState('')

  const snapshotItems = useMemo(
    () => [...snapshots].sort((left, right) => right.savedAt - left.savedAt),
    [snapshots],
  )

  const currentAppState = useAppSelector(selectAppState)

  return (
    <section className="mx-auto grid w-full max-w-[1240px] gap-2.5">
      {statusMessage ? (
        <p className="surface-card-accent m-0 px-2 py-1.5 text-[0.76rem] text-[var(--text-main)]">
          {statusMessage}
        </p>
      ) : null}

      <AdvancedWorkspacePanel
        advancedOpen={advancedOpen}
        snapshotName={snapshotName}
        snapshots={snapshotItems}
        comparison={comparison}
        currentAppState={currentAppState}
        onToggleAdvanced={() => setAdvancedOpen((current) => !current)}
        onSnapshotNameChange={setSnapshotName}
        onSaveSnapshot={() => {
          setStatusMessage(onSaveSnapshot(snapshotName))
          setSnapshotName('')
        }}
        onLoadSnapshot={(snapshotId) => setStatusMessage(onLoadSnapshot(snapshotId))}
        onCompareSnapshot={onCompareSnapshot}
        onDeleteSnapshot={(snapshotId) => setStatusMessage(onDeleteSnapshot(snapshotId))}
      />
    </section>
  )
}
