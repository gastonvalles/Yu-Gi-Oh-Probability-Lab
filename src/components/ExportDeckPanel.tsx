import { useState } from 'react'

interface ExportDeckPanelProps {
  mainDeckCount: number
  onExport: () => Promise<string>
}

export function ExportDeckPanel({ mainDeckCount, onExport }: ExportDeckPanelProps) {
  const [busy, setBusy] = useState(false)
  const [statusMessage, setStatusMessage] = useState('')

  const handleExport = async () => {
    setBusy(true)

    try {
      setStatusMessage(await onExport())
    } catch (error) {
      setStatusMessage(error instanceof Error ? error.message : 'No se pudo exportar la imagen del deck.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <article className="surface-panel p-2.5">
      <div className="grid gap-2 min-[920px]:grid-cols-[minmax(0,1fr)_auto] min-[920px]:items-end">
        <div>
          <p className="app-kicker m-0 mb-0.5 text-[0.68rem] uppercase tracking-widest">Cierre</p>
          <h2 className="m-0 text-[1rem] leading-none">Exportá tu deck como imagen</h2>
          <p className="app-muted m-[0.3rem_0_0] max-w-[62ch] text-[0.76rem] leading-[1.18]">
            Cuando ya tengas la lista armada, podés descargar una imagen con Main, Extra y Side Deck para guardarla o compartirla.
          </p>
        </div>

        <button
          type="button"
          disabled={busy || mainDeckCount === 0}
          className="app-button app-button-primary px-3 py-2 text-[0.84rem]"
          onClick={() => {
            void handleExport()
          }}
        >
          {busy ? 'Generando imagen...' : 'Descargar imagen del deck'}
        </button>
      </div>

      {statusMessage ? (
        <p className="surface-card mt-2 m-0 px-2 py-1.5 text-[0.76rem] text-[var(--text-main)]">
          {statusMessage}
        </p>
      ) : null}
    </article>
  )
}
