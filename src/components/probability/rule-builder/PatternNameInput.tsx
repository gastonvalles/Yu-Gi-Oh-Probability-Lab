import { useEffect, useState } from 'react'

import type { PatternEditorActions } from '../pattern-editor-actions'

interface PatternNameInputProps {
  patternId: string
  currentName: string
  placeholderSummary: string
  isPendingCreation: boolean
  actions: PatternEditorActions
}

export function PatternNameInput({
  patternId,
  currentName,
  placeholderSummary,
  isPendingCreation,
  actions,
}: PatternNameInputProps) {
  const placeholder = placeholderSummary || 'Nombre de la regla (opcional)'
  const [localName, setLocalName] = useState(currentName)

  // Sync from store when the external value changes (e.g. undo, preset applied)
  useEffect(() => {
    setLocalName(currentName)
  }, [currentName])

  const commitName = () => {
    if (localName !== currentName) {
      actions.setPatternName(patternId, localName)
    }
  }

  return (
    <label className="grid gap-1">
      <span className="app-muted text-[0.68rem] uppercase tracking-widest">Nombre</span>
      <input
        type="text"
        value={localName}
        autoFocus={isPendingCreation}
        placeholder={placeholder}
        onChange={(event) => setLocalName(event.target.value)}
        onBlur={commitName}
        onKeyDown={(event) => {
          event.stopPropagation()
          if (event.key === 'Enter') {
            commitName()
            ;(event.target as HTMLInputElement).blur()
          }
        }}
        className="app-field w-full px-2 py-[0.45rem] text-[0.92rem]"
      />
    </label>
  )
}
