import { useId, useState, type FormEvent } from 'react'

import { MAX_RULE_NAME_LENGTH, normalizeRuleName } from '../../app/pattern-presets'
import { useLeaving } from '../../app/use-presence'
import { t } from '../../i18n'
import { Button } from '../ui/Button'
import { Modal } from '../ui/Modal'
import { KindBadge } from './KindBadge'
import type { RuleEntry } from './probability-lab-helpers'
import { field } from '../ui/surfaces'

interface RuleRenameDialogProps {
  entry: RuleEntry
  /** Nombre vacío = volver al del catálogo. */
  onSave: (name: string) => void
  onClose: () => void
}

/** Las reglas universales sólo admiten cambiar el nombre: lo que miden no se toca. */
export function RuleRenameDialog({ entry, onSave, onClose }: RuleRenameDialogProps) {
  // Al cerrarse sigue montado mientras sale (lo monta un `Presence`): `isOpen={!leaving}` lo deja salir.
  const leaving = useLeaving()
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
      isOpen={!leaving}
      onClose={onClose}
      size="sm"
      icon="pencil"
      title={t('builder.rename.title')}
      footer={
        <>
          {isCustomized ? (
            <Button variant="tertiary" onClick={() => commit(defaultName)}>
              {t('builder.rename.restore')}
            </Button>
          ) : null}
          <Button variant="tertiary" onClick={onClose}>
            {t('common.cancel')}
          </Button>
          <Button variant="primary" type="submit" form={formId} disabled={!isChanged}>
            {t('common.save')}
          </Button>
        </>
      }
    >
      <form id={formId} className="grid gap-2.5" onSubmit={handleSubmit}>
        <label htmlFor={inputId} className="flex items-center gap-2 text-body font-semibold text-muted">
          <KindBadge kind={entry.kind} />
          {t('builder.rename.name')}
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
          className={`${field} h-11 w-full px-3 text-lead`}
        />
      </form>
    </Modal>
  )
}
