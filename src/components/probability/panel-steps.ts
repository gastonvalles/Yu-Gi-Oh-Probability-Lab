import type { ChainRowState } from '../../app/auto/chain-feed'
import { matArrows, type MatArrow } from '../../app/mat-arrows'
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
  /** Las flechas de su tablero: de dónde a dónde fue cada carta (`matArrows`). */
  arrows: MatArrow[]
  /** El color del paso, el de su destello en la mesa (el mismo de su pastilla en el reproductor); `null`, gris. */
  tone: FxTone | null
}

/**
 * Lo que la lista de pasos muestra de cada jugada (`labels` son sus frases, de `describeMatSteps`): las miniaturas (hasta tres, las que tienen imagen), la mesa de después
 * (`matStates`, un solo recorrido), la clase y lo que se mueve (`describeSteps`), sus flechas (`matArrows`) y el color (`stepTone`). Se calcula una vez por combo, no por paso:
 * avanzar no recalcula nada.
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
    arrows: matArrows(infos[index]!.moves, states[index + 1]!),
    tone: stepTone(states[index]!, action),
  }))
}

/** Tu jugada que sumó un eslabón (o que pagó su costo): en qué cadena del duelo (1 = la primera), qué eslabón (1 = CL1) y, ya resuelto, cómo: sin efecto, o los pasos que hizo (`from`–`to`; ninguno si `to < from`). */
export interface PanelChainMark {
  chain: number
  link: number
  /** Es una carta que se movió para pagar el costo de ese eslabón, no su activación (sin `result`). */
  cost?: true
  result: { negated: true } | { negated: false; from: number; to: number } | null
}

/** El renglón de cierre de una cadena terminada: cada eslabón (los del rival también) con su nombre y cómo terminó. */
export interface PanelChainEnd {
  chain: number
  links: Array<{ number: number; name: string; state: ChainRowState }>
}

/** Lo de las cadenas en la lista de pasos (duelo automático: `panelChainsOf`, en `step-chains.ts` de las piezas del modo automático), por número de paso: la marca de cada activación tuya y los cierres que van después de ese paso (0 = después de la mano inicial). */
export interface PanelChains {
  marks: ReadonlyMap<number, PanelChainMark>
  ends: ReadonlyMap<number, readonly PanelChainEnd[]>
}

