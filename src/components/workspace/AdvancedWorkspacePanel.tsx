import { getDeckFormatLabel } from '../../app/deck-utils'
import type { SnapshotComparison, WorkspaceSnapshot } from '../../app/workspace'
import type { DeckFormat } from '../../types'
import { SnapshotSection } from './SnapshotSection'

interface AdvancedWorkspacePanelProps {
  advancedOpen: boolean
  deckFormat: DeckFormat
  formatIssues: string[]
  snapshotName: string
  snapshots: WorkspaceSnapshot[]
  comparison: SnapshotComparison | null
  onToggleAdvanced: () => void
  onDeckFormatChange: (format: DeckFormat) => void
  onSnapshotNameChange: (value: string) => void
  onSaveSnapshot: () => void
  onLoadSnapshot: (snapshotId: string) => void
  onCompareSnapshot: (snapshotId: string) => void
  onDeleteSnapshot: (snapshotId: string) => void
}

export function AdvancedWorkspacePanel({
  advancedOpen,
  deckFormat,
  formatIssues,
  snapshotName,
  snapshots,
  comparison,
  onToggleAdvanced,
  onDeckFormatChange,
  onSnapshotNameChange,
  onSaveSnapshot,
  onLoadSnapshot,
  onCompareSnapshot,
  onDeleteSnapshot,
}: AdvancedWorkspacePanelProps) {
  const snapshotCount = snapshots.length

  return (
    <article className="surface-panel p-2">
      <div className="flex items-start justify-between gap-3 max-[900px]:flex-col max-[900px]:items-stretch">
        <div className="grid gap-1">
          <p className="app-kicker m-0 mb-0.5 text-[0.68rem] uppercase tracking-widest">Workspace</p>
          <h2 className="m-0 text-[1rem] leading-none">Herramientas avanzadas</h2>
          <p className="app-muted m-0 max-w-[56ch] text-[0.76rem] leading-[1.18] max-[760px]:hidden">
            Opcional: cambiá formato y guardá versiones del deck sin tocar el flujo principal.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2 max-[760px]:items-stretch">
          <span className="app-chip px-2 py-1 text-[0.74rem]">
            Formato: {getDeckFormatLabel(deckFormat)}
          </span>
          <span className="app-chip px-2 py-1 text-[0.74rem]">
            Snapshots: {snapshotCount}
          </span>
          <button
            type="button"
            className="app-button px-2 py-1 text-[0.8rem] max-[760px]:w-full"
            onClick={onToggleAdvanced}
          >
            {advancedOpen ? 'Ocultar herramientas' : 'Mostrar herramientas'}
          </button>
        </div>
      </div>

      {advancedOpen ? (
        <div className="mt-2 grid gap-2">
          <div className="grid gap-2 min-[980px]:grid-cols-[240px_minmax(260px,0.46fr)_minmax(0,1fr)] min-[980px]:items-end">
            <label className="grid gap-1">
              <span className="app-muted text-[0.68rem] uppercase tracking-[0.08em]">Formato</span>
              <select
                value={deckFormat}
                onChange={(event) => onDeckFormatChange(event.target.value as DeckFormat)}
                className="app-field w-full px-2 py-[0.45rem] text-[0.84rem]"
              >
                <option value="unlimited">Sin límite</option>
                <option value="tcg">TCG</option>
                <option value="ocg">OCG</option>
                <option value="goat">GOAT</option>
              </select>
            </label>

            <div className="grid gap-1">
              <span className="app-muted text-[0.68rem] uppercase tracking-[0.08em]">Guardar snapshot</span>
              <div className="flex flex-wrap gap-2">
                <input
                  type="text"
                  value={snapshotName}
                  onChange={(event) => onSnapshotNameChange(event.target.value)}
                  placeholder="Nombre del snapshot"
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

            {formatIssues.length > 0 ? (
              <div className="grid gap-1.5">
                {formatIssues.map((issue) => (
                  <p key={issue} className="surface-card m-0 px-2 py-1.5 text-[0.76rem] text-[#f2d077]">
                    {issue}
                  </p>
                ))}
              </div>
            ) : (
              <p className="surface-card m-0 px-2 py-1.5 text-[0.76rem] text-[var(--text-muted)]">
                El deck actual respeta el perfil {getDeckFormatLabel(deckFormat)}.
              </p>
            )}
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
        </div>
      ) : null}
    </article>
  )
}
