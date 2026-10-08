import type { PatternKind } from '../../../types'
import { Segmented } from '../../ui/Segmented'
import type { PatternEditorActions } from '../pattern-editor-actions'

interface KindToggleProps {
  patternId: string
  currentKind: PatternKind
  actions: PatternEditorActions
}

/** Salida (si se cumple, la mano arranca) o problema (la frena). */
export function KindToggle({ patternId, currentKind, actions }: KindToggleProps) {
  return (
    <Segmented
      label="Tipo de regla"
      value={currentKind}
      options={[
        { value: 'opening', label: 'Salida', tone: 'success' },
        { value: 'problem', label: 'Problema', tone: 'danger' },
      ]}
      onChange={(kind) => actions.setPatternCategory(patternId, kind)}
    />
  )
}
