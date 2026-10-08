import { useState } from 'react'
import { Button } from '../ui/Button'
import { Modal } from '../ui/Modal'

const ACKNOWLEDGED_KEY = 'ygo-probability-lab:lab-disclaimer-ack:v1'

/** Aviso de cómo leer los %: se muestra al entrar al Lab hasta que se toca "Entendido". */
export function useLabDisclaimer() {
  const [isAcknowledged, setIsAcknowledged] = useState(readAcknowledged)
  const [isOpen, setIsOpen] = useState(!isAcknowledged)

  return {
    isOpen,
    /** Ya lo aceptó: si lo reabre por curiosidad, se puede cerrar como cualquier diálogo. */
    isAcknowledged,
    open: () => setIsOpen(true),
    acknowledge: () => {
      writeAcknowledged()
      setIsAcknowledged(true)
      setIsOpen(false)
    },
  }
}

export function LabDisclaimerDialog({ isOpen, dismissible = false, onAcknowledge }: { isOpen: boolean; dismissible?: boolean; onAcknowledge: () => void }) {
  return (
    <Modal
      isOpen={isOpen}
      onClose={onAcknowledge}
      size="sm"
      role="alertdialog"
      dismissible={dismissible}
      icon="info"
      tone="info"
      kicker="Antes de empezar"
      title="Cómo leer estos porcentajes"
      footer={
        <Button variant="primary" size="md" autoFocus onClick={onAcknowledge}>
          Entendido
        </Button>
      }
    >
      <div className="grid gap-2 text-body text-muted">
        <p className="m-0">
          Los porcentajes que vas a ver <strong className="text-foreground">no son una fuente irrefutable</strong> de
          información. Son estadísticas basadas en <strong className="text-foreground">tu</strong> entendimiento del
          deck y en la categorización que le diste a cada carta de la build.
        </p>
        <p className="m-0">Los resultados pueden variar de jugador en jugador.</p>
      </div>
    </Modal>
  )
}

function readAcknowledged(): boolean {
  try {
    return window.localStorage.getItem(ACKNOWLEDGED_KEY) === 'true'
  } catch {
    return false
  }
}

function writeAcknowledged(): void {
  try {
    window.localStorage.setItem(ACKNOWLEDGED_KEY, 'true')
  } catch {
    // Sin storage el aviso vuelve a mostrarse la próxima vez: no es un problema.
  }
}
