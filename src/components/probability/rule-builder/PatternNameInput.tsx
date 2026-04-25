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

  return (
    <label className="grid gap-1">
      <span className="app-muted text-[0.68rem] uppercase tracking-widest">Nombre</span>
      <input
        type="text"
        value={currentName}
        autoFocus={isPendingCreation}
        placeholder={placeholder}
        onChange={(event) => actions.setPatternName(patternId, event.target.value)}
        className="app-field w-full px-2 py-[0.45rem] text-[0.84rem]"
      />
    </label>
  )
}
