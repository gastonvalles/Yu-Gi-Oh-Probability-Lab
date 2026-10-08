import type { TurnContext } from '../../../types'
import { Segmented } from '../../ui/Segmented'
import type { PatternEditorActions } from '../pattern-editor-actions'

interface TurnContextToggleProps {
  patternId: string
  currentTurnContext: TurnContext
  actions: PatternEditorActions
}

/** En qué turno cuenta la regla: siempre, sólo yendo 1º (mano de 5) o sólo yendo 2º (mano de 6). */
export function TurnContextToggle({ patternId, currentTurnContext, actions }: TurnContextToggleProps) {
  return (
    <Segmented
      label="Contexto de turno"
      value={currentTurnContext}
      options={[
        { value: 'either', label: 'Siempre' },
        { value: 'first', label: 'Solo yendo 1º' },
        { value: 'second', label: 'Solo yendo 2º' },
      ]}
      onChange={(turnContext) => actions.setPatternTurnContext(patternId, turnContext)}
    />
  )
}
