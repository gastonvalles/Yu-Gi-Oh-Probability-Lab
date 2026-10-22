import { useId, useState, type FormEvent } from 'react'

import { MAX_RULE_NAME_LENGTH, normalizeRuleName } from '../../app/pattern-presets'
import { useLeaving } from '../../app/use-presence'
import { t } from '../../i18n'
import { Button } from '../ui/Button'
import { cx } from '../ui/cx'
import { Icon } from '../ui/Icon'
import { Modal } from '../ui/Modal'
import { field } from '../ui/surfaces'
import { textLink } from '../ui/typography'
import type { RuleEntry } from './probability-lab-helpers'

interface RuleRenameDialogProps {
  entry: RuleEntry
  /** Nombre vacío = volver al del catálogo. */
  onSave: (name: string) => void
  onClose: () => void
}

/** Las reglas universales sólo admiten cambiar el nombre: lo que miden no se toca. Si ya tiene uno propio, «Original: «…» · Restaurar» lo devuelve. */
export function RuleRenameDialog({ entry, onSave, onClose }: RuleRenameDialogProps) {
  // Al cerrarse sigue montado mientras sale (lo monta un `Presence`): `isOpen={!leaving}` lo deja salir.
  const leaving = useLeaving()
  const [value, setValue] = useState(entry.name)
  const inputId = useId()
  const noteId = useId()
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
      title={t('builder.rename.title')}
      footer={
        <>
          <Button variant="tertiary" onClick={onClose}>
            {t('common.cancel')}
          </Button>
          <Button variant="primary" type="submit" form={formId} disabled={!isChanged}>
            {t('common.save')}
          </Button>
        </>
      }
    >
      <form id={formId} className="grid gap-3" onSubmit={handleSubmit}>
        <p id={noteId} className="m-0 grid gap-1 text-body text-foreground">
          <Icon name="lock" size={16} className="text-soft" />
          {t('builder.rename.note')}
        </p>
        <label htmlFor={inputId} className="sr-only">
          {t('builder.rename.name')}
        </label>
        <input
          id={inputId}
          type="text"
          value={value}
          maxLength={MAX_RULE_NAME_LENGTH}
          placeholder={defaultName}
          autoFocus
          aria-describedby={noteId}
          onFocus={(event) => event.target.select()}
          onChange={(event) => setValue(event.target.value)}
          className={cx(field, 'h-12 w-full px-3.5 text-body font-semibold')}
        />
        {isCustomized ? (
          <p className="m-0 text-body text-muted">
            {t('builder.rename.original', { name: defaultName })} ·{' '}
            <button type="button" className={textLink} onClick={() => commit(defaultName)}>
              {t('builder.rename.restore')}
            </button>
          </p>
        ) : null}
      </form>
    </Modal>
  )
}
