import { describeSteps, matStates, type StepInfo } from '../../app/mat-step-info'
import { matStepCards } from '../../app/mat-steps'
import type { MatAction, MatState } from '../../app/practice-mat'
import type { FxTone } from './practice-styles'
import { stepTone } from './step-tone'

/** Una jugada de la lista: la frase que la cuenta, si es un cambio de fase o de turno (hace de cabecera), las miniaturas de las cartas que mueve, la mesa de después y lo que se sabe de ella. */
export interface PanelStep {
  label: string
  divider: boolean
  cards: Array<{ name: string; art: string }>
  /** La mesa después de la jugada: su tablero chico. */
  after: MatState
  /** La clase de la jugada (el chip), de dónde sale la carta, qué se mueve y qué casillas cambian (`mat-step-info`). */
  info: StepInfo
  /** El color del paso, el de su destello en la mesa (el mismo de su pastilla en el reproductor); `null`, gris. */
  tone: FxTone | null
}

/**
 * Lo que la lista de pasos muestra de cada jugada (`labels` son sus frases, de `describeMatSteps`): las miniaturas (hasta tres, las que tienen imagen), la mesa de después
 * (`matStates`, un solo recorrido), la clase y lo que se mueve (`describeSteps`) y el color (`stepTone`). Se calcula una vez por combo, no por paso: avanzar no recalcula nada.
 */
export function panelStepsOf(initial: MatState, actions: readonly MatAction[], labels: readonly string[], nameOf: (id: string) => string, artOf: (id: string) => string | null): PanelStep[] {
  const states = matStates(initial, actions)
  const infos = describeSteps(initial, actions, states)
  const cards = matStepCards(initial, actions)

  return actions.map((action, index) => ({
    label: labels[index] ?? '',
    divider: action.type === 'phase',
    cards: (cards[index] ?? []).slice(0, 3).flatMap((id) => {
      const art = artOf(id)

      return art ? [{ name: nameOf(id), art }] : []
    }),
    after: states[index + 1]!,
    info: infos[index]!,
    tone: stepTone(states[index]!, action),
  }))
}
