import { t } from '../../i18n'
import type { AutoOverlay, CardRef } from './adapter'
import type { AskCard } from './ask-ui'
import type { AskType } from './protocol'

/**
 * Por qué se pregunta algo: de qué carta es y si es su costo, su activación o su efecto (la línea `AskWhy` de los carteles). **Sólo lo que el dato sabe** (comprobado con el núcleo
 * real en `auto-ask-why.slow.test.ts`):
 * - El núcleo manda `chaining` antes del costo y de los objetivos, y `chained` después (`overlay.activating`): lo que se pregunta en el medio es de esa activación.
 * - Con un eslabón resolviéndose (`solving`), lo que se pregunta es su efecto.
 * - Costo y objetivos van juntos en la activación y el núcleo no dice cuál es cuál: es **costo** sólo si alguna carta que se elige no puede ser objetivo (en la mano, en el Deck, en el
 *   Extra Deck o un material); si no, «al activar» (un objetivo, una opción, el costo con cartas del campo o del Cementerio).
 * - Fuera de una cadena (una Invocación por Sacrificio o con materiales, la casilla de una carta que todavía no entró a la cadena), nada: la jugada la acabás de elegir vos.
 */

export type AskRole = 'cost' | 'activation' | 'effect'

export interface AskWhy {
  role: AskRole
  code: number
  ref: CardRef | null
  /** El eslabón (1 = CL1). */
  link: number
}

/** Las preguntas que ya dicen su carta (`select_effectyn`), las de la cadena (`RespondBand`), las de tu turno y los juegos: sin línea. */
const OWN = new Set<AskType>(['select_idlecmd', 'select_battlecmd', 'select_chain', 'select_effectyn', 'sort_chain', 'rock_paper_scissors'])

/** Una carta en la mano, el Deck, el Extra Deck o como material no puede ser objetivo: elegirla al activar es pagar el costo. */
const untargetable = (card: AskCard) => card.place === 'hand' || card.place === 'material' || (card.place === 'pile' && (card.pile === 'deck' || card.pile === 'extra'))

export function askWhy(type: AskType, overlay: Pick<AutoOverlay, 'chain' | 'activating'>, cards: readonly AskCard[] = []): AskWhy | null {
  if (OWN.has(type)) return null
  const { chain } = overlay
  const solving = chain.findLastIndex((link) => link.state === 'solving')
  const index = solving >= 0 ? solving : overlay.activating ? chain.length - 1 : -1
  const link = chain[index]

  if (!link) return null
  const role: AskRole = solving >= 0 ? 'effect' : cards.some(untargetable) ? 'cost' : 'activation'

  return { role, code: link.code, ref: link.card, link: index + 1 }
}

/** La línea: «Costo de Ash Blossom & Joyous Spring» (la pantalla la corta con «…» si no entra; el nombre entero queda para el lector de pantalla). */
export const askWhyText = (role: AskRole, name: string) => t(`auto.why.${role}`, { name })
