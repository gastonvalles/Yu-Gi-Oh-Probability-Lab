import { useId, useState, type FormEvent } from 'react'

import { MAX_RULE_NAME_LENGTH, normalizeRuleName } from '../../app/pattern-presets'
import { Button } from '../ui/Button'
import { Modal } from '../ui/Modal'
import type { RuleEntry } from './probability-lab-helpers'

interface RuleRenameDialogProps {
  entry: RuleEntry
  /** Nombre vacío = volver al del catálogo. */
  onSave: (name: string) => void
  onClose: () => void
}

/** Las reglas universales sólo admiten cambiar el nombre: lo que miden no se toca. */
export function RuleRenameDialog({ entry, onSave, onClose }: RuleRenameDialogProps) {
  const [value, setValue] = useState(entry.name)
  const inputId = useId()
  const formId = useId()
  const defaultName = entry.defaultName ?? entry.name
  const nextName = normalizeRuleName(value) || defaultName
  const isChanged = nextName !== entry.name
  const isCustomized = entry.name !== defaultName

  const commit = (name: string) => {
    onSave(name === defaultName ? '' : name)
    onClose()
  }

  const handleSubmit = (event: FormEvent) => {
    event.preventDefault()

    if (isChanged) {
      commit(nextName)
    } else {
      onClose()
    }
  }

  return (
    <Modal
      isOpen
      onClose={onClose}
      size="sm"
      title="Nombre de la regla"
      footer={
        <>
          {isCustomized ? (
            <Button variant="tertiary" onClick={() => commit(defaultName)}>
              Restaurar
            </Button>
          ) : null}
          <Button variant="secondary" onClick={onClose}>
            Cancelar
          </Button>
          <Button variant="primary" type="submit" form={formId} disabled={!isChanged}>
            Guardar
          </Button>
        </>
      }
    >
      <form id={formId} className="lab-rename" onSubmit={handleSubmit}>
        <label htmlFor={inputId} className="lab-rename-label">
          <span className="lab-kind-badge" data-kind={entry.kind}>
            {entry.kind === 'opening' ? 'Salida' : 'Problema'}
          </span>
          Nombre
        </label>
        <input
          id={inputId}
          type="text"
          value={value}
          maxLength={MAX_RULE_NAME_LENGTH}
          placeholder={defaultName}
          autoFocus
          onFocus={(event) => event.target.select()}
          onChange={(event) => setValue(event.target.value)}
          className="app-field w-full px-3 py-2 text-[0.95rem]"
        />
      </form>
    </Modal>
  )
}
