import { useMemo, useState } from 'react'

import type { SnapshotComparison, WorkspaceSnapshot } from '../app/workspace'
import type { DeckFormat } from '../types'
import { AdvancedWorkspacePanel } from './workspace/AdvancedWorkspacePanel'
import { WorkflowGuide } from './workspace/WorkflowGuide'

interface WorkspacePanelProps {
  deckFormat: DeckFormat
  formatIssues: string[]
  snapshots: WorkspaceSnapshot[]
  comparison: SnapshotComparison | null
  mainDeckCount: number
  classifiedCards: number
  totalClassifiableCards: number
  patternCount: number
  onDeckFormatChange: (format: DeckFormat) => void
  onSaveSnapshot: (name: string) => string
  onLoadSnapshot: (snapshotId: string) => string
  onCompareSnapshot: (snapshotId: string) => void
  onDeleteSnapshot: (snapshotId: string) => string
}

export function WorkspacePanel({
  deckFormat,
  formatIssues,
  snapshots,
  comparison,
  mainDeckCount,
  classifiedCards,
  totalClassifiableCards,
  patternCount,
  onDeckFormatChange,
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

  return (
    <section className="mx-auto grid w-full max-w-[1240px] gap-3">
      <WorkflowGuide
        mainDeckCount={mainDeckCount}
        classifiedCards={classifiedCards}
        totalClassifiableCards={totalClassifiableCards}
        patternCount={patternCount}
      />

      {statusMessage ? (
        <p className="surface-card-accent m-0 px-2 py-1.5 text-[0.76rem] text-[var(--text-main)]">
          {statusMessage}
        </p>
      ) : null}

      <AdvancedWorkspacePanel
        advancedOpen={advancedOpen}
        deckFormat={deckFormat}
        formatIssues={formatIssues}
        snapshotName={snapshotName}
        snapshots={snapshotItems}
        comparison={comparison}
        onToggleAdvanced={() => setAdvancedOpen((current) => !current)}
        onDeckFormatChange={onDeckFormatChange}
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
