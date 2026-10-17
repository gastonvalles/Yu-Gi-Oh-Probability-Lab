/**
 * Las señales rápidas: "pensando" (🤔), "continuá" (👍) y "esperá" (✋). Viajan como mensajes de chat, sólo con su emoji (sin texto): el rival las reconoce por el emoji,
 * en cualquier idioma (un cliente viejo ve el emoji en el chat), y salen un instante como un globo junto a las vidas de quien las manda (ver `useSignals`).
 *
 * ✋ no es una reacción más: es un pedido de atención. Dura hasta que quien lo pidió lo suelta (con 👍 o tocando ✋ otra vez) o pasa el tope de seguridad, y el rival lo ve como
 * un cartel arriba (ver `useHolds`). Nunca bloquea nada: es un aviso entre dos personas, no una regla.
 * El 💭 con su texto es el de las versiones anteriores: se sigue reconociendo.
 */
const THINKING = '🤔'
const LEGACY_THINKING = '💭'
const GOOD = '👍'
const HOLD = '✋'

export const thinkingMessage = () => THINKING
export const GOOD_MESSAGE = GOOD
export const HOLD_MESSAGE = HOLD
/** Pedir esperar, y soltarlo: 👍 ("continuá"). */
export const isHold = (text: string) => text === HOLD
export const isRelease = (text: string) => text === GOOD
/** Las dos señales de un emoji solo (sin el 💭 con texto de antes): se dibujan grandes, como una reacción. */
export const isEmojiSignal = (text: string) => text === GOOD || text === THINKING || text === HOLD
export const isSignal = (text: string) => text === GOOD || text === THINKING || text === HOLD || text.startsWith(LEGACY_THINKING)
