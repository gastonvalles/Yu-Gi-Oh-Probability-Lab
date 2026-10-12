import { useState } from 'react'
import { t } from '../../i18n'
import { tRich } from '../../i18n/rich'
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
      kicker={t('lab.disclaimer.kicker')}
      title={t('lab.disclaimer.title')}
      footer={
        <Button variant="primary" size="md" autoFocus onClick={onAcknowledge}>
          {t('lab.disclaimer.acknowledge')}
        </Button>
      }
    >
      <div className="grid gap-2 text-body text-muted">
        <p className="m-0">{tRich('lab.disclaimer.body', { b: (text) => <strong className="text-foreground">{text}</strong> })}</p>
        <p className="m-0">{t('lab.disclaimer.variance')}</p>
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
