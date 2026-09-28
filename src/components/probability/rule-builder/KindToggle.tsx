import type { PatternKind } from '../../../types'
import type { PatternEditorActions } from '../pattern-editor-actions'
import { ChoiceCards } from './ChoiceCards'

interface KindToggleProps {
  patternId: string
  currentKind: PatternKind
  actions: PatternEditorActions
}

const KIND_OPTIONS = [
  { value: 'opening', label: 'Salida', description: 'Si se cumple, la mano puede arrancar.' },
  { value: 'problem', label: 'Problema', description: 'Si se cumple, la mano se frena aunque tenga salida.' },
] as const

export function KindToggle({ patternId, currentKind, actions }: KindToggleProps) {
  return (
    <ChoiceCards
      label="Tipo de regla"
      value={currentKind}
      options={KIND_OPTIONS}
      tone={(kind) => (kind === 'opening' ? 'positive' : 'negative')}
      onChange={(kind) => actions.setPatternCategory(patternId, kind)}
    />
  )
}
