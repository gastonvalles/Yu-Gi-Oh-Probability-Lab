import type { TurnContext } from '../../../types'
import { t } from '../../../i18n'
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
      label={t('builder.turn.label')}
      value={currentTurnContext}
      options={[
        { value: 'either', label: t('builder.turn.either') },
        { value: 'first', label: t('builder.turn.first') },
        { value: 'second', label: t('builder.turn.second') },
      ]}
      onChange={(turnContext) => actions.setPatternTurnContext(patternId, turnContext)}
    />
  )
}
