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
      size="sm"
      role="alertdialog"
      kicker={t('lab.confirm.kicker')}
      title={title}
      footer={
        <>
          <Button variant="tertiary" size="sm" onClick={onCancel}>
            {cancelLabel}
          </Button>
          <Button variant={confirmVariant} color={confirmColor} size="sm" onClick={onConfirm}>
            {confirmLabel}
          </Button>
        </>
      }
    >
      <p className="text-muted m-0 text-body">{description}</p>
    </Modal>
  )
}
