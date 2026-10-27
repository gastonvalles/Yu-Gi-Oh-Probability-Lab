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

type NameOf = (id: string) => string
type ArtOf = (id: string) => string | null

/** Lo caro de un paso, que sale sólo de la mesa de antes y de la jugada (ni las frases ni los nombres): lo que `createPanelSteps` guarda entre una llamada y la otra. */
interface StepCore {
  action: MatAction
  after: MatState
  info: StepInfo
  arrows: MatArrow[]
  tone: FxTone | null
  /** Las cartas de la miniatura (hasta tres), antes de saber cuáles tienen imagen. */
  ids: string[]
}

/** Lo caro de cada jugada desde la mesa `before` (`matStates`, un solo recorrido; `describeSteps`, `matStepCards`, `matArrows` y `stepTone`): cada paso mira sólo su mesa de antes, la de después y su jugada. */
function coresOf(before: MatState, actions: readonly MatAction[]): StepCore[] {
  const states = matStates(before, actions)
  const infos = describeSteps(before, actions, states)
  const cards = matStepCards(before, actions)

  return actions.map((action, index) => ({
    action,
    after: states[index + 1]!,
    info: infos[index]!,
    arrows: matArrows(infos[index]!.moves, states[index + 1]!),
    tone: stepTone(states[index]!, action),
    ids: (cards[index] ?? []).slice(0, 3),
  }))
}

const cardsOf = (core: StepCore, nameOf: NameOf, artOf: ArtOf) =>
  core.ids.flatMap((id) => {
    const art = artOf(id)

    return art ? [{ name: nameOf(id), art }] : []
  })

const stepOf = (core: StepCore, label: string, cards: PanelStep['cards']): PanelStep => ({ label, divider: core.action.type === 'phase', cards, after: core.after, info: core.info, arrows: core.arrows, tone: core.tone })

/**
 * Lo que la lista de pasos muestra de cada jugada (`labels` son sus frases, de `describeMatSteps`): las miniaturas (hasta tres, las que tienen imagen), la mesa de después
 * (`matStates`, un solo recorrido), la clase y lo que se mueve (`describeSteps`), sus flechas (`matArrows`) y el color (`stepTone`). Se calcula una vez por combo, no por paso:
 * avanzar no recalcula nada. La mesa, que suma jugadas de a una, usa `createPanelSteps`.
 */
export function panelStepsOf(initial: MatState, actions: readonly MatAction[], labels: readonly string[], nameOf: NameOf, artOf: ArtOf): PanelStep[] {
  return coresOf(initial, actions).map((core, index) => stepOf(core, labels[index] ?? '', cardsOf(core, nameOf, artOf)))
}

const sameCards = (a: PanelStep['cards'], b: PanelStep['cards']) => a.length === b.length && a.every((card, index) => card.name === b[index]!.name && card.art === b[index]!.art)

/**
 * `panelStepsOf` para una mesa que crece de a una jugada (el duelo automático, la práctica): da lo mismo, pero rehace lo caro (`describeSteps`, ~33 µs por jugada) sólo desde la
 * primera jugada distinta de la llamada anterior (por referencia: el mismo `initial` y las mismas jugadas, como las deja `concat`); deshacer o cambiar una del medio la rehace
 * desde ahí. Las frases, los nombres y las imágenes se piden siempre (son baratos y `nameOf` cambia de identidad en cada render); un paso que no cambió en nada es el mismo
 * objeto de antes. Guarda sólo la última lista: una por mesa (`useState`), no una global.
 */
export function createPanelSteps() {
  let initial: MatState | null = null
  let cores: StepCore[] = []
  let steps: PanelStep[] = []

  return (nextInitial: MatState, actions: readonly MatAction[], labels: readonly string[], nameOf: NameOf, artOf: ArtOf): PanelStep[] => {
    let same = 0

    if (nextInitial === initial) {
      while (same < cores.length && same < actions.length && cores[same]!.action === actions[same]) same += 1
    }

    const previous = steps

    initial = nextInitial
    cores = [...cores.slice(0, same), ...coresOf(same === 0 ? nextInitial : cores[same - 1]!.after, actions.slice(same))]
    steps = cores.map((core, index) => {
      const label = labels[index] ?? ''
      const cards = cardsOf(core, nameOf, artOf)
      const before = index < same ? previous[index] : undefined

      return before && before.label === label && sameCards(before.cards, cards) ? before : stepOf(core, label, cards)
    })

    return steps
  }
}
