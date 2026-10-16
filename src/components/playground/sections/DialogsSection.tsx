import { useState } from 'react'

import type { LabResults, LabViewResult } from '../../../app/probability-lab'
import { showToastMessage, type ToastTone } from '../../../app/use-toast-message'
import { Button } from '../../ui/Button'
import { Modal } from '../../ui/Modal'
import { LabScoreSheet } from '../../probability/LabScoreSheet'
import { Specimen, SpecimenGrid, Tag } from '../Specimen'

const SIZES = ['sm', 'md', 'full', 'sheet', 'screen'] as const
const sampleView = (clean: number, handSize: number, cleanHands: number | null, totalHands: number | null): LabViewResult => ({
  handSize,
  cleanProbability: clean,
  noOpeningProbability: 1 - clean,
  withProblemProbability: 0,
  cleanHands,
  totalHands,
  patternResults: [],
  segmentRules: { clean: [], withProblem: [], noOpening: [] },
})
const SAMPLE_RESULTS: LabResults = { first: sampleView(0.846, 5, 556416, 658008), second: sampleView(0.903, 6, 4401234, 4874568), average: sampleView(0.875, 5, null, null) }
const TOASTS: ToastTone[] = ['info', 'success', 'warning', 'error']

/** Diálogos y avisos: se abren desde acá, tal cual se ven en la app. */
export function DialogsSection() {
  const [size, setSize] = useState<(typeof SIZES)[number] | null>(null)
  const [sheetOpen, setSheetOpen] = useState(false)

  return (
    <SpecimenGrid min="22rem">
      <Specimen title="Modal" note={<>Todo diálogo sale de <Tag>ui/Modal.tsx</Tag>; el tamaño es fijo y el cuerpo scrollea adentro.</>}>
        {SIZES.map((entry) => (
          <Button key={entry} size="sm" onClick={() => setSize(entry)}>
            {entry}
          </Button>
        ))}
        <Modal isOpen={size !== null} onClose={() => setSize(null)} size={size ?? 'sm'} kicker="Diálogo" icon="info" title={`Tamaño ${size ?? ''}`} subtitle="Un diálogo de prueba." footer={<Button onClick={() => setSize(null)}>Cerrar</Button>}>
          <p className="m-0 text-body text-muted">El contenido del diálogo scrollea adentro si no entra.</p>
        </Modal>
      </Specimen>

      <Specimen title="Ficha «Cómo se calcula»" note={<>Lo que abre la ⓘ de la tarjeta del resultado del Lab: una mano buena, las cuentas por turno y lo que el número no dice. Archivo: <Tag>probability/LabScoreSheet.tsx</Tag></>}>
        <Button size="sm" onClick={() => setSheetOpen(true)}>
          Abrir la ficha
        </Button>
        <LabScoreSheet isOpen={sheetOpen} onClose={() => setSheetOpen(false)} results={SAMPLE_RESULTS} handSize={5} onOpenDisclaimer={() => setSheetOpen(false)} />
      </Specimen>

      <Specimen title="Avisos (toast)" note={<>Aparecen abajo y se descartan deslizándolos. Archivos: <Tag>ui/AppToast.tsx</Tag> <Tag>app/use-toast-message.ts</Tag></>}>
        {TOASTS.map((tone) => (
          <Button key={tone} size="sm" onClick={() => showToastMessage(`Un aviso de tipo ${tone}`, tone)}>
            {tone}
          </Button>
        ))}
      </Specimen>
    </SpecimenGrid>
  )
}
