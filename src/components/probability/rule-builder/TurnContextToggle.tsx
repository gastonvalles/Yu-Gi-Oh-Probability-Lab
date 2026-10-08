import type { TurnContext } from '../../../types'
import type { PatternEditorActions } from '../pattern-editor-actions'
import { Switch } from '../../ui/Switch'
import { ChoiceCards } from './ChoiceCards'

interface TurnContextToggleProps {
  patternId: string
  currentTurnContext: TurnContext
  ignoresDraw?: boolean
  actions: PatternEditorActions
}

const TURN_OPTIONS = [
  { value: 'either', label: 'Siempre', description: 'Cuenta yendo 1º y 2º.' },
  { value: 'first', label: 'Solo yendo 1º', description: 'Mano de 5 cartas.' },
  { value: 'second', label: 'Solo yendo 2º', description: 'Mano de 6 cartas.' },
] as const

export function TurnContextToggle({ patternId, currentTurnContext, ignoresDraw = false, actions }: TurnContextToggleProps) {
  return (
    <div className="grid gap-2">
    <ChoiceCards
      label="Contexto de turno"
      value={currentTurnContext}
      options={TURN_OPTIONS}
      onChange={(turnContext) => actions.setPatternTurnContext(patternId, turnContext)}
    />
    {currentTurnContext !== 'first' ? (
      <div className="flex items-center justify-between gap-3 py-1">
        <span className="grid gap-0.5">
          <span className="text-body font-medium text-foreground">Contar la carta que robás yendo 2º</span>
          <span className="text-micro text-muted">
            {ignoresDraw
              ? 'Yendo 2º se mira la mano inicial de 5 (ej. interacción del turno rival).'
              : 'Yendo 2º se miran las 6 cartas.'}
          </span>
        </span>
        <Switch
          checked={!ignoresDraw}
          label="Contar la carta que robás yendo 2º"
          onChange={(counts) => actions.setPatternIgnoresDraw(patternId, !counts)}
        />
      </div>
    ) : null}
    </div>
  )
}
