import type { MatMenuItem, MatPile } from './practice-mat'

/**
 * Los bloques del menú pegado a la carta (escritorio), de arriba abajo: **apoyo** (Revelar, Target y, en un duelo, Señalar), **envíos** (la carta a una pila —Al deck, A la mano, Al cementerio
 * o Descartar, Desterrar— o al rival: dar o devolver el control) y **jugadas** (lo demás: invocar, colocar, activar, cambiar de posición, atacar, adjuntar, desacoplar).
 */
export type MenuBlock = 'support' | 'send' | 'play'

/** El bloque de una opción y, entre los envíos, el lugar de su destino (`rank`; en los otros bloques no cuenta). */
export interface MenuPlace {
  block: MenuBlock
  rank: number
}

/** Los envíos van por destino: el deck (al azar, arriba o abajo), la mano, el cementerio o el Extra Deck, el destierro y, al final, el rival (`give`). */
const SEND_RANK: Record<MatPile | 'deck-bottom', number> = { deck: 0, 'deck-bottom': 0, hand: 1, gy: 2, extra: 2, banished: 3 }
const GIVE_RANK = 4

/** Lo que no es del motor y va con el apoyo (Señalar, en un duelo). */
export const SUPPORT_PLACE: MenuPlace = { block: 'support', rank: 0 }
/** Una jugada; en automático, todas las opciones del núcleo (el apoyo y los envíos son jugadas manuales que el núcleo no acepta). */
export const PLAY_PLACE: MenuPlace = { block: 'play', rank: 0 }

/**
 * Dónde va una opción del motor. Una pregunta se clasifica por su primera respuesta y un lote, por su primera parte. `own` son las cartas del menú: mover una de ellas es un envío;
 * mover otra (un material, «Desacoplar») es una jugada.
 */
export function menuPlaceOf(item: MatMenuItem, own: readonly string[]): MenuPlace {
  const first = (item.choices?.[0] ?? item).action
  const action = first.type === 'batch' ? first.actions[0] : first

  if (action?.type === 'reveal' || action?.type === 'target') return SUPPORT_PLACE
  if (action?.type === 'give') return { block: 'send', rank: GIVE_RANK }
  if (action?.type === 'move' && own.includes(action.id)) return { block: 'send', rank: SEND_RANK[action.to] }

  return PLAY_PLACE
}

/**
 * Una pregunta de «cómo» (la posición, boca arriba o boca abajo, dónde del deck): respuestas sin línea chica (`lead`, `hint`), sin carta, sin frase del texto, ninguna apagada y ninguna «a quién
 * atacar». En escritorio sale en un submenú al costado; las demás preguntas (a quién atacar, qué efecto, qué material, a qué Xyz) siguen en el segundo paso del mismo menú. Apagada, no abre nada.
 */
export function asksHow(item: MatMenuItem): boolean {
  return (
    item.disabled === undefined &&
    item.choices !== undefined &&
    item.choices.length > 0 &&
    item.choices.every((choice) => !choice.lead && !choice.hint && !choice.preview && !choice.cardId && choice.disabled === undefined && choice.action.type !== 'attack')
  )
}

/**
 * El menú pegado a la carta en bloques: apoyo → envíos → jugadas, con una línea fina (`divider`) arriba de la primera opción de cada bloque que sigue a otro. El apoyo queda en su orden; los envíos, por
 * destino (los del mismo destino, en su orden); las jugadas, al revés del motor: la más probable queda abajo, pegada a la carta. Es presentación: el motor y la hoja del celular no cambian de orden.
 */
export function inMenuBlocks<T extends { divider?: boolean }>(rows: readonly { entry: T; place: MenuPlace }[]): T[] {
  const of = (block: MenuBlock) => rows.filter((row) => row.place.block === block)
  const blocks = [of('support'), of('send').sort((a, b) => a.place.rank - b.place.rank), of('play').reverse()].filter((block) => block.length > 0)

  return blocks.flatMap((block, index) => block.map(({ entry }, at) => (index > 0 && at === 0 ? { ...entry, divider: true } : entry)))
}
