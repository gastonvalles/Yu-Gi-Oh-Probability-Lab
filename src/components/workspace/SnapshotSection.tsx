import type { SnapshotComparison, WorkspaceSnapshot } from '../../app/workspace'
import { formatInteger, formatPercent } from '../../app/utils'

interface SnapshotSectionProps {
  snapshots: WorkspaceSnapshot[]
  comparison: SnapshotComparison | null
  onLoadSnapshot: (snapshotId: string) => void
  onCompareSnapshot: (snapshotId: string) => void
  onDeleteSnapshot: (snapshotId: string) => void
}

export function SnapshotSection({
  snapshots,
  comparison,
  onLoadSnapshot,
  onCompareSnapshot,
  onDeleteSnapshot,
}: SnapshotSectionProps) {
  return (
    <article className="surface-panel-soft p-2">
      <div className="mb-2">
        <p className="app-kicker m-0 mb-0.5 text-[0.68rem] uppercase tracking-widest">Snapshots</p>
        <h3 className="m-0 text-[0.94rem] leading-none">Comparar builds</h3>
      </div>

      <div className="grid gap-2 min-[1180px]:grid-cols-[minmax(0,0.55fr)_minmax(0,0.45fr)]">
        <div className="grid gap-1.5">
          {snapshots.map((snapshot) => (
            <article
              key={snapshot.id}
              className="surface-card grid gap-2 px-2 py-1.5 min-[860px]:grid-cols-[minmax(0,1fr)_auto]"
            >
              <div className="min-w-0">
                <strong className="block truncate">{snapshot.name}</strong>
                <small className="app-muted text-[0.72rem]">
                  {new Date(snapshot.savedAt).toLocaleString('es-ES')}
                </small>
              </div>

              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  className="app-button px-2 py-1 text-[0.76rem]"
                  onClick={() => onLoadSnapshot(snapshot.id)}
                >
                  Cargar
                </button>
                <button
                  type="button"
                  className="app-button px-2 py-1 text-[0.76rem]"
                  onClick={() => onCompareSnapshot(snapshot.id)}
                >
                  Comparar
                </button>
                <button
                  type="button"
                  className="app-button px-2 py-1 text-[0.76rem]"
                  onClick={() => onDeleteSnapshot(snapshot.id)}
                >
                  Borrar
                </button>
              </div>
            </article>
          ))}
        </div>

        <div className="surface-card p-2">
          {!comparison ? (
            <p className="app-muted m-0 text-[0.76rem]">
              Elegí un snapshot para comparar la build actual contra una versión guardada.
            </p>
          ) : (
            <div className="grid gap-2">
              <div>
                <strong className="block">{comparison.snapshotName}</strong>
                <small className="app-muted text-[0.72rem]">
                  Guardado {new Date(comparison.savedAt).toLocaleString('es-ES')}
                </small>
              </div>

              <div className="grid gap-1 min-[720px]:grid-cols-3">
                <MetricBox label="Actual" value={formatComparisonProbability(comparison.currentProbability)} />
                <MetricBox label="Snapshot" value={formatComparisonProbability(comparison.snapshotProbability)} />
                <MetricBox
                  label="Delta"
                  value={
                    comparison.deltaProbability === null
                      ? 'N/D'
                      : `${comparison.deltaProbability >= 0 ? '+' : ''}${formatPercent(comparison.deltaProbability)}`
                  }
                />
              </div>

              <p className="app-muted m-0 text-[0.76rem]">
                Main actual: {formatInteger(comparison.currentDeckSize)} cartas. Snapshot: {formatInteger(comparison.snapshotDeckSize)} cartas.
              </p>

              {comparison.deckChanges.length === 0 ? (
                <p className="app-muted m-0 text-[0.76rem]">No hay diferencias en el Main Deck.</p>
              ) : (
                <div className="grid gap-1">
                  {comparison.deckChanges.slice(0, 12).map((change) => (
                    <small key={change} className="app-muted text-[0.74rem]">
                      {change}
                    </small>
                  ))}
                  {comparison.deckChanges.length > 12 ? (
                    <small className="app-muted text-[0.74rem]">
                      {formatInteger(comparison.deckChanges.length - 12)} cambios más no mostrados.
                    </small>
                  ) : null}
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </article>
  )
}

interface MetricBoxProps {
  label: string
  value: string
}

function MetricBox({ label, value }: MetricBoxProps) {
  return (
    <div className="surface-card px-2 py-1.5">
      <small className="app-muted block text-[0.68rem] uppercase tracking-[0.08em]">{label}</small>
      <strong className="text-[0.84rem] text-[var(--text-main)]">{value}</strong>
    </div>
  )
}

function formatComparisonProbability(value: number | null): string {
  return value === null ? 'N/D' : formatPercent(value)
}
