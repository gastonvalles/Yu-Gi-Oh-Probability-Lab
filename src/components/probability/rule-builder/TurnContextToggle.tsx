import type { TurnContext } from '../../../types'
import type { PatternEditorActions } from '../pattern-editor-actions'
import { ChoiceCards } from './ChoiceCards'

interface TurnContextToggleProps {
  patternId: string
  currentTurnContext: TurnContext
  actions: PatternEditorActions
}

const TURN_OPTIONS = [
  { value: 'either', label: 'Siempre', description: 'Cuenta yendo 1º y 2º.' },
  { value: 'first', label: 'Solo yendo 1º', description: 'Mano de 5 cartas.' },
  { value: 'second', label: 'Solo yendo 2º', description: 'Mano de 6 cartas.' },
] as const

export function TurnContextToggle({ patternId, currentTurnContext, actions }: TurnContextToggleProps) {
  return (
    <ChoiceCards
      label="Contexto de turno"
      value={currentTurnContext}
      options={TURN_OPTIONS}
      onChange={(turnContext) => actions.setPatternTurnContext(patternId, turnContext)}
    />
  )
}
