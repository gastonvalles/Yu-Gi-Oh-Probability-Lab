import { parseDerivedCardId } from '../../app/calculator-state'
import { isToken } from '../../app/practice-mat'
import { cardIdOfDrawId } from '../probability/practice'

/** La ficha se dibuja con la "Sheep Token" de YGOPRODeck, como en la mesa. */
const TOKEN_ART = 'https://images.ygoprodeck.com/images/cards_small/73915052.jpg'

/**
 * El arte de una carta por el número de YGOPRODeck que lleva su id (`card-14558127-2`); la imagen pasa por el proxy como siempre.
 * Sirve también para lo que el rival mostró: lo único que llega por la red es ese id, no hace falta consultar nada más.
 * `null` si no se sabe cuál es la carta.
 */
export function artOfDrawId(drawId: string | undefined): string | null {
  if (drawId === undefined) return null
  if (isToken(drawId)) return TOKEN_ART

  const passcode = passcodeOfDrawId(drawId)
  return passcode === null ? null : `https://images.ygoprodeck.com/images/cards_small/${passcode}.jpg`
}

/** El número de YGOPRODeck de una carta real (`card-14558127-2` → 14558127); `null` si no es una (una ficha, o un id que no se reconoce). */
export function passcodeOfDrawId(drawId: string): number | null {
  return isToken(drawId) ? null : parseDerivedCardId(cardIdOfDrawId(drawId))
}
