import { useState } from 'react'
import { t } from '../../i18n'
import { tRich } from '../../i18n/rich'
import { Button } from '../ui/Button'
import { Modal } from '../ui/Modal'

/** Cómo leer los %: se abre a pedido, desde el enlace de la ficha «Cómo se calcula» (lo legal va en la ficha; no se impone antes del primer resultado). */
export function useLabDisclaimer() {
  const [isOpen, setIsOpen] = useState(false)

  return { isOpen, open: () => setIsOpen(true), close: () => setIsOpen(false) }
}

export function LabDisclaimerDialog({ isOpen, onClose }: { isOpen: boolean; onClose: () => void }) {
  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      size="sm"
      icon="info"
      tone="info"
      kicker={t('lab.disclaimer.kicker')}
      title={t('lab.disclaimer.title')}
      footer={
        <Button variant="primary" size="md" autoFocus onClick={onClose}>
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
