import { useCallback, useEffect, useState } from 'react'

import { fromPortableConfig, toPortableConfig } from './app-state-codec'
import type { AppState } from './model'
import { replaceAppState } from './store'
import { useAppDispatch } from './store-hooks'
import {
  buildSnapshotComparison,
  createSnapshot,
  loadSnapshots,
  saveSnapshots,
  type SnapshotComparison,
  type WorkspaceSnapshot,
} from './workspace-snapshots'

interface WorkspaceSnapshotsController {
  compareSnapshot: (snapshotId: string) => void
  deleteSnapshot: (snapshotId: string) => string
  loadSnapshot: (snapshotId: string) => string
  saveSnapshot: (name: string) => string
  snapshotComparison: SnapshotComparison | null
  snapshots: WorkspaceSnapshot[]
}

export function useWorkspaceSnapshots(state: AppState): WorkspaceSnapshotsController {
  const dispatch = useAppDispatch()
  const [snapshots, setSnapshots] = useState<WorkspaceSnapshot[]>(() => loadSnapshots())
  const [snapshotComparison, setSnapshotComparison] = useState<SnapshotComparison | null>(null)

  useEffect(() => {
    setSnapshotComparison(null)
  }, [state])

  useEffect(() => {
    saveSnapshots(snapshots)
  }, [snapshots])

  const replaceState = useCallback((nextState: AppState) => {
    dispatch(replaceAppState(nextState))
    setSnapshotComparison(null)
  }, [dispatch])

  const saveSnapshot = useCallback(
    (name: string) => {
      setSnapshots((current) =>
        [createSnapshot(name || `Build ${current.length + 1}`, toPortableConfig(state)), ...current].slice(0, 12),
      )
      return 'Snapshot guardado.'
    },
    [state],
  )

  const loadSnapshot = useCallback(
    (snapshotId: string) => {
      const snapshot = snapshots.find((entry) => entry.id === snapshotId)

      if (!snapshot) {
        return 'No se encontró el snapshot.'
      }

      replaceState(fromPortableConfig(snapshot.config))
      return `Snapshot "${snapshot.name}" cargado.`
    },
    [replaceState, snapshots],
  )

  const compareSnapshot = useCallback(
    (snapshotId: string) => {
      const snapshot = snapshots.find((entry) => entry.id === snapshotId)

      if (!snapshot) {
        setSnapshotComparison(null)
        return
      }

      const snapshotState = fromPortableConfig(snapshot.config)
      setSnapshotComparison(buildSnapshotComparison(state, snapshotState, snapshot.name, snapshot.savedAt))
    },
    [snapshots, state],
  )

  const deleteSnapshot = useCallback((snapshotId: string) => {
    setSnapshots((current) => current.filter((snapshot) => snapshot.id !== snapshotId))
    setSnapshotComparison(null)
    return 'Snapshot eliminado.'
  }, [])

  return {
    compareSnapshot,
    deleteSnapshot,
    loadSnapshot,
    saveSnapshot,
    snapshotComparison,
    snapshots,
  }
}
