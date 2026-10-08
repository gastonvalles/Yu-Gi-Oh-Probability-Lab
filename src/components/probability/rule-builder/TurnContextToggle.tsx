import type { TurnContext } from '../../../types'
import { Segmented } from '../../ui/Segmented'
import { Switch } from '../../ui/Switch'
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
      fullWidth
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

/** Yendo 2º, ¿se cuenta la carta que robás? (apagado: se mira sólo la mano inicial de 5). */
export function DrawCountToggle({ patternId, ignoresDraw, actions }: { patternId: string; ignoresDraw: boolean; actions: PatternEditorActions }) {
  return (
    <div className="flex items-center justify-between gap-3 py-1">
      <span className="text-body text-foreground">Contar la carta que robás yendo 2º</span>
      <Switch checked={!ignoresDraw} label="Contar la carta que robás yendo 2º" onChange={(counts) => actions.setPatternIgnoresDraw(patternId, !counts)} />
    </div>
  )
}
