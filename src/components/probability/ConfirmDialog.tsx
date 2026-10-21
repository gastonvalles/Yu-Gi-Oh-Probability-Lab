import { t } from '../../i18n'
import { Button, type ButtonColor, type ButtonVariant } from '../ui/Button'
import { Modal } from '../ui/Modal'

interface ConfirmDialogProps {
  cancelLabel?: string
  /** Qué hace el botón principal ("Borrar combo", "Salir del duelo"): nunca un "Sí" ni un "Confirmar" a secas. */
  confirmLabel: string
  confirmColor?: ButtonColor
  confirmVariant?: ButtonVariant
  description: string
  isOpen: boolean
  onCancel: () => void
  onConfirm: () => void
  title: string
}

export function ConfirmDialog({
  cancelLabel = t('common.cancel'),
  confirmLabel,
  confirmColor = 'brand',
  confirmVariant = 'primary',
  description,
  isOpen,
  onCancel,
  onConfirm,
  title,
}: ConfirmDialogProps) {
  return (
    <Modal
      isOpen={isOpen}
      onClose={onCancel}
      size="keypad"
      role="alertdialog"
      title={title}
      footer={
        <>
          <Button variant="tertiary" size="md" onClick={onCancel}>
            {cancelLabel}
          </Button>
          <Button variant={confirmVariant} color={confirmColor} size="md" onClick={onConfirm}>
            {confirmLabel}
          </Button>
        </>
      }
    >
      <p className="text-muted m-0 text-body">{description}</p>
    </Modal>
  )
}
