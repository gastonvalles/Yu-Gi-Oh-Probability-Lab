import { Button, type ButtonColor, type ButtonVariant } from '../ui/Button'
import { Modal } from '../ui/Modal'

interface ConfirmDialogProps {
  cancelLabel?: string
  confirmLabel?: string
  confirmColor?: ButtonColor
  confirmVariant?: ButtonVariant
  description: string
  isOpen: boolean
  onCancel: () => void
  onConfirm: () => void
  title: string
}

export function ConfirmDialog({
  cancelLabel = 'Cancelar',
  confirmLabel = 'Confirmar',
  confirmColor = 'foreground',
  confirmVariant = 'tertiary',
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
      size="sm"
      role="alertdialog"
      kicker="Confirmación"
      title={title}
      footer={
        <>
          <Button variant="secondary" size="sm" onClick={onCancel}>
            {cancelLabel}
          </Button>
          <Button variant={confirmVariant} color={confirmColor} size="sm" onClick={onConfirm}>
            {confirmLabel}
          </Button>
        </>
      }
    >
      <p className="app-muted m-0 text-[0.86rem] leading-[1.4]">{description}</p>
    </Modal>
  )
}
