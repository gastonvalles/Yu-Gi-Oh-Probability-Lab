import { Button } from '../ui/Button'

interface ConfirmDialogProps {
  cancelLabel?: string
  confirmLabel?: string
  description: string
  isOpen: boolean
  onCancel: () => void
  onConfirm: () => void
  title: string
}

export function ConfirmDialog({
  cancelLabel = 'Cancelar',
  confirmLabel = 'Confirmar',
  description,
  isOpen,
  onCancel,
  onConfirm,
  title,
}: ConfirmDialogProps) {
  if (!isOpen) {
    return null
  }

  return (
    <div className="fixed inset-0 z-[160] grid place-items-center bg-[rgb(var(--background-rgb)/0.74)] px-4">
      <div className="surface-panel grid w-full max-w-xl gap-3 p-4">
        <div className="grid gap-1">
          <p className="app-kicker m-0 text-[0.68rem] uppercase tracking-widest">Confirmacion</p>
          <h3 className="m-0 text-[1rem] leading-none text-(--text-main)">{title}</h3>
          <p className="app-muted m-0 text-[0.8rem] leading-[1.16]">{description}</p>
        </div>

        <div className="flex flex-wrap justify-end gap-2">
          <Button variant="secondary" size="sm" onClick={onCancel}>
            {cancelLabel}
          </Button>
          <Button variant="tertiary" size="sm" onClick={onConfirm}>
            {confirmLabel}
          </Button>
        </div>
      </div>
    </div>
  )
}
