import { formatPercent } from '../../app/utils'
import type { ProbabilityCausalEntry } from './probability-lab-helpers'

interface ResultsDetailPanelProps {
  isOpen: boolean
  onClose: () => void
  openingEntries: ProbabilityCausalEntry[]
  problemEntries: ProbabilityCausalEntry[]
}

export function ResultsDetailPanel({
  isOpen,
  onClose,
  openingEntries,
  problemEntries,
}: ResultsDetailPanelProps) {
  if (!isOpen) {
    return null
  }

  return (
    <>
      <div className="fixed inset-0 z-120 bg-[rgb(var(--background-rgb)/0.7)] min-[980px]:hidden" onClick={onClose} />
      <section className="surface-panel fixed inset-x-0 bottom-0 z-130 grid max-h-[78vh] grid-rows-[auto_minmax(0,1fr)] gap-0 rounded-t-[1.4rem] border border-(--border-subtle) p-0 shadow-[0_-18px_36px_rgba(0,0,0,0.34)] min-[980px]:static min-[980px]:max-h-none min-[980px]:rounded-none min-[980px]:shadow-none">
        <div className="flex items-center justify-between gap-2 border-b border-(--border-subtle) px-4 py-3">
          <div className="grid gap-0.5">
            <p className="app-kicker m-0 text-[0.68rem] uppercase tracking-widest">Detalle completo</p>
            <strong className="text-[0.94rem] text-(--text-main)">Aperturas y problemas activos</strong>
          </div>
          <button
            type="button"
            className="app-icon-button text-[1rem] leading-none"
            aria-label="Cerrar detalle"
            onClick={onClose}
          >
            ×
          </button>
        </div>

        <div className="grid min-h-0 gap-3 overflow-y-auto px-4 py-4 min-[980px]:grid-cols-2">
          <DetailGroup
            entries={openingEntries}
            emptyMessage="No hay aperturas activas."
            title="Aperturas"
          />
          <DetailGroup
            entries={problemEntries}
            emptyMessage="No hay problemas activos."
            title="Problemas"
          />
        </div>
      </section>
    </>
  )
}

function DetailGroup({
  entries,
  emptyMessage,
  title,
}: {
  entries: ProbabilityCausalEntry[]
  emptyMessage: string
  title: string
}) {
  return (
    <div className="grid content-start gap-2">
      <div className="flex items-center justify-between gap-2">
        <strong className="text-[0.9rem] text-(--text-main)">{title}</strong>
        <span className="surface-card px-2 py-0.5 text-[0.68rem] text-(--text-muted)">{entries.length}</span>
      </div>

      {entries.length === 0 ? (
        <p className="surface-card m-0 px-3 py-3 text-[0.78rem] text-(--text-muted)">
          {emptyMessage}
        </p>
      ) : (
        <div className="grid gap-2">
          {entries.map((entry) => (
            <article key={entry.patternId} className="surface-card grid gap-1.5 px-3 py-3">
              <div className="flex items-start justify-between gap-3">
                <div className="grid gap-1">
                  <strong className="text-[0.88rem] text-(--text-main)">{entry.name}</strong>
                  <p className="app-muted m-0 text-[0.76rem] leading-[1.14]">{entry.previewSummary}</p>
                </div>
                <strong className="text-[0.92rem] leading-none text-(--text-main)">
                  {entry.possible ? formatPercent(entry.probability) : '0.0%'}
                </strong>
              </div>
              <p className="m-0 text-[0.76rem] text-(--text-main)">
                {entry.kind === 'opening'
                  ? `Muy consistente al abrir ${entry.name} — ${formatPercent(entry.probability)}`
                  : `El riesgo ${entry.name} aparece en ${formatPercent(entry.probability)}`}
              </p>
            </article>
          ))}
        </div>
      )}
    </div>
  )
}
