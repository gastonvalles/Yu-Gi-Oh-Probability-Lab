import { useEffect, useState } from 'react'

import { MAX_RULE_NAME_LENGTH } from '../../../app/pattern-presets'
import { t } from '../../../i18n'
import type { PatternEditorActions } from '../pattern-editor-actions'
import { cx } from '../../ui/cx'
import { field } from '../../ui/surfaces'

interface PatternNameInputProps {
  id: string
  patternId: string
  currentName: string
  actions: PatternEditorActions
}

/** El nombre es opcional: vacío, al guardar se usa la frase de la regla. Se guarda en el borrador al salir del campo o con Enter (escribir no recalcula nada). */
export function PatternNameInput({ id, patternId, currentName, actions }: PatternNameInputProps) {
  const [localName, setLocalName] = useState(currentName)

  // Si el nombre cambia desde afuera (un ejemplo, deshacer), el campo lo sigue.
  useEffect(() => {
    setLocalName(currentName)
  }, [currentName])

  const commitName = () => {
    if (localName !== currentName) {
      actions.setPatternName(patternId, localName)
    }
  }

  return (
    <input
      id={id}
      type="text"
      value={localName}
      maxLength={MAX_RULE_NAME_LENGTH}
      placeholder={t('builder.field.namePlaceholder')}
      onChange={(event) => setLocalName(event.target.value)}
      onBlur={commitName}
      onKeyDown={(event) => {
        // Escape sigue de largo para cerrar el editor.
        if (event.key !== 'Escape') {
          event.stopPropagation()
        }
        if (event.key === 'Enter') {
          commitName()
          ;(event.target as HTMLInputElement).blur()
        }
      }}
      className={cx(field, 'h-12 w-full px-3.5 text-body placeholder:text-soft')}
    />
  )
}
