import { useState } from 'react'

import { StepHero } from './StepHero'
import { Button } from './ui/Button'

interface ExportDeckPanelProps {
  mainDeckCount: number
  onExport: () => Promise<void>
}

export function ExportDeckPanel({ mainDeckCount, onExport }: ExportDeckPanelProps) {
  const [busy, setBusy] = useState(false)

  const handleExport = async () => {
    setBusy(true)

    try {
      await onExport()
    } catch {
      // El controller maneja el toast de error.
    } finally {
      setBusy(false)
    }
  }

  return (
    <article className="surface-panel p-2.5">
      <StepHero
        step="Paso 4"
        pill="Export"
        title="Exportá tu deck"
        description="Cuando ya tengas la lista armada, podés descargar una imagen del deck y un TXT con Main, Extra y Side en nombres en inglés."
        side={
          <Button
            variant="primary"
            size="lg"
            disabled={busy || mainDeckCount === 0}
            onClick={() => {
              void handleExport()
            }}
          >
            {busy ? 'Generando archivos...' : 'Descargar Deck'}
          </Button>
        }
        sideVariant="inline"
        sideClassName="min-[920px]:justify-end"
      />
    </article>
  )
}
